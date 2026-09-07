# Dynamic game visualizer

The `/` route imports and analyzes real standard chess games. `/paper` retains the independent Figure 5 reconstruction. The dynamic renderer applies the paper’s graph construction and visual vocabulary to legal engine variations; it does not reuse the static figure’s coordinates.

## Import and replay

- Paste PGN, upload a `.pgn` file, or select a game from a collection with Event tags. The main line is replayed with chess.js 1.4.0. Existing PGN annotations and side variations are not visualized; Stockfish generates fresh candidates.
- Chess.com usernames and profile links load the newest published month. **Load older games** pages through older months. Game links require a participant's username because the published API indexes games by player and month. Requests run serially and can be cancelled.
- Public Lichess game and study/chapter links use its PGN export endpoints. Ongoing Lichess games are rejected. Study chapters and user-provided partial PGNs may have an unfinished result.
- The bundled example is indigojeans–GM-Shadi, 10 August 2026, [game 172801642226](https://www.chess.com/game/live/172801642226). It is a real exported PGN, not a synthetic demonstration.
- PGNs are limited to 2 MB, 100 games per collection, and 600 half-moves per game. Only standard chess is supported. Custom FEN starts, Black-to-move starts, promotions, castling and en passant are supported.

**Whole game** shows the played line and available candidate branches. **Growing replay** begins at the root; Next/Play reveals the next played position, alternatives from that decision and the next evaluation point. Previous or the slider reverses visibility. Explicitly exploring the current decision can reveal its alternatives without advancing the played game, including after the final move. Existing nodes retain their coordinates. Selecting a node updates the board; candidate buttons offer keyboard access to the variations. Space toggles replay, arrows step, and Home/End jump when focus is outside form controls.

## Analysis and scores

Stockfish.js **18.0.8 lite single-thread** runs in a browser Web Worker. The initial pass requests up to eight candidates per played position, with a 400 ms / depth 20 ceiling per search. **Explore this position** requests 1.8 seconds, grows up to 20 half-moves of each retained candidate, and can be used on any alternative node. Actual achieved search depth is displayed. This is a quick exploratory analysis, not an exhaustive move tree or a substitute for longer full-engine analysis.

MultiPV output is read from one completed depth iteration. Bound-only scores are discarded; all centipawn and mate scores are converted to **White's perspective**. The chart shows the top candidate's evaluation of each played position, including positions after inferior played moves; it does not assign the best candidate's score to an unsearched played move. The white and black translucent bands show the range of searched candidates at the preceding decision, extended to include the actual played-position score. Each player’s band uses that player’s perspective, with signed logarithmic scaling. Missing analysis stays blank. Mate values are displayed separately and clipped to the chart’s ±10-pawn plotting range.

Each position search uses the initial FEN and its complete UCI move path. Nodes with the same board but different histories remain separate, preserving repetition and fifty-move state. Every PV move is validated before it becomes a node. Checks, mates and rule-based draws come from the reconstructed game history.

Analysis progresses sequentially. Deeper requests take priority after the current search. Pause terminates the worker; Resume retries unfinished work. Importing another game cleans up the previous worker and ignores stale results. Errors leave legal replay available. IndexedDB caches up to 3,000 searches, keyed by engine version, MultiPV count, time budget, initial FEN and the full move path. Cache eviction and unavailable storage do not affect correctness. The last imported PGN is stored locally; replay position and manual branch expansion state are not persisted.

## Paper-based layout and stable replay

`EvolutionBuilder` retains complete, path-specific move occurrences. Candidate selection follows the paper’s 4 / n / 8-plus-played policy: keep four when the played move ranks in the top four, otherwise retain through its rank up to eight, while always preserving the actual played line. Alternative-position searches retain their top four. A search ending earlier than 20 plies contributes only its actual legal continuation.

The display pipeline in `evolutionLayout.ts`:

1. Shares a display junction for occurrences with the same full FEN, ply and draw state. Every junction retains its member histories; board selection, subsequent searches and isolation still use a specific occurrence.
2. Shortens degree-two quiet chains. Played positions, checks, mates, draws, junctions, leaves and the neighbors of highlighted positions remain visible. Dotted paths open a readable sequence of move buttons beside the board. Selecting each button replays its full history; the compact map stays in place.
3. Runs Graphviz `dot` through `@viz-js/viz` in a module worker. It ranks the **shortened graph**, allowing hidden moves to occupy a compact connection. Played edges receive greater weight; branches are routed as Bezier curves above and below the trunk. Assigning every hidden ply its own rank was the cause of the stretched, parallel-lane regression.
4. Publishes the complete initial map, then freezes its coordinates for replay. Manual exploration preserves published glyph positions and routes, placing new glyphs relative to their existing ancestor with collision clearance. New layout publication waits while automatic playback is running. Fit graph includes later additions outside the original bounds.

The two-layer model permits visual convergence without substituting one legal history for another. Full-FEN and same-ply matching is deliberately conservative and may merge fewer transpositions than the research implementation. This browser adaptation uses a short Stockfish search, not the paper’s engine or an exhaustive tree; each imported game therefore has its own genuine shape. The source paper’s full optimization objective is not reimplemented.

The SVG preserves uniform scaling so played circles remain round. Side-to-move borders, numbered circles, small alternative squares, filled check markers and red mate crowns follow the observed figure. Edge thickness compares searched first moves locally; unsearched downstream edges use a neutral thin weight. The linked solid-red magnifier and dashed source region use the same node positions as the main diagram. Score points use the played nodes’ actual x coordinates and share the horizontal camera.

## Engine packaging

`pnpm dev` and `pnpm build` copy the pinned lite worker, its WASM and GPL license from the installed npm package into ignored `public/engine/`. Only that flavor enters the production output (about 7 MB); no third-party CDN or cross-origin-isolation setup is required. Direct Vite/Playwright invocation requires `pnpm prepare:engine` after a clean install.

Stockfish.js source revision for npm 18.0.8: [`93c994592dcf3b4b21052ab925e9b534df9c0918`](https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918). The UI links the source revision and bundled GPLv3 text. Application code remains GPL-3.0-or-later.

## Verification

Unit tests additionally verify display transpositions with distinct legal histories, quiet-chain shortening and event preservation, fixed anchors after expansion, and honest score-band ranges. Unit tests cover legal replay and special moves, custom starts, mate and repetition, import validation, score perspective, history-sensitive cache keys, stable coordinates and replay reveal rules. Browser tests use the actual WASM engine for full analysis, branch expansion, cache reuse, board/chart alignment, replay transport, PGN imports, error recovery and a 390px screen. The original four paper tests retain the independent source-image fidelity gate.

Run the external service checks explicitly:

```sh
LIVE_IMPORTS=1 pnpm test:e2e tests/e2e/import-live.spec.ts
```

These exercise a real Chess.com profile, a game URL, and the public Lichess example game. They are opt-in because availability and public archives can change.

Official integration references: [Chess.com published data API](https://www.chess.com/news/view/published-data-api), [Lichess API](https://lichess.org/api), [chess.js](https://jhlywa.github.io/chess.js/), [Stockfish.js](https://github.com/nmrugg/stockfish.js).

Layout references: [Chess Evolution Visualization, §§3.1–3.3](https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf), [Viz.js API](https://viz-js.com/api/).
