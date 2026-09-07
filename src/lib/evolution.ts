import { Chess } from 'chess.js';
import { position } from './games';
import { candidates, checkQuality } from './semantics';
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
  private contributions = new Map<string, Set<string>>();
  private continuations = new Map<string, string[][]>();
  private endings = new Map<string, Map<string, EvolutionNode['continuationEnd']>>();
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
    const contribution = new Set<string>([sourceId]);
    const paths: string[][] = [];
    const endings = new Map<string, EvolutionNode['continuationEnd']>();
    for (const line of candidates(analysis, played)) {
      const chess = new Chess(this.game.initialFen);
      for (const move of source.moves) chess.move(move);
      let parent = source;
      const path = [sourceId];
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
        contribution.add(id);
        path.push(id);
        parent = node;
      }
      if (!parent.mate && !parent.draw && parent.id !== sourceId)
        endings.set(parent.id, line.moves.length > length ? 'display-limit' : 'pv-end');
      paths.push(path);
    }
    this.contributions.set(sourceId, contribution);
    this.continuations.set(sourceId, paths);
    this.endings.set(sourceId, endings);
    // Re-search replaces its own paths. Other roots and deliberately explored
    // branches retain their contributions and every ancestor needed for replay.
    const used = new Set([...this.contributions.values()].flatMap((ids) => [...ids]));
    for (const id of [...used]) {
      let node = this.nodes.get(id);
      while (node?.parent && !used.has(node.parent)) {
        used.add(node.parent);
        node = this.nodes.get(node.parent);
      }
    }
    for (const [id, node] of this.nodes) {
      if (!node.played && !used.has(id)) this.nodes.delete(id);
      else node.checkQuality = checkQuality(node, this.analysis.get(node.parent ?? ''));
    }
    const parents = new Set([...this.nodes.values()].map((n) => n.parent));
    const allEndings = new Map([...this.endings.values()].flatMap((ends) => [...ends]));
    for (const node of this.nodes.values())
      node.continuationEnd = parents.has(node.id) ? undefined : allEndings.get(node.id);
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
    result.continuations = Object.fromEntries(this.continuations);
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

/** Fig.4-inspired focus: a searched root's own retained lines, or the suffixes
 * containing an unsearched occurrence. Never jump between merged histories. */
export function continuationFocus(graph: EvolutionGraph, id: string) {
  const paths =
    graph.continuations?.[id] ??
    Object.values(graph.continuations ?? {})
      .flat()
      .flatMap((path) => {
        const index = path.indexOf(id);
        return index < 0 ? [] : [path.slice(index)];
      });
  return {
    nodes: new Set([id, ...paths.flat()]),
    steps: new Set(paths.flatMap((path) => path.slice(1).map((to, i) => `${path[i]}→${to}`))),
  };
}
