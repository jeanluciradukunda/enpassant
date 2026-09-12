import { describe, expect, it } from 'vitest';
import { parseGame } from '../src/lib/games';
import { EvolutionBuilder } from '../src/lib/evolution';
import { toSan } from '../src/lib/san';
import { talPayload } from '../src/lib/tal';
import type { Analysis, EngineLine } from '../src/types/game';

const line = (rank: number, moves: string[], score: EngineLine['score']): EngineLine => ({
  rank,
  depth: 13,
  score,
  moves,
});
const search = (lines: EngineLine[], playedLine?: EngineLine): Analysis => ({
  lines,
  playedLine,
  depth: 13,
  milliseconds: 400,
  requestedDepth: 20,
  depthReached: false,
});

describe('SAN conversion', () => {
  it('names pieces from the position and does not cap the line', () => {
    const game = parseGame('1. e4 e5 *');
    const san = toSan(game.positions[2].fen, [
      'd1h5',
      'b8c6',
      'f1c4',
      'g7g6',
      'h5f3',
      'g8f6',
      'b1c3',
      'f8g7',
      'd2d3',
    ]);
    expect(san).toEqual(['Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'Nc3', 'Bg7', 'd3']);
  });
  it('stops at the first illegal move', () => {
    expect(toSan(parseGame('1. e4 *').positions[0].fen, ['e2e4', 'e2e4', 'e7e5'])).toEqual(['e4']);
  });
});

describe('Tal payload', () => {
  it('returns nothing for the root, which has no decision behind it', () => {
    const game = parseGame('1. e4 *');
    const builder = new EvolutionBuilder(game);
    expect(talPayload(game, builder.get('p0')!, undefined, undefined)).toBeNull();
  });

  it('marks a played move the engine did not shortlist and computes its loss for White', () => {
    const game = parseGame('[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. a3 e5 *');
    const builder = new EvolutionBuilder(game);
    const decision = search(
      ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'g2g3', 'b1c3', 'b2b3', 'f2f4'].map((m, i) =>
        line(i + 1, [m, 'e7e5'], { type: 'cp', value: 100 - 5 * i }),
      ),
      line(9, ['a2a3', 'e7e5', 'e2e4'], { type: 'cp', value: -80 }),
    );
    builder.append('p0', decision);
    const payload = talPayload(game, builder.get('p1')!, builder.get('p0'), decision)!;
    expect(payload.game).toMatchObject({ white: 'A', black: 'B', result: '*' });
    expect(payload.move).toMatchObject({
      number: 1,
      label: '1. a3',
      san: 'a3',
      movedBy: 'White',
      sideToMove: 'b',
      played: true,
      onlyMove: false,
    });
    expect(payload.engine).toMatchObject({ depth: 13, depthReached: false, requestedDepth: 20 });
    expect(payload.engine.candidates).toHaveLength(9);
    expect(payload.engine.candidates[0]).toEqual({
      san: 'e4',
      rank: 1,
      played: false,
      scoreCp: 100,
      mateIn: null,
      lineSan: ['e4', 'e5'],
    });
    expect(payload.engine.candidates.at(-1)).toMatchObject({ san: 'a3', rank: 9, played: true });
    expect(payload.computed).toEqual({ evalDeltaCp: 180, playedRank: 9, outsideTopEight: true });
  });

  it("signs Black's loss from Black's side and numbers Black's move correctly", () => {
    const game = parseGame('1. e4 a6 *');
    const builder = new EvolutionBuilder(game);
    const decision = search([
      line(1, ['d7d5', 'e4d5'], { type: 'cp', value: -20 }),
      line(2, ['e7e5', 'g1f3'], { type: 'cp', value: 10 }),
      line(3, ['a7a6', 'd2d4'], { type: 'cp', value: 60 }),
      line(4, ['h7h6', 'd2d4'], { type: 'cp', value: 70 }),
    ]);
    builder.append('p1', decision);
    const payload = talPayload(game, builder.get('p2')!, builder.get('p1'), decision)!;
    expect(payload.move).toMatchObject({
      number: 1,
      label: '1… a6',
      movedBy: 'Black',
      sideToMove: 'w',
    });
    expect(payload.computed).toEqual({ evalDeltaCp: 80, playedRank: 3, outsideTopEight: false });
  });

  it('describes an alternative the engine preferred, keeping the played flag on the real move', () => {
    const game = parseGame('1. e4 a6 *');
    const builder = new EvolutionBuilder(game);
    const decision = search([
      line(1, ['d7d5', 'e4d5', 'd8d5'], { type: 'cp', value: -20 }),
      line(2, ['e7e5', 'g1f3'], { type: 'cp', value: 10 }),
      line(3, ['a7a6', 'd2d4'], { type: 'cp', value: 60 }),
      line(4, ['h7h6', 'd2d4'], { type: 'cp', value: 70 }),
    ]);
    builder.append('p1', decision);
    const payload = talPayload(game, builder.get('p1/d7d5')!, builder.get('p1'), decision)!;
    expect(payload.move).toMatchObject({ san: 'd5', played: false, movedBy: 'Black' });
    expect(payload.engine.candidates.map((c) => [c.san, c.played])).toEqual([
      ['d5', false],
      ['e5', false],
      ['a6', true],
      ['h6', false],
    ]);
    expect(payload.computed).toEqual({ evalDeltaCp: 0, playedRank: 1, outsideTopEight: false });
  });

  it('keeps mate distances signed from White and leaves the centipawn delta empty', () => {
    const game = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    const builder = new EvolutionBuilder(game);
    const decision = search([
      line(1, ['h5f7'], { type: 'mate', value: 1 }),
      line(2, ['c4f7', 'e8e7'], { type: 'cp', value: 150 }),
      line(3, ['b1c3', 'f6h5'], { type: 'cp', value: 40 }),
      line(4, ['d2d3', 'f6h5'], { type: 'cp', value: 30 }),
    ]);
    builder.append('p6', decision);
    const payload = talPayload(game, builder.get('p7')!, builder.get('p6'), decision)!;
    expect(payload.move).toMatchObject({ san: 'Qxf7#', check: true, mate: true, movedBy: 'White' });
    expect(payload.engine.candidates[0]).toMatchObject({ san: 'Qxf7#', scoreCp: null, mateIn: 1 });
    expect(payload.computed).toEqual({ evalDeltaCp: null, playedRank: 1, outsideTopEight: false });
  });

  it('flags a single legal reply', () => {
    const game = parseGame('1. e4 e5 *');
    const builder = new EvolutionBuilder(game);
    const decision = search([line(1, ['e7e5'], { type: 'cp', value: 20 })]);
    builder.append('p1', decision);
    const node = { ...builder.get('p2')!, legalReplies: 1 };
    expect(talPayload(game, node, builder.get('p1'), decision)!.move.onlyMove).toBe(true);
  });
});
