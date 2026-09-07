// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Detail zoom callout — mirrors Figure 5's red-bordered inset.
 *
 * V0: static SVG that reuses the same node grammar as the main graph
 * (EvoNode + EvoEdge encoding rules). Shows a stylized magnification of
 * the move-27 terminal fan from Figure 5 — a trunk circle on the left,
 * several chains spreading right, mostly empty-outline squares with
 * sparse black-fill check markers and red crowns on the mate leaves.
 *
 * V2 makes the callout dynamic — selecting an Occurrence in the main
 * graph populates this panel with that node's local subgraph at higher
 * fidelity.
 */

const PANEL_W = 260;
const PANEL_H = 320;
const PAD = 14;
const TRUNK_DIAM = 22;
const ALT_SIDE = 14;
const STEP_X = 32;
const LANE_Y_STEP = 26;
const CROWN_W = 10;
const CROWN_H = 7;

// Hand-tuned chains representing the move-27 terminal fan. Each chain
// uses the same vocabulary as the main EvoNode/EvoEdge encoding.
type CalloutChain = {
  lane: number; // negative = above trunk, positive = below
  segments: Array<{
    fill: 'empty' | 'white' | 'black';
    isCheckmate?: boolean;
    isCompressedFromPrior?: boolean;
  }>;
};

const CHAINS: CalloutChain[] = [
  { lane: -5, segments: [{ fill: 'empty' }, { fill: 'empty' }, { fill: 'white', isCheckmate: true }] },
  { lane: -4, segments: [{ fill: 'empty', isCompressedFromPrior: true }, { fill: 'white', isCheckmate: true }] },
  { lane: -3, segments: [{ fill: 'empty' }, { fill: 'empty', isCompressedFromPrior: true }, { fill: 'white', isCheckmate: true }] },
  { lane: -2, segments: [{ fill: 'empty' }, { fill: 'white', isCheckmate: true }] },
  { lane: -1, segments: [{ fill: 'empty' }, { fill: 'empty' }, { fill: 'empty', isCompressedFromPrior: true }, { fill: 'white' }] },
  { lane: 1, segments: [{ fill: 'empty' }, { fill: 'empty', isCompressedFromPrior: true }, { fill: 'white', isCheckmate: true }] },
  { lane: 2, segments: [{ fill: 'empty' }, { fill: 'white', isCheckmate: true }] },
  { lane: 3, segments: [{ fill: 'empty' }, { fill: 'empty' }, { fill: 'empty', isCompressedFromPrior: true }, { fill: 'white', isCheckmate: true }] },
  { lane: 4, segments: [{ fill: 'empty', isCompressedFromPrior: true }, { fill: 'black', isCheckmate: true }] },
  { lane: 5, segments: [{ fill: 'empty' }, { fill: 'empty' }] },
];

export function DetailZoomCallout() {
  const centerY = PANEL_H / 2;
  const trunkCx = PAD + TRUNK_DIAM / 2;
  const trunkCy = centerY;

  return (
    <div
      style={{
        width: PANEL_W,
        height: PANEL_H,
        background: 'var(--bg-graph)',
        border: '3px solid var(--checkmate-crown)',
        boxSizing: 'border-box',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      }}
      aria-label="Zoom callout: terminal fan after move 27"
    >
      <svg viewBox={`0 0 ${PANEL_W} ${PANEL_H}`} width="100%" height="100%">
        <defs>
          <marker
            id="callout-arrow"
            viewBox="-5 -4 10 8"
            refX="0"
            refY="0"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M -5 -4 L 0 0 L -5 4 z" fill="var(--edge-canonical)" />
          </marker>
        </defs>

        {/* Trunk circle on the left (move 27, selected — inverse fill). */}
        <circle
          cx={trunkCx}
          cy={trunkCy}
          r={TRUNK_DIAM / 2 - 1}
          fill="var(--trunk-fill-selected)"
          stroke="var(--trunk-border)"
          strokeWidth={1.4}
        />
        <text
          x={trunkCx}
          y={trunkCy}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="var(--trunk-text-selected)"
        >
          27
        </text>

        {/* Chains fanning right. */}
        {CHAINS.map((chain, ci) => {
          const laneY = trunkCy + chain.lane * LANE_Y_STEP;
          const firstSegX = trunkCx + TRUNK_DIAM / 2 + 18;
          const elements: React.ReactNode[] = [];

          // Connector from trunk to first segment.
          elements.push(
            <line
              key={`from-trunk-${ci}`}
              x1={trunkCx + TRUNK_DIAM / 2}
              y1={trunkCy}
              x2={firstSegX - ALT_SIDE / 2 - 2}
              y2={laneY}
              stroke="var(--edge-canonical)"
              strokeWidth={1}
              markerEnd="url(#callout-arrow)"
            />,
          );

          chain.segments.forEach((seg, si) => {
            const cx = firstSegX + si * STEP_X;
            const cy = laneY;
            const fillColor =
              seg.fill === 'white'
                ? 'var(--alt-fill-white)'
                : seg.fill === 'black'
                  ? 'var(--alt-fill-black)'
                  : 'transparent';
            elements.push(
              <rect
                key={`seg-${ci}-${si}`}
                x={cx - ALT_SIDE / 2}
                y={cy - ALT_SIDE / 2}
                width={ALT_SIDE}
                height={ALT_SIDE}
                fill={fillColor}
                stroke="var(--alt-border-black)"
                strokeWidth={1}
              />,
            );

            // Crown above (paper-faithful: crown carries the red, not the square).
            if (seg.isCheckmate) {
              const cwx = cx;
              const cwy = cy - ALT_SIDE / 2 - CROWN_H / 2 - 1;
              const half = CROWN_W / 2;
              const top = cwy - CROWN_H / 2;
              const d = `
                M ${cwx - half} ${top + CROWN_H}
                L ${cwx - half} ${top + CROWN_H * 0.45}
                L ${cwx - half * 0.55} ${top + CROWN_H * 0.75}
                L ${cwx - half * 0.2} ${top + CROWN_H * 0.15}
                L ${cwx + half * 0.2} ${top + CROWN_H * 0.75}
                L ${cwx + half * 0.55} ${top + CROWN_H * 0.15}
                L ${cwx + half} ${top + CROWN_H * 0.75}
                L ${cwx + half} ${top + CROWN_H}
                Z`;
              elements.push(
                <path
                  key={`crown-${ci}-${si}`}
                  d={d}
                  fill="var(--checkmate-crown)"
                  stroke="var(--checkmate-crown)"
                  strokeWidth={0.4}
                />,
              );
            }

            // Connector from this segment to the next (solid for plain
            // continuation, dotted-tick for compressed chain).
            if (si < chain.segments.length - 1) {
              const next = chain.segments[si + 1]!;
              const nextX = firstSegX + (si + 1) * STEP_X;
              const isDotted = next.isCompressedFromPrior === true;
              elements.push(
                <line
                  key={`link-${ci}-${si}`}
                  x1={cx + ALT_SIDE / 2}
                  y1={cy}
                  x2={nextX - ALT_SIDE / 2 - 2}
                  y2={cy}
                  stroke={isDotted ? 'var(--edge-compressed)' : 'var(--edge-canonical)'}
                  strokeWidth={1}
                  strokeDasharray={isDotted ? '1 3' : undefined}
                  strokeLinecap={isDotted ? 'round' : 'butt'}
                  markerEnd="url(#callout-arrow)"
                />,
              );
            }
          });

          return <g key={`chain-${ci}`}>{elements}</g>;
        })}
      </svg>
    </div>
  );
}
