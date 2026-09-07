import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  ...(existsSync('artifacts/paper-style-browser-state.json')
    ? { storageState: 'artifacts/paper-style-browser-state.json' }
    : {}),
});
const page = await context.newPage();
page.on('pageerror', (error) => console.error(error));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error(msg.text());
});
await page.goto('http://127.0.0.1:5173/');
await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 100_000 });
await page.getByTestId('evolution-marks').locator('[data-position="p37"]').click();
await page.mouse.click(1100, 180);
await page.screenshot({ path: 'artifacts/paper-style-game.png', fullPage: true });
console.log(await page.locator('.map-note').textContent());
console.log('Bounds', await page.getByTestId('evolution-graph').getAttribute('viewBox'));
const state = await context.storageState({ indexedDB: true });
await writeFile('artifacts/paper-style-browser-state.json', JSON.stringify(state));
await context.close();
await browser.close();
