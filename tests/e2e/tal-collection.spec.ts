import { expect, test } from '@playwright/test';

test('Tal collection opens all three local scores and keeps the paper example available', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  for (const [title, player, plies] of [
    ['Botvinnik / Tal', 'Mikhail Botvinnik', 93],
    ['Tal / Larsen', 'Bent Larsen', 73],
    ['Tal / Smyslov', 'Vasily Smyslov', 51],
  ] as const) {
    await page.getByRole('button', { name: 'Import game' }).click();
    const toggle = page.getByRole('button', { name: 'Explore Mikhail Tal' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const collection = page.getByRole('region', { name: 'Mikhail Tal games' });
    await expect(collection.getByRole('button')).toHaveCount(3);
    await collection.getByRole('button', { name: new RegExp(title) }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(player);
    await expect(page.getByTestId('evolution-marks').locator('[data-played="true"]')).toHaveCount(
      plies + 1,
    );
    await page.getByRole('button', { name: 'Pause analysis', exact: true }).click();
    await expect(page.locator('.analysis-status')).toHaveText('Analysis paused');
  }
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Try the paper’s game' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deep Blue');
  expect(errors).toEqual([]);
});

test('Tal collection fits a narrow screen and works with keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Import game' }).click();
  const toggle = page.getByRole('button', { name: 'Explore Mikhail Tal' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const dialog = page.getByRole('dialog');
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tal-collection-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
