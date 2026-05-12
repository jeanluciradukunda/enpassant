// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { Handle, Position as HandlePosition, type NodeProps } from '@xyflow/react';
import type { EvoNodeData } from '@/types/model';

/**
 * Custom React Flow node renderer.
 *
 * Per Figure 3 legend + Figure 9 reference:
 *
 *   Trunk circle  — fill = the side that JUST moved at this position
 *                   (complement of side-to-move-next). Border = side-to-move-
 *                   next. Selected = inverse. Numeral inside.
 *   Alt square    — fill rule from SPEC §6: white/gray/black by side-with-
 *                   advantage. Border = side-to-move-next.
 *   Crown overlay — small red king crown ABOVE the node like a hat.
 *
 * Handles MUST be in HTML (not SVG) for React Flow to register their
 * positions. The visual is an absolutely-positioned `<svg>` overlay.
 */

const TRUNK_DIAMETER = 18;
const ALT_SIDE = 13;
const CROWN_WIDTH = 7;
const CROWN_HEIGHT = 5;

type Props = NodeProps & { data: EvoNodeData };

function EvoNodeImpl({ data }: Props) {
  const isTrunk = data.kind === 'trunk';
  const size = isTrunk ? TRUNK_DIAMETER : ALT_SIDE;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
      }}
    >
      <Handle
        type="target"
        position={HandlePosition.Left}
        style={{
          opacity: 0,
          width: 1,
          height: 1,
          minWidth: 1,
          minHeight: 1,
          background: 'transparent',
          border: 'none',
        }}
      />
      <Handle
        type="source"
        position={HandlePosition.Right}
        style={{
          opacity: 0,
          width: 1,
          height: 1,
          minWidth: 1,
          minHeight: 1,
          background: 'transparent',
          border: 'none',
        }}
      />
      {isTrunk ? <TrunkSvg data={data} /> : <AltSvg data={data} />}
    </div>
  );
}

function TrunkSvg({ data }: { data: EvoNodeData }) {
  const justMoved: 'w' | 'b' | null =
    data.moveNumber === 0 ? null : data.sideToMove === 'b' ? 'w' : 'b';
  const baseFill = justMoved === 'b' ? 'var(--trunk-fill-selected)' : 'var(--trunk-fill)';
  const baseText = justMoved === 'b' ? 'var(--trunk-text-selected)' : 'var(--trunk-text)';
  const fill = data.isSelected ? invert(baseFill) : baseFill;
  const text = data.isSelected ? invert(baseText) : baseText;
  const borderStroke =
    data.borderColor === 'black' ? 'var(--trunk-border)' : 'var(--alt-border-white)';
  const borderWidth = data.isSelected ? 2 : 1.2;

  return (
    <svg
      width={TRUNK_DIAMETER}
      height={TRUNK_DIAMETER}
      viewBox={`0 0 ${TRUNK_DIAMETER} ${TRUNK_DIAMETER}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      role="img"
      aria-label={`Move ${data.moveNumber ?? ''}${data.isSelected ? ' (selected)' : ''}`}
    >
      <circle
        cx={TRUNK_DIAMETER / 2}
        cy={TRUNK_DIAMETER / 2}
        r={TRUNK_DIAMETER / 2 - borderWidth / 2}
        fill={fill}
        stroke={borderStroke}
        strokeWidth={borderWidth}
      />
      <text
        x={TRUNK_DIAMETER / 2}
        y={TRUNK_DIAMETER / 2}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={9}
        fontWeight={600}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        fill={text}
        style={{ userSelect: 'none' }}
      >
        {data.moveNumber}
      </text>
      {data.isCheckmate ? <Crown parentWidth={TRUNK_DIAMETER} /> : null}
    </svg>
  );
}

function AltSvg({ data }: { data: EvoNodeData }) {
  // Paper-faithful fill rule (Figure 3 legend):
  //  - empty → no fill, just thin border (default — MOST positions)
  //  - white → White-gave-check (or White-gave-mate when isCheckmate)
  //  - black → Black-gave-check
  //  - tie   → draw event (50-move / threefold / stalemate / insufficient)
  //  - red   → Black-gave-mate
  let fill: string;
  switch (data.fill) {
    case 'white':
      fill = 'var(--alt-fill-white)';
      break;
    case 'black':
      fill = 'var(--alt-fill-black)';
      break;
    case 'tie':
      fill = 'var(--alt-fill-tie)';
      break;
    case 'red':
      fill = 'var(--checkmate-crown)';
      break;
    case 'empty':
    default:
      fill = 'transparent';
      break;
  }
  const border =
    data.borderColor === 'black' ? 'var(--alt-border-black)' : 'var(--alt-border-white)';

  return (
    <svg
      width={ALT_SIDE}
      height={ALT_SIDE}
      viewBox={`0 0 ${ALT_SIDE} ${ALT_SIDE}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      role="img"
      aria-label={`Engine alternative${data.isCheckmate ? ' (checkmate)' : ''}`}
    >
      <rect
        x={0.5}
        y={0.5}
        width={ALT_SIDE - 1}
        height={ALT_SIDE - 1}
        fill={fill}
        stroke={border}
        strokeWidth={1}
      />
      {data.isCheckmate ? <Crown parentWidth={ALT_SIDE} /> : null}
    </svg>
  );
}

function Crown({ parentWidth }: { parentWidth: number }) {
  const cx = parentWidth / 2;
  const top = -CROWN_HEIGHT - 1;
  const half = CROWN_WIDTH / 2;
  const d = `
    M ${cx - half} ${top + CROWN_HEIGHT}
    L ${cx - half} ${top + CROWN_HEIGHT * 0.45}
    L ${cx - half * 0.55} ${top + CROWN_HEIGHT * 0.75}
    L ${cx - half * 0.2} ${top + CROWN_HEIGHT * 0.15}
    L ${cx + half * 0.2} ${top + CROWN_HEIGHT * 0.75}
    L ${cx + half * 0.55} ${top + CROWN_HEIGHT * 0.15}
    L ${cx + half} ${top + CROWN_HEIGHT * 0.75}
    L ${cx + half} ${top + CROWN_HEIGHT}
    Z`;
  return (
    <path
      d={d}
      fill="var(--checkmate-crown)"
      stroke="var(--checkmate-crown)"
      strokeWidth={0.4}
      strokeLinejoin="round"
    />
  );
}

function invert(token: string): string {
  if (token === 'var(--trunk-fill)') return 'var(--trunk-fill-selected)';
  if (token === 'var(--trunk-fill-selected)') return 'var(--trunk-fill)';
  if (token === 'var(--trunk-text)') return 'var(--trunk-text-selected)';
  if (token === 'var(--trunk-text-selected)') return 'var(--trunk-text)';
  return token;
}

export const EvoNode = memo(EvoNodeImpl, (prev, next) => {
  const a = prev.data;
  const b = next.data;
  return (
    a.kind === b.kind &&
    a.moveNumber === b.moveNumber &&
    a.fill === b.fill &&
    a.borderColor === b.borderColor &&
    a.sideToMove === b.sideToMove &&
    a.isCheckmate === b.isCheckmate &&
    a.isSelected === b.isSelected &&
    a.classification === b.classification &&
    a.isAnalyzing === b.isAnalyzing
  );
});
EvoNode.displayName = 'EvoNode';
