// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Layout pipeline per SPEC.md §13.
 *
 * After V0's first render exposed that dagre's per-node x was incompatible
 * with our trunk x-pin (branches inherit dagre's small ranksep while trunk
 * gets stretched to ply-based spacing), this version uses a deterministic
 * trunk-anchored algorithm instead of dagre-plus-post-processing.
 *
 * Algorithm:
 *  1. Trunk Occurrences: x = baseX + index × trunkSpacing, y = 0.
 *  2. Walk every branch as a chain starting from its trunk ancestor.
 *  3. For each trunk anchor, sort chains and assign lanes alternating
 *     +1, -1, +2, -2, …  (above/below the trunk y-baseline).
 *  4. Within a chain, x increases with depth from trunk; y is the lane.
 *
 * This is the V0/V1 layout. SPEC §13's escape hatch to a "more general
 * paper-layout engine" remains open if V2's denser engine output exposes
 * cases this doesn't cover (multi-fork chains, transposition cross-links).
 */
import { MarkerType, type Edge as RfEdge, type Node as RfNode } from '@xyflow/react';
import type {
  EvoEdgeData,
  EvoNodeData,
  GraphData,
  Occurrence,
  OccurrenceId,
  PositionEvent,
} from '@/types/model';

const TRUNK_BASE_X = 80;
const TRUNK_SPACING = 56;
const BRANCH_DEPTH_SPACING = 14; // x-distance between successive plies within a branch chain
const BRANCH_LANE_OFFSET = 22; // y-distance between successive branch lanes from the trunk
const TRUNK_NODE_DIAMETER = 18;
const ALT_NODE_SIDE = 12;
const PX_PER_LOGICAL_UNIT = 0.1;

export interface LayoutResult {
  nodes: RfNode<EvoNodeData>[];
  edges: RfEdge<EvoEdgeData>[];
  bounds: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
}

export function layoutGraph(graph: GraphData): LayoutResult {
  const trunkSet = new Set(graph.trunkOrder);
  const positions = new Map<OccurrenceId, { x: number; y: number; w: number; h: number }>();

  // Pass 1 — pin trunk Occurrences along the horizontal axis at y=0.
  graph.trunkOrder.forEach((id, idx) => {
    positions.set(id, {
      x: TRUNK_BASE_X + idx * TRUNK_SPACING,
      y: 0,
      w: TRUNK_NODE_DIAMETER,
      h: TRUNK_NODE_DIAMETER,
    });
  });

  // Pass 2 — collect branch chains per trunk anchor.
  const chainsByAnchor = collectBranchChains(graph, trunkSet);

  // Pass 3 — assign lanes (alternating +1, -1, +2, -2, ...) and write
  // per-Occurrence x,y for every branch node.
  for (const [anchorId, chains] of chainsByAnchor) {
    const anchorPos = positions.get(anchorId);
    if (!anchorPos) continue;

    // Stable ordering: sort chains by their first ply's id so repeated runs
    // produce identical lane assignments (deterministic for the golden diff).
    chains.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));

    chains.forEach((chain, chainIdx) => {
      const lane = (Math.floor(chainIdx / 2) + 1) * (chainIdx % 2 === 0 ? -1 : 1);
      const y = lane * BRANCH_LANE_OFFSET;
      chain.forEach((occId, depthFromTrunk) => {
        // depthFromTrunk: 0 = the trunk anchor itself, 1 = first branch node, ...
        if (depthFromTrunk === 0) return; // skip the anchor (already placed)
        positions.set(occId, {
          x: anchorPos.x + depthFromTrunk * BRANCH_DEPTH_SPACING,
          y,
          w: ALT_NODE_SIDE,
          h: ALT_NODE_SIDE,
        });
      });
    });
  }

  // Materialize React Flow nodes.
  const nodes: RfNode<EvoNodeData>[] = [];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const occ of Object.values(graph.occurrences)) {
    const pos = positions.get(occ.id);
    if (!pos) continue;
    const position = graph.positions[occ.positionId];
    const isTrunk = trunkSet.has(occ.id);

    const data: EvoNodeData = {
      kind: isTrunk ? 'trunk' : 'alt',
      moveNumber: isTrunk ? Math.max(0, occ.ply) : null,
      sideToMove: position?.sideToMove ?? 'w',
      fill: deriveFill(position),
      borderColor: position?.sideToMove === 'b' ? 'black' : 'white',
      isCheckmate:
        position?.isTerminal === 'checkmate' ||
        position?.event === 'mate-by-white' ||
        position?.event === 'mate-by-black',
      isSelected: occ.id === graph.selectedOccurrenceId,
      classification: occ.classification,
      isAnalyzing: occ.analysisState === 'analyzing',
    };

    // React Flow expects top-left position; our x,y are node centers.
    const halfW = pos.w / 2;
    const halfH = pos.h / 2;
    const tlx = pos.x - halfW;
    const tly = pos.y - halfH;

    nodes.push({
      id: occ.id,
      type: isTrunk ? 'trunk' : 'alt',
      position: { x: tlx, y: tly },
      data,
      draggable: false,
      selectable: true,
      width: pos.w,
      height: pos.h,
    });

    minX = Math.min(minX, tlx);
    maxX = Math.max(maxX, tlx + pos.w);
    minY = Math.min(minY, tly);
    maxY = Math.max(maxY, tly + pos.h);
  }

  // Per-source-Occurrence edge thickness normalization (SPEC §2 Edges).
  const edges = buildEdges(graph);

  const width = (Number.isFinite(maxX) ? maxX : 0) - (Number.isFinite(minX) ? minX : 0);
  const height = (Number.isFinite(maxY) ? maxY : 0) - (Number.isFinite(minY) ? minY : 0);

  return {
    nodes,
    edges,
    bounds: {
      width,
      height,
      minX: Number.isFinite(minX) ? minX : 0,
      maxX: Number.isFinite(maxX) ? maxX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
      maxY: Number.isFinite(maxY) ? maxY : 0,
    },
  };
}

/**
 * For each trunk anchor T, return the list of branch chains rooted at T.
 * A "chain" is a sequence of OccurrenceIds [T, c1, c2, c3, ...] where each
 * Occurrence has exactly one branch-child (or zero). When a chain forks, the
 * fork creates a new chain rooted at the fork point — but for V0 our fixture
 * has only linear chains so the simple walk suffices.
 */
function collectBranchChains(
  graph: GraphData,
  trunkSet: Set<OccurrenceId>,
): Map<OccurrenceId, OccurrenceId[][]> {
  const result = new Map<OccurrenceId, OccurrenceId[][]>();

  for (const trunkId of graph.trunkOrder) {
    const trunk = graph.occurrences[trunkId];
    if (!trunk) continue;

    const chains: OccurrenceId[][] = [];
    // Each non-trunk child of the trunk Occurrence is the head of a chain.
    for (const childId of trunk.childIds) {
      if (trunkSet.has(childId)) continue;
      const chain: OccurrenceId[] = [trunkId];
      walkChain(graph, childId, chain);
      chains.push(chain);
    }
    if (chains.length > 0) result.set(trunkId, chains);
  }

  return result;
}

function walkChain(graph: GraphData, startId: OccurrenceId, accumulator: OccurrenceId[]): void {
  let cursor: Occurrence | undefined = graph.occurrences[startId];
  while (cursor !== undefined) {
    accumulator.push(cursor.id);
    // Continue along the first non-trunk child if any.
    const childIds: OccurrenceId[] = cursor.childIds;
    const nextId = childIds.find((cid) => {
      const child = graph.occurrences[cid];
      return child !== undefined && !child.isPlayed;
    });
    if (nextId === undefined) break;
    cursor = graph.occurrences[nextId];
  }
}

function buildEdges(graph: GraphData): RfEdge<EvoEdgeData>[] {
  const trunkSet = new Set(graph.trunkOrder);

  const outgoingByParent = new Map<OccurrenceId, OccurrenceId[]>();
  for (const occ of Object.values(graph.occurrences)) {
    if (occ.parentId === null) continue;
    const list = outgoingByParent.get(occ.parentId) ?? [];
    list.push(occ.id);
    outgoingByParent.set(occ.parentId, list);
  }

  const edges: RfEdge<EvoEdgeData>[] = [];
  for (const [parentId, childIds] of outgoingByParent) {
    const parent = graph.occurrences[parentId];
    const parentPos = graph.positions[parent?.positionId ?? ''];
    const parentSide = parentPos?.sideToMove ?? 'w';

    const deltas = childIds.map((cid) => {
      const child = graph.occurrences[cid];
      const childPos = graph.positions[child?.positionId ?? ''];
      const childEval = childPos?.eval?.value ?? 0;
      const parentEval = parentPos?.eval?.value ?? 0;
      const sign = parentSide === 'w' ? 1 : -1;
      return sign * (childEval - parentEval);
    });
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);

    childIds.forEach((cid, idx) => {
      const delta = deltas[idx] ?? 0;
      let logicalThickness: number;
      if (childIds.length === 1 || maxDelta === minDelta) {
        logicalThickness = 3;
      } else {
        const normalized = (delta - minDelta) / (maxDelta - minDelta);
        const compressed = Math.log(1 + 29 * normalized) / Math.log(30);
        logicalThickness = 1 + Math.round(compressed * 29);
      }

      const isTrunkEdge = trunkSet.has(parentId) && trunkSet.has(cid);
      // Branch edges in this V0 fixture compress multiple paper-plies into
      // a single visual step → render as dotted/ticked. Trunk edges and
      // direct one-ply branch links stay solid.
      const isDepth1Branch =
        !isTrunkEdge && trunkSet.has(parentId) && !trunkSet.has(cid);
      const variant: 'solid' | 'dotted' = isTrunkEdge || isDepth1Branch ? 'solid' : 'dotted';

      const strokeColor = variant === 'dotted' ? '#4b5563' : '#1a1a1a';
      const strokeWidth = isTrunkEdge
        ? 2.4
        : Math.max(0.8, logicalThickness * 0.12);

      edges.push({
        id: `${parentId}->${cid}`,
        source: parentId,
        target: cid,
        // Trunk edges form a horizontal spine → smoothstep keeps the path
        // straight. Branch edges arc from trunk anchor down/up to alt nodes
        // → bezier reproduces the paper's curved connectors (Figure 9).
        type: isTrunkEdge ? 'smoothstep' : 'default',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: isTrunkEdge ? 14 : 10,
          height: isTrunkEdge ? 14 : 10,
          strokeWidth: 1,
        },
        style: {
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: variant === 'dotted' ? '1 3' : undefined,
          strokeLinecap: variant === 'dotted' ? 'round' : 'butt',
          fill: 'none',
        },
        data: {
          kind: isTrunkEdge ? 'trunk' : 'branch',
          variant,
          logicalThickness,
          evalDeltaCp: delta,
          compressedPlies: variant === 'dotted' ? 1 : null,
        },
      });
    });
  }
  return edges;
}

/**
 * Fill rule per Figure 3 legend — drives the square's visible fill from the
 * position's *event*, not from eval magnitude. Most positions are
 * eventless and render as empty (just an outline).
 */
function deriveFill(
  position: { event?: PositionEvent } | undefined,
): EvoNodeData['fill'] {
  const event = position?.event ?? null;
  switch (event) {
    case 'check-by-white':
    case 'mate-by-white':
      return 'white';
    case 'check-by-black':
      return 'black';
    case 'mate-by-black':
      return 'red';
    case 'draw':
      return 'tie';
    default:
      return 'empty';
  }
}

export const PX_THICKNESS_FACTOR = PX_PER_LOGICAL_UNIT;
