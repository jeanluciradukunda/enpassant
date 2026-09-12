import { memo } from 'react';
import type { GraphScene, SceneEdge, SceneVertex } from '../lib/graphScene';
import type { EvolutionNode } from '../types/game';

interface Props {
  scene: GraphScene;
  byId: Map<string, EvolutionNode>;
  onSelect: (node: EvolutionNode) => void;
  onUnfold?: (path: string[]) => void;
}

/** Invisible hit targets over the WebGL canvas. They carry the data
 * attributes, tooltips, focus order and click handlers the SVG marks had, so
 * keyboard users, tests and research scripts see the same graph. Every item
 * is memoised on its scene object, which `buildScene` keeps stable while the
 * glyph is unchanged; camera changes only touch the parent's `viewBox`. */
export const HitMarks = memo(function HitMarks({ scene, byId, onSelect, onUnfold }: Props) {
  return (
    <g data-testid="evolution-marks">
      {scene.edges.map((item) => (
        <EdgeHit
          key={item.edge.id}
          item={item}
          byId={byId}
          onSelect={onSelect}
          onUnfold={onUnfold}
        />
      ))}
      {scene.vertices.map((vertex) => (
        <VertexHit key={vertex.key} vertex={vertex} onSelect={onSelect} />
      ))}
    </g>
  );
});

const EdgeHit = memo(function EdgeHit({
  item: { edge, path, repeat, compressed, dim, width, title },
  byId,
  onSelect,
  onUnfold,
}: {
  item: SceneEdge;
  byId: Map<string, EvolutionNode>;
  onSelect: (node: EvolutionNode) => void;
  onUnfold?: (path: string[]) => void;
}) {
  return (
    <path
      data-edge={edge.id}
      data-compressed={compressed}
      data-recurrence={repeat || undefined}
      className={compressed ? 'branch-hit compressed-target' : 'branch-hit'}
      d={edge.d}
      fill="none"
      stroke="transparent"
      strokeWidth={compressed ? 8 : Math.max(width, 1.5)}
      opacity={dim ? 0.1 : 1}
      role={compressed ? 'button' : undefined}
      tabIndex={compressed ? -1 : undefined}
      aria-label={compressed ? `Expand ${path.length - 2} hidden positions` : undefined}
      onClick={
        compressed
          ? () => {
              onUnfold?.(path);
              onSelect(byId.get(path[1])!);
            }
          : undefined
      }
    >
      <title>
        {compressed ? `${path.length - 1} moves · Click to unfold this quiet sequence` : title}
      </title>
    </path>
  );
});

const VertexHit = memo(function VertexHit({
  vertex,
  onSelect,
}: {
  vertex: SceneVertex;
  onSelect: (node: EvolutionNode) => void;
}) {
  const { node, members, played, drawRelated, fill } = vertex;
  return (
    <g
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
      className="evolution-node"
      opacity={vertex.lit ? 1 : 0.1}
      role="button"
      tabIndex={vertex.selected ? 0 : -1}
      aria-label={vertex.ariaLabel}
      onClick={() => onSelect(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(node);
      }}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={played ? 9 : 5.5}
        fill="transparent"
        className="node-hit"
      />
      <title>{vertex.title}</title>
    </g>
  );
});
