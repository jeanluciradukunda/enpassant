import { continuationFocus, visibleAt } from './evolution';
import { moveLabel } from './games';
import { eventFill } from './semantics';
import { diagramStyle as style, type CheckMode } from './diagramStyle';
import type { EvolutionEdge, EvolutionGraph, EvolutionNode } from '../types/game';

/** Everything a renderer needs to draw the live graph at one replay instant.
 * The SVG marks, the invisible hit overlay and the WebGL renderer all consume
 * this one description, so they can never disagree about what is visible. */
export interface SceneInput {
  graph: EvolutionGraph;
  cursor: number;
  overview: boolean;
  exploringPly?: number | null;
  selected: EvolutionNode;
  isolated: boolean;
  checkMode?: CheckMode;
}

export type SceneEvent = 'mate' | 'draw' | NonNullable<EvolutionNode['checkQuality']>;

export interface SceneVertex {
  /** Stable identity for keyed rendering: the first visible member. */
  key: string;
  /** The occurrence whose fields the glyph shows. */
  node: EvolutionNode;
  members: string[];
  played: boolean;
  drawRelated: boolean;
  fill: string;
  /** Side-to-move colour: white for White, ink for Black. */
  side: string;
  stroke: string;
  strokeWidth: number;
  /** Two-digit move number on played circles. */
  label?: string;
  labelColor?: string;
  selected: boolean;
  /** False when isolating continuations and this glyph is outside them. */
  lit: boolean;
  origin?: { x: number; y: number };
  event?: SceneEvent;
  title: string;
  ariaLabel: string;
}

export interface SceneEdge {
  edge: EvolutionEdge;
  /** The first visible occurrence path this displayed edge stands for. */
  path: string[];
  recurrence: boolean;
  /** Recurrence and return links share the dashed "repeat" marking. */
  repeat: boolean;
  compressed: boolean;
  dim: boolean;
  width: number;
  dash?: string;
  title: string;
}

export interface GraphScene {
  vertices: SceneVertex[];
  edges: SceneEdge[];
  /** The selected occurrence; its coordinates place the hidden-selection marker. */
  selected: EvolutionNode;
  /** The selection is visible but folded into an edge: draw a small marker. */
  selectedHidden: boolean;
}

export const RECURRENCE_DASH = '4 2';

const sameList = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);
const samePoint = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y);

/** Items that did not change since `previous` keep their object identity, so
 * memoised renderers skip them and only the glyphs that appeared, moved or
 * changed state cost anything on a replay step. */
export function buildScene(
  { graph, cursor, overview, exploringPly, selected, isolated, checkMode = 'retained' }: SceneInput,
  previous?: GraphScene,
): GraphScene {
  const previousVertices = new Map(previous?.vertices.map((v) => [v.key, v]));
  const previousEdges = new Map(previous?.edges.map((e) => [e.edge.id, e]));
  const included = isolated ? continuationFocus(graph, selected.id) : null;
  const visible = (id: string) => {
    const n = graph.byId.get(id);
    return n && visibleAt(n, cursor, overview, exploringPly);
  };
  const lit = included ? (ids: string[]) => ids.some((id) => included.nodes.has(id)) : () => true;
  const drawn = new Set<string>();
  const vertices = graph.vertices.flatMap((v): SceneVertex[] => {
    const members = v.members.filter(visible);
    if (!members.length) return [];
    for (const id of members) drawn.add(id);
    const id = members.includes(selected.id)
      ? selected.id
      : (members.find((id) => graph.byId.get(id)?.played) ?? members[0]);
    const node = graph.byId.get(id)!;
    const played = members.some((id) => graph.byId.get(id)!.played);
    const drawRelated = members.some((id) => graph.byId.get(id)!.draw);
    const side = node.turn === 'w' ? '#fff' : style.ink;
    const fill = eventFill(node, checkMode, drawRelated);
    const isSelected = members.includes(selected.id);
    const isLit = lit(members);
    const origin = graph.unfoldOrigins?.[node.id];
    const before = previousVertices.get(members[0]);
    if (
      before &&
      before.node === node &&
      before.played === played &&
      before.drawRelated === drawRelated &&
      before.fill === fill &&
      before.selected === isSelected &&
      before.lit === isLit &&
      sameList(before.members, members) &&
      samePoint(before.origin, origin)
    )
      return [before];
    const vertex: SceneVertex = {
      key: members[0],
      node,
      members,
      played,
      drawRelated,
      fill,
      side,
      stroke: played ? side : fill === style.green ? style.ink : fill,
      strokeWidth: played ? 1.65 : 0.65,
      selected: isSelected,
      lit: isLit,
      origin,
      event: node.mate ? 'mate' : node.draw ? 'draw' : node.check ? node.checkQuality : undefined,
      title: [
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
      ].join(''),
      ariaLabel: `${moveLabel(node)}, ${played ? 'played' : 'alternative'}${node.check ? ', check' : ''}${node.mate ? ', checkmate' : ''}`,
    };
    if (played) {
      vertex.label = String(
        graph.byId.get(members.find((id) => graph.byId.get(id)!.played) ?? node.id)!.moveNumber,
      ).padStart(2, '0');
      vertex.labelColor = fill === '#fff' ? style.ink : fill === style.ink ? '#fff' : side;
    }
    return [vertex];
  });
  const edges = graph.edges.flatMap((e): SceneEdge[] => {
    const paths = e.paths.filter((path) => path.every(visible));
    if (!paths.length) return [];
    const recurrence = e.kind === 'recurrence';
    const compressed = !recurrence && paths.some((p) => p.length > 2);
    const path = paths[0];
    const dim =
      !!included &&
      !paths.some((path) =>
        recurrence
          ? path.every((id) => included.nodes.has(id))
          : path.slice(1).every((to, i) => included.steps.has(`${path[i]}→${to}`)),
      );
    const before = previousEdges.get(e.id);
    if (
      before &&
      before.dim === dim &&
      before.edge.d === e.d &&
      before.edge.weight === e.weight &&
      before.edge.quality === e.quality &&
      before.edge.kind === e.kind &&
      sameList(before.edge.paths, paths)
    )
      return [before];
    const edge = { ...e, paths };
    return [
      {
        edge,
        path,
        recurrence,
        repeat: recurrence || edge.kind === 'return',
        compressed,
        dim,
        width: compressed ? style.compressedWidth : edge.weight,
        dash: recurrence ? RECURRENCE_DASH : compressed ? style.compressedDash : undefined,
        title: recurrence
          ? 'Return to an earlier occurrence of this position · relationship, not an extra move'
          : compressed
            ? `${path.length - 1} plies · quiet positions folded; tick count does not count moves`
            : edge.kind === 'return'
              ? 'Move returns to a shared position · select a route to inspect its history'
              : edge.quality === undefined
                ? 'Continuation · no comparable local evaluation'
                : `Local move quality ${edge.quality.toFixed(1)} / 30 · compare siblings only`,
      },
    ];
  });
  return {
    vertices,
    edges,
    selected,
    selectedHidden: !!visible(selected.id) && !drawn.has(selected.id),
  };
}
