import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
// Run the --study benchmark first. This renders its cache using the current app.
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1100 },
    storageState: 'artifacts/paper-research/study-browser-state.json',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.routeWebSocket('**', (socket) => socket.close());
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('Analysis quality', { exact: true }).selectOption('study');
  await expect(page.locator('.analysis-status')).toHaveText('Game analyzed', { timeout: 30000 });
  await expect(page.locator('.analysis-count')).toContainText('90 at target');
  await page.getByTestId('evolution-marks').locator('[data-position="p73"]').dispatchEvent('click');
  await page
    .locator('.evolution-diagram')
    .screenshot({ path: 'docs/research/images/deepblue-depth20.png' });
  await page.screenshot({ path: 'artifacts/paper-research/final-workbench.png', fullPage: true });
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enpassant — from paper to tool</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#183923;font:13px/1.5 Arial,sans-serif}main{max-width:1500px;margin:auto;padding:38px}header{display:flex;justify-content:space-between;align-items:end;padding-bottom:20px;border-bottom:1px solid #b8c7b4;margin-bottom:22px}small{font-size:10px;letter-spacing:2px;text-transform:uppercase}h1{font:42px Georgia,serif;letter-spacing:-1px;margin:10px 0 0}p{margin:0}figure{margin:0 0 24px}figcaption{display:flex;justify-content:space-between;margin-bottom:8px}img{display:block;width:100%;height:auto}footer{border-top:1px solid #b8c7b4;padding-top:18px;display:flex;justify-content:space-between;gap:30px}strong{font-weight:600}a{color:inherit}@media(max-width:700px){main{padding:20px}header,figcaption,footer{display:block}h1{font-size:30px}figcaption span{display:block}}</style><main><header><div><small>Enpassant / A measured fidelity study</small><h1>From paper to tool<span style="color:#ed001b">.</span></h1></div><p>Deep Blue / Garry Kasparov<br>1997 rematch · Game 2 · 89 plies</p></header><figure><figcaption><strong>01 / The published reference</strong><span>Figure 7 · 1,245 vertices · 11 mate crowns</span></figcaption><img src="/docs/research/images/figure7-source.png" alt="The published Figure 7, with irregular branches on both sides and a late tactical cluster"></figure><figure><figcaption><strong>02 / The original generated graph</strong><span>Depth 12–16 · grouped trunk · 1,198 vertices</span></figcaption><img src="/docs/research/images/deepblue-current.png" alt="The original application result with one-sided branches"></figure><figure><figcaption><strong>03 / The implemented study mode</strong><span>All 90 roots at depth 20 · 1,237 vertices · 3 recurrence links</span></figcaption><img src="/docs/research/images/deepblue-depth20.png" alt="The new study diagram with naturally ordered branches on both sides of the played game"></figure><footer><p><strong>Closer structure. Explicit evidence.</strong><br>Separate played-move searches, preserved histories, local score comparisons.<br>Six mate-scored lines were outside the paper’s retention rule; none were added by hand.</p><p>Reference artwork: Lu, Wang &amp; Lin (2014).<br>Generated output: Stockfish.js 18.0.8 lite.<br><a href="/docs/research/paper-fidelity-implementation.md">Method, measurements and remaining limits ↗</a></p></footer></main></html>`;
  await writeFile('artifacts/paper-research/fidelity-comparison.html', html);
  await page.setViewportSize({ width: 1500, height: 1400 });
  await page.goto('http://127.0.0.1:5173/artifacts/paper-research/fidelity-comparison.html');
  await page.locator('img').evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  await page
    .locator('main')
    .screenshot({ path: 'docs/research/images/deepblue-fidelity-comparison.png' });
  console.log('Saved final comparison.');
} finally {
  await browser.close();
}
