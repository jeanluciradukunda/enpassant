import { describe, expect, it, vi, afterEach } from 'vitest';
import { Chess } from 'chess.js';
import { parseGame, parseGames, moveLabel } from '../src/lib/games';
import { cacheKey, parseInfo } from '../src/lib/engine';
import { EvolutionBuilder, visibleAt } from '../src/lib/evolution';
import { identifyInput, importLink } from '../src/lib/importers';
import type { Analysis } from '../src/types/game';

describe('legal game reconstruction', () => {
  it('replays castling and en passant, with FEN and full history', () => {
    const game = parseGame('1. e4 a6 2. e5 d5 3. exd6 exd6 4. Nf3 Nf6 5. Be2 Be7 6. O-O O-O *');
    expect(game.positions[5].uci).toBe('e5d6');
    expect(new Chess(game.positions[5].fen).get('d5')).toBeUndefined();
    expect(new Chess(game.positions.at(-1)!.fen).get('g8')?.type).toBe('k');
    expect(new Chess(game.positions.at(-1)!.fen).get('f8')?.type).toBe('r');
  });
  it('handles promotion and black-to-move custom starts without resetting move numbers', () => {
    const game = parseGame(
      '[Variant "From Position"]\n[SetUp "1"]\n[FEN "7k/8/8/8/8/8/p7/7K b - - 0 42"]\n\n42... a1=Q+ *',
    );
    expect(game.positions[1].uci).toBe('a2a1q');
    expect(moveLabel(game.positions[1])).toBe('42… a1=Q+');
    expect(new Chess(game.positions[1].fen).get('a1')?.type).toBe('q');
  });
  it('detects mate and history-dependent repetition', () => {
    expect(parseGame('1. f3 e5 2. g4 Qh4# 0-1').positions.at(-1)?.mate).toBe(true);
    expect(
      parseGame('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2').positions.at(-1)?.draw,
    ).toBe(true);
  });
  it('rejects malformed, empty, illegal and variant games, and reads collections', () => {
    expect(() => parseGame('')).toThrow();
    expect(() => parseGame('1. e4 e5 2. e5')).toThrow();
    expect(() => parseGame('[Variant "Chess960"]\n\n1. e4 *')).toThrow('standard chess');
    expect(parseGames('[Event "One"]\n\n1. e4 *\n\n[Event "Two"]\n\n1. d4 *')).toHaveLength(2);
  });
});

describe('engine data and path identity', () => {
  it('normalizes cp and mate to White, discards bounds and preserves PV depth', () => {
    const line = parseInfo('info depth 12 multipv 2 score cp -55 nodes 123 pv e7e5 g1f3', false);
    expect(line).toEqual({
      rank: 2,
      depth: 12,
      score: { type: 'cp', value: 55 },
      moves: ['e7e5', 'g1f3'],
    });
    expect(parseInfo('info depth 8 score mate 3 pv h4e1', false)?.score).toEqual({
      type: 'mate',
      value: -3,
    });
    expect(parseInfo('info depth 8 score cp 100 lowerbound pv e2e4', true)).toBeNull();
    expect(cacheKey('fen', ['g1f3', 'g8f6', 'f3g1', 'f6g8'], 250)).not.toBe(
      cacheKey('fen', [], 250),
    );
  });
  it('keeps nodes fixed while revealing and expanding only legal variations', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const builder = new EvolutionBuilder(game);
    const result: Analysis = {
      lines: [
        {
          rank: 1,
          depth: 10,
          score: { type: 'cp', value: 12 },
          moves: ['d2d4', 'd7d5', 'c2c4', 'e7e6'],
        },
      ],
      depth: 10,
      milliseconds: 250,
    };
    builder.append('p0', result);
    const first = builder.snapshot();
    expect(first.nodes.filter((node) => visibleAt(node, 0, false))).toHaveLength(1);
    expect(first.nodes.filter((node) => visibleAt(node, 1, false))).toHaveLength(6);
    builder.append('p0/d2d4', {
      ...result,
      lines: [{ ...result.lines[0], moves: ['g8f6', 'c2c4', 'e7e6'] }],
    });
    const grown = builder.snapshot();
    for (const node of first.nodes)
      expect([grown.byId.get(node.id)?.x, grown.byId.get(node.id)?.y]).toEqual([node.x, node.y]);
    for (const node of grown.nodes) {
      const chess = new Chess(game.initialFen);
      for (const move of node.moves) chess.move(move);
      expect(chess.fen()).toBe(node.fen);
    }
    expect(grown.nodes.length).toBeGreaterThan(first.nodes.length);
  });
  it('shares played prefixes without revealing future decisions early', () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
    const builder = new EvolutionBuilder(game);
    builder.append('p0', {
      lines: [
        { rank: 1, depth: 10, score: { type: 'cp', value: 10 }, moves: ['e2e4', 'e7e5', 'f1c4'] },
      ],
      depth: 10,
      milliseconds: 250,
    });
    const alternative = builder.snapshot().nodes.find((node) => !node.played)!;
    expect(alternative.parent).toBe('p2');
    expect(visibleAt(alternative, 2, false)).toBe(false);
    expect(visibleAt(alternative, 2, false, 2)).toBe(true);
    expect(visibleAt(builder.snapshot().byId.get('p3')!, 2, false, 2)).toBe(false);
    expect(visibleAt(alternative, 3, false)).toBe(true);
  });
});

describe('import boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('recognizes supported links without allowing arbitrary fetch URLs', () => {
    expect(identifyInput('https://www.chess.com/member/indigojeans')).toEqual({
      kind: 'chess-player',
      value: 'indigojeans',
    });
    expect(identifyInput('https://www.chess.com/game/live/172801642226')).toEqual({
      kind: 'chess-game',
      value: '172801642226',
    });
    expect(identifyInput('https://lichess.org/abcdefgh1234/black')).toEqual({
      kind: 'lichess',
      value: 'https://lichess.org/game/export/abcdefgh?clocks=false&evals=false',
    });
    expect(identifyInput('https://lichess.org/study/abcdefgh/ijklmnop').value).toBe(
      'https://lichess.org/api/study/abcdefgh/ijklmnop.pgn',
    );
    for (const input of [
      'https://chess.com.evil.test/member/me',
      'https://evil.test/game/1',
      'javascript:alert(1)',
      'https://evil@chess.com/member/me',
    ])
      expect(() => identifyInput(input)).toThrow();
  });
  it('searches Chess.com monthly archives serially for a game link', async () => {
    const url = 'https://api.chess.com/pub/player/tester/games/2026/08';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ archives: [url] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            games: [
              {
                rules: 'chess',
                pgn: '1. e4 e5 *',
                url: 'https://www.chess.com/game/live/123',
                end_time: 10,
              },
            ],
          }),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await importLink(
      'https://chess.com/game/live/123',
      'tester',
      new AbortController().signal,
      () => {},
    );
    expect(result.games[0].positions).toHaveLength(3);
    expect(fetch.mock.calls.map((args) => args[0])).toEqual([
      'https://api.chess.com/pub/player/tester/games/archives',
      url,
    ]);
  });
  it('reports rate limiting as recoverable without consuming private data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(importLink('tester', '', new AbortController().signal, () => {})).rejects.toThrow(
      'rate limiting',
    );
  });
});
