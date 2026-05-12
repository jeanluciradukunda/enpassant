// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { EvoEdgeData } from '@/types/model';

/**
 * Custom React Flow edge.
 *
 * Per SPEC §2 Edges + Figure 3 legend:
 *  - Solid arrow with arrowhead          = one move to the next position.
 *  - Dotted/ticked arrow with arrowhead  = several moves to the next position
 *    (a compressed chain from the two-neighbor shortening pass).
 *  - Trunk-to-trunk edges form a visibly heavier spine.
 *  - Per-source-Occurrence thickness (logical 1..30 → ~1-3 device px) modulates
 *    branch edges by relative eval delta.
 *
 * Arrowheads are rendered via SVG <marker> defs in `EvoGraph` so every edge
 * inherits them by reference.
 */

const PX_PER_LOGICAL_UNIT = 0.1;
const TRUNK_EDGE_PX = 2.4;

type Props = EdgeProps & { data?: EvoEdgeData };

function EvoEdgeImpl(props: Props) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } =
    props;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 4,
  });

  const isTrunkEdge = data?.kind === 'trunk';
  const variant = data?.variant ?? 'solid';
  const isDotted = variant === 'dotted';

  // Trunk edges form the spine: heavy black strokes. Branch edges thin.
  const widthPx = isTrunkEdge
    ? TRUNK_EDGE_PX
    : Math.max(0.7, (data?.logicalThickness ?? 3) * PX_PER_LOGICAL_UNIT);

  const stroke = isTrunkEdge
    ? 'var(--edge-canonical)'
    : isDotted
      ? 'var(--edge-compressed)'
      : 'var(--edge-canonical)';

  // Tick-style dotted for compressed chains: round dots ending in arrowhead.
  const dashArray = isDotted ? '1 3' : undefined;

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke,
        strokeWidth: widthPx,
        strokeDasharray: dashArray,
        strokeLinecap: isDotted ? 'round' : 'butt',
        fill: 'none',
      }}
    />
  );
}

export const EvoEdge = memo(EvoEdgeImpl);
EvoEdge.displayName = 'EvoEdge';
