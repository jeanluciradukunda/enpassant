// Tal's narration for the bundled games, generated ahead of time.
//   node scripts/generate-tal.mjs analyses   # saved quick-profile searches -> src/fixtures/analysis/
//   node scripts/generate-tal.mjs narrate    # payloads -> Claude -> src/fixtures/tal-narration.json
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

const mode = process.argv[2];
if (!['analyses', 'narrate'].includes(mode)) {
  console.error('usage: node scripts/generate-tal.mjs <analyses|narrate>');
  process.exit(1);
}

const server = await createServer({
  configFile: false,
  cacheDir: 'artifacts/vite-cache',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
const load = (path) => server.ssrLoadModule(path);

try {
  const { parseGame } = await load('/src/lib/games.ts');
  const { TAL_GAMES } = await load('/src/lib/studyGames.ts');
  const saved = new Map();
  for (const study of TAL_GAMES) {
    const data = JSON.parse(
      gunzipSync(await readFile(`docs/research/tal-quick/${study.id}-analysis.json.gz`)).toString(),
    );
    const game = parseGame(study.pgn);
    if (data.game.id !== game.id)
      throw new Error(
        `${study.id}: saved analysis is for a different PGN (${data.game.id} vs ${game.id})`,
      );
    saved.set(study.id, { game, entries: data.analysis });
  }

  if (mode === 'analyses') {
    const written = [];
    for (const [id, { game, entries }] of saved) {
      const path = `src/fixtures/analysis/${id}.json`;
      await writeFile(path, JSON.stringify({ gameId: game.id, entries }));
      written.push(path);
      console.log(`${path}: ${entries.length} positions for game ${game.id}`);
    }
    execFileSync('corepack', ['pnpm', 'exec', 'prettier', '--write', ...written], {
      stdio: 'inherit',
    });
  }
} finally {
  await server.close();
}
