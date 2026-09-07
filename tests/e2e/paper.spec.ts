// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from '@playwright/test';

test('paper study renders selectable geometry and a linked magnifier', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/paper');
  const graph = page.getByTestId('paper-graph');
  await expect(graph.locator('[data-kind="trunk"]')).toHaveCount(54);
  await expect(graph.locator('[data-kind="alternative"]')).toHaveCount(884);
  await page.screenshot({ path: 'test-results/astra-desktop.png' });
  await page.getByTestId('paper-figure').screenshot({ path: 'test-results/astra-figure.png' });
  const originalRegion = await page.getByTestId('detail-zoom').getAttribute('viewBox');
  await graph.locator('[data-ply="17"]').click();
  await expect(page.locator('.selection-label')).toHaveText('Move 9 · White');
  await expect(page.getByTestId('detail-zoom')).not.toHaveAttribute('viewBox', originalRegion!);
  await page.getByRole('button', { name: 'Isolate continuations' }).click();
  expect(await graph.locator('[data-edge][opacity="0.12"]').count()).toBeGreaterThan(0);
  await page.getByTestId('score-chart').locator('[data-chart-ply="20"]').click();
  await expect(page.locator('.selection-label')).toHaveText('Move 10 · Black');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByLabel('Zoom level')).toHaveText('135%');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.getByLabel('Zoom level')).toHaveText('100%');
  await expect(page.locator('.selection-label')).toHaveText('Move 27 · Black');
  await page.getByRole('button', { name: 'Original paper' }).click();
  await expect(page.getByTestId('paper-reference')).toBeVisible();
  await page.getByTestId('paper-figure').screenshot({ path: 'test-results/paper-reference.png' });
  expect(errors).toEqual([]);
});

test('compact screen keeps controls accessible and chart columns aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/paper');
  await expect(page.getByRole('button', { name: 'Original paper' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/astra-mobile.png' });
  const graph = page.getByTestId('paper-graph');
  const chart = page.getByTestId('score-chart');
  for (const ply of [1, 18, 54]) {
    const circle = await graph.locator(`[data-ply="${ply}"] > circle`).first().boundingBox();
    const column = await chart.locator(`[data-chart-ply="${ply}"]`).boundingBox();
    expect(circle).not.toBeNull();
    expect(column).not.toBeNull();
    expect(Math.abs(circle!.x + circle!.width / 2 - column!.x - column!.width / 2)).toBeLessThan(
      0.1,
    );
  }
});
