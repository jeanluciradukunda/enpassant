// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Plaskett vs Shipov, World Open U2200 — synthesized fixture shaped like
 * Figure 5 of Lu/Wang/Lin 2014.
 *
 * V0 only needs the *shape*, not chess-legal moves. FENs are synthesized
 * placeholders. Visual fill is driven by `Position.event` per Figure 3
 * legend (NOT by eval magnitude). Events are sparse:
 *   - most positions have `event = null` → empty outline square.
 *   - ~15% of late-game branches: `check-by-black` → black-fill square.
 *   - a handful: `check-by-white`, `draw`, `mate-by-white`.
 *   - terminal leaves at move 27: mostly `mate-by-black` → red-fill +
 *     crown, with a few `mate-by-white` for variety.
 *
 * Eval values still follow Figure 5's score chart shape (drives ONLY the
 * chart, not square fills any more).
 *
 * Chain shapes are intentionally varied (depth 1, 2, 3, 4) so the
 * silhouette isn't a uniform brick wall in the late game.
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
  evalCp: number,
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
        ? makeEval(32000, 1, 'mate')
        : event === 'mate-by-black'
          ? makeEval(-32000, 1, 'mate')
          : makeEval(evalCp),
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

/**
 * Plaskett-Shipov eval curve (white's perspective). Calibrated to Figure 5.
 * Length 28 (root + 27 moves). Drives the score chart only — square fills
 * come from `event` now.
 */
const PLAYED_CP_WHITE: number[] = [
  0,
  12,
  18,
  -8,
  5,
  14,
  42,
  56,
  70,
  65,
  48,
  20,
  5,
  -25,
  -55,
  -90,
  -130,
  -180,
  -220,
  -260,
  -310,
  -360,
  -410,
  -480,
  -570,
  -680,
  -820,
  -1100,
];

function sideAtPly(ply: number): Side {
  return ply % 2 === 1 ? 'w' : 'b';
}

/**
 * Each "branch" is now an explicit chain spec: a parent index (which
 * trunk it attaches to), a depth, a leaf event, and an optional
 * mid-chain event index. Hand-tuned per ply to vary the silhouette.
 */
interface ChainSpec {
  /** Number of plies in the chain (1..4). */
  depth: number;
  /** Event placed on the LEAF Occurrence. */
  leafEvent: PositionEvent;
  /** Event placed on the i-th interior Occurrence (0 = first branch node). */
  midEvent?: { atDepth: number; event: PositionEvent };
}

/**
 * Branch profile per trunk ply: an ordered list of ChainSpecs. Hand-tuned
 * so density grows but late-game has variety + only ~15% check events +
 * mate cluster on move 27.
 */
const BRANCHES: Record<number, ChainSpec[]> = {
  // Paper's branch density: ~5-9 chains per trunk anchor on average, with
  // depth variety (1-4 plies, occasional 5). Density grows slightly from
  // opening to endgame but never starts at "sparse".
  1: [
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 2, leafEvent: null },
  ],
  2: [
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 3, leafEvent: null },
  ],
  3: [
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  4: [
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  5: [
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 2, leafEvent: null },
  ],
  6: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 3, leafEvent: null },
  ],
  7: [
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: 'check-by-white' },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  8: [
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  9: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-white' },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 3, leafEvent: null },
  ],
  10: [
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  11: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 3, leafEvent: null },
  ],
  12: [
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
    { depth: 3, leafEvent: null },
  ],
  13: [
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  14: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 1, leafEvent: null },
  ],
  15: [
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  16: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: 'draw' },
  ],
  17: [
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  18: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  19: [
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  20: [
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 1, leafEvent: 'draw' },
    { depth: 4, leafEvent: null },
  ],
  21: [
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 1, leafEvent: null },
    { depth: 4, leafEvent: null },
  ],
  22: [
    { depth: 5, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 1, leafEvent: null },
  ],
  23: [
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: 'check-by-black' },
    { depth: 4, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 1, leafEvent: null },
    { depth: 4, leafEvent: null },
  ],
  24: [
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 1, leafEvent: null },
  ],
  25: [
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: null },
    { depth: 1, leafEvent: 'draw' },
  ],
  26: [
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'check-by-black' },
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: null },
    { depth: 4, leafEvent: 'check-by-black' },
    { depth: 1, leafEvent: null },
  ],
  27: [
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 5, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 3, leafEvent: 'mate-by-black' },
    { depth: 2, leafEvent: 'mate-by-black' },
    { depth: 4, leafEvent: 'mate-by-black' },
    { depth: 1, leafEvent: 'mate-by-white' },
    { depth: 3, leafEvent: null },
    { depth: 2, leafEvent: null },
  ],
};

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

    let event: PositionEvent = null;
    if (isLeaf) event = spec.leafEvent;
    if (spec.midEvent && spec.midEvent.atDepth === d) event = spec.midEvent.event;

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

  // Root + 27 trunk Occurrences. Trunk events: none in the middle; mate at 27.
  for (let ply = 0; ply <= 27; ply++) {
    const sideToMove = sideAtPly(ply + 1);
    const cp = PLAYED_CP_WHITE[ply] ?? 0;
    const event: PositionEvent =
      ply === 27 ? 'mate-by-black' : ply === 22 ? 'check-by-black' : null;
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

  // Branches per trunk ply.
  for (let ply = 1; ply <= 27; ply++) {
    const chains = BRANCHES[ply];
    if (!chains) continue;
    const trunkId = state.trunk[ply];
    if (trunkId === undefined) continue;
    chains.forEach((spec, idx) => buildChain(state, trunkId, ply, spec, idx));
  }

  const lastTrunk = state.trunk[state.trunk.length - 1] ?? state.trunk[0];
  if (lastTrunk === undefined) throw new Error('fixture has no trunk');

  return {
    positions: state.positions,
    occurrences: state.occurrences,
    rootOccurrenceId: state.trunk[0]!,
    selectedOccurrenceId: lastTrunk,
    trunkOrder: state.trunk,
    transpositions: [],
    impactFrames: {},
  };
}
