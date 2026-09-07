// SPDX-License-Identifier: GPL-3.0-or-later
/** Visual observations from the paper. Deliberately separate from engine data. */
export interface PaperNode {
  id: string;
  kind: 'trunk' | 'alternative';
  x: number;
  y: number;
  size: number;
  border: string;
  fill: string;
  mate: boolean;
  move?: number;
  side?: 'white' | 'black';
  ply?: number;
}

export interface PaperEdge {
  id: string;
  source: string;
  target: string;
  d: string;
  arrow: string;
  width: number;
  dash: number[];
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaperFixture {
  provenance: { title: string; page: number; url: string; sha256: string; note: string };
  width: number;
  height: number;
  nodes: PaperNode[];
  edges: PaperEdge[];
  trunk: string[];
  chart: { d: string; fill: string; opacity: number }[];
  labels: { x: number; y: number; text: string; size: number; fill: string }[];
  points: { x: number; y: number; color: string }[];
  lens: Region;
  inset: Region;
}
