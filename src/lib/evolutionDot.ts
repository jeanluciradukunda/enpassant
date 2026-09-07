import { diagramStyle } from './diagramStyle';
import type { EvolutionGraph, EvolutionNode, EvolutionEdge } from '../types/game';

interface LayoutPolicy {
  orderFans?: boolean;
  playedWeight?: number;
  branchWeight?: number;
  compressedWeight?: number;
  groupPlayed?: boolean;
}

/** Keep ordering and layout weights measurable independently of chess analysis. */
export function evolutionDot(
  shown: EvolutionGraph['vertices'],
  byId: Map<string, EvolutionNode>,
  edges: EvolutionEdge[],
  {
    orderFans = false,
    playedWeight = 50,
    branchWeight = 10,
    compressedWeight = branchWeight,
    groupPlayed = false,
  }: LayoutPolicy = {},
) {
  const names = new Map(shown.map((v, i) => [v.id, `n${i}`]));
  // Rank the shortened graph itself: reserving a column for every hidden ply
  // turns compact trees into long parallel lanes and defeats shortening.
  const lines = [
    'digraph evolution {',
    `graph [rankdir=LR, nodesep=.04, ranksep=.16, margin=0, splines=true, newrank=true, outputorder=edgesfirst${orderFans ? ', ordering=out' : ''}];`,
    `node [shape=box, label="", fixedsize=true, width=${diagramStyle.squareSide / 72}, height=${diagramStyle.squareSide / 72}];`,
    'edge [arrowsize=.35];',
  ];
  for (const v of shown) {
    const node = byId.get(v.id)!;
    const name = names.get(v.id)!;
    lines.push(
      `${name} [${node.played ? `shape=circle,width=.19,height=.19${groupPlayed ? ',group=played' : ''}` : ''}];`,
    );
  }
  // Put the played continuation inside each source's fan. Input insertion
  // order otherwise pushes every alternative below a ruler-straight trunk.
  const orderedEdges = shown.flatMap((v) => {
    const outgoing = edges.filter((e) => e.from === v.id);
    const played = outgoing.find((e) => byId.get(e.to)!.played);
    const alternatives = outgoing.filter((e) => e !== played);
    if (played) alternatives.splice(Math.ceil(alternatives.length / 2), 0, played);
    return alternatives;
  });
  for (const edge of orderFans ? orderedEdges : edges) {
    const a = byId.get(edge.from)!;
    const b = byId.get(edge.to)!;
    lines.push(
      `${names.get(edge.from)} -> ${names.get(edge.to)} [id="${edge.id}", minlen=${edge.kind === 'return' ? '0, constraint=false' : 1}, weight=${a.played && b.played ? playedWeight : edge.paths[0].length > 2 ? compressedWeight : branchWeight}];`,
    );
  }
  lines.push('}');
  return { dot: lines.join('\n'), names };
}
