// Offline experiment: can a saved placed graph reproduce current marks exactly?
// This is not a production serializer, an untrusted-input validator, or a cloud benchmark.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const fixturePath = 'docs/research/tal-quick/botvinnik-tal-1960-analysis.json.gz';
const bytes = await readFile(fixturePath);
const fixture = JSON.parse(gunzipSync(bytes));
const server = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { EvolutionBuilder, continuationFocus } =
    await server.ssrLoadModule('/src/lib/evolution.ts');
  const { EvolutionMarks } = await server.ssrLoadModule('/src/components/EvolutionMarks.tsx');
  const start = performance.now();
  const builder = new EvolutionBuilder(fixture.game);
  for (const [root, analysis] of fixture.analysis) builder.append(root, analysis, 20);
  const builtAt = performance.now();
  const graph = await builder.layout();
  const placedAt = performance.now();
  // The index is derived; all occurrence histories, aliases, splines and
  // continuation paths stay intact in the snapshot. No FEN-based merging here.
  const encoded = JSON.stringify({ ...graph, byId: undefined });
  const compressed = gzipSync(encoded);
  const restoreStart = performance.now();
  const restored = JSON.parse(gunzipSync(compressed));
  restored.byId = new Map(restored.nodes.map((node) => [node.id, node]));
  const restoredAt = performance.now();
  assert.equal(JSON.stringify({ ...restored, byId: undefined }), encoded);
  for (const node of graph.nodes) {
    assert.deepEqual(JSON.parse(JSON.stringify(node)), restored.byId.get(node.id));
    assert.strictEqual(
      restored.byId.get(node.id),
      restored.nodes.find((n) => n.id === node.id),
    );
  }
  const alternate = graph.nodes.find((node) => !node.played);
  assert(alternate);
  const cases = [
    { name: 'opening replay', cursor: 0, overview: false, isolated: false, selected: 'p0' },
    { name: 'middle replay', cursor: 40, overview: false, isolated: false, selected: 'p40' },
    {
      name: 'complete overview',
      cursor: fixture.game.positions.length - 1,
      overview: true,
      isolated: false,
      selected: 'p0',
    },
    { name: 'isolated played root', cursor: 40, overview: true, isolated: true, selected: 'p40' },
    {
      name: 'isolated alternative',
      cursor: 40,
      overview: true,
      isolated: true,
      selected: alternate.id,
    },
    {
      name: 'detail assessed checks',
      cursor: 40,
      overview: true,
      isolated: false,
      selected: 'p40',
      detail: true,
      checkMode: 'assessed',
    },
  ];
  const render = (candidate, scenario) =>
    renderToStaticMarkup(
      createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: `0 0 ${candidate.width} ${candidate.height}`,
        },
        createElement(EvolutionMarks, {
          ...scenario,
          graph: candidate,
          selected: candidate.byId.get(scenario.selected),
          onSelect() {},
        }),
      ),
    );
  const results = cases.map((scenario) => {
    const original = render(graph, scenario);
    const roundTrip = render(restored, scenario);
    assert.equal(roundTrip, original, scenario.name);
    assert.deepEqual(
      continuationFocus(restored, scenario.selected),
      continuationFocus(graph, scenario.selected),
    );
    return {
      name: scenario.name,
      identicalSvg: true,
      svgSha256: createHash('sha256').update(original).digest('hex'),
      svgBytes: Buffer.byteLength(original),
    };
  });
  const output = {
    measuredAt: new Date().toISOString(),
    method:
      'One frozen Botvinnik–Tal fixture; production builder and SVG component through Vite SSR; one Mac run. Gunzip, JSON parse and Map reindex measured together. No network, engine search, cloud deployment or browser interaction.',
    fixturePath,
    fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
    sizes: {
      analysisGzip: bytes.length,
      placedJson: Buffer.byteLength(encoded),
      placedGzip: compressed.length,
    },
    timingsMs: {
      build: builtAt - start,
      layout: placedAt - builtAt,
      restoreIncludingGunzip: restoredAt - restoreStart,
    },
    verified: {
      nodes: graph.nodes.length,
      renderCases: results,
      engineSearchesOnRestore: 0,
      graphvizCallsOnRestore: 0,
    },
    limitations: [
      'No claim about browser parse/render latency or memory peak.',
      'A deployed snapshot needs schema and byte/node limits, owner authorization, content digest, policy/renderer/engine revisions and invalidation.',
      'Restoring a placed view does not reconstruct private mutable EvolutionBuilder state for incremental searches.',
      'SVG equality covers these six component states; it does not test mouse, keyboard or unfolded-path interaction.',
    ],
  };
  await writeFile(
    'docs/platform/research/evidence/diagram-snapshot.json',
    `${JSON.stringify(output, null, 2)}\n`,
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  await server.close();
}
