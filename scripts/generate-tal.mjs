// Tal's narration for the bundled games, generated ahead of time.
//   node scripts/generate-tal.mjs analyses   # saved quick-profile searches -> src/fixtures/analysis/
//   node scripts/generate-tal.mjs narrate    # payloads -> Claude -> src/fixtures/tal-narration.json
//   node scripts/generate-tal.mjs ask botvinnik-tal-1960 p42 "Why give the knight?"
//                                            # one question, printed as it streams
//   node scripts/generate-tal.mjs eval [n]   # scored harness: is Tal right, or fluent?
//                                            # every move/square he names is checked against
//                                            # what his tools returned; writes artifacts/tal-eval/
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { createServer } from 'vite';

// Node gives each address family 250 ms to connect by default; from Cape Town
// the API handshake alone can take longer, which surfaces as ETIMEDOUT.
setDefaultAutoSelectFamilyAttemptTimeout(3000);

const mode = process.argv[2];
if (!['analyses', 'narrate', 'ask', 'eval'].includes(mode)) {
  console.error(
    'usage: node scripts/generate-tal.mjs <analyses|narrate> | ask <game-id> <node-id> "<question>"',
  );
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

  if (mode === 'eval') {
    const perGame = Number(process.argv[3] ?? 4);
    const { EvolutionBuilder } = await load('/src/lib/evolution.ts');
    const { askTal } = await load('/src/lib/talAgent.ts');
    const { talPayload } = await load('/src/lib/tal.ts');
    const { moveLabel } = await load('/src/lib/games.ts');
    const auth = await credentials();
    const rows = [];
    for (const study of TAL_GAMES) {
      const { game, entries } = saved.get(study.id);
      // The same state the app holds once "Game analyzed" shows: every played
      // root searched, nothing else. No extra searches are appended.
      const builder = new EvolutionBuilder(game);
      const analysis = new Map(entries);
      for (const [id, result] of analysis) builder.append(id, result, 20);
      const ctx = { game, node: (id) => builder.get(id), analysis };
      const payloads = game.positions.slice(1).flatMap((pos) => {
        const node = builder.get(pos.id);
        const parent = builder.get(node.parent);
        const payload = talPayload(game, node, parent, analysis.get(parent.id));
        return payload ? [{ id: pos.id, payload }] : [];
      });
      const chosen = chooseNodes(payloads, `p${study.checkpoint}`, perGame);
      // One predicted node too: Tal must cope with a position the engine never searched from.
      const checkpoint = builder.get(`p${study.checkpoint}`);
      const alternative = [...analysis.get(checkpoint.parent).lines]
        .map((line) => `${checkpoint.parent}/${line.moves[0]}`)
        .find((id) => builder.get(id) && !builder.get(id).played);
      const targets = [...chosen.map((c) => c.id), ...(alternative ? [alternative] : [])];
      for (const nodeId of targets) {
        const node = builder.get(nodeId);
        const prompt = `The user has selected node ${nodeId} (${moveLabel(node)}) in ${game.headers.White} vs ${game.headers.Black}. Question: What happened here, and what does the engine make of it?`;
        let text = '';
        const returned = {
          san: new Set(),
          squares: new Set(),
          depths: new Set(),
          errors: 0,
          calls: 0,
        };
        let stopReason = 'unknown';
        for await (const event of askTal(ctx, prompt, { key: auth['x-api-key'] })) {
          if (event.type === 'text') text += event.text;
          else if (event.type === 'tool_result') {
            returned.calls++;
            if (event.isError) returned.errors++;
            harvest(event.result, returned);
          } else if (event.type === 'done') stopReason = event.stopReason;
        }
        const score = scoreClaims(text, returned, node);
        rows.push({
          game: study.id,
          nodeId,
          label: moveLabel(node),
          played: node.played,
          stopReason,
          ...score,
          text,
        });
        console.log(
          `${study.id} ${nodeId} ${moveLabel(node)}: ${score.supportedMoves}/${score.moveClaims} moves, ${score.supportedSquares}/${score.squareClaims} squares, ${score.depthClaims.length ? `depth ${score.depthOk ? 'ok' : 'WRONG'}` : 'no depth claim'}${score.mateClaim ? ', MATE CLAIM' : ''}${score.unsupported.length ? `  unsupported: ${score.unsupported.join(' ')}` : ''}`,
        );
      }
    }
    const moves = rows.reduce((a, r) => a + r.moveClaims, 0);
    const okMoves = rows.reduce((a, r) => a + r.supportedMoves, 0);
    const squares = rows.reduce((a, r) => a + r.squareClaims, 0);
    const okSquares = rows.reduce((a, r) => a + r.supportedSquares, 0);
    const summary = {
      runs: rows.length,
      moveClaims: moves,
      supportedMoves: okMoves,
      moveSupportRate: moves ? okMoves / moves : null,
      squareClaims: squares,
      supportedSquares: okSquares,
      squareSupportRate: squares ? okSquares / squares : null,
      depthWrong: rows.filter((r) => r.depthClaims.length && !r.depthOk).length,
      mateClaims: rows.filter((r) => r.mateClaim).length,
      toolErrors: rows.reduce((a, r) => a + r.toolErrors, 0),
    };
    await mkdir('artifacts/tal-eval', { recursive: true });
    const out = `artifacts/tal-eval/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(out, JSON.stringify({ model: MODEL, summary, rows }, null, 2));
    console.log('\n' + JSON.stringify(summary, null, 2) + `\n→ ${out}`);
  }

  if (mode === 'ask') {
    const [, , , gameId, nodeId, question = 'What is happening here?'] = process.argv;
    const study = saved.get(gameId);
    if (!study) throw new Error(`Unknown game ${gameId}; one of ${[...saved.keys()].join(', ')}`);
    const { EvolutionBuilder } = await load('/src/lib/evolution.ts');
    const { askTal } = await load('/src/lib/talAgent.ts');
    const { moveLabel } = await load('/src/lib/games.ts');
    const builder = new EvolutionBuilder(study.game);
    const analysis = new Map(study.entries);
    for (const [id, result] of analysis) builder.append(id, result, 20);
    const node = builder.get(nodeId);
    if (!node) throw new Error(`No node ${nodeId}`);
    const ctx = { game: study.game, node: (id) => builder.get(id), analysis };
    const auth = await credentials();
    const prompt = `The user has selected node ${nodeId} (${moveLabel(node)}) in ${study.game.headers.White} vs ${study.game.headers.Black}. Question: ${question}`;
    console.log(`> ${prompt}\n`);
    for await (const event of askTal(ctx, prompt, { key: auth['x-api-key'] })) {
      if (event.type === 'text') process.stdout.write(event.text);
      else if (event.type === 'tool_call')
        console.log(`\n  [tool] ${event.name}(${JSON.stringify(event.input)})`);
      else if (event.type === 'tool_result')
        console.log(`  [result] ${JSON.stringify(event.result).slice(0, 160)}…\n`);
      else if (event.type === 'done') console.log(`\n\n[${event.stopReason}]`);
    }
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

// Collect every SAN, square and depth a tool handed back, so a claim can be
// checked against what Tal was actually shown. A returned move also vouches for
// its destination square ("the check on a1" after Qa1+).
function addSan(san, into) {
  const bare = san.replace(/[+#]$/, '');
  into.san.add(bare);
  const target = bare.replace(/=[QRBN]$/, '').match(/([a-h][1-8])$/);
  if (target) into.squares.add(target[1]);
}
function harvest(value, into) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((v) => harvest(v, into));
  for (const [key, v] of Object.entries(value)) {
    if (key === 'san' && typeof v === 'string') addSan(v, into);
    else if ((key === 'lineSan' || key === 'movesSan') && Array.isArray(v))
      v.forEach((m) => addSan(String(m), into));
    else if ((key === 'square' || key === 'from' || key === 'to') && typeof v === 'string')
      into.squares.add(v);
    else if ((key === 'depth' || key === 'requestedDepth') && typeof v === 'number')
      into.depths.add(v);
    else harvest(v, into);
  }
}

function scoreClaims(text, returned, node) {
  const MOVE_TOKEN =
    /(?<![\w/])(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8]=[QRBN])(?:[+#])?(?![\w/])/g;
  const SQUARE_TOKEN = /(?<![\w/=.-])([a-h][1-8])(?![\w/])/g;
  const words = (w) => {
    const n = [
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
      'twenty',
    ].indexOf(w.toLowerCase());
    return n >= 0 ? n + 10 : Number(w);
  };

  const clean = text.replace(/[…]/g, ' ');
  const moveClaims = [...clean.matchAll(MOVE_TOKEN)].map((m) => m[1]);
  const supported = moveClaims.filter((m) => returned.san.has(m));
  const unsupported = moveClaims.filter((m) => !returned.san.has(m));
  // Bare squares: "the knight on f4". Pawn moves like "e5" are ambiguous with squares,
  // so a bare token counts as supported if it is a square shown OR a pawn move returned.
  const squareClaims = [...clean.matchAll(SQUARE_TOKEN)].map((m) => m[1]);
  const supportedSquares = squareClaims.filter(
    (sq) => returned.squares.has(sq) || returned.san.has(sq),
  );
  const depthClaims = [
    ...clean.matchAll(
      /depth\s+(?:of\s+)?(\d{1,2}|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)/gi,
    ),
  ].map((m) => words(m[1]));
  const depthOk = depthClaims.every((d) => returned.depths.has(d));
  const mateClaim = /\b(checkmate|mates? in|mated)\b/i.test(clean) && !node.mate;
  return {
    moveClaims: moveClaims.length,
    supportedMoves: supported.length,
    unsupported: [
      ...new Set([
        ...unsupported,
        ...squareClaims.filter((sq) => !returned.squares.has(sq) && !returned.san.has(sq)),
      ]),
    ],
    squareClaims: squareClaims.length,
    supportedSquares: supportedSquares.length,
    depthClaims,
    depthOk,
    mateClaim,
    toolErrors: returned.errors,
    toolCalls: returned.calls,
  };
}
