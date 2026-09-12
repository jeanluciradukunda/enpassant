import { talNarration } from '../lib/narration';

export function TalPanel({ gameId, nodeId }: { gameId: string; nodeId: string }) {
  const entry = talNarration(gameId, nodeId);
  if (!entry) return null;
  return (
    <section
      className="quiet-sequence tal-panel"
      aria-label="Tal on this position"
      data-testid="tal-panel"
    >
      <div className="sequence-heading">
        <span className="eyebrow">
          TAL / {entry.label} / DEPTH {entry.depth}
          {entry.outsideTopEight ? ' / OUTSIDE THE SHORTLIST' : ''}
        </span>
      </div>
      <p className="tal-text">{entry.text}</p>
      <p className="branch-help">
        Narrated ahead of time from the engine’s shortlist at depth {entry.depth}
        {entry.depthReached ? '' : ', short of the requested 20'}. Tal is arguing with a shallow
        engine.
      </p>
    </section>
  );
}
