import { cacheKey, QUICK_MS, readAnalysis, writeAnalysis } from './engine';
import type { AnalysisProfile } from './engine';
import { parseGame } from './games';
import { TAL_GAMES } from './studyGames';
import type { Analysis, Game } from '../types/game';

export interface SavedAnalysis {
  gameId: string;
  entries: [string, Analysis][];
}

const saved = (module: { default: unknown }) => module.default as SavedAnalysis;
const fixtures: Record<string, () => Promise<SavedAnalysis>> = {
  'botvinnik-tal-1960': () => import('../fixtures/analysis/botvinnik-tal-1960.json').then(saved),
  'tal-larsen-1965': () => import('../fixtures/analysis/tal-larsen-1965.json').then(saved),
  'tal-smyslov-1959': () => import('../fixtures/analysis/tal-smyslov-1959.json').then(saved),
};

/** Cache entries exactly as the quick profile would have written them. */
export function seedEntries(game: Game, saved: SavedAnalysis): [string, Analysis][] {
  if (saved.gameId !== game.id) return [];
  const moves = game.positions.slice(1).map((pos) => pos.uci);
  return saved.entries.flatMap(([id, analysis]) => {
    const ply = Number(id.slice(1));
    if (!/^p\d+$/.test(id) || ply >= game.positions.length) return [];
    const key = cacheKey(game.initialFen, moves.slice(0, ply), QUICK_MS, {
      depth: 20,
      playedMove: game.positions[ply + 1]?.uci,
    });
    return [[key, analysis]];
  });
}

export async function seedBundledAnalysis(game: Game, profile: AnalysisProfile) {
  if (profile !== 'quick') return 0;
  const study = TAL_GAMES.find((study) => parseGame(study.pgn).id === game.id);
  const loader = study && fixtures[study.id];
  if (!loader) return 0;
  let written = 0;
  for (const [key, analysis] of seedEntries(game, await loader())) {
    if (await readAnalysis(key)) continue;
    await writeAnalysis(key, analysis);
    written++;
  }
  return written;
}
