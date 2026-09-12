// Offline production-builder measurements using retained analysis. No Stockfish runs.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const directory = 'docs/platform/research/evidence/engine';
const inputs = [
  'botvinnik-tal-1960',
  'tal-larsen-1965',
  'tal-smyslov-1959',
  'indigojeans-gm-shadi',
].map((id) => ({ id, path: `docs/research/tal-quick/${id}-analysis.json.gz` }));
inputs.push({ id: 'deepblue-depth20', path: 'docs/research/deepblue-depth20-analysis.json.gz' });
const server = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  cacheDir: `${directory}/vite-cache`,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { EvolutionBuilder } = await server.ssrLoadModule('/src/lib/evolution.ts');
  const { layoutEvolution } = await server.ssrLoadModule('/src/lib/evolutionLayout.ts');
  const { EvolutionMarks } = await server.ssrLoadModule('/src/components/EvolutionMarks.tsx');
  const { cacheKey } = await server.ssrLoadModule('/src/lib/engine.ts');
  const output = {
    measuredAt: new Date().toISOString(),
    method:
      'Frozen candidates; current production builder, Graphviz WASM SSR and SVG marks; one sequential run on this Mac; not cloud or browser interaction benchmarks.',
    inputs: [],
    ablation: [],
    prefixReuse: {},
  };
  const keysWithPlayed = new Set(),
    keysWithoutPlayed = new Set();
  let playedRoots = 0;
  for (const { id, path } of inputs) {
    const bytes = await readFile(path),
      decoded = gunzipSync(bytes),
      data = JSON.parse(decoded);
    const start = performance.now();
    const builder = new EvolutionBuilder(data.game);
    for (const [root, result] of data.analysis) builder.append(root, result, 20);
    const builtAt = performance.now(),
      graph = await builder.layout(),
      doneAt = performance.now();
    const plainGraph = JSON.stringify({ ...graph, byId: undefined });
    const svg = renderToStaticMarkup(
      createElement(
        'svg',
        { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${graph.width} ${graph.height}` },
        createElement(EvolutionMarks, {
          graph,
          selected: graph.byId.get('p0'),
          cursor: data.game.positions.length - 1,
          overview: true,
          isolated: false,
          onSelect() {},
        }),
      ),
    );
    const roots = data.analysis.map(([, result]) => result),
      searched = roots.filter((result) => result.lines.length);
    const depths = searched.map((result) => result.depth).sort((a, b) => a - b);
    const displayedEvents = graph.vertices.map((v) => v.members.map((id) => graph.byId.get(id)));
    const entry = {
      id,
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      savedCompressedBytes: bytes.length,
      savedJsonBytes: decoded.length,
      roots: roots.length,
      actualDepth: {
        min: depths[0],
        median: depths[Math.floor(depths.length / 2)],
        max: depths.at(-1),
      },
      requestedTarget: 20,
      reachedTarget: searched.filter((a) => a.depthReached).length,
      playedFallbacks: searched.filter((a) => a.playedLine).length,
      mixedDepthFallbacks: searched.filter((a) => a.playedLine && a.playedLine.depth !== a.depth)
        .length,
      buildMs: Math.round(builtAt - start),
      layoutMs: Math.round(doneAt - builtAt),
      graph: {
        ...graph.stats,
        visible: graph.vertices.length,
        edges: graph.edges.length,
        width: graph.width,
        height: graph.height,
        jsonBytes: Buffer.byteLength(plainGraph),
        gzipBytes: gzipSync(plainGraph).length,
        svgBytes: Buffer.byteLength(svg),
        svgGzipBytes: gzipSync(svg).length,
        checkGlyphs: displayedEvents.filter((members) => members.some((n) => n.check)).length,
        supportedCheckGlyphs: displayedEvents.filter((members) =>
          members.some((n) => n.checkQuality === 'supported'),
        ).length,
        unassessedCheckGlyphs: displayedEvents.filter((members) =>
          members.some((n) => n.checkQuality === 'unassessed'),
        ).length,
        mateGlyphs: displayedEvents.filter((members) => members.some((n) => n.mate)).length,
      },
    };
    output.inputs.push(entry);
    if (id !== 'deepblue-depth20')
      for (const position of data.game.positions) {
        const node = builder.get(position.id);
        playedRoots++;
        keysWithPlayed.add(
          cacheKey(data.game.initialFen, node.moves, 400, {
            depth: 20,
            playedMove: data.game.positions[position.ply + 1]?.uci,
          }),
        );
        keysWithoutPlayed.add(cacheKey(data.game.initialFen, node.moves, 400, { depth: 20 }));
      }
    if (id === 'botvinnik-tal-1960') {
      for (const [name, policy] of [
        ['events+positions', {}],
        ['events+ply', { merging: 'ply' }],
        ['neighbors+positions', { compression: 'neighbors' }],
      ]) {
        const start = performance.now();
        const alternative = await layoutEvolution(
          graph.nodes,
          new Map(data.analysis),
          undefined,
          policy,
        );
        output.ablation.push({
          id,
          change: name,
          engineSearches: 0,
          elapsedMs: Math.round(performance.now() - start),
          ...alternative.stats,
          visible: alternative.vertices.length,
          edges: alternative.edges.length,
          width: alternative.width,
          height: alternative.height,
        });
      }
      for (const horizon of [12, 30]) {
        const another = new EvolutionBuilder(data.game);
        for (const [root, result] of data.analysis) another.append(root, result, horizon);
        const alternative = await another.layout();
        output.ablation.push({
          id,
          change: `display horizon ${horizon}`,
          engineSearches: 0,
          ...alternative.stats,
          visible: alternative.vertices.length,
          edges: alternative.edges.length,
          width: alternative.width,
          height: alternative.height,
        });
      }
    }
    console.log(JSON.stringify(entry));
  }
  output.prefixReuse = {
    corpus: 'Four frozen Tal/control games only; not a lifetime/archive forecast',
    playedRoots,
    exactKeysIncludingPlayedMove: keysWithPlayed.size,
    siblingSearchKeysExcludingPlayedMove: keysWithoutPlayed.size,
  };
  await writeFile(`${directory}/graph-probe.json`, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ ablation: output.ablation, prefixReuse: output.prefixReuse }));
} finally {
  await server.close();
}
