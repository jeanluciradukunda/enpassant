import { Chess } from 'chess.js';

/** Replays UCI moves from a FEN and returns their SAN, stopping at the first illegal move. */
export function toSan(fen: string, moves: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const move of moves) {
    try {
      san.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return san;
}
