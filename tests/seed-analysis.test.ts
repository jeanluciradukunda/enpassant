import { describe, expect, it } from 'vitest';
import { cacheKey, QUICK_MS } from '../src/lib/engine';
import { parseGame } from '../src/lib/games';
import { seedEntries } from '../src/lib/seedAnalysis';
import type { Analysis } from '../src/types/game';

const analysis: Analysis = { lines: [], depth: 13, milliseconds: 400 };

describe('bundled analysis seeding', () => {
  it('writes each saved position under the key the quick profile will read', () => {
    const game = parseGame('1. e4 e5 2. Nf3 *');
    const entries = seedEntries(game, {
      gameId: game.id,
      entries: [
        ['p0', analysis],
        ['p1', analysis],
        ['p3', analysis],
      ],
    });
    expect(entries.map(([key]) => key)).toEqual([
      cacheKey(game.initialFen, [], QUICK_MS, { depth: 20, playedMove: 'e2e4' }),
      cacheKey(game.initialFen, ['e2e4'], QUICK_MS, { depth: 20, playedMove: 'e7e5' }),
      cacheKey(game.initialFen, ['e2e4', 'e7e5', 'g1f3'], QUICK_MS, { depth: 20 }),
    ]);
  });
  it('refuses saved data from a different game or beyond its length', () => {
    const game = parseGame('1. e4 *');
    expect(seedEntries(game, { gameId: 'other', entries: [['p0', analysis]] })).toEqual([]);
    expect(seedEntries(game, { gameId: game.id, entries: [['p9', analysis]] })).toEqual([]);
  });
});
