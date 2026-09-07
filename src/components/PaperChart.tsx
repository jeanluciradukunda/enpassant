// SPDX-License-Identifier: GPL-3.0-or-later
import { figure5, nodeById } from '@/lib/paper';
import type { PaperNode } from '@/types/paper';

export function PaperChart({ onSelect }: { onSelect: (node: PaperNode) => void }) {
  return (
    <g data-testid="score-chart">
      {figure5.chart.map((band, index) => (
        <path key={index} {...band} stroke="none" pointerEvents="none" />
      ))}
      <path
        d="M7.329 139.429H340.6"
        stroke="white"
        strokeWidth={0.2357}
        opacity={0.5}
        pointerEvents="none"
      />
      {figure5.points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={0.25}
          fill={point.color}
          pointerEvents="none"
        />
      ))}
      {figure5.labels.map((label, index) => (
        <text
          key={index}
          x={label.x}
          y={label.y}
          fill={label.fill}
          fontSize={label.size}
          fontFamily="Bookman Old Style, Georgia, serif"
          pointerEvents="none"
        >
          {label.text}
        </text>
      ))}
      {figure5.trunk.map((id) => {
        const node = nodeById.get(id)!;
        return (
          <rect
            key={id}
            data-chart-ply={node.ply}
            x={node.x - 3.1259}
            y="115"
            width="6.2518"
            height="48"
            fill="transparent"
            className="chart-target"
            onClick={() => onSelect(node)}
          >
            <title>{`Move ${node.move} · ${node.side} — select in graph`}</title>
          </rect>
        );
      })}
    </g>
  );
}
