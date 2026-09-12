import { describe, expect, it } from 'vitest';
import { parseGame, moveLabel } from '../src/lib/games';
import { TAL_GAMES } from '../src/lib/studyGames';

describe('Tal collection historical scores', () => {
  it.each([
    ['botvinnik-tal-1960', 93, '1960.03.26', '0-1', '21… Nf4', 'h5f4'],
    ['tal-larsen-1965', 73, '1965.08.08', '1-0', '16. Nd5', 'c3d5'],
    ['tal-smyslov-1959', 51, '1959.09.18', '1-0', '19. Qxf7', 'h5f7'],
  ])(
    'legally replays %s and preserves its published checkpoint',
    (id, plies, date, result, label, uci) => {
      const study = TAL_GAMES.find((study) => study.id === id)!;
      const game = parseGame(study.pgn);
      expect(game.positions).toHaveLength(Number(plies) + 1);
      expect(game.headers.Date).toBe(date);
      expect(game.headers.Result).toBe(result);
      expect(moveLabel(game.positions[study.checkpoint])).toBe(label);
      expect(game.positions[study.checkpoint].uci).toBe(uci);
      // All three scores end in resignation, not a played checkmate.
      expect(game.positions.at(-1)?.mate).toBe(false);
    },
  );

  it('uses the d-rook on move 18 against Larsen, as in Tal’s score', () => {
    const game = parseGame(TAL_GAMES.find((study) => study.id === 'tal-larsen-1965')!.pgn);
    expect(game.positions[35].san).toBe('Rde1');
    expect(game.positions[35].uci).toBe('d1e1');
  });

  it('matches the independently published board before 21… Nf4', () => {
    const game = parseGame(TAL_GAMES[0].pgn);
    expect(game.positions[41].fen.split(' ').slice(0, 4).join(' ')).toBe(
      '2r3k1/pp4bp/3p2p1/3Ppb1n/1qr5/2N1B1PP/PP2QPBK/R1R5 b - -',
    );
  });
});
