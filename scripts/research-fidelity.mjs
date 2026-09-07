import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

// Frozen analysis, real production SVG components, no new engine search.
const input = gunzipSync(await readFile('docs/research/deepblue-depth20-analysis.json.gz'));
const data = JSON.parse(input.toString());
const output = 'artifacts/paper-research/fidelity';
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  cacheDir: 'artifacts/paper-research/vite-fidelity-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { EvolutionBuilder } = await server.ssrLoadModule('/src/lib/evolution.ts');
  const { layoutEvolution } = await server.ssrLoadModule('/src/lib/evolutionLayout.ts');
  const { EvolutionMarks } = await server.ssrLoadModule('/src/components/EvolutionMarks.tsx');
  const { EvolutionDiagram } = await server.ssrLoadModule('/src/components/EvolutionDiagram.tsx');
  const builder = new EvolutionBuilder(data.game);
  for (const [id, a] of data.analysis) builder.append(id, a, 20);
  const graph = await builder.layout();
  const analysis = new Map(data.analysis);
  const summary = (g) => ({
    ...g.stats,
    vertices: g.vertices.length,
    edges: g.edges.length,
    compressed: g.edges.filter((e) => e.paths.some((p) => p.length > 2)).length,
    returns: g.edges.filter((e) => e.kind === 'return').length,
    shared: g.vertices.filter((v) => v.members.length > 1).length,
    checks: g.vertices.filter((v) => v.members.some((id) => g.byId.get(id).check)).length,
    width: g.width,
    height: g.height,
  });
  const props = (g, extra = {}) => ({
    graph: g,
    game: data.game,
    analysis,
    selected: g.byId.get('p73'),
    cursor: 89,
    overview: true,
    isolated: false,
    onSelect: () => {},
    ...extra,
  });
  const svg = (g, extra = {}) =>
    renderToStaticMarkup(
      createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: `0 0 ${g.width} ${g.height}`,
          style: { background: '#9dcd9b', width: '100%', height: 'auto' },
        },
        createElement(EvolutionMarks, props(g, extra)),
      ),
    );
  const panels = [];
  const measurements = {};
  for (const [name, policy] of [
    ['caption-policy', { compression: 'neighbors', merging: 'ply' }],
    ['event-chains', { compression: 'events', merging: 'ply' }],
    ['shared-positions', { compression: 'events', merging: 'positions' }],
  ]) {
    const g =
      name === 'shared-positions'
        ? graph
        : await layoutEvolution(graph.nodes, analysis, undefined, policy);
    measurements[name] = summary(g);
    await writeFile(`${output}/${name}.svg`, svg(g));
    panels.push(
      `<figure><figcaption><b>${name}</b><span>${g.vertices.length} glyphs · ${measurements[name].compressed} compressed paths</span></figcaption><img src="${name}.svg" alt="Generated Enpassant diagram using ${name}"></figure>`,
    );
  }
  const study = renderToStaticMarkup(createElement(EvolutionDiagram, props(graph)));
  const doc = new JSDOM(study).window.document;
  const exportSvgs = [...doc.querySelectorAll('svg')];
  exportSvgs.forEach((svg, i) => {
    svg.removeAttribute('style');
    svg.setAttribute('width', String(graph.width));
    svg.setAttribute('height', String(i ? 180 : graph.height));
    svg.setAttribute('y', String(i ? graph.height : 0));
  });
  await writeFile(
    `${output}/study.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${graph.width}" height="${graph.height + 180}"><rect width="100%" height="100%" fill="#9dcd9b"/>${exportSvgs.map((svg) => svg.outerHTML).join('')}</svg>`,
  );
  await writeFile(`${output}/current.svg`, svg(graph));
  await writeFile(`${output}/assessed-only.svg`, svg(graph, { checkMode: 'assessed' }));
  await writeFile(`${output}/focus-37.svg`, svg(graph, { isolated: true }));
  const node = graph.byId.get('p73');
  const detail = renderToStaticMarkup(
    createElement(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `${node.x - 90} ${node.y - 110} 220 220`,
        style: { background: '#9dcd9b' },
      },
      createElement(EvolutionMarks, props(graph, { detail: true })),
    ),
  );
  await writeFile(`${output}/move-37.svg`, detail);
  const result = {
    input: 'deepblue-depth20-analysis.json.gz',
    sha256: createHash('sha256').update(input).digest('hex'),
    analysisRoots: data.analysis.length,
    measurements,
  };
  await writeFile(`${output}/measurements.json`, JSON.stringify(result, null, 2));
  await writeFile(`${output}/graph.json`, JSON.stringify({ ...graph, byId: undefined }));
  await writeFile(
    `${output}/index.html`,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enpassant · The rules made visible</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#183923;font:14px/1.5 system-ui,sans-serif}main{max-width:1800px;margin:auto;padding:44px}header{border-bottom:1px solid #18392340;margin-bottom:28px;padding-bottom:24px}small{font-size:10px;letter-spacing:2px;text-transform:uppercase}h1{font:48px Georgia,serif;margin:10px 0}h2{font:28px Georgia,serif}p{max-width:850px}figure{margin:24px 0}figcaption{display:flex;justify-content:space-between;margin-bottom:8px}img{display:block;width:100%}.detail{display:grid;grid-template-columns:1fr 1fr;gap:24px}.detail img{max-height:400px}button,output,.map-note,.score-caption,.diagram-tools{display:none}.evolution-diagram{background:#9dcd9b}.evolution-diagram svg{width:100%;display:block}.live-chart{max-height:140px}.source{opacity:.75}.source img{max-height:320px;object-fit:contain}a{color:inherit}@media(max-width:700px){main{padding:18px}h1{font-size:34px}.detail{display:block}figcaption{display:block}}
  </style><main><header><small>enpassant / visual rules study</small><h1>The rules made visible<span style="color:#ed001b">.</span></h1><p>Deep Blue–Kasparov, 1997 · Game 2. Every generated panel uses the same 90 saved depth-20 searches. The paper’s original analysis is unavailable.</p></header>
  <figure class="source"><figcaption><b>PUBLISHED REFERENCE · Figure 7</b><span>Lu, Wang & Lin, 2014 · source artwork, not app output</span></figcaption><img src="/docs/research/images/figure7-source.png" alt="Published reference Figure 7"></figure>
  <h2>Generated by the current app</h2>${study}<p>Filled checks show legal checks in retained lines, excluding locally refuted checks. They do not certify a forced concession. Mate crowns require a legal checkmate; this retained sample contains none.</p>
  <div class="detail"><figure><figcaption><b>Move 37 · generated detail</b></figcaption><img src="move-37.svg"></figure><figure><figcaption><b>Move 37 · focus on its retained continuations</b></figcaption><img src="focus-37.svg"></figure></div>
  <h2>Compression and merging, held apart</h2><p>Identical chess positions and identical mark styles. Only the structural rule changes between these panels.</p>${panels.join('')}
  <h2>Evidence versus display</h2><figure><figcaption><b>Only locally evaluated checks highlighted</b><span>Same graph · unknown checks stay hollow</span></figcaption><img src="assessed-only.svg"></figure>
  <p><a href="measurements.json">Frozen input hash and measurements ↗</a> · <a href="/docs/research/paper-visual-rulebook.md">All-figure rulebook ↗</a></p></main></html>`,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await server.close();
}
