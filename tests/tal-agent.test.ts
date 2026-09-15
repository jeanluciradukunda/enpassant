import { describe, expect, it } from 'vitest';
import { EvolutionBuilder } from '../src/lib/evolution';
import { parseGame } from '../src/lib/games';
import { askTal, type Message, type TalEvent } from '../src/lib/talAgent';
import type { TalContext } from '../src/lib/talTools';

const sse = (events: object[]) =>
  new Response(
    events
      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
const text = (index: number, value: string) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index, delta: { type: 'text_delta', text: value } },
  { type: 'content_block_stop', index },
];
const toolUse = (index: number, id: string, name: string, json: string, close = true) => [
  { type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } },
  ...(close ? [{ type: 'content_block_stop', index }] : []),
];
const end = (stop_reason: string) => [
  { type: 'message_delta', delta: { stop_reason }, usage: {} },
  { type: 'message_stop' },
];
const start = [{ type: 'message_start', message: { id: 'm' } }];

function harness(responses: Response[]) {
  const game = parseGame('1. e4 e5 2. Nf3 *');
  const builder = new EvolutionBuilder(game);
  const ctx: TalContext = { game, node: (id) => builder.get(id), analysis: new Map() };
  const bodies: { messages: Message[]; tool_choice?: unknown; max_tokens: number }[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error('no more scripted responses');
    return next;
  }) as typeof fetch;
  return { ctx, bodies, fetchImpl };
}
async function collect(iterator: AsyncGenerator<TalEvent>) {
  const events: TalEvent[] = [];
  for await (const event of iterator) events.push(event);
  return events;
}

describe('askTal', () => {
  it('plays text, runs each tool as its block closes, and answers with the results', async () => {
    const turn1 = [
      ...start,
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'look' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig' },
      },
      { type: 'content_block_stop', index: 0 },
      ...text(1, 'Let me look. '),
      ...toolUse(2, 't1', 'getPosition', '{"nodeId":"p3"}'),
      ...end('tool_use'),
    ];
    const turn2 = [...start, ...text(0, 'A knight on f3.'), ...end('end_turn')];
    const { ctx, bodies, fetchImpl } = harness([sse(turn1), sse(turn2)]);
    const events = await collect(askTal(ctx, 'What just moved?', { key: 'k', fetchImpl }));

    expect(events.map((e) => e.type)).toEqual([
      'thinking',
      'text',
      'tool_call',
      'tool_result',
      'turn',
      'text',
      'turn',
      'done',
    ]);
    expect(events[2]).toMatchObject({ name: 'getPosition', input: { nodeId: 'p3' } });
    expect(events[3]).toMatchObject({
      isError: false,
      result: { lastMove: { piece: 'knight', to: 'f3' } },
    });
    expect(bodies[0].tool_choice).toBeUndefined();
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(8192);
    expect(bodies[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(bodies[1].messages[1].content).toEqual([
      { type: 'thinking', thinking: 'look', signature: 'sig' },
      { type: 'text', text: 'Let me look. ' },
      { type: 'tool_use', id: 't1', name: 'getPosition', input: { nodeId: 'p3' } },
    ]);
    const results = bodies[1].messages[2].content as { tool_use_id: string; is_error?: boolean }[];
    expect(results).toEqual([expect.objectContaining({ tool_use_id: 't1' })]);
    expect(results[0].is_error).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end_turn' });
  });

  it('drops a tool block that never closed after max_tokens and still answers the complete ones', async () => {
    const turn1 = [
      ...start,
      ...toolUse(0, 'a', 'getGame', '{}'),
      ...toolUse(1, 'b', 'getPosition', '{"nodeId":', false),
      ...end('max_tokens'),
    ];
    const turn2 = [...start, ...text(0, 'Fine.'), ...end('end_turn')];
    const { bodies, fetchImpl, ctx } = harness([sse(turn1), sse(turn2)]);
    const events = await collect(askTal(ctx, 'q', { key: 'k', fetchImpl }));
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(1);
    const assistant = bodies[1].messages[1].content as { id?: string }[];
    expect(assistant.map((b) => b.id)).toEqual(['a']);
    const results = bodies[1].messages[2].content as { tool_use_id: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(['a']);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'end_turn' });
  });

  it('marks tool failures and malformed input as errors the model can see', async () => {
    const turn1 = [
      ...start,
      ...toolUse(0, 'a', 'getPosition', '{"nodeId":"p999"}'),
      ...toolUse(1, 'b', 'getPath', '{not json'),
      ...end('tool_use'),
    ];
    const turn2 = [...start, ...text(0, 'I cannot see that.'), ...end('end_turn')];
    const { bodies, fetchImpl, ctx } = harness([sse(turn1), sse(turn2)]);
    const events = await collect(askTal(ctx, 'q', { key: 'k', fetchImpl }));
    const results = bodies[1].messages[2].content as { tool_use_id: string; is_error?: boolean }[];
    expect(results.map((r) => [r.tool_use_id, r.is_error])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(
      events.filter((e) => e.type === 'tool_result').every((e) => 'isError' in e && e.isError),
    ).toBe(true);
  });

  it('stops on refusal and reports it', async () => {
    const turn1 = [...start, ...end('refusal')];
    const { fetchImpl, ctx } = harness([sse(turn1)]);
    const events = await collect(askTal(ctx, 'q', { key: 'k', fetchImpl }));
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'refusal' });
  });

  it('finishes with max_tokens when the turn was cut off without any tool call', async () => {
    const turn1 = [...start, ...text(0, 'Half a thou'), ...end('max_tokens')];
    const { fetchImpl, ctx } = harness([sse(turn1)]);
    const events = await collect(askTal(ctx, 'q', { key: 'k', fetchImpl }));
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_tokens' });
  });

  it('keeps the transcript when aborted', async () => {
    const controller = new AbortController();
    const { ctx } = harness([]);
    const fetchImpl = (async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    const events = await collect(
      askTal(ctx, 'q', { key: 'k', fetchImpl, signal: controller.signal }),
    );
    const done = events.at(-1) as Extract<TalEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('aborted');
    expect(done.messages).toEqual([{ role: 'user', content: 'q' }]);
  });
});
