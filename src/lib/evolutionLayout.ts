import type { Analysis, EvolutionEdge, EvolutionGraph, EvolutionNode } from '../types/game';

import { evolutionDot } from './evolutionDot';
import { renderGraph } from './graphviz';
import { candidates, candidateQualities, positionKey } from './semantics';
import { diagramStyle } from './diagramStyle';

export interface StructurePolicy {
  compression?: 'events' | 'neighbors' | 'none';
  merging?: 'positions' | 'ply' | 'none';
}

const event = (node: EvolutionNode) =>
  (node.check && node.checkQuality !== 'inferior') || node.mate || node.draw;
const curve = (a: EvolutionNode, b: EvolutionNode) =>
  `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;

/** Paper §3.1: same-position display junctions, degree-two shortening, and
 * weighted layered Graphviz layout. Aliases affect display only: the full
 * path-specific occurrences remain in byId and in every displayed edge. */
export async function layoutEvolution(
  input: EvolutionNode[],
  analysis: Map<string, Analysis>,
  previous?: EvolutionGraph,
  { compression = 'events', merging = 'positions' }: StructurePolicy = {},
): Promise<EvolutionGraph> {
  const nodes = input.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const n of nodes)
    if (n.parent) children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
  const groups = new Map<string, string[]>();
  const alias = new Map<string, string>();
  const positions = new Map<string, EvolutionNode[]>();
  for (const n of nodes) {
    const key = positionKey(n);
    positions.set(key, [...(positions.get(key) ?? []), n]);
  }
  for (const equivalents of positions.values()) {
    const played = equivalents.filter((n) => n.played);
    const first = equivalents.reduce((a, b) => (a.ply <= b.ply ? a : b));
    for (const n of equivalents) {
      // Repeated played instants retain their numbered chart anchors. Predicted
      // occurrences join the nearest matching anchor, or a shared alternative.
      // Draw and check evidence belong to occurrences, not the identity key.
      const anchor = n.played
        ? n
        : (played.reduce(
            (best, candidate) =>
              !best || Math.abs(candidate.ply - n.ply) < Math.abs(best.ply - n.ply)
                ? candidate
                : best,
            undefined as EvolutionNode | undefined,
          ) ?? first);
      const key =
        merging === 'none'
          ? n.id
          : merging === 'ply'
            ? `${n.ply}:${positionKey(n)}:${n.draw}:${n.mate}:${n.checkQuality}`
            : anchor.id;
      groups.set(key, [...(groups.get(key) ?? []), n.id]);
    }
  }
  const vertices = [...groups.values()].map((members) => {
    const id =
      members.find((id) => byId.get(id)!.played) ??
      members.reduce((a, b) => (byId.get(a)!.ply <= byId.get(b)!.ply ? a : b));
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
  // Played repetitions keep their timeline anchors and an explicit relationship.
  // Predicted repetitions instead redirect their real move edges through aliases.
  const recurrences: { from: string; to: string }[] = [];
  for (const n of nodes.filter((n) => n.played)) {
    let ancestor = n.parent ? byId.get(n.parent) : undefined;
    while (ancestor) {
      if (positionKey(ancestor) === positionKey(n)) {
        recurrences.push({ from: n.id, to: ancestor.id });
        break;
      }
      ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
    }
  }
  const keep = new Set(recurrences.flatMap(({ from, to }) => [alias.get(from)!, alias.get(to)!]));
  for (const v of vertices) {
    const highlighted = v.members.some((id) => {
      const n = byId.get(id)!;
      return n.played || event(n);
    });
    if (
      compression === 'none' ||
      highlighted ||
      v.members.some((id) => !children.get(id)?.length) ||
      incoming.get(v.id)?.size !== 1 ||
      outgoing.get(v.id)?.size !== 1
    )
      keep.add(v.id);
    if (compression === 'neighbors' && highlighted) {
      for (const id of incoming.get(v.id) ?? []) keep.add(id);
      for (const id of outgoing.get(v.id) ?? []) keep.add(id);
    }
  }
  // Preserve a sampled decision's first moves so solid sibling widths remain
  // comparable. Quiet replies inside later event chains can still disappear.
  for (const id of analysis.keys()) {
    const from = alias.get(id);
    if (from && (outgoing.get(from)?.size ?? 0) > 1) {
      keep.add(from);
      for (const to of outgoing.get(from) ?? []) keep.add(to);
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
        const key = `${vertex.id}→${to}:${path.length > 2 ? 'fold' : 'move'}`;
        const existing = edgeMap.get(key);
        if (existing) existing.paths.push(path);
        else
          edgeMap.set(key, {
            id: key,
            from: vertex.id,
            to,
            paths: [path],
            d: '',
            weight: 0.45,
            kind: byId.get(to)!.ply <= byId.get(vertex.id)!.ply ? 'return' : 'move',
          });
      }
    }
  const edges = [...edgeMap.values()];
  // Relative importance is normalized within one source only. Unsearched
  // continuations keep a neutral weight; a PV's root score isn't copied to them.
  const weights = new Map<string, number>();
  for (const [sourceId, result] of analysis) {
    const source = byId.get(sourceId);
    if (!source || !result.lines.length) continue;
    const played = (children.get(sourceId) ?? [])
      .map((id) => byId.get(id)!)
      .find((n) => n.played)?.uci;
    const retained = candidates(result, source.played ? played : undefined).filter(
      (line) => line.depth === result.depth,
    );
    const qualities = candidateQualities(retained, source.turn);
    for (const [i, line] of retained.entries()) {
      const child = (children.get(sourceId) ?? []).find(
        (id) => byId.get(id)?.uci === line.moves[0],
      );
      if (child) weights.set(child, qualities[i]);
    }
  }
  for (const edge of edges) {
    const qualities = edge.paths.map((path) => weights.get(path[1]));
    // A junction can carry differently evaluated histories. Only one unambiguous
    // local measurement gets a quantitative width; the route picker exposes each.
    if (qualities[0] !== undefined && qualities.every((q) => q === qualities[0]))
      edge.quality = qualities[0];
    edge.weight = edge.paths.some((path) => path.length > 2)
      ? diagramStyle.compressedWidth
      : edge.quality === undefined
        ? diagramStyle.neutralWidth
        : edge.quality / 10;
  }
  const { dot, names } = evolutionDot(shown, byId, edges);
  const result = await renderGraph(dot);
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
    // Graphviz's spline stops before its arrowhead. Use the published tip from
    // `pos` so our SVG marker reaches the node boundary instead of floating.
    const tip = rendered?.pos?.match(/^e,([\d.-]+),([\d.-]+)/);
    if (points?.length && tip)
      edge.d += ` L${(Number(tip[1]) + 18).toFixed(2)},${(bounds[3] - Number(tip[2]) + 18).toFixed(2)}`;
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
    const oldEdges = new Map(previous.edges.map((e) => [e.id, e]));
    for (const edge of edges)
      edge.d = oldEdges.get(edge.id)?.d ?? curve(byId.get(edge.from)!, byId.get(edge.to)!);
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
        const t = i / (path.length - 1);
        n.x = a.x + (b.x - a.x) * t;
        n.y = a.y + (b.y - a.y) * (3 * t * t - 2 * t * t * t);
      }
  }
  const recurrenceMap = new Map<string, EvolutionEdge>();
  for (const { from, to } of recurrences) {
    const a = byId.get(alias.get(from)!)!,
      b = byId.get(alias.get(to)!)!;
    const id = `recurrence:${a.id}→${b.id}`;
    const existing = recurrenceMap.get(id);
    if (existing) existing.paths.push([from, to]);
    else
      recurrenceMap.set(id, {
        id,
        from: a.id,
        to: b.id,
        paths: [[from, to]],
        kind: 'recurrence',
        weight: 0.6,
        d: `M${a.x},${a.y - 8}C${a.x},${Math.max(2, Math.min(a.y, b.y) - 28)} ${b.x},${Math.max(2, Math.min(a.y, b.y) - 28)} ${b.x},${b.y - 8}`,
      });
  }
  edges.push(...recurrenceMap.values());
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
