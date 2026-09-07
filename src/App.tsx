import { lazy, Suspense, useEffect, useState } from 'react';
import { parseGame } from './lib/games';
import { GameImporter } from './components/GameImporter';
import { GameWorkbench } from './components/GameWorkbench';
import type { Game } from './types/game';

const PaperStudy = lazy(() =>
  import('./PaperStudy').then((module) => ({ default: module.PaperStudy })),
);

export function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const paper = window.location.pathname.replace(/\/$/, '') === '/paper';
  useEffect(() => {
    if (paper) return;
    const controller = new AbortController();
    async function initialize() {
      try {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem('enpassant-last-game');
        } catch {
          /* Storage is optional. */
        }
        if (saved) {
          try {
            setGame(parseGame(saved));
            return;
          } catch {
            /* Fall back to the bundled example. */
          }
        }
        const response = await fetch(`${import.meta.env.BASE_URL}games/indigojeans-gm-shadi.pgn`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('The example could not load. Import a game to begin.');
        const next = parseGame(await response.text());
        if (!controller.signal.aborted) setGame(next);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'Could not load the game.');
      }
    }
    void initialize();
    return () => controller.abort();
  }, [paper]);
  if (paper)
    return (
      <Suspense fallback={<div className="app-loading">Opening the paper study…</div>}>
        <PaperStudy />
      </Suspense>
    );
  return (
    <>
      {game ? (
        <GameWorkbench key={game.id} game={game} onImport={() => setImporting(true)} />
      ) : (
        <main className="app-loading">
          <span className="wordmark">enpassant.</span>
          <p role="status">{error || 'Opening your game…'}</p>
          <button onClick={() => setImporting(true)}>Import a game</button>
        </main>
      )}
      {importing && (
        <GameImporter
          onClose={() => setImporting(false)}
          onChoose={(next) => {
            try {
              localStorage.setItem('enpassant-last-game', next.pgn);
            } catch {
              /* Session remains usable without storage. */
            }
            setGame(next);
            setImporting(false);
          }}
        />
      )}
    </>
  );
}
