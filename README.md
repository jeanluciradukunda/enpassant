# enpassant

Import a chess game and watch its possibilities unfold. The original **Chess Evolution Visualization** paper study remains at `/paper`; the new game tool is at `/`.

- Import PGN text/files, Chess.com profiles or game links, and public Lichess game/study links.
- Explore real Stockfish alternatives with a synchronized chessboard and evaluation chart.
- Switch to **Growing replay** and press Play, or step through moves. Each decision grows the diagram while earlier branches stay in place.
- The paper’s compact branching, numbered circles, check/mate symbols, dotted quiet sequences, two score bands and linked red magnifier now also apply to imported games.
- Click a dotted path to unfold its hidden moves. Click any position to inspect it, **Explore this position** to grow more variations, or isolate and magnify a branch.
- Pause/resume analysis, change replay speed, scrub, pan and zoom. Analysis is cached in your browser.

The first visit opens indigojeans–GM-Shadi, a real Chess.com game from 10 August 2026. Your last imported PGN is remembered locally.

## Run

Node 20.11+ and pnpm 10.33.4 (pinned in `package.json`):

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. Development and build scripts prepare the local Stockfish worker and WASM automatically. No API keys or backend are required. Public game imports need network access; analysis runs locally.

```sh
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm test:e2e
```

Use `LIVE_IMPORTS=1 pnpm test:e2e tests/e2e/import-live.spec.ts` to check the external Chess.com and Lichess integrations. Browser tests require Playwright Chromium (`pnpm exec playwright install chromium`). If invoking Vite directly after a clean install, run `pnpm prepare:engine` first.

## Current scope

Standard chess, including custom starting FENs and special moves. The initial pass uses Stockfish 18 **lite**, up to eight candidate lines and a short search budget; deeper searches are available on demand. The graph shows sampled engine variations rather than every legal continuation. Chess.com game URLs need a participant's username to locate the game in their published monthly archives.

[Dynamic tool architecture and limits](docs/game-visualizer.md) describes import behavior, replay, score semantics, history-safe caching and the paper-based layout.

## The paper study

`/paper` reconstructs Figure 5 from Lu, Wang & Lin (IEEE TVCG, 2014) using **938 SVG nodes, 972 edges, 54 played positions and 22 mate markers**. Selection, linked magnification, isolation and pan/zoom remain available. **Original paper** switches to an independently rasterized source figure.

The recovered fixture is visual evidence, with no FENs or engine scores; it is separate from the dynamic game model. The source-image tests still require less than 12% color difference, at least 85% dark-pixel precision and 90% recall, allowing two pixels of rasterization tolerance. Updating app snapshots cannot rewrite that reference.

[Figure 5 reconstruction notes](docs/figure5-reconstruction.md) · [Original roadmap](SPEC.md)

## Source and license

Application code is GPL-3.0-or-later. Stockfish.js is GPLv3; its pinned source and license are linked from the tool. The paper figure and recovered geometry retain their original rights and attribution.

[Author-hosted paper](https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf) · [DOI](https://doi.org/10.1109/TVCG.2014.2299803)
