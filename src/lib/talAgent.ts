import { TAL_SYSTEM } from './talPrompt';
import { runTool, TAL_TOOLS, type TalContext } from './talTools';

// Browser-safe: raw fetch to the Messages API, parameters per artifacts/TAL-BRIEF.md §4.
export const TAL_MODEL = 'claude-fable-5-1';
const API_URL = 'https://api.anthropic.com/v1/messages';
// effort does not bound thinking; one low-effort call spent 4096 tokens on it.
const MAX_TOKENS = 8192;

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/** One step of the walkthrough. Consumers play these strictly in order. */
export type TalEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: unknown; isError: boolean }
  | { type: 'turn'; stopReason: string }
  | { type: 'done'; stopReason: string; messages: Message[] };

export interface AskOptions {
  key: string;
  history?: Message[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

type SseEvent = Record<string, unknown>;

/** Drains a stream in the background so a slow consumer never holds the connection open. */
function queued<T>(source: AsyncIterable<T>): AsyncIterable<T> {
  const buffer: T[] = [];
  const state: { finished: boolean; failure: unknown; wake: (() => void) | null } = {
    finished: false,
    failure: undefined,
    wake: null,
  };
  void (async () => {
    try {
      for await (const item of source) {
        buffer.push(item);
        state.wake?.();
      }
    } catch (error) {
      state.failure = error;
    } finally {
      state.finished = true;
      state.wake?.();
    }
  })();
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (buffer.length) {
          yield buffer.shift()!;
          continue;
        }
        if (state.failure) throw state.failure;
        if (state.finished) return;
        await new Promise<void>((resolve) => (state.wake = resolve));
        state.wake = null;
      }
    },
  };
}

export async function* askTal(
  ctx: TalContext,
  question: string,
  options: AskOptions,
): AsyncGenerator<TalEvent> {
  const doFetch = options.fetchImpl ?? fetch;
  const messages: Message[] = [...(options.history ?? []), { role: 'user', content: question }];
  let stopReason = 'end_turn';
  try {
    for (;;) {
      const res = await doFetch(API_URL, {
        method: 'POST',
        signal: options.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: TAL_MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          system: TAL_SYSTEM,
          tools: TAL_TOOLS,
          output_config: { effort: 'low' },
          thinking: { type: 'adaptive', display: 'summarized' },
          messages,
        }),
      });
      if (!res.ok || !res.body)
        throw new Error(`Claude returned ${res.status}: ${await res.text()}`);

      const blocks: ContentBlock[] = [];
      const closed = new Set<number>();
      const partialJson = new Map<number, string>();
      const results: ContentBlock[] = [];
      for await (const event of queued(sseEvents(res.body))) {
        switch (event.type) {
          case 'content_block_start': {
            const block = event.content_block as ContentBlock;
            blocks[event.index as number] =
              block.type === 'tool_use' ? { ...block, input: {} } : block;
            if (block.type === 'tool_use') partialJson.set(event.index as number, '');
            break;
          }
          case 'content_block_delta': {
            const index = event.index as number;
            const block = blocks[index];
            const delta = event.delta as Record<string, string>;
            if (delta.type === 'text_delta' && block?.type === 'text') {
              block.text += delta.text;
              yield { type: 'text', text: delta.text };
            } else if (delta.type === 'thinking_delta' && block?.type === 'thinking') {
              block.thinking += delta.thinking;
              yield { type: 'thinking', text: delta.thinking };
            } else if (delta.type === 'signature_delta' && block?.type === 'thinking') {
              block.signature = (block.signature ?? '') + delta.signature;
            } else if (delta.type === 'input_json_delta') {
              partialJson.set(index, (partialJson.get(index) ?? '') + delta.partial_json);
            }
            break;
          }
          case 'content_block_stop': {
            const index = event.index as number;
            closed.add(index);
            const block = blocks[index];
            if (block?.type !== 'tool_use') break;
            let outcome;
            try {
              block.input = JSON.parse(partialJson.get(index) || '{}');
              yield { type: 'tool_call', id: block.id, name: block.name, input: block.input };
              outcome = runTool(ctx, block.name, block.input);
            } catch {
              outcome = { result: { error: 'The tool input was not valid JSON' }, isError: true };
            }
            yield { type: 'tool_result', id: block.id, name: block.name, ...outcome };
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(outcome.result),
              ...(outcome.isError ? { is_error: true } : {}),
            });
            break;
          }
          case 'message_delta':
            stopReason = (event.delta as { stop_reason?: string }).stop_reason ?? stopReason;
            break;
          case 'error':
            throw new Error(JSON.stringify(event.error));
        }
      }
      // A truncated turn may leave a tool_use block that never closed. It has no
      // result and can never get one, so it must not enter the transcript.
      const assistant = blocks.filter((block, index) => block && closed.has(index));
      if (assistant.length) messages.push({ role: 'assistant', content: assistant });
      if (results.length) messages.push({ role: 'user', content: results });
      yield { type: 'turn', stopReason };
      if (stopReason === 'refusal') break;
      if (results.length && (stopReason === 'tool_use' || stopReason === 'max_tokens')) continue;
      break;
    }
    yield { type: 'done', stopReason, messages };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      yield { type: 'done', stopReason: 'aborted', messages };
      return;
    }
    throw error;
  }
}

/** Parses a text/event-stream body into its JSON `data:` payloads, in order. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trimEnd();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6));
    }
  }
  if (buffer.startsWith('data: ')) yield JSON.parse(buffer.slice(6));
}
