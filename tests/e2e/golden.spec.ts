// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from '@playwright/test';

/** Independent source gate: the reference is rasterized from the author's PDF.
 * Updating an app screenshot cannot change what this test considers correct.
 */
test('Figure 5 matches the paper in both pixel color and graph ink', async ({ page }) => {
  await page.goto('/paper');
  const figure = page.getByTestId('paper-figure');
  await expect(page.getByTestId('paper-reference')).toHaveCount(0);
  const rendered = await figure.screenshot();
  await page.getByRole('button', { name: 'Original paper' }).click();
  await page.getByTestId('paper-reference').evaluate(async (element) => {
    const loaded = new Image();
    loaded.src = element.getAttribute('href')!;
    await loaded.decode();
  });
  const reference = await figure.screenshot();
  const metrics = await page.evaluate(
    async ({ actual, expected }) => {
      async function pixels(base64: string) {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: context.getImageData(0, 0, image.width, image.height).data,
        };
      }
      const a = await pixels(actual),
        b = await pixels(expected);
      let changed = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c]))) > 32)
          changed++;
      }
      // Restrict ink scoring to the main graph: empty green background cannot pass.
      const right = Math.floor(a.width * 0.775),
        bottom = Math.floor(a.height * 0.69);
      function ink(data: Uint8ClampedArray, x: number, y: number) {
        const i = (y * a.width + x) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3 < 90;
      }
      function nearby(data: Uint8ClampedArray, x: number, y: number) {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < a.width && yy < a.height && ink(data, xx, yy))
              return true;
          }
        return false;
      }
      let drawn = 0,
        wanted = 0,
        matchedDrawn = 0,
        matchedWanted = 0;
      for (let y = 0; y < bottom; y++)
        for (let x = 0; x < right; x++) {
          if (ink(a.data, x, y)) {
            drawn++;
            if (nearby(b.data, x, y)) matchedDrawn++;
          }
          if (ink(b.data, x, y)) {
            wanted++;
            if (nearby(a.data, x, y)) matchedWanted++;
          }
        }
      return {
        colorDifference: changed / (a.width * a.height),
        inkPrecision: matchedDrawn / Math.max(1, drawn),
        inkRecall: matchedWanted / Math.max(1, wanted),
      };
    },
    { actual: rendered.toString('base64'), expected: reference.toString('base64') },
  );
  console.log('Independent paper comparison:', metrics);
  expect(metrics.colorDifference).toBeLessThan(0.12);
  expect(metrics.inkPrecision).toBeGreaterThan(0.85);
  expect(metrics.inkRecall).toBeGreaterThan(0.9);
});
