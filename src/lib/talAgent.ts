import { TAL_SYSTEM } from './talPrompt';
import { runTool, TAL_TOOLS, type TalContext } from './talTools';

// Browser-safe: raw fetch to the Messages API, parameters per artifacts/TAL-BRIEF.md §4.
export const TAL_MODEL = 'claude-fable-5-1';
const API_URL = 'https://api.anthropic.com/v1/messages';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/** One step of the walkthrough. Consumers play these strictly in order. */
export type TalEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'done'; stopReason: string; messages: Message[] };

export interface AskOptions {
  key: string;
  history?: Message[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function* askTal(
  ctx: TalContext,
  question: string,
  options: AskOptions,
): AsyncGenerator<TalEvent> {
  const doFetch = options.fetchImpl ?? fetch;
  const messages: Message[] = [...(options.history ?? []), { role: 'user', content: question }];
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
        max_tokens: 2048,
        stream: true,
        system: TAL_SYSTEM,
        tools: TAL_TOOLS,
        output_config: { effort: 'low' },
        thinking: { type: 'adaptive', display: 'summarized' },
        messages,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Claude returned ${res.status}: ${await res.text()}`);

    const assistant: ContentBlock[] = [];
    const results: ContentBlock[] = [];
    const partialJson = new Map<number, string>();
    let stopReason = 'end_turn';
    for await (const event of sseEvents(res.body)) {
      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block as ContentBlock;
          assistant[event.index as number] =
            block.type === 'tool_use' ? { ...block, input: {} } : block;
          if (block.type === 'tool_use') partialJson.set(event.index as number, '');
          break;
        }
        case 'content_block_delta': {
          const index = event.index as number;
          const block = assistant[index];
          const delta = event.delta as Record<string, string>;
          if (delta.type === 'text_delta' && block.type === 'text') {
            block.text += delta.text;
            yield { type: 'text', text: delta.text };
          } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
            block.thinking += delta.thinking;
            yield { type: 'thinking', text: delta.thinking };
          } else if (delta.type === 'signature_delta' && block.type === 'thinking') {
            block.signature = (block.signature ?? '') + delta.signature;
          } else if (delta.type === 'input_json_delta') {
            partialJson.set(index, (partialJson.get(index) ?? '') + delta.partial_json);
          }
          break;
        }
        case 'content_block_stop': {
          const index = event.index as number;
          const block = assistant[index];
          if (block?.type === 'tool_use') {
            // Tools run the moment their block closes, so the order the model
            // chose is the order the app acts in.
            block.input = JSON.parse(partialJson.get(index) || '{}');
            yield { type: 'tool_call', id: block.id, name: block.name, input: block.input };
            const result = runTool(ctx, block.name, block.input);
            yield { type: 'tool_result', id: block.id, name: block.name, result };
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
          break;
        }
        case 'message_delta':
          stopReason = (event.delta as { stop_reason?: string }).stop_reason ?? stopReason;
          break;
        case 'error':
          throw new Error(JSON.stringify(event.error));
      }
    }
    messages.push({ role: 'assistant', content: assistant.filter(Boolean) });
    if (stopReason === 'tool_use' && results.length) {
      messages.push({ role: 'user', content: results });
      continue;
    }
    yield { type: 'done', stopReason, messages };
    return;
  }
}

/** Parses a text/event-stream body into its JSON `data:` payloads, in order. */
export async function* sseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
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
