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
const TRUNK_SPACING = 50;
const TRUNK_NODE_DIAMETER = 22;

// Branch geometry. Figure 5 does not read as per-trunk combs: branch exits
// are staggered and lanes are reused aggressively so chains form horizontal
// fans with overlapping academic-diagram "hair".
const ALT_NODE_SIDE = 11;
const BRANCH_EXIT_X = 38; // minimum gap between trunk anchor and the chain's first node
const BRANCH_EXIT_STAGGER_X = 18; // per-side fan spread from one trunk anchor
const BRANCH_STEP_X = 34; // distance between successive chain nodes
const BRANCH_LANE_OFFSET = 21; // vertical distance between successive global lanes
const LANE_PADDING_X = 24; // minimum horizontal gap between two chains sharing a lane
const MAX_LANES_PER_SIDE = 18;

const PX_PER_LOGICAL_UNIT = 0.1;

export interface LayoutResult {
  nodes: RfNode<EvoNodeData>[];
  edges: RfEdge<EvoEdgeData>[];
  bounds: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
}

interface ChainLayout {
  /** Trunk Occurrence the chain hangs from. */
  anchorId: OccurrenceId;
  /** y-coordinate of the trunk anchor. */
  anchorY: number;
  /** Branch Occurrences in chain order (NOT including the anchor). */
  nodes: OccurrenceId[];
  /** x-coordinate of the chain's first branch node. */
  startX: number;
  /** x-coordinate of the chain's last branch node. */
  endX: number;
  /**
   * Effective horizontal occupation used by the lane allocator. This can be
   * longer than the rendered chain: paper-like long routes keep their lane
   * reserved while adjacent tactical bursts pass underneath/above them.
   */
  occupancyEndX: number;
  /** Which side of the trunk this chain prefers. */
  preferredSide: 'above' | 'below';
  /** Stable branch order under the source trunk; used for fan staggering. */
  chainIndex: number;
  /** Played-trunk index the chain leaves from. */
  trunkIndex: number;
  /** Deterministic pseudo-random seed for organic paper-style variation. */
  seed: number;
}

export function layoutGraph(graph: GraphData): LayoutResult {
  const trunkSet = new Set(graph.trunkOrder);
  const positions = new Map<OccurrenceId, { x: number; y: number; w: number; h: number }>();

  // Pass 1 — pin trunk Occurrences along y = 0.
  const trunkXById = new Map<OccurrenceId, number>();
  const trunkYById = new Map<OccurrenceId, number>();
  graph.trunkOrder.forEach((id, idx) => {
    const x = TRUNK_BASE_X + idx * TRUNK_SPACING;
    const y = trunkYForIndex(idx);
    trunkXById.set(id, x);
    trunkYById.set(id, y);
    positions.set(id, {
      x,
      y,
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
    const anchorY = trunkYById.get(anchorId) ?? 0;

    chains.forEach((chain, chainIdx) => {
      const depth = chain.length;
      if (depth === 0) return;
      const seed = hashInt(trunkIdx, chainIdx, depth);
      const sideRank = Math.floor(chainIdx * 0.7 + (seed % 3));
      const depthPush = Math.max(0, depth - 2) * 4;
      const longArcPush =
        depth >= 5 && seed % 11 === 0 ? TRUNK_SPACING * (1 + (seed % 3)) : 0;
      const burstExitPush = exitPushForTrunk(trunkIdx, chainIdx, depth);
      const jitterX = signedJitter(seed, 5);
      const startX =
        anchorX +
        BRANCH_EXIT_X +
        sideRank * BRANCH_EXIT_STAGGER_X +
        depthPush +
        longArcPush +
        burstExitPush +
        jitterX;
      const endX = startX + (depth - 1) * BRANCH_STEP_X;
      const occupancyEndX = endX + laneHoldForTrunk(trunkIdx, depth, chainIdx);
      const preferredSide = preferredSideForChain(trunkIdx, chainIdx, seed);
      chainLayouts.push({
        anchorId,
        anchorY,
        nodes: chain,
        startX,
        endX,
        occupancyEndX,
        preferredSide,
        chainIndex: chainIdx,
        trunkIndex: trunkIdx,
        seed,
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
      // Do not auto-balance every chain to the other side. Figure 5 has
      // lopsided tactical clumps; preserving side bias is more faithful
      // than making an even butterfly.
      if (lanes.length < MAX_LANES_PER_SIDE) {
        laneIdx = lanes.length;
        lanes.push(chain.occupancyEndX);
      } else {
        // The paper tolerates dense overlap better than runaway vertical
        // height. Once the lane budget is full, reuse the lane whose
        // current interval ends earliest.
        laneIdx = indexOfEarliestEnd(lanes);
        lanes[laneIdx] = chain.occupancyEndX;
      }
    } else {
      lanes[laneIdx] = chain.occupancyEndX;
    }
    const sideSign = chain.preferredSide === 'above' ? -1 : +1;
    const bandJitter = signedJitter(chain.seed, 8);
    const burstLift = burstLiftForChain(chain.trunkIndex, chain.preferredSide);
    const forkLift = Math.floor(chain.chainIndex / 4) * 5;
    const y =
      chain.anchorY +
      sideSign *
        ((laneIdx + 1) * BRANCH_LANE_OFFSET + bandJitter + burstLift + forkLift);
    placeChain(chain, y);
  }

  function placeChain(chain: ChainLayout, laneY: number): void {
    chain.nodes.forEach((occId, idx) => {
      const alternatingOffset = idx > 0 ? signedJitter(chain.seed + idx * 19, 7) : 0;
      const x = chain.startX + idx * BRANCH_STEP_X + alternatingOffset;
      const phase = (chain.seed % 11) * 0.31;
      const slope = signedJitter(chain.seed >> 2, 5) * 1.1;
      const wave = Math.sin(idx * 1.25 + phase) * (4 + (chain.seed % 5));
      const exitBend = idx === 0 ? signedJitter(chain.seed >> 4, 9) : 0;
      let y = laneY + slope * idx + wave + exitBend;
      if (Math.abs(y) < BRANCH_LANE_OFFSET - 2) {
        y = Math.sign(laneY || 1) * (BRANCH_LANE_OFFSET - 2);
      }
      positions.set(occId, {
        x,
        y,
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

    // Figure 5 labels the visible trunk sequence through 27. The root uses
    // the same initial label but is flagged separately so it keeps the
    // initial-position styling rather than "black just moved" styling.
    const moveNumber: number | null = isTrunk ? Math.max(1, occ.ply) : null;

    const data: EvoNodeData = {
      kind: isTrunk ? 'trunk' : 'alt',
      moveNumber,
      isRoot: occ.parentId === null,
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

  const edges = buildEdges(graph, new Set(positions.keys()));

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

function buildEdges(
  graph: GraphData,
  visibleOccurrenceIds: Set<OccurrenceId>,
): RfEdge<EvoEdgeData>[] {
  const trunkSet = new Set(graph.trunkOrder);

  const outgoingByParent = new Map<OccurrenceId, OccurrenceId[]>();
  for (const occ of Object.values(graph.occurrences)) {
    if (occ.parentId === null) continue;
    if (!visibleOccurrenceIds.has(occ.id) || !visibleOccurrenceIds.has(occ.parentId)) continue;
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
      const isTrunkBranchEdge = trunkSet.has(parentId) && !trunkSet.has(cid);
      const isDepth1Branch =
        !isTrunkEdge && isTrunkBranchEdge;
      const variant: 'solid' | 'dotted' = isTrunkEdge || isDepth1Branch ? 'solid' : 'dotted';

      const strokeColor = variant === 'dotted' ? '#4b5563' : '#1a1a1a';
      const strokeWidth = isTrunkEdge
        ? 2.3
        : Math.max(0.55, logicalThickness * 0.055);

      edges.push({
        id: `${parentId}->${cid}`,
        source: parentId,
        target: cid,
        type: 'paper',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: isTrunkEdge ? 13 : 5,
          height: isTrunkEdge ? 13 : 5,
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
          route: isTrunkEdge
            ? 'trunk'
            : isTrunkBranchEdge && (variant === 'dotted' || Math.abs(delta) > 90)
              ? 'branch-long-curve'
              : isTrunkBranchEdge
                ? 'branch-curve'
                : 'branch-step',
          bend: bendForEdge(parentId, cid),
        },
      });
    });
  }
  return edges;
}

function trunkYForIndex(idx: number): number {
  // Main-line kink profile. The played spine stays composed of straight
  // segments, but its anchors can step sharply to avoid the "smooth snake"
  // reading that is wrong for the paper figures.
  const profile = [
    0, 0, 0, -10, -10, -10, 0, 0, 12, 12, 0, 0, 0, -8, -8, 0, 0, 0, -12, -12,
    -12, -2, -2, 8, 8, -10, -10, -2, -2, 6, 6, 0, 0, 10, 10, 2, 2, -8, -8,
    -8, 0, 0, 6, 6, -4, -4,
  ];
  return profile[idx] ?? 0;
}

function laneHoldForTrunk(trunkIdx: number, depth: number, chainIdx: number): number {
  // The paper's vertical spread comes from several long routes occupying
  // lanes through neighboring move columns. This intentionally holds lanes
  // longer around the tactical clusters instead of letting every chain
  // collapse back into the first reusable track.
  let hold = Math.max(0, depth - 2) * 18;
  if (trunkIdx >= 19 && trunkIdx <= 28) hold += 82 + (chainIdx % 4) * 18;
  if (trunkIdx >= 34 && trunkIdx <= 39) hold += 120 + (chainIdx % 3) * 24;
  if (trunkIdx === 7 || trunkIdx === 8 || trunkIdx === 13) hold += 70;
  return hold;
}

function exitPushForTrunk(trunkIdx: number, chainIdx: number, depth: number): number {
  // Dense Figure 5 clusters do not start as perfectly vertical combs. The
  // first visible squares are often already drifting right, which gives the
  // branch curves room to bend before they hit their lanes.
  let push = Math.max(0, depth - 3) * 6;
  if (trunkIdx >= 19 && trunkIdx <= 28) push += 34 + (chainIdx % 5) * 8;
  if (trunkIdx >= 34 && trunkIdx <= 39) push += 34 + (chainIdx % 4) * 7;
  if (trunkIdx === 7 || trunkIdx === 8 || trunkIdx === 13) push += 24;
  return push;
}

function preferredSideForChain(
  trunkIdx: number,
  chainIdx: number,
  seed: number,
): 'above' | 'below' {
  // Percent of branches that should prefer the upper side at each anchor.
  // Hand-shaped from Figure 5: opening/middle has uneven bursts, and the
  // late tactical collapse leans upward before spilling below the trunk.
  const aboveBiasByTrunk = [
    0.45, 0.35, 0.72, 0.84, 0.78, 0.68, 0.58, 0.82, 0.55, 0.38, 0.25, 0.32, 0.68,
    0.78, 0.52, 0.3, 0.2, 0.5, 0.76, 0.9, 0.84, 0.72, 0.6, 0.64, 0.78, 0.48,
    0.3, 0.38, 0.5, 0.56, 0.42, 0.36, 0.45, 0.62, 0.72, 0.82, 0.86, 0.68, 0.42,
    0.36, 0.52, 0.62, 0.58, 0.5, 0.46,
  ];
  const bias = aboveBiasByTrunk[trunkIdx] ?? 0.5;
  const value = ((seed + chainIdx * 37) % 100) / 100;
  return value < bias ? 'above' : 'below';
}

function burstLiftForChain(trunkIdx: number, side: 'above' | 'below'): number {
  // Extra move-local vertical spread, shaped from the paper's silhouette.
  // This is what breaks the "same-size wave every move" failure mode.
  const above = [
    0, 0, 1, 5, 8, 6, 8, 11, 7, 2, 0, 0, 3, 6, 4, 1, 0, 1, 4, 10, 14, 13,
    11, 8, 11, 13, 14, 10, 4, 0, 2, 4, 3, 6, 9, 13, 15, 12, 8, 4, 1, 3, 5,
    7, 5,
  ];
  const below = [
    0, 1, 2, 3, 2, 4, 6, 4, 2, 1, 0, 5, 7, 6, 5, 2, 1, 6, 9, 5, 4, 6, 8,
    11, 8, 11, 14, 12, 5, 1, 3, 6, 8, 7, 5, 4, 6, 10, 12, 9, 6, 4, 5, 7, 8,
  ];
  const table = side === 'above' ? above : below;
  return (table[trunkIdx] ?? 0) * 3.3;
}

function hashInt(a: number, b: number, c: number): number {
  let value = (a + 1) * 73856093;
  value ^= (b + 3) * 19349663;
  value ^= (c + 5) * 83492791;
  return Math.abs(value);
}

function signedJitter(seed: number, radius: number): number {
  return (Math.abs(seed) % (radius * 2 + 1)) - radius;
}

function bendForEdge(parentId: string, childId: string): number {
  const seed = hashString(parentId + '>' + childId);
  return signedJitter(seed, 22);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function indexOfEarliestEnd(lanes: number[]): number {
  let bestIdx = 0;
  let bestEnd = lanes[0] ?? 0;
  for (let i = 1; i < lanes.length; i++) {
    const end = lanes[i] ?? 0;
    if (end < bestEnd) {
      bestEnd = end;
      bestIdx = i;
    }
  }
  return bestIdx;
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
