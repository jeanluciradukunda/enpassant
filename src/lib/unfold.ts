import type { EvolutionGraph, EvolutionEdge } from '../types/game';

/** Open one occurrence path inside the graph, keeping every published junction
 * fixed. A clear strip below the map leaves room for each hidden half-move. */
export function unfoldGraph(graph: EvolutionGraph, path: string[] | null): EvolutionGraph {
  if (!path || path.length < 3 || path.some((id) => !graph.byId.has(id))) return graph;
  const match = (other: string[]) =>
    other.length === path.length && other.every((id, i) => id === path[i]);
  const original = graph.edges.find((edge) => edge.kind !== 'recurrence' && edge.paths.some(match));
  if (!original) return graph;
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const y = Math.max(...graph.vertices.map((v) => byId.get(v.id)!.y)) + 32;
  const start = byId.get(path[0])!;
  for (let i = 1; i < path.length - 1; i++)
    Object.assign(byId.get(path[i])!, { x: start.x + i * 16, y });
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
      weight: i === 1 ? original.weight : 0.38,
      quality: i === 1 ? original.quality : undefined,
    };
    edges.push(edge);
  }
  return {
    ...graph,
    nodes,
    byId,
    edges,
    vertices: [...graph.vertices, ...path.slice(1, -1).map((id) => ({ id, members: [id] }))],
    width: Math.max(graph.width, ...path.map((id) => byId.get(id)!.x + 25)),
    height: Math.max(graph.height, y + 20),
  };
}
