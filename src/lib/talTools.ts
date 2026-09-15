import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import { moveLabel } from './games';
import { toSan } from './san';
import { talPayload } from './tal';
import { candidates } from './semantics';
import type { Analysis, EngineLine, EvolutionNode, Game } from '../types/game';

export interface TalContext {
  game: Game;
  node(id: string): EvolutionNode | undefined;
  analysis: Map<string, Analysis>;
}
export interface ToolOutcome {
  result: unknown;
  isError: boolean;
}
const fail = (message: string): ToolOutcome => ({ result: { error: message }, isError: true });
const ok = (result: unknown): ToolOutcome => ({ result, isError: false });

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

export function getGame(ctx: TalContext): ToolOutcome {
  const { headers, positions } = ctx.game;
  return ok({
    white: headers.White || 'White',
    black: headers.Black || 'Black',
    event: headers.Event,
    date: headers.Date,
    result: headers.Result,
    plies: positions.length - 1,
    analysedPlayedPositions: positions.filter((pos) => ctx.analysis.has(pos.id)).length,
    lastPlayedNodeId: positions.at(-1)?.id,
  });
}

export function getPosition(ctx: TalContext, nodeId: string): ToolOutcome {
  const node = ctx.node(nodeId);
  if (!node) return fail(`No node ${nodeId}`);
  let chess: Chess;
  try {
    chess = replay(ctx, node);
  } catch {
    return fail(`The history of ${nodeId} could not be replayed`);
  }
  const placement: Record<'White' | 'Black', { piece: string; square: string }[]> = {
    White: [],
    Black: [],
  };
  for (const row of chess.board())
    for (const cell of row)
      if (cell) placement[side(cell.color)].push({ piece: PIECE[cell.type], square: cell.square });
  const last = chess.history({ verbose: true }).at(-1);
  return ok({
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
  });
}

export function getPath(ctx: TalContext, nodeId: string): ToolOutcome {
  const node = ctx.node(nodeId);
  if (!node) return fail(`No node ${nodeId}`);
  const san = toSan(ctx.game.initialFen, node.moves);
  if (san.length !== node.moves.length)
    return fail(`The history of ${nodeId} could not be replayed`);
  const divergesAtPly = node.played
    ? null
    : node.moves.findIndex((uci, i) => ctx.game.positions[i + 1]?.uci !== uci) + 1;
  return ok({
    nodeId,
    plies: node.moves.length,
    movesSan: san,
    divergesFromGameAtPly: divergesAtPly,
  });
}

const playedFrom = (ctx: TalContext, node: EvolutionNode) =>
  node.played ? ctx.game.positions[node.ply + 1]?.uci : undefined;

/** Only lines the graph actually draws, and only where the first move converts to SAN. */
function retainedLines(fen: string, lines: EngineLine[]) {
  return lines.flatMap((line) => {
    const san = toSan(fen, line.moves.slice(0, 1))[0];
    if (!san) return [];
    return [
      {
        san,
        rank: line.rank,
        scoreCp: line.score.type === 'cp' ? line.score.value : null,
        mateIn: line.score.type === 'mate' ? line.score.value : null,
        lineSan: toSan(fen, line.moves.slice(0, 6)),
      },
    ];
  });
}

export const hasEngineData = (ctx: TalContext, nodeId: string) => {
  const node = ctx.node(nodeId);
  return !!node && (ctx.analysis.has(nodeId) || (!!node.parent && ctx.analysis.has(node.parent)));
};

/** The nearest ancestor the engine searched, so a refusal can point somewhere useful. */
export function nearestAnalysed(ctx: TalContext, nodeId: string) {
  let node = ctx.node(nodeId);
  while (node && !ctx.analysis.has(node.id)) node = node.parent ? ctx.node(node.parent) : undefined;
  return node?.id;
}

export function getAnalysis(ctx: TalContext, nodeId: string): ToolOutcome {
  const node = ctx.node(nodeId);
  if (!node) return fail(`No node ${nodeId}`);
  if (!hasEngineData(ctx, nodeId)) {
    const nearest = nearestAnalysed(ctx, nodeId);
    return fail(
      `The engine has not searched ${nodeId} or the position before it${nearest ? `; the nearest searched position is ${nearest}` : ''}`,
    );
  }
  const parent = node.parent ? ctx.node(node.parent) : undefined;
  const decision = talPayload(ctx.game, node, parent, parent && ctx.analysis.get(parent.id));
  const here = ctx.analysis.get(nodeId);
  return ok({
    nodeId,
    // The search made at the parent: how this move compared with its alternatives.
    decision: decision && {
      move: decision.move,
      engine: decision.engine,
      computed: decision.computed,
    },
    // The search made from this position, restricted to the replies the graph draws.
    repliesFromHere: here?.lines.length
      ? {
          depth: here.depth,
          depthReached: here.depthReached ?? false,
          candidates: retainedLines(node.fen, candidates(here, playedFrom(ctx, node))),
        }
      : null,
  });
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
      "The engine's view of a node: the decision that produced it (retained candidates, ranks, scores, achieved depth, computed loss and rank of the move) and the retained replies from it. Only moves the diagram draws are listed. Scores are from White; evalDeltaCp is from the mover. Errors when the engine has not searched near the node.",
    input_schema: nodeIdSchema,
  },
  {
    name: 'getPath',
    description: 'The moves from the start of the game to a node, in SAN.',
    input_schema: nodeIdSchema,
  },
];

export function runTool(
  ctx: TalContext,
  name: string,
  input: Record<string, unknown>,
): ToolOutcome {
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
      return fail(`Unknown tool ${name}`);
  }
}
