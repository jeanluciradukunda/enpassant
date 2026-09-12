import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createServer } from 'vite';

// Run against pnpm dev. Each game gets a fresh browser context and the same
// production Quick preview search. --study uses the production Study profile.
const profile = process.argv.includes('--study') ? 'study' : 'quick';
const output = `artifacts/tal-study/${profile}`;
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  cacheDir: 'artifacts/tal-study/vite-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
let studies;
try {
  const { TAL_GAMES } = await server.ssrLoadModule('/src/lib/studyGames.ts');
  studies = [
    ...TAL_GAMES,
    {
      id: 'indigojeans-gm-shadi',
      title: 'indigojeans / GM-Shadi',
      checkpoint: 31,
      pgn: await readFile('public/games/indigojeans-gm-shadi.pgn', 'utf8'),
    },
  ];
} finally {
  await server.close();
}
const browser = await chromium.launch();
const summaries = [];
try {
  for (const study of studies) {
    const context = await browser.newContext({
      viewport: { width: 1800, height: 1100 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(
      (pgn) => localStorage.setItem('enpassant-last-game', pgn),
      study.pgn,
    );
    const page = await context.newPage();
    await page.routeWebSocket('**', (socket) => socket.close());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let progress;
    const started = Date.now();
    try {
      await page.goto('http://127.0.0.1:5173/');
      if (profile === 'study')
        await page.getByLabel('Analysis quality', { exact: true }).selectOption('study');
      progress = setInterval(async () => {
        console.log(
          study.id,
          await page
            .locator('.analysis-strip')
            .innerText()
            .catch(() => '…'),
        );
      }, 15000);
      progress.unref();
      await expect(page.locator('.analysis-status')).toHaveText(/Game analyzed|Study finished/, {
        timeout: profile === 'study' ? 7_200_000 : 600_000,
      });
      clearInterval(progress);
      const elapsedMs = Date.now() - started;
      await page.getByRole('button', { name: 'Whole game', exact: true }).click();
      await page
        .getByTestId('evolution-marks')
        .locator(`[data-position="p${study.checkpoint}"]`)
        .dispatchEvent('click');
      await page.screenshot({ path: `${output}/${study.id}-app.png`, fullPage: true });
      const data = await page.evaluate(
        async ({ study, profile }) => {
          const { parseGame, moveLabel } = await import('/src/lib/games.ts');
          const { readAnalysis, cacheKey, QUICK_MS, STUDY_MS, ENGINE_VERSION, PV_COUNT } =
            await import('/src/lib/engine.ts');
          const { EvolutionBuilder } = await import('/src/lib/evolution.ts');
          const game = parseGame(study.pgn);
          const builder = new EvolutionBuilder(game);
          const analysis = [];
          const budgetMs = profile === 'study' ? STUDY_MS : QUICK_MS;
          for (const pos of game.positions) {
            const a = await readAnalysis(
              cacheKey(game.initialFen, builder.get(pos.id).moves, budgetMs, {
                depth: 20,
                playedMove: game.positions[pos.ply + 1]?.uci,
              }),
            );
            if (!a) throw new Error(`Missing analysis for ${study.id}/${pos.id}`);
            analysis.push([pos.id, a]);
            builder.append(pos.id, a, 20);
          }
          const graph = await builder.layout();
          const searched = analysis.filter(([, a]) => a.lines.length);
          const depths = searched.map(([, a]) => a.depth).sort((a, b) => a - b);
          const pvLengths = searched
            .flatMap(([, a]) => a.lines.map((line) => line.moves.length))
            .sort((a, b) => a - b);
          const has = (vertex, event) => vertex.members.some((id) => graph.byId.get(id)[event]);
          const checkpoints = [study.checkpoint - 1, study.checkpoint, study.checkpoint + 2]
            .filter((ply) => ply < game.positions.length)
            .map((ply) => ({
              ply,
              move: moveLabel(game.positions[ply]),
              fen: game.positions[ply].fen,
              analysis: analysis[ply][1],
              playedRank:
                analysis[ply][1].lines.find(
                  (line) => line.moves[0] === game.positions[ply + 1]?.uci,
                )?.rank ?? null,
            }));
          return {
            game,
            analysis,
            summary: {
              id: study.id,
              title: study.title,
              engine: ENGINE_VERSION,
              profile,
              budgetMs,
              requestedDepth: 20,
              multiPv: PV_COUNT,
              displayHorizon: 20,
              plies: game.positions.length - 1,
              positionsAnalyzed: analysis.length,
              terminalRoots: analysis.length - searched.length,
              depth: {
                min: depths[0],
                median: depths[Math.floor(depths.length / 2)],
                max: depths.at(-1),
              },
              atTarget: searched.filter(([, a]) => a.depthReached).length,
              playedFallbacks: searched.filter(([, a]) => a.playedLine).length,
              returnedPvLength: {
                min: pvLengths[0],
                median: pvLengths[Math.floor(pvLengths.length / 2)],
                max: pvLengths.at(-1),
              },
              graph: {
                ...graph.stats,
                visible: graph.vertices.length,
                edges: graph.edges.length,
                compressedEdges: graph.edges.filter((edge) =>
                  edge.paths.some((path) => path.length > 2),
                ).length,
                sharedGlyphs: graph.vertices.filter((v) => v.members.length > 1).length,
                returns: graph.edges.filter((e) => e.kind === 'return').length,
                recurrences: graph.edges.filter((e) => e.kind === 'recurrence').length,
                checks: graph.vertices.filter((v) => has(v, 'check') && !has(v, 'mate')).length,
                mates: graph.vertices.filter((v) => has(v, 'mate')).length,
                draws: graph.vertices.filter((v) => has(v, 'draw')).length,
                width: graph.width,
                height: graph.height,
              },
              checkpoints,
            },
          };
        },
        { study, profile },
      );
      data.summary.elapsedMs = elapsedMs;
      data.summary.browserErrors = errors;
      data.summary.browser = browser.version();
      data.summary.recordedAt = new Date().toISOString();
      data.summary.pgnSha256 = createHash('sha256').update(study.pgn).digest('hex');
      // Freeze only the legal game and searches: the current renderer can rebuild
      // this exact input later without silently rerunning a timing-based search.
      const frozen = Buffer.from(JSON.stringify({ game: data.game, analysis: data.analysis }));
      data.summary.analysisSha256 = createHash('sha256').update(frozen).digest('hex');
      await writeFile(`${output}/${study.id}-analysis.json.gz`, gzipSync(frozen));
      await writeFile(`${output}/${study.id}-summary.json`, JSON.stringify(data.summary, null, 2));
      await context.storageState({
        path: `${output}/${study.id}-browser-state.json`,
        indexedDB: true,
      });
      summaries.push(data.summary);
      console.log(
        JSON.stringify({
          id: study.id,
          elapsedMs,
          depth: data.summary.depth,
          graph: data.summary.graph,
          errors,
        }),
      );
      if (errors.length) throw new Error(`Browser errors in ${study.id}`);
    } finally {
      clearInterval(progress);
      await context.close();
    }
  }
  await writeFile(`${output}/measurements.json`, JSON.stringify(summaries, null, 2));
} finally {
  await browser.close();
}
