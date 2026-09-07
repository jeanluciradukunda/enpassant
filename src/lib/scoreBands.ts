import { scoreValue } from './games';
import { candidates } from './semantics';
import type { Analysis, Game, Score } from '../types/game';
export const scoreY = (score: Score, side: 'w' | 'b' = 'w') => {
  const value = scoreValue(score) * (side === 'w' ? 1 : -1);
  return 83 - Math.sign(value) * Math.log1p(Math.abs(value)) * 27;
};
export function scoreBands(game: Game, analysis: Map<string, Analysis>, cursor: number) {
  return (['w', 'b'] as const).map((side) => ({
    side,
    segments: game.positions
      .slice(1, cursor + 1)
      .filter((p) => p.turn !== side)
      .map((pos) => {
        const root = analysis.get(`p${pos.ply - 1}`);
        const retained = root
          ? candidates(root, pos.uci).filter((line) => line.depth === root.depth)
          : [];
        const actual: Score | undefined = pos.mate
          ? { type: 'mate', value: pos.turn === 'w' ? -1 : 1 }
          : pos.draw
            ? { type: 'cp', value: 0 }
            : retained.find((line) => line.moves[0] === pos.uci)?.score;
        if (!root?.lines.length || !actual) return null;
        const estimates = retained.map((line) => scoreY(line.score, side));
        const y = scoreY(actual, side);
        return {
          pos,
          actual,
          depth: root.depth,
          y,
          low: Math.max(...estimates, y),
          high: Math.min(...estimates, y),
        };
      }),
  }));
}
