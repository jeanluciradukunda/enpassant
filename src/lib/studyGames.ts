import botvinnik from '../../public/games/botvinnik-tal-1960.pgn?raw';
import larsen from '../../public/games/tal-larsen-1965.pgn?raw';
import smyslov from '../../public/games/tal-smyslov-1959.pgn?raw';

// Historical scores and source checks: docs/research/tal-collection.md.
export const TAL_GAMES = [
  {
    id: 'botvinnik-tal-1960',
    title: 'Botvinnik / Tal',
    context: 'Moscow 1960 · World Championship, game 6',
    note: '21… Nf4 — a knight offered to open the king’s shelter.',
    checkpoint: 42,
    pgn: botvinnik,
  },
  {
    id: 'tal-larsen-1965',
    title: 'Tal / Larsen',
    context: 'Bled 1965 · Candidates semifinal, game 10',
    note: '16. Nd5 — a sacrifice at the centre of two competing attacks.',
    checkpoint: 31,
    pgn: larsen,
  },
  {
    id: 'tal-smyslov-1959',
    title: 'Tal / Smyslov',
    context: 'Bled 1959 · Candidates, round 8',
    note: '19. Qxf7 — follow the queen offer and the answering checks.',
    checkpoint: 37,
    pgn: smyslov,
  },
] as const;
