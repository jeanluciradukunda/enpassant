// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { EvoEdgeData } from '@/types/model';

/**
 * Custom React Flow edge.
 *
 * Solid for canonical continuations; dotted for compressed chains.
 * Per-source-Occurrence logical thickness (1..30) is mapped to ~1..3 device
 * pixels by a global multiplier per SPEC §2 Edges block.
 */

const PX_PER_LOGICAL_UNIT = 0.1; // 1..30 logical → 0.1..3 device px

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
    borderRadius: 2,
  });

  const logicalThickness = data?.logicalThickness ?? 3;
  const widthPx = Math.max(0.6, logicalThickness * PX_PER_LOGICAL_UNIT);
  const isDotted = data?.variant === 'dotted';
  const stroke = isDotted ? 'var(--edge-compressed)' : 'var(--edge-canonical)';

  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke,
        strokeWidth: widthPx,
        strokeDasharray: isDotted ? '3 2' : undefined,
        fill: 'none',
      }}
    />
  );
}

export const EvoEdge = memo(EvoEdgeImpl);
EvoEdge.displayName = 'EvoEdge';
