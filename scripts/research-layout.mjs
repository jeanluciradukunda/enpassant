import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { instance } from '@viz-js/viz';

// Freeze the chess analysis; vary only fan ordering and the layout weight ratio.
// Usage: node scripts/research-layout.mjs artifacts/paper-research/study-data.json
const path = process.argv[2];
if (!path) throw new Error('Pass the data file written by research-paper-game.mjs.');
const bytes = await readFile(path);
const input = (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
const data = JSON.parse(input);
const server = await createServer({
  configFile: false,
  cacheDir: 'artifacts/paper-research/vite-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { EvolutionBuilder } = await server.ssrLoadModule('/src/lib/evolution.ts');
  const { evolutionDot } = await server.ssrLoadModule('/src/lib/evolutionDot.ts');
  const builder = new EvolutionBuilder(data.game);
  for (const [id, analysis] of data.analysis) builder.append(id, analysis, 20);
  const graph = process.argv.includes('--frozen-graph')
    ? { ...data.graph, byId: new Map(data.graph.nodes.map((n) => [n.id, n])) }
    : await builder.layout();
  const viz = await instance();
  const results = [];
  for (const policy of [
    {
      name: 'legacy-with-played-group',
      orderFans: false,
      playedWeight: 40,
      branchWeight: 8,
      compressedWeight: 2,
      groupPlayed: true,
    },
    {
      name: 'legacy-mixed-weights',
      orderFans: false,
      playedWeight: 40,
      branchWeight: 8,
      compressedWeight: 2,
    },
    { name: 'unordered-5-to-1', orderFans: false, playedWeight: 50, branchWeight: 10 },
    { name: 'ordered-5-to-1', orderFans: true, playedWeight: 50, branchWeight: 10 },
    { name: 'ordered-1-to-1', orderFans: true, playedWeight: 10, branchWeight: 10 },
  ]) {
    const moves = graph.edges.filter((e) => e.kind !== 'recurrence');
    const { dot, names } = evolutionDot(graph.vertices, graph.byId, moves, policy);
    const rendered = viz.renderJSON(dot);
    const points = new Map(rendered.objects.map((o) => [o.name, o.pos.split(',').map(Number)]));
    const at = (id) => points.get(names.get(id));
    const branches = moves.filter(
      (e) => graph.byId.get(e.from).played && !graph.byId.get(e.to).played,
    );
    const above = branches.filter((e) => at(e.to)[1] > at(e.from)[1] + 0.1).length;
    const below = branches.filter((e) => at(e.to)[1] < at(e.from)[1] - 0.1).length;
    const ys = graph.vertices.filter((v) => graph.byId.get(v.id).played).map((v) => at(v.id)[1]);
    results.push({
      ...policy,
      graphBounds: rendered.bb,
      branchesAbove: above,
      branchesBelow: below,
      playedVerticalSpread: Math.max(...ys) - Math.min(...ys),
    });
    await writeFile(
      `artifacts/paper-research/layout-${policy.name}.svg`,
      viz.renderString(dot, { format: 'svg' }),
    );
  }
  const output = {
    input: path,
    sha256: createHash('sha256').update(input).digest('hex'),
    frozenGraph: process.argv.includes('--frozen-graph'),
    vertices: graph.vertices.length,
    results,
  };
  await writeFile('artifacts/paper-research/layout-ablation.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally {
  await server.close();
}
