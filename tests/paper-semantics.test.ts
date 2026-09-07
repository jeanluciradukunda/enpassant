import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame } from '../src/lib/games';
import { EvolutionBuilder, descendants } from '../src/lib/evolution';
import { candidates, candidateQualities, eventFill, positionKey } from '../src/lib/semantics';
import { scoreBands, scoreY } from '../src/lib/scoreBands';
import { unfoldGraph } from '../src/lib/unfold';
import type { Analysis } from '../src/types/game';
const result = (paths: string[][], scores = paths.map((_, i) => 100 - 20 * i)): Analysis => ({
  depth: 20,
  milliseconds: 400,
  lines: paths.map((moves, i) => ({
    rank: i + 1,
    depth: 20,
    score: { type: 'cp', value: scores[i] },
    moves,
  })),
});
const choices = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'g2g3', 'b1c3', 'b2b3', 'f2f4'].map((m) => [m]);

describe('analysis and visible evidence', () => {
  it('keeps four, then through the played rank, then eight plus a separately searched played continuation', async () => {
    const analysis = result(choices);
    expect(candidates(analysis, 'e2e4')).toHaveLength(4);
    expect(candidates(analysis, 'b2b3')).toHaveLength(7);
    analysis.playedLine = {
      rank: 9,
      depth: 20,
      score: { type: 'cp', value: -80 },
      moves: ['a2a3', 'e7e5', 'e2e4'],
    };
    expect(candidates(analysis, 'a2a3')).toHaveLength(9);
    const builder = new EvolutionBuilder(parseGame('1. a3 d5 *'));
    builder.append('p0', analysis);
    const graph = await builder.layout();
    expect(graph.byId.get('p1/e7e5')?.moves).toEqual(['a2a3', 'e7e5']);
    const actual = graph.edges.find((e) => e.from === 'p0' && e.to === 'p1')!;
    expect(actual.quality).toBe(1);
    expect(actual.weight).toBe(0.1); // played status must not inflate quality
  });
  it('replaces stale search paths while retaining an independently explored branch and its legal ancestors', async () => {
    const builder = new EvolutionBuilder(parseGame('1. e4 e5 *'));
    builder.append(
      'p0',
      result([
        ['d2d4', 'd7d5', 'c2c4'],
        ['g1f3', 'g8f6'],
      ]),
    );
    builder.append('p0/d2d4', result([['g8f6', 'c2c4']]));
    builder.append('p0', result([['b1c3', 'b8c6']]));
    const graph = await builder.layout();
    expect(graph.byId.has('p0/g1f3')).toBe(false);
    expect(graph.byId.has('p0/d2d4/d7d5')).toBe(false);
    expect(graph.byId.has('p0/d2d4/g8f6/c2c4')).toBe(true);
    for (const n of graph.nodes) {
      const chess = new Chess();
      n.moves.forEach((m) => chess.move(m));
      expect(chess.fen()).toBe(n.fen);
    }
  });
  it('does not assign a PV root evaluation to its later checks, and terminal draw wins over check fill', () => {
    const builder = new EvolutionBuilder(parseGame('1. d4 d5 *'));
    builder.append('p0', result([['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7']]));
    const check = builder.get('p0/e2e4/e7e5/d1h5/b8c6/h5f7')!;
    expect(check.check).toBe(true);
    expect(check.checkQuality).toBe('unassessed');
    expect(eventFill(check)).toBe('#9dcd9b');
    const game = parseGame(
      '[SetUp "1"]\n[FEN "4r2k/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Kf1 Rf8+ 2. Ke1 Re8+ 3. Kf1 Rf8+ 4. Ke1 Re8+ 1/2-1/2',
    );
    const drawn = new EvolutionBuilder(game).get('p8')!;
    expect(drawn.check && drawn.draw).toBe(true);
    expect(eventFill(drawn)).toBe('#7f7f7f');
  });
  it('uses a transparent local check proxy with an explicit unknown state for mismatched depths', () => {
    const game = parseGame('1. e4 e5 2. Qh5 Nc6 3. Qxf7+ *');
    const builder = new EvolutionBuilder(game);
    const analysis = result([['h5e2'], ['h5f7']], [20, -100]);
    builder.append('p4', analysis);
    expect(builder.get('p5')?.checkQuality).toBe('inferior');
    analysis.lines[1].score.value = 0;
    builder.append('p4', analysis);
    expect(builder.get('p5')?.checkQuality).toBe('supported');
    analysis.lines[1].depth = 12;
    builder.append('p4', analysis);
    expect(builder.get('p5')?.checkQuality).toBe('unassessed');
  });
  it('normalizes quality within a retained sibling set, for either side, including equal and one-cp gaps', () => {
    expect(candidateQualities(result(choices.slice(0, 2), [1, 0]).lines, 'w')).toEqual([30, 1]);
    expect(candidateQualities(result(choices.slice(0, 2), [1, 0]).lines, 'b')).toEqual([1, 30]);
    expect(candidateQualities(result(choices.slice(0, 2), [0, 0]).lines, 'w')).toEqual([
      15.5, 15.5,
    ]);
  });
  it('uses the same retained candidates in the band and compares the played move at that same root', () => {
    const game = parseGame('1. e4 e5 *');
    const root = result(choices, [100, 80, 60, 40, -50, -100, -150, -200]);
    const bands = scoreBands(
      game,
      new Map([
        ['p0', root],
        ['p1', result([['c7c5']], [900])],
      ]),
      2,
    );
    const point = bands[0].segments[0]!;
    expect(point.actual.value).toBe(100);
    expect(point.low).toBe(scoreY({ type: 'cp', value: 40 }));
    expect(bands[1].segments[0]).toBeNull(); // no evaluation of played e5, never invent one
  });
});

describe('position relationships and unfolding', () => {
  it('preserves rights in identity, while allowing clock differences to share a display junction', () => {
    const fen = new Chess().fen();
    expect(positionKey({ fen })).toBe(positionKey({ fen: fen.replace('0 1', '8 5') }));
    expect(positionKey({ fen })).not.toBe(positionKey({ fen: fen.replace('KQkq', '-') }));
    expect(positionKey({ fen })).not.toBe(positionKey({ fen: fen.replace(' - ', ' e3 ') }));
    expect(positionKey({ fen })).not.toBe(positionKey({ fen: fen.replace(' w ', ' b ') }));
  });
  it('draws recurrence back links while retaining each played instant, full history and draw state', async () => {
    const game = parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2');
    const builder = new EvolutionBuilder(game);
    const graph = await builder.layout();
    expect(graph.edges.find((e) => e.kind === 'recurrence' && e.from === 'p8')?.to).toBe('p4');
    expect(graph.vertices).toHaveLength(9);
    expect(graph.byId.get('p4')!.draw).toBe(false);
    expect(graph.byId.get('p8')!.draw).toBe(true);
    expect(descendants(graph, 'p4').has('p0')).toBe(false);
    for (let i = 1; i < game.positions.length; i++)
      expect(graph.byId.get(`p${i}`)!.x).toBeGreaterThan(graph.byId.get(`p${i - 1}`)!.x);
  });
  it('unfolds real hidden moves inside the graph without moving existing junctions or mutating analysis geometry', async () => {
    const builder = new EvolutionBuilder(parseGame('1. e4 e5 *'));
    builder.append('p0', result([['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3']]));
    const graph = await builder.layout();
    const path = graph.edges.find((e) => e.paths[0].length > 2)!.paths[0];
    const open = unfoldGraph(graph, path);
    const shown = new Set(open.vertices.flatMap((v) => v.members));
    expect(path.every((id) => shown.has(id))).toBe(true);
    expect(open.edges.filter((e) => e.id.startsWith('unfold:'))).toHaveLength(path.length - 1);
    for (const v of graph.vertices)
      expect([open.byId.get(v.id)!.x, open.byId.get(v.id)!.y]).toEqual([
        graph.byId.get(v.id)!.x,
        graph.byId.get(v.id)!.y,
      ]);
    expect(open.byId.get(path[1])!.y).not.toBe(graph.byId.get(path[1])!.y);
    expect(unfoldGraph(graph, null)).toBe(graph);
  });
});

it('distinguishes a search/display endpoint from mate or a forced legal reply', async () => {
  const forced = parseGame('[SetUp "1"]\n[FEN "7k/R7/5K2/8/8/8/8/8 b - - 0 1"]\n\n1... Kg8 *');
  expect(forced.positions[0].legalReplies).toBe(1);
  const builder = new EvolutionBuilder(parseGame('1. d4 d5 *'));
  expect(builder.get('p0')!.legalReplies).toBe(20);
  const line = result([['f2f3', 'e7e5', 'g2g4', 'd8h4']]);
  line.lines[0].score = { type: 'mate', value: -2 };
  builder.append('p0', line, 3);
  const end = builder.get('p0/f2f3/e7e5/g2g4')!;
  expect(end.mate).toBe(false);
  expect(end.continuationEnd).toBe('display-limit');
  expect((await builder.layout()).nodes.some((n) => n.mate)).toBe(false);
  builder.append('p0', line, 20);
  expect(builder.get('p0/f2f3/e7e5/g2g4/d8h4')!.mate).toBe(true);
});

it('merges same-ply transpositions with different halfmove clocks while preserving both legal histories', async () => {
  const builder = new EvolutionBuilder(parseGame('1. e4 e5 *'));
  builder.append(
    'p0',
    result([
      ['g1f3', 'g8f6', 'g2g3', 'g7g6'],
      ['g2g3', 'g7g6', 'g1f3', 'g8f6'],
    ]),
  );
  const graph = await builder.layout();
  const junction = graph.vertices.find((v) => v.members.length > 1)!;
  const [a, b] = junction.members.map((id) => graph.byId.get(id)!);
  expect(a.fen).not.toBe(b.fen);
  expect(positionKey(a)).toBe(positionKey(b));
  for (const n of [a, b]) {
    const chess = new Chess();
    n.moves.forEach((m) => chess.move(m));
    expect(chess.fen()).toBe(n.fen);
  }
});
