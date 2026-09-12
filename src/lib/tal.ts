import type { Analysis, EvolutionNode, Game } from '../types/game';
import { moveLabel } from './games';
import { toSan } from './san';
import { candidates, numericScore } from './semantics';

// Everything the model is told about one moment. The judgement is computed
// here; the model only narrates it. Scores keep White's perspective.
export type TalPayload = {
  game: { white: string; black: string; event?: string; date?: string; result?: string };
  move: {
    number: number;
    label: string;
    san: string;
    movedBy: 'White' | 'Black';
    sideToMove: 'w' | 'b';
    played: boolean;
    check: boolean;
    mate: boolean;
    draw: boolean;
    onlyMove: boolean;
  };
  engine: {
    depth: number;
    depthReached: boolean;
    requestedDepth: number;
    candidates: Array<{
      san: string;
      rank: number;
      played: boolean;
      scoreCp: number | null;
      mateIn: number | null;
      lineSan: string[];
    }>;
  };
  computed: {
    evalDeltaCp: number | null;
    playedRank: number | null;
    outsideTopEight: boolean;
  };
};

export const LINE_PLIES = 6;

/** Builds the payload for `node`, reached from `parent` by `node.uci`, using the
 * search made at `parent` (the decision). Returns null for the root position. */
export function talPayload(
  game: Game,
  node: EvolutionNode,
  parent: EvolutionNode | undefined,
  decision: Analysis | undefined,
): TalPayload | null {
  if (!parent || !decision) return null;
  const playedAtParent = parent.played ? game.positions[parent.ply + 1]?.uci : undefined;
  const retained = candidates(decision, playedAtParent);
  const thisLine = retained.find((line) => line.moves[0] === node.uci);
  const best = decision.lines[0];
  const moverSign = parent.turn === 'w' ? 1 : -1;
  const evalDeltaCp =
    thisLine && best && thisLine.score.type === 'cp' && best.score.type === 'cp'
      ? (numericScore(best.score) - numericScore(thisLine.score)) * moverSign || 0
      : null;
  return {
    game: {
      white: game.headers.White || 'White',
      black: game.headers.Black || 'Black',
      event: game.headers.Event,
      date: game.headers.Date,
      result: game.headers.Result,
    },
    move: {
      number: node.turn === 'b' ? node.moveNumber : node.moveNumber - 1,
      label: moveLabel(node),
      san: node.san,
      movedBy: parent.turn === 'w' ? 'White' : 'Black',
      sideToMove: node.turn,
      played: node.played,
      check: node.check,
      mate: node.mate,
      draw: node.draw,
      onlyMove: node.legalReplies === 1,
    },
    engine: {
      depth: decision.depth,
      depthReached: decision.depthReached ?? false,
      requestedDepth: decision.requestedDepth ?? 20,
      candidates: retained.map((line) => ({
        san: toSan(parent.fen, line.moves.slice(0, 1))[0] ?? line.moves[0],
        rank: line.rank,
        played: line.moves[0] === playedAtParent,
        scoreCp: line.score.type === 'cp' ? line.score.value : null,
        mateIn: line.score.type === 'mate' ? line.score.value : null,
        lineSan: toSan(parent.fen, line.moves.slice(0, LINE_PLIES)),
      })),
    },
    computed: {
      evalDeltaCp,
      playedRank: thisLine?.rank ?? null,
      outsideTopEight: !!decision.playedLine,
    },
  };
}
