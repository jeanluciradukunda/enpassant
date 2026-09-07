import type { EvolutionGraph, EvolutionEdge } from '../types/game';

/** Open one occurrence path inside the graph, keeping every published junction
 * fixed. Search nearby rows for space, so the recovered moves stay with their
 * branch. Only a crowded neighborhood needs extra space outside the map. */
export function unfoldGraph(graph: EvolutionGraph, path: string[] | null): EvolutionGraph {
  if (!path || path.length < 3 || path.some((id) => !graph.byId.has(id))) return graph;
  const match = (other: string[]) =>
    other.length === path.length && other.every((id, i) => id === path[i]);
  const original = graph.edges.find((edge) => edge.kind !== 'recurrence' && edge.paths.some(match));
  if (!original) return graph;
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = byId.get(path[0])!;
  const end = byId.get(path.at(-1)!)!;
  const count = path.length - 2;
  const rowWidth = (count - 1) * 16;
  const left = Math.max(14, (start.x + end.x - rowWidth) / 2);
  const preferredY = (start.y + end.y) / 2;
  const obstacles = graph.vertices.map((v) => byId.get(v.id)!);
  let y = preferredY,
    best = Infinity;
  // Minimize collisions first, then distance from the selected branch. All
  // existing anchors and their routes stay fixed; closing is an exact restore.
  for (let step = 0; step <= Math.ceil(graph.height / 16) + 4; step++) {
    for (const sign of step ? [-1, 1] : [1]) {
      const candidate = preferredY + sign * step * 16;
      if (candidate < 14) continue;
      const collisions = obstacles.filter(
        (n) =>
          n.x > left - 14 &&
          n.x < left + rowWidth + 14 &&
          Math.abs(n.y - candidate) < (n.played ? 17 : 12),
      ).length;
      const score = collisions * 100000 + step;
      if (score < best) {
        best = score;
        y = candidate;
      }
    }
    if (best < 100000) break;
  }
  const unfoldOrigins: NonNullable<EvolutionGraph['unfoldOrigins']> = {};
  for (let i = 1; i < path.length - 1; i++) {
    const node = byId.get(path[i])!;
    unfoldOrigins[node.id] = { x: node.x, y: node.y };
    Object.assign(node, { x: left + (i - 1) * 16, y });
  }
  const edges = graph.edges.flatMap((edge) => {
    if (edge !== original) return [edge];
    const paths = edge.paths.filter((p) => !match(p));
    return paths.length ? [{ ...edge, paths }] : [];
  });
  for (let i = 1; i < path.length; i++) {
    const a = byId.get(path[i - 1])!,
      b = byId.get(path[i])!;
    const edge: EvolutionEdge = {
      id: `unfold:${a.id}→${b.id}`,
      from: a.id,
      to: b.id,
      paths: [[a.id, b.id]],
      d: `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`,
      weight: i === 1 && original.quality !== undefined ? original.quality / 10 : 0.38,
      quality: i === 1 ? original.quality : undefined,
    };
    edges.push(edge);
  }
  return {
    ...graph,
    nodes,
    byId,
    edges,
    unfoldOrigins,
    vertices: [...graph.vertices, ...path.slice(1, -1).map((id) => ({ id, members: [id] }))],
    width: Math.max(graph.width, ...path.map((id) => byId.get(id)!.x + 25)),
    height: Math.max(graph.height, y + 20),
  };
}
