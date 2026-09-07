import type { Analysis, EvolutionEdge, EvolutionGraph, EvolutionNode, Score } from '../types/game';

interface DotGraph {
  bb: string;
  objects: { name: string; pos?: string }[];
  edges: { id?: string; pos?: string; _draw_?: { op: string; points?: number[][] }[] }[];
}
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (value: DotGraph) => void; reject: (error: Error) => void }
>();
async function render(dot: string): Promise<DotGraph> {
  if (import.meta.env.SSR) {
    const { instance } = await import('@viz-js/viz');
    return (await instance()).renderJSON(dot) as DotGraph;
  }
  if (!worker) {
    worker = new Worker(new URL('./graphviz.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) job?.reject(new Error(data.error));
      else job?.resolve(data.result);
    };
    worker.onerror = () => {
      for (const job of pending.values())
        job.reject(new Error('The graph layout could not start. Resume analysis to retry.'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, dot });
  });
}
const numeric = (score: Score) =>
  score.type === 'cp' ? score.value : Math.sign(score.value) * (30000 - Math.abs(score.value));
const event = (node: EvolutionNode) => node.check || node.mate || node.draw;
const curve = (a: EvolutionNode, b: EvolutionNode) =>
  `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;

/** Paper §3.1: same-position display junctions, degree-two shortening, and
 * weighted layered Graphviz layout. Aliases affect display only: the full
 * path-specific occurrences remain in byId and in every displayed edge. */
export async function layoutEvolution(
  input: EvolutionNode[],
  analysis: Map<string, Analysis>,
  previous?: EvolutionGraph,
): Promise<EvolutionGraph> {
  const nodes = input.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes)
    if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
  const groups = new Map<string, string[]>();
  const alias = new Map<string, string>();
  for (const n of nodes) {
    // Same ply, full FEN (including clocks), and event state. Repetition state
    // isn't discarded: merged glyphs retain all underlying occurrence paths.
    const key = `${n.ply}:${n.fen}:${n.draw}`;
    const members = groups.get(key) ?? [];
    members.push(n.id);
    groups.set(key, members);
  }
  const vertices = [...groups.values()].map((members) => {
    const id = members.find((id) => byId.get(id)!.played) ?? members[0];
    for (const member of members) alias.set(member, id);
    return { id, members };
  });
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const n of nodes)
    if (n.parent) {
      const from = alias.get(n.parent)!;
      const to = alias.get(n.id)!;
      const out = outgoing.get(from) ?? new Set();
      out.add(to);
      outgoing.set(from, out);
      const into = incoming.get(to) ?? new Set();
      into.add(from);
      incoming.set(to, into);
    }
  const keep = new Set<string>();
  for (const v of vertices) {
    const highlighted = v.members.some((id) => {
      const n = byId.get(id)!;
      return n.played || event(n);
    });
    if (highlighted || incoming.get(v.id)?.size !== 1 || outgoing.get(v.id)?.size !== 1)
      keep.add(v.id);
    if (highlighted) {
      for (const id of incoming.get(v.id) ?? []) keep.add(id);
      for (const id of outgoing.get(v.id) ?? []) keep.add(id);
    }
  }
  // A later search cannot hide or reposition a glyph already inspected.
  for (const vertex of previous?.vertices ?? [])
    if (alias.has(vertex.id)) keep.add(alias.get(vertex.id)!);
  const shown = vertices.filter((v) => keep.has(v.id));
  const edgeMap = new Map<string, EvolutionEdge>();
  for (const vertex of shown)
    for (const member of vertex.members) {
      for (const first of children.get(member) ?? []) {
        const path = [member, first];
        let current = first;
        while (!keep.has(alias.get(current)!)) {
          const next = children.get(current)?.[0];
          if (!next) break;
          path.push(next);
          current = next;
        }
        const to = alias.get(current)!;
        const key = `${vertex.id}→${to}`;
        const existing = edgeMap.get(key);
        if (existing) existing.paths.push(path);
        else edgeMap.set(key, { id: key, from: vertex.id, to, paths: [path], d: '', weight: 0.45 });
      }
    }
  const edges = [...edgeMap.values()];
  // Relative importance is normalized within one source only. Unsearched
  // continuations keep a neutral weight; a PV's root score isn't copied to them.
  const weights = new Map<string, number>();
  for (const [sourceId, result] of analysis) {
    const source = byId.get(sourceId);
    if (!source || !result.lines.length) continue;
    const scores = result.lines.map((line) => numeric(line.score) * (source.turn === 'w' ? 1 : -1));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    for (const [i, line] of result.lines.entries()) {
      const child = (children.get(sourceId) ?? []).find(
        (id) => byId.get(id)?.uci === line.moves[0],
      );
      if (child)
        weights.set(
          child,
          max === min
            ? 1.1
            : 0.22 + 2.2 * Math.pow(Math.log1p(scores[i] - min) / Math.log1p(max - min), 2),
        );
    }
  }
  for (const edge of edges) {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    edge.weight = Math.max(...edge.paths.map((path) => weights.get(path[1]) ?? 0.38));
    if (from.played && to.played) edge.weight = Math.max(edge.weight, 1.3);
  }
  const names = new Map(shown.map((v, i) => [v.id, `n${i}`]));
  // Rank the shortened graph itself: reserving a column for every hidden ply
  // turns compact trees into long parallel lanes and defeats shortening.
  const lines = [
    'digraph evolution {',
    'graph [rankdir=LR, nodesep=.04, ranksep=.16, margin=0, splines=true, newrank=true, outputorder=edgesfirst];',
    'node [shape=box, label="", fixedsize=true, width=.07, height=.07];',
    'edge [arrowsize=.35];',
  ];
  for (const v of shown) {
    const node = byId.get(v.id)!;
    const name = names.get(v.id)!;
    lines.push(`${name} [${node.played ? 'shape=circle,width=.19,height=.19,group=played' : ''}];`);
  }
  for (const edge of edges) {
    const a = byId.get(edge.from)!;
    const b = byId.get(edge.to)!;
    lines.push(
      `${names.get(edge.from)} -> ${names.get(edge.to)} [id="${edge.id}", minlen=1, weight=${a.played && b.played ? 40 : edge.paths[0].length > 2 ? 2 : 8}];`,
    );
  }
  lines.push('}');
  const result = await render(lines.join('\n'));
  const bounds = result.bb.split(',').map(Number);
  const height = Math.max(220, bounds[3] + 36);
  const dotToId = new Map([...names].map(([id, name]) => [name, id]));
  for (const object of result.objects) {
    const id = dotToId.get(object.name);
    if (!id || !object.pos) continue;
    const [x, y] = object.pos.split(',').map(Number);
    Object.assign(byId.get(id)!, { x: x + 18, y: bounds[3] - y + 18 });
  }
  for (const edge of edges) {
    const rendered = result.edges?.find((e) => e.id === edge.id);
    const points = rendered?._draw_?.find((op) => op.op === 'b')?.points;
    if (points?.length)
      edge.d = points
        .map(
          ([x, y], i) =>
            `${i === 0 ? 'M' : i % 3 === 1 ? 'C' : ''}${(x + 18).toFixed(2)},${(bounds[3] - y + 18).toFixed(2)}`,
        )
        .join(' ');
    else edge.d = curve(byId.get(edge.from)!, byId.get(edge.to)!);
  }
  let width = Math.max(720, bounds[2] + 36);
  let finalHeight = height;
  if (previous?.ready) {
    // Reuse all published anchors. New glyphs inherit the local displacement
    // of the nearest existing ancestor, then claim unoccupied vertical space.
    // A compressed branch has display ranks, not one column per actual ply.
    const old = new Map(
      previous.vertices.flatMap((v) =>
        v.members.map((id) => [id, previous.byId.get(id)!] as const),
      ),
    );
    const original = new Map(shown.map((v) => [v.id, { ...byId.get(v.id)! }]));
    const occupied: EvolutionNode[] = [];
    for (const v of shown) {
      const n = byId.get(v.id)!;
      const anchor = v.members.map((id) => old.get(id)).find(Boolean);
      if (anchor) {
        n.x = anchor.x;
        n.y = anchor.y;
        occupied.push(n);
      }
    }
    for (const v of shown) {
      if (v.members.some((id) => old.has(id))) continue;
      const n = byId.get(v.id)!;
      let ancestor = n.parent ? byId.get(n.parent) : undefined;
      while (ancestor && !old.has(ancestor.id))
        ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
      if (ancestor) {
        const anchor = old.get(ancestor.id)!;
        const fresh = original.get(alias.get(ancestor.id)!) ?? ancestor;
        n.x += anchor.x - fresh.x;
        n.y += anchor.y - fresh.y;
      }
      const preferred = n.y;
      for (
        let gap = 0;
        occupied.some(
          (other) =>
            Math.abs(other.x - n.x) < (other.played ? 12 : 7) &&
            Math.abs(other.y - n.y) < (other.played ? 12 : 8),
        );
        gap++
      )
        n.y = preferred + (gap % 2 ? -1 : 1) * (Math.floor(gap / 2) + 1) * 8;
      occupied.push(n);
    }
    const oldEdges = new Map(previous.edges.map((e) => [`${e.from}→${e.to}`, e]));
    for (const edge of edges)
      edge.d =
        oldEdges.get(`${edge.from}→${edge.to}`)?.d ??
        curve(byId.get(edge.from)!, byId.get(edge.to)!);
    width = previous.width;
    finalHeight = previous.height;
  }
  for (const v of vertices) {
    if (!keep.has(v.id)) continue;
    const node = byId.get(v.id)!;
    for (const id of v.members) {
      const member = byId.get(id)!;
      member.x = node.x;
      member.y = node.y;
    }
  }
  for (const edge of edges) {
    const a = byId.get(edge.from)!;
    const b = byId.get(edge.to)!;
    for (const path of edge.paths)
      for (let i = 1; i < path.length - 1; i++) {
        const n = byId.get(path[i])!;
        const t = (n.ply - a.ply) / (b.ply - a.ply);
        n.x = a.x + (b.x - a.x) * t;
        n.y = a.y + (b.y - a.y) * (3 * t * t - 2 * t * t * t);
      }
  }
  return {
    nodes,
    byId,
    vertices: shown,
    edges,
    width,
    height: finalHeight,
    ready: true,
    stats: {
      positions: nodes.length,
      merged: nodes.length - vertices.length,
      shortened: vertices.length - shown.length,
    },
  };
}
