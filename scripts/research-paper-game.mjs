import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
// Run against pnpm dev; pass --study for a bounded depth-20 search at every root.
const profile = process.argv.includes('--study') ? 'study' : 'quick';
const cached = process.argv.includes('--cached');
const prefix = `artifacts/paper-research/${profile}${cached ? '-cached' : ''}`;
await mkdir('artifacts/paper-research', { recursive: true });
const pgn = await readFile('docs/research/deep-blue-kasparov-1997-game-2.pgn', 'utf8');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1100 },
    storageState: cached ? `artifacts/paper-research/${profile}-browser-state.json` : undefined,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((pgn) => localStorage.setItem('enpassant-last-game', pgn), pgn);
  const page = await context.newPage();
  // Editing the app must not restart or change the quality of this measurement.
  await page.routeWebSocket('**', (socket) => socket.close());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const started = Date.now();
  const progress = setInterval(async () => {
    console.log(
      await page
        .locator('.analysis-strip')
        .innerText()
        .catch(() => 'Starting…'),
    );
  }, 15_000);
  progress.unref();
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deep Blue');
  if (profile === 'study')
    await page.getByLabel('Analysis quality', { exact: true }).selectOption('study');
  await expect(page.locator('.analysis-status')).toHaveText(/Game analyzed|Study finished/, {
    timeout: 7_200_000,
  });
  clearInterval(progress);
  const elapsedMs = Date.now() - started;
  await page.getByRole('button', { name: 'Whole game', exact: true }).click();
  await page.getByTestId('evolution-marks').locator('[data-position="p73"]').dispatchEvent('click');
  await page.screenshot({ path: `${prefix}.png`, fullPage: true });
  const result = await page.evaluate(
    async ({ pgn, profile }) => {
      const { parseGame, moveLabel } = await import('/src/lib/games.ts');
      const { readAnalysis, cacheKey, QUICK_MS, STUDY_MS, ENGINE_VERSION } =
        await import('/src/lib/engine.ts');
      const { EvolutionBuilder } = await import('/src/lib/evolution.ts');
      const game = parseGame(pgn),
        builder = new EvolutionBuilder(game),
        analyses = [];
      for (const pos of game.positions) {
        const node = builder.get(pos.id);
        const a = await readAnalysis(
          cacheKey(game.initialFen, node.moves, profile === 'study' ? STUDY_MS : QUICK_MS, {
            depth: 20,
            playedMove: game.positions[pos.ply + 1]?.uci,
          }),
        );
        if (!a) throw new Error(`Missing cache ${pos.id}`);
        analyses.push([pos.id, a]);
        builder.append(pos.id, a, 20);
      }
      const graph = await builder.layout();
      const ds = analyses.map(([, a]) => a.depth).sort((a, b) => a - b);
      const lengths = analyses
        .flatMap(([, a]) => a.lines.map((l) => l.moves.length))
        .sort((a, b) => a - b);
      const ranks = game.positions.slice(0, -1).map((pos, i) => ({
        ply: i,
        played: game.positions[i + 1].san,
        rank:
          analyses[i][1].lines.find((l) => l.moves[0] === game.positions[i + 1].uci)?.rank ?? null,
      }));
      const events = graph.vertices
        .map((v) => graph.byId.get(v.id))
        .filter((n) => n.check || n.mate || n.draw);
      const summary = {
        engine: ENGINE_VERSION,
        profile,
        budgetMs: profile === 'study' ? STUDY_MS : QUICK_MS,
        atTarget: analyses.filter(([, a]) => a.depthReached).length,
        playedFallbacks: analyses
          .filter(([, a]) => a.playedLine)
          .map(([id, a]) => ({ id, depth: a.playedLine.depth, score: a.playedLine.score })),
        plies: game.positions.length - 1,
        positionsAnalyzed: analyses.length,
        depth: {
          min: ds[0],
          median: ds[Math.floor(ds.length / 2)],
          max: ds.at(-1),
          at20: ds.filter((d) => d === 20).length,
        },
        returnedPvLength: {
          min: lengths[0],
          median: lengths[Math.floor(lengths.length / 2)],
          max: lengths.at(-1),
        },
        graph: {
          ...graph.stats,
          visible: graph.vertices.length,
          edges: graph.edges.length,
          compressedEdges: graph.edges.filter((e) => e.paths.some((p) => p.length > 2)).length,
          width: graph.width,
          height: graph.height,
          recurrences: graph.edges.filter((e) => e.kind === 'recurrence').length,
          sharedGlyphs: graph.vertices.filter((v) => v.members.length > 1).length,
        },
        events: {
          supportedChecks: events.filter((n) => n.checkQuality === 'supported').length,
          unassessedChecks: events.filter((n) => n.checkQuality === 'unassessed').length,
          check: events.filter((n) => n.check && !n.mate).length,
          mate: events.filter((n) => n.mate).length,
          draw: events.filter((n) => n.draw).length,
          lateCheck: events.filter((n) => n.originPly >= 74 && n.check && !n.mate).length,
          lateMate: events.filter((n) => n.originPly >= 74 && n.mate).length,
        },
        outsideTop8: ranks.filter((r) => r.rank === null),
        checkpoints: [72, 73, 74, 75, 76, 85, 86, 87, 88, 89].map((ply) => ({
          ply,
          position: moveLabel(game.positions[ply]),
          depth: analyses[ply][1].depth,
          best: analyses[ply][1].lines[0],
          playedRank: ranks[ply]?.rank,
        })),
      };
      return { summary, game, analysis: analyses, graph: { ...graph, byId: undefined } };
    },
    { pgn, profile },
  );
  result.summary.elapsedMs = elapsedMs;
  result.summary.browserErrors = errors;
  result.summary.browser = browser.version();
  await writeFile(`${prefix}-data.json`, JSON.stringify(result));
  await writeFile(`${prefix}-summary.json`, JSON.stringify(result.summary, null, 2));
  await writeFile(
    `${prefix}-browser-state.json`,
    JSON.stringify(await context.storageState({ indexedDB: true })),
  );
  console.log(JSON.stringify(result.summary, null, 2));
} finally {
  await browser.close();
}
