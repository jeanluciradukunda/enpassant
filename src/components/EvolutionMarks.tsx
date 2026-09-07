import { useMemo } from 'react';
import { descendants, visibleAt } from '../lib/evolution';
import { moveLabel } from '../lib/games';
import { eventFill } from '../lib/semantics';
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
}
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
}: MarksProps) {
  const included = useMemo(
    () => (isolated ? descendants(graph, selected.id) : null),
    [graph, isolated, selected.id],
  );
  const visible = (id: string) => {
    const n = graph.byId.get(id);
    return n && visibleAt(n, cursor, overview, exploringPly);
  };
  const vertices = graph.vertices.flatMap((v) => {
    const members = v.members.filter(visible);
    if (!members.length) return [];
    const id = members.includes(selected.id)
      ? selected.id
      : (members.find((id) => graph.byId.get(id)?.played) ?? members[0]);
    return [{ node: graph.byId.get(id)!, members }];
  });
  const drawn = new Set(vertices.flatMap((v) => v.members));
  const edges = graph.edges.flatMap((e) => {
    const paths = e.paths.filter((path) => path.every(visible));
    if (!paths.length) return [];
    return [{ ...e, paths }];
  });
  const lit = included ? (ids: string[]) => ids.some((id) => included.has(id)) : () => true;
  return (
    <g data-testid={detail ? 'detail-marks' : 'evolution-marks'}>
      <defs>
        <marker
          id={detail ? 'lens-arrow' : 'evolution-arrow'}
          viewBox="0 0 6 6"
          refX="5.5"
          refY="3"
          markerUnits="userSpaceOnUse"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M0 0L6 3L0 6Z" fill="#101a12" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const recurrence = edge.kind === 'recurrence';
        const compressed = !recurrence && edge.paths.some((p) => p.length > 2);
        const dim = !lit(edge.paths.flat());
        const path = edge.paths[0];
        const d = edge.d;
        return (
          <g key={edge.id} opacity={dim ? 0.1 : 1}>
            <path
              data-edge={edge.id}
              data-compressed={compressed}
              data-recurrence={recurrence || undefined}
              className="branch-edge"
              d={d}
              fill="none"
              stroke={recurrence ? '#536c55' : '#111b13'}
              strokeWidth={edge.weight}
              strokeDasharray={recurrence ? '4 2' : compressed ? '1.1 1.65' : undefined}
              markerEnd={`url(#${detail ? 'lens-arrow' : 'evolution-arrow'})`}
            >
              <title>
                {recurrence
                  ? 'Return to an earlier occurrence of this position · relationship, not an extra move'
                  : edge.quality === undefined
                    ? 'Continuation · no comparable local evaluation'
                    : `Local move quality ${edge.quality.toFixed(1)} / 30 · compare siblings only`}
              </title>
            </path>
            {compressed && !detail && (
              <path
                d={d}
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
                <title>{path.length - 1} moves · Click to unfold this quiet sequence</title>
              </path>
            )}
          </g>
        );
      })}
      {visible(selected.id) && !drawn.has(selected.id) && (
        <circle
          data-selected-hidden
          cx={selected.x}
          cy={selected.y}
          r="4"
          stroke="#ee001b"
          strokeWidth="1"
          fill="none"
          pointerEvents="none"
        />
      )}
      {vertices.map(({ node, members }) => {
        const side = node.turn === 'w' ? '#fff' : '#090e0a';
        const fill = eventFill(node);
        const isSelected = members.includes(selected.id);
        return (
          <g
            key={members[0]}
            data-position={node.id}
            data-played={node.played}
            data-ply={node.ply}
            data-x={node.x}
            data-y={node.y}
            data-members={members.length}
            data-continuation-end={node.continuationEnd}
            data-event={
              node.mate ? 'mate' : node.draw ? 'draw' : node.check ? node.checkQuality : undefined
            }
            className="evolution-node"
            opacity={lit(members) ? 1 : 0.1}
            role={detail ? undefined : 'button'}
            tabIndex={detail ? undefined : isSelected ? 0 : -1}
            aria-label={`${moveLabel(node)}, ${node.played ? 'played' : 'alternative'}${node.check ? ', check' : ''}${node.mate ? ', checkmate' : ''}`}
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
              r={node.played ? 9 : 5.5}
              fill="transparent"
              className="node-hit"
            />
            {node.played ? (
              <>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="6.8"
                  fill={fill}
                  stroke={side}
                  strokeWidth="1.65"
                />
                <text
                  x={node.x}
                  y={node.y + 2.8}
                  fontSize="8.7"
                  fontFamily="Georgia,serif"
                  textAnchor="middle"
                  fill={fill === '#fff' ? '#090e0a' : fill === '#090e0a' ? '#fff' : side}
                >
                  {String(node.moveNumber).padStart(2, '0')}
                </text>
              </>
            ) : (
              <rect
                x={node.x - 2.6}
                y={node.y - 2.6}
                width="5.2"
                height="5.2"
                fill={fill}
                stroke="#101a12"
                strokeWidth=".65"
              />
            )}
            {node.mate && (
              <path
                d={`M${node.x - 2.8} ${node.y + 2}L${node.x - 3.5} ${node.y - 2}L${node.x - 1.3} ${node.y - 0.6}L${node.x} ${node.y - 3.5}L${node.x + 1.3} ${node.y - 0.6}L${node.x + 3.5} ${node.y - 2}L${node.x + 2.8} ${node.y + 2}Z`}
                fill="#ed001b"
              />
            )}
            {isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={node.played ? 10 : 6}
                fill="none"
                stroke="#ee001b"
                strokeWidth="1"
              />
            )}
            <title>
              {moveLabel(node)}
              {node.continuationEnd === 'display-limit'
                ? ' · Display horizon, not a terminal position'
                : node.continuationEnd === 'pv-end'
                  ? ' · End of returned line, not a forced ending'
                  : ''}
              {members.length > 1 ? ` · ${members.length} routes reach this position` : ''}
              {node.mate
                ? ' · Checkmate'
                : node.draw
                  ? ' · Draw'
                  : node.check
                    ? ` · Check (${node.checkQuality ?? 'unassessed'})`
                    : ''}
            </title>
          </g>
        );
      })}
    </g>
  );
}
