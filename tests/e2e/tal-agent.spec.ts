import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The API is scripted; everything Tal reads comes from the running app's own state.
const sse = (events: object[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');

test('Tal answers about the selected node from live app state', async ({ page }) => {
  test.setTimeout(90_000);
  const pgn = readFileSync('public/games/tal-smyslov-1959.pgn', 'utf8');
  await page.addInitScript((pgn) => {
    localStorage.setItem('enpassant-last-game', pgn);
    sessionStorage.setItem('enpassant-tal-key', 'sk-ant-test');
  }, pgn);
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const turn = requests.length;
    const events =
      turn === 1
        ? [
            { type: 'message_start', message: { id: 'm1' } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Let me look at the board. ' },
            },
            { type: 'content_block_stop', index: 0 },
            {
              type: 'content_block_start',
              index: 1,
              content_block: { type: 'tool_use', id: 't1', name: 'getPosition', input: {} },
            },
            {
              type: 'content_block_delta',
              index: 1,
              delta: { type: 'input_json_delta', partial_json: '{"nodeId":"p37"}' },
            },
            { type: 'content_block_stop', index: 1 },
            {
              type: 'content_block_start',
              index: 2,
              content_block: { type: 'tool_use', id: 't2', name: 'getAnalysis', input: {} },
            },
            {
              type: 'content_block_delta',
              index: 2,
              delta: { type: 'input_json_delta', partial_json: '{"nodeId":"p37"}' },
            },
            { type: 'content_block_stop', index: 2 },
            { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} },
            { type: 'message_stop' },
          ]
        : [
            { type: 'message_start', message: { id: 'm2' } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'The queen went to f7 and can be taken.' },
            },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
            { type: 'message_stop' },
          ];
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(events) });
  });

  await page.goto('/');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 60_000 });
  await page.getByTestId('evolution-marks').locator('[data-position="p37"]').dispatchEvent('click');
  const panel = page.getByTestId('tal-panel');
  await expect(panel.locator('.eyebrow')).toContainText('19. Qxf7');
  await panel.getByLabel('Ask Tal about this position').fill('Why give the queen?');
  await panel.getByRole('button', { name: 'Ask Tal' }).click();

  await expect(panel.getByTestId('tal-transcript')).toContainText(
    'The queen went to f7 and can be taken.',
  );
  await expect(panel.getByTestId('tal-step')).toHaveCount(2);
  await expect(panel.getByTestId('tal-step').first()).toContainText(
    'Looked at the board at 19. Qxf7',
  );
  await expect(panel.locator('.eyebrow')).toContainText('DEPTH');

  // The model was given the live selection, and its tool results came from the app's own data.
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[0].messages[0].content)).toContain('node p37 (19. Qxf7)');
  const results = requests[1].messages[2].content as { tool_use_id: string; content: string }[];
  const position = JSON.parse(results[0].content);
  expect(position.lastMove).toMatchObject({ piece: 'queen', to: 'f7', captured: 'pawn' });
  expect(position.placement.White).toContainEqual({ piece: 'queen', square: 'f7' });
  const analysis = JSON.parse(results[1].content);
  expect(analysis.decision.engine.depth).toBeGreaterThan(0);
  expect(analysis.decision.engine.candidates[0].san).toBe('Qxf7');
});
