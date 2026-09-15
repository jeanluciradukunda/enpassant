import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import { moveLabel } from './games';
import { toSan } from './san';
import { talPayload } from './tal';
import type { Analysis, EvolutionNode, Game } from '../types/game';

export interface TalContext {
  game: Game;
  node(id: string): EvolutionNode | undefined;
  analysis: Map<string, Analysis>;
}

const PIECE: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};
const side = (color: Color) => (color === 'w' ? 'White' : 'Black');

/** Replays the node's full history so piece identity, lost at the graph layer, is recovered. */
function replay(ctx: TalContext, node: EvolutionNode) {
  const chess = new Chess(ctx.game.initialFen);
  for (const move of node.moves) chess.move(move);
  return chess;
}

const describeMove = (move: Move) => ({
  san: move.san,
  by: side(move.color),
  piece: PIECE[move.piece],
  from: move.from,
  to: move.to,
  captured: move.captured ? PIECE[move.captured] : null,
  promotion: move.promotion ? PIECE[move.promotion] : null,
  castled: move.isKingsideCastle() ? 'kingside' : move.isQueensideCastle() ? 'queenside' : null,
  enPassant: move.isEnPassant(),
});

export function getGame(ctx: TalContext) {
  const { headers, positions } = ctx.game;
  return {
    white: headers.White || 'White',
    black: headers.Black || 'Black',
    event: headers.Event,
    date: headers.Date,
    result: headers.Result,
    plies: positions.length - 1,
    analysedPlayedPositions: positions.filter((pos) => ctx.analysis.has(pos.id)).length,
    lastPlayedNodeId: positions.at(-1)?.id,
  };
}

export function getPosition(ctx: TalContext, nodeId: string) {
  const node = ctx.node(nodeId);
  if (!node) return { error: `No node ${nodeId}` };
  const chess = replay(ctx, node);
  const placement: Record<'White' | 'Black', { piece: string; square: string }[]> = {
    White: [],
    Black: [],
  };
  for (const row of chess.board())
    for (const cell of row)
      if (cell) placement[side(cell.color)].push({ piece: PIECE[cell.type], square: cell.square });
  const last = chess.history({ verbose: true }).at(-1);
  return {
    nodeId,
    label: moveLabel(node),
    ply: node.ply,
    played: node.played,
    fen: node.fen,
    sideToMove: side(node.turn),
    check: node.check,
    mate: node.mate,
    draw: node.draw,
    legalReplies: node.legalReplies ?? chess.moves().length,
    lastMove: last ? describeMove(last) : null,
    placement,
  };
}

export function getPath(ctx: TalContext, nodeId: string) {
  const node = ctx.node(nodeId);
  if (!node) return { error: `No node ${nodeId}` };
  const san = toSan(ctx.game.initialFen, node.moves);
  const divergesAtPly = node.played
    ? null
    : node.moves.findIndex((uci, i) => ctx.game.positions[i + 1]?.uci !== uci) + 1;
  return { nodeId, plies: node.moves.length, movesSan: san, divergesFromGameAtPly: divergesAtPly };
}

export function getAnalysis(ctx: TalContext, nodeId: string) {
  const node = ctx.node(nodeId);
  if (!node) return { error: `No node ${nodeId}` };
  const parent = node.parent ? ctx.node(node.parent) : undefined;
  const decision = talPayload(ctx.game, node, parent, parent && ctx.analysis.get(parent.id));
  const here = ctx.analysis.get(nodeId);
  return {
    nodeId,
    // The search made at the parent: how this move compared with its alternatives.
    decision: decision && {
      move: decision.move,
      engine: decision.engine,
      computed: decision.computed,
    },
    // The search made from this position: the replies the engine retained.
    repliesFromHere: here
      ? {
          depth: here.depth,
          depthReached: here.depthReached ?? false,
          candidates: here.lines.map((line) => ({
            san: toSan(node.fen, line.moves.slice(0, 1))[0] ?? line.moves[0],
            rank: line.rank,
            scoreCp: line.score.type === 'cp' ? line.score.value : null,
            mateIn: line.score.type === 'mate' ? line.score.value : null,
            lineSan: toSan(node.fen, line.moves.slice(0, 6)),
          })),
        }
      : null,
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
const nodeIdSchema = {
  type: 'object',
  properties: { nodeId: { type: 'string', description: 'A node id such as p42 or p41/h5f4' } },
  required: ['nodeId'],
  additionalProperties: false,
};
export const TAL_TOOLS: ToolDefinition[] = [
  {
    name: 'getGame',
    description: 'The game headers, result, length and how much of it the engine has analysed.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'getPosition',
    description:
      'The position at a node: every piece and its square, side to move, check/mate/draw, legal reply count, and the move that reached it with its piece and any capture.',
    input_schema: nodeIdSchema,
  },
  {
    name: 'getAnalysis',
    description:
      "The engine's view of a node: the decision that produced it (retained candidates, ranks, scores, achieved depth, computed loss and rank of the move) and the retained replies from it. Scores are from White; evalDeltaCp is from the mover.",
    input_schema: nodeIdSchema,
  },
  {
    name: 'getPath',
    description: 'The moves from the start of the game to a node, in SAN.',
    input_schema: nodeIdSchema,
  },
];

export function runTool(ctx: TalContext, name: string, input: Record<string, unknown>) {
  const nodeId = String(input.nodeId ?? '');
  switch (name) {
    case 'getGame':
      return getGame(ctx);
    case 'getPosition':
      return getPosition(ctx, nodeId);
    case 'getAnalysis':
      return getAnalysis(ctx, nodeId);
    case 'getPath':
      return getPath(ctx, nodeId);
    default:
      return { error: `Unknown tool ${name}` };
  }
}
