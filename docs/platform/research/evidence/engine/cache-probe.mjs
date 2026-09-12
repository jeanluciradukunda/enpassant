// Bounded R1 evidence: real Chromium IndexedDB; deterministic Worker test double.
// No app server and no external requests. Not a Stockfish performance benchmark.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.resolve('vite'));
const { build } = await import(require.resolve('esbuild'));
const bundle = await build({
  entryPoints: ['src/lib/engine.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'EngineProbe',
  define: { 'import.meta.env.BASE_URL': '"/"' },
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Offline cache probe</title>',
    }),
  );
  await page.goto('http://cache-probe.invalid/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(async () => {
    const { Engine, cacheKey, readAnalysis } = EngineProbe;
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const roots = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'g2g3', 'b1c3', 'b2b3', 'f2f4'];
    const pause = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
    const commands = [];
    let instances = 0;
    class WorkerDouble {
      constructor() {
        instances++;
      }
      postMessage(command) {
        commands.push(command);
        const emit = (data) => this.onmessage?.({ data });
        if (command === 'uci') queueMicrotask(() => emit('uciok'));
        if (command === 'isready') queueMicrotask(() => emit('readyok'));
        if (command.startsWith('go '))
          setTimeout(() => {
            const only = command.match(/searchmoves (\w+)/)?.[1];
            const moves = only ? [only] : roots;
            moves.forEach((move, i) =>
              emit(`info depth 12 multipv ${i + 1} score cp ${100 - i * 10} pv ${move}`),
            );
            emit(`bestmove ${moves[0]}`);
          }, 5);
      }
      terminate() {
        this.onmessage = undefined;
      }
    }
    window.Worker = WorkerDouble;
    // Initialize the real database through production code first.
    await readAnalysis('initialize');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('enpassant-analysis', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    async function seed(entries) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('positions', 'readwrite');
        const store = tx.objectStore('positions');
        store.clear();
        for (const [key, value] of entries) store.put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
    const count = () =>
      new Promise((resolve) => {
        const request = db.transaction('positions').objectStore('positions').count();
        request.onsuccess = () => resolve(request.result);
      });
    const value = {
      lines: roots.map((move, i) => ({
        rank: i + 1,
        depth: 12,
        score: { type: 'cp', value: 100 - i * 10 },
        moves: [move],
      })),
      depth: 12,
      milliseconds: 400,
      requestedDepth: 20,
      depthReached: false,
    };
    const reset = () => {
      commands.length = 0;
      instances = 0;
    };
    const searches = () => commands.filter((s) => s.startsWith('go ')).length;
    const results = {};
    await seed([[cacheKey(fen, [], 400), value]]);
    reset();
    let engine = new Engine();
    const hit = await engine.analyze(fen, [], 400);
    await pause();
    results.partialCacheHit = {
      workerInstances: instances,
      searchCommands: searches(),
      commands: [...commands],
      returnedDepth: hit.depth,
      requestedDepth: hit.requestedDepth,
      depthReached: hit.depthReached,
    };
    engine.dispose();
    await seed([]);
    reset();
    engine = new Engine();
    await engine.analyze(fen, [], 400, { playedMove: 'e2e4' });
    await engine.analyze(fen, [], 400, { playedMove: 'd2d4' });
    results.differentPlayedMoveSameSiblingSearch = {
      searches: searches(),
      keys: [
        cacheKey(fen, [], 400, { playedMove: 'e2e4' }),
        cacheKey(fen, [], 400, { playedMove: 'd2d4' }),
      ],
    };
    engine.dispose();
    await seed([[cacheKey(fen, [], 400), value]]);
    reset();
    engine = new Engine();
    await engine.analyze(fen, [], 400, { refresh: true });
    await engine.analyze(fen, [], 400, { refresh: true });
    results.refreshTwice = { searches: searches(), entries: await count() };
    engine.dispose();
    await seed([]);
    reset();
    const a = new Engine(),
      b = new Engine();
    await Promise.all([a.analyze(fen, [], 400), b.analyze(fen, [], 400)]);
    results.identicalConcurrentEngines = {
      searches: searches(),
      workerInstances: instances,
      entries: await count(),
    };
    a.dispose();
    b.dispose();
    await seed([]);
    reset();
    engine = new Engine();
    await pause();
    let settledA = false,
      settledB = false;
    const first = engine.analyze(fen, [], 400).then(
      () => {
        settledA = true;
      },
      () => {
        settledA = true;
      },
    );
    const second = engine.analyze(fen, [], 400).then(
      () => {
        settledB = true;
      },
      () => {
        settledB = true;
      },
    );
    await pause(50);
    results.sameEngineConcurrent = {
      settledWithin50ms: [settledA, settledB],
      searchCommands: searches(),
      caveat:
        'Direct API stress probe; production hook serializes calls. Dangling promise need not mean current UI bug.',
    };
    engine.dispose();
    void first;
    void second;
    await seed(
      Array.from({ length: 3000 }, (_, i) => [`zz-seeded-${String(i).padStart(4, '0')}`, value]),
    );
    reset();
    engine = new Engine();
    await engine.analyze(fen, [], 400);
    await pause(50);
    results.eviction = {
      entries: await count(),
      freshlyWrittenKeyStillPresent: !!(await readAnalysis(cacheKey(fen, [], 400))),
      explanation:
        'All seeded keys sort after the fresh real cache key; default cursor deletes ascending keys.',
    };
    engine.dispose();
    db.close();
    return results;
  });
  const output = {
    measuredAt: new Date().toISOString(),
    browser: browser.version(),
    method:
      'Production engine bundled with esbuild; real browser IndexedDB; all Worker UCI output is mocked; routed synthetic origin has no network.',
    results,
  };
  await writeFile(
    'docs/platform/research/evidence/engine/cache-probe.json',
    JSON.stringify(output, null, 2) + '\n',
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser.close();
}
