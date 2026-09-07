import { parseGame, parseGames } from './games';
import type { Game } from '../types/game';

interface ArchiveGame {
  pgn: string;
  url: string;
  rules: string;
  end_time: number;
}
export interface GamePage {
  games: Game[];
  remaining: string[];
}

async function request(
  url: string,
  signal: AbortSignal,
  accept = 'application/json',
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: { Accept: accept },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      'Could not reach the chess site. Try again, or download the game’s PGN and import that.',
      { cause: error },
    );
  }
  if (!response.ok) {
    if (response.status === 404)
      throw new Error('That player or public game was not found. Check the link or username.');
    if (response.status === 429)
      throw new Error('The chess site is rate limiting requests. Wait a moment, or import a PGN.');
    throw new Error(`The chess site returned ${response.status}. Try again, or import a PGN.`);
  }
  return response;
}

export function identifyInput(text: string): {
  kind: 'chess-player' | 'chess-game' | 'lichess';
  value: string;
} {
  const input = text.trim();
  if (/^[a-zA-Z0-9_-]{2,50}$/.test(input))
    return { kind: 'chess-player', value: input.toLowerCase() };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error(
      'Enter a Chess.com username, profile or game link, or a public Lichess game/study link.',
    );
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use a public chess game link.');
  const host = url.hostname.toLowerCase();
  if (host === 'chess.com' || host === 'www.chess.com') {
    const player = url.pathname.match(/^\/member\/([a-zA-Z0-9_-]+)\/?$/);
    if (player) return { kind: 'chess-player', value: player[1].toLowerCase() };
    const game = url.pathname.match(
      /^\/(?:game\/(?:live|daily)|live\/game|analysis\/game\/(?:live|daily))\/(\d+)(?:\/.*)?$/,
    );
    if (game) return { kind: 'chess-game', value: game[1] };
  }
  if (host === 'lichess.org' || host === 'www.lichess.org') {
    const study = url.pathname.match(/^\/study\/([a-zA-Z0-9]{8})(?:\/([a-zA-Z0-9]{8}))?\/?$/);
    if (study)
      return {
        kind: 'lichess',
        value: `https://lichess.org/api/study/${study[1]}${study[2] ? `/${study[2]}` : ''}.pgn`,
      };
    const game = url.pathname.match(
      /^\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?$/,
    );
    if (game)
      return {
        kind: 'lichess',
        value: `https://lichess.org/game/export/${game[1]}?clocks=false&evals=false`,
      };
  }
  throw new Error(
    'This link is not supported. Use a Chess.com profile/game, a Lichess game/study, or a PGN.',
  );
}

export async function archives(username: string, signal: AbortSignal): Promise<string[]> {
  if (!/^[a-zA-Z0-9_-]{2,50}$/.test(username.trim()))
    throw new Error('Enter the Chess.com username of a player in this game.');
  const data = await (
    await request(
      `https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`,
      signal,
    )
  ).json();
  if (!Array.isArray(data.archives))
    throw new Error('Chess.com returned an unreadable archive list. Try importing a PGN.');
  return data.archives
    .filter(
      (url: unknown): url is string =>
        typeof url === 'string' &&
        /^https:\/\/api\.chess\.com\/pub\/player\/[a-zA-Z0-9_-]+\/games\/\d{4}\/\d{2}$/.test(url),
    )
    .reverse();
}

async function monthGames(url: string, signal: AbortSignal): Promise<ArchiveGame[]> {
  const data = await (await request(url, signal)).json();
  if (!Array.isArray(data.games))
    throw new Error('Chess.com returned an unreadable game list. Try importing a PGN.');
  return data.games
    .filter((game: ArchiveGame) => game.rules === 'chess' && typeof game.pgn === 'string')
    .sort((a: ArchiveGame, b: ArchiveGame) => b.end_time - a.end_time);
}

export async function nextArchive(
  urls: string[],
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<GamePage> {
  const remaining = [...urls];
  while (remaining.length) {
    const url = remaining.shift()!;
    progress(`Reading games · ${url.split('/').slice(-2).join('/')}`);
    const games = (await monthGames(url, signal)).map((game) => parseGame(game.pgn));
    if (games.length) return { games, remaining };
  }
  return { games: [], remaining };
}

export async function importLink(
  input: string,
  username: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<GamePage> {
  const link = identifyInput(input);
  if (link.kind === 'lichess') {
    const games = parseGames(
      await (await request(link.value, signal, 'application/x-chess-pgn')).text(),
    );
    if (link.value.includes('/game/export/') && games.some((game) => game.headers.Result === '*'))
      throw new Error('This game is still in progress. Import a completed game to analyze it.');
    return { games, remaining: [] };
  }
  const urls = await archives(link.kind === 'chess-player' ? link.value : username, signal);
  if (link.kind === 'chess-player') return nextArchive(urls, signal, progress);
  // The published API indexes games by player/month, not by game ID. Search
  // serially to respect its rate limits; the player is explicit in the import UI.
  for (const [index, url] of urls.entries()) {
    progress(
      `Finding game · ${url.split('/').slice(-2).join('/')} · month ${index + 1} of ${urls.length}`,
    );
    const match = (await monthGames(url, signal)).find(
      (game) => game.url?.match(/\/(\d+)\/?$/)?.[1] === link.value,
    );
    if (match) return { games: [parseGame(match.pgn)], remaining: [] };
  }
  throw new Error(
    `That game was not found in ${username}’s published archives. Enter a player from this game, or import its PGN.`,
  );
}
