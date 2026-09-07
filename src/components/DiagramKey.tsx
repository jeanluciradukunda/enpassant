import { diagramStyle as style } from '../lib/diagramStyle';

export function DiagramKey() {
  return (
    <details className="diagram-key">
      <summary>How to read this diagram</summary>
      <div className="diagram-key-grid">
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="38" cy="12" r="8" fill="none" stroke="#000" strokeWidth="2" />
          </svg>
          <span>
            <strong>Follow the circles.</strong> The numbered game. A white border means White to
            move; a black border means Black.
          </span>
        </p>
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <rect x="6" y="7" width="10" height="10" fill="none" stroke="#000" />
            <rect x="23" y="7" width="10" height="10" fill="#fff" />
            <rect x="40" y="7" width="10" height="10" fill="#000" />
          </svg>
          <span>
            <strong>Read the squares.</strong> Alternative positions. White or black fill identifies
            the checking side; a red king marks checkmate.
          </span>
        </p>
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <path d="M4 7H46M4 17H46" stroke="#000" strokeWidth="1" />
            <path
              d="M4 17H46"
              stroke="#000"
              strokeWidth={style.compressedWidth}
              strokeDasharray={style.compressedDash}
            />
          </svg>
          <span>
            <strong>Trace the arrows.</strong> Solid means one half-move. Ticks mean a folded
            sequence: click it to open the hidden moves.
          </span>
        </p>
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <path d="M4 6H48" stroke="#000" strokeWidth=".4" />
            <path d="M4 17H48" stroke="#000" strokeWidth="3" />
          </svg>
          <span>
            <strong>Compare one decision.</strong> Thicker solid arrows show better locally
            evaluated choices at the same fork.
          </span>
        </p>
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <path d="M43 17C43-3 11-3 11 12" fill="none" stroke="#000" />
            <rect x="6" y="12" width="10" height="10" fill={style.draw} />
          </svg>
          <span>
            <strong>A position can return.</strong> Paths may share a glyph. Grey means a draw on at
            least one visible route; choose a route to inspect its history.
          </span>
        </p>
        <p>
          <svg viewBox="0 0 54 24" aria-hidden="true">
            <path d="M3 20L19 8L34 14L51 2V18L34 22L19 16Z" fill="#fff" opacity=".5" />
            <circle cx="19" cy="12" r="2" fill="none" stroke="#fff" />
          </svg>
          <span>
            <strong>Read the chart alongside it.</strong> Outlined points show played scores; bands
            span the retained alternatives for each side.
          </span>
        </p>
      </div>
    </details>
  );
}
