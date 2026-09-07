import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { instance } from '@viz-js/viz';
import { expect, it } from 'vitest';
import { evolutionDot } from '../src/lib/evolutionDot';
import type { EvolutionGraph } from '../src/types/game';

it('keeps Figure 7 alternatives on both sides without prescribing a mirrored fan', async () => {
  const fixture = JSON.parse(
    gunzipSync(
      readFileSync(new URL('../docs/research/deepblue-baseline-graph.json.gz', import.meta.url)),
    ).toString(),
  ) as { graph: EvolutionGraph };
  const graph = fixture.graph;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const viz = await instance();
  const directionCounts = (policy = {}) => {
    const { dot, names } = evolutionDot(graph.vertices, byId, graph.edges, policy);
    const rendered = viz.renderJSON(dot) as { objects: { name: string; pos: string }[] };
    const points = new Map(rendered.objects.map((o) => [o.name, o.pos.split(',').map(Number)]));
    const y = (id: string) => points.get(names.get(id)!)![1];
    const branches = graph.edges.filter((e) => byId.get(e.from)!.played && !byId.get(e.to)!.played);
    return {
      above: branches.filter((e) => y(e.to) > y(e.from) + 0.1).length,
      below: branches.filter((e) => y(e.to) < y(e.from) - 0.1).length,
    };
  };
  const grouped = directionCounts({
    groupPlayed: true,
    playedWeight: 40,
    branchWeight: 8,
    compressedWeight: 2,
  });
  expect(grouped.above).toBeLessThan(10);
  expect(grouped.below).toBeGreaterThan(300);
  const current = directionCounts();
  expect(current.above).toBeGreaterThan(100);
  expect(current.below).toBeGreaterThan(100);
  expect(graph.vertices).toHaveLength(1198); // unchanged independently captured topology
});
