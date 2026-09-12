import { useMemo, type CSSProperties } from 'react';
import { buildScene } from '../lib/graphScene';
import { diagramStyle as style, type CheckMode } from '../lib/diagramStyle';
import type { EvolutionGraph, EvolutionNode } from '../types/game';

export interface MarksProps {
  graph: EvolutionGraph;
  cursor: number;
  overview: boolean;
  exploringPly?: number | null;
  selected: EvolutionNode;
  isolated: boolean;
  onSelect: (node: EvolutionNode) => void;
  onUnfold?: (path: string[]) => void;
  detail?: boolean;
  checkMode?: CheckMode;
}
/** Native SVG marks. This is the server-side renderer for research scripts and
 * the fallback when WebGL2 is unavailable; the browser normally paints the same
 * scene with `GraphRenderer` and only keeps invisible hit targets in the DOM. */
export function EvolutionMarks({
  graph,
  cursor,
  overview,
  exploringPly,
  selected,
  isolated,
  onSelect,
  onUnfold,
  detail = false,
  checkMode = 'retained',
}: MarksProps) {
  const scene = useMemo(
    () => buildScene({ graph, cursor, overview, exploringPly, selected, isolated, checkMode }),
    [graph, cursor, overview, exploringPly, selected, isolated, checkMode],
  );
  return (
    <g data-testid={detail ? 'detail-marks' : 'evolution-marks'}>
      <defs>
        <marker
          id={detail ? 'lens-arrow' : 'evolution-arrow'}
          viewBox="0 0 6 6"
          refX="6"
          refY="3"
          markerUnits="userSpaceOnUse"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M0 0L6 3L0 6Z" fill={style.ink} />
        </marker>
      </defs>
      {scene.edges.map(({ edge, path, repeat, compressed, dim, width, dash, title }) => (
        <g key={edge.id} opacity={dim ? 0.1 : 1}>
          <path
            data-edge={edge.id}
            data-compressed={compressed}
            data-recurrence={repeat || undefined}
            className="branch-edge"
            d={edge.d}
            fill="none"
            stroke={style.ink}
            strokeWidth={width}
            strokeDasharray={dash}
            markerEnd={`url(#${detail ? 'lens-arrow' : 'evolution-arrow'})`}
          >
            <title>{title}</title>
          </path>
          {compressed && !detail && (
            <path
              d={edge.d}
              className="compressed-target"
              fill="none"
              stroke="transparent"
              strokeWidth="8"
              role="button"
              tabIndex={-1}
              aria-label={`Expand ${path.length - 2} hidden positions`}
              onClick={() => {
                onUnfold?.(path);
                onSelect(graph.byId.get(path[1])!);
              }}
            >
              <title>{`${path.length - 1} moves · Click to unfold this quiet sequence`}</title>
            </path>
          )}
        </g>
      ))}
      {scene.selectedHidden && (
        <circle
          data-selected-hidden
          cx={selected.x}
          cy={selected.y}
          r="4"
          stroke={style.selection}
          strokeWidth="1"
          fill="none"
          pointerEvents="none"
        />
      )}
      {scene.vertices.map((vertex) => {
        const { node, members, played, drawRelated, fill, origin } = vertex;
        return (
          <g
            key={vertex.key}
            data-position={node.id}
            data-played={played}
            data-ply={node.ply}
            data-draw-related={drawRelated || undefined}
            data-x={node.x}
            data-y={node.y}
            data-members={members.length}
            data-continuation-end={node.continuationEnd}
            data-event={vertex.event}
            data-fill={fill}
            className={`evolution-node${origin ? ' unfolded-node' : ''}`}
            style={
              origin
                ? ({
                    '--unfold-x': `${origin.x - node.x}px`,
                    '--unfold-y': `${origin.y - node.y}px`,
                  } as CSSProperties)
                : undefined
            }
            opacity={vertex.lit ? 1 : 0.1}
            role={detail ? undefined : 'button'}
            tabIndex={detail ? undefined : vertex.selected ? 0 : -1}
            aria-label={vertex.ariaLabel}
            onClick={detail ? undefined : () => onSelect(node)}
            onKeyDown={
              detail
                ? undefined
                : (e) => {
                    if (e.key === 'Enter') onSelect(node);
                  }
            }
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={played ? 9 : 5.5}
              fill="transparent"
              className="node-hit"
            />
            {played ? (
              <>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={style.circleRadius}
                  fill={fill}
                  stroke={vertex.side}
                  strokeWidth="1.65"
                />
                <text
                  x={node.x}
                  y={node.y + 2.8}
                  fontSize="8.7"
                  fontFamily="Georgia,serif"
                  textAnchor="middle"
                  fill={vertex.labelColor}
                >
                  {vertex.label}
                </text>
              </>
            ) : (
              <rect
                x={node.x - style.squareSide / 2}
                y={node.y - style.squareSide / 2}
                width={style.squareSide}
                height={style.squareSide}
                fill={fill}
                stroke={vertex.stroke}
                strokeWidth=".65"
              />
            )}
            {node.mate && (
              <path
                transform={`translate(${node.x} ${node.y})`}
                d="M-.55-4.4H.55V-3.3H1.65V-2.3H.55V-1.4C2.7-3 4-1.2 2.5.4L1.9 1.5H-1.9L-2.5.4C-4-1.2-2.7-3-.55-1.4V-2.3H-1.65V-3.3H-.55ZM-2 2H2V2.9H-2Z"
                fill="#ed001b"
              />
            )}
            {vertex.selected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={played ? 10 : 6}
                fill="none"
                stroke={style.selection}
                strokeWidth="1"
              />
            )}
            <title>{vertex.title}</title>
          </g>
        );
      })}
    </g>
  );
}
