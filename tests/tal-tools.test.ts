import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EvolutionBuilder } from '../src/lib/evolution';
import { parseGame } from '../src/lib/games';
import { TAL_GAMES } from '../src/lib/studyGames';
import {
  getAnalysis,
  getPath,
  getPosition,
  hasEngineData,
  nearestAnalysed,
  runTool,
  type TalContext,
} from '../src/lib/talTools';
import type { Analysis } from '../src/types/game';

type Position = {
  placement?: Record<'White' | 'Black', { piece: string; square: string }[]>;
} & Record<string, unknown>;
const context = (pgn: string, analysis = new Map<string, Analysis>()): TalContext => {
  const game = parseGame(pgn);
  const builder = new EvolutionBuilder(game);
  for (const [id, result] of analysis) builder.append(id, result);
  return { game, node: (id) => builder.get(id), analysis };
};
const position = (ctx: TalContext, id: string) => getPosition(ctx, id).result as Position;

describe('getPosition recovers piece identity', () => {
  it('names every piece on its square and the piece that just moved', () => {
    const ctx = context('1. e4 e5 2. Nf3 *');
    const pos = position(ctx, 'p3');
    expect(pos).toMatchObject({
      label: '2. Nf3',
      sideToMove: 'Black',
      check: false,
      legalReplies: 29,
      lastMove: { san: 'Nf3', by: 'White', piece: 'knight', from: 'g1', to: 'f3', captured: null },
    });
    expect(pos.placement?.White).toContainEqual({ piece: 'knight', square: 'f3' });
    expect(pos.placement?.White).toContainEqual({ piece: 'pawn', square: 'e4' });
    expect(pos.placement?.White).not.toContainEqual({ piece: 'knight', square: 'g1' });
    expect(pos.placement?.Black).toHaveLength(16);
  });
  it('records captures, castling and promotion from the replayed move', () => {
    const ctx = context('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. Nf3 Nf6 5. Be2 Bg4 6. O-O *');
    expect(position(ctx, 'p3').lastMove).toMatchObject({
      piece: 'pawn',
      captured: 'pawn',
      to: 'd5',
    });
    expect(position(ctx, 'p4').lastMove).toMatchObject({
      piece: 'queen',
      captured: 'pawn',
      by: 'Black',
    });
    expect(position(ctx, 'p11').lastMove).toMatchObject({
      san: 'O-O',
      castled: 'kingside',
      piece: 'king',
    });
    const promo = context('1. e4 d5 2. e5 d4 3. e6 d3 4. exf7+ Kd7 5. fxg8=N *');
    expect(position(promo, 'p9').lastMove).toMatchObject({
      promotion: 'knight',
      captured: 'knight',
    });
    expect(position(promo, 'p9').placement?.White).toContainEqual({
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
    const alt = position(ctx, 'p0/d2d4/d7d5');
    expect(alt).toMatchObject({ played: false, sideToMove: 'White' });
    expect(alt.placement?.White).toContainEqual({ piece: 'pawn', square: 'd4' });
    expect(alt.placement?.White).not.toContainEqual({ piece: 'pawn', square: 'e4' });
    expect(getPath(ctx, 'p0/d2d4/d7d5').result).toEqual({
      nodeId: 'p0/d2d4/d7d5',
      plies: 2,
      movesSan: ['d4', 'd5'],
      divergesFromGameAtPly: 1,
    });
  });
  it('flags unknown nodes as errors rather than data', () => {
    const ctx = context('1. e4 *');
    expect(runTool(ctx, 'getPosition', { nodeId: 'p999' })).toEqual({
      result: { error: 'No node p999' },
      isError: true,
    });
    expect(runTool(ctx, 'nope', {}).isError).toBe(true);
  });
});

describe('getAnalysis', () => {
  const decision: Analysis = {
    depth: 13,
    milliseconds: 400,
    lines: [
      { rank: 1, depth: 13, score: { type: 'cp', value: 30 }, moves: ['e2e4', 'e7e5'] },
      { rank: 2, depth: 13, score: { type: 'cp', value: 10 }, moves: ['d2d4', 'd7d5'] },
      { rank: 3, depth: 13, score: { type: 'cp', value: 5 }, moves: ['g1f3'] },
      { rank: 4, depth: 13, score: { type: 'cp', value: 0 }, moves: ['c2c4'] },
      { rank: 5, depth: 13, score: { type: 'cp', value: -5 }, moves: ['b1c3'] },
    ],
  };
  const eightReplies: Analysis = {
    depth: 12,
    milliseconds: 400,
    lines: ['e7e5', 'd7d5', 'g8f6', 'c7c5', 'e7e6', 'c7c6', 'g7g6', 'b8c6'].map((m, i) => ({
      rank: i + 1,
      depth: 12,
      score: { type: 'cp', value: 25 - i },
      moves: [m],
    })),
  };
  it('reports the decision behind a move and only the drawn replies from it', () => {
    const ctx = context(
      '1. d4 *',
      new Map([
        ['p0', decision],
        ['p1', eightReplies],
      ]),
    );
    const result = getAnalysis(ctx, 'p1').result as {
      decision: { computed: unknown; engine: { candidates: { san: string; played: boolean }[] } };
      repliesFromHere: { depth: number; candidates: { san: string }[] };
    };
    expect(result.decision.computed).toEqual({
      evalDeltaCp: 20,
      playedRank: 2,
      outsideTopEight: false,
    });
    expect(result.decision.engine.candidates.map((c) => c.san)).toEqual(['e4', 'd4', 'Nf3', 'c4']);
    expect(result.decision.engine.candidates[1].played).toBe(true);
    // Eight lines were searched from here but the graph draws four.
    expect(result.repliesFromHere.candidates.map((c) => c.san)).toEqual(['e5', 'd5', 'Nf6', 'c5']);
    expect(runTool(ctx, 'getGame', {}).result).toMatchObject({
      plies: 1,
      analysedPlayedPositions: 2,
    });
  });
  it('refuses nodes without engine data and points at the nearest searched position', () => {
    const ctx = context('1. d4 *', new Map([['p0', decision]]));
    expect(hasEngineData(ctx, 'p1')).toBe(true);
    expect(hasEngineData(ctx, 'p0/e2e4/e7e5')).toBe(false);
    expect(nearestAnalysed(ctx, 'p0/e2e4/e7e5')).toBe('p0');
    const outcome = getAnalysis(ctx, 'p0/e2e4/e7e5');
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toEqual({
      error:
        'The engine has not searched p0/e2e4/e7e5 or the position before it; the nearest searched position is p0',
    });
  });
});

describe('everything Tal is told about moves is a node the user can reach', () => {
  it('holds for every analysed node of the bundled Tal–Smyslov search', () => {
    const study = TAL_GAMES[2];
    const game = parseGame(study.pgn);
    const saved = JSON.parse(
      readFileSync('src/fixtures/analysis/tal-smyslov-1959.json', 'utf8'),
    ) as {
      gameId: string;
      entries: [string, Analysis][];
    };
    expect(saved.gameId).toBe(game.id);
    const builder = new EvolutionBuilder(game);
    const analysis = new Map(saved.entries);
    for (const [id, result] of analysis) builder.append(id, result, 20);
    const ctx: TalContext = { game, node: (id) => builder.get(id), analysis };
    // The SAN of every child node the graph can draw under `id`.
    const drawnChildren = (id: string) => {
      const node = builder.get(id)!;
      const own = analysis.get(id);
      const firstMoves = [
        ...(own?.lines ?? []).map((line) => line.moves[0]),
        ...(own?.playedLine ? [own.playedLine.moves[0]] : []),
      ];
      const san = firstMoves.map((uci) => builder.get(`${id}/${uci}`)?.san);
      const played = node.played ? game.positions[node.ply + 1]?.san : undefined;
      return new Set([...san, played].filter((s): s is string => !!s));
    };
    let checked = 0;
    for (const pos of game.positions.slice(1)) {
      const outcome = getAnalysis(ctx, pos.id);
      expect(outcome.isError).toBe(false);
      const result = outcome.result as {
        decision: { engine: { candidates: { san: string }[] } } | null;
        repliesFromHere: { candidates: { san: string }[] } | null;
      };
      const parentChildren = drawnChildren(`p${pos.ply - 1}`);
      for (const c of result.decision?.engine.candidates ?? []) {
        expect(parentChildren, `${pos.id} decision ${c.san}`).toContain(c.san);
        checked++;
      }
      const ownChildren = drawnChildren(pos.id);
      for (const c of result.repliesFromHere?.candidates ?? []) {
        expect(ownChildren, `${pos.id} reply ${c.san}`).toContain(c.san);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  }, 30_000);
});
