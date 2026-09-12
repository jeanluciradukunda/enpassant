import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { EvolutionBuilder } from '../src/lib/evolution';
import { buildScene } from '../src/lib/graphScene';
import { parseGame } from '../src/lib/games';
import { unfoldGraph } from '../src/lib/unfold';
import { diagramStyle } from '../src/lib/diagramStyle';
import type { Analysis } from '../src/types/game';

beforeAll(() => vi.stubEnv('SSR', true));
afterAll(() => vi.unstubAllEnvs());

const analysis = (...paths: string[][]): Analysis => ({
  depth: 20,
  milliseconds: 400,
  lines: paths.map((moves, i) => ({
    moves,
    rank: i + 1,
    depth: 20,
    score: { type: 'cp', value: 100 - i * 50 },
  })),
});

it('describes visible glyphs, folded edges, isolation and hidden selections once for every renderer', async () => {
  const builder = new EvolutionBuilder(
    parseGame('[SetUp "1"]\n[FEN "6k1/8/8/8/8/8/8/Q5K1 w - - 0 1"]\n\n1. Kf1 Kf8 *'),
  );
  builder.append('p0', analysis(['a1a2', 'g8g7', 'a2g2', 'g7f6', 'g2f2'], ['a1b1', 'g8h8']));
  const graph = await builder.layout();
  const overview = buildScene({
    graph,
    cursor: 0,
    overview: true,
    selected: graph.byId.get('p0')!,
    isolated: false,
  });
  expect(overview.vertices.length).toBe(graph.vertices.length);
  const root = overview.vertices.find((v) => v.node.id === 'p0')!;
  expect(root.played).toBe(true);
  expect(root.label).toBe('01');
  expect(root.selected).toBe(true);
  expect(root.strokeWidth).toBe(1.65);
  const check = overview.vertices.find((v) => v.node.check)!;
  expect(check.event).toBe('supported');
  expect(check.fill).toBe('#fff');
  expect(check.stroke).toBe('#fff');
  const folded = overview.edges.find((e) => e.compressed)!;
  expect(folded.width).toBe(diagramStyle.compressedWidth);
  expect(folded.dash).toBe(diagramStyle.compressedDash);
  expect(folded.path.length).toBeGreaterThan(2);
  expect(overview.edges.every((e) => !e.dim)).toBe(true);
  expect(overview.selectedHidden).toBe(false);

  // Replay at the root hides every alternative and the second played move.
  const opening = buildScene({
    graph,
    cursor: 0,
    overview: false,
    selected: graph.byId.get('p0')!,
    isolated: false,
  });
  expect(opening.vertices).toHaveLength(1);
  expect(opening.edges).toHaveLength(0);

  // Selecting a folded position marks it without drawing a glyph.
  const hidden = graph.byId.get(folded.path[1])!;
  const inside = buildScene({
    graph,
    cursor: 0,
    overview: true,
    selected: hidden,
    isolated: false,
  });
  expect(inside.selectedHidden).toBe(true);
  expect(inside.vertices.some((v) => v.members.includes(hidden.id))).toBe(false);

  // Isolation dims glyphs and edges outside the selected occurrence's own lines.
  const alternative = graph.nodes.find((n) => !n.played && n.parent === 'p0')!;
  const isolated = buildScene({
    graph,
    cursor: 0,
    overview: true,
    selected: alternative,
    isolated: true,
  });
  expect(isolated.vertices.some((v) => !v.lit)).toBe(true);
  expect(isolated.vertices.find((v) => v.node.id === alternative.id)!.lit).toBe(true);
  expect(isolated.edges.some((e) => e.dim)).toBe(true);

  // Unfolding surfaces origins for the recovered glyphs.
  const open = unfoldGraph(graph, folded.path);
  const unfolded = buildScene({
    graph: open,
    cursor: 0,
    overview: true,
    selected: hidden,
    isolated: false,
  });
  const recovered = unfolded.vertices.find((v) => v.node.id === hidden.id)!;
  expect(recovered.origin).toEqual({
    x: graph.byId.get(hidden.id)!.x,
    y: graph.byId.get(hidden.id)!.y,
  });
  expect(unfolded.edges.some((e) => e.edge.id.startsWith('unfold:'))).toBe(true);
});

it('keeps unchanged glyphs and edges referentially stable across rebuilds', async () => {
  const builder = new EvolutionBuilder(
    parseGame('[SetUp "1"]\n[FEN "6k1/8/8/8/8/8/8/Q5K1 w - - 0 1"]\n\n1. Kf1 Kf8 *'),
  );
  builder.append('p0', analysis(['a1a2', 'g8g7', 'a2g2', 'g7f6', 'g2f2'], ['a1b1', 'g8h8']));
  const graph = await builder.layout();
  const input = {
    graph,
    cursor: 0,
    overview: true,
    selected: graph.byId.get('p0')!,
    isolated: false,
  };
  const first = buildScene(input);
  const same = buildScene(input, first);
  expect(same.vertices.every((v, i) => v === first.vertices[i])).toBe(true);
  expect(same.edges.every((e, i) => e === first.edges[i])).toBe(true);
  // Moving the selection only rebuilds the two glyphs whose ring changes.
  const moved = buildScene({ ...input, selected: graph.byId.get('p1')! }, first);
  const changed = moved.vertices.filter((v) => !first.vertices.includes(v));
  expect(changed.map((v) => v.node.id).sort()).toEqual(['p0', 'p1']);
  expect(moved.edges.every((e) => first.edges.includes(e))).toBe(true);
  // Isolation dims edges, so dimmed ones are new objects and lit ones are reused.
  const isolated = buildScene({ ...input, isolated: true }, first);
  expect(isolated.edges.some((e) => e.dim && !first.edges.includes(e))).toBe(true);
  expect(isolated.edges.some((e) => !e.dim && first.edges.includes(e))).toBe(true);
});
