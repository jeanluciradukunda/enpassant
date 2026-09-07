import { useEffect, useRef, useState } from 'react';
import { identifyInput, importLink, nextArchive } from '../lib/importers';
import { parseGames } from '../lib/games';
import type { Game } from '../types/game';

export function GameImporter({
  onChoose,
  onClose,
}: {
  onChoose: (game: Game) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'link' | 'pgn'>('link');
  const [input, setInput] = useState('https://www.chess.com/member/indigojeans');
  const [username, setUsername] = useState('indigojeans');
  const [pgn, setPgn] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [remaining, setRemaining] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  let needsPlayer = false;
  try {
    needsPlayer = identifyInput(input).kind === 'chess-game';
  } catch {
    /* Validate on submit. */
  }

  useEffect(() => {
    dialog.current?.showModal();
    return () => controller.current?.abort();
  }, []);

  function chooseGames(games: Game[], remaining: string[] = []) {
    setGames(games);
    setRemaining(remaining);
    if (games.length === 1 && !remaining.length) onChoose(games[0]);
    if (!games.length) setError('No completed standard chess games were found. Try a PGN instead.');
  }

  async function load(older = false) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setMessage('Connecting…');
    try {
      if (mode === 'pgn' && !older) chooseGames(parseGames(pgn));
      else {
        const result = older
          ? await nextArchive(remaining, request.signal, setMessage)
          : await importLink(input, username, request.signal, setMessage);
        if (!request.signal.aborted) {
          if (older) {
            setGames((games) => [...games, ...result.games]);
            setRemaining(result.remaining);
          } else chooseGames(result.games, result.remaining);
        }
      }
    } catch (error) {
      if (!request.signal.aborted)
        setError(error instanceof Error ? error.message : 'Import failed. Try a PGN.');
    } finally {
      if (controller.current === request) {
        setBusy(false);
        setMessage('');
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-labelledby="import-title"
      onCancel={onClose}
      onClick={(event) => {
        const bounds = dialog.current?.getBoundingClientRect();
        if (
          event.target === dialog.current &&
          bounds &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          onClose();
      }}
    >
      <div className="import-heading">
        <div>
          <span className="eyebrow">A GAME, A WHOLE WORLD OF POSSIBILITIES</span>
          <h2 id="import-title">Bring a game to life.</h2>
        </div>
        <button aria-label="Close importer" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="import-tabs">
        <button
          className={mode === 'link' ? 'active' : ''}
          onClick={() => setMode('link')}
          disabled={busy}
        >
          Chess.com / Lichess
        </button>
        <button
          className={mode === 'pgn' ? 'active' : ''}
          onClick={() => setMode('pgn')}
          disabled={busy}
        >
          Paste or upload PGN
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        {mode === 'link' ? (
          <>
            <label htmlFor="game-link">Username, profile or game link</label>
            <input
              id="game-link"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoFocus
              disabled={busy}
              placeholder="chess.com/member/you or lichess.org/…"
            />
            {needsPlayer && (
              <>
                <label htmlFor="game-player">Chess.com username of a player in this game</label>
                <input
                  id="game-player"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={busy}
                />
                <p className="field-help">
                  We find the game in this player’s published monthly archives. Older links may take
                  a moment.
                </p>
              </>
            )}
            <p className="field-help">
              Public, completed games. Lichess study links work too. No account connection needed.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="pgn-text">Game in PGN format</label>
            <textarea
              id="pgn-text"
              rows={7}
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              placeholder={'[White "You"]\n[Black "Your opponent"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
              disabled={busy}
            />
            <label className="file-picker">
              Choose a .pgn file
              <input
                aria-label="Upload PGN"
                type="file"
                accept=".pgn,.txt"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  controller.current?.abort();
                  const request = new AbortController();
                  controller.current = request;
                  setBusy(true);
                  setError('');
                  try {
                    if (file.size > 2_000_000) throw new Error('Import a file under 2 MB.');
                    const content = await file.text();
                    if (request.signal.aborted) return;
                    setPgn(content);
                    chooseGames(parseGames(content));
                  } catch (error) {
                    if (!request.signal.aborted)
                      setError(
                        error instanceof Error ? error.message : 'Could not read that file.',
                      );
                  } finally {
                    if (controller.current === request) setBusy(false);
                  }
                }}
              />
            </label>
            <p className="field-help">
              Standard chess, including games from a custom starting position. Collections open a
              game picker.
            </p>
          </>
        )}
        <div className="import-actions">
          <button type="submit" className="primary-button" disabled={busy}>
            {mode === 'pgn' ? 'Visualize game' : 'Find games'} <span>↗</span>
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
                setMessage('');
              }}
            >
              Cancel
            </button>
          )}
          <span role="status">{message}</span>
        </div>
      </form>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {games.length > 0 && (
        <div className="game-results">
          <div className="results-title">
            <span className="eyebrow">CHOOSE A GAME</span>
            <span>{games.length} games</span>
          </div>
          {games.map((game, index) => (
            <button
              className="game-result"
              key={`${game.id}-${index}`}
              onClick={() => onChoose(game)}
              disabled={busy}
            >
              <span className="result-players">
                {game.headers.White || 'White'} <span className="muted">/</span>{' '}
                {game.headers.Black || 'Black'}
              </span>
              <span className="result-meta">
                {game.headers.Date?.replaceAll('.', '/')} ·{' '}
                {Math.ceil((game.positions.length - 1) / 2)} moves
              </span>
              <strong>{game.headers.Result || '*'}</strong>
              <span>↗</span>
            </button>
          ))}
          {remaining.length > 0 && (
            <button className="older-games" onClick={() => void load(true)} disabled={busy}>
              Load older games ↓
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
