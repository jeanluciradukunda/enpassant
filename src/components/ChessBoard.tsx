import { Chess } from 'chess.js';
import type { EvolutionNode } from '../types/game';

// Original compact SVG silhouettes. Same geometry for both sides keeps pieces
// legible across platforms, without font-dependent Unicode chess glyphs.
function Piece({ type, white }: { type: string; white: boolean }) {
  return (
    <g
      fill={white ? '#faf9eb' : '#183923'}
      stroke={white ? '#243d2b' : '#102718'}
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {type === 'p' && (
        <>
          <circle cx="22.5" cy="13" r="5" />
          <path d="M19 18Q20 23 16 29H29Q25 23 26 18ZM14 30H31V35H14Z" />
        </>
      )}
      {type === 'r' && (
        <>
          <path d="M12 8H17V13H20V8H25V13H28V8H33V19H29L28 30H17L16 19H12ZM13 31H32V36H13Z" />
          <path d="M17 20H28" fill="none" />
        </>
      )}
      {type === 'b' && (
        <>
          <path d="M22.5 6C34 16 33 20 25 24L29 31H16L20 24C12 20 11 16 22.5 6ZM12 32H33V36H12Z" />
          <path d="M23 10L19 17" fill="none" />
          <circle cx="22.5" cy="5.5" r="2" />
        </>
      )}
      {type === 'n' && (
        <>
          <path d="M12 32C12 26 19 24 22 21L16 23L9 20L14 12L18 10L18 6L23 9C35 11 35 22 32 32ZM11 32H34V36H11Z" />
          <circle cx="19" cy="15" r="1.3" fill={white ? '#183923' : '#f6f5e5'} stroke="none" />
          <path d="M26 14Q29 21 23 27" fill="none" />
        </>
      )}
      {type === 'q' && (
        <>
          <path d="M10 13L17 20L16 10L22.5 18L29 10L28 20L35 13L30 29H15ZM13 30H32V35H13Z" />
          {[10, 16, 22.5, 29, 35].map((x, i) => (
            <circle key={x} cx={x} cy={[11, 8, 6, 8, 11][i]} r="2" />
          ))}
        </>
      )}
      {type === 'k' && (
        <>
          <path d="M22.5 5V13M19 8H26" fill="none" />
          <path d="M22.5 14C11 7 6 19 16 26L15 30H30L29 26C39 19 34 7 22.5 14ZM13 31H32V36H13Z" />
          <path d="M17 25H28" fill="none" />
        </>
      )}
    </g>
  );
}

export function ChessBoard({ node, flipped }: { node: EvolutionNode; flipped: boolean }) {
  const chess = new Chess(node.fen);
  const files = flipped ? 'hgfedcba' : 'abcdefgh';
  const ranks = flipped ? '12345678' : '87654321';
  const lastSquares = [node.uci.slice(0, 2), node.uci.slice(2, 4)];
  return (
    <svg
      className="chess-board"
      data-testid="chess-board"
      data-fen={node.fen}
      viewBox="0 0 360 360"
      role="img"
      aria-label={`Chessboard after ${node.san || 'the starting position'}`}
    >
      {Array.from(ranks).flatMap((rank, row) =>
        Array.from(files).map((file, col) => {
          const square = `${file}${rank}` as Parameters<Chess['get']>[0];
          const piece = chess.get(square);
          const dark = (row + col) % 2 === 1;
          return (
            <g key={square} transform={`translate(${col * 45},${row * 45})`}>
              <rect width="45" height="45" fill={dark ? '#749c73' : '#e0e9c9'} />
              {lastSquares.includes(square) && (
                <rect width="45" height="45" fill="#edcc4c" opacity=".45" />
              )}
              {piece?.type === 'k' && piece.color === node.turn && node.check && (
                <rect width="45" height="45" fill="#e95443" opacity=".65" />
              )}
              {col === 0 && (
                <text x="3" y="10" className="board-coordinate" fill={dark ? '#e0e9c9' : '#52744d'}>
                  {rank}
                </text>
              )}
              {row === 7 && (
                <text
                  x="36"
                  y="42"
                  className="board-coordinate"
                  fill={dark ? '#e0e9c9' : '#52744d'}
                >
                  {file}
                </text>
              )}
              {piece && <Piece type={piece.type} white={piece.color === 'w'} />}
            </g>
          );
        }),
      )}
    </svg>
  );
}
