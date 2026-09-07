// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import type { GraphData, OccurrenceId } from '@/types/model';

/**
 * Paper-style score chart.
 *
 * Figure 5's chart is not a generic plotted widget: it is a translucent
 * diagram layer aligned under the trunk. This SVG keeps the visual grammar
 * intentionally blunt: jagged filled polygons, a thin center rule, tiny
 * move labels, and a straight-segment played-score polyline.
 */

export interface ScoreChartProps {
  graph: GraphData;
  height?: number;
}

interface ScorePoint {
  moveNumber: number;
  playedCp: number;
  bandHighCp: number;
  bandLowCp: number;
}

const VIEW_W = 1200;
const VIEW_H = 140;
const PAD_X = 18;
const TOP_Y = 8;
const AXIS_Y = 60;
const BOTTOM_Y = 122;
const MATE_CAP_CP = 2000;
const LINEAR_RANGE_CP = 100;

const FIGURE5_WHITE_AMPLITUDE = [
  22, 25, 29, 27, 19, 22, 28, 34, 21, 10, 26, 34, 38, 42, 46, 48, 50, 52, 66,
  70, 68, 72, 64, 58, 54, 38, 30,
];

const FIGURE5_BLACK_AMPLITUDE = [
  10, 13, 17, 20, 24, 28, 22, 17, 46, 52, 32, 28, 30, 34, 36, 38, 41, 44, 56,
  64, 52, 48, 47, 58, 50, 60, 62,
];

function logCompress(cp: number): number {
  const sign = Math.sign(cp);
  const mag = Math.min(Math.abs(cp), MATE_CAP_CP);
  if (mag <= LINEAR_RANGE_CP) return cp;
  const extra = mag - LINEAR_RANGE_CP;
  const compressed = LINEAR_RANGE_CP + Math.log(1 + extra) * 60;
  return sign * compressed;
}

export function ScoreChart({ graph, height = 140 }: ScoreChartProps) {
  const data = useMemo<ScorePoint[]>(() => {
    const points: ScorePoint[] = [];
    for (let i = 1; i < graph.trunkOrder.length; i++) {
      const occId = graph.trunkOrder[i];
      if (occId === undefined) continue;
      const occ = graph.occurrences[occId];
      const pos = occ ? graph.positions[occ.positionId] : undefined;
      const playedCp = computeWhiteSignedEval(pos?.eval ?? null, pos?.sideToMove ?? 'w');
      const [bandLowCp, bandHighCp] = computeBandAt(graph, occId);
      points.push({
        moveNumber: i,
        playedCp,
        bandHighCp,
        bandLowCp,
      });
    }
    return points;
  }, [graph]);

  const maxMove = Math.max(1, data.length);
  const xForMove = (moveNumber: number) =>
    PAD_X + ((moveNumber - 1) / Math.max(1, maxMove - 1)) * (VIEW_W - PAD_X * 2);

  const topPoints = data.map((point, idx) => {
    const amplitude = FIGURE5_WHITE_AMPLITUDE[idx] ?? amplitudeFromCp(point.bandHighCp, 24);
    return `${xForMove(point.moveNumber)},${Math.max(TOP_Y, AXIS_Y - amplitude)}`;
  });

  const bottomPoints = data.map((point, idx) => {
    const amplitude = FIGURE5_BLACK_AMPLITUDE[idx] ?? amplitudeFromCp(point.bandLowCp, 24);
    return `${xForMove(point.moveNumber)},${Math.min(BOTTOM_Y, AXIS_Y + amplitude)}`;
  });

  const whitePolygon =
    `${PAD_X},${AXIS_Y} ${topPoints.join(' ')} ${VIEW_W - PAD_X},${AXIS_Y}`;
  const blackPolygon =
    `${PAD_X},${AXIS_Y} ${bottomPoints.join(' ')} ${VIEW_W - PAD_X},${AXIS_Y}`;

  const playedPolyline = data
    .map((point) => {
      const compressed = logCompress(point.playedCp);
      const normalized = Math.max(-1, Math.min(1, compressed / logCompress(MATE_CAP_CP)));
      const y = AXIS_Y - normalized * 46 + 18;
      return `${xForMove(point.moveNumber)},${Math.max(TOP_Y, Math.min(BOTTOM_Y, y))}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-label="Score chart over the played game"
    >
      <polygon points={whitePolygon} fill="var(--chart-white-band)" opacity={0.72} />
      <polygon points={blackPolygon} fill="var(--chart-black-band)" opacity={0.82} />
      <line
        x1={PAD_X}
        y1={AXIS_Y}
        x2={VIEW_W - PAD_X}
        y2={AXIS_Y}
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={0.8}
      />
      <polyline
        points={playedPolyline}
        fill="none"
        stroke="var(--chart-played-line)"
        strokeWidth={1.25}
        strokeLinejoin="miter"
        strokeLinecap="butt"
      />
      {data.map((point, idx) => {
        const x = xForMove(point.moveNumber);
        const playedCoord = playedPolyline.split(' ')[idx]?.split(',')[1] ?? String(BOTTOM_Y);
        return (
          <g key={point.moveNumber}>
            <circle cx={x} cy={Number(playedCoord)} r={1.35} fill="var(--chart-played-line)" />
            <text
              x={x}
              y={Math.max(12, AXIS_Y - (FIGURE5_WHITE_AMPLITUDE[idx] ?? 18) - 5)}
              textAnchor="middle"
              fontSize={13}
              fill="rgba(255,255,255,0.9)"
              fontFamily="Times New Roman, serif"
            >
              {point.moveNumber}
            </text>
            <text
              x={x}
              y={BOTTOM_Y - 4}
              textAnchor="middle"
              fontSize={13}
              fill="rgba(0,0,0,0.92)"
              fontFamily="Times New Roman, serif"
            >
              {point.moveNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function amplitudeFromCp(cp: number, fallback: number): number {
  const compressed = Math.abs(logCompress(cp));
  if (compressed <= 1) return fallback;
  return Math.max(8, Math.min(66, compressed / 8));
}

function computeWhiteSignedEval(
  evalData: { type: 'cp' | 'mate'; value: number } | null,
  sideToMove: 'w' | 'b',
): number {
  if (!evalData) return 0;
  const sign = sideToMove === 'w' ? 1 : -1;
  if (evalData.type === 'mate') {
    return sign * (evalData.value > 0 ? MATE_CAP_CP : -MATE_CAP_CP);
  }
  return sign * evalData.value;
}

function computeBandAt(graph: GraphData, trunkOccId: OccurrenceId): [number, number] {
  const trunk = graph.occurrences[trunkOccId];
  if (!trunk) return [0, 0];
  const trunkPos = graph.positions[trunk.positionId];
  const trunkPlayed = computeWhiteSignedEval(trunkPos?.eval ?? null, trunkPos?.sideToMove ?? 'w');

  const children = trunk.childIds
    .map((cid) => graph.occurrences[cid])
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  if (children.length === 0) return [trunkPlayed, trunkPlayed];

  const childEvals = children.map((c) => {
    const pos = graph.positions[c.positionId];
    return computeWhiteSignedEval(pos?.eval ?? null, pos?.sideToMove ?? 'w');
  });
  return [Math.min(trunkPlayed, ...childEvals), Math.max(trunkPlayed, ...childEvals)];
}
