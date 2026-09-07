import type { Analysis, EngineLine, EvolutionNode, Score } from '../types/game';
import { diagramStyle, type CheckMode } from './diagramStyle';

// One policy drives the visible branches, their widths, and the chart envelope.
export function candidates(result: Analysis, playedMove?: string): EngineLine[] {
  const rank = result.lines.find((line) => line.moves[0] === playedMove)?.rank ?? 9;
  const keep = playedMove ? Math.max(4, Math.min(8, rank)) : 4;
  const lines = result.lines.slice(0, keep);
  if (playedMove && result.playedLine && !lines.some((l) => l.moves[0] === playedMove))
    lines.push(result.playedLine);
  return lines;
}

export const numericScore = (score: Score) =>
  score.type === 'cp' ? score.value : Math.sign(score.value) * (30000 - Math.abs(score.value));

// The paper does not specify its effective-check classifier. Our conservative
// proxy accepts a searched checking move within 50 cp of the best sibling.
// Never transfer a PV root score to later positions in that PV.
export function checkQuality(
  node: EvolutionNode,
  result?: Analysis,
): EvolutionNode['checkQuality'] {
  if (!node.check || node.mate || node.draw) return undefined;
  const line = [...(result?.lines ?? []), ...(result?.playedLine ? [result.playedLine] : [])].find(
    (line) => line.moves[0] === node.uci,
  );
  const best = result?.lines[0];
  if (!line || !best || line.depth !== best.depth) return 'unassessed';
  const side = node.turn === 'b' ? 1 : -1;
  return (numericScore(best.score) - numericScore(line.score)) * side <= 50
    ? 'supported'
    : 'inferior';
}

export function eventFill(node: EvolutionNode, mode: CheckMode = 'assessed', drawRelated = false) {
  if ((node.draw || drawRelated) && !node.mate) return diagramStyle.draw;
  if (
    node.mate ||
    (node.check &&
      (node.checkQuality === 'supported' ||
        (mode === 'retained' && node.checkQuality !== 'inferior')))
  )
    return node.turn === 'b' ? '#fff' : diagramStyle.ink;
  return diagramStyle.green;
}

// Display equivalence includes side, castling and en-passant rights. Occurrence
// histories (including clocks and repetitions) remain separate in graph.byId.
export const positionKey = (node: Pick<EvolutionNode, 'fen'>) =>
  node.fen.split(' ').slice(0, 4).join(' ');

// Eq. 2-inspired local normalization. log1p is monotone even for a 1 cp gap,
// avoiding log(0) and the paper's ambiguous score units. UI width = quality / 10.
export function candidateQualities(lines: EngineLine[], turn: 'w' | 'b') {
  const scores = lines.map((line) => numericScore(line.score) * (turn === 'w' ? 1 : -1));
  const min = Math.min(...scores),
    max = Math.max(...scores);
  return scores.map((score) =>
    max === min ? 15.5 : 1 + 29 * (Math.log1p(score - min) / Math.log1p(max - min)) ** 2,
  );
}
