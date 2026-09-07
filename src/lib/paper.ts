// SPDX-License-Identifier: GPL-3.0-or-later
import raw from '@/fixtures/figure5.json';
import type { PaperFixture, PaperNode, Region } from '@/types/paper';

export const figure5 = raw as PaperFixture;
export const nodeById = new Map(figure5.nodes.map((node) => [node.id, node]));
const outgoing = new Map<string, string[]>();
for (const edge of figure5.edges) {
  const targets = outgoing.get(edge.source) ?? [];
  targets.push(edge.target);
  outgoing.set(edge.source, targets);
}

export function continuations(id: string): Set<string> {
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const next = pending.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    pending.push(...(outgoing.get(next) ?? []));
  }
  return seen;
}

export function describeNode(node: PaperNode): string {
  if (node.kind === 'trunk')
    return `Move ${node.move} · ${node.side === 'white' ? 'White' : 'Black'}`;
  if (node.mate) return 'Checkmate';
  if (node.fill === '#ffffff') return 'White check';
  if (node.fill === '#000000') return 'Black check';
  if (node.border === '#7f7f7f') return 'Draw';
  return 'Alternative position';
}

export function regionForNode(node: PaperNode): Region {
  if (node.id === figure5.trunk.at(-1)) return figure5.lens;
  return {
    x: Math.max(0, Math.min(337, node.x - 5)),
    y: Math.max(2, Math.min(107, node.y - figure5.lens.height / 2)),
    width: figure5.lens.width,
    height: figure5.lens.height,
  };
}
