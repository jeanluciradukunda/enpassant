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

Stockfish.js **18.0.8 lite single-thread** runs in a browser Web Worker. **Quick preview** requests 400 ms per root; **Depth 20 study** targets depth 20 with a 60-second ceiling per search. The study reports how many roots reached the target and offers an explicit retry for limited searches. Changing profile rebuilds the map and resets replay using that profile’s cache. **Explore this position** performs a fresh 1.8-second search in preview or a fresh study search. Each retained continuation contributes up to 20 legal half-moves.

MultiPV output comes from one completed depth iteration. Bounds are discarded and scores use White’s perspective. Candidate retention follows the paper’s 4 / n / 8-plus-played policy. If the played move is outside eight, a separate `searchmoves` search targets the siblings’ completed depth. Its exact rank remains unknown. Values at different depths do not enter the same width or chart comparison.

The chart compares the played candidate with the same retained siblings at the preceding root. It does not combine independently searched successor scores with that range. White and Black use their own perspectives and signed logarithmic scaling; missing comparisons remain blank. Scores are clipped to ±10 pawns for plotting, with distinct mate markers and score/depth titles. Bands are candidate ranges, not confidence intervals.

Every search starts from the initial FEN plus its complete UCI path, preserving repetition and fifty-move state. Every PV move is legally replayed. The UI distinguishes searched roots, terminal positions, reconstructed occurrences and truncated line endpoints. Legal-reply counts distinguish an actual single legal reply from a sparse returned PV. Draw flags follow chess.js, including claimable threefold and fifty-move draws.

Analysis runs sequentially, with manual exploration taking priority. Pause terminates the worker; Resume retries unfinished work. New games dispose the previous worker and ignore stale results. IndexedDB stores up to 3,000 searches keyed by engine/schema version, budget, requested depth, MultiPV count, played-move coverage or root restriction, initial FEN and full history. Explicit exploration bypasses cached results. Replay position and manual exploration are not persisted.

## Paper-based layout and stable replay

`EvolutionBuilder` retains path-specific occurrences and contributions from each searched root. A refreshed result replaces its previous paths; independent explorations retain their own branches and all ancestors needed for legal replay.

The display pipeline:

1. Shares junctions for same-ply occurrences with the same placement, turn, castling/en-passant rights and compatible event state. Clocks may differ; member histories remain separate. The route selector shows the histories visible in the current replay view.
2. Adds dashed recurrence links to matching ancestors while preserving chronological played instants. These links describe a relationship and are not extra chess moves.
3. Shortens event-free chains with one incoming and one outgoing connection. Played positions, leaves, junctions, validated events and their neighbors survive. Unassessed checks remain visible. A checking move assessed more than 50 cp below the best same-depth sibling can be shortened. The paper does not specify an operational effective-check classifier; this local loss threshold is an explicit browser adaptation.
4. Runs layered Graphviz with a 5:1 played-to-alternative placement preference and natural branch ordering. The original `group=played` caused the one-sided comb; a direct frozen-graph experiment verifies its effect. The full published optimization objective is not separately reimplemented.
5. Publishes an initial map and keeps surviving junction coordinates stable during exploration. New layout publication waits during playback. New glyphs get collision clearance near an existing ancestor; Fit graph includes additions.

Dotted paths unfold their actual intermediate moves inside the graph and expose move buttons beside the board. A clear strip leaves room for the hidden moves while retaining existing junction coordinates. Closing restores the compact map. Unfolding one shared route does not substitute another route’s history.

Played circles have side-to-move borders; ordinary alternative squares have black outlines. Draw fills take precedence over ordinary checks. Filled check markers mean a same-depth local search supports the move within 50 cp of the best sibling; unassessed checks are hollow. Red crowns require legally replayed checkmate. No root evaluation is copied onto later checks in its PV.

Edge quality and Graphviz placement weights are independent. Quality uses a monotone `log1p` adaptation of Eq. 2 on retained, comparable siblings, normalized to 1–30 and rendered at one tenth that scale. Weak played moves receive no artificial minimum. Unsearched downstream edges and ambiguous multi-route comparisons remain neutral. Chart x coordinates and camera match the played graph positions.

## Rendering

One pure scene builder (`buildScene`) decides which glyphs and edges are visible at a replay instant, their fills, widths, dashes and dimming. Three consumers read it: the WebGL renderer, the invisible hit overlay and the native SVG marks. In the browser the marks are painted with three.js: all edges form one anti-aliased stroke mesh with an analytic dash rule (sub-pixel dashes become the correct grey instead of aliasing), glyphs are signed-distance instanced quads, and move numbers and mate crowns are sprites from a Georgia digit atlas. The camera is a uniform, so panning and zooming never rebuild geometry or touch the DOM beyond the overlay `viewBox`. Edge reveal (180 ms) and unfold (260 ms) animations run on the GPU and honour `prefers-reduced-motion`. The detail lens is a second camera on the same scene. The overlay keeps one transparent hit shape and tooltip per visible glyph and edge, so clicks, Enter, roving focus and the `data-position`, `data-x`, `data-y`, `data-edge` and `.compressed-target` contract are unchanged. Server-side rendering and browsers without WebGL2 use the SVG marks.

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

## Measured research fidelity

**Import game → Try the paper’s game** opens the verified Deep Blue–Kasparov 1997 game-2 PGN. The [baseline study](research/paper-fidelity-study-2026-09-07.md) and [implemented comparison](research/paper-fidelity-implementation.md) document the method, corrected grouping experiment, full depth-20 benchmark and remaining limits. All 90 roots reached depth 20 in the measured study. Its retained graph has 1,237 vertices and no mate endpoints; the paper has 1,245 visible vertices and 11 crowns. The engine returned six mate-scored lines, all pruned by the reference candidate rule. Matching counts alone does not establish fidelity.

## Visual rule fidelity

The [visual-rules implementation report](research/visual-rules-implementation.md) documents event-chain compression, cross-ply predicted junctions and returns, occurrence-safe draw colouring, bounded source focus, local unfolding and measured marks. The default highlight mode shows legal checks in retained lines, excluding locally refuted checks; the alternate mode requires a local evaluation. Unknown effectiveness remains explicit in the inspector.
