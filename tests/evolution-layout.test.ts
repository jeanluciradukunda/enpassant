import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame } from '../src/lib/games';
import { EvolutionBuilder, descendants, visibleAt } from '../src/lib/evolution';
import { scoreBands, scoreY } from '../src/lib/scoreBands';
import type { Analysis } from '../src/types/game';
const result = (paths: string[][]): Analysis => ({
  depth: 12,
  milliseconds: 400,
  lines: paths.map((moves, i) => ({
    rank: i + 1,
    depth: 12,
    score: { type: 'cp', value: 40 - i * 20 },
    moves,
  })),
});

describe('paper display graph', () => {
  it('merges display junctions without conflating the legal occurrence histories', async () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const builder = new EvolutionBuilder(game);
    builder.append(
      'p0',
      result([
        ['g1f3', 'g8f6', 'b1c3', 'b8c6'],
        ['b1c3', 'b8c6', 'g1f3', 'g8f6'],
      ]),
    );
    const graph = await builder.layout();
    const junction = graph.vertices.find((v) => v.members.length === 2)!;
    expect(junction).toBeDefined();
    const [a, b] = junction.members.map((id) => graph.byId.get(id)!);
    expect(a.fen).toBe(b.fen);
    expect(a.moves).not.toEqual(b.moves);
    expect(descendants(graph, a.id).has(b.id)).toBe(false);
    expect(graph.edges.filter((edge) => edge.to === junction.id)).toHaveLength(2);
    for (const n of graph.nodes) {
      const chess = new Chess(game.initialFen);
      for (const move of n.moves) chess.move(move);
      expect(chess.fen()).toBe(n.fen);
    }
  });
  it('shortens quiet chains and preserves played nodes, events and their neighbors', async () => {
    const game = parseGame('1. d4 d5 2. c4 e6 *');
    const builder = new EvolutionBuilder(game);
    builder.append('p0', result([['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']]));
    const graph = await builder.layout();
    const shown = new Set(graph.vertices.flatMap((v) => v.members));
    expect(graph.edges.some((e) => e.paths.some((p) => p.length > 2))).toBe(true);
    for (const node of graph.nodes) {
      if (node.played || node.check || node.mate) expect(shown.has(node.id)).toBe(true);
      if (node.check && node.parent) expect(shown.has(node.parent)).toBe(true);
    }
    const mate = graph.nodes.find((n) => n.mate)!;
    expect(mate).toBeDefined();
    expect(graph.byId.get(mate.id)?.san).toBe('Qxf7#');
  });
  it('keeps published node locations and replay membership stable when a search adds branches', async () => {
    const builder = new EvolutionBuilder(parseGame('1. e4 e5 2. Nf3 Nc6 *'));
    builder.append('p0', result([['g1f3', 'g8f6', 'b1c3', 'b8c6']]));
    const before = await builder.layout();
    builder.append('p0/g1f3', result([['d7d5', 'g2g3', 'g8f6', 'f1g2']]));
    const after = await builder.layout();
    for (const vertex of before.vertices) {
      const old = before.byId.get(vertex.id)!;
      const next = after.byId.get(vertex.id)!;
      expect([next.x, next.y]).toEqual([old.x, old.y]);
    }
    expect(after.nodes.length).toBeGreaterThan(before.nodes.length);
    expect(after.nodes.filter((n) => visibleAt(n, 0, false)).map((n) => n.id)).toEqual(['p0']);
    expect(after.nodes.filter((n) => n.played && visibleAt(n, 1, false))).toHaveLength(2);
  });
});

describe('paper score bands', () => {
  it('uses each player’s perspective and actual searched ranges, with no invented points', () => {
    expect(scoreY({ type: 'cp', value: 100 }, 'w')).toBeLessThan(83);
    expect(scoreY({ type: 'cp', value: 100 }, 'b')).toBeGreaterThan(83);
    const game = parseGame('1. e4 e5 *');
    const values = new Map([
      ['p0', result([['e2e4'], ['d2d4']])],
      ['p1', result([['c7c5']])],
    ]);
    const bands = scoreBands(game, values, 2);
    expect(bands[0].segments[0]?.actual.value).toBe(40);
    expect(bands[0].segments[0]?.low).toBeGreaterThan(bands[0].segments[0]!.high);
    expect(bands[1].segments[0]).toBeNull();
  });
});
