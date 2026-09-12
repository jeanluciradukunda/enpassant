import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

// Re-render saved engine inputs through production Graphviz and SVG components.
// This performs no searches. Optional arguments: input directory, output directory.
const input = process.argv[2] || 'docs/research/tal-quick';
const output = process.argv[3] || 'artifacts/tal-study/gallery';
const measurements = JSON.parse(await readFile(`${input}/measurements.json`, 'utf8'));
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  esbuild: { jsx: 'automatic' },
  cacheDir: 'artifacts/tal-study/render-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
try {
  const { EvolutionBuilder } = await server.ssrLoadModule('/src/lib/evolution.ts');
  const { EvolutionDiagram } = await server.ssrLoadModule('/src/components/EvolutionDiagram.tsx');
  const { TAL_GAMES } = await server.ssrLoadModule('/src/lib/studyGames.ts');
  const panels = [];
  const rendered = [];
  for (const measured of measurements) {
    const bytes = gunzipSync(await readFile(`${input}/${measured.id}-analysis.json.gz`));
    if (createHash('sha256').update(bytes).digest('hex') !== measured.analysisSha256)
      throw new Error(`Frozen input hash mismatch: ${measured.id}`);
    const data = JSON.parse(bytes.toString());
    const builder = new EvolutionBuilder(data.game);
    for (const [id, analysis] of data.analysis)
      builder.append(id, analysis, measured.displayHorizon);
    const graph = await builder.layout();
    const has = (vertex, event) => vertex.members.some((id) => graph.byId.get(id)[event]);
    const counts = {
      id: measured.id,
      analysisSha256: measured.analysisSha256,
      visible: graph.vertices.length,
      checks: graph.vertices.filter((v) => has(v, 'check') && !has(v, 'mate')).length,
      mates: graph.vertices.filter((v) => has(v, 'mate')).length,
      width: graph.width,
      height: graph.height,
    };
    rendered.push(counts);
    const study = TAL_GAMES.find((study) => study.id === measured.id);
    const props = {
      graph,
      game: data.game,
      analysis: new Map(data.analysis),
      selected: graph.byId.get(`p${study?.checkpoint ?? 31}`),
      cursor: data.game.positions.length - 1,
      overview: true,
      isolated: false,
      onSelect: () => {},
    };
    const document = new JSDOM(renderToStaticMarkup(createElement(EvolutionDiagram, props))).window
      .document;
    const svgs = [...document.querySelectorAll('svg')];
    svgs.forEach((svg, index) => {
      svg.removeAttribute('style');
      svg.setAttribute('width', String(graph.width));
      svg.setAttribute('height', String(index ? 180 : graph.height));
      svg.setAttribute('y', String(index ? graph.height : 0));
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${graph.width} ${graph.height + 180}"><rect width="100%" height="100%" fill="#9dcd9b"/>${svgs.map((svg) => svg.outerHTML).join('')}</svg>`;
    await writeFile(`${output}/${measured.id}.svg`, svg);
    const note = study?.note ?? 'Your 21-move game, measured as the comparison.';
    panels.push(
      `<figure><figcaption><div><small>${study ? escape(study.context) : 'Personal game · comparison'}</small><h2>${escape(measured.title)}<span>.</span></h2><p>${escape(note)}</p></div><div class="metrics"><b>${graph.vertices.length.toLocaleString()} junctions & events</b><br>${counts.checks} retained check glyphs · mate endpoints: ${counts.mates}<br>${Math.ceil(measured.plies / 2)} moves · median search depth ${measured.depth.median}</div></figcaption><a href="${measured.id}.svg"><img src="${measured.id}.svg" alt="Production Enpassant diagram of ${escape(measured.title)}"></a></figure>`,
    );
    console.log(measured.id, graph.vertices.length, 'visible glyphs');
  }
  await writeFile(`${output}/rendered-measurements.json`, JSON.stringify(rendered, null, 2));
  await writeFile(
    `${output}/index.html`,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enpassant · A little Tal magic</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#183923;font:14px/1.55 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:40px 48px}header{border-bottom:1px solid #18392340;padding-bottom:24px;margin-bottom:36px}.brand{font:bold 27px Georgia,serif;letter-spacing:-1.2px}small{font-size:10px;letter-spacing:1.4px;text-transform:uppercase}.top{display:flex;justify-content:space-between;align-items:center}h1{font:52px Georgia,serif;margin:20px 0 10px}h2{font:32px Georgia,serif;margin:5px 0}h1 span,h2 span,.brand span{color:#ed001b}p{margin:6px 0;max-width:960px}figure{margin:0 0 38px;padding-bottom:30px;border-bottom:1px solid #18392330}figcaption{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:14px}.metrics{text-align:right;font-size:11px;line-height:1.8;white-space:nowrap}img{display:block;width:100%;height:auto}a{color:inherit}.method{font-size:12px;max-width:1000px}.key{font-size:12px;margin-top:18px}footer{font-size:11px;opacity:.75}@media(max-width:700px){main{padding:24px 18px}h1{font-size:38px}h2{font-size:26px}.top,figcaption{display:block}.metrics{text-align:left;margin-top:12px}}
</style></head><body><main><header><div class="top"><div class="brand">enpassant<span>.</span></div><small>Three Tal games / one analysis policy</small></div><h1>A little Tal magic<span>.</span></h1><p>Same engine budget. Same Graphviz layout rules. Different chess.</p><p class="method">Stockfish 18 lite · Quick preview · 400 ms per root · 8 candidates · depth-20 ceiling. Each graph is fitted to the page independently; compare structure and the recorded counts, rather than physical length. These are current app diagrams rebuilt from saved searches, not artwork from the paper.</p><div class="key">Circles: played positions &nbsp; · &nbsp; Squares: alternatives &nbsp; · &nbsp; Fills: check cues &nbsp; · &nbsp; Red mate markers &nbsp; · &nbsp; Dotted paths: compressed continuations</div></header>${panels.join('')}<footer>Frozen searches from 8 September 2026. Legal check counts include unassessed and locally inferior checks; fills follow the app’s retained-check rule. Mate markers certify individual legal endpoints, not a forced win against every defence. Search depth and density are not fidelity scores. <a href="/docs/research/tal-collection.md">Sources, measurements and reproduction notes ↗</a></footer></main></body></html>`,
  );
} finally {
  await server.close();
}
