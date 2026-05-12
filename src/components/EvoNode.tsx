// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { Handle, Position as HandlePosition, type NodeProps } from '@xyflow/react';
import type { EvoNodeData } from '@/types/model';

/**
 * Custom React Flow node renderer.
 *
 * Trunk: white circle, black border, black numeral. Inverse on selection.
 * Alt:   white/gray/black-filled square, border = side-to-move.
 * Mate:  small saturated red crown overlay in top-right corner.
 *
 * Per SPEC §6 visual encoding.
 */

const TRUNK_DIAMETER = 18;
const ALT_SIDE = 14;
const CROWN_SIZE = 8;

type Props = NodeProps & { data: EvoNodeData };

function EvoNodeImpl({ data }: Props) {
  return data.kind === 'trunk' ? <TrunkNode data={data} /> : <AltNode data={data} />;
}

function TrunkNode({ data }: { data: EvoNodeData }) {
  const fill = data.isSelected ? 'var(--trunk-fill-selected)' : 'var(--trunk-fill)';
  const text = data.isSelected ? 'var(--trunk-text-selected)' : 'var(--trunk-text)';
  return (
    <svg
      width={TRUNK_DIAMETER}
      height={TRUNK_DIAMETER}
      viewBox={`0 0 ${TRUNK_DIAMETER} ${TRUNK_DIAMETER}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Move ${data.moveNumber ?? ''}${data.isSelected ? ' (selected)' : ''}`}
    >
      <Handle type="target" position={HandlePosition.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={HandlePosition.Right} style={{ opacity: 0 }} />
      <circle
        cx={TRUNK_DIAMETER / 2}
        cy={TRUNK_DIAMETER / 2}
        r={TRUNK_DIAMETER / 2 - 1}
        fill={fill}
        stroke="var(--trunk-border)"
        strokeWidth={1}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={9}
        fontWeight={500}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fill={text}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {data.moveNumber}
      </text>
      {data.isCheckmate ? <Crown anchor="topRight" parentSize={TRUNK_DIAMETER} /> : null}
    </svg>
  );
}

function AltNode({ data }: { data: EvoNodeData }) {
  const fill =
    data.fill === 'white'
      ? 'var(--alt-fill-white)'
      : data.fill === 'black'
        ? 'var(--alt-fill-black)'
        : 'var(--alt-fill-tie)';
  const border =
    data.borderColor === 'black' ? 'var(--alt-border-black)' : 'var(--alt-border-white)';
  return (
    <svg
      width={ALT_SIDE}
      height={ALT_SIDE}
      viewBox={`0 0 ${ALT_SIDE} ${ALT_SIDE}`}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`Engine alternative${data.isCheckmate ? ' (checkmate)' : ''}`}
    >
      <Handle type="target" position={HandlePosition.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={HandlePosition.Right} style={{ opacity: 0 }} />
      <rect
        x={0.5}
        y={0.5}
        width={ALT_SIDE - 1}
        height={ALT_SIDE - 1}
        fill={fill}
        stroke={border}
        strokeWidth={1}
      />
      {data.isCheckmate ? <Crown anchor="topRight" parentSize={ALT_SIDE} /> : null}
    </svg>
  );
}

/**
 * Tiny saturated red crown overlay. Pop comes from saturation against the
 * desaturated palette, not size. ~6-8 px per SPEC.
 */
function Crown({ anchor, parentSize }: { anchor: 'topRight'; parentSize: number }) {
  void anchor;
  // Position the crown so that its right edge sits just past the parent's right edge.
  const x = parentSize - CROWN_SIZE / 2;
  const y = -CROWN_SIZE / 2;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path
        d={`M 0 ${CROWN_SIZE}
            L 0 ${CROWN_SIZE * 0.45}
            L ${CROWN_SIZE * 0.2} ${CROWN_SIZE * 0.7}
            L ${CROWN_SIZE * 0.5} ${CROWN_SIZE * 0.2}
            L ${CROWN_SIZE * 0.8} ${CROWN_SIZE * 0.7}
            L ${CROWN_SIZE} ${CROWN_SIZE * 0.45}
            L ${CROWN_SIZE} ${CROWN_SIZE}
            Z`}
        fill="var(--checkmate-crown)"
        stroke="var(--checkmate-crown)"
        strokeWidth={0.5}
      />
    </g>
  );
}

export const EvoNode = memo(EvoNodeImpl, (prev, next) => {
  const a = prev.data;
  const b = next.data;
  return (
    a.kind === b.kind &&
    a.moveNumber === b.moveNumber &&
    a.fill === b.fill &&
    a.borderColor === b.borderColor &&
    a.isCheckmate === b.isCheckmate &&
    a.isSelected === b.isSelected &&
    a.classification === b.classification &&
    a.isAnalyzing === b.isAnalyzing
  );
});
EvoNode.displayName = 'EvoNode';
