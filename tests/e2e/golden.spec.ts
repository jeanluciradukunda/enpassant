// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from '@playwright/test';

/**
 * V0 gate: render the static Plaskett-Shipov fixture at a fixed viewport and
 * diff against the curated golden screenshot. The first run captures the
 * golden when none exists; subsequent runs compare with
 * `maxDiffPixelRatio: 0.15` (configured in playwright.config.ts).
 *
 * Run `pnpm test:e2e:update` to accept a new baseline after intentional
 * visual changes.
 */
test.describe('V0 golden visual diff', () => {
  test('renders Figure 5 fixture within 15% pixel delta of golden', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="v0-root"]');
    await page.waitForSelector('.react-flow__node-trunk');
    // Give React Flow + dagre layout + Recharts a couple of frames to settle.
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('figure5.png', {
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  });

  test('skeleton checkpoints exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="v0-root"]');
    await page.waitForSelector('.react-flow__node-trunk');

    // 28 trunk circles = root + 27 played moves.
    expect(await page.locator('.react-flow__node-trunk').count()).toBe(28);

    // Alternative branches grow into the late game; expect at least 150 alts.
    const altCount = await page.locator('.react-flow__node-alt').count();
    expect(altCount).toBeGreaterThan(150);

    // Score chart present.
    await expect(page.getByTestId('score-chart')).toBeVisible();

    // Detail zoom callout present.
    await expect(page.getByTestId('detail-zoom')).toBeVisible();

    // Background is darkseagreen.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(143, 188, 143)');
  });
});
