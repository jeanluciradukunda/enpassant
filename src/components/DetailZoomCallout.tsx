// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Detail zoom callout — mirrors Figure 5's red-bordered inset.
 *
 * V0: static SVG showing a stylized magnification of move 27's terminal fan
 * (the figure's actual subject). V2 makes it dynamic — select an Occurrence
 * → corner panel magnifies that node's local subgraph.
 */

export function DetailZoomCallout() {
  // A small magnified replica: a single trunk circle on the left, several
  // alt squares fanning right, multiple crowns on the right edge.
  return (
    <div
      style={{
        width: 260,
        height: 320,
        background: 'var(--bg-graph)',
        border: '3px solid var(--checkmate-crown)',
        boxSizing: 'border-box',
        padding: 12,
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      }}
      aria-label="Zoom callout: terminal fan after move 27"
    >
      <svg viewBox="0 0 240 296" width="100%" height="100%">
        {/* Selected trunk circle */}
        <g transform="translate(20, 138)">
          <circle
            cx={0}
            cy={0}
            r={11}
            fill="var(--trunk-fill-selected)"
            stroke="var(--trunk-border)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={0}
            dominantBaseline="central"
            textAnchor="middle"
            fontSize={10}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="var(--trunk-text-selected)"
          >
            27
          </text>
        </g>

        {/* Fan of alt squares to the right, with crowns on the rightmost ones */}
        {Array.from({ length: 12 }).map((_, row) => {
          const ySpread = (row - 5.5) * 18;
          const isMate = row !== 5 && row !== 6; // some are mate, some are not
          return (
            <g key={row} transform={`translate(50, ${138 + ySpread})`}>
              {/* connector */}
              <line
                x1={-30}
                y1={0}
                x2={0}
                y2={0}
                stroke="var(--edge-canonical)"
                strokeWidth={0.8}
              />
              {/* a short chain of two squares ending in a possible mate */}
              <rect
                x={0}
                y={-7}
                width={14}
                height={14}
                fill="var(--alt-fill-white)"
                stroke="var(--alt-border-black)"
                strokeWidth={1}
              />
              <line
                x1={14}
                y1={0}
                x2={48}
                y2={0}
                stroke="var(--edge-canonical)"
                strokeWidth={0.8}
                strokeDasharray="3 2"
              />
              <rect
                x={48}
                y={-7}
                width={14}
                height={14}
                fill="var(--alt-fill-white)"
                stroke="var(--alt-border-black)"
                strokeWidth={1}
              />
              <line
                x1={62}
                y1={0}
                x2={96}
                y2={0}
                stroke="var(--edge-canonical)"
                strokeWidth={0.8}
              />
              <rect
                x={96}
                y={-7}
                width={14}
                height={14}
                fill="var(--alt-fill-white)"
                stroke="var(--alt-border-black)"
                strokeWidth={1}
              />
              {isMate ? (
                <g transform="translate(108, -11)">
                  <path
                    d="M 0 8 L 0 3.6 L 1.6 5.6 L 4 1.6 L 6.4 5.6 L 8 3.6 L 8 8 Z"
                    fill="var(--checkmate-crown)"
                    stroke="var(--checkmate-crown)"
                    strokeWidth={0.4}
                  />
                </g>
              ) : null}
              {/* connector back to the trunk */}
              {row === 0 || row === 11 ? null : null}
            </g>
          );
        })}

        {/* sparse connector lines from trunk to the rows (curved/branching feel) */}
        {Array.from({ length: 12 }).map((_, row) => {
          const ySpread = (row - 5.5) * 18;
          return (
            <line
              key={`spine-${row}`}
              x1={20 + 11}
              y1={138}
              x2={50}
              y2={138 + ySpread}
              stroke="var(--edge-canonical)"
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
          );
        })}
      </svg>
    </div>
  );
}
