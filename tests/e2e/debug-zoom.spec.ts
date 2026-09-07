// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from '@playwright/test';

test('zoom and pan preserve graph/chart alignment; keyboard moves the lens', async ({ page }) => {
  await page.goto('/paper');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const plot = page.getByTestId('plot-viewport');
  const beforePan = await plot.getAttribute('viewBox');
  const bounds = await page.getByTestId('paper-figure').boundingBox();
  const circle = page.getByTestId('paper-graph').locator('[data-ply="26"] > circle').first();
  const beforeDrag = await circle.boundingBox();
  await page.mouse.move(bounds!.x + 20, bounds!.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 90, bounds!.y + 45);
  await page.mouse.up();
  await expect(plot).not.toHaveAttribute('viewBox', beforePan!);
  const afterDrag = await circle.boundingBox();
  expect(afterDrag!.x - beforeDrag!.x).toBeCloseTo(70, 0);
  expect(afterDrag!.y - beforeDrag!.y).toBeCloseTo(25, 0);
  const column = page.getByTestId('score-chart').locator('[data-chart-ply="26"]');
  const cb = await circle.boundingBox(),
    xb = await column.boundingBox();
  expect(Math.abs(cb!.x + cb!.width / 2 - xb!.x - xb!.width / 2)).toBeLessThan(0.1);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.getByTestId('paper-graph').locator('[aria-pressed="true"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.selection-label')).toHaveText('Move 27 · White');
  await page.keyboard.press('Escape');
  await expect(page.locator('.selection-label')).toHaveText('Move 27 · Black');
  await page.screenshot({ path: 'test-results/astra-final.png' });
});
