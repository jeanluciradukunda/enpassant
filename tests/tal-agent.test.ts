import { describe, expect, it } from 'vitest';
import { EvolutionBuilder } from '../src/lib/evolution';
import { parseGame } from '../src/lib/games';
import { askTal, type TalEvent } from '../src/lib/talAgent';
import type { TalContext } from '../src/lib/talTools';

const sse = (events: object[]) =>
  new Response(
    events
      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join(''),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );

const firstTurn = [
  { type: 'message_start', message: { id: 'm1' } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'look first' },
  },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Let me look. ' } },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: { type: 'tool_use', id: 't1', name: 'getPosition', input: {} },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '{"nodeId":' },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '"p3"}' },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} },
  { type: 'message_stop' },
];
const secondTurn = [
  { type: 'message_start', message: { id: 'm2' } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'A knight on f3.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
  { type: 'message_stop' },
];

describe('askTal plays the stream as an ordered timeline', () => {
  it('emits text, runs the tool when its block closes, sends the result back and finishes in order', async () => {
    const game = parseGame('1. e4 e5 2. Nf3 *');
    const builder = new EvolutionBuilder(game);
    const ctx: TalContext = { game, node: (id) => builder.get(id), analysis: new Map() };
    const bodies: unknown[] = [];
    const responses = [sse(firstTurn), sse(secondTurn)];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return responses.shift()!;
    }) as typeof fetch;
    const events: TalEvent[] = [];
    for await (const event of askTal(ctx, 'What just moved?', { key: 'k', fetchImpl }))
      events.push(event);

    expect(events.map((e) => e.type)).toEqual([
      'thinking',
      'text',
      'tool_call',
      'tool_result',
      'text',
      'done',
    ]);
    expect(events[2]).toMatchObject({ name: 'getPosition', input: { nodeId: 'p3' } });
    expect(events[3]).toMatchObject({ result: { lastMove: { piece: 'knight', to: 'f3' } } });

    const second = bodies[1] as {
      messages: { role: string; content: unknown }[];
      tool_choice?: unknown;
    };
    expect(second.tool_choice).toBeUndefined();
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second.messages[1].content).toEqual([
      { type: 'thinking', thinking: 'look first', signature: 'sig' },
      { type: 'text', text: 'Let me look. ' },
      { type: 'tool_use', id: 't1', name: 'getPosition', input: { nodeId: 'p3' } },
    ]);
    expect((second.messages[2].content as { tool_use_id: string }[])[0].tool_use_id).toBe('t1');
    const done = events.at(-1) as Extract<TalEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('end_turn');
    expect(done.messages).toHaveLength(4);
  });
});
