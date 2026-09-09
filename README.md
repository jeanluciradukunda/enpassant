<p align="center">
  <img src="https://github.com/user-attachments/assets/8ecf7313-401b-4457-944c-65524b91c606" alt="enpassant. Every move has a multiverse." width="100%">
</p>

<p align="center">
  A quiet place to see what happened in a chess game—and what might have happened.
  <br>
  Import a game. Press play. Watch its possibilities unfold.
</p>

<p align="center">
  <a href="#start-here">Start here</a> &nbsp; · &nbsp;
  <a href="#a-game-in-three-moments">How it works</a> &nbsp; · &nbsp;
  <a href="#from-paper-to-play">The paper</a> &nbsp; · &nbsp;
  <a href="docs/DEVELOPMENT.md">Development</a>
</p>

<br>

<a href="https://github.com/user-attachments/assets/a0d80e0d-07ff-4c2d-809d-33aa4442b238">
  <picture>
    <source media="(prefers-reduced-motion: reduce)" srcset="https://github.com/user-attachments/assets/9bc612f0-6252-4215-be0a-37d01ef44a69">
    <img src="https://github.com/user-attachments/assets/af2a5b4f-2d95-4db3-8076-c1492f5837ee" alt="A real chess game replaying: the graph branches outward move by move while the board and score bands update." width="100%">
  </picture>
</a>

<p align="center">
  <sub>indigojeans / GM-Shadi · 21 moves · growing replay at 4×</sub>
  <br>
  <a href="https://github.com/user-attachments/assets/af2a5b4f-2d95-4db3-8076-c1492f5837ee">Animated preview ↗</a> &nbsp; · &nbsp;
  <a href="https://github.com/user-attachments/assets/a0d80e0d-07ff-4c2d-809d-33aa4442b238">Watch the recording ↗</a> &nbsp; · &nbsp;
  <a href="docs/images/game-visualizer.png">Explore the still image ↗</a>
</p>

<br>

## A game, in three moments

| 01 / Bring a game                                               | 02 / Let it unfold                                                                    | 03 / Follow a possibility                                                                |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------- |
| Paste a PGN, upload a file, or use a Chess.com or Lichess link. | Step through the moves or press Play. The board, graph and score bands move together. | Select a branch, inspect it through the magnifier, and ask Stockfish to explore further. |

The circles trace the played game. Squares mark alternative positions; dotted paths hold quiet sequences. Earlier branches stay rooted as new ones appear.

**Runs in your browser.** No sign-in, API key or backend. Public imports contact the chess site; analysis and cached games stay on your device.

## Start here

Use **Node 24 LTS** and **pnpm 10.33.4**. With Node installed:

```sh
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install
pnpm dev
```

Open **[localhost:5173](http://localhost:5173)**. Your first visit loads the game shown above; after that, Enpassant remembers your last import. Stockfish’s local engine files are prepared automatically.

Choose **Growing replay → Play**, or use **← / →** to step and **Space** to play or pause. Select a node to inspect it, scroll to zoom, and drag to pan.

<details>
<summary><strong>Supported games and useful limits</strong></summary>

- **PGN:** paste text or upload a file, including collections and custom starting positions. Standard chess, up to 2 MB, 100 games per collection and 600 half-moves per game.
- **Chess.com:** usernames, profiles and game links. A game link needs one participant’s username to locate its public archive.
- **Lichess:** public completed games and study/chapter links.
- **Analysis:** Stockfish 18 lite, up to eight candidates per position, with deeper searches on demand. The graph is a sample of engine continuations; each game has its own shape.

[Import behavior, score semantics and layout details →](docs/game-visualizer.md)

Try **Import game → Try the paper’s game → Depth 20 study** to explore Deep Blue–Kasparov (1997). [See the measured comparison with Figure 7 →](docs/research/paper-fidelity-implementation.md)

</details>

## From paper to play

Enpassant began with Lu, Wang & Lin’s _Chess Evolution Visualization_. The original diagram’s compact branches, restrained palette and linked magnifier still guide the design.

Open **[/paper](http://localhost:5173/paper)** to explore the reconstructed Figure 5: **938 nodes · 972 connections · 54 played positions**. Its source-image comparison is independent of application screenshots.

[Read the paper ↗](https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf) &nbsp; · &nbsp; [How the figure was recovered](docs/figure5-reconstruction.md)

## Made to be worked on

```sh
pnpm check       # Types, lint, formatting and unit tests
pnpm build       # Production build, including the local engine
pnpm test:e2e    # Real-engine browser and paper-fidelity tests
```

Install Chromium once with `pnpm exec playwright install chromium`. The [development guide](docs/DEVELOPMENT.md) covers the code map, validation, media and hosting. The [repo audit](docs/audit-2026-09-07.md) records the fixes and remaining work; [SPEC.md](SPEC.md) preserves the longer-term roadmap.

---

<sub>Built with React, TypeScript, chess.js, Stockfish and Graphviz. Application code: <a href="LICENSE">GPL-3.0-or-later</a>. The paper artwork retains its original rights. <a href="docs/ATTRIBUTION.md">Sources &amp; attribution</a>.</sub>
