import { useMemo, type CSSProperties } from 'react';
import { continuationFocus, visibleAt } from '../lib/evolution';
import { moveLabel } from '../lib/games';
import { eventFill } from '../lib/semantics';
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
  const included = useMemo(
    () => (isolated ? continuationFocus(graph, selected.id) : null),
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
    return [
      {
        node: graph.byId.get(id)!,
        members,
        played: members.some((id) => graph.byId.get(id)!.played),
        drawRelated: members.some((id) => graph.byId.get(id)!.draw),
      },
    ];
  });
  const drawn = new Set(vertices.flatMap((v) => v.members));
  const edges = graph.edges.flatMap((e) => {
    const paths = e.paths.filter((path) => path.every(visible));
    if (!paths.length) return [];
    return [{ ...e, paths }];
  });
  const lit = included ? (ids: string[]) => ids.some((id) => included.nodes.has(id)) : () => true;
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
      {edges.map((edge) => {
        const recurrence = edge.kind === 'recurrence';
        const compressed = !recurrence && edge.paths.some((p) => p.length > 2);
        const dim =
          included &&
          !edge.paths.some((path) =>
            edge.kind === 'recurrence'
              ? path.every((id) => included.nodes.has(id))
              : path.slice(1).every((to, i) => included.steps.has(`${path[i]}→${to}`)),
          );
        const path = edge.paths[0];
        const d = edge.d;
        return (
          <g key={edge.id} opacity={dim ? 0.1 : 1}>
            <path
              data-edge={edge.id}
              data-compressed={compressed}
              data-recurrence={recurrence || edge.kind === 'return' || undefined}
              className="branch-edge"
              d={d}
              fill="none"
              stroke={style.ink}
              strokeWidth={compressed ? style.compressedWidth : edge.weight}
              strokeDasharray={recurrence ? '4 2' : compressed ? style.compressedDash : undefined}
              markerEnd={`url(#${detail ? 'lens-arrow' : 'evolution-arrow'})`}
            >
              <title>
                {recurrence
                  ? 'Return to an earlier occurrence of this position · relationship, not an extra move'
                  : compressed
                    ? `${path.length - 1} plies · quiet positions folded; tick count does not count moves`
                    : edge.kind === 'return'
                      ? 'Move returns to a shared position · select a route to inspect its history'
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
                <title>{`${path.length - 1} moves · Click to unfold this quiet sequence`}</title>
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
          stroke={style.selection}
          strokeWidth="1"
          fill="none"
          pointerEvents="none"
        />
      )}
      {vertices.map(({ node, members, played, drawRelated }) => {
        const side = node.turn === 'w' ? '#fff' : style.ink;
        const fill = eventFill(node, checkMode, drawRelated);
        const isSelected = members.includes(selected.id);
        const origin = graph.unfoldOrigins?.[node.id];
        return (
          <g
            key={members[0]}
            data-position={node.id}
            data-played={played}
            data-ply={node.ply}
            data-draw-related={drawRelated || undefined}
            data-x={node.x}
            data-y={node.y}
            data-members={members.length}
            data-continuation-end={node.continuationEnd}
            data-event={
              node.mate ? 'mate' : node.draw ? 'draw' : node.check ? node.checkQuality : undefined
            }
            className={`evolution-node${origin ? ' unfolded-node' : ''}`}
            style={
              origin
                ? ({
                    '--unfold-x': `${origin.x - node.x}px`,
                    '--unfold-y': `${origin.y - node.y}px`,
                  } as CSSProperties)
                : undefined
            }
            opacity={lit(members) ? 1 : 0.1}
            role={detail ? undefined : 'button'}
            tabIndex={detail ? undefined : isSelected ? 0 : -1}
            aria-label={`${moveLabel(node)}, ${played ? 'played' : 'alternative'}${node.check ? ', check' : ''}${node.mate ? ', checkmate' : ''}`}
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
                  stroke={side}
                  strokeWidth="1.65"
                />
                <text
                  x={node.x}
                  y={node.y + 2.8}
                  fontSize="8.7"
                  fontFamily="Georgia,serif"
                  textAnchor="middle"
                  fill={fill === '#fff' ? style.ink : fill === style.ink ? '#fff' : side}
                >
                  {String(
                    graph.byId.get(members.find((id) => graph.byId.get(id)!.played) ?? node.id)!
                      .moveNumber,
                  ).padStart(2, '0')}
                </text>
              </>
            ) : (
              <rect
                x={node.x - style.squareSide / 2}
                y={node.y - style.squareSide / 2}
                width={style.squareSide}
                height={style.squareSide}
                fill={fill}
                stroke={fill === style.green ? style.ink : fill}
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
            {isSelected && (
              <circle
                cx={node.x}
                cy={node.y}
                r={played ? 10 : 6}
                fill="none"
                stroke={style.selection}
                strokeWidth="1"
              />
            )}
            <title>
              {[
                moveLabel(node),
                node.continuationEnd === 'display-limit'
                  ? ' · Display horizon, not a terminal position'
                  : node.continuationEnd === 'pv-end'
                    ? ' · End of returned line, not a forced ending'
                    : '',
                members.length > 1 ? ` · ${members.length} routes reach this position` : '',
                drawRelated && !node.draw
                  ? ' · Another route reaches a draw here; this history can continue'
                  : '',
                node.mate
                  ? ' · Checkmate'
                  : node.draw
                    ? ' · Draw'
                    : node.check
                      ? ` · Check (${node.checkQuality ?? 'unassessed'})`
                      : '',
              ].join('')}
            </title>
          </g>
        );
      })}
    </g>
  );
}
