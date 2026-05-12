// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { GraphData, OccurrenceId } from '@/types/model';

/**
 * Translucent area bands + played-eval line.
 *
 * X-axis is aligned to the trunk's x-axis: move N in the chart sits below
 * trunk circle N in the graph. Y-axis is sign-symmetric; the values are
 * passed through a `logCompress` so a swing of +/-100 cp is visible alongside
 * +/-2000 cp.
 *
 * Two area bands (white above 0, dark gray below 0) represent the spread of
 * curated continuation evals at each move (V2 fills this with real PV data;
 * V0 fixture provides synthesized band amplitudes).
 */

export interface ScoreChartProps {
  graph: GraphData;
  /** Optional explicit pixel width matching the graph above. */
  width?: number;
  height?: number;
}

interface ScorePoint {
  moveNumber: number;
  played: number;
  bandHigh: number;
  bandLow: number;
}

const MATE_CAP_CP = 2000;
const LINEAR_RANGE_CP = 100;

/**
 * Sign-preserving compression: linear in [-LINEAR_RANGE_CP, +LINEAR_RANGE_CP],
 * log-compressed beyond, capped at ±MATE_CAP_CP.
 */
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
    for (let i = 0; i < graph.trunkOrder.length; i++) {
      const occId = graph.trunkOrder[i];
      if (occId === undefined) continue;
      const occ = graph.occurrences[occId];
      const pos = occ ? graph.positions[occ.positionId] : undefined;
      const playedCp = computeWhiteSignedEval(pos?.eval ?? null, pos?.sideToMove ?? 'w');
      const [bandLow, bandHigh] = computeBandAt(graph, occId);
      points.push({
        moveNumber: i + 1,
        played: logCompress(playedCp),
        bandHigh: logCompress(Math.max(bandHigh, playedCp)),
        bandLow: logCompress(Math.min(bandLow, playedCp)),
      });
    }
    return points;
  }, [graph]);

  const yDomain: [number, number] = [logCompress(-MATE_CAP_CP), logCompress(MATE_CAP_CP)];

  return (
    <div style={{ width: '100%', height }} aria-label="Score chart over the played game">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis
            dataKey="moveNumber"
            type="number"
            domain={[1, Math.max(1, data.length)]}
            ticks={data.map((p) => p.moveNumber)}
            tick={{ fontSize: 9, fill: 'var(--text-primary)' }}
            axisLine={{ stroke: 'rgba(0,0,0,0.2)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            type="number"
            domain={yDomain}
            tick={false}
            axisLine={false}
            tickLine={false}
            width={0}
          />
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />
          {/* Black band: y from 0 down to bandLow */}
          <Area
            type="monotone"
            dataKey="bandLow"
            stroke="none"
            fill="var(--chart-black-band)"
            isAnimationActive={false}
            connectNulls
          />
          {/* White band: y from 0 up to bandHigh */}
          <Area
            type="monotone"
            dataKey="bandHigh"
            stroke="none"
            fill="var(--chart-white-band)"
            isAnimationActive={false}
            connectNulls
          />
          {/* Played-eval line on top */}
          <Line
            type="monotone"
            dataKey="played"
            stroke="var(--chart-played-line)"
            strokeWidth={1}
            dot={{ r: 1.5, fill: 'var(--chart-played-line)', stroke: 'none' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Eval normalized to white's perspective (positive = good for white).
 * Stockfish gives evals from side-to-move perspective; flip for black.
 */
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

/**
 * Compute the [low, high] band amplitude at a played Occurrence as the range
 * of curated continuation evals at that ply.
 */
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
