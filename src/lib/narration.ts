import narration from '../fixtures/tal-narration.json';

export interface TalEntry {
  text: string;
  label: string;
  depth: number;
  depthReached: boolean;
  playedRank: number | null;
  evalDeltaCp: number | null;
  outsideTopEight: boolean;
  model: string;
}

const entries = narration as Record<string, Record<string, TalEntry>>;

export const talNarration = (gameId: string, nodeId: string): TalEntry | undefined =>
  entries[gameId]?.[nodeId];
