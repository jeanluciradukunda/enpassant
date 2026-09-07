// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Chess } from 'chess.js';
import { EvolutionBuilder, continuationFocus } from '../src/lib/evolution';
import { layoutEvolution } from '../src/lib/evolutionLayout';
import { parseGame } from '../src/lib/games';
import { unfoldGraph } from '../src/lib/unfold';
import { EvolutionMarks } from '../src/components/EvolutionMarks';
import { diagramStyle } from '../src/lib/diagramStyle';
import type { Analysis, EvolutionGraph } from '../src/types/game';

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
const marks = (graph: EvolutionGraph, selected = 'p0', isolated = false) => {
  const element = document.createElement('div');
  element.innerHTML = renderToStaticMarkup(
    createElement(
      'svg',
      {},
      createElement(EvolutionMarks, {
        graph,
        cursor: 0,
        overview: true,
        selected: graph.byId.get(selected)!,
        isolated,
        onSelect: () => {},
      }),
    ),
  );
  return element;
};

it('folds quiet replies between same-side checks, while the caption policy keeps them recoverable', async () => {
  const builder = new EvolutionBuilder(
    parseGame('[SetUp "1"]\n[FEN "6k1/8/8/8/8/8/8/Q5K1 w - - 0 1"]\n\n1. Kf1 *'),
  );
  builder.append('p0', analysis(['a1a2', 'g8g7', 'a2g2', 'g7f6', 'g2f2']));
  const graph = await builder.layout();
  const checks = graph.nodes.filter((n) => n.check);
  expect(checks).toHaveLength(3);
  const path = graph.edges.find((e) => e.from === checks[0].id && e.to === checks[1].id)!.paths[0];
  expect(path.map((id) => graph.byId.get(id)!.san)).toEqual(['Qa2+', 'Kg7', 'Qg2+']);
  expect(graph.vertices.some((v) => v.members.includes(path[1]))).toBe(false);
  const literal = await layoutEvolution(graph.nodes, new Map(), undefined, {
    compression: 'neighbors',
  });
  expect(literal.vertices.some((v) => v.members.includes(path[1]))).toBe(true);
  const open = unfoldGraph(graph, path);
  expect(open.vertices.some((v) => v.id === path[1])).toBe(true);
  expect(Math.abs(open.byId.get(path[1])!.y - checks[0].y)).toBeLessThan(40);
  for (const v of graph.vertices) expect(open.byId.get(v.id)).toEqual(graph.byId.get(v.id));
  const doc = marks(graph);
  const event = doc.querySelector(`[data-position="${checks[0].id}"] rect`)!;
  expect(event.getAttribute('fill')).toBe('#fff');
  expect(event.getAttribute('stroke')).toBe('#fff');
  expect(Number(event.getAttribute('width'))).toBe(diagramStyle.circleRadius);
  for (const edge of doc.querySelectorAll('[data-compressed="true"]')) {
    expect(edge.getAttribute('stroke-width')).toBe('2.345');
    expect(edge.getAttribute('stroke-dasharray')).toBe('0.2345 1.1725');
  }
  expect(checks[0].checkQuality).toBe('supported');
  expect(checks.slice(1).every((n) => n.checkQuality === 'unassessed')).toBe(true);
});

it('redirects real predicted return paths into a shared draw glyph without terminalizing the earlier history', async () => {
  const game = parseGame('1. e4 e5 *');
  const builder = new EvolutionBuilder(game);
  builder.append(
    'p0',
    analysis(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'], ['d2d4', 'd7d5']),
  );
  const graph = await builder.layout();
  const root = graph.vertices.find((v) => v.id === 'p0')!;
  expect(root.members).toHaveLength(3);
  expect(graph.byId.get('p0')!.draw).toBe(false);
  expect(root.members.some((id) => graph.byId.get(id)!.draw)).toBe(true);
  expect(graph.edges.some((e) => e.kind === 'return' && e.to === 'p0')).toBe(true);
  expect(graph.edges.some((e) => e.kind === 'recurrence')).toBe(false);
  for (const edge of graph.edges)
    for (const path of edge.paths) {
      for (let i = 1; i < path.length; i++)
        expect(graph.byId.get(path[i])!.parent).toBe(path[i - 1]);
    }
  for (const node of graph.nodes) {
    const chess = new Chess(game.initialFen);
    node.moves.forEach((move) => chess.move(move));
    expect(chess.fen()).toBe(node.fen);
    expect([node.x, node.y].every(Number.isFinite)).toBe(true);
  }
  const doc = marks(graph);
  expect(doc.querySelector('[data-position="p0"] circle[fill="#7f7f7f"]')).not.toBeNull();
  expect(graph.edges.some((e) => e.from === 'p0' && e.to === 'p1')).toBe(true);
});

it('focuses the selected search without leaking across a later played root or a shared glyph', async () => {
  const builder = new EvolutionBuilder(parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *'));
  builder.append('p0', analysis(['e2e4', 'e7e5', 'g1f3'], ['b1c3', 'b8c6']));
  builder.append('p3', analysis(['b8c6', 'f1c4', 'g8f6']));
  const graph = await builder.layout();
  expect(continuationFocus(graph, 'p0').nodes.has('p3')).toBe(true);
  expect(continuationFocus(graph, 'p0').nodes.has('p4')).toBe(false);
  expect(continuationFocus(graph, 'p2').nodes.has('p4')).toBe(false);
  expect(continuationFocus(graph, 'p3').nodes.has('p4')).toBe(true);
  const doc = marks(graph, 'p0', true);
  const nextEdge = graph.edges.find((e) => e.from === 'p3' && e.to === 'p4')!;
  expect(
    doc.querySelector(`[data-edge="${nextEdge.id}"]`)!.parentElement!.getAttribute('opacity'),
  ).toBe('0.1');
});

it('keeps raw retention, merging and compression independently inspectable on identical legal input', async () => {
  const builder = new EvolutionBuilder(parseGame('1. e4 e5 *'));
  builder.append(
    'p0',
    analysis(['g1f3', 'g8f6', 'b1c3', 'b8c6'], ['b1c3', 'b8c6', 'g1f3', 'g8f6']),
  );
  const final = await builder.layout();
  const raw = await layoutEvolution(final.nodes, new Map(), undefined, {
    merging: 'none',
    compression: 'none',
  });
  const merged = await layoutEvolution(final.nodes, new Map(), undefined, { compression: 'none' });
  expect(raw.vertices.length).toBeGreaterThan(merged.vertices.length);
  expect(merged.vertices.length).toBeGreaterThan(final.vertices.length);
  expect(raw.nodes.map((n) => n.fen)).toEqual(final.nodes.map((n) => n.fen));
});
