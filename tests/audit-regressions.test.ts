import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGame, parseGames, MAX_PGN_BYTES } from '../src/lib/games';
import { archives } from '../src/lib/importers';

afterEach(() => vi.unstubAllGlobals());
describe('import boundaries', () => {
  it('applies the 2 MB limit to UTF-8 bytes for pasted games and collections', () => {
    const pgn = `[White "${'é'.repeat(MAX_PGN_BYTES / 2)}"]\n\n1. e4 *`;
    expect(pgn.length).toBeLessThan(MAX_PGN_BYTES);
    expect(() => parseGame(pgn)).toThrow('2 MB');
    expect(() => parseGames(pgn)).toThrow('2 MB');
  });
  it('normalizes the participant username before constructing archive URLs', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"archives":[]}'));
    vi.stubGlobal('fetch', fetch);
    await archives(' Tester ', new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe('https://api.chess.com/pub/player/tester/games/archives');
  });
});
