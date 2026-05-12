// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Plaskett vs Shipov, World Open U2200 — synthesized fixture shaped like
 * Figure 5 of Lu/Wang/Lin 2014.
 *
 * V0 only needs the *shape*, not chess-legal moves. FENs are synthesized
 * placeholders. Evaluations follow the Figure 5 score-chart curve:
 *   - moves 1–5: roughly even
 *   - moves 6–9: small white edge
 *   - moves 10–14: Black equalizes and starts to gain
 *   - moves 15–22: Black slowly grows the advantage
 *   - moves 23–27: Black runaway, mate threats clustering
 *
 * Branch density grows with the game (sparse in opening, dense by move 18+).
 * Move 27 carries the terminal fan with ~6 mate crowns clustered on it.
 *
 * V1+ replaces this with real PGN → chess.js → Stockfish output through the
 * same Position/Occurrence shape; no consumer changes required.
 */
import type {
  Evaluation,
  GraphData,
  Occurrence,
  OccurrenceId,
  Position,
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
  isCheckmate = false,
): PositionId {
  const id = pid(state.nextPid++);
  const pos: Position = {
    id,
    normalizedFen: `${id}-fen`,
    sideToMove,
    legalMovesUci: [],
    inCheck: false,
    isTerminal: isCheckmate ? 'checkmate' : null,
    eval: isCheckmate ? makeEval(sideToMove === 'w' ? -32000 : 32000, 1, 'mate') : makeEval(evalCp),
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
 * Length 28 (root + 27 moves).
 */
const PLAYED_CP_WHITE: number[] = [
  0, // root, ply 0
  12,
  18,
  -8,
  5,
  14, // 1..5: roughly even
  42,
  56,
  70,
  65,
  48, // 6..10: white edge then drift
  20,
  5,
  -25,
  -55,
  -90, // 11..15: equalizing → black gaining
  -130,
  -180,
  -220,
  -260,
  -310, // 16..20
  -360,
  -410,
  -480,
  -570,
  -680, // 21..25
  -820,
  -1100, // 26..27: black runaway
];

/** Side to move BEFORE the played move at ply N. White moves on odd plies. */
function sideAtPly(ply: number): Side {
  return ply % 2 === 1 ? 'w' : 'b';
}

function buildBranchesAt(
  state: BuildState,
  trunkParentId: OccurrenceId,
  trunkPly: number,
  count: number,
  evalSpread: number,
  options: { depth?: number; mateLeavesAtRightmost?: number } = {},
): void {
  const depth = options.depth ?? 2;
  const mateLeaves = options.mateLeavesAtRightmost ?? 0;
  const baseCp = PLAYED_CP_WHITE[trunkPly] ?? 0;

  // Each branch starts at ply = trunkPly + 1 and continues for `depth` plies.
  for (let i = 0; i < count; i++) {
    const variation = ((i - count / 2) * evalSpread) / Math.max(1, count - 1);
    let parent = trunkParentId;
    for (let d = 0; d < depth; d++) {
      const branchPly = trunkPly + 1 + d;
      const sideToMove = sideAtPly(branchPly + 1);
      // Deterministic perturbation — no Math.random (fixture must be repeatable for golden diff).
      const wobble = ((i * 7 + d * 13) % 23) - 11; // small signed offset in [-11, 11]
      const branchCp = baseCp + variation * (1 - d * 0.15) + wobble * d;
      const isLeaf = d === depth - 1;
      const isMate = isLeaf && i >= count - mateLeaves;
      const posId = makePosition(state, sideToMove, isMate ? 0 : branchCp, isMate);
      parent = makeOccurrence(state, posId, parent, branchPly, false);
    }
  }
}

/**
 * Branch density per trunk ply, calibrated against Figure 5's growth.
 * Format: [trunkPly] = { count, evalSpread, depth, mateLeaves }
 */
const BRANCH_PROFILE: Record<
  number,
  { count: number; evalSpread: number; depth: number; mateLeaves?: number }
> = {
  1: { count: 1, evalSpread: 30, depth: 1 },
  2: { count: 2, evalSpread: 40, depth: 1 },
  3: { count: 2, evalSpread: 40, depth: 2 },
  4: { count: 2, evalSpread: 40, depth: 2 },
  5: { count: 3, evalSpread: 50, depth: 2 },
  6: { count: 3, evalSpread: 50, depth: 2 },
  7: { count: 4, evalSpread: 60, depth: 2 },
  8: { count: 4, evalSpread: 60, depth: 2 },
  9: { count: 4, evalSpread: 70, depth: 3 },
  10: { count: 3, evalSpread: 70, depth: 2 },
  11: { count: 4, evalSpread: 80, depth: 2 },
  12: { count: 4, evalSpread: 90, depth: 3 },
  13: { count: 5, evalSpread: 90, depth: 2 },
  14: { count: 5, evalSpread: 100, depth: 2 },
  15: { count: 6, evalSpread: 110, depth: 3 },
  16: { count: 8, evalSpread: 120, depth: 3 },
  17: { count: 8, evalSpread: 130, depth: 3 },
  18: { count: 9, evalSpread: 140, depth: 3 },
  19: { count: 10, evalSpread: 150, depth: 3 },
  20: { count: 11, evalSpread: 150, depth: 3 },
  21: { count: 11, evalSpread: 180, depth: 3 },
  22: { count: 12, evalSpread: 200, depth: 3 },
  23: { count: 12, evalSpread: 220, depth: 3, mateLeaves: 1 },
  24: { count: 13, evalSpread: 240, depth: 3, mateLeaves: 2 },
  25: { count: 14, evalSpread: 280, depth: 3, mateLeaves: 3 },
  26: { count: 14, evalSpread: 320, depth: 3, mateLeaves: 5 },
  27: { count: 16, evalSpread: 360, depth: 2, mateLeaves: 8 },
};

export function buildPlaskettShipovFixture(): GraphData {
  const state: BuildState = {
    positions: {},
    occurrences: {},
    nextPid: 0,
    nextOid: 0,
    trunk: [],
  };

  // Root + 27 trunk Occurrences.
  for (let ply = 0; ply <= 27; ply++) {
    const sideToMove = sideAtPly(ply + 1);
    const cp = PLAYED_CP_WHITE[ply] ?? 0;
    const isMate = ply === 27; // mate at the end per fixture conceit
    const posId = makePosition(state, sideToMove, cp, isMate);
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

  // Branches at each played trunk Occurrence according to the profile.
  for (let ply = 1; ply <= 27; ply++) {
    const profile = BRANCH_PROFILE[ply];
    if (!profile) continue;
    const trunkId = state.trunk[ply];
    if (trunkId === undefined) continue;
    buildBranchesAt(state, trunkId, ply, profile.count, profile.evalSpread, {
      depth: profile.depth,
      mateLeavesAtRightmost: profile.mateLeaves ?? 0,
    });
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
