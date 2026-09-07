import { expect, test } from '@playwright/test';

test('live Chess.com profile and game URL import', async ({ page }) => {
  test.skip(!process.env.LIVE_IMPORTS, 'Set LIVE_IMPORTS=1 for the external service smoke test.');
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Find games' }).click();
  await expect(page.locator('.game-result').first()).toBeVisible({ timeout: 35_000 });
  const count = await page.locator('.game-result').count();
  expect(count).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/enpassant-chesscom-import.png' });
  await page.locator('.game-result').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('indigojeans');
  await page.getByRole('button', { name: 'Import game' }).click();
  await page
    .getByLabel('Username, profile or game link')
    .fill('https://www.chess.com/game/live/172801642226');
  await page.getByRole('button', { name: 'Find games' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 35_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('GM-Shadi');
  console.log(`Live Chess.com import: ${count} games, profile and game URL succeeded.`);
});

test('live Lichess game export imports as PGN', async ({ page }) => {
  test.skip(!process.env.LIVE_IMPORTS, 'Set LIVE_IMPORTS=1 for the external service smoke test.');
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByLabel('Username, profile or game link').fill('https://lichess.org/q7ZvsdUF');
  await page.getByRole('button', { name: 'Find games' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 35_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lance5500');
  await expect(page.getByTestId('evolution-marks').locator('[data-played="true"]')).toHaveCount(
    126,
  );
  await page.getByRole('button', { name: 'Pause analysis' }).click();
  await expect(page.locator('.analysis-status')).toHaveText('Analysis paused');
});
