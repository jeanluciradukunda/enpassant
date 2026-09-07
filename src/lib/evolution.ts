import { Chess } from 'chess.js';
import { position } from './games';
import type { Analysis, EvolutionGraph, EvolutionNode, Game } from '../types/game';

export const PLY_WIDTH = 28;
export const TRUNK_Y = 300;
export const GRAPH_HEIGHT = 640;
export const xForPly = (ply: number) => 36 + ply * PLY_WIDTH;

/** The move tree is independent of its compressed display graph. In particular,
 * display transpositions never merge engine histories or change legal replay. */
export class EvolutionBuilder {
  private nodes = new Map<string, EvolutionNode>();
  private analysis = new Map<string, Analysis>();
  private placed: EvolutionGraph | undefined;
  constructor(private game: Game) {
    const moves: string[] = [];
    for (const pos of game.positions) {
      if (pos.uci) moves.push(pos.uci);
      this.nodes.set(pos.id, {
        ...pos,
        moves: [...moves],
        played: true,
        originPly: pos.ply,
        parent: pos.ply ? `p${pos.ply - 1}` : null,
        x: xForPly(pos.ply),
        y: TRUNK_Y,
      });
    }
  }
  append(sourceId: string, analysis: Analysis, length = 20) {
    const source = this.nodes.get(sourceId);
    if (!source) return;
    this.analysis.set(sourceId, analysis);
    const played = source.played ? this.game.positions[source.ply + 1]?.uci : undefined;
    const rank = analysis.lines.find((line) => line.moves[0] === played)?.rank ?? 9;
    const keep = source.played ? Math.max(4, Math.min(8, rank)) : 4;
    for (const line of analysis.lines.slice(0, keep)) {
      const chess = new Chess(this.game.initialFen);
      for (const move of source.moves) chess.move(move);
      let parent = source;
      for (const uci of line.moves.slice(0, length)) {
        if (chess.isGameOver()) break;
        let move;
        try {
          move = chess.move(uci);
        } catch {
          break;
        }
        const ply = parent.ply + 1;
        const onPlayedLine = parent.played && this.game.positions[ply]?.uci === uci;
        const id = onPlayedLine ? `p${ply}` : `${parent.id}/${uci}`;
        let node = this.nodes.get(id);
        if (!node) {
          node = {
            ...position(chess, ply, move.san, uci, id),
            parent: parent.id,
            moves: [...parent.moves, uci],
            played: false,
            originPly: parent.played ? parent.ply : parent.originPly,
            x: xForPly(ply),
            y: parent.y,
          };
          this.nodes.set(id, node);
        }
        parent = node;
      }
    }
  }
  snapshot(): EvolutionGraph {
    if (this.placed) return this.placed;
    const nodes = [...this.nodes.values()];
    return {
      nodes,
      byId: new Map(this.nodes),
      vertices: nodes.filter((n) => n.played).map((n) => ({ id: n.id, members: [n.id] })),
      edges: nodes
        .filter((n) => n.played && n.parent)
        .map((n) => ({
          id: n.id,
          from: n.parent!,
          to: n.id,
          paths: [[n.parent!, n.id]],
          d: `M${xForPly(n.ply - 1)},${n.y}L${n.x},${n.y}`,
          weight: 0.8,
        })),
      width: Math.max(560, xForPly(this.game.positions.length + 12)),
      height: GRAPH_HEIGHT,
      ready: false,
      stats: { positions: nodes.length, merged: 0, shortened: 0 },
    };
  }
  async layout() {
    const { layoutEvolution } = await import('./evolutionLayout');
    const result = await layoutEvolution([...this.nodes.values()], this.analysis, this.placed);
    this.placed = result;
    // Hidden positions get interpolated display locations for board selection
    // and expanding dotted paths, while retaining their own full move histories.
    for (const node of result.nodes) this.nodes.set(node.id, node);
    return result;
  }
  get(id: string) {
    return this.nodes.get(id);
  }
}

export function visibleAt(
  node: EvolutionNode,
  cursor: number,
  overview: boolean,
  exploringPly?: number | null,
) {
  return (
    overview ||
    (node.played ? node.ply <= cursor : node.originPly < cursor || node.originPly === exploringPly)
  );
}
export function descendants(graph: EvolutionGraph, id: string) {
  const included = new Set([id]);
  for (const node of graph.nodes)
    if (node.parent && included.has(node.parent)) included.add(node.id);
  return included;
}
