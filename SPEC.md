# Chess Evolution Visualizer — Builder Specification

> **Document purpose:** This is the complete brief handed to a builder agent. It tells the agent what to build, how to think about it, which libraries to use, which decisions are already made, and which edge cases must be handled. It does **not** contain implementation code — the builder agent writes that. It does contain enough specificity that two builders working from this spec would produce functionally identical systems.

> **How to use this document:** Read sections 1–4 first (vision, visual target, feature inventory, stack decisions). Then read in order. Sections 5–22 are dependency-ordered: each builds on the previous.

---

## Table of contents

1. Vision and scope
2. Visual target (the IEEE paper)
3. Feature inventory
4. Stack decisions (with rationale and what's already settled)
5. Architectural overview
6. Data model
7. State management
8. Stockfish integration
9. Import system
10. Graph generation algorithm
11. Streaming visualization
12. Multi-path system
13. Chessboard view and animation
14. Score chart
15. Layout and interaction
16. Visual design system
17. Component inventory
18. File and folder structure
19. Example games to ship
20. Performance budgets
21. Accessibility requirements
22. Browser compatibility
23. Edge cases that must be handled
24. Anti-patterns to avoid
25. Deployment and infrastructure
26. Testing strategy
27. Phased rollout
28. Acceptance criteria
29. Open questions deferred to the builder
30. Reference materials

---

## 1. Vision and scope

The Chess Evolution Visualizer is a single-page web application that turns any chess game into an interactive evolution graph showing not only what was played but also what *could have been played* at every position, with Stockfish doing the heavy lifting and the user steering the exploration.

The tool serves three audiences simultaneously:
- **Learners** — see why a move was a mistake by looking at the alternative branches that lead to better outcomes.
- **Experienced players** — quickly identify critical moments in a game without sequentially walking through every move.
- **Researchers and teachers** — examine families of games or specific positions with a global-to-local interaction pattern.

Scope is strictly client-side. There is no backend except a thin CORS proxy. Games are loaded from URLs (Lichess, Chess.com), pasted PGNs, typed move sequences, or username archive imports. Analysis is performed locally by Stockfish in a Web Worker. Caching is local (IndexedDB). Sharing happens via URL parameters that encode the imported-game reference and the user's view state. No accounts, no telemetry beyond opt-in error reporting.

The product is deliberately positioned alongside Lichess and Chess.com analysis boards, not as a replacement. It does what they don't: visualize the full *space* of moves Stockfish considered, not just the principal variation.

---

## 2. Visual target

The application's primary visual identity comes from the IEEE TVCG 2014 paper "Chess Evolution Visualization" by Lu, Wang, and Lin. Figure 5 of that paper (Plaskett vs Shipov, World Open U2200) is the reference image — the builder should keep it open while implementing the graph view.

**Key visual elements from the paper, ranked by importance:**

1. **Darkseagreen background** (CSS color `darkseagreen`, hex `#8FBC8F`) — this is the paper's signature color and should be retained for the graph canvas. Offer a dark-mode variant later, but the default light theme is this green.
2. **Numbered black circles** for actual played moves, arranged left-to-right along a horizontal main trunk. Each circle shows the move number in white text (move 1, 2, 3, ..., 27 in Figure 5).
3. **White and gray squares** branching vertically off the main trunk, representing Stockfish-computed alternative positions. Squares are visually subordinate to circles.
4. **Black/white fill** indicates which side has the advantage at that position; **gray fill** indicates a tied/equal position.
5. **Boundary color** indicates whose turn it is to move (black border = Black to move, white border = White to move).
6. **Red crown icons** (♔) overlay nodes that represent checkmate positions. These should pop out visually — the paper uses them sparingly and they immediately draw the eye to terminal nodes.
7. **Solid arrows** connect single-move transitions between positions.
8. **Dotted arrows** connect compressed chains where multiple intermediate positions have been hidden for readability. Clicking a dotted arrow should expand it.
9. **Edge thickness varies 1–30 pixels** based on tactical advantage gained by the move. Better moves get thicker arrows.
10. **A translucent score chart** sits below the graph, with the x-axis aligned to the move numbers in the graph above. It plots the evaluation over time as two filled areas (white perspective above 0, black below) with translucent bands showing potential evaluation ranges.

**Three new visual elements the builder will add (not in the original paper):**

11. **Path highlight overlays** — when the user enables "show played path" or "show best path", the corresponding nodes and edges glow in their assigned color (gold for played, green for best, etc.).
12. **Streaming pulse animation** — the node Stockfish is currently analyzing pulses with a subtle ring of light, communicating "this is where computation is happening right now."
13. **A board panel** that slides in from the right when a node is selected, showing the chess position with animated piece transitions.

The builder should **not** redesign the graph encoding. The paper's encoding is well-validated by the original user study. Add to it, don't replace it.

---

## 3. Feature inventory

### Features faithfully reproducing the paper

- Multi-PV Stockfish analysis at depth 20 (paper's spec)
- Top-N alternative selection per position using the paper's 4/n/8+played rule
- Transposition detection and node merging via FEN-based hash table
- Two-neighbor branch shortening with dotted-arrow compression
- Evolution graph with circles/squares/crowns and the full visual encoding above
- Aligned translucent score chart
- Click-to-desaturate-non-derived-nodes interaction
- Click-on-dotted-arrow-to-expand interaction

### New features added on top

- **Real-time streaming tree growth.** As Stockfish iteratively deepens its search, new nodes appear in the graph in real-time and the user watches the tree grow. The implementation strategy is breadth (MultiPV grows from 1 to 9) combined with depth (each Stockfish iterative-deepening step adds new PV continuations).
- **Multi-source game import.** A single import dialog accepts: Lichess game URLs, Lichess study URLs, Lichess usernames, Chess.com game URLs (live and daily), Chess.com usernames, raw PGN text (single or multi-game), move-by-move algebraic notation typed by the user. The dialog auto-detects input type.
- **Multi-path visualization.** All paths through the graph are visible simultaneously by default with low opacity; the user can highlight any combination of canonical paths (played, best, worst, Tal, quietest) or define custom paths by clicking nodes. Each highlighted path gets a distinct color from a predefined palette.
- **Interactive board panel.** Selecting any graph node opens an animated chessboard showing the position. When the user jumps from one node to another non-adjacent node, the board chunks the FEN transitions through intermediate plies so pieces appear to move naturally rather than teleporting.
- **Game-tree caching.** Imported games and Stockfish analyses persist in IndexedDB so reopening the same game or position is instant.
- **Shareable URLs.** The full view state (game reference, selected node, visible paths) encodes into a URL so users can share specific moments or analysis configurations.

### Features explicitly out of scope for v1

- Account system / login / cloud sync
- Live game analysis (analyzing games in progress)
- Game database search ("show me all games with this position")
- Annotation editing / commenting on positions
- Engine vs engine comparison (multiple engines simultaneously)
- LLM commentary generation
- Mobile-native apps (the web app should work on mobile via responsive design, but no native shell)
- Multiplayer / collaborative analysis

---

## 4. Stack decisions

These are settled. The builder agent should not propose alternatives without strong justification.

| Concern | Decision | Rationale |
|---|---|---|
| Build tool | Vite 6 | Fast, sensible defaults, first-class Worker support. |
| Framework | React 18 with strict mode | Mature, the entire chess UI ecosystem assumes React. |
| Language | TypeScript 5.7+ strict mode | Required for correctness in a system with this many message protocols. |
| Routing | None (single page) | The app is a single tool, not a multi-page site. URL params handle sharing. |
| Graph rendering | @xyflow/react v12 (React Flow) | Native React, custom-node-friendly, ships pan/zoom/minimap. SVG renderer handles paper's expected node counts (<500 after simplification). |
| Graph layout | @dagrejs/dagre | JavaScript port of GraphViz `dot` (which the paper uses). Sugiyama-style hierarchical layout produces the paper's left-to-right trunk-with-branches shape. |
| Chess engine | Stockfish 17 lite (WASM, multi-threaded with COOP/COEP, single-thread fallback) | Strongest practical option for browsers. Lite build at ~7 MB is the right tradeoff vs the 100+ MB NNUE build. |
| Chess logic | chess.js (latest stable) + chessops for edge cases | chess.js handles SAN/UCI/LAN parsing in one call; chessops covers X-FEN, Chess960, and FEN normalization edge cases chess.js misses. |
| PGN parsing | @mliebelt/pgn-parser | Best-in-class variation, NAG, and comment handling. chess.js's PGN parser drops variations. |
| Board UI | chessground (from Lichess) | Only library with correct multi-piece animation when jumping multiple plies; native SVG arrow rendering for best-move indicators. GPL-3 license. |
| State management | Zustand 5 with `subscribeWithSelector` + Immer middleware | Smaller than Redux, supports fine-grained subscriptions so React Flow doesn't re-render unnecessarily during streaming. |
| Animation | Motion (formerly Framer Motion) | `AnimatePresence` with `mode="popLayout"` for node entrance/exit, `layoutId` for FLIP-style transitions when dagre re-lays-out. |
| Score chart | Recharts | React-first, supports translucent area bands easily, x-axis alignment with the graph is simple. |
| IndexedDB wrapper | Dexie | Best DX, supports complex compound indexes for the FEN→eval cache. |
| Categorical colors | d3-scale-chromatic (schemeTableau10) | Designed for high discriminability across simultaneous categories. |
| CSS approach | Tailwind 3 + CSS custom properties for tokens | Tailwind for component classes, CSS variables for theme tokens (background colors, animation timings, board colors). |
| Testing | Vitest + Playwright + Testing Library | Vitest for units/integration, Playwright for E2E. |
| Linting | ESLint 9 (flat config) + Prettier 3 | Standard. |
| Package manager | pnpm | Faster, better monorepo support (we have the CORS proxy as a sibling project). |
| Hosting | Cloudflare Pages or Vercel | Both support COOP/COEP headers natively. Cloudflare for the CORS proxy Worker. |

### License implications

The combination of Stockfish (GPL-3.0) and chessground (GPL-3.0) means the entire web application must be licensed GPL-3.0 or AGPL-3.0 when distributed. The builder should:
- Add a top-level LICENSE file with the GPL-3.0 text.
- Add a SPDX-License-Identifier header to every source file.
- Note this in the README prominently — anyone forking for closed-source commercial use needs to swap chessground for an MIT board and Stockfish for a server-side API.

---

## 5. Architectural overview

The application has four conceptual layers, each with clean boundaries:

**Layer 1 — Data (immutable, persistent).** Imported game PGNs, parsed games, Stockfish analysis results, computed evolution trees. All cacheable in IndexedDB. Mutated only when a new import completes or new analysis arrives.

**Layer 2 — Engine (compute, isolated).** Stockfish lives in a Web Worker. The main thread sends `analyze` commands and receives streaming `info` updates. No engine code touches the React tree. The orchestrator (which decides what to analyze next based on the iterative deepening strategy) is also in a Worker, communicating with the Stockfish Worker.

**Layer 3 — State (mutable, in-memory).** Four Zustand stores — game tree (data), view (UI state), import (network operations), analysis (engine progress). Each store has narrow responsibilities and minimal cross-references. React subscribes via selectors that match exactly what each component renders.

**Layer 4 — UI (presentational).** React components that subscribe to state and render. The graph (React Flow), board (chessground wrapped in React), score chart (Recharts), import dialog, path sidebar. Components never call APIs or engines directly — they dispatch actions to stores, which call into Layer 2 or Layer 1.

**Cross-cutting concerns:**
- URL state synchronization (a hook that reads/writes URL params and reconciles with Zustand).
- Keyboard navigation (a hook that listens globally and dispatches to view store).
- Error boundaries wrap each major UI region so a crash in the graph doesn't kill the board.
- Feature detection on app boot determines whether SharedArrayBuffer is available, which engine flavor to load, and whether to show certain UI affordances.

**Data flow for a typical interaction:**

1. User pastes a Lichess URL into the import dialog.
2. Import dialog calls `detectInput()` → recognizes it as `lichess-game`.
3. `importStore.startImport()` creates a request, status = "fetching".
4. The Lichess client fetches PGN from `/proxy/lichess/game/export/{id}`.
5. Status = "parsing". The PGN goes through @mliebelt/pgn-parser → list of SAN moves with metadata.
6. Status = "analyzing". The orchestrator builds an initial tree containing just the played positions (no engine analysis yet) and writes it to `gameTreeStore`.
7. The graph renders immediately showing just the trunk of played moves.
8. The orchestrator begins streaming analysis from move 1, depth 5, MultiPV 1.
9. As `info` lines arrive, the orchestrator updates `analysisStore` (which doesn't trigger React Flow re-renders) and on PV changes, dispatches `applyBatch` to `gameTreeStore` adding new alternative nodes.
10. React Flow renders the new nodes via its standard reconciliation. Motion animates entrance.
11. The user clicks a node. `viewStore.selectNode()` updates `selectedNodeId`.
12. The board panel, subscribed to `selectedNodeId`, computes the path from previously-selected node to new node and chunks FEN transitions through chessground.
13. The user toggles "best path" in the path sidebar. `viewStore` updates path visibility. React Flow re-renders edges with new color overlays.

---

## 6. Data model

The fundamental data structure is the **evolution tree** — a directed acyclic graph (not a tree, because transposition merging creates nodes with multiple parents) representing the game and Stockfish's explored alternatives.

### Node concept

A node represents a unique chess position. Two positions with identical piece placement, turn, castling rights, and en-passant status (X-FEN-normalized) merge into a single node, even if reached by different move sequences. Each node tracks:

- A stable ID (the first 16 hex chars of SHA-256 of the normalized FEN).
- The full FEN with clock data for replaying.
- The normalized FEN used for deduplication.
- Move number (1-indexed) and ply index from root.
- Whose turn it is to move.
- Whether this position actually occurred in the played game.
- Whether this is on the main line (the played path) vs an engine alternative.
- Parent node IDs (multiple, due to transpositions).
- Child node IDs (multiple, one per analyzed continuation).
- The SAN and UCI move that led to this position from its primary parent.
- Event type if any: check, checkmate, stalemate, 50-move draw, threefold draw, insufficient material.
- Latest evaluation (centipawns or mate score, depth, engine name, timestamp).
- Move classification (brilliant, great, best, excellent, good, book, inaccuracy, mistake, blunder, miss).
- Currently-being-analyzed flag (drives the streaming pulse animation).

### Edge concept

An edge represents a transition between two positions. Edges may be **compressed**, meaning multiple intermediate positions have been hidden behind a single dotted arrow. Each edge tracks:

- A stable ID (`${sourceId}->${targetId}`).
- Source and target node IDs.
- Whether this represents a move that was actually played.
- Whether it's a compressed chain (paper's two-neighbor shortening result).
- If compressed, the number of plies and the chain of intermediate SAN moves.
- Thickness 1–30 derived from eval delta.
- The evaluation delta in centipawns (positive = good for the mover).

### Graph container

A graph contains:
- The root node ID.
- A map of all nodes by ID.
- A map of all edges by ID.
- An FEN index (normalized FEN → node ID) for transposition lookups.
- The source PGN.
- Game metadata (PGN headers: event, site, date, players, ratings, result, opening, ECO code).

### Path concept

A path is an ordered sequence of node IDs from root to a leaf. Five canonical paths are pre-computed for any game:
- **Played** — the actual game.
- **Best** — at each position, Stockfish's top recommendation.
- **Worst** — at each position, the worst non-blunder option (filtered to keep the path coherent — pure worst would be nonsense).
- **Tal** (internal ID: `critical`) — the path passing through the largest evaluation swings. Named for Mikhail Tal, the "Magician from Riga," whose games featured the most dramatic sacrifices in chess history. The path with the most "deep dark forest" moments.
- **Quietest** — the path with the smallest eval changes between consecutive moves.

Plus zero or more user-defined paths created by clicking nodes.

Each path has a color, visibility flag, and statistics (length, total cp gain/loss, count of blunders/mistakes/inaccuracies).

### Why this shape

- Multi-parent nodes (the DAG property) let transpositions render cleanly without duplicate visual nodes.
- Edges carry the compression flag so the renderer can swap solid for dotted styling without consulting any other state.
- Paths are stored separately from the graph so they can be toggled, recolored, or computed on demand without touching node data.
- Evaluation lives on the node, not the edge, because Stockfish evaluates positions; the edge thickness is a derived view of the eval delta between consecutive nodes.

---

## 7. State management

Use Zustand with three middleware: `subscribeWithSelector` (for fine-grained reactivity), `immer` (for ergonomic immutable updates), and `persist` only on the view store (to remember user preferences like board flip, dark mode, last-used path colors).

### Four stores, narrow responsibilities

**gameTreeStore** holds the current evolution tree and nothing else. Mutations: setTree (replace whole), addNode, addEdge, updateEvaluation, setAnalyzing (toggles the pulsing flag), applyBatch (atomic apply of many ops during streaming). All mutations are idempotent — adding a node that already exists is a no-op. The store is the single source of truth for what's in the graph; React Flow reads from selectors over this store.

**viewStore** holds UI state: mode (graph-only, split, board-only), selectedNodeId, hoveredNodeId, boardFlipped, showMinimap, showLegend, the path collection (map of path ID to Path object), path order, and the showOnlyHighlighted filter flag. This store mutates frequently — every hover, every selection — so it deliberately doesn't trigger graph re-layouts.

**importStore** tracks the current and recent import operations. One current operation at a time (cancel previous to start new). Tracks status, progress 0–1, error if any, source type, and timestamps. History capped at 20.

**analysisStore** tracks Stockfish progress per position. For each in-flight analysis, stores the node ID, current PV slots, current depth, target depth, completion status. Also holds the engine config (depth target, MultiPV, hash size, thread count). The streaming orchestrator pushes PV updates here.

### Selector discipline

The builder must not subscribe components to entire stores. Every `useStore(s => ...)` call returns an atomic slice — a primitive, a single object reference, or a memoized derived value. When a component needs multiple slices, it uses `useStore(s => ..., shallow)`. Returning a new array literal or object on every call is the most common bug in this pattern; the builder should write a custom ESLint rule (or at minimum, code review checklist) to catch it.

### Why four stores not one

A single store causes every state change to potentially re-render every subscribed component because Zustand's default equality check is reference. Splitting concerns means selecting a node updates only board-subscribed components, not graph or import dialog. This matters specifically for streaming: PV updates arrive 10–30 times per second; we cannot afford for the import dialog to re-render that often.

### Why Immer

The evolution tree is a deep nested structure. Without Immer, `applyBatch` requires manual immutable spreading of node/edge maps and their child arrays — error-prone and verbose. Immer's `produce` lets the builder write mutative-looking code that's actually immutable.

---

## 8. Stockfish integration

### Engine choice

Use Stockfish 17 in its WASM "lite" build. Two flavors:
- Multi-threaded build (requires SharedArrayBuffer, which requires COOP/COEP HTTP headers): faster, preferred.
- Single-threaded fallback (works without special headers, but slower): used when COOP/COEP is unavailable.

The Stockfish files are not npm-installed. They are downloaded once from the official Stockfish releases (or via the lichess.org WASM build), committed to `public/stockfish/`, and served as static assets. A postinstall script warns if they're missing.

### Worker architecture

Stockfish runs in a dedicated Web Worker. The main thread never blocks. The Worker has its own message handler that translates between a typed command protocol and Stockfish's UCI text protocol.

**Worker initialization sequence:**
1. Main thread sends `init` command with engine config (depth, MultiPV, hash size, threads, NNUE on/off, multi-threaded flag).
2. Worker dynamically chooses which Stockfish JS file to `importScripts` based on the multi-threaded flag and a runtime SharedArrayBuffer feature check.
3. Worker constructs the engine factory, attaches a message listener for UCI text output.
4. Worker sends `uci` command, waits for `uciok`, configures options (Hash, Threads, MultiPV, Use NNUE), sends `ucinewgame`, sends `isready`, waits for `readyok`.
5. Worker posts `ready` event back to main thread with engine name and version.

**Analysis request lifecycle:**
1. Main thread sends `analyze` with a unique request ID, target node ID, FEN, depth, and MultiPV count.
2. Worker stores the request ID and node ID as the active analysis context, clears its dedup map (tracking last-seen PV per multipv slot).
3. Worker sends UCI commands: `position fen <fen>` then `go depth <n>`.
4. Stockfish emits `info` lines continuously. Worker parses each line via the UCI info parser, deduplicates against the last-seen PV for that multipv slot (only forward updates when the move sequence actually changes), and posts `info` events with the parsed PvLine.
5. When Stockfish emits `bestmove`, Worker posts a `bestmove` event and clears the active context.
6. If main thread sends `cancel` with a matching request ID before completion, Worker sends UCI `stop` and posts `cancelled`.

### UCI info line parser

UCI info lines look like:
```
info depth 12 seldepth 18 multipv 1 score cp 28 nodes 84129 nps 1402150 time 60 pv e2e4 e7e5 g1f3 b8c6
info depth 6 seldepth 8 multipv 2 score mate -3 nodes 1234 nps 100000 time 12 pv f7f6 h5h6
```

The parser must handle:
- Optional fields in any order (depth, seldepth, multipv, score cp / score mate, nodes, nps, time, hashfull, currmove, currmovenumber, tbhits).
- Score variants: `score cp N`, `score mate N`, `score cp N lowerbound`, `score cp N upperbound` (the bound suffixes must be skipped).
- The `pv` field which is space-delimited and always last in the line.
- Lines without a `pv` field (early-search info before any move is fully explored) — these should produce a null result and be discarded.
- Garbage lines (UCI engines sometimes emit debug info) — return null.

The parser produces a `PvLine` value with depth, seldepth, multipv slot, cp or mate score (one of the two is non-null), the array of UCI moves, and the secondary fields (nodes, nps, time) for display.

### Dedup strategy

Stockfish emits info lines at ~50–500 Hz. Most of them are noise — the same PV at the same depth with slightly different nps numbers. The Worker maintains a `Map<multipv, lastSignature>` where the signature is `${depth}|${moves.join(' ')}`. An info line is only forwarded to the main thread if its signature differs from the last seen. This reduces traffic by an order of magnitude.

### Main-thread engine wrapper

A class `StockfishEngine` encapsulates the Worker:
- Constructor takes a config object, instantiates the Worker, sends `init`, waits for the `ready` event before resolving.
- Public methods: `analyze(nodeId, fen, depth, multipv)` returns a `Promise<AnalysisResult>` while emitting partial events via an event emitter; `cancel(requestId)`; `cancelAll()`; `setOption(name, value)`; `terminate()`.
- Internally maintains a map of active request IDs to their promise resolvers and partial-update subscribers.
- Posts events on each `info` arrival; resolves the promise on `bestmove`.

### One Worker per tab

Do not spawn multiple Stockfish Workers. Each Worker uses ~50 MB (lite, single-thread) to ~150 MB (lite, multi-thread). Multiple Workers would compete for hash table memory and CPU cores. Parallelism across positions comes from serial analysis with a fast pipeline, not from multiple engines.

---

## 9. Import system

### Five input types, one detector

The user pastes anything into a single textarea. A `detect()` function classifies the input and returns a tagged union:

- **PGN** — input starts with `[Event "..."]` or contains the PGN header pattern.
- **Lichess game URL** — matches `lichess.org/<8char-id>[<4char-color-suffix>][/<color>][#<ply>]`.
- **Lichess study URL** — matches `lichess.org/study/<8char-id>[/<8char-chapter-id>]`.
- **Lichess broadcast URL** — matches `lichess.org/broadcast/<slug>/<slug>/<8char-id>[/<8char-game-id>]`.
- **Chess.com game URL** — matches `chess.com/(game/)?(live|daily)/<digits>`. Note: `chess.com/daily/<digits>` (without `/game/`) does **not** exist as a URL pattern; do not match it.
- **Username (ambiguous)** — 3–25 char alphanumeric+underscore-hyphen string with no spaces or punctuation. The user is shown a follow-up choice: Lichess or Chess.com.
- **Move sequence** — anything else that, when tokenized (strip `1.`, `1...`, `{comments}`, `(variations)`, `$1` NAGs, game result markers), produces a sequence of strings that chess.js can parse as moves from the starting position.
- **Invalid** — none of the above.

### Lichess client

Implement a small client that talks to four Lichess endpoints:

- `GET /game/export/{gameId}` with `Accept: application/x-chess-pgn` — single game PGN. Game ID is the 8-char prefix; the 12-char form includes a 4-char color-perspective suffix that must be stripped before this call.
- `GET /api/games/user/{username}` with `Accept: application/x-ndjson` — streams NDJSON. Supports filters: max, since, until, vs, color, rated, perfType, opening, moves, pgnInJson, tags, clocks, evals, accuracy, ongoing, finished. Use `pgnInJson=true` so each JSON line contains the PGN inline.
- `GET /api/cloud-eval?fen={xfen}&multiPv={n}` — pre-analyzed positions. The FEN must be X-FEN-normalized: if no pawn can actually capture en passant, the en-passant square in the FEN must be replaced with `-`. The cloud-eval API caps multiPv at 5 and returns 404 for positions not in its cache.
- `GET /api/study/{studyId}/{chapterId}.pgn` and `GET /api/study/{studyId}.pgn` — for study chapter and whole-study imports.

Rate limits to assume: 20 games/sec anonymous, 30/sec with OAuth, 60/sec authenticated for own games. The cloud-eval endpoint should be hit at most ~1 request/sec per the community guidance.

OAuth is **optional** in v1. If implemented, use the personal-token flow (not full OAuth dance) — the user pastes a token from their Lichess account settings. Tokens go in memory only, never localStorage.

### Chess.com client

Chess.com's public API exposes only **monthly archives**, not individual games. Implement:

- `GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}` — returns all games for a username in a given month as JSON with embedded PGN. This is the recommended path.
- `GET https://api.chess.com/pub/player/{username}/games/archives` — returns the list of months a user has games for. Use this to populate a month picker.
- Unofficial: `GET https://www.chess.com/callback/{kind}/game/{id}` (where kind is `live` or `daily`) — single game by ID. **TCN-encoded**, requires client-side TCN decoding. Mark this code path with a "may break without notice" warning surfaced to the user.

The User-Agent header on all Chess.com requests must include a contact email/URL — Chess.com explicitly requests this in their PubAPI docs and uses it to deprioritize bad actors. Format: `User-Agent: chess-evolution-viz/1.0 (https://github.com/yourorg/chess-evolution-viz; contact: you@example.com)`.

Usernames on Chess.com are case-insensitive in URLs but stored as-typed in responses. Always lowercase the username before constructing API URLs.

### CORS proxy

Both Lichess and Chess.com have inconsistent CORS posture. Assume neither is reliably accessible from a browser fetch. Implement a separate Cloudflare Worker project (in `workers-cors-proxy/`) that:

- Accepts requests at `https://your-proxy.workers.dev/lichess/*` and `/chesscom-pub/*` and `/chesscom-callback/*`.
- Forwards them to the upstream with the path rewritten (`/lichess/api/games/user/foo` → `https://lichess.org/api/games/user/foo`).
- Adds CORS headers to the response (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`).
- Strips client-supplied headers that shouldn't reach the upstream (Authorization is allowed; cookies, custom auth headers, X-Forwarded-For are stripped).
- Sets the User-Agent on outbound Chess.com requests if the client didn't.
- Streams responses (don't buffer; pass through `ReadableStream`).
- Has a 30s timeout per request.

In dev, Vite's proxy config handles this locally. In prod, the Cloudflare Worker is hosted separately and the production build's import client uses its URL.

### PGN parser

Use @mliebelt/pgn-parser. It returns a structured AST per game including headers, the move tree (with variations), comments before/during/after each move, and NAG annotations. The builder must:

- Handle multi-game PGN files (the parser returns an array).
- Show a game picker when multiple games are detected.
- Preserve variations from the PGN as branches in the evolution tree — they become engine-alternative-equivalent nodes attached to their parent positions.
- Cap variation depth and breadth to keep the initial tree bounded (suggest depth 6, breadth 3 — anything beyond gets trimmed with a warning).
- Strip out NAGs and comments for the engine analysis pass but retain them as annotations attached to nodes for display.

### Move parsing

For move-by-move input, use chess.js's permissive (non-strict) `move()` call which accepts SAN (`e4`, `Nf3`, `O-O`), LAN (`e2-e4`), UCI (`e2e4`), and mildly malformed variants (`Pf2-f4`, `ef4` for `exf4`). Tokenize the input by:

1. Strip `{comments}` (curly-braced) and `(variations)` (parenthesized) and `$N` NAGs.
2. Strip move numbers `1.`, `1...`, `2.`, etc.
3. Strip game result markers `1-0`, `0-1`, `1/2-1/2`, `*`.
4. Split remaining text by whitespace.
5. Feed each token to `chess.move()` in sequence. On failure, stop and report the offending token.

Surface warnings for tokens that parsed only with non-strict mode (so the user knows their notation was unusual). Reject silently-mismatched moves (e.g., `Nbd7` when only `Nd7` is unambiguously legal — chess.js may accept this; we should warn).

### Error handling

Every import path produces structured errors with codes: `network`, `not-found`, `rate-limited` (with `retryAfter` seconds), `cors`, `parse`, `invalid-input`, `private-game`, `cancelled`, `unknown`. The import dialog displays these with appropriate UI:

- `network` / `cors` → "Connection problem" with retry button.
- `not-found` → "Game not found. Make sure the URL is correct and the game is public." with retry.
- `rate-limited` → "Too many requests. Retrying in N seconds…" with auto-retry after the indicated delay.
- `parse` → "Couldn't read the PGN. Maybe try pasting it again?" with the offending line highlighted.
- `private-game` → "This game is private and can't be imported." with no retry.
- `invalid-input` → inline guidance ("Looks like a Lichess URL but the game ID is wrong shape").

### Import history

The view store persists a list of the last 20 successful imports to localStorage. Each entry records source, identifier, label, and timestamp — **not** the PGN itself (PGNs go in IndexedDB). The import dialog shows this as a "Recent imports" list with one-click re-open.

---

## 10. Graph generation algorithm

This is the core algorithm transforming a list of played moves plus engine analyses into the displayable evolution tree. It runs in three phases.

### Phase 1: Build the main trunk

Given a parsed PGN with N played moves:

1. Start with the root position (FEN). Create a root node.
2. For each played move, apply it via chess.js to get the resulting position. Create a node for that position (marked `isPlayed: true`, `isMainLine: true`). Create an edge from the previous node to this one (marked `isPlayed: true`).
3. Detect events at each node: check, checkmate, stalemate, threefold repetition, 50-move rule, insufficient material.
4. Record any variations from the PGN as additional branches at their respective positions (marked `isPlayed: false`, `isMainLine: false`).
5. Insert all created nodes into the FEN index (normalized FEN → node ID). If a node would have the same normalized FEN as an existing one, merge: add the new parent ID to the existing node's `parentIds`, redirect the edge to point at the existing node.

This produces the "skeleton" tree — the played path plus PGN variations — which renders immediately so the user has visual feedback while Stockfish analyzes.

### Phase 2: Engine alternatives via top-N PV selection

For each played position (every node where `isPlayed: true`), the orchestrator requests Stockfish analysis at depth 20 with MultiPV that grows over time (start at 5, end at 9). When analysis completes, apply the paper's top-N selection rule:

- Let `n` be the rank (1-indexed) of the played move within Stockfish's sorted PV list.
- If `n ≤ 4`: select PVs 1, 2, 3, 4.
- If `4 < n ≤ 8`: select PVs 1, 2, ..., n.
- If `n ≥ 9`: select PVs 1, 2, ..., 8 plus the PV containing the played move.

For each selected PV, follow it forward a few plies (suggest 3–5) creating nodes and edges as you go. Apply transposition merging at each step — if a child position already exists in the FEN index, merge instead of duplicating.

Mark non-played alternative branches as `isPlayed: false`, `isMainLine: false`.

### Phase 3: Simplification

After all engine analysis is in, run a simplification pass:

**Step 3a — Transposition pass (already done incrementally, but verify):** confirm no two distinct nodes have the same normalized FEN. If found, merge.

**Step 3b — Branch shortening:** identify chains of nodes where every interior node has exactly one parent and one child *and* no `event` on the node *and* none of the interior nodes are played-game positions. Collapse each such chain into a single edge marked `isCompressed: true` with the chain's plies stored on the edge. The endpoints of the chain remain as nodes.

**Step 3c — Dead branch trimming:** if a branch has no events, no leaves, and ends within the depth limit, leave it. If it terminates at a checkmate or other endgame, keep it (these are the visually interesting leaves). The paper specifically retains all branches with events.

### Edge thickness math

For each edge from position A to position B, the edge thickness is derived from how good move B was relative to the alternatives at position A:

1. Let `evalDelta_B` = (eval after move B from white's perspective) − (eval at A from white's perspective), sign-flipped for black's moves so positive always means "good for the mover."
2. At node A, compute `minDelta_A` = the smallest `evalDelta` among all outgoing edges.
3. For each outgoing edge: `thickness = clamp(1, 30, round((log(evalDelta - minDelta + 1))^2 * scaleFactor))`.
4. Scale factor is chosen so that the largest evalDelta in the graph maps to ~30 and the smallest to ~1. Computed dynamically per graph.

Edges with no eval yet (still streaming) get thickness 1 (thin) until analysis completes.

### Path computation

Five canonical paths computed after the graph is built:

- **Played**: trace `isPlayed: true` nodes from root via `isPlayed: true` edges. Trivial.
- **Best**: from root, at each step take the edge with the highest evalDelta. Stop at any leaf node.
- **Worst**: from root, at each step take the edge with the lowest evalDelta (excluding edges to nodes with no eval, and excluding moves that are blunders if other non-blunder options exist — pure worst-path is incoherent; the goal is "what would a bad player choose").
- **Tal** (internal ID: `critical`): the path containing the largest single evalDelta. Compute by finding the highest-evalDelta edge anywhere in the graph, then trace its ancestor chain to root and one descendant chain greedily.
- **Quietest**: from root, at each step take the edge whose evalDelta is closest to zero (smallest magnitude). This shows the line where eval barely changes.

Each path is stored as an ordered array of node IDs. Recompute when new nodes are added during streaming.

### Move classification

After Stockfish provides eval for a played move, classify it per Chess.com's taxonomy (using their published threshold ranges):

- **Brilliant (!!)** — only when the move is a piece sacrifice (losing material to chess.js's piece-value count) *and* maintains a winning or equal position.
- **Great (!)** — the only good move in a critical position (significantly better than all alternatives by ≥ 200 cp).
- **Best** — matches engine's PV 1.
- **Excellent** — within 20 cp of best.
- **Good** — within 50 cp of best.
- **Book** — within the first 8 moves and the position appears in a known opening database. Optional in v1; skip if too complex.
- **Inaccuracy (?!)** — loses 50–100 cp vs best (or 5–10% win probability).
- **Mistake (?)** — loses 100–200 cp (or 10–20%).
- **Blunder (??)** — loses >200 cp (or >20%).
- **Miss** — failed to take a forced win that the engine sees.

Classification renders as a colored dot on the played-move nodes (small visual indicator).

---

## 11. Streaming visualization

This is the hardest feature. The user opens a game, the engine starts analyzing, and the user watches the tree literally grow over a span of 30–120 seconds.

### Strategy: two axes of growth

**Breadth axis (MultiPV):** Stockfish supports returning the top N principal variations. Starting at MultiPV=1 (one PV per position) and growing to MultiPV=5 then 9 over time produces a tree that starts as a single trunk and progressively sprouts alternatives. Each MultiPV step takes time — the engine recomputes — so the cadence is roughly: depth 5 with MultiPV 1, then depth 10 with MultiPV 3, then depth 15 with MultiPV 5, then depth 20 with MultiPV 9.

**Depth axis (iterative deepening):** Stockfish naturally iterates depth 1, 2, 3, ... up to the target. Each new depth refines existing PVs and may add new ones. As depth increases, the PV move sequences grow longer, which translates visually to the tree extending further to the right.

**Recursive expansion:** after the root position's analysis matures (depth ≥ 10 with MultiPV ≥ 3), the orchestrator queues analysis of the top 2–3 child positions. Those children begin analysis at depth 5, MultiPV 3. This creates a depth-first-ish exploration where the most promising branches sprout sub-branches.

### Orchestration loop

The orchestrator (running in its own Web Worker or just on the main thread — builder's call based on profiling) maintains a priority queue of positions to analyze. Items in the queue are sorted by:
1. Played positions first (the trunk of the tree).
2. Within played positions, earlier move number first.
3. Within engine-suggested positions, prefer children of high-eval ancestors.

At each tick:
1. Dequeue the next position.
2. If Stockfish is currently busy with a higher-priority position, skip (the lower-priority item stays in the queue).
3. Send `analyze` to Stockfish with depth = min(target_depth, current_position_depth_budget) and the current MultiPV setting.
4. Stream PV updates as they arrive (see below).
5. On `bestmove`, mark the position complete, decide whether to expand children based on its eval and tree-budget constraints, enqueue children.

### Throttling tree mutations

Stockfish info lines arrive at ~50–500 Hz raw, ~10–30 Hz after dedup. Even 30 Hz of React Flow updates is too much — dagre re-layout takes 50–200 ms for 200 nodes. The builder must batch mutations to once per requestAnimationFrame (16 ms ≈ 60 Hz, but realistically clustered so updates happen ~10–15 times per second).

**Batching pattern:** the main thread accumulates pending tree mutations in a `Map<key, op>` keyed by `(position, multipv-slot)` so newer updates supersede older ones for the same slot. A single `requestAnimationFrame` callback flushes the map, calling `gameTreeStore.applyBatch(ops)` once. Set a flag `rafScheduled` to avoid scheduling more than one frame at a time.

### Animation feel

- **Node entrance:** wrap React Flow nodes in a Motion `motion.div` with `initial={{ scale: 0, opacity: 0 }}` and `animate={{ scale: 1, opacity: 1 }}` using a spring transition (stiffness ~300, damping ~25). This gives a slight bounce — "alive" feel.
- **Edge drawing:** when a new edge appears, animate its `stroke-dashoffset` from the path's length to zero over 400 ms with `repeatCount=1`. This makes the edge appear to draw itself from source to target.
- **Layout transitions:** when dagre re-lays-out due to new nodes, existing nodes' positions change. Wrap the graph in Motion's `LayoutGroup` so position changes animate via FLIP. The default ~300 ms ease is fine.
- **Pulse on analyzing node:** the currently-analyzing node gets a CSS box-shadow keyframe animation that pulses outward and inward over 1.5s. Implemented as a class on the node when `isAnalyzing: true`.

### Streaming indicator UI

A small overlay in the corner of the graph shows:
- Engine name and version.
- Current depth (e.g., "Depth 15 / 20").
- MultiPV (e.g., "MultiPV 5 / 9").
- Positions analyzed / total in queue.
- A "Pause" and "Cancel" button.

When analysis pauses (user clicked Pause), Stockfish receives UCI `stop`, the current state is preserved, and resuming continues from where it left off (the queue persists; depth resumes at the position's last achieved depth).

### Cancellation semantics

When the user navigates away from a game, switches games, or imports a new game, all in-flight analysis is cancelled:
1. Orchestrator clears its queue.
2. Sends `cancel` for the active Stockfish request.
3. Stockfish receives UCI `stop`, returns `bestmove (none)`, the Worker posts `cancelled` event.
4. Tree mutations stop. Existing nodes/edges remain (they're real — the next time the user reopens this game, the cache will hit).

### Cache integration

Before queuing a position for Stockfish, check the IndexedDB cache (key = `${normalizedFen}|d${depth}|pv${multipv}`). If present and depth ≥ desired, use the cached PVs directly and skip Stockfish. Also check Lichess Cloud Eval as a remote L2 cache (cheap, depth 25+, free, capped at MultiPV 5). Fall back to local Stockfish only on cache miss.

After analysis completes, write the result to IndexedDB.

---

## 12. Multi-path system

All paths are computed and stored as ordered node-ID arrays. The renderer overlays paths on the existing graph via edge color, node ring, and per-path opacity rules.

### Default visibility

On graph load:
- Played path: visible.
- All other paths: hidden by default.
- The graph renders edges with the default styling (thickness from eval delta, color by `isPlayed` — black for played, dark gray for non-played).

When the user toggles a path on, its color overlays the existing edges. When multiple paths share an edge, that edge displays multiple color "stripes" — either as parallel offset lines, or as a multi-color dashed pattern. The builder should choose the visually cleanest approach (parallel offsets work well up to 3 overlapping paths; beyond that, use a thicker edge with a gradient).

### Path sidebar UI

A right-side panel (or collapsible drawer) lists all paths:

- **Canonical paths section** (always present): Played, Best, Worst, Tal, Quietest. Each row has a checkbox, color swatch, name, and stats summary (length, total eval gain/loss, blunder count). The **Tal** path (internal ID: `critical`) shows the line through the largest evaluation swings — named for Mikhail Tal, the "Magician from Riga," whose games featured the most dramatic sacrifices in chess history. A short tooltip on hover explains the naming for users unfamiliar with him.
- **User paths section** (initially empty): "Add path" button creates a new path-creation mode where the user clicks nodes to define the path. Each row has the same fields plus rename and delete actions.
- **"Show only highlighted" toggle** at the bottom: when on, all non-highlighted edges drop to opacity 0.1 (almost invisible). When off, non-highlighted edges render at opacity 0.4 (visible but subordinate).

### Path interaction patterns

- **Click checkbox** → toggle visibility.
- **Click color swatch** → open color picker (canonical paths have fixed colors; user paths are customizable).
- **Hover row** → temporarily emphasize that path in the graph (boost opacity to 1.0, others to 0.05).
- **Click row name** → select the path's source node in the graph and pan to it.
- **Right-click a node in the graph** → context menu with "Select path through here" / "Add to custom path".
- **Click "Add path" then click N nodes in the graph** → creates a custom path connecting those nodes via shortest path through the graph. Auto-name "Custom 1", "Custom 2", etc.

### Path color palette

Canonical paths have fixed colors:
- Played: gold `#FFD700`
- Best: green `#22C55E`
- Worst: red `#EF4444`
- Tal: purple `#A855F7` (internal ID stays `critical`; CSS token `--path-critical`)
- Quietest: slate `#64748B`

User paths cycle through Tableau-10 minus colors visually close to canonicals: `#4E79A7`, `#F28E2B`, `#76B7B2`, `#EDC948`, `#B07AA1`, `#FF9DA7`, `#9C755F`, `#BAB0AC`, etc.

The builder should also offer a colorblind-safe palette toggle that swaps in viridis or similar.

### Path comparison mode (optional in v1, plan the data shape)

Two paths can be compared side-by-side: the graph splits into two panels each showing the same graph with a different highlighted path; the boards below sync as the user navigates either side. This is a stretch goal — the builder should not block v1 ship on this but should design the path data shape so it can be added without refactoring.

---

## 13. Chessboard view and animation

The board is the secondary view. When a node is selected, the board panel shows that position. When the user moves between nodes, pieces animate.

### Chessground integration

Chessground is the board library (from Lichess). Wrap it in a thin React component that:

- Initializes the chessground instance on mount with paper-faithful config: 200 ms animation duration, `viewOnly: true` (user can't drag pieces; this is an analysis tool), `drawable.enabled: true` (for arrow rendering), `drawable.visible: true`, `coordinates: true`, `highlight: { lastMove: true, check: true }`.
- Subscribes to `viewStore.selectedNodeId` and updates the board via chessground's `.set()` method when it changes.
- Cleans up on unmount.

### Multi-ply animation

When the user jumps from node A (ply 5) to node Z (ply 12), naively setting chessground to Z's FEN causes pieces to take straight-line shortcut paths through other pieces — visually wrong.

The fix: compute the path of intermediate nodes A→...→Z by finding the lowest common ancestor and walking up then down. Chunk the FEN sequence and update chessground every 120 ms. Each chunk triggers chessground's 200 ms piece animation; the next chunk starts 120 ms later. This produces a smooth replay across all intermediate plies — about 8 plies/second.

For longer jumps (>15 plies), cap the animation time at 2 seconds total and adjust chunk timing accordingly so it doesn't drag.

If the user holds down the right arrow key (auto-advance), the chunks happen at 300 ms each — slower so the user can see each move.

### Best-move arrows

When a node is selected, the analysis store has the top PV for that position. The first move of that PV gets rendered as a green arrow on the board (chessground's drawable.autoShapes). If the played move at that position differs from the best move, also render the played move as a yellow arrow. Multiple arrows can stack on the board.

When the user toggles "show top 3 alternatives", arrows are rendered for the first move of each of the top 3 PVs, with thickness/opacity decreasing for lower-ranked options.

### Board controls

Below the board:
- **Flip button** — swaps the board's orientation. Persist in viewStore.
- **Previous/Next ply buttons** — walk through the played path. Disabled when at start/end. Keyboard equivalent: arrow keys.
- **Jump to start / Jump to end buttons** — jump to root or final position of current path.
- **Play/Pause auto-advance** — auto-advances at 1.5s per ply through the current highlighted path (or played path if none).

### Position details

Below or beside the board:
- Move notation (SAN) for the move that reached this position.
- Move number and side to move.
- Position evaluation (centipawns from white's perspective, or "Mate in N").
- Classification badge if available (Brilliant, Best, Inaccuracy, etc.).
- Side panel listing the top 3 PVs at this position with their moves and evals.

---

## 14. Score chart

The score chart sits below the graph (or below the board in a tabbed layout on narrow screens). It shows evaluation over the move number axis.

### Chart specification

- **X-axis**: move number 1 to N, aligned to the graph above so move 12 in the chart corresponds to move 12 in the graph.
- **Y-axis**: evaluation in centipawns. Log-scale-like transform (sign-preserving sigmoid or piecewise: linear in [-100, 100], log beyond) so small evals near zero are visible while extreme evals at ±2000 don't dominate.
- **White advantage region** above 0 (light fill), **black advantage region** below 0 (dark fill). This is the paper's visual.
- **Played-game line**: a solid line at the actual eval after each played move.
- **Potential bands**: at each move, the range of evals that *could* have been achieved (based on the top N PVs) rendered as a translucent band around the line. The band's width visualizes how much the player gave up vs the best alternative.
- **Critical event markers**: vertical lines at moves where the eval swung by >100 cp (a thin red line for blunders, thin green for brilliancies). Hover shows "Move 12: Blunder, eval changed from +0.5 to -2.3".

### Synchronization with the graph

- **Hover chart point** → highlight the corresponding node in the graph.
- **Click chart point** → select the corresponding node (same as clicking it in the graph).
- **Selected node change** → if the selected node is on the played path, a vertical cursor line on the chart positions itself at that move.

### Pan/zoom

Recharts supports brush components for chart panning. For long games (>60 moves), the default view should fit the whole game, and a brush below the chart lets the user zoom in on a move range.

### Edge cases

- For games shorter than 5 moves, the chart still renders but stretches to fill horizontal space.
- For games with mate scores, the chart caps the y-axis at ±2000 cp visually but shows "M5" or "M-3" labels at those points.
- For games still being analyzed, the line is drawn up to the latest analyzed position; the rest is dashed (indicating "analysis pending").

---

## 15. Layout and interaction

### Three view modes

- **Graph-only** — graph fills the screen. Used by users who want maximum visualization area. Toolbar at top, score chart at bottom (slim).
- **Split** (default) — graph on the left (60%), board + analysis panel on the right (40%). Score chart spans the bottom. This is the daily-driver mode.
- **Board-only** — board fills the screen with analysis panel beside it. Graph collapses to a thin minimap. Used by users who want to focus on positions.

Mode switching is animated via Motion `layoutId` shared element transitions. The board panel slides in from the right when switching from graph-only to split.

### Resizable panels

In split mode, the divider between graph and board is draggable. Persist the ratio in viewStore. Default 60/40, range 30/70 to 80/20.

### Top toolbar

- App logo / name on the left.
- Game info (event, white vs black, result) in the center.
- Import button (top-right) — opens the import dialog.
- View mode toggle (three buttons or segmented control).
- Settings menu (engine config, dark mode, accessibility options).
- Share button — copies the current URL state to clipboard.

### Right sidebar (in split mode)

Tabbed:
- **Board** tab — chessboard + position details.
- **Paths** tab — path sidebar (see Section 12).
- **Analysis** tab — top PVs for selected position + engine status.
- **History** tab — recent imports.

### Bottom strip

- Score chart (always visible, ~120px tall).
- Streaming indicator overlay when active (top-left of chart area, dismissable).

### Keyboard navigation

Global shortcuts:
- `←` / `→`: previous/next move on the currently-highlighted path (or played path if none).
- `↑` / `↓`: switch to sibling variation at the current position.
- `Home` / `End`: jump to start/end of current path.
- `f`: flip board.
- `g`: toggle graph-only mode.
- `b`: toggle board-only mode.
- `s`: toggle split mode.
- `Space`: play/pause auto-advance.
- `1`–`5`: toggle visibility of the five canonical paths.
- `i`: open import dialog.
- `Esc`: close dialog / cancel current operation / clear selection.
- `?`: open keyboard shortcuts help.
- `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`: undo/redo selection (small history stack of selected nodes).

When a dialog or text input is focused, all but `Esc` are disabled.

### Mouse interactions

- **Click node**: select.
- **Hover node**: show tooltip with FEN, eval, classification.
- **Right-click node**: context menu (select path through, add to custom path, copy FEN, copy PGN to this point).
- **Click dotted edge**: expand the compressed chain (animate the hidden nodes into view).
- **Click solid edge**: select the target node.
- **Scroll wheel on graph**: zoom (with cursor as focal point).
- **Drag empty graph area**: pan.
- **Click chart point**: select corresponding node.
- **Double-click anywhere on graph**: fit-view (zoom to fit all nodes).

---

## 16. Visual design system

### Color tokens (CSS custom properties)

```
--graph-bg: #8FBC8F        /* darkseagreen, paper's signature */
--graph-bg-dark: #2D4A3D    /* dark-mode variant, muted */
--node-circle-fill: #F5F5F5
--node-square-fill: #FFFFFF
--node-square-fill-pred: rgba(255,255,255,0.7)
--node-boundary-white: #FFFFFF
--node-boundary-black: #1A1A1A
--node-tie-fill: #999999
--node-checkmate: #DC2626   /* red-600 for crown icon */
--edge-played: #1A1A1A
--edge-predicted: #4B5563   /* gray-600 */
--edge-compressed: #6B7280  /* gray-500, dotted */
--path-played: #FFD700
--path-best: #22C55E
--path-worst: #EF4444
--path-critical: #A855F7   /* displayed as "Tal" in user-facing UI */
--path-quietest: #64748B
--chart-white-advantage: #3B82F6
--chart-white-band: rgba(59,130,246,0.25)
--chart-black-advantage: #1F2937
--chart-black-band: rgba(31,41,55,0.25)
--bg-surface: #FFFFFF
--bg-surface-dark: #1A1A1A
--text-primary: #111827
--text-primary-dark: #F3F4F6
--text-secondary: #6B7280
--accent: #2563EB
--success: #10B981
--warning: #F59E0B
--error: #DC2626
```

### Typography

- **UI**: system stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. Sizes: 12px (small labels), 14px (body), 16px (default), 18px (headers), 24px (page titles).
- **Move notation (SAN)**: `"JetBrains Mono", "Fira Code", ui-monospace, Consolas, monospace` at 13px. Critical for alignment.
- **Numerical evals**: tabular-nums variant of the monospace font.

### Spacing scale

Use 4px base unit: 4, 8, 12, 16, 24, 32, 48, 64. Tailwind's defaults already match this.

### Border radius

- Small (buttons, inputs): 6px
- Medium (cards, panels): 8px
- Large (modals, board): 12px

### Shadows

- Subtle (panels): `0 1px 3px rgba(0,0,0,0.1)`
- Card (modal): `0 10px 25px rgba(0,0,0,0.15)`
- Glow (selected node): `0 0 12px rgba(255,215,0,0.6)` (gold for played path; color varies)

### Animation timings

- **Hover transitions**: 150 ms ease-out.
- **Click feedback**: 100 ms (button press scale).
- **Modal entrance/exit**: 200 ms ease-in-out.
- **Board piece movement**: 200 ms ease (chessground default).
- **Graph node entrance**: spring (stiffness 300, damping 25).
- **Graph node exit**: 150 ms fade.
- **Edge drawing**: 400 ms ease-out (stroke-dashoffset).
- **Layout shifts (dagre re-layout)**: 300 ms ease-in-out (Motion FLIP).
- **Pulse on analyzing node**: 1500 ms loop, ease-in-out.
- **Multi-ply board chunk delay**: 120 ms between chunks.

### Iconography

Use a consistent icon set — recommend Lucide React (`lucide-react` npm) for UI controls (chevrons, play/pause, gears, X). Crown icon for checkmate uses Unicode `♔` styled with the danger color, larger than the node it sits on.

### Dark mode

Toggle in settings. Swaps:
- `--graph-bg` → `--graph-bg-dark`
- `--bg-surface` → `--bg-surface-dark`
- Text colors invert.
- Board theme switches to a dark-square-equivalent chessground theme.

Persist preference. Default to system preference via `prefers-color-scheme`.

### Responsive breakpoints

- **<640px (mobile)**: forced to board-only mode, graph hidden behind a "Show graph" button that opens it full-screen. Import dialog full-screen. Path sidebar accessible via bottom sheet.
- **640–1024px (tablet)**: split mode works with graph and board stacked vertically. Sidebar collapses to icons.
- **>1024px (desktop)**: full split layout as designed.

The application is desktop-first. Mobile is a graceful degradation, not a primary target.

---

## 17. Component inventory

Components the builder will create, organized by feature area:

### Layout components
- `AppShell` — root layout with header, main content area, footer.
- `Header` — logo, game info, mode toggle, settings.
- `SplitLayout` — resizable graph + sidebar.
- `EmptyState` — shown when no game loaded; CTA to import.

### Graph components
- `EvolutionGraph` — React Flow wrapper that subscribes to gameTreeStore.
- `EvoNode` — custom React Flow node renderer (circle vs square, fills, crown, move number, classification dot, selection ring, pulse).
- `EvoEdge` — custom React Flow edge renderer (solid vs dotted, thickness, path color overlays, hover for eval delta).
- `GraphControls` — zoom in/out, fit-view, toggle minimap.
- `GraphLegend` — collapsible legend showing node/edge encodings.
- `StreamingIndicator` — engine status overlay.

### Board components
- `ChessboardPanel` — wrapping panel with controls and details.
- `ChessgroundView` — chessground React wrapper.
- `BoardControls` — flip, prev/next, play/pause.
- `PositionDetails` — FEN, move, eval, classification, top PVs.

### Chart components
- `ScoreChart` — Recharts area chart with played line, potential bands, critical markers.

### Path components
- `PathSidebar` — list of all paths with toggles.
- `PathRow` — single path with checkbox, color swatch, stats.
- `CustomPathDialog` — modal for creating/editing user paths.

### Import components
- `ImportDialog` — modal with single textarea, detected-type chip, recent imports.
- `ImportPreview` — chip showing detected input type and preview.
- `RecentImports` — list of last 20 imports from localStorage.
- `UsernameGamePicker` — when input is a username, show a list of recent games for user to pick.
- `ImportProgress` — progress bar with cancel button.

### Analysis components
- `AnalysisPanel` — top PVs for current node.
- `PvLine` — single PV row with score, move sequence, depth.
- `EngineSettings` — depth, MultiPV, threads sliders (advanced).

### UI primitives (shadcn-style)
- `Button`, `Dialog`, `Tooltip`, `Checkbox`, `Slider`, `Tabs`, `Toast`, `Select`, `Input`, `Textarea`.

### Error handling
- `ErrorBoundary` — wraps each major UI region.
- `ErrorDisplay` — formatted error with retry action.

---

## 18. File and folder structure

Top-level:

```
chess-evolution-viz/
├── public/                    # Static assets
│   ├── stockfish/             # WASM engine files (committed, ~14MB)
│   ├── pieces/cburnett/       # Chessground SVG pieces
│   ├── _headers               # Cloudflare Pages headers
│   └── favicon.svg
├── src/
│   ├── components/            # See Section 17, organized by feature folder
│   ├── workers/               # stockfish.worker.ts, analysis.worker.ts
│   ├── stores/                # Four Zustand stores + barrel
│   ├── lib/                   # Business logic (chess, engine, graph, import, cache, url, animation)
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # TypeScript types
│   ├── utils/                 # Generic helpers
│   ├── data/                  # Example game PGNs
│   ├── styles/                # Tailwind + custom CSS
│   ├── App.tsx
│   └── main.tsx
├── tests/                     # Vitest + Playwright tests
├── workers-cors-proxy/        # Separate Cloudflare Worker project
├── docs/                      # Architecture, API, Deployment, Contributing
├── scripts/                   # Build helpers (copy-stockfish.mjs)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── playwright.config.ts
├── vitest.config.ts
├── vercel.json (or wrangler.toml for Cloudflare Pages)
├── README.md
└── LICENSE
```

The builder should keep components small (one component per file, <300 lines each). When a component grows, split it into a folder with sub-files. Tests live next to source in `tests/` mirroring the `src/` structure.

---

## 19. Example games to ship

Bundle these games as built-in demos. Each should be a constant in `src/data/exampleGames.ts` with the full PGN, a teaching-point summary, and metadata. The builder must source the actual PGN text from canonical sources (linked below) and verify each loads correctly.

| Game | Year | Significance | Source |
|---|---|---|---|
| Plaskett vs Shipov | World Open U2200 | Used in the paper's Figure 5. Demonstrates how mistakes pile up. | chessgames.com or paper supplement |
| Capablanca vs Alekhine | 1927, Buenos Aires WCh game | Paper's Figure 6. Ends in a perpetual-check draw after a missed win. | chessgames.com (search Capablanca-Alekhine 1927) |
| Deep Blue vs Kasparov, Game 2 | 1997 | Paper's Figure 7. The famous game where Deep Blue's 37th move was so counterintuitive Kasparov accused IBM of cheating. | chessgames.com |
| AlphaZero vs Stockfish 8, Game 1 | 2017 | DeepMind release. Shows AlphaZero's positional sacrifices. | DeepMind's published 10-game release |
| Anderssen vs Kieseritzky, "Immortal Game" | 1851 | Most famous game in chess history. Multiple sacrifices culminating in mate. | Universally available |
| Morphy vs Duke of Brunswick, "Opera Game" | 1858 | Teaching classic; quick development punishment. | Universally available |
| Kasparov vs Topalov, "Kasparov's Immortal" | 1999, Wijk aan Zee | Deep king-hunt sacrifice line. | chessgames.com |

For each, write a 2–3 sentence description suitable for the import dialog's "Demo games" tab:

- *Plaskett–Shipov*: "Both moderate-strength players. Black had a winning position early but accumulated mistakes at moves 9, 10, 12, 24, and 26 until checkmate became unavoidable. Featured in the IEEE paper this tool's design is based on."
- *Capablanca–Alekhine*: "Two of the greatest players in history. White had a winning position throughout but blundered at move 38, allowing Black to force a draw by perpetual check. A masterclass in turning defense into victory."
- *Deep Blue vs Kasparov*: "The match that changed chess history. Deep Blue's 37th move was so unusual that Kasparov became suspicious. He blundered shortly after and resigned in a position later shown to be drawable."
- *AlphaZero vs Stockfish*: "Neural network vs traditional engine. AlphaZero sacrifices material for long-term positional pressure — a style human players found revelatory."
- *Immortal Game*: "Anderssen sacrifices his queen, two rooks, and a bishop to deliver checkmate with his three remaining minor pieces. The most famous sacrifice combination in chess."
- *Opera Game*: "Morphy plays a casual game at the Paris Opera and converts rapid development into a 17-move checkmate. The textbook example of king-in-the-center punishment."
- *Kasparov's Immortal*: "Kasparov sacrifices a rook to force Black's king on a journey across the entire board, mating it deep in white's territory."

If sourcing PGNs is blocked at build time, the builder should commit placeholder PGNs from public-domain games (the pre-1923 ones — Immortal Game, Opera Game — are safely public domain).

---

## 20. Performance budgets

These are hard targets. The builder should set up bundle-size budgets and Lighthouse CI to enforce them.

| Metric | Target | Hard fail |
|---|---|---|
| Initial JS bundle (gzipped, excluding Stockfish) | <300 KB | >500 KB |
| Stockfish WASM (lazy-loaded) | ~7 MB | >15 MB |
| Time to first paint (4G, mid-tier device) | <1s | >2s |
| Time to interactive (4G, mid-tier device) | <3s | >5s |
| Lighthouse Performance score | >90 | <80 |
| Lighthouse Accessibility score | >95 | <90 |
| Graph render frame rate (200 nodes, idle) | 60 fps | <50 fps |
| Graph render frame rate (200 nodes, streaming) | >45 fps | <30 fps |
| Streaming tree mutation rate | 10–15 Hz | <5 Hz or >30 Hz |
| Stockfish init time (cold) | <500 ms | >1500 ms |
| IndexedDB cache hit lookup | <50 ms p95 | >200 ms p95 |
| Memory after 30 min of analysis | <500 MB | >1 GB |
| Board piece animation | 60 fps | <50 fps |

### Optimization checklist

- Memoize React Flow `nodeTypes` and `edgeTypes` outside components.
- All Zustand selectors return atomic values; never `[a, b]` array literals.
- `React.memo` on EvoNode with custom comparator checking `node.id`, `evaluation.cp`, `isAnalyzing`, `classification`.
- `requestIdleCallback` for cache writes (non-critical).
- IndexedDB writes batched (write every 5 analyses, not on each).
- Stockfish info-line dedup in the Worker reduces traffic by ~90%.
- Tree mutations batched via RAF.
- `onlyRenderVisibleElements` on React Flow when node count exceeds 200.
- Avoid stroke-dasharray animations on more than 50 edges simultaneously; use SVG `<animateMotion>` for path-traveling particles instead.
- Lazy-load chessground only when entering split or board mode (it's ~80 KB).
- Lazy-load Recharts (~120 KB) only when score chart is visible.

---

## 21. Accessibility requirements

WCAG 2.1 AA compliance is a hard requirement. The builder must:

### Keyboard navigation

- The entire app must be operable without a mouse.
- Tab order: header → main toolbar → graph → board → path sidebar → footer.
- Within the graph, arrow keys navigate between nodes following parent/child/sibling relationships.
- Within the path sidebar, arrow keys move between rows; space toggles visibility.
- Modal dialogs trap focus and return focus to the trigger on close.
- Skip-to-main-content link as the first focusable element.

### Screen reader support

- Each graph node renders an `aria-label` like "Move 12: Knight to f3 by White, evaluation +0.4 (excellent), 3 alternatives considered".
- The graph has `role="tree"` and nodes have `role="treeitem"` with `aria-expanded` for nodes with children.
- Streaming updates use `aria-live="polite"` regions to announce significant events ("Analysis complete for move 15, best move is e4").
- Score chart points have hidden text descriptions.
- Form labels are explicit.

### Color contrast

- Text against backgrounds meets 4.5:1 for normal text, 3:1 for large.
- Graph node fills against the darkseagreen background meet 3:1 for graphics. Verify: white #F5F5F5 against #8FBC8F is sufficient; gray #999 against #8FBC8F is borderline — may need a thin border to ensure visibility.
- Path colors are independently distinguishable (not relying on color alone — also use solid vs dashed patterns per path).
- A high-contrast mode (CSS `@media (prefers-contrast: more)`) swaps to a 7:1 palette.

### Motion

- `prefers-reduced-motion: reduce` disables: node entrance animations, edge drawing, board piece tweens (instant FEN swaps), pulse animations, layout transitions.
- Cancel button is always visible for in-flight operations.

### Focus indicators

- All interactive elements have visible focus rings (2px solid offset, contrasting color).
- Focus rings are not removed by CSS.

### Semantic HTML

- `<main>` for the primary content area.
- `<nav>` for navigation.
- `<dialog>` element (or properly-roled div) for modals.
- Headings in logical order, no skipping levels.

### Testing

- Run axe-core in CI on key pages.
- Manual testing with VoiceOver (macOS) and NVDA (Windows).
- Keyboard-only navigation testing as part of E2E suite.

---

## 22. Browser compatibility

Target browsers (latest two major versions of each):

- Chrome / Edge 110+
- Firefox 110+
- Safari 16.4+ (SharedArrayBuffer support landed here)
- Mobile Safari iOS 16.4+
- Chrome Android 110+

### Feature detection on app boot

The builder must check and gracefully degrade:

- **SharedArrayBuffer + crossOriginIsolated**: required for multi-threaded Stockfish. If missing, fall back to single-threaded build. Surface a banner: "For faster analysis, host with COOP/COEP headers" (link to docs).
- **Web Worker module support**: required. If missing, show an error page — the app cannot function.
- **IndexedDB**: required for caching. If missing (Safari private browsing in older versions), degrade to no-cache mode with a banner.
- **OffscreenCanvas**: not currently used but may help future graph rendering. Detect for future use.
- **CSS containment** (`content-visibility`, `contain`): used for graph performance. Polyfill is unnecessary; degraded performance is acceptable.
- **`structuredClone`**: used for state cloning. Modern browsers all support it; in the small chance of an old engine, polyfill via `JSON.parse(JSON.stringify(...))` for non-circular structures.

### Polyfills

Avoid polyfills where possible — target modern browsers. If needed:
- None expected for target browsers.

### Mobile-specific

- Touch gestures for graph pan/zoom (React Flow handles this).
- Tap-and-hold on a node for context menu equivalent.
- Bottom sheet for path sidebar on mobile (not a right drawer).
- Larger touch targets (44×44 px minimum per Apple HIG).

### PWA installability

The app ships as an installable Progressive Web App.

- **Install support by browser:** Chrome / Edge 110+ (full, with native prompt), Safari 16.4+ macOS/iOS (full, via Share → Add to Home Screen / Add to Dock; no `beforeinstallprompt`), Chrome Android 110+ (full), Firefox 110+ (limited — no install UI; users must use the address-bar menu).
- **Installed PWA** opens in a standalone window without browser chrome, gets a dock/home-screen icon, and shows up in OS app launchers (Spotlight, Cmd+Tab on macOS, etc.).
- **Install affordance:** listen for `beforeinstallprompt` on Chromium browsers; stash the event and surface a subtle "Install app" button in the header. On Safari, where the event doesn't fire, show a one-time first-visit hint pointing at the Share menu.
- **Don't badger.** If the user dismisses the install prompt or hint, persist that choice and don't re-prompt for at least 30 days.
- **Why this over Electron:** the app's "native-feeling" needs (offline operation, dock icon, local file pickers) are fully met by PWA + Service Worker + File System Access API. Electron would add ~150 MB of Chromium binary per platform with zero user-facing benefit. The only feature Electron would unlock — Mac App Store distribution — is out of scope for v1 (audience lives on GitHub, chess Reddit, and X, not the App Store).

---

## 23. Edge cases that must be handled

The builder must explicitly handle these. Each is a one-line item in the spec; the builder writes the code.

### Chess-related

- Games starting from a non-standard FEN (problem positions, Chess960, training puzzles). Use chess.js's FEN constructor and chessops for X-FEN normalization.
- Promotion moves notated multiple ways: `e8=Q`, `e8Q`, `e8q`, `e7e8q`. chess.js permissive mode handles all.
- Castling notation: `O-O`, `O-O-O`, `0-0`, `0-0-0` (zero variant). Normalize.
- En passant captures: ensure the FEN's en-passant square is correctly set and that chess.js's move generation flags `e` (en passant) when the move is taken.
- Threefold repetition detection: chess.js's history-based check.
- 50-move rule.
- Insufficient material (K vs K, K+N vs K, K+B vs K, K+B vs K+B same color).
- Stalemate vs checkmate (different events).
- Resignation: PGN has `1-0` or `0-1` but no checkmate. Treat as a normal game ending; the result determines display.
- Draw by agreement: `1/2-1/2` with no draw event on the board.
- Timeout: PGN may indicate `Timeout` in the Termination tag.
- Games with no moves: empty PGN. Display the starting position only.
- Games with only one move.
- Very long games (300+ moves): performance — tree-collapse positions outside the current view.
- Games where Stockfish suggests a move that's actually illegal in the position (rare but happens with corrupted hash). Validate every PV move via chess.js before adding to the tree.

### Engine-related

- Stockfish crash or hang during analysis: detect via timeout (no info line in 30s), terminate and restart the Worker.
- SharedArrayBuffer unavailable: fall back to single-threaded.
- Out-of-memory in Worker (very long games + multiPv 9 + deep depth): cap hash size at 256 MB, reset hash between games (`ucinewgame`).
- User clicks "analyze" repeatedly: dedupe requests; only one analysis per node at a time.
- Analysis exceeding 2 minutes: pause and show "Long analysis — continue?" prompt.

### Import-related

- Lichess game ID with the 4-char color suffix: strip before API call.
- Lichess study URL without chapter ID: import the entire study (multi-game). Show game picker.
- Lichess broadcast game: multiple games per broadcast; show picker.
- Chess.com username that doesn't exist: 404 → "User not found".
- Chess.com username with no games in the current month: empty archive → suggest checking earlier months.
- Chess.com daily game that's still in progress (no PGN): skip with "Game still in progress" error.
- Lichess game that's private (requires auth): 404 from public endpoint → "Private game, please use OAuth token".
- Malformed PGN with missing tags: parse what's there; default missing tags to "Unknown".
- PGN with multiple games separated by blank lines: show picker.
- PGN with comments containing special characters: parser handles UTF-8.
- PGN with non-Latin player names (Cyrillic, Chinese, etc.): preserve UTF-8.
- Move sequence with mixed notation (`1.e4 Nf3 2.Bb5`): permissive parse should handle.
- User types a move that's illegal: stop parsing at that point, show error.

### Network-related

- Rate limit hit: parse `Retry-After` header, schedule retry, show countdown.
- CORS error in production: should be impossible with proxy; if it happens, show "Service temporarily unavailable" with a "Report bug" link.
- Slow network: timeout at 30s per request, give clear error.
- Tab goes to background: pause Stockfish to save battery (use Page Visibility API). Resume when tab is foregrounded.
- User switches tabs while import is in progress: complete the import in background but don't update UI until tab is visible again.
- Multiple tabs running the app: each tab has its own Stockfish Worker. Warn user that running multiple tabs will be slow.

### Cache-related

- IndexedDB quota exceeded: surface an error with "Clear cache" action.
- Corrupted cache entry: catch parse errors, delete the bad entry, retry without cache.
- Schema migration when v2 of the cache schema lands: include a version number in the DB; migrate on open.
- User clears browser data: app should still work, just slower (no cache hits).

### URL state

- Shared URL with malformed parameters: ignore invalid params, fall back to defaults.
- Shared URL with a game ID that's no longer accessible: show error with "Try import dialog" CTA.
- Browser back/forward: properly restore selected node and view state.

---

## 24. Anti-patterns to avoid

These are mistakes a builder might make if not explicitly told otherwise. Forbidden:

- **Server Components / Next.js / SSR.** This is a pure SPA. The interactivity model requires client-side state from the first render.
- **Bundling Stockfish into the main JS graph.** It must be loaded via `importScripts` in the Worker from `/public/stockfish/`. Bundling it via Vite causes cascading WASM/CJS interop nightmares.
- **Storing PGN strings in Zustand.** They're large (often 5–50 KB), trigger expensive Immer equality checks, and re-render subscribers. Store PGNs in IndexedDB only; keep tree-node data in state.
- **Calling `setNodes`/`setEdges` on every Stockfish info line.** Batch via RAF.
- **Storing OAuth tokens in localStorage.** Memory only (gone on reload — user re-pastes). If persistent auth is needed later, use httpOnly cookies via a backend (out of scope for v1).
- **Deep-merging in Zustand without Immer.** Manual immutable updates of nested tree structures are bug factories.
- **Calling `chess.js` `move()` inside render hot paths.** Validation should happen once at parse time, not on every render.
- **Rendering the board on every node hover.** Hover updates the hoveredNodeId in viewStore but doesn't trigger board re-renders; only `selectedNodeId` changes do.
- **Animating stroke-dasharray on >50 edges.** Use SVG `<animateMotion>` particles or static dashed style.
- **Synchronous I/O in the streaming hot path.** All cache reads/writes are async; don't block the Worker.
- **One-Zustand-store-for-everything.** Splitting into four narrow stores is non-negotiable.
- **Re-rendering all graph nodes when one node's eval changes.** Atomic selectors and memoized node components prevent this.
- **Inline arrow functions in React Flow `nodeTypes` prop.** Causes full graph remount per render.
- **Premature optimization with `useMemo` everywhere.** Memoize when profiling shows a hot path; not by default. `React.memo` on EvoNode is justified; on layout components, usually not.
- **Importing the entire `lodash` package.** Use `lodash-es` and per-function imports, or just use native ES.
- **Custom rolled URL parsing instead of `URL` constructor + URLSearchParams.**

---

## 25. Deployment and infrastructure

### Hosting choice

Recommended: **Cloudflare Pages** for the SPA, **Cloudflare Workers** for the CORS proxy.

- Cloudflare Pages supports COOP/COEP via `_headers` file.
- Cloudflare Workers are perfect for the CORS proxy (free tier covers expected traffic).
- Both deploy from the same GitHub repo via Cloudflare's Git integration.

Alternative: **Vercel** for the SPA (supports COOP/COEP via `vercel.json`), Vercel Edge Functions for the proxy. Slightly easier deployment UX but Cloudflare's free tier is generous.

### Required HTTP headers

For SharedArrayBuffer / multi-threaded Stockfish:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin (on /pieces, /stockfish)
```

Plus security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Cache control:

```
/stockfish/*: public, max-age=31536000, immutable
/pieces/*: public, max-age=31536000, immutable
/assets/*: public, max-age=31536000, immutable  (Vite's hashed bundles)
```

### PWA manifest and Service Worker

The app must ship as an installable Progressive Web App.

**Manifest** (`public/manifest.webmanifest`):
- `name`: "Enpassant — Chess Evolution Visualizer"
- `short_name`: "Enpassant"
- `description`: matches README first paragraph
- `display`: `"standalone"`
- `start_url`: `"/"`
- `scope`: `"/"`
- `background_color`: `"#8FBC8F"` (paper's darkseagreen, matches initial graph canvas)
- `theme_color`: `"#8FBC8F"` (browser chrome tint while loading)
- `icons`: 192×192 and 512×512 PNG, plus a maskable variant of each
- `categories`: `["games", "education", "utilities"]`
- `orientation`: `"any"`

**Service Worker** (recommended approach: `vite-plugin-pwa` with Workbox, generated at build time so cache versioning matches Vite's hashed assets):
- Scope: site root.
- **Cache-first, immutable** for `/stockfish/*` and `/pieces/*` (large, content-addressed, never change).
- **Stale-while-revalidate** for `/assets/*` (Vite's hashed bundles — safe because the hash invalidates).
- **Network-first with cache fallback** for `index.html` (so a deploy is picked up on next visit, but offline still works).
- **Network-only** for `/proxy/*` and any chess API call (never cache cross-origin chess data; correctness > speed).
- **Skip waiting** on activate; surface a non-blocking "New version available — reload" toast.
- Pre-cache the app shell + the lite Stockfish WASM at install time so first analysis works offline.

**Install prompt UX:**
- On Chromium browsers: listen for `beforeinstallprompt`, `preventDefault()`, stash the event. Show a subtle "Install app" affordance in the header. On click, call `prompt()` and record `userChoice`.
- On Safari (no `beforeinstallprompt`): show a one-time first-visit hint pointing at the Share menu ("Add to Home Screen" on iOS, "Add to Dock" on macOS 14+).
- Persist dismissals to localStorage; don't re-prompt for at least 30 days.

### Environment variables

`.env.example`:

```
VITE_CORS_PROXY_URL=https://chess-evolution-proxy.yourdomain.workers.dev
VITE_LICHESS_BASE=https://lichess.org
VITE_CHESSCOM_PUB_BASE=https://api.chess.com/pub
VITE_LICHESS_OAUTH_CLIENT_ID=  # optional, only if implementing OAuth
VITE_SENTRY_DSN=               # optional, for error reporting
VITE_FEATURE_FLAG_CHESSCOM_CALLBACK=true  # gate the unofficial endpoint
```

### CI/CD

GitHub Actions workflow:

1. **On every push to non-main branches:**
   - Install pnpm.
   - Restore pnpm cache.
   - Run `pnpm install --frozen-lockfile`.
   - Run `pnpm type-check`.
   - Run `pnpm lint`.
   - Run `pnpm test` (Vitest).
   - Run `pnpm build`.
   - Upload bundle stats (visualizer plugin output).

2. **On every push to main:**
   - All of the above.
   - Run `pnpm test:e2e` (Playwright).
   - Deploy to Cloudflare Pages preview environment via Wrangler action.
   - Run Lighthouse CI against the preview URL; fail if score drops below thresholds.
   - On success, promote preview to production.

3. **Bundle size check:**
   - Fail PR if any chunk exceeds 200 KB gzipped (excluding Stockfish, which is static).
   - Use `size-limit` or `bundlewatch` for enforcement.

### Monitoring

- Sentry for error reporting (opt-in via env var).
- Lighthouse CI in the pipeline.
- Cloudflare Analytics for basic traffic visibility.
- No user-tracking analytics by default.

---

## 26. Testing strategy

### Unit tests (Vitest)

Cover at minimum:
- FEN normalization and X-FEN conversion edge cases.
- PGN parsing across the 7 example games + 5 hand-crafted edge-case PGNs.
- Input detection across all 8 input types + invalid inputs.
- Move parsing for SAN, LAN, UCI, and malformed variants.
- UCI info-line parser for 20+ real Stockfish output lines.
- Edge thickness calculation across the range of eval deltas.
- Path computation: played, best, worst, critical, quietest for known games.
- Transposition merging: build a tree from a game with known transpositions, verify single nodes.
- Branch shortening: verify two-neighbor chains collapse correctly.

### Integration tests (Vitest)

- Full PGN → tree pipeline with a real Stockfish Worker (mocked engine output).
- Lichess client against a mock fetch (using MSW or similar).
- Chess.com client against a mock fetch.
- Cache write/read round-trip.

### Component tests (Vitest + Testing Library)

- EvoNode rendering in all states (played, predicted, checkmate, selected, analyzing).
- ImportDialog flows: paste PGN, paste URL, type moves, paste username, error states.
- PathSidebar: toggle, hover, custom path creation.
- BoardControls: prev/next, flip, play/pause.

### E2E tests (Playwright)

- **Import flow**: open dialog, paste Lichess URL, verify game loads, verify tree skeleton renders before analysis starts.
- **Analysis flow**: load a known short game, wait for analysis to complete, verify tree has expected number of nodes and the played path matches.
- **Path flow**: load a game, toggle "best path" on, verify the path renders in green, verify the score chart updates.
- **Share link flow**: load a game, select a specific node, copy URL, open in a new tab, verify state is restored.
- **Keyboard navigation**: full game exploration using only keyboard.
- **Accessibility audit**: axe-core integration in Playwright.

### Performance tests

- Render a 200-node graph and measure frame rate over 5 seconds of pan/zoom interaction.
- Stream 100 PV updates and verify no dropped frames.
- Cache lookup latency at 1000 entries.

### Test fixtures

`tests/fixtures/games/` contains canonical PGNs for the example games plus edge cases:
- Empty game (just headers).
- 1-move game.
- 200-move blitz draw.
- Game starting from custom FEN.
- Game with deep PGN variations.
- Game with Cyrillic player names.
- Game ending in stalemate.
- Game ending in threefold repetition.

`tests/fixtures/analysis/` contains pre-recorded Stockfish output for deterministic engine tests.

---

## 27. Phased rollout

Suggested build order over 6–8 weeks of focused work by a single engineer (or 3–4 weeks for a team of 2–3).

### Phase 1 — Foundation (Week 1–2)

Goals: scaffolding works, no features yet.

- Initialize Vite + React + TypeScript project per Section 18.
- Set up ESLint, Prettier, Vitest, Playwright config.
- Configure Tailwind with color tokens.
- Install all dependencies per Section 4.
- Build the file/folder skeleton (empty files).
- Implement the four Zustand stores with their types and minimal mutations.
- Wire React Flow with a static demo tree (3 nodes, 2 edges) to verify rendering.
- Wire chessground with a static FEN to verify board rendering.
- Set up the CORS proxy as a separate project with a dev rewrite.
- Configure COOP/COEP headers in Vite dev server.
- Verify Stockfish WASM loads in a Worker with `console.log` of `ready` event.

**Phase 1 done when:** The app shell renders, you can navigate between view modes (graph-only, split, board-only) showing static demo data, and `console.log` confirms Stockfish initialized successfully.

### Phase 2 — PGN ingestion + basic graph (Week 2–3)

Goals: paste a PGN, see the played-path skeleton in the graph.

- Implement the unified `detect()` function for all 8 input types.
- Build the ImportDialog with the single-textarea + auto-detect UX.
- Implement PGN parsing with @mliebelt/pgn-parser, extracting moves + metadata.
- Implement the graph generator's Phase 1 (skeleton building from played moves).
- Apply dagre layout in a stateless function.
- Render the graph via React Flow with the custom EvoNode and EvoEdge components.
- Implement node click → board sync in split mode.
- Implement the multi-ply animation in chessground.
- Apply the visual encoding from Section 16: darkseagreen background, circles for played, move numbers, etc.

**Phase 2 done when:** Pasting the PGN of the Immortal Game produces a graph with the trunk of played moves, clicking any node shows the position on the board, and the board animates smoothly when jumping between nodes.

### Phase 3 — Stockfish integration + streaming (Week 3–4)

Goals: Stockfish analyzes the game and nodes appear in the tree in real-time.

- Build the Stockfish Worker per Section 8 with UCI command/event protocol.
- Build the main-thread StockfishEngine class.
- Build the orchestrator with the iterative deepening + MultiPV growth strategy.
- Implement the analysisStore.
- Wire streaming PV updates: orchestrator → worker → info events → store → graph.
- Implement RAF-batched tree mutations.
- Apply the paper's top-N PV selection rule.
- Apply transposition merging with the FEN index.
- Implement the StreamingIndicator UI overlay.

**Phase 3 done when:** Pasting any of the example games triggers visible tree growth: alternative branches sprout from the played trunk in real-time, and you can watch new nodes appear as Stockfish's depth increases.

### Phase 4 — Tree simplification + score chart (Week 4–5)

Goals: clean visual output and the bottom score chart.

- Implement the two-neighbor branch shortening pass.
- Render compressed edges as dotted arrows.
- Implement click-to-expand on dotted edges.
- Compute and apply edge thickness from eval deltas.
- Detect events (check, mate, stalemate, draws) and apply visual encoding.
- Compute move classifications and render the classification dot.
- Build the ScoreChart component with Recharts.
- Sync hover/click between chart and graph.

**Phase 4 done when:** The graph looks substantively like the paper's Figure 5: trunk of numbered circles, branches with varying thickness, dotted shortened sections, red crown icons on checkmate positions, score chart aligned below.

### Phase 5 — Multi-source import (Week 5)

Goals: import from anywhere.

- Implement the Lichess client (game export, user games NDJSON, cloud-eval).
- Implement the Chess.com client (monthly archive, archives list).
- Implement the unofficial Chess.com callback path with TCN decoding.
- Build the CORS proxy in `workers-cors-proxy/`.
- Deploy the proxy to Cloudflare Workers.
- Wire the import dialog to all sources with proper error handling.
- Implement the UsernameGamePicker.
- Implement bulk import progress UI.
- Persist import history to localStorage.

**Phase 5 done when:** All 5 import sources work end-to-end. Pasting a Lichess URL imports the game; entering a username shows a game picker; pasting Chess.com archive URL works; PGN paste works; typed moves work.

### Phase 6 — Multi-path visualization (Week 6)

Goals: highlight any combination of paths.

- Compute the 5 canonical paths (played, best, worst, critical, quietest).
- Build the PathSidebar UI.
- Implement edge overlay rendering with path colors.
- Implement custom path creation (click N nodes).
- Implement the "show only highlighted" toggle.
- Implement path-hover emphasis behavior.

**Phase 6 done when:** All canonical paths can be toggled visible/hidden independently, custom paths can be created by clicking nodes, the graph visually communicates which paths are active.

### Phase 7 — Caching + URL state + polish (Week 7)

Goals: persistence and shareability.

- Set up Dexie schema, build the cache layer.
- Implement cache writes after each analysis completes.
- Implement cache reads before queuing for Stockfish.
- Integrate Lichess Cloud Eval as an L2 cache for opening positions.
- Implement URL state encoding/decoding.
- Wire browser back/forward to URL state.
- Build the Share button with copy-to-clipboard.
- Generate Open Graph preview images for shared URLs (optional in v1).

**Phase 7 done when:** Reopening a previously-analyzed game is instant (cache hit), URLs encode the full view state, sharing a URL and opening in a new tab restores everything.

### Phase 8 — Accessibility + polish + ship (Week 8)

Goals: production-ready.

- Audit accessibility per Section 21. Fix issues.
- Add keyboard navigation per Section 15.
- Add reduced-motion support.
- Add dark mode.
- Implement error boundaries on every major UI region.
- Write the example game data file (Section 19) with 7 demo games.
- Build the EmptyState with demo game CTAs.
- Write the README, ARCHITECTURE, DEPLOYMENT, and CONTRIBUTING docs.
- Set up CI/CD per Section 25.
- Run Lighthouse CI, hit performance targets.
- Smoke test on Chrome, Firefox, Safari, mobile.

**Phase 8 done when:** All acceptance criteria in Section 28 are met. The product is ready for public release.

---

## 28. Acceptance criteria

The build is complete when every item below passes. The builder agent should run through this list as a final gate.

### Functional

- ☐ All 7 example games (Section 19) load and analyze correctly.
- ☐ Lichess game URL import works for at least 5 URL forms (8-char ID, 12-char with color, with ply anchor, study chapter, broadcast game).
- ☐ Chess.com monthly archive import lists games and allows selection.
- ☐ Chess.com callback single-game import works (with caveat displayed).
- ☐ Raw PGN paste works for single-game and multi-game PGNs.
- ☐ Move-by-move typed input parses SAN, LAN, UCI, mixed.
- ☐ Username import disambiguates Lichess vs Chess.com and fetches recent games.
- ☐ Stockfish streams analysis with visible tree growth.
- ☐ All 5 canonical paths can be toggled independently.
- ☐ Custom paths can be created by clicking nodes.
- ☐ Board animates correctly when jumping between any two nodes in the tree.
- ☐ Best-move arrows render on the board.
- ☐ Score chart aligns with graph x-axis and updates as analysis progresses.
- ☐ Clicking dotted (compressed) edges expands them.
- ☐ Selected node highlighting works in both directions (click in graph → board updates; click in chart → graph updates).
- ☐ Cache survives page reload (re-opening a previously-analyzed game is instant).
- ☐ Shareable URLs round-trip correctly.

### Performance

- ☐ Lighthouse Performance score >90 on desktop.
- ☐ Lighthouse Accessibility score >95.
- ☐ Initial JS bundle <300 KB gzipped (excluding Stockfish).
- ☐ Time to interactive <3s on 4G simulated.
- ☐ 60 fps maintained while panning a 200-node graph.
- ☐ ≥45 fps during active streaming with 200 nodes.
- ☐ Cache lookup p95 <50 ms.

### Accessibility

- ☐ Full keyboard navigation works (no mouse required).
- ☐ Screen reader announces meaningful labels on every interactive element.
- ☐ `prefers-reduced-motion` disables all animations.
- ☐ axe-core audit passes with zero violations.
- ☐ All text meets WCAG 2.1 AA contrast.

### Edge cases

- ☐ Game starting from custom FEN renders correctly.
- ☐ Game with 200+ moves renders without crashing.
- ☐ Game with deep PGN variations renders correctly.
- ☐ Stockfish hang triggers timeout and recovery (test by sending malformed FEN).
- ☐ Rate-limited import shows retry countdown.
- ☐ Private/unavailable game shows clear error.
- ☐ Tab visibility change pauses Stockfish (verify via DevTools).
- ☐ COOP/COEP missing falls back to single-threaded Stockfish.

### Browser

- ☐ Works on Chrome 110+, Firefox 110+, Safari 16.4+, Edge 110+.
- ☐ Works on mobile Safari iOS 16.4+ and Chrome Android (graceful mobile UX).
- ☐ No console errors on any supported browser.

### Visual fidelity

- ☐ Side-by-side comparison with paper Figure 5: the trunk of numbered circles is recognizably the same shape.
- ☐ Darkseagreen background is correct.
- ☐ Red crown icons appear on checkmate positions.
- ☐ Solid vs dotted edges render correctly.
- ☐ Score chart layout matches the paper's general shape.

### Documentation

- ☐ README with quick start, demo link, and screenshots.
- ☐ ARCHITECTURE doc explains the four-layer model and store split.
- ☐ DEPLOYMENT doc explains Cloudflare Pages + Workers setup.
- ☐ CONTRIBUTING doc explains code style, test workflow, PR process.
- ☐ LICENSE file is GPL-3.0.

---

## 29. Open questions deferred to the builder

These decisions the builder makes during implementation. The spec doesn't dictate the answer because (a) it depends on profiling results, (b) it's a stylistic choice within bounds, or (c) it's a future-extensibility concern.

- **Orchestrator: Web Worker or main thread?** The streaming orchestrator can run on the main thread (simpler) or in its own Worker (cleaner separation, but adds message-passing overhead). Builder profiles both and picks. Recommendation: start on main thread; move to Worker if profiling shows main-thread blocking.
- **Path comparison side-by-side mode:** stretch goal. If time permits, design data shape now (`viewStore` could support a `comparisonPath: PathId | null` field). Implement UI later.
- **Engine settings UI:** v1 should expose at least depth and MultiPV sliders. More advanced (threads, hash, NNUE toggle) can be hidden in an "Advanced" section.
- **PGN export of analyzed games:** including annotations and variations as a downloadable PGN — useful but not in the acceptance criteria. Builder can add if straightforward.
- **Light theme vs dark theme by default:** the paper's darkseagreen is closer to light theme. Default light; offer dark in settings.
- **Specific Stockfish version:** 17 is current as of mid-2025; if 18+ is available at build time, use it. Verify the WASM build is published.
- **Color blindness palette:** offer at least one alternative palette (deuteranopia-safe). Builder picks specifics from established palettes (e.g., Okabe-Ito).
- **Internationalization:** all UI strings should be in a single locale file from day one (even if English-only) so future translation is easy. Builder decides whether to use react-intl, i18next, or just a plain object.

---

## 30. Reference materials

The builder should keep these references at hand throughout development:

- **The original paper**: Lu, Wang, Lin (2014). "Chess Evolution Visualization." IEEE Transactions on Visualization and Computer Graphics, Vol. 20, No. 5, pp. 702–713. DOI: 10.1109/TVCG.2014.2299803. The PDF is referenced throughout this spec — Figure 5 (Plaskett vs Shipov) is the primary visual reference; Figures 6–9 show other example games.
- **Stockfish UCI protocol**: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html
- **Stockfish.js (npm package + GitHub)**: https://github.com/nmrugg/stockfish.js
- **chess.js documentation**: https://github.com/jhlywa/chess.js
- **chessops** (X-FEN, Chess960): https://github.com/niklasf/chessops
- **chessground** (Lichess board): https://github.com/lichess-org/chessground
- **React Flow (xyflow)** documentation: https://reactflow.dev/
- **dagre** layout: https://github.com/dagrejs/dagre
- **@mliebelt/pgn-parser**: https://github.com/mliebelt/pgn-parser
- **Lichess API**: https://lichess.org/api
- **Chess.com Published-Data API**: https://www.chess.com/news/view/published-data-api
- **Zustand** docs: https://docs.pmnd.rs/zustand
- **Motion (Framer Motion successor)**: https://motion.dev/
- **Recharts**: https://recharts.org/
- **Dexie**: https://dexie.org/
- **TCN decoder for Chess.com**: search npm for `chess-tcn` (verify maintenance status at build time)

For visual reference:
- **Lichess analysis board** (https://lichess.org/analysis) — for analysis panel UX patterns.
- **Chess.com Game Review** — for move classification visualization.
- **The paper's Figure 5 image** — for the graph's visual encoding.

---

**End of specification.**

This document is the contract. If the builder agent encounters ambiguity, it should re-read the relevant section. If still ambiguous, default to the most conservative interpretation that doesn't violate any other section. If a section conflicts with another, the lower-numbered section takes precedence (e.g., the visual target in Section 2 overrides any styling decisions implied elsewhere).

The builder is expected to produce a working, deployable web application that meets every item in Section 28. Estimated effort: 6–8 weeks for one experienced full-stack engineer, 3–4 weeks for a team of 2–3.
