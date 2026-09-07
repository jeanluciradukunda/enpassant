// SPDX-License-Identifier: GPL-3.0-or-later
import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react';
import type { EvoEdgeData } from '@/types/model';

type PaperEdgeProps = EdgeProps<Edge<EvoEdgeData>>;

/**
 * Paper-style edge renderer.
 *
 * React Flow's stock edges are too regular for the TVCG figures. This custom
 * renderer keeps the paper grammar explicit:
 *   - played trunk: heavy straight segments with hard elbows when y changes.
 *   - one-move branch: solid arrow with a straight exit and curved body.
 *   - shortened multi-move branch: dotted arrow with the same route grammar.
 */
export function EvoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: PaperEdgeProps) {
  const route = data?.route ?? 'branch-curve';
  const bend = data?.bend ?? 0;
  const path =
    route === 'trunk'
      ? straightPath(sourceX, sourceY, targetX, targetY)
      : route === 'branch-step'
        ? stepPath(sourceX, sourceY, targetX, targetY)
        : curvedPath(sourceX, sourceY, targetX, targetY, bend, route === 'branch-long-curve');

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={route === 'trunk' ? 14 : 10}
    />
  );
}

function straightPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  if (Math.abs(targetY - sourceY) < 1) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  const elbowX = sourceX + Math.max(8, (targetX - sourceX) * 0.58);
  return `M ${sourceX} ${sourceY} H ${elbowX} V ${targetY} H ${targetX}`;
}

function curvedPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  bend: number,
  isLong: boolean,
): string {
  const dx = Math.max(12, targetX - sourceX);
  const dy = targetY - sourceY;
  const side = Math.sign(dy || bend || 1);
  const exitX = sourceX + Math.min(isLong ? 48 : 36, dx * 0.58);
  const entryX = targetX - Math.min(14, dx * 0.18);
  const lift = isLong ? 46 : 24;
  const c1x = exitX + dx * (isLong ? 0.08 : 0.16);
  const c2x = sourceX + dx * (isLong ? 0.7 : 0.58);
  const c1y = sourceY + side * lift + bend;
  const c2y = targetY - side * lift - bend * 0.35;
  return [
    `M ${sourceX} ${sourceY}`,
    `H ${exitX}`,
    `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${entryX} ${targetY}`,
    `H ${targetX}`,
  ].join(' ');
}

function stepPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const dx = Math.max(8, targetX - sourceX);
  if (Math.abs(targetY - sourceY) < 2) {
    return `M ${sourceX} ${sourceY} H ${targetX}`;
  }

  const elbowX = sourceX + dx * 0.68;
  return `M ${sourceX} ${sourceY} H ${elbowX} V ${targetY} H ${targetX}`;
}
