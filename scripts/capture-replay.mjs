import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 950 },
  recordVideo: { dir: 'artifacts/raw', size: { width: 1600, height: 950 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173/');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 60_000 });
  await page.getByTestId('evolution-marks').locator('[data-position="p37"]').click();
  await page.screenshot({ path: 'artifacts/enpassant-game.png', fullPage: true });
  await page.getByRole('button', { name: 'Growing replay', exact: true }).click();
  await page.getByLabel('Replay speed').selectOption('4');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(page.getByLabel('Replay position', { exact: true })).toHaveValue('41', {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/enpassant-replay-final.png', fullPage: true });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Find games' }).click();
  await expect(page.locator('.game-result').first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'artifacts/enpassant-import.png' });
  await writeFile(
    'artifacts/verification.json',
    JSON.stringify(
      {
        runtime: 'production preview',
        engine: 'Stockfish 18.0.8 lite single-thread WASM',
        game: 'indigojeans–GM-Shadi, 2026-08-10',
        playedPositions: 42,
        generatedNodes: await page
          .getByTestId('evolution-marks')
          .locator('[data-position]')
          .count(),
        publicGamesFound: await page.locator('.game-result').count(),
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  const path = await page.video().path();
  await context.close();
  await browser.close();
  console.log(`Recording: ${path}`);
}
