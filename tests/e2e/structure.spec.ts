import { expect, test } from '@playwright/test';

test('depth-20 study has separate cached coverage and the paper game is importable', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'enpassant-last-game',
      '[SetUp "1"]\n[FEN "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf8# 1-0',
    ),
  );
  await page.goto('/');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 12_000 });
  await page.getByLabel('Analysis quality', { exact: true }).selectOption('study');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 20_000 });
  await expect(page.locator('.analysis-count')).toContainText('2 at target');
  await expect(page.locator('.position-evaluation')).toContainText('Depth 20');
  expect(await page.locator('[data-score-mate]').count()).toBeGreaterThan(0);
  await page.getByLabel('Analysis quality', { exact: true }).selectOption('quick');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 5_000 });
  await page.getByLabel('Analysis quality', { exact: true }).selectOption('study');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: /Try the paper’s game/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deep Blue');
  await expect(page.getByLabel('Replay position', { exact: true })).toHaveAttribute('max', '89');
  await page.getByRole('button', { name: 'Pause analysis' }).click();
});

test('repetition back links preserve the timeline and gray draw event even in check', async ({
  page,
}) => {
  test.setTimeout(30_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'enpassant-last-game',
      '[SetUp "1"]\n[FEN "4r2k/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Kf1 Rf8+ 2. Ke1 Re8+ 3. Kf1 Rf8+ 4. Ke1 Re8+ 1/2-1/2',
    ),
  );
  await page.goto('/');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 20_000 });
  const graph = page.getByTestId('evolution-marks');
  await expect(graph.locator('[data-played="true"]')).toHaveCount(9);
  expect(await graph.locator('[data-recurrence="true"]').count()).toBeGreaterThan(0);
  await expect(graph.locator('[data-position="p8"]')).toHaveAttribute('data-event', 'draw');
  await expect(graph.locator('[data-position="p8"] circle[fill="#7f7f7f"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Growing replay', exact: true }).click();
  await expect(graph.locator('[data-recurrence="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Last move', exact: true }).click();
  await expect(page.locator('.position-evaluation')).toContainText('Draw');
  expect(await graph.locator('[data-recurrence="true"]').count()).toBeGreaterThan(0);
});
