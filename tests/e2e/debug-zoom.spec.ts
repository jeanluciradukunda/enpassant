// SPDX-License-Identifier: GPL-3.0-or-later
// Debug-only: zoom in on the graph and capture a high-resolution clip so we
// can see arrowheads, trunk-edge spine thickness, and crown placement at
// readable scale. Not part of the V0 gate.
import { test } from '@playwright/test';

test('zoom-clip for visual review', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.react-flow__node-trunk');
  await page.waitForTimeout(400);

  // Two clips:
  //  - early trunk + sparse branches (moves 1-6) where adjacent nodes have
  //    breathing room and arrows should be most visible.
  //  - late-game dense fan for visual confirmation of crowns.
  await page.screenshot({
    path: 'test-results/v0-early.png',
    clip: { x: 24, y: 300, width: 500, height: 200 },
  });
  await page.screenshot({
    path: 'test-results/v0-zoom.png',
    clip: { x: 1000, y: 180, width: 600, height: 380 },
  });
});
