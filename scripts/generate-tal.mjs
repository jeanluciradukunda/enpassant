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

const MODEL = 'claude-fable-5-1';
const TAL_SYSTEM = `You are Mikhail Tal, the eighth World Chess Champion, looking over someone's
shoulder at a diagram of their game.

You are romantic, attacking and funny. You love complications. You are entirely
unembarrassed about preferring a beautiful risk to a correct grind. You are
generous to the player in front of you: you are here because their game is
interesting, not to mark it.

Your own lines, which you may use when they fit and must not overuse:
- "There are two types of sacrifices: correct ones, and mine."
- "You must take your opponent into a deep dark forest where 2+2=5, and the path
  leading out is only wide enough for one."

WHAT YOU ARE GIVEN
A JSON payload describing ONE moment in the game: the move played, the engine's
retained candidate moves in SAN, the achieved search depth, and three values the
application computed for you (the evaluation change, the played move's rank, and
whether the played move fell outside the engine's shortlist entirely). Each
candidate carries a "played" flag; when the moment described is an alternative,
that flag tells you what was actually played instead.

HARD RULES. Breaking any of these ruins the demo.
1. Never name a move, piece or square that is not in the payload. If you want to
   describe a piece, the SAN tells you which one. Never infer from coordinates.
2. scoreCp and mateIn are from White's perspective: mateIn -3 means Black mates
   in three. evalDeltaCp is from the mover's perspective: positive always means
   the move cost the player who made it. Do not mix them.
3. Never say a game ended in checkmate unless mate is true. Games end in
   resignation far more often.
4. If depth is below 16, you may NOT say a candidate is "better", "best" or
   "preferred". Say "the engine's shortlist at depth N". You are allowed, and
   encouraged, to disagree with a shallow engine. That is the whole point of you.
5. Treat an evaluation gap under 30 centipawns as no difference at all.
6. Do not invent pawn structure, king safety, piece activity or opening names.
   You were not given them. Talk about what the moves DO, from the moves you
   were given.

VOICE
Two to four sentences. No headings, no bullet points, no move-by-move recitation.
Speak as if the person is sitting next to you. Land on one idea, not four.

The most interesting thing you can say is where the game turned. The second most
interesting is where it could have.`;

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

  if (mode === 'narrate') {
    const { EvolutionBuilder } = await load('/src/lib/evolution.ts');
    const { talPayload } = await load('/src/lib/tal.ts');
    const output = 'src/fixtures/tal-narration.json';
    const existing = JSON.parse(await readFile(output, 'utf8').catch(() => '{}'));
    const auth = await credentials();
    for (const study of TAL_GAMES) {
      const { game, entries } = saved.get(study.id);
      const builder = new EvolutionBuilder(game);
      const analysis = new Map(entries);
      for (const [id, result] of analysis) builder.append(id, result, 20);
      const payloads = game.positions
        .slice(1)
        .map((pos) => {
          const node = builder.get(pos.id);
          const parent = builder.get(node.parent);
          return { id: pos.id, payload: talPayload(game, node, parent, analysis.get(parent.id)) };
        })
        .filter((entry) => entry.payload?.engine.candidates.length);
      const chosen = chooseNodes(payloads, `p${study.checkpoint}`);
      console.log(
        `${study.id}: ${chosen.map((c) => `${c.id} ${c.payload.move.label}`).join(', ')}`,
      );
      existing[game.id] ??= {};
      for (const batch of chunks(chosen, 4))
        await Promise.all(
          batch.map(async ({ id, payload }) => {
            const text = await withRetries(() => narrate(payload, auth));
            if (!text) return;
            existing[game.id][id] = {
              text,
              label: payload.move.label,
              depth: payload.engine.depth,
              depthReached: payload.engine.depthReached,
              playedRank: payload.computed.playedRank,
              evalDeltaCp: payload.computed.evalDeltaCp,
              outsideTopEight: payload.computed.outsideTopEight,
              model: MODEL,
            };
            console.log(`  ${id} ${payload.move.label} (depth ${payload.engine.depth}): ${text}\n`);
          }),
        );
      await writeFile(output, JSON.stringify(existing, null, 2) + '\n');
    }
    execFileSync('corepack', ['pnpm', 'exec', 'prettier', '--write', output], { stdio: 'inherit' });
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

// Turning points first: the moves the engine did not shortlist, then the
// documented checkpoint, then the largest losses. Every game keeps at least one
// node where the engine disagreed with the move played.
function chooseNodes(payloads, checkpointId, limit = 10) {
  const byId = new Map(payloads.map((p) => [p.id, p]));
  const picked = new Map();
  const add = (entry) => entry && picked.size < limit && picked.set(entry.id, entry);
  for (const entry of payloads) if (entry.payload.computed.outsideTopEight) add(entry);
  add(byId.get(checkpointId));
  const losses = payloads
    .filter((p) => (p.payload.computed.evalDeltaCp ?? 0) >= 30)
    .sort((a, b) => b.payload.computed.evalDeltaCp - a.payload.computed.evalDeltaCp);
  for (const entry of losses) add(entry);
  if (![...picked.values()].some((p) => p.payload.computed.playedRank !== 1)) add(losses[0]);
  return [...picked.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

async function credentials() {
  if (process.env.ANTHROPIC_API_KEY) return { 'x-api-key': process.env.ANTHROPIC_API_KEY };
  try {
    const token = execFileSync('ant', ['auth', 'print-credentials', '--access-token'], {
      encoding: 'utf8',
    }).trim();
    return { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' };
  } catch {
    throw new Error('Set ANTHROPIC_API_KEY or run `ant auth login` first.');
  }
}

async function narrate(payload, auth) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...auth },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: TAL_SYSTEM,
      output_config: { effort: 'low' },
      thinking: { type: 'adaptive', display: 'summarized' },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const message = await res.json();
  if (message.stop_reason === 'refusal') {
    console.warn(`  refused: ${payload.move.label} (${message.stop_details?.category})`);
    return null;
  }
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

async function withRetries(task, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`  retry ${attempt}: ${error.message.split('\n')[0].slice(0, 120)}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}
