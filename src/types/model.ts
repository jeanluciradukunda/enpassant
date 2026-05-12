// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Data model per SPEC.md §5. The three structural types (Position, Occurrence,
 * TranspositionLink) plus the V2+ visual payload (ImpactFrame).
 *
 * V0 uses these types for fixture data; V1+ replaces the fixture with real
 * Stockfish output flowing through the same shape.
 */

export type PositionId = string;
export type OccurrenceId = string;

export type Side = 'w' | 'b';

export interface Evaluation {
  /** 'cp' for centipawns, 'mate' for mate-in-N. */
  type: 'cp' | 'mate';
  /** Centipawns or mate-in-N. From side-to-move's perspective. */
  value: number;
  depth: number;
  multipv: PvLine[];
  engineId: string;
  computedAt: number;
}

export interface PvLine {
  rank: number;
  moves: string[]; // UCI move sequence
  type: 'cp' | 'mate';
  value: number;
}

/**
 * Canonical chess position keyed by normalized X-FEN. One Position per unique
 * board state; shared across Occurrences. **No clock counters here** — those
 * are per-Occurrence (game-history-dependent). The engine cache key is
 * position-only because evaluation is path-independent.
 */
export type PositionEvent =
  | 'check-by-white'
  | 'check-by-black'
  | 'mate-by-white'
  | 'mate-by-black'
  | 'draw'
  | null;

export interface Position {
  id: PositionId;
  /** X-FEN: piece placement, side-to-move, castling, ep. En-passant stripped if unreachable. */
  normalizedFen: string;
  sideToMove: Side;
  legalMovesUci: string[];
  inCheck: boolean;
  isTerminal: 'checkmate' | 'stalemate' | 'insufficient' | null;
  /**
   * Visual event for this position, per Figure 3 legend. Drives fill on
   * the rendered node. Most positions are `null` and render as an empty-
   * outline square. Events are sparse — check/mate/draw markers only.
   */
  event: PositionEvent;
  eval: Evaluation | null;
  cachedAt: number;
}

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss';

/**
 * Tree node: appearance of a Position at a specific ply on a specific path.
 * Single parent, no cycles. Threefold and 50-move detection walk back along
 * the Occurrence chain.
 */
export interface Occurrence {
  id: OccurrenceId;
  positionId: PositionId;
  parentId: OccurrenceId | null;
  childIds: OccurrenceId[];
  /** 0 = root; fullmove = floor(ply/2) + 1 */
  ply: number;
  moveSan: string | null;
  moveUci: string | null;
  /**
   * 1-indexed count of this Position's appearances at or before this Occurrence
   * on the path from root. First appearance: 1. Threefold-claim eligible: ≥ 3.
   * Fivefold automatic draw: 5 (FIDE 9.6.2).
   */
  repetitionCount: number;
  /** Halfmove clock per FIDE 9.3. Resets on pawn move or capture. */
  fiftyMoveClock: number;
  /** On the actual game's trunk (i.e., a played move). */
  isPlayed: boolean;
  classification: MoveClassification | null;
  analysisState: 'idle' | 'queued' | 'analyzing' | 'done';
}

/**
 * Visual decoration between two Occurrences whose Positions are identical.
 * **Not a structural edge.** Rendered only when "show transpositions" is on
 * or when the user hovers an Occurrence with same-Position siblings.
 */
export interface TranspositionLink {
  fromOccurrenceId: OccurrenceId;
  toOccurrenceId: OccurrenceId;
  positionId: PositionId;
}

/**
 * Impact frame (V2+). Visual/analytical payload attached to a candidate branch
 * while Stockfish is building it. Controls reveal priority, edge weight,
 * opacity, pulse strength, and ghost-vs-locked-in styling. **Not a force
 * simulation** — layout remains stable; impact affects emphasis only.
 */
export interface ImpactFrame {
  occurrenceId: OccurrenceId;
  parentOccurrenceId: OccurrenceId;
  /** abs(eval(after) - eval(before)), cp-equivalent. Mate clamped to ±2000. */
  evalSwingCp: number;
  /** eval(PV1) - eval(this PV), side-to-move perspective. Bounded [0,30] for kept lines. */
  qualityGapCp: number;
  /** 0..1: 1.0 forced mate, 0.75 check/only-move, 0.5 decisive-capture-PV1, else 0. */
  forcingness: number;
  /** 0..1: min(depth/targetDepth, 1) × pvStability. */
  confidence: number;
  /** 0..1: 1 - pvStability. */
  volatility: number;
  mateDistance: number | null;
  /** 0..1, derived per the SPEC §5 formula. Drives reveal strength. */
  impact: number;
}

/**
 * Edge between two Occurrences in the rendered evolution graph. The data here
 * is the rendering payload only — the Occurrence tree is the source of truth.
 */
export interface EvoEdgeData extends Record<string, unknown> {
  /**
   * 'trunk' for played-trunk → played-trunk edges (the visible spine);
   * 'branch' for everything else. Trunk edges render heavier.
   */
  kind: 'trunk' | 'branch';
  /** Solid for canonical continuation, dotted for compressed chain. */
  variant: 'solid' | 'dotted';
  /**
   * Logical thickness in 1..30, **normalized per source Occurrence** (NOT
   * global). Among siblings from one parent: best evalDelta near 30, worst
   * near 1. Renderer maps logical → device px via a global multiplier.
   */
  logicalThickness: number;
  /** Eval delta from side-to-move perspective. For tooltips. */
  evalDeltaCp: number | null;
  /** Number of plies if this is a compressed chain. */
  compressedPlies: number | null;
}

/**
 * Rendering payload attached to a React Flow node.
 */
export interface EvoNodeData extends Record<string, unknown> {
  kind: 'trunk' | 'alt';
  /** Move number for trunk nodes (1-indexed). */
  moveNumber: number | null;
  /** Played-move side for visual cues. */
  sideToMove: Side;
  /** Fill rule from SPEC §6 + Figure 3 legend:
   *   - 'empty'  → no fill, just border (the default — most positions).
   *   - 'white'  → White gave check.
   *   - 'black'  → Black gave check.
   *   - 'tie'    → draw event (50-move / threefold / stalemate / insufficient).
   *   - 'red'    → Black gave checkmate to White (paired with `isCheckmate`).
   *   - 'white-crowned' is implicit: fill = 'white' AND isCheckmate = true.
   */
  fill: 'empty' | 'white' | 'black' | 'tie' | 'red';
  /** Border color rule: side-to-move. */
  borderColor: 'white' | 'black';
  /** Mate event → crown overlay. */
  isCheckmate: boolean;
  /** Visually inverse-styled when selected. */
  isSelected: boolean;
  /** Classification for the small badge dot. */
  classification: MoveClassification | null;
  /** Currently being analyzed — drives pulse animation. */
  isAnalyzing: boolean;
}

/**
 * Complete rendered graph payload. The shape consumed by the EvoGraph
 * component. Lives separately from the Occurrence tree so the layout
 * pipeline (§13) can transform Occurrences into positioned React Flow nodes.
 */
export interface GraphData {
  positions: Record<PositionId, Position>;
  occurrences: Record<OccurrenceId, Occurrence>;
  rootOccurrenceId: OccurrenceId;
  /** Selected Occurrence (V0 fixture uses the last played move). */
  selectedOccurrenceId: OccurrenceId;
  /** Trunk Occurrences in ply order, for the layout pipeline's anchoring step. */
  trunkOrder: OccurrenceId[];
  /** Optional transposition decorations. */
  transpositions: TranspositionLink[];
  /** Optional V2+ impact frames keyed by Occurrence. */
  impactFrames: Record<OccurrenceId, ImpactFrame>;
}
