// SPDX-License-Identifier: GPL-3.0-or-later
import { memo } from 'react';
import { describeNode, figure5 } from '@/lib/paper';
import type { PaperNode } from '@/types/paper';

interface Props {
  selectedId: string;
  emphasized: Set<string> | null;
  interactive?: boolean;
  onSelect?: (node: PaperNode) => void;
}

/** Native SVG primitives retain the paper's routing and remain individually addressable. */
export const PaperGraph = memo(function PaperGraph({
  selectedId,
  emphasized,
  interactive,
  onSelect,
}: Props) {
  return (
    <g className="paper-graph" data-testid={interactive ? 'paper-graph' : 'detail-graph'}>
      <rect x="6.765" y="10.174" width="370.915" height="100.427" fill="#9dcd9b" />
      <g pointerEvents="none" stroke="#000" strokeLinecap="butt" strokeLinejoin="miter">
        {figure5.edges.map((edge) => (
          <g
            key={edge.id}
            opacity={emphasized && !emphasized.has(edge.source) ? 0.12 : 1}
            data-edge={edge.id}
          >
            <path
              d={edge.d}
              strokeWidth={edge.width}
              strokeDasharray={edge.dash.join(' ') || undefined}
              fill="none"
            />
            <path d={edge.arrow} strokeWidth={0.0665} fill="#000" />
          </g>
        ))}
      </g>
      {figure5.nodes.map((node) => {
        const half = node.size / 2;
        const isTrunk = node.kind === 'trunk';
        return (
          <g
            key={node.id}
            data-node={node.id}
            data-kind={node.kind}
            data-ply={node.ply}
            transform={`translate(${node.x} ${node.y})`}
            opacity={emphasized && !emphasized.has(node.id) ? 0.15 : 1}
            role={interactive ? 'button' : undefined}
            aria-label={interactive ? describeNode(node) : undefined}
            aria-pressed={interactive ? selectedId === node.id : undefined}
            tabIndex={interactive && selectedId === node.id ? 0 : undefined}
            className={interactive ? 'paper-node' : undefined}
            onClick={interactive ? () => onSelect?.(node) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect?.(node);
                    }
                  }
                : undefined
            }
          >
            {interactive && <title>{describeNode(node)} — select to magnify</title>}
            {isTrunk ? (
              <>
                <circle r={half} fill={node.fill} stroke={node.border} strokeWidth={0.6651} />
                <text
                  y={0.5653}
                  textAnchor="middle"
                  fill={node.border}
                  fontSize={2.3278}
                  fontFamily="Arial, sans-serif"
                  pointerEvents="none"
                >
                  {String(node.move).padStart(2, '0')}
                </text>
              </>
            ) : (
              <rect
                x={-half}
                y={-half}
                width={node.size}
                height={node.size}
                fill={node.fill}
                stroke={node.border}
                strokeWidth={0.133}
              />
            )}
            {node.mate && <path d="M-.85 .7V-.6L-.43-.2 0-.95 .43-.2 .85-.6V.7Z" fill="#f00017" />}
            {interactive && (
              <circle r={isTrunk ? 2.7 : 1.4} fill="transparent" className="node-target" />
            )}
          </g>
        );
      })}
    </g>
  );
});
