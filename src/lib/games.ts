import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Game, GamePosition, Score } from '../types/game';

export const MAX_PGN_BYTES = 2_000_000;
export const MAX_PLIES = 600;

export function position(
  chess: Chess,
  ply: number,
  san = '',
  uci = '',
  id = `p${ply}`,
): GamePosition {
  return {
    id,
    ply,
    san,
    uci,
    fen: chess.fen(),
    turn: chess.turn(),
    moveNumber: Number(chess.fen().split(' ')[5]),
    check: chess.isCheck(),
    mate: chess.isCheckmate(),
    draw: chess.isDraw(),
  };
}

export function parseGame(pgn: string): Game {
  if (!pgn.trim()) throw new Error('Paste a PGN or choose a .pgn file to begin.');
  if (new TextEncoder().encode(pgn).byteLength > MAX_PGN_BYTES)
    throw new Error('This PGN is too large. Import a file under 2 MB.');
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (error) {
    throw new Error(
      `Could not read this PGN: ${error instanceof Error ? error.message : 'invalid moves'}`,
      { cause: error },
    );
  }
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter(
      ([, value]) => value !== '?' && value !== '????.??.??',
    ),
  );
  if (
    headers.Variant &&
    !['standard', 'chess', 'normal', 'from position'].includes(headers.Variant.toLowerCase())
  ) {
    throw new Error('Only standard chess is supported. Export a standard game as PGN.');
  }
  const history = chess.history({ verbose: true });
  if (!history.length) throw new Error('This PGN has no moves. Include the game’s move text.');
  if (history.length > MAX_PLIES)
    throw new Error(`Please choose a game with at most ${MAX_PLIES} half-moves.`);
  if (history.some((move) => move.san === '--'))
    throw new Error('Null moves are not legal game moves.');
  const initialFen = history[0]?.before || headers.FEN || DEFAULT_POSITION;
  const replay = new Chess(initialFen);
  const positions = [position(replay, 0)];
  for (const move of history) {
    replay.move(move.lan);
    positions.push(position(replay, positions.length, move.san, move.lan));
  }
  const normalized = chess.pgn();
  // Stable UI identity; cache keys use the full FEN and move history, not this hash.
  let hash = 2166136261;
  for (const char of normalized) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { id: (hash >>> 0).toString(36), pgn: normalized, headers, initialFen, positions };
}

export function parseGames(pgn: string): Game[] {
  if (new TextEncoder().encode(pgn).byteLength > MAX_PGN_BYTES)
    throw new Error('Import a PGN file under 2 MB.');
  // PGN export collections conventionally start each game with an Event tag.
  const parts = pgn
    .trim()
    .split(/(?=^\[Event\s+")/m)
    .filter((part) => part.trim());
  if (parts.length > 100) throw new Error('Import a collection of at most 100 games.');
  return (parts.length ? parts : [pgn]).map(parseGame);
}

export function moveLabel(pos: GamePosition) {
  if (!pos.ply) return 'Starting position';
  const whiteMoved = pos.turn === 'b';
  return `${whiteMoved ? pos.moveNumber : pos.moveNumber - 1}${whiteMoved ? '.' : '…'} ${pos.san}`;
}

export function scoreLabel(score: Score | undefined) {
  if (!score) return '—';
  if (score.type === 'mate') return `${score.value >= 0 ? '+' : '−'}M${Math.abs(score.value)}`;
  return `${score.value >= 0 ? '+' : '−'}${(Math.abs(score.value) / 100).toFixed(2)}`;
}

export function scoreValue(score: Score) {
  return score.type === 'mate'
    ? score.value >= 0
      ? 10
      : -10
    : Math.max(-10, Math.min(10, score.value / 100));
}
