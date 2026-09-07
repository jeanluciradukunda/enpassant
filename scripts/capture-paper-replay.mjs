import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
await mkdir('artifacts/raw', { recursive: true });
const storageState = existsSync('artifacts/paper-style-browser-state.json')
  ? JSON.parse(await readFile('artifacts/paper-style-browser-state.json', 'utf8'))
  : undefined;
if (storageState) for (const origin of storageState.origins) origin.origin = new URL(url).origin;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1050 },
  storageState,
  recordVideo: { dir: 'artifacts/raw', size: { width: 1600, height: 1050 } },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const started = Date.now();
try {
  await page.goto(url);
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 100_000 });
  const graph = page.getByTestId('evolution-marks');
  await graph.locator('[data-position="p37"]').click();
  await page.mouse.click(1100, 180);
  await page.screenshot({ path: 'artifacts/enpassant-game.png', fullPage: true });
  const frozen = await graph
    .locator('[data-position]')
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((n) => [
          n.getAttribute('data-position'),
          [n.getAttribute('data-x'), n.getAttribute('data-y')],
        ]),
      ),
    );
  await page.getByRole('button', { name: 'Growing replay', exact: true }).click();
  await page.getByLabel('Replay speed').selectOption('4');
  const replayStartSeconds = (Date.now() - started) / 1000;
  await page.getByRole('button', { name: 'Play replay', exact: true }).click();
  await expect(page.getByLabel('Replay position', { exact: true })).toHaveValue('41', {
    timeout: 20000,
  });
  const replayed = await graph
    .locator('[data-position]')
    .evaluateAll((nodes) =>
      nodes.map((n) => [
        n.getAttribute('data-position'),
        n.getAttribute('data-x'),
        n.getAttribute('data-y'),
      ]),
    );
  for (const [id, x, y] of replayed) expect([x, y]).toEqual(frozen[id]);
  await page.screenshot({ path: 'artifacts/enpassant-replay-final.png', fullPage: true });
  await page.waitForTimeout(800);
  const replayEndSeconds = (Date.now() - started) / 1000;
  await page.getByRole('button', { name: 'Whole game', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'artifacts/enpassant-game-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  const video = await page.video().path();
  await writeFile(
    'artifacts/paper-layout-verification.json',
    JSON.stringify(
      {
        url,
        video,
        replayStartSeconds,
        replayEndSeconds,
        visiblePositions: replayed.length,
        bounds: await page.getByTestId('evolution-graph').getAttribute('viewBox'),
        notes: await page.locator('.map-note').textContent(),
        frozenReplay: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log({
    video,
    replayStartSeconds,
    replayEndSeconds,
    visiblePositions: replayed.length,
    errors,
  });
} finally {
  await context.close();
  await browser.close();
}
