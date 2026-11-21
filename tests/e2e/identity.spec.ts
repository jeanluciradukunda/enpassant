import { expect, test } from '@playwright/test';

// Two different games whose 32-bit ids collide ("1fpqxd").
const first = '[Event "17y76sq19dqth7"]\n\n1. e4 *';
const second = '[Event "mro3xc27w8p5"]\n\n1. d4 *';

test('importing a second game with the same short id shows the second game', async ({ page }) => {
  await page.goto('/');
  for (const [pgn, move] of [
    [first, 'e4'],
    [second, 'd4'],
  ]) {
    await page.getByRole('button', { name: 'Import game' }).click();
    await page.getByRole('button', { name: 'Paste or upload PGN' }).click();
    await page.getByLabel('Game in PGN format').fill(pgn);
    await page.getByRole('button', { name: 'Visualize game' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-move-ply="1"]')).toContainText(move);
    await expect(
      page.getByTestId('evolution-marks').locator('[data-position="p1"] title'),
    ).toContainText(move);
  }
});

// A different game that shares the bundled Botvinnik-Tal game's short id ("d7en76").
const lookalike = '[Event "vnNawQ"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *';

test('Tal narrates the bundled game, not another game with the same short id', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: /Explore Mikhail Tal/ }).click();
  await page.locator('.tal-game').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-move-ply="8"]').click();
  await expect(page.getByTestId('tal-panel')).toContainText('TAL /');

  await page.getByRole('button', { name: 'Import game' }).click();
  await page.getByRole('button', { name: 'Paste or upload PGN' }).click();
  await page.getByLabel('Game in PGN format').fill(lookalike);
  await page.getByRole('button', { name: 'Visualize game' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-move-ply="8"]').click();
  await expect(page.locator('[data-move-ply="8"]')).toContainText('Nf6');
  await expect(page.getByTestId('tal-panel')).toHaveCount(0);
});
