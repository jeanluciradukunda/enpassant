export interface GamePosition {
  id: string;
  ply: number;
  fen: string;
  san: string;
  uci: string;
  turn: 'w' | 'b';
  moveNumber: number;
  check: boolean;
  mate: boolean;
  draw: boolean;
  legalReplies?: number;
}

export interface Game {
  id: string;
  pgn: string;
  headers: Record<string, string>;
  initialFen: string;
  positions: GamePosition[];
}

// All scores use White's perspective, including mate distances.
export interface Score {
  type: 'cp' | 'mate';
  value: number;
}
export interface EngineLine {
  rank: number;
  depth: number;
  score: Score;
  moves: string[];
}
export interface Analysis {
  lines: EngineLine[];
  // A separately searched played move; its exact rank beyond MultiPV is unknown.
  playedLine?: EngineLine;
  depth: number;
  milliseconds: number;
  elapsedMs?: number;
  requestedDepth?: number;
  depthReached?: boolean;
}
export interface PositionAnalysis extends Analysis {
  positionId: string;
}

export interface EvolutionNode extends GamePosition {
  parent: string | null;
  moves: string[];
  played: boolean;
  originPly: number;
  x: number;
  y: number;
  checkQuality?: 'supported' | 'inferior' | 'unassessed';
  continuationEnd?: 'display-limit' | 'pv-end';
}
export interface EvolutionGraph {
  nodes: EvolutionNode[];
  byId: Map<string, EvolutionNode>;
  width: number;
  height: number;
  vertices: { id: string; members: string[] }[];
  edges: EvolutionEdge[];
  ready: boolean;
  stats: { positions: number; merged: number; shortened: number };
}

export interface EvolutionEdge {
  id: string;
  from: string;
  to: string;
  // One or more real occurrence paths represented by this displayed edge.
  paths: string[][];
  d: string;
  weight: number;
  kind?: 'move' | 'recurrence';
  quality?: number;
}
