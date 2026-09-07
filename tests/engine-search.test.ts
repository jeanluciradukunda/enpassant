import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { cacheKey, Engine } from '../src/lib/engine';

const roots = ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'g2g3', 'b1c3', 'b2b3', 'f2f4'];
class WorkerDouble {
  static commands: string[] = [];
  onmessage?: (event: { data: string }) => void;
  postMessage(command: string) {
    WorkerDouble.commands.push(command);
    queueMicrotask(() => {
      const emit = (data: string) => this.onmessage?.({ data });
      if (command === 'uci') emit('uciok');
      if (command === 'isready') emit('readyok');
      if (command.startsWith('go ')) {
        const only = command.match(/searchmoves (\w+)/)?.[1];
        const moves = only ? [only] : roots;
        moves.forEach((move, i) =>
          emit(`info depth 12 multipv ${i + 1} score cp ${100 - i * 20} pv ${move}`),
        );
        if (!only) emit('info depth 13 multipv 1 score cp 999 pv e2e4');
        emit(`bestmove ${moves[0]}`);
      }
    });
  }
  terminate() {}
}
afterEach(() => {
  vi.unstubAllGlobals();
  WorkerDouble.commands = [];
});

describe('bounded, history-aware engine coverage', () => {
  it('searches a missing played move, retains a complete MultiPV iteration and restores MultiPV after restriction', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5173/' });
    vi.stubGlobal('Worker', WorkerDouble);
    const engine = new Engine();
    try {
      const result = await engine.analyze(new Chess().fen(), [], 400, {
        playedMove: 'a2a3',
        depth: 20,
      });
      expect(result.depth).toBe(12);
      expect(result.lines[0].score.value).toBe(100); // never mix in the incomplete depth-13 result
      expect(result.playedLine?.moves).toEqual(['a2a3']);
      expect(result.playedLine?.rank).toBe(9); // sentinel, not a claimed exact rank
      expect(result.depthReached).toBe(false);
      expect(WorkerDouble.commands).toContain('go movetime 400 depth 12 searchmoves a2a3');
      expect(WorkerDouble.commands).toContain('setoption name MultiPV value 1');
      await engine.analyze(new Chess().fen(), [], 1800);
      expect(
        WorkerDouble.commands.filter((s) => s.startsWith('setoption name MultiPV')).at(-1),
      ).toBe('setoption name MultiPV value 8');
    } finally {
      engine.dispose();
    }
  });
  it('keeps history, target depth, root restriction, played-move coverage and budget in cache identity', () => {
    const fen = new Chess().fen();
    const keys = [
      cacheKey(fen, [], 400),
      cacheKey(fen, [], 60_000),
      cacheKey(fen, [], 400, { depth: 12 }),
      cacheKey(fen, [], 400, { searchMove: 'e2e4' }),
      cacheKey(fen, [], 400, { playedMove: 'e2e4' }),
      cacheKey(fen, ['g1f3', 'g8f6', 'f3g1', 'f6g8'], 400),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('recognizes history-dependent terminal draws before issuing a search', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5173/' });
    vi.stubGlobal('Worker', WorkerDouble);
    const engine = new Engine();
    try {
      const result = await engine.analyze(new Chess().fen(), [
        'g1f3',
        'g8f6',
        'f3g1',
        'f6g8',
        'g1f3',
        'g8f6',
        'f3g1',
        'f6g8',
      ]);
      expect(result.lines).toHaveLength(0);
      expect(result.depthReached).toBe(true);
      expect(WorkerDouble.commands.filter((s) => s.startsWith('go '))).toHaveLength(0);
    } finally {
      engine.dispose();
    }
  });
});
