import { describe, expect, it } from 'vitest';
import { EvolutionBuilder } from '../src/lib/evolution';
import { parseGame } from '../src/lib/games';
import { getAnalysis, getPath, getPosition, runTool, type TalContext } from '../src/lib/talTools';
import type { Analysis } from '../src/types/game';

const context = (
  pgn: string,
  analysis = new Map<string, Analysis>(),
): TalContext & { builder: EvolutionBuilder } => {
  const game = parseGame(pgn);
  const builder = new EvolutionBuilder(game);
  for (const [id, result] of analysis) builder.append(id, result);
  return { game, builder, node: (id) => builder.get(id), analysis };
};

describe('getPosition recovers piece identity', () => {
  it('names every piece on its square and the piece that just moved', () => {
    const ctx = context('1. e4 e5 2. Nf3 *');
    const position = getPosition(ctx, 'p3');
    expect(position).toMatchObject({
      label: '2. Nf3',
      sideToMove: 'Black',
      check: false,
      legalReplies: 29,
      lastMove: { san: 'Nf3', by: 'White', piece: 'knight', from: 'g1', to: 'f3', captured: null },
    });
    expect(position.placement?.White).toContainEqual({ piece: 'knight', square: 'f3' });
    expect(position.placement?.White).toContainEqual({ piece: 'pawn', square: 'e4' });
    expect(position.placement?.White).not.toContainEqual({ piece: 'knight', square: 'g1' });
    expect(position.placement?.Black).toHaveLength(16);
  });
  it('records captures, castling and promotion from the replayed move', () => {
    const ctx = context('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. Nf3 Nf6 5. Be2 Bg4 6. O-O *');
    expect(getPosition(ctx, 'p3').lastMove).toMatchObject({
      piece: 'pawn',
      captured: 'pawn',
      to: 'd5',
    });
    expect(getPosition(ctx, 'p4').lastMove).toMatchObject({
      piece: 'queen',
      captured: 'pawn',
      by: 'Black',
    });
    expect(getPosition(ctx, 'p11').lastMove).toMatchObject({
      san: 'O-O',
      castled: 'kingside',
      piece: 'king',
    });
    const promo = context('1. e4 d5 2. e5 d4 3. e6 d3 4. exf7+ Kd7 5. fxg8=N *');
    expect(getPosition(promo, 'p9').lastMove).toMatchObject({
      promotion: 'knight',
      captured: 'knight',
    });
    expect(getPosition(promo, 'p9').placement?.White).toContainEqual({
      piece: 'knight',
      square: 'g8',
    });
  });
  it('works for predicted nodes, whose history is the full move list', () => {
    const analysis: Analysis = {
      depth: 13,
      milliseconds: 400,
      lines: [{ rank: 1, depth: 13, score: { type: 'cp', value: 20 }, moves: ['d2d4', 'd7d5'] }],
    };
    const ctx = context('1. e4 e5 *', new Map([['p0', analysis]]));
    const alt = getPosition(ctx, 'p0/d2d4/d7d5');
    expect(alt).toMatchObject({ played: false, sideToMove: 'White' });
    expect(alt.placement?.White).toContainEqual({ piece: 'pawn', square: 'd4' });
    expect(alt.placement?.White).not.toContainEqual({ piece: 'pawn', square: 'e4' });
    expect(getPath(ctx, 'p0/d2d4/d7d5')).toEqual({
      nodeId: 'p0/d2d4/d7d5',
      plies: 2,
      movesSan: ['d4', 'd5'],
      divergesFromGameAtPly: 1,
    });
  });
});

describe('the other read tools', () => {
  it('reports the decision behind a move and the retained replies from it', () => {
    const decision: Analysis = {
      depth: 13,
      milliseconds: 400,
      lines: [
        { rank: 1, depth: 13, score: { type: 'cp', value: 30 }, moves: ['e2e4', 'e7e5'] },
        { rank: 2, depth: 13, score: { type: 'cp', value: 10 }, moves: ['d2d4', 'd7d5'] },
        { rank: 3, depth: 13, score: { type: 'cp', value: 5 }, moves: ['g1f3'] },
        { rank: 4, depth: 13, score: { type: 'cp', value: 0 }, moves: ['c2c4'] },
      ],
    };
    const replies: Analysis = {
      depth: 12,
      milliseconds: 400,
      lines: [{ rank: 1, depth: 12, score: { type: 'cp', value: 25 }, moves: ['e7e5', 'g1f3'] }],
    };
    const ctx = context(
      '1. d4 *',
      new Map([
        ['p0', decision],
        ['p1', replies],
      ]),
    );
    const result = getAnalysis(ctx, 'p1');
    expect(result.decision?.computed).toEqual({
      evalDeltaCp: 20,
      playedRank: 2,
      outsideTopEight: false,
    });
    expect(result.decision?.engine.candidates[1]).toMatchObject({ san: 'd4', played: true });
    expect(result.repliesFromHere).toMatchObject({
      depth: 12,
      candidates: [{ san: 'e5', scoreCp: 25 }],
    });
    expect(getPath(ctx, 'p1').movesSan).toEqual(['d4']);
    expect(runTool(ctx, 'getGame', {})).toMatchObject({ plies: 1, analysedPlayedPositions: 2 });
    expect(runTool(ctx, 'getPosition', { nodeId: 'nope' })).toEqual({ error: 'No node nope' });
  });
});
