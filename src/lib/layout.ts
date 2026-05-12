// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Layout pipeline per SPEC.md §13 with a paper-faithful **global persistent
 * lane allocator**.
 *
 * Critical design choice: lanes are GLOBAL horizontal tracks above and
 * below the trunk, not per-trunk-anchor stacks. A chain occupies its lane
 * for a horizontal interval `[startX, endX]`; a later chain whose
 * `startX > lane.lastEndX + padding` can reuse the same lane. This is what
 * gives Figure 5 / Figure 9 their characteristic "branches breathe
 * horizontally" silhouette rather than the column-prone stacking that
 * per-anchor lane allocation produces.
 *
 * Pipeline:
 *   1. Trunk x-pin: trunk_x = baseX + index × trunkSpacing, y = 0.
 *   2. Walk every branch as a chain from its trunk ancestor.
 *   3. Pre-compute each chain's [startX, endX] using a wide
 *      BRANCH_DEPTH_SPACING so chains sprawl across the canvas.
 *   4. Allocate each chain to a global lane (above or below the trunk,
 *      alternating preference). Lane reuse permitted once prior chain
 *      ended + padding.
 *   5. Position chain nodes along the lane y-coordinate.
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

// Trunk geometry
const TRUNK_BASE_X = 80;
const TRUNK_SPACING = 56;
const TRUNK_NODE_DIAMETER = 17;

// Branch geometry — much wider step than before so chains sprawl horizontally.
const ALT_NODE_SIDE = 10;
const BRANCH_EXIT_X = 18; // gap between trunk anchor and the chain's first node
const BRANCH_STEP_X = 28; // distance between successive chain nodes
const BRANCH_LANE_OFFSET = 19; // vertical distance between successive global lanes
const LANE_PADDING_X = 14; // minimum horizontal gap between two chains sharing a lane

const PX_PER_LOGICAL_UNIT = 0.1;

export interface LayoutResult {
  nodes: RfNode<EvoNodeData>[];
  edges: RfEdge<EvoEdgeData>[];
  bounds: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
}

interface ChainLayout {
  /** Trunk Occurrence the chain hangs from. */
  anchorId: OccurrenceId;
  /** Branch Occurrences in chain order (NOT including the anchor). */
  nodes: OccurrenceId[];
  /** x-coordinate of the chain's first branch node. */
  startX: number;
  /** x-coordinate of the chain's last branch node. */
  endX: number;
  /** Which side of the trunk this chain prefers. */
  preferredSide: 'above' | 'below';
}

export function layoutGraph(graph: GraphData): LayoutResult {
  const trunkSet = new Set(graph.trunkOrder);
  const positions = new Map<OccurrenceId, { x: number; y: number; w: number; h: number }>();

  // Pass 1 — pin trunk Occurrences along y = 0.
  const trunkXById = new Map<OccurrenceId, number>();
  graph.trunkOrder.forEach((id, idx) => {
    const x = TRUNK_BASE_X + idx * TRUNK_SPACING;
    trunkXById.set(id, x);
    positions.set(id, {
      x,
      y: 0,
      w: TRUNK_NODE_DIAMETER,
      h: TRUNK_NODE_DIAMETER,
    });
  });

  // Pass 2 — collect chains per trunk anchor (deterministic ordering for
  // stable golden screenshots).
  const chainsByAnchor = new Map<OccurrenceId, OccurrenceId[][]>();
  for (const trunkId of graph.trunkOrder) {
    const trunk = graph.occurrences[trunkId];
    if (!trunk) continue;
    const chains: OccurrenceId[][] = [];
    for (const childId of trunk.childIds) {
      if (trunkSet.has(childId)) continue;
      const chain: OccurrenceId[] = [];
      walkChain(graph, childId, chain);
      chains.push(chain);
    }
    if (chains.length > 0) {
      chains.sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
      chainsByAnchor.set(trunkId, chains);
    }
  }

  // Pass 3 — pre-compute chain intervals (startX, endX) and preferred side.
  const chainLayouts: ChainLayout[] = [];
  for (let trunkIdx = 0; trunkIdx < graph.trunkOrder.length; trunkIdx++) {
    const anchorId = graph.trunkOrder[trunkIdx];
    if (!anchorId) continue;
    const chains = chainsByAnchor.get(anchorId);
    if (!chains) continue;
    const anchorX = trunkXById.get(anchorId) ?? 0;

    chains.forEach((chain, chainIdx) => {
      const depth = chain.length;
      if (depth === 0) return;
      const startX = anchorX + BRANCH_EXIT_X;
      const endX = startX + (depth - 1) * BRANCH_STEP_X;
      // Alternate above/below per chain index, with an offset by trunk
      // parity so the silhouette doesn't have a hard left/right bias.
      const preferredSide: 'above' | 'below' =
        (chainIdx + trunkIdx) % 2 === 0 ? 'above' : 'below';
      chainLayouts.push({
        anchorId,
        nodes: chain,
        startX,
        endX,
        preferredSide,
      });
    });
  }

  // Pass 4 — global persistent lane allocator. Each side tracks an array
  // of `lastEndX` per lane index. A chain can reuse lane L on its side
  // iff `lanes[L] + LANE_PADDING_X < chain.startX`. Otherwise allocate a
  // new lane.
  const lanesAbove: number[] = []; // lastEndX per lane on the above side
  const lanesBelow: number[] = [];

  // Order chains for allocation: by startX ascending, then by preferredSide
  // so we can interleave. This produces a natural left-to-right sweep.
  const ordered = [...chainLayouts].sort((a, b) => a.startX - b.startX);

  const chainYByAnchor = new Map<string, number>(); // (anchor:chainSig) → y
  for (const chain of ordered) {
    const lanes = chain.preferredSide === 'above' ? lanesAbove : lanesBelow;
    let laneIdx = lanes.findIndex(
      (lastEnd) => lastEnd + LANE_PADDING_X < chain.startX,
    );
    if (laneIdx === -1) {
      // Try the OTHER side before opening a new lane — keeps the
      // silhouette balanced when one side fills up faster.
      const otherLanes = chain.preferredSide === 'above' ? lanesBelow : lanesAbove;
      const otherLaneIdx = otherLanes.findIndex(
        (lastEnd) => lastEnd + LANE_PADDING_X < chain.startX,
      );
      if (otherLaneIdx !== -1) {
        // Reuse a lane on the other side.
        otherLanes[otherLaneIdx] = chain.endX;
        const sideSign = chain.preferredSide === 'above' ? +1 : -1;
        // Note: we flipped sides, so sign also flips.
        const y = -sideSign * (otherLaneIdx + 1) * BRANCH_LANE_OFFSET;
        placeChain(chain, y);
        continue;
      }
      // No reusable lane on either side; open a new lane on the preferred.
      laneIdx = lanes.length;
      lanes.push(chain.endX);
    } else {
      lanes[laneIdx] = chain.endX;
    }
    const sideSign = chain.preferredSide === 'above' ? -1 : +1;
    const y = sideSign * (laneIdx + 1) * BRANCH_LANE_OFFSET;
    placeChain(chain, y);
  }

  function placeChain(chain: ChainLayout, laneY: number): void {
    chain.nodes.forEach((occId, idx) => {
      const x = chain.startX + idx * BRANCH_STEP_X;
      positions.set(occId, {
        x,
        y: laneY,
        w: ALT_NODE_SIDE,
        h: ALT_NODE_SIDE,
      });
    });
    chainYByAnchor.set(chain.anchorId + ':' + chain.nodes.join(','), laneY);
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

    // Fullmove labels: ceil(ply / 2). Root (ply 0) renders unlabeled.
    const moveNumber: number | null = isTrunk
      ? occ.ply === 0
        ? null
        : Math.ceil(occ.ply / 2)
      : null;

    const data: EvoNodeData = {
      kind: isTrunk ? 'trunk' : 'alt',
      moveNumber,
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

function walkChain(graph: GraphData, startId: OccurrenceId, accumulator: OccurrenceId[]): void {
  let cursor: Occurrence | undefined = graph.occurrences[startId];
  while (cursor !== undefined) {
    accumulator.push(cursor.id);
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
        // Trunk = straight smoothstep spine. Branches = bezier (arcing curves).
        type: isTrunkEdge ? 'smoothstep' : 'default',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: isTrunkEdge ? 14 : 9,
          height: isTrunkEdge ? 14 : 9,
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
 * Fill rule per Figure 3 legend. Squares are EMPTY (just an outline) by
 * default; events drive fill. Mate fills come from the side that mated,
 * paired with a red crown overlay (the crown carries the red, not the
 * square — corrected per second-pass review of Figure 9).
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
    case 'mate-by-black':
      return 'black';
    case 'draw':
      return 'tie';
    default:
      return 'empty';
  }
}

export const PX_THICKNESS_FACTOR = PX_PER_LOGICAL_UNIT;
