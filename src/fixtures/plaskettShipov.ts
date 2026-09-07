// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Plaskett vs Shipov, World Open U2200 — synthesized fixture shaped like
 * Figure 5 of Lu/Wang/Lin 2014.
 *
 * V0 only needs the *shape*, not chess-legal moves. FENs are synthesized
 * placeholders. Visual fill is driven by `Position.event` per Figure 3
 * legend (NOT by eval magnitude).
 *
 * With the global persistent lane allocator now in place
 * (src/lib/layout.ts), dense chain counts no longer compress into per-
 * trunk columns — they fill horizontal lanes across the canvas. This
 * fixture therefore deliberately keeps the opening sparse and creates uneven
 * tactical bursts. The underlying game keeps 45 played steps, but the
 * Figure 5 viewport renders through the paper's visible move-27 resignation
 * window so the move-27 mate fan anchors the right side of the composition.
 *
 * Event placement is still sparse: most positions `null`, ~15% of
 * mid/late-game branches have effective-check events, ~3 `draw` events
 * total, and a White-mates-Black cluster near the move-27 fan called out
 * in the paper figure.
 *
 * V1+ replaces this with real PGN → chess.js → Stockfish output through
 * the same Position/Occurrence shape; no consumer changes required.
 */
import type {
  Evaluation,
  GraphData,
  Occurrence,
  OccurrenceId,
  Position,
  PositionEvent,
  PositionId,
  Side,
} from '@/types/model';

const ENGINE_ID = 'fixture-v0';
const NOW = Date.UTC(2026, 4, 12);
const TRUNK_MOVE_COUNT = 45;
const CALLOUT_MOVE = 27;
const FIGURE5_VISIBLE_MOVE = 27;

function pid(n: number): PositionId {
  return `p-${n.toString().padStart(4, '0')}`;
}
function oid(n: number): OccurrenceId {
  return `o-${n.toString().padStart(4, '0')}`;
}

function makeEval(cp: number, depth = 18, type: 'cp' | 'mate' = 'cp'): Evaluation {
  return {
    type,
    value: cp,
    depth,
    multipv: [{ rank: 1, moves: [], type, value: cp }],
    engineId: ENGINE_ID,
    computedAt: NOW,
  };
}

interface BuildState {
  positions: Record<PositionId, Position>;
  occurrences: Record<OccurrenceId, Occurrence>;
  nextPid: number;
  nextOid: number;
  trunk: OccurrenceId[];
}

function makePosition(
  state: BuildState,
  sideToMove: Side,
  evalCpWhite: number,
  options: { event?: PositionEvent; isTerminal?: Position['isTerminal'] } = {},
): PositionId {
  const id = pid(state.nextPid++);
  const event = options.event ?? null;
  const isTerminal =
    options.isTerminal ??
    (event === 'mate-by-white' || event === 'mate-by-black'
      ? 'checkmate'
      : event === 'draw'
        ? 'stalemate'
        : null);
  const sideToMoveCp = sideToMove === 'w' ? evalCpWhite : -evalCpWhite;
  const whiteMateValue = sideToMove === 'w' ? 32000 : -32000;
  const blackMateValue = sideToMove === 'w' ? -32000 : 32000;
  const pos: Position = {
    id,
    normalizedFen: `${id}-fen`,
    sideToMove,
    legalMovesUci: [],
    inCheck: event === 'check-by-white' || event === 'check-by-black',
    isTerminal,
    event,
    eval:
      event === 'mate-by-white'
        ? makeEval(whiteMateValue, 1, 'mate')
        : event === 'mate-by-black'
          ? makeEval(blackMateValue, 1, 'mate')
          : makeEval(sideToMoveCp),
    cachedAt: NOW,
  };
  state.positions[id] = pos;
  return id;
}

function makeOccurrence(
  state: BuildState,
  positionId: PositionId,
  parentId: OccurrenceId | null,
  ply: number,
  isPlayed: boolean,
  moveSan: string | null = null,
): OccurrenceId {
  const id = oid(state.nextOid++);
  const occ: Occurrence = {
    id,
    positionId,
    parentId,
    childIds: [],
    ply,
    moveSan,
    moveUci: null,
    repetitionCount: 1,
    fiftyMoveClock: 0,
    isPlayed,
    classification: null,
    analysisState: 'done',
  };
  state.occurrences[id] = occ;
  if (parentId !== null) {
    const parent = state.occurrences[parentId];
    if (parent) parent.childIds.push(id);
  }
  return id;
}

const PLAYED_CP_WHITE: number[] = [
  0, 12, 18, -8, 5, 14, 42, 56, 70, 65, 48, 20, 5, -25, -55, -90, -130, -180, -220, -260, -310,
  -360, -410, -480, -570, -680, -820, -1100, -960, -1040, -980, -1120, -1180, -1260, -1360,
  -1480, -1580, -1700, -1820, -1940, -2050, -2180, -2300, -2450, -2600, -2800,
];

function sideAtPly(ply: number): Side {
  return ply % 2 === 1 ? 'w' : 'b';
}

interface ChainSpec {
  depth: number;
  leafEvent: PositionEvent;
}

/**
 * Procedural chain generator. For each ply, generates `count` chains with
 * varied depths drawn from a deterministic pattern. Late-game gets more
 * chains and more crowns; early game gets fewer with shorter depths.
 */
function genChainsForPly(ply: number): ChainSpec[] {
  // Density profile: deliberately uneven. Figure 5 has bursts and quiet
  // gaps, not a smooth "more every ply" ramp.
  const countsByPly = [
    0, 2, 4, 9, 11, 7, 12, 15, 10, 3, 2, 1, 5, 9, 6, 2, 1, 3, 5, 17, 22, 20,
    15, 9, 20, 16, 26, 18, 5, 2, 3, 5, 8, 7, 9, 13, 18, 17, 13, 8, 5, 3, 5, 8,
    10, 6,
  ];
  const count = countsByPly[ply] ?? 6;

  // Max depth allowed at this ply. Deeper chains are reserved for late game
  // so the terminal mate combs have visible reach.
  const maxDepth = ply <= 5 ? 3 : ply <= 12 ? 5 : ply <= 20 ? 7 : 10;

  // Deterministic depth pattern: cycle through long and short chains
  // truncated to maxDepth.
  const pattern = [4, 2, 7, 3, 6, 2, 5, 1, 8, 3, 7, 2, 4, 9, 10, 3, 6, 2];
  const chains: ChainSpec[] = [];
  for (let i = 0; i < count; i++) {
    let depth = pattern[i % pattern.length] ?? 2;
    if (depth > maxDepth) depth = maxDepth;
    if ((ply === 8 || ply === 19 || ply === 24 || ply === 26) && i % 6 === 0) {
      depth = Math.min(maxDepth, depth + 2);
    }

    // Event placement: deterministic by (ply, i) so the fixture is repeatable.
    let leafEvent: PositionEvent = null;
    if (ply >= 23 && ply <= 28 && depth >= 2) {
      // Paper Figure 5: White's mating pressure after the move-27 fan.
      if (i % 3 !== 2) leafEvent = 'mate-by-white';
      else if (i % 7 === 4) leafEvent = 'check-by-white';
    } else if (ply >= 34 && depth >= 3) {
      if (i % 5 === 0) leafEvent = 'check-by-white';
      if (i % 11 === 6) leafEvent = 'mate-by-white';
    } else if (ply >= 18) {
      if (i % 4 === 1) leafEvent = 'check-by-black';
      if (i === 0 && ply === 20) leafEvent = 'draw';
    } else if (ply >= 11) {
      if (i % 5 === 1) leafEvent = 'check-by-black';
      if (i === 0 && ply === 16) leafEvent = 'draw';
    } else if (ply === 7 && i === 1) {
      leafEvent = 'check-by-white';
    } else if (ply === 9 && i === 3) {
      leafEvent = 'check-by-white';
    }

    chains.push({ depth, leafEvent });
  }

  // Sprinkle one Black-mates-White marker on move 27 for visual grammar variety.
  if (ply === 27 && chains[10]) {
    chains[10] = { depth: 1, leafEvent: 'mate-by-black' };
  }
  return chains;
}

function buildChain(
  state: BuildState,
  trunkParentId: OccurrenceId,
  trunkPly: number,
  spec: ChainSpec,
  chainIdx: number,
): void {
  const baseCp = PLAYED_CP_WHITE[trunkPly] ?? 0;
  let parent = trunkParentId;
  for (let d = 0; d < spec.depth; d++) {
    const branchPly = trunkPly + 1 + d;
    const sideToMove = sideAtPly(branchPly + 1);
    const isLeaf = d === spec.depth - 1;
    const wobble = ((chainIdx * 7 + d * 13) % 23) - 11;
    const branchCp = baseCp + wobble * (d + 1) * 2;
    const event: PositionEvent = isLeaf ? spec.leafEvent : null;
    const posId = makePosition(state, sideToMove, branchCp, { event });
    parent = makeOccurrence(state, posId, parent, branchPly, false);
  }
}

export function buildPlaskettShipovFixture(): GraphData {
  const state: BuildState = {
    positions: {},
    occurrences: {},
    nextPid: 0,
    nextOid: 0,
    trunk: [],
  };

  // Root + played trunk Occurrences.
  for (let ply = 0; ply <= TRUNK_MOVE_COUNT; ply++) {
    const sideToMove = sideAtPly(ply + 1);
    const cp = PLAYED_CP_WHITE[ply] ?? 0;
    const event: PositionEvent =
      ply === 22 || ply === 37 ? 'check-by-black' : null;
    const posId = makePosition(state, sideToMove, cp, { event });
    const parentId = ply === 0 ? null : (state.trunk[ply - 1] ?? null);
    const occId = makeOccurrence(
      state,
      posId,
      parentId,
      ply,
      true,
      ply === 0 ? null : ply % 2 === 1 ? `W${Math.ceil(ply / 2)}` : `B${ply / 2}`,
    );
    state.trunk.push(occId);
  }

  // Procedurally generate chains per trunk ply.
  for (let ply = 1; ply <= TRUNK_MOVE_COUNT; ply++) {
    const trunkId = state.trunk[ply];
    if (trunkId === undefined) continue;
    const chains = genChainsForPly(ply);
    chains.forEach((spec, idx) => buildChain(state, trunkId, ply, spec, idx));
  }

  const selectedTrunk = state.trunk[CALLOUT_MOVE] ?? state.trunk[state.trunk.length - 1];
  if (selectedTrunk === undefined) throw new Error('fixture has no trunk');
  const visibleTrunkOrder = state.trunk.slice(0, FIGURE5_VISIBLE_MOVE + 1);

  return {
    positions: state.positions,
    occurrences: state.occurrences,
    rootOccurrenceId: state.trunk[0]!,
    selectedOccurrenceId: selectedTrunk,
    trunkOrder: visibleTrunkOrder,
    transpositions: [],
    impactFrames: {},
  };
}
