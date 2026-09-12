import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';

test('real Stockfish, fixed replay, branch exploration, board and cached reopen', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('indigojeans');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 60_000 });
  const graph = page.getByTestId('evolution-marks');
  expect(await graph.locator('[data-played="false"]').count()).toBeGreaterThan(150);
  await expect(graph.locator('[data-played="true"]')).toHaveCount(42);
  const bounds = (await page.getByTestId('evolution-graph').getAttribute('viewBox'))!
    .split(' ')
    .map(Number);
  expect(bounds[2] / bounds[3]).toBeGreaterThan(3);
  await expect(page.locator('[data-score-side]')).toHaveCount(2);
  expect(await graph.locator('[data-compressed="true"]').count()).toBeGreaterThan(20);
  await expect(page.getByTestId('live-detail')).toBeVisible();
  const checkHighlights = page.getByLabel('Check highlights', { exact: true });
  const unassessedWhite = graph.locator('[data-event="unassessed"][data-fill="#fff"]');
  expect(await unassessedWhite.count()).toBeGreaterThan(0);
  await checkHighlights.selectOption('assessed');
  await expect(unassessedWhite).toHaveCount(0);
  await checkHighlights.selectOption('retained');
  expect(await unassessedWhite.count()).toBeGreaterThan(0);
  await page.getByText('How to read this diagram', { exact: true }).click();
  await expect(page.getByText('Trace the arrows.', { exact: true })).toBeVisible();
  await page.getByText('How to read this diagram', { exact: true }).click();
  await page.screenshot({ path: 'test-results/enpassant-game-desktop.png', fullPage: true });
  const locations = await graph
    .locator('[data-position]')
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [
          node.getAttribute('data-position'),
          [node.getAttribute('data-x'), node.getAttribute('data-y')],
        ]),
      ),
    );
  const shared = graph.locator('[data-members]:not([data-members="1"])').first();
  await shared.dispatchEvent('click');
  const routes = page.getByLabel('Route to this position', { exact: true });
  const routeOptions = await routes
    .locator('option')
    .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  expect(routeOptions.length).toBeGreaterThan(1);
  const originalPosition = (await page.getByTestId('chess-board').getAttribute('data-fen'))!
    .split(' ')
    .slice(0, 4)
    .join(' ');
  await routes.selectOption(routeOptions[1]);
  expect(
    (await page.getByTestId('chess-board').getAttribute('data-fen'))!
      .split(' ')
      .slice(0, 4)
      .join(' '),
  ).toBe(originalPosition);
  await expect(routes).toHaveValue(routeOptions[1]);
  const compressed = graph.locator('.compressed-target').first();
  await compressed.dispatchEvent('click');
  const sequence = page.getByRole('region', { name: 'Unfolded quiet sequence' });
  await expect(sequence).toBeVisible();
  expect(await graph.locator('[data-edge^="unfold:"]').count()).toBeGreaterThan(1);
  expect(await sequence.locator('.sequence-moves button').count()).toBeGreaterThan(2);
  const beforeSequenceMove = await page.getByTestId('chess-board').getAttribute('data-fen');
  await sequence.locator('.sequence-moves button').last().click();
  expect(await page.getByTestId('chess-board').getAttribute('data-fen')).not.toBe(
    beforeSequenceMove,
  );
  await page.getByRole('button', { name: 'Close quiet sequence' }).click();
  await expect(graph.locator('[data-edge^="unfold:"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Growing replay', exact: true }).click();
  await expect(graph.locator('[data-position]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(graph.locator('[data-played="true"]')).toHaveCount(2);
  expect(await graph.locator('[data-played="false"]').count()).toBeGreaterThan(0);
  const chess = new Chess();
  chess.move('d4');
  await expect(page.getByTestId('chess-board')).toHaveAttribute('data-fen', chess.fen());
  await expect(page.getByTestId('live-score-chart').locator('[data-score-ply]')).toHaveCount(2);
  const branch = graph.locator('[data-played="false"]').first();
  await branch.click();
  await expect(page.locator('.position-heading')).toContainText('THE ROAD NOT TAKEN');
  expect(await page.getByTestId('chess-board').getAttribute('data-fen')).not.toBe(chess.fen());
  await page.getByRole('button', { name: 'Explore this position' }).click();
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 15_000 });
  await expect(page.locator('.position-evaluation')).toContainText('Depth');
  await page.getByRole('button', { name: 'Isolate continuations' }).click();
  expect(await graph.locator('[data-position][opacity="0.1"]').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Back to the played game' }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const revealed = await graph
    .locator('[data-position]')
    .evaluateAll((nodes) =>
      nodes.map((node) => [
        node.getAttribute('data-position')!,
        node.getAttribute('data-x'),
        node.getAttribute('data-y'),
      ]),
    );
  for (const [id, x, y] of revealed) if (locations[id!]) expect([x, y]).toEqual(locations[id!]);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(graph.locator('[data-played="true"]')).toHaveCount(2);
  await page.getByLabel('Replay speed').selectOption('4');
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect.poll(() => graph.locator('[data-played="true"]').count()).toBeGreaterThan(4);
  await page.getByRole('button', { name: 'Pause replay', exact: true }).click();
  await page.getByRole('button', { name: 'Last move', exact: true }).click();
  await expect(graph.locator('[data-played="true"]')).toHaveCount(42);
  await page.locator('.candidate-lines button').first().click();
  await expect(page.getByLabel('Replay position', { exact: true })).toHaveValue('41');
  await expect(page.locator('.position-heading')).toContainText('THE ROAD NOT TAKEN');
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Diagram zoom')).toHaveText('140%');
  const node = await graph.locator('[data-position="p30"] .node-hit').boundingBox();
  const column = await page
    .getByTestId('live-score-chart')
    .locator('[data-score-ply="30"] rect')
    .boundingBox();
  expect(Math.abs(node!.x + node!.width / 2 - column!.x - column!.width / 2)).toBeLessThan(0.1);
  const points = await graph
    .locator('[data-position]')
    .evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-x')},${node.getAttribute('data-y')}`),
    );
  expect(new Set(points).size).toBe(points.length);
  await page.reload();
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 8000 });
  expect(errors).toEqual([]);
});

test('engine download failure is recoverable and replay remains available', async ({ page }) => {
  test.setTimeout(45_000);
  await page.route('**/engine/*.wasm', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Stockfish could not start', {
    timeout: 35_000,
  });
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByTestId('evolution-marks').locator('[data-played="true"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Resume analysis' })).toBeEnabled();
});

test('PGN import, file import, invalid input, custom FEN and mobile layout', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Paste or upload PGN' }).click();
  await page.getByLabel('Game in PGN format').fill('1. e4 e5 2. ThisIsNotAMove');
  await page.getByRole('button', { name: 'Visualize game' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not read');
  await page
    .getByLabel('Game in PGN format')
    .fill('[White "White tester"]\n[Black "Black tester"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole('button', { name: 'Visualize game' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Last move', exact: true }).click();
  await expect(page.locator('.position-evaluation')).toContainText('Checkmate');
  await expect(page.getByRole('button', { name: 'Explore this position' })).toBeDisabled();
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Paste or upload PGN' }).click();
  await page.getByLabel('Upload PGN').setInputFiles({
    name: 'promotion.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from(
      '[Event "Promotion"]\n[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *',
    ),
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.getByTestId('chess-board')).toHaveAttribute('data-fen', /^Q6k\//);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/enpassant-game-mobile.png', fullPage: true });
});
