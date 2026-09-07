import { Chess } from 'chess.js';
import type { Analysis, EngineLine } from '../types/game';

export const ENGINE_VERSION = 'stockfish-18.0.8-lite-single';
export const QUICK_MS = 400;
export const DEEP_MS = 1800;
export const PV_COUNT = 8;
export const STUDY_MS = 60_000;
export type AnalysisProfile = 'quick' | 'study';
export interface SearchOptions {
  depth?: number;
  playedMove?: string;
  searchMove?: string;
  refresh?: boolean;
}

export function parseInfo(text: string, whiteToMove: boolean): EngineLine | null {
  if (!text.startsWith('info ') || /\b(?:upperbound|lowerbound)\b/.test(text)) return null;
  const depth = text.match(/\bdepth (\d+)/);
  const score = text.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = text.match(/\bpv (.+)$/);
  if (!depth || !score || !pv) return null;
  const moves = pv[1]
    .trim()
    .split(/\s+/)
    .filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
  if (!moves.length) return null;
  return {
    rank: Number(text.match(/\bmultipv (\d+)/)?.[1] || 1),
    depth: Number(depth[1]),
    score: { type: score[1] as 'cp' | 'mate', value: Number(score[2]) * (whiteToMove ? 1 : -1) },
    moves,
  };
}

export function cacheKey(
  initialFen: string,
  moves: string[],
  milliseconds: number,
  options: SearchOptions = {},
) {
  return `${ENGINE_VERSION}:v2:pv${options.searchMove ? 1 : PV_COUNT}:${milliseconds}:depth${options.depth ?? 20}:played${options.playedMove ?? ''}:only${options.searchMove ?? ''}:${initialFen}:${moves.join(' ')}`;
}

let database: Promise<IDBDatabase | null> | undefined;
function db() {
  database ??= new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null);
    const request = indexedDB.open('enpassant-analysis', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('positions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return database;
}
export async function readAnalysis(key: string): Promise<Analysis | null> {
  try {
    const database = await db();
    if (!database) return null;
    return await new Promise((resolve) => {
      const request = database.transaction('positions').objectStore('positions').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function writeAnalysis(key: string, value: Analysis) {
  try {
    const database = await db();
    if (!database) return;
    const transaction = database.transaction('positions', 'readwrite');
    const store = transaction.objectStore('positions');
    store.put(value, key);
    // Bound storage to 3,000 position searches; eviction never affects correctness.
    const count = store.count();
    count.onsuccess = () => {
      if (count.result > 3000) {
        const cursor = store.openCursor();
        let remaining = count.result - 2800;
        cursor.onsuccess = () => {
          if (cursor.result && remaining-- > 0) {
            cursor.result.delete();
            cursor.result.continue();
          }
        };
      }
    };
  } catch {
    /* Analysis remains usable when private mode or storage quotas prevent caching. */
  }
}

export class Engine {
  private worker: Worker;
  private listener: ((line: string) => void) | null = null;
  private rejectPending: ((reason: Error) => void) | null = null;
  private disposed = false;
  private ready: Promise<void>;

  constructor() {
    const workerUrl = new URL(
      `${import.meta.env.BASE_URL}engine/stockfish-worker.js`,
      location.href,
    );
    // The engine supports an explicit WASM location in the worker URL fragment.
    workerUrl.hash = encodeURIComponent(new URL('stockfish-18-lite-single.wasm', workerUrl).href);
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = ({ data }: MessageEvent<string>) => {
      if (data === 'enpassant:engine-error') {
        this.fail(new Error('Stockfish could not start. Check the engine download and try again.'));
        return;
      }
      for (const line of String(data).split('\n')) this.listener?.(line);
    };
    this.worker.onerror = () =>
      this.fail(new Error('Stockfish could not start. Check the engine download and try again.'));
    this.ready = this.waitFor('uci', 'uciok', 30_000).then(async () => {
      this.worker.postMessage('setoption name Hash value 32');
      this.worker.postMessage(`setoption name MultiPV value ${PV_COUNT}`);
      await this.waitFor('isready', 'readyok', 10_000);
    });
    // Consumers may be reading cache before they need the worker.
    void this.ready.catch(() => {});
  }

  private fail(error: Error) {
    this.rejectPending?.(error);
    this.listener = null;
    this.rejectPending = null;
  }
  private waitFor(command: string, answer: string, timeout: number) {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) return reject(new DOMException('Analysis cancelled', 'AbortError'));
      const timer = setTimeout(
        () => this.fail(new Error('The engine took too long to respond. Try again.')),
        timeout,
      );
      this.rejectPending = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.listener = (line) => {
        if (line === answer) {
          clearTimeout(timer);
          this.listener = null;
          this.rejectPending = null;
          resolve();
        }
      };
      this.worker.postMessage(command);
    });
  }

  async analyze(
    initialFen: string,
    moves: string[],
    milliseconds = QUICK_MS,
    options: SearchOptions = {},
  ): Promise<Analysis> {
    const key = cacheKey(initialFen, moves, milliseconds, options);
    const cached = await readAnalysis(key);
    if (this.disposed) throw new DOMException('Analysis cancelled', 'AbortError');
    if (
      cached &&
      !options.refresh &&
      (!cached.playedLine || cached.playedLine.depth === cached.depth)
    )
      return cached;
    await this.ready;
    const chess = new Chess(initialFen);
    for (const move of moves) chess.move(move);
    if (chess.isGameOver()) {
      const terminal = {
        lines: [],
        depth: 0,
        milliseconds: 0,
        depthReached: true,
        requestedDepth: options.depth ?? 20,
      };
      await writeAnalysis(key, terminal);
      return terminal;
    }
    const expected = options.searchMove ? 1 : Math.min(PV_COUNT, chess.moves().length);
    this.worker.postMessage(`setoption name MultiPV value ${options.searchMove ? 1 : PV_COUNT}`);
    await this.waitFor('isready', 'readyok', 10_000);
    if (this.disposed) throw new DOMException('Analysis cancelled', 'AbortError');
    const started = performance.now();
    const result = await new Promise<Analysis>((resolve, reject) => {
      const depths = new Map<number, Map<number, EngineLine>>();
      const timer = setTimeout(
        () => this.fail(new Error('Analysis timed out. Resume to retry this position.')),
        milliseconds + 15_000,
      );
      this.rejectPending = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.listener = (text) => {
        const line = parseInfo(text, chess.turn() === 'w');
        if (line) {
          const atDepth = depths.get(line.depth) ?? new Map<number, EngineLine>();
          atDepth.set(line.rank, line);
          depths.set(line.depth, atDepth);
        }
        if (text.startsWith('bestmove')) {
          clearTimeout(timer);
          this.listener = null;
          this.rejectPending = null;
          // Use one completed MultiPV iteration; mixing depths can invert candidate rankings.
          const complete = [...depths.entries()]
            .filter(([, lines]) => lines.size === expected)
            .sort(([a], [b]) => b - a)[0];
          if (!complete)
            return reject(new Error('Stockfish returned no complete analysis. Resume to retry.'));
          resolve({
            lines: [...complete[1].values()].sort((a, b) => a.rank - b.rank),
            depth: complete[0],
            milliseconds,
            elapsedMs: Math.round(performance.now() - started),
            requestedDepth: options.depth ?? 20,
            depthReached: complete[0] >= (options.depth ?? 20),
          });
        }
      };
      this.worker.postMessage(
        `position fen ${initialFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`,
      );
      this.worker.postMessage(
        `go movetime ${milliseconds} depth ${options.depth ?? 20}${options.searchMove ? ` searchmoves ${options.searchMove}` : ''}`,
      );
    });
    if (options.playedMove && !result.lines.some((line) => line.moves[0] === options.playedMove)) {
      const played = await this.analyze(initialFen, moves, milliseconds, {
        depth: result.depth,
        searchMove: options.playedMove,
        refresh: options.refresh,
      });
      result.playedLine = { ...played.lines[0], rank: 9 };
      result.depthReached = result.depthReached && played.depthReached;
      result.elapsedMs = (result.elapsedMs ?? 0) + (played.elapsedMs ?? 0);
    }
    await writeAnalysis(key, result);
    return result;
  }

  dispose() {
    this.disposed = true;
    this.fail(new DOMException('Analysis cancelled', 'AbortError'));
    this.worker.terminate();
  }
}
