import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { visibleAt } from '../lib/evolution';
import { unfoldGraph } from '../lib/unfold';
import type { AnalysisProfile } from '../lib/engine';
import { candidates } from '../lib/semantics';
import type { CheckMode } from '../lib/diagramStyle';
import { useAnalysis } from '../lib/useAnalysis';
import { moveLabel, scoreLabel } from '../lib/games';
import { toSan } from '../lib/san';
import { ChessBoard } from './ChessBoard';
import { DiagramKey } from './DiagramKey';
import { TalPanel } from './TalPanel';
import { EvolutionDiagram, GraphMarks } from './EvolutionDiagram';
import type { EvolutionNode, Game } from '../types/game';

type WorkbenchProps = { game: Game; onImport: () => void };
export function GameWorkbench(props: WorkbenchProps) {
  const [profile, setProfile] = useState<AnalysisProfile>('quick');
  return (
    <Workbench
      key={`${props.game.id}:${profile}`}
      {...props}
      profile={profile}
      onProfile={setProfile}
    />
  );
}
function Workbench({
  game,
  onImport,
  profile,
  onProfile,
}: WorkbenchProps & { profile: AnalysisProfile; onProfile: (profile: AnalysisProfile) => void }) {
  const [cursor, setCursor] = useState(0);
  const [overview, setOverview] = useState(true);
  const [selectedId, setSelectedId] = useState('p0');
  const [playing, setPlaying] = useState(false);
  const engine = useAnalysis(game, playing, profile);
  const { analysis } = engine;
  const [speed, setSpeed] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [checkMode, setCheckMode] = useState<CheckMode>('retained');
  const [unfolded, setUnfolded] = useState<string[] | null>(null);
  const graph = useMemo(() => unfoldGraph(engine.graph, unfolded), [engine.graph, unfolded]);
  const [exploringPly, setExploringPly] = useState<number | null>(null);
  const moveList = useRef<HTMLDivElement>(null);
  const selected = graph.byId.get(selectedId) ?? graph.byId.get('p0')!;
  const lastPly = game.positions.length - 1;
  const search = analysis.get(selected.id);
  const routes =
    graph.vertices
      .find((v) => v.members.includes(selected.id))
      ?.members.filter((id) => visibleAt(graph.byId.get(id)!, cursor, overview, exploringPly)) ??
    [];
  const busy = engine.status === 'loading' || engine.status === 'analyzing';
  const limited =
    profile === 'study' && engine.status === 'complete' && engine.atDepth < engine.total;

  const goTo = useCallback(
    (ply: number) => {
      const next = Math.max(0, Math.min(lastPly, ply));
      setCursor(next);
      setSelectedId(`p${next}`);
      setIsolated(false);
      setExploringPly(null);
      setUnfolded(null);
    },
    [lastPly],
  );
  const step = useCallback(
    (direction: number) => {
      setPlaying(false);
      setOverview(false);
      goTo(cursor + direction);
    },
    [cursor, goTo],
  );
  const play = useCallback(() => {
    setOverview(false);
    setIsolated(false);
    setUnfolded(null);
    setExploringPly(null);
    if (cursor === lastPly) goTo(0);
    setPlaying((value) => !value);
  }, [cursor, lastPly, goTo]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setCursor((current) => {
        if (current >= lastPly) {
          setPlaying(false);
          return current;
        }
        const next = current + 1;
        setSelectedId(`p${next}`);
        if (next === lastPly) setPlaying(false);
        return next;
      });
    }, 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, lastPly, speed]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.target as Element).closest(
          'input, textarea, select, button, dialog, a, [contenteditable="true"]',
        ) ||
        document.querySelector('dialog[open]')
      )
        return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      }
      if (event.key === ' ') {
        event.preventDefault();
        play();
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setPlaying(false);
        setOverview(false);
        goTo(event.key === 'Home' ? 0 : lastPly);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [step, play, goTo, lastPly]);

  useEffect(() => {
    const element = moveList.current?.querySelector(
      `[data-move-ply="${cursor}"]`,
    ) as HTMLElement | null;
    if (element && moveList.current) {
      const top = element.offsetTop - moveList.current.offsetTop;
      if (
        top < moveList.current.scrollTop ||
        top + element.offsetHeight > moveList.current.scrollTop + moveList.current.clientHeight
      )
        moveList.current.scrollTop = top - 30;
    }
  }, [cursor]);

  function select(node: EvolutionNode) {
    setPlaying(false);
    setSelectedId(node.id);
    setIsolated(false);
    if (node.played) {
      setCursor(node.ply);
      setExploringPly(null);
    }
  }
  const share = game.headers.Link || game.headers.Site;
  const sourceLink =
    share && /^https:\/\/(?:www\.)?(?:chess\.com|lichess\.org)\//.test(share) ? share : undefined;
  const score = selected.mate
    ? selected.turn === 'w'
      ? '0–1'
      : '1–0'
    : selected.draw
      ? '0.00'
      : scoreLabel(search?.lines[0]?.score);
  const diagramProps = {
    graph,
    game,
    analysis,
    cursor,
    overview,
    selected,
    isolated,
    checkMode,
    exploringPly,
    onSelect: select,
    onUnfold: setUnfolded,
  };
  const lineSan = (moves: string[]) => toSan(selected.fen, moves.slice(0, 7)).join(' ');

  return (
    <main className="workbench" data-testid="game-workbench">
      <header className="study-header">
        <div className="identity">
          <a href="/" className="wordmark">
            enpassant<span className="wordmark-dot">.</span>
          </a>
          <span className="study-type">EVERY MOVE HAS A MULTIVERSE</span>
        </div>
        <nav>
          <a href="/paper">The paper study ↗</a>
          <button
            className="import-button"
            onClick={() => {
              setPlaying(false);
              onImport();
            }}
          >
            ＋ Import game
          </button>
        </nav>
      </header>
      <section className="game-heading">
        <div>
          <span className="eyebrow">
            {game.headers.Event || 'IMPORTED GAME'}{' '}
            <span className="muted">
              / {game.headers.Date?.replaceAll('.', '/') || 'UNDATED'}{' '}
              {game.headers.TimeControl ? `/ ${game.headers.TimeControl}s` : ''}
            </span>
          </span>
          <h1>
            {game.headers.White || 'White'} <span className="versus">/</span>{' '}
            {game.headers.Black || 'Black'}{' '}
            <span className="game-result-tag">{game.headers.Result || '*'}</span>
          </h1>
          <p>
            {game.headers.WhiteElo
              ? `${game.headers.WhiteElo} · ${game.headers.BlackElo || '—'} rating`
              : 'Standard chess'}{' '}
            <span>·</span> {Math.ceil(lastPly / 2)} moves{' '}
            {sourceLink && (
              <>
                <span>·</span>{' '}
                <a href={sourceLink} target="_blank" rel="noreferrer">
                  View original ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="mode-toggle" aria-label="Diagram mode">
          <button
            className={overview ? 'active' : ''}
            aria-pressed={overview}
            onClick={() => {
              setOverview(true);
              setPlaying(false);
            }}
          >
            Whole game
          </button>
          <button
            className={!overview ? 'active' : ''}
            aria-pressed={!overview}
            onClick={() => {
              setOverview(false);
              setPlaying(false);
              goTo(0);
            }}
          >
            Growing replay
          </button>
        </div>
      </section>
      <div className="analysis-strip">
        <span className={`status-dot ${busy ? 'working' : ''}`} />
        <span className="engine-name">
          Stockfish 18 <span className="muted">lite</span>
        </span>
        <label className="analysis-profile">
          <span hidden>Analysis quality</span>
          <select
            aria-label="Analysis quality"
            value={profile}
            onChange={(event) => onProfile(event.target.value as AnalysisProfile)}
          >
            <option value="quick">Quick preview</option>
            <option value="study">Depth 20 study</option>
          </select>
        </label>
        <span className="analysis-status" role="status">
          {engine.status === 'loading'
            ? 'Preparing engine…'
            : engine.status === 'complete'
              ? profile === 'study' && engine.atDepth < engine.total
                ? 'Study finished · depth limited'
                : 'Game analyzed'
              : engine.status === 'paused'
                ? 'Analysis paused'
                : engine.status === 'error'
                  ? 'Analysis interrupted'
                  : engine.workingOn}
        </span>
        <progress aria-label="Game analysis progress" value={engine.completed} max={engine.total} />
        <span className="analysis-count">
          {engine.completed}/{engine.total}
          {profile === 'study' && (
            <span title="Includes terminal positions; both candidate and played-move searches must reach depth 20">
              {' '}
              · {engine.atDepth} at target
            </span>
          )}
        </span>
        <button
          onClick={busy ? engine.pause : limited ? engine.retryLimited : engine.resume}
          disabled={engine.status === 'complete' && !limited}
        >
          {busy
            ? 'Pause analysis'
            : limited
              ? 'Retry depth-limited searches'
              : engine.status === 'complete'
                ? 'Complete'
                : 'Resume analysis'}
        </button>
      </div>
      {engine.error && (
        <div className="engine-error" role="alert">
          {engine.error}
        </div>
      )}
      <div className="game-layout">
        <section className="graph-workspace" aria-label="Game visualization">
          <EvolutionDiagram {...diagramProps} />
          <div className="replay-bar">
            <div className="transport">
              <button
                aria-label="First move"
                disabled={cursor === 0 && !overview}
                onClick={() => {
                  setPlaying(false);
                  setOverview(false);
                  goTo(0);
                }}
              >
                ↤
              </button>
              <button aria-label="Previous move" disabled={cursor === 0} onClick={() => step(-1)}>
                ←
              </button>
              <button
                className="play-button"
                aria-label={playing ? 'Pause replay' : 'Play replay'}
                onClick={play}
              >
                {playing ? 'Ⅱ' : '▶'}
              </button>
              <button aria-label="Next move" disabled={cursor === lastPly} onClick={() => step(1)}>
                →
              </button>
              <button
                aria-label="Last move"
                disabled={cursor === lastPly}
                onClick={() => {
                  setPlaying(false);
                  setOverview(false);
                  goTo(lastPly);
                }}
              >
                ↦
              </button>
            </div>
            <div className="replay-position">
              <strong>{moveLabel(game.positions[cursor])}</strong>
              <span>
                {overview ? 'Whole game visible' : `${cursor} of ${lastPly} half-moves revealed`}
              </span>
            </div>
            <label className="speed-control">
              <span>Speed</span>
              <select
                aria-label="Replay speed"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>
          </div>
          <input
            className="replay-scrubber"
            aria-label="Replay position"
            type="range"
            min={0}
            max={lastPly}
            value={cursor}
            onChange={(event) => {
              setPlaying(false);
              setOverview(false);
              goTo(Number(event.target.value));
            }}
          />
          <div className="graph-bottom">
            <p>
              {overview
                ? 'A map of the game that happened, and the paths left behind.'
                : cursor === 0
                  ? 'Press play. Watch one decision become a whole landscape.'
                  : cursor === lastPly
                    ? game.headers.Termination ||
                      'The final position. Explore a branch to see what might have followed.'
                    : 'Each move reveals its alternatives. Earlier branches stay rooted in place.'}
              <span>Click a node to inspect · Scroll to zoom · Drag to pan · ← → to step</span>
            </p>
            <div className="legend">
              <span>
                <i className="legend-circle" />
                Played
              </span>
              <span>
                <i className="legend-square" />
                Alternative
              </span>
              <span>
                <i className="legend-check" />
                {checkMode === 'retained' ? 'Retained check' : 'Evaluated check'}
              </span>
              <span>
                <i className="legend-mate">▲</i>Mate
              </span>
              <span title="A return to a represented position. The route picker preserves each move history.">
                ↶ Repeat
              </span>
            </div>
          </div>
          <label className="check-display">
            Check highlights
            <select
              aria-label="Check highlights"
              value={checkMode}
              onChange={(event) => setCheckMode(event.target.value as CheckMode)}
            >
              <option value="retained">Checks in retained lines</option>
              <option value="assessed">Locally evaluated checks</option>
            </select>
            <span>
              {checkMode === 'retained'
                ? 'Shows legal checks in the chosen continuations; locally refuted checks stay hollow.'
                : 'Highlights checks within 0.50 pawns of the best locally searched move.'}
            </span>
          </label>
          <DiagramKey />
        </section>
        <aside className="position-panel" aria-label="Selected position">
          <div className="paper-detail-panel">
            <span className="eyebrow">DETAIL / SELECT A POSITION</span>
            <svg
              data-testid="live-detail"
              viewBox={`${selected.x - 85} ${selected.y - 70} 170 140`}
              className="live-detail"
            >
              <GraphMarks {...diagramProps} detail />
            </svg>
          </div>
          {unfolded && (
            <section className="quiet-sequence" aria-label="Unfolded quiet sequence">
              <div className="sequence-heading">
                <span className="eyebrow">QUIET SEQUENCE / {unfolded.length - 1} HALF-MOVES</span>
                <button aria-label="Close quiet sequence" onClick={() => setUnfolded(null)}>
                  ×
                </button>
              </div>
              <div className="sequence-moves">
                {unfolded.map((id) => {
                  const node = graph.byId.get(id)!;
                  return (
                    <button key={id} aria-pressed={selected.id === id} onClick={() => select(node)}>
                      {moveLabel(node)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <div className="board-player">
            <span>
              <i className={flipped ? 'white-piece' : 'black-piece'} />
              {(flipped ? game.headers.White : game.headers.Black) || (flipped ? 'White' : 'Black')}
            </span>
            <button aria-label="Flip board" onClick={() => setFlipped(!flipped)}>
              ⇅
            </button>
          </div>
          <ChessBoard node={selected} flipped={flipped} />
          <div className="board-player bottom-player">
            <span>
              <i className={flipped ? 'black-piece' : 'white-piece'} />
              {(flipped ? game.headers.Black : game.headers.White) || (flipped ? 'Black' : 'White')}
            </span>
            <span className="turn-label">{selected.turn === 'w' ? 'White' : 'Black'} to move</span>
          </div>
          <div className="position-heading">
            <div>
              <span className="eyebrow">
                {selected.played ? 'PLAYED POSITION' : 'THE ROAD NOT TAKEN'}
              </span>
              <h2>{moveLabel(selected)}</h2>
            </div>
            <div className="position-evaluation">
              <strong>{score}</strong>
              <span>
                {selected.mate
                  ? 'Checkmate'
                  : selected.draw
                    ? 'Draw'
                    : search
                      ? `Depth ${search.depth}`
                      : 'Not analyzed'}
              </span>
            </div>
          </div>
          <TalPanel gameId={game.id} nodeId={selected.id} />
          {selected.legalReplies !== undefined && selected.legalReplies > 0 && !selected.draw && (
            <p className="branch-help">
              {selected.legalReplies === 1
                ? 'One legal reply in this position.'
                : `${selected.legalReplies} legal moves; the diagram shows selected engine continuations.`}
            </p>
          )}
          <div className="branch-controls">
            <button
              className="explore-button"
              onClick={() => {
                if (!overview) setExploringPly(selected.played ? selected.ply : selected.originPly);
                engine.expand(selected);
              }}
              disabled={selected.mate || selected.draw}
            >
              Explore this position ↗
            </button>
            <button
              aria-label="Isolate continuations"
              aria-pressed={isolated}
              className={isolated ? 'active' : ''}
              onClick={() => setIsolated(!isolated)}
            >
              ◎
            </button>
          </div>
          {!selected.played && (
            <button
              className="back-to-game"
              onClick={() => {
                setSelectedId(`p${cursor}`);
                setIsolated(false);
              }}
            >
              ← Back to the played game
            </button>
          )}
          {routes.some((id) => graph.byId.get(id)!.draw) && !selected.draw && (
            <p className="branch-help">
              A different route reaches a draw at this shared position. The selected history can
              still continue.
            </p>
          )}
          {routes.length > 1 && (
            <label className="route-picker">
              Route to this position
              <select
                aria-label="Route to this position"
                value={selected.id}
                onChange={(event) => select(graph.byId.get(event.target.value)!)}
              >
                {routes.map((id, i) => {
                  const node = graph.byId.get(id)!;
                  const routeBoard = new Chess(game.initialFen);
                  const routeMoves = node.moves.map((move) => routeBoard.move(move).san);
                  return (
                    <option key={id} value={id}>
                      {node.played ? 'Played' : `Route ${i + 1}`} · {routeMoves.slice(-6).join(' ')}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
          {selected.check && !selected.mate && !selected.draw && (
            <p className="branch-help">
              {selected.checkQuality === 'supported'
                ? 'Checking move within 0.50 pawns of the best searched move.'
                : selected.checkQuality === 'inferior'
                  ? 'This check loses more than 0.50 pawns against the best searched move.'
                  : 'Check observed. Its effectiveness has not been evaluated at this position.'}
            </p>
          )}
          {search?.lines.length ? (
            <div className="candidate-lines">
              {candidates(
                search,
                selected.played ? game.positions[selected.ply + 1]?.uci : undefined,
              )
                .filter(
                  (line) =>
                    graph.byId.has(`${selected.id}/${line.moves[0]}`) ||
                    (selected.played && game.positions[selected.ply + 1]?.uci === line.moves[0]),
                )
                .map((line) => (
                  <button
                    key={line.rank}
                    title={lineSan(line.moves)}
                    disabled={!graph.ready}
                    aria-label={`Inspect ${line === search.playedLine ? 'played move outside top eight' : `candidate ${line.rank}`}: ${lineSan(line.moves)}`}
                    onClick={() => {
                      const uci = line.moves[0];
                      const id =
                        selected.played && game.positions[selected.ply + 1]?.uci === uci
                          ? `p${selected.ply + 1}`
                          : `${selected.id}/${uci}`;
                      const node = graph.byId.get(id);
                      if (node) {
                        if (!overview && !node.played) setExploringPly(node.originPly);
                        select(node);
                      }
                    }}
                  >
                    <span>{scoreLabel(line.score)}</span>
                    <p>{lineSan(line.moves)}</p>
                  </button>
                ))}
            </div>
          ) : (
            <p className="branch-help">
              {selected.mate
                ? 'This line ends in checkmate.'
                : selected.draw
                  ? 'This line reaches a drawn position.'
                  : selected.continuationEnd
                    ? selected.continuationEnd === 'display-limit'
                      ? 'The 20-ply display limit ends here. Explore to continue this line.'
                      : 'The returned engine line ends here. Legal moves remain; explore to continue.'
                    : selected.played
                      ? 'Alternatives appear as the engine reaches this move.'
                      : 'Explore to search deeper and grow new branches here.'}
            </p>
          )}

          <div className="move-list-heading">
            <span className="eyebrow">THE PLAYED LINE</span>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([game.pgn], { type: 'application/x-chess-pgn' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = `enpassant-${game.id}.pgn`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              PGN ↓
            </button>
          </div>
          <div ref={moveList} className="move-list" aria-label="Played moves">
            {game.positions.slice(1).map((pos) => (
              <button
                key={pos.id}
                data-move-ply={pos.ply}
                className={selected.id === pos.id ? 'current' : ''}
                onClick={() => {
                  setPlaying(false);
                  goTo(pos.ply);
                }}
              >
                {moveLabel(pos)}
              </button>
            ))}
          </div>
        </aside>
      </div>
      <footer className="tool-footer">
        <span>Inspired by Lu, Wang &amp; Lin’s chess evolution diagrams.</span>
        <span>
          Analysis stays in this browser ·{' '}
          <a
            href="https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918"
            target="_blank"
            rel="noreferrer"
          >
            Engine source
          </a>{' '}
          ·{' '}
          <a href="/engine/COPYING.txt" target="_blank" rel="noreferrer">
            GPLv3
          </a>
        </span>
      </footer>
    </main>
  );
}
