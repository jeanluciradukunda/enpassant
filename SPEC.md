# enpassant — Specification (V0 → V4)

> **Status**: build contract, supersedes `docs/SPEC-v0-research.md` (the
> research-stage spec preserved for lineage).
>
> **Purpose**: tells the builder agent what to build, in what order, and which
> gate each phase must pass before the next begins.
>
> **Promise**: *"Show the shape of a chess game: what was played, where the
> advantage changed, and which alternate continuations mattered."*

---

## Table of contents

0. TL;DR
1. Sharp promise & non-goals
2. North star: Figure 5
3. Phased contract overview
4. Stack decisions
5. Data model
6. Visual encoding
7. V0 — static Figure 5 reproduction
8. V1 — played trunk + engine on played positions
9. V2 — curated alternatives + score-chart-driven navigation
10. V3 — broader imports + cache + share links
11. V4 — PWA + custom paths + Chess.com + polish
12. Engine integration
13. Layout
14. Streaming UX
15. Import surfaces
16. CORS proxy as real infrastructure
17. State management
18. Accessibility
19. Performance budgets (per phase)
20. Browser compatibility + PWA scope
21. Testing strategy
22. Deployment & telemetry posture
23. Open questions deferred to builder
24. Acceptance criteria — phase rollup
25. References

---

## 0. TL;DR

- **Five phases.** Do not begin V(N+1) before V(N) passes its gate.
  - **V0** — static reproduction of Figure 5 from hand-coded fixture data. No
    engine, no imports, no network. Visual-diff CI gate.
  - **V1** — PGN paste → played trunk → Stockfish on played positions with
    explicit budgets. Score chart + board sync. No streaming, no alternatives,
    no network imports (those land in V3 with the real proxy).
  - **V2** — curated alternatives (top-K + eval-spread threshold), branch
    shortening, score-chart-driven navigation, phase-based streaming UX.
  - **V3** — Lichess study + user-archive imports, real CORS proxy as infra,
    IndexedDB cache, share links (game-URL imports only).
  - **V4** — PWA, custom paths, Chess.com archive, dark mode, a11y audit,
    demo game library.

- **Stack** (verified 2026-05-12): Vite + React 19 + TS 5.7 strict +
  @xyflow/react v12 + @dagrejs/dagre (with ply-rank constraints) +
  Stockfish 18 in Web Worker + chessground + chess.js + chessops +
  @mliebelt/pgn-parser + Zustand 5 + Motion + Recharts + Dexie + Tailwind 4.

- **License**: GPL-3.0 (Stockfish + chessground contamination). SPDX header
  on every source file.

- **Data model**: `Position` (FEN-keyed, shared) + `Occurrence` (tree node
  with single parent, holds path history) + `TranspositionLink` (visual
  decoration only). The original FEN-merge-into-DAG approach destroyed
  repetition/50-move state; this fixes it.

- **Engine budgets** (not "analyze everything"):
  - **Fast** — depth 14, MultiPV 3, played positions only.
  - **Quality** — depth 18, MultiPV 5, played positions only.
  - **Deep** — depth 20+, user-selected node only.
  Played-move scoring uses UCI `searchmoves` when the played move falls
  outside MultiPV.

---

## 1. Sharp promise & non-goals

The product shows the *shape* of a single chess game:

- what was **played** — the trunk,
- where the **advantage shifted** — the score chart,
- which **alternate continuations mattered** — curated branches.

Not goals:

- Universal chess analysis platform (Lichess and Chess.com already are that).
- Live in-progress game analysis.
- Game database search.
- Annotation editing / commenting / authoring.
- Engine-vs-engine comparison.
- LLM commentary.
- Native mobile apps.
- Multiplayer / collaborative analysis.
- "Show me every position Stockfish considered." Chess explodes
  combinatorially (~10⁴⁰ sensible games per Shannon-derived estimates); the
  product's value is the **visual editorial layer** that curates aggressively.

Feature test: when asking *"should this be in V_x?"* — does it help the user
understand the shape of *this game* faster? If not, defer.

---

## 2. North star: Figure 5

The visual target is **Plaskett vs Shipov, World Open U2200**, Figure 5 of
Lu, Wang & Lin (IEEE TVCG vol. 20 no. 5, May 2014; DOI
10.1109/TVCG.2014.2299803). The builder must keep the figure open while
implementing the graph view.

Encoding rules, calibrated against the actual image (not just paper prose):

**Background**

- Solid `#8FBC8F` (CSS `darkseagreen`). No gradient. No texture.

**Played-trunk circles**

- Default state: **white fill, black ~1 px border, black numerals** (move
  number, 1-indexed). Approximate diameter 16–20 px at default zoom.
- Selected/current: **inverse — black fill, white numerals**.
- Aligned at a constant y-coordinate (the trunk runs horizontally).

**Alternative-position squares**

- Default fill: white. Approximate side ~10 px.
- Gray fill `#999` for tied/equal positions (eval magnitude < 30 cp).
- Solid-black or solid-white fill only when one side has a clear advantage
  (eval magnitude > 200 cp).
- Border color = side-to-move (white border = White to move, black border =
  Black to move).

**Checkmate crown**

- Small red glyph (~6–8 px) overlaid on the terminal square. Color `#DC2626`
  or close. **Crowns are small and saturated** — they pop because the
  surrounding palette is desaturated, not because they're large.

**Edges**

- Solid black for canonical continuations.
- Dotted/dashed black for compressed chains (two-neighbor shortening result).
- Arrowheads on the target end.
- Thickness in print: ~1–3 px. **Specify the formula in logical units 1–30
  and let the renderer scale to device pixels** with a global scale factor;
  default scale produces ~1–3 px in the dense graph view.

**Layout**

- Strong left-to-right axis. Trunk circles at a constant y (lane 0).
- Branches fan **above and below** the trunk symmetrically — successive
  alternative groups alternate up/down so the trunk stays visually centered.
- Branch density grows with the game (opening sparse, middle/endgame dense).
  Plaskett-Shipov hits **~250–400 visible nodes** after branch shortening.

**Detail callout**

- The paper uses a magnified inset showing local subgraph structure of the
  current selection (in Figure 5, move 27's terminal fan). This is a UX
  pattern, not just a figure annotation — reproduce as a corner zoom panel
  triggered on selection. Land in V2.

**Score chart** (sits below the graph)

- X-axis **vertically aligned** to the trunk x-axis: move N in the chart
  sits below circle N in the trunk.
- Two translucent **area bands** symmetric around y=0:
  - White band above 0 — range of evals favoring White across curated
    continuations at move N.
  - Dark-gray band below 0 — range favoring Black.
- Thin solid line: the **actual played-game eval** at each move. Snakes
  through both bands as the lead changes hands.
- Y-axis: linear in `[-100 cp, +100 cp]`, log-compressed beyond, capped at
  `±2000 cp` visually with "M5" / "M-3" labels for mate scores.

---

## 3. Phased contract overview

| Phase | Goal (one sentence) | Gate (binary) |
|---|---|---|
| **V0** | Static reproduction of Figure 5 from hand-coded fixture data. | Playwright golden-diff against `tests/golden/figure5.png` under ≤15% pixel delta in the salient region. |
| **V1** | Paste a PGN → played trunk + populated score chart + synced board. (No network imports — those land in V3 with the proxy.) | Anderssen-Kieseritzky PGN renders fully in ≤90 s cold, <1 s warm. |
| **V2** | Add curated alternatives, branch shortening, score-chart navigation. | For the 7 demo games, recognizably paper-density alternative branches render at 60 fps idle. |
| **V3** | Broader imports + real CORS proxy + share links. | Import 5 Lichess URL forms; share link round-trips for game-URL imports. |
| **V4** | PWA + custom paths + Chess.com archive + a11y + demo library. | All §24 acceptance criteria pass. |

**Rule**: do not start V(N+1) until V(N) passes its gate. If a "small V2
feature" feels tempting before V1 is clean, defer it.

---

## 4. Stack decisions

Verified against canonical sources on 2026-05-12.

| Concern | Decision | Verification |
|---|---|---|
| Build tool | Vite (current stable line) | vite.dev/releases |
| Framework | React 19 | react.dev/blog/2024/12/05/react-19 |
| Language | TypeScript 5.7+ strict | — |
| Graph rendering | @xyflow/react v12 | reactflow.dev |
| Graph layout | @dagrejs/dagre with ply-rank constraints (§13); escape hatch to custom layout **only if V0 golden-diff fails** on constrained dagre | — |
| Chess engine | Stockfish 18 (released 2026-01-31) via Web Worker. Lite WASM build, multi-threaded with COOP/COEP, single-thread fallback. **Verify at build time** that the WASM build of v18 is published; if not, pin 17.1 with a dated `TODO: bump-to-18` comment. | stockfishchess.org (release 2026-01-31) |
| Chess logic | chess.js (latest) + chessops for X-FEN, Chess960, FEN normalization | — |
| PGN parsing | @mliebelt/pgn-parser | — |
| Board UI | chessground (GPL-3) | — |
| State | Zustand 5 + `subscribeWithSelector` + Immer | — |
| Animation | Motion (formerly Framer Motion) | motion.dev |
| Score chart | Recharts | recharts.org |
| IndexedDB | Dexie 4 | dexie.org |
| Categorical colors | d3-scale-chromatic `schemeTableau10` | — |
| CSS | Tailwind 4 OR plain CSS with custom-property tokens. Pick at V1 start. | tailwindcss.com/blog/tailwindcss-v4 |
| Testing | Vitest + Playwright + Testing Library + axe-core | — |
| Package manager | pnpm | — |
| Hosting | Cloudflare Pages (SPA) + Cloudflare Workers (CORS proxy) | — |

**License**: GPL-3.0. Already committed at repo root. SPDX header
(`// SPDX-License-Identifier: GPL-3.0-or-later`) on every source file.

---

## 5. Data model

The research-stage spec merged Occurrences by normalized FEN into a DAG.
That destroyed path history needed for threefold-repetition and 50-move-rule
detection, and admitted cycles. Use this three-type model instead:

### `Position`

Canonical chess position keyed by *normalized X-FEN*. Holds engine
evaluation, legal moves, FEN-derived facts. **One Position per unique board
state.** Shared across Occurrences.

```ts
type PositionId = string; // sha256(normalizedXFen).slice(0, 16)

interface Position {
  id: PositionId;
  normalizedFen: string;  // X-FEN, en-passant stripped if unreachable. Includes
                          //   piece placement, side-to-move, castling, ep square.
                          //   Does NOT include 50-move or fullmove counters —
                          //   those are per-Occurrence (game-history-dependent).
  sideToMove: 'w' | 'b';
  legalMovesUci: string[];
  inCheck: boolean;
  isTerminal: 'checkmate' | 'stalemate' | 'insufficient' | null;
  eval: Evaluation | null; // latest engine eval, if analyzed.
                           //   Cached safely because eval depends only on
                           //   Position, not on path history.
  cachedAt: number;
}

interface Evaluation {
  type: 'cp' | 'mate';
  value: number;          // cp or mate-in-N
  depth: number;
  multipv: { rank: number; moves: string[]; type: 'cp' | 'mate'; value: number }[];
  engineId: string;       // "stockfish-18-lite"
  computedAt: number;
}
```

### `Occurrence`

An *appearance* of a Position at a specific ply on a specific path.
**Occurrences form a tree — single parent, no cycles.** Threefold and
50-move detection walk back along the Occurrence chain.

```ts
type OccurrenceId = string; // sha256(parentId + uciMove).slice(0, 16); root = "root"

interface Occurrence {
  id: OccurrenceId;
  positionId: PositionId;
  parentId: OccurrenceId | null;   // null = root
  childIds: OccurrenceId[];
  ply: number;                     // 0 = root; fullmove = floor(ply/2) + 1
  moveSan: string | null;          // null = root
  moveUci: string | null;
  repetitionCount: number;         // 1-indexed count of this Position's
                                   //   appearances *at or before* this
                                   //   Occurrence on the path from root.
                                   //   First appearance: 1.
                                   //   Threefold-claim eligible: ≥ 3.
                                   //   Fivefold automatic draw: 5 (FIDE 9.6.2).
  fiftyMoveClock: number;          // halfmove clock per FIDE 9.3. Resets on
                                   //   pawn move or capture.
  isPlayed: boolean;               // on the actual game's trunk
  classification: MoveClassification | null;
  analysisState: 'idle' | 'queued' | 'analyzing' | 'done';
}
```

**FEN sent to the engine is derived per-Occurrence, not stored on Position.**
Given an Occurrence O and its Position P, the FEN for UCI `position fen <…>`
is built from:

- `P.normalizedFen` (piece placement, side-to-move, castling, ep)
- `O.fiftyMoveClock` (halfmove clock)
- `floor(O.ply / 2) + 1` (fullmove number)

A helper `fenForEngine(occurrence, position): string` lives in `lib/fen.ts`.
The engine cache key remains position-only (`${normalizedFen}|d${depth}|pv${multipv}`)
because evaluation is path-independent — but the *FEN sent to the engine*
must carry the correct counters so Stockfish's terminal-detection logic
sees the right 50-move state.

### `TranspositionLink`

A *visual decoration* between two Occurrences whose Positions are
identical. **Not a structural edge.** Rendered only when the user enables
"show transpositions" or hovers an Occurrence with siblings.

```ts
interface TranspositionLink {
  fromOccurrenceId: OccurrenceId;
  toOccurrenceId: OccurrenceId;
  positionId: PositionId;          // the shared position
}
```

### Why this matters

- Threefold-repetition is a one-line check: walk back along
  `Occurrence.parentId` counting matching `positionId`.
- 50-move clock is honest because it lives on the Occurrence.
- Layout is straightforward (tree → DAG layout works, no cycles).
- Engine eval is still shared across same-Position Occurrences via the
  Position cache — the speed benefit of "transposition merging" is
  preserved without the correctness cost.

---

## 6. Visual encoding

Tokens (CSS custom properties or Tailwind config). Names use functional
roles, not paper terminology, so renaming is cheap:

```
--bg-graph:            #8FBC8F   /* darkseagreen */
--bg-graph-dark:       #2D4A3D   /* V4 dark mode */

--trunk-fill:          #FFFFFF
--trunk-fill-selected: #1A1A1A
--trunk-border:        #1A1A1A
--trunk-text:          #1A1A1A
--trunk-text-selected: #FFFFFF

--alt-fill-white:      #F5F5F5
--alt-fill-black:      #1A1A1A
--alt-fill-tie:        #999999
--alt-border-white:    #FFFFFF
--alt-border-black:    #1A1A1A

--checkmate-crown:     #DC2626

--edge-canonical:      #1A1A1A
--edge-compressed:     #4B5563   /* rendered with stroke-dasharray "4 3" */

--path-played:         #FFD700
--path-best:           #22C55E
--path-worst:          #EF4444
--path-tal:            #A855F7   /* displayed label: "Tal" */
--path-quietest:       #64748B

--chart-white-band:    rgba(245, 245, 245, 0.30)
--chart-black-band:    rgba( 30,  30,  30, 0.30)
--chart-played-line:   #1A1A1A
--chart-mate-marker:   #DC2626

--accent:              #2563EB
--success:             #10B981
--warning:             #F59E0B
--error:               #DC2626
```

Typography:

- UI: system stack.
- Move SAN: monospace (`"JetBrains Mono"`, `ui-monospace`, fallback).
- Numeric evals: tabular-nums.

Animation timings (per §14):

- Spring node entrance: stiffness ~300, damping ~25.
- Edge stroke-draw: 400 ms ease-out, repeatCount=1.
- Layout transitions: 300 ms ease-in-out via Motion `LayoutGroup`.
- Layout freeze windows: ≥ 500 ms cooldown between successive re-layouts.
- Board piece tween: 200 ms (chessground default).

---

## 7. V0 — static Figure 5 reproduction

**Goal**: prove the visual chassis works before any chess code is real.

### Scope

- Vite + React 19 + TypeScript strict scaffold.
- Tailwind 4 (or plain CSS tokens — decide and document).
- All visual tokens from §6.
- `<EvoGraph>` component using `@xyflow/react` with custom node and edge
  renderers:
  - `<EvoNode kind="trunk">` — white circle with black border + numeral.
  - `<EvoNode kind="alt">` — white/gray/black square with side-to-move
    border + optional crown overlay.
  - `<EvoEdge variant="solid|dotted">` with arrowhead and logical-thickness
    prop.
- Layout function: `layoutGraph(occurrences, edges) → positioned nodes`.
  Uses `@dagrejs/dagre` with ply-anchored trunk ranks; lane allocation
  above/below alternately for branches (full algorithm in §13).
- `<ScoreChart>` using Recharts with two stacked translucent `<Area>` and
  one `<Line>` on top.
- `<DetailZoomCallout>` showing a magnified region of the graph. For V0,
  this is static — just shows the top-right of the fixture.
- Hand-coded fixture `src/fixtures/plaskettShipov.ts` containing ~250–400
  Occurrences with typed eval data, approximating Figure 5's shape. **No
  engine, no chess.js** — just typed data shaped like the model in §5.
- Playwright visual-regression test: render at fixed viewport, screenshot,
  diff against `tests/golden/figure5.png` (a curated reference image
  committed to the repo). Threshold: ≤15% pixel delta in the salient
  region (trunk band + alternates ±200 px).

### Out of scope for V0

No chess.js, no Stockfish, no imports, no network, no Zustand stores yet
(fixture data flows through plain props), no streaming animations.

### Deliverables

- Repo scaffolded; CI green (lint, typecheck, unit, e2e).
- Golden screenshot committed to `tests/golden/figure5.png`.
- App renders the fixture at the index route.

### Gate

- Playwright golden-diff passes the threshold.
- Maintainer eyeballs the rendered page side-by-side with Figure 5 and
  agrees it is **recognizably the same visual language**.

**Estimated effort**: 1.5–2 weeks for one engineer.

---

## 8. V1 — played trunk + engine on played positions

**Goal**: replace the V0 fixture with a real-data pipeline. Single
analysis pass, no alternatives, no streaming animation.

### Scope

- Add chess.js + chessops + @mliebelt/pgn-parser.
- Implement `Position` + `Occurrence` data model (§5). Three Zustand
  stores: `gameTreeStore`, `viewStore`, `analysisStore`. Defer
  `importStore` to V3.
- Input field that accepts **PGN paste only**. Lichess URL import is
  deferred to V3 alongside the real CORS proxy — V1 must not depend on
  network infrastructure it isn't yet shipping. Auto-detection of all 8
  input types is V3+ scope; V1 detects only "is this PGN-shaped text."
- PGN → Occurrence tree builder.
- Stockfish 18 worker. UCI: `uci`, `setoption`, `position fen`, `go depth`.
- **Analysis budget — Fast tier**: depth 14, MultiPV 3, played positions
  only.
- **Played-move scoring**: if the played move appears in the MultiPV 3
  results, use that eval. If not, issue a separate UCI
  `go depth 14 searchmoves <playedMove>` to score it honestly. This is
  the explicit fix for "played move outside top-K."
- Score chart populated from played-position evals.
- Board: chessground component, single `set()` call on selection. No
  multi-ply animation in V1.
- Cache writes to Dexie keyed by `${normalizedFen}|d${depth}|pv${multipv}`.
  Cache reads on app boot and before queuing new analyses.

### Out of scope for V1

No alternative branches, no streaming, no branch shortening, no
score-chart-driven nav, no share links, no Chess.com.

### Deliverables

- Paste any PGN → played trunk renders with real evals.
- Tooltip on each trunk node shows eval.
- Score chart shows the actual eval line over moves.
- Click a circle → board updates to that position.
- Cold analyze a 40-move game in ≤ 90 s.
- Open the same game on fresh reload → analysis instant (cache hit).

### Gate

- Anderssen-Kieseritzky Immortal Game PGN renders fully: 17 circles +
  populated chart + board sync working.
- Cold analysis ≤ 90 s on a modern laptop; warm reopen < 1 s.

**Estimated effort**: 2–3 weeks.

---

## 9. V2 — curated alternatives + score-chart-driven navigation

**Goal**: add the alternative branches that make the graph *alive* — but
curated, not exhaustive. Add the phase-based streaming UX so structure
emerges visibly.

### Scope

- **Analysis budget — Quality tier**: depth 18, MultiPV 5, run on every
  played position after V1's fast tier completes.
- **Curated branch policy**:
  - At each played Occurrence, take the top 3 PV moves from the quality
    pass.
  - **Keep rule**: keep an alternative PV N (rank N in the sorted
    quality-pass results) iff
    `eval(PV1) − eval(PV_N) ≤ 30 cp` (absolute gap to the best PV)
    OR PV N leads to a forced mate within ≤ 6 plies.
    PV 1 is always kept. The comparison is **vs PV 1**, not vs the adjacent
    PV — this avoids the "last candidate has no next-best" edge case and
    keeps all near-best continuations regardless of where the eval curve
    bends. Sign convention: eval is from the side-to-move's perspective,
    so higher is better.
  - If the played move ∉ top 3, force-include the played-move line as an
    additional alternative regardless of the keep rule (already scored via
    `searchmoves` from V1).
  - Extend each kept alternative forward 3–5 plies via top-1 PV from
    quality-pass evals on the *successor* positions (queue them in
    priority order).
  - Stop extending: at mate, at depth cap, when eval changes by ≥ 200 cp
    between consecutive plies (the swing is interesting; show the swing
    node and stop).
- **Branch shortening** (paper's two-neighbor rule, adapted to the
  Occurrence tree): collapse chains of alternative Occurrences where
  every interior Occurrence has exactly one engine-suggested continuation
  AND no terminal event AND no significant eval delta. Render compressed
  chains as **dotted edges** between endpoints. Click-to-expand restores
  the chain.
- **Layout with branches**: same dagre constraints from §13. Lane
  allocation places branches above/below trunk alternately. Symmetry
  matters visually.
- **Streaming UX** (per §14): phase-based, not per-info-line.
- **Score-chart-driven nav**: click a chart point → select the
  corresponding Occurrence → graph highlights local neighborhood + board
  jumps. This is the paper's strongest UX pattern.
- **Multi-ply board animation**: when jumping non-adjacent Occurrences,
  chunk FEN updates through the intermediate Occurrences at ~120 ms per
  chunk. Uses the Occurrence-tree LCA (well-defined; tree).
- **Best-move arrows** on the board when an Occurrence is selected.
- **Detail zoom callout** (live): hover/select an Occurrence → corner
  panel magnifies its local subgraph.

### Out of scope for V2

No share links, no Chess.com, no custom paths, no PWA.

### Deliverables

- For each of the 7 demo games (see V4 list), graph shows played trunk +
  curated alternatives with paper-like branch density.
- Score-chart click jumps graph and board.
- Branch shortening with dotted edges visible.

### Gate

- Side-by-side: app rendering Plaskett-Shipov PGN ↔ Figure 5 →
  recognizably the same visual language.
- Score-chart click behavior works.
- 60 fps idle on a 300-node graph; ≥ 30 fps during a layout-freeze-window
  reveal.

**Estimated effort**: 3–4 weeks.

---

## 10. V3 — broader imports + cache + share links

### Scope

- Add `importStore`. Source detection (PGN / Lichess game URL /
  Lichess study URL / Lichess user archive). **Chess.com deferred to V4.**
- Lichess endpoints:
  - `GET /game/export/{id}` — single game.
  - `GET /api/study/{studyId}.pgn` and `/{chapterId}.pgn` — study chapter.
  - `GET /api/games/user/{username}` (NDJSON) — user archive stream with
    filters.
  - `GET /api/cloud-eval?fen={xfen}&multiPv=5` — as remote L2 cache for
    opening positions (≤ 1 req/s).
- UsernameGamePicker UI for user-archive imports.
- **CORS proxy** as a real Cloudflare Worker project in
  `workers-cors-proxy/`. Full spec in §16.
- IndexedDB cache schema v2 if needed. Schema migrations on open.
- **URL state encoding**: `?game=lichess:abcd1234&node=<occurrenceId>&paths=…`.
  - For pasted PGN and typed-move inputs, **share links are explicitly
    not supported in V3**. Display "Share link unavailable for pasted
    games" in the share dialog. Encoding raw PGN bytes is a V4
    decision (server-side paste-store or URL-truncate-with-warning).

### Out of scope for V3

No PWA, no custom paths, no Chess.com, no callback endpoint.

### Gate

- Import 5 Lichess URL forms (8-char, 12-char with color, ply anchor,
  study chapter, broadcast game).
- Lichess user archive imports via NDJSON stream.
- Share a URL for a Lichess-imported game → open in a new tab → full
  state restored.
- Cache hit on reopen: app fully populated in < 1 s.

**Estimated effort**: 2–3 weeks.

---

## 11. V4 — PWA + custom paths + Chess.com + polish

### Scope

- **PWA**: manifest, Workbox service worker via `vite-plugin-pwa`. Cache
  strategies per §20. Install prompt UX (with 30-day dismissal
  persistence).
- **Custom user-defined paths**: click N Occurrences → path materialized,
  colored from `schemeTableau10` minus canonical colors.
- **Chess.com monthly archive imports**:
  `GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`. UA
  header set in proxy, not client (browsers forbid `User-Agent`).
- **Chess.com callback path**: **not** in V4 acceptance criteria. Build
  behind an `experimental` flag if desired; it does not gate V4.
- **Engine settings UI**: depth + MultiPV sliders. Power-user mode.
- **Dark mode**: token swap; system preference default.
- **Accessibility audit**: alternate accessible model per §18 (move list
  table + path list + announced selected-position). axe-core: zero
  violations. Keyboard nav per §18. `prefers-reduced-motion` compliance.
- **Demo game library** (committed PGNs):
  - Plaskett vs Shipov (paper's Figure 5)
  - Capablanca vs Alekhine 1927 (paper's Figure 6)
  - Deep Blue vs Kasparov G2 1997 (paper's Figure 7)
  - Anderssen vs Kieseritzky, Immortal Game 1851 (public domain)
  - Morphy vs Duke of Brunswick, Opera Game 1858 (public domain)
  - Kasparov vs Topalov, Wijk aan Zee 1999
  - AlphaZero vs Stockfish 8, Game 1 2017 (verify license at build time)
- **Performance pass**: bundle splits, lazy-loads (chessground, Recharts),
  Lighthouse CI in pipeline.
- **Docs**: README, ARCHITECTURE, DEPLOYMENT, CONTRIBUTING.

### Gate

All §24 acceptance criteria pass.

**Estimated effort**: 3–4 weeks.

---

## 12. Engine integration

### Worker architecture

Stockfish runs in a dedicated Web Worker. Main thread sends typed commands;
worker translates to UCI and parses `info`/`bestmove` back.

Initialization sequence:

1. Main thread sends `init` with engine config.
2. Worker dynamically chooses Stockfish JS file (multi-threaded vs
   single-threaded) based on runtime SharedArrayBuffer detection.
3. Worker `importScripts` the engine, configures via UCI:
   `uci` → `setoption name Hash value 256` → `setoption name Threads value
   <navigator.hardwareConcurrency - 1>` → `setoption name MultiPV value N`
   → `ucinewgame` → `isready`.
4. Worker posts `ready` with engine name and version.

### Analysis request lifecycle

1. Main sends `analyze` with `{ requestId, occurrenceId, fen, depth,
   multipv, mode: 'standard' | 'searchmoves', restrictTo?: string }`.
2. Worker sends `position fen <fen>` then `go depth <n>` (with
   `searchmoves <move>` if mode is `searchmoves`).
3. Worker parses each `info` line. **Dedup**: maintain
   `Map<multipv, lastSignature>` where signature = `${depth}|${moves}`;
   forward only on signature change. Reduces traffic ~10×.
4. On `bestmove`, post `complete` with the final PV slot snapshot. Clear
   active context.
5. On main thread `cancel(requestId)`, send UCI `stop`; worker posts
   `cancelled` after `bestmove (none)`.

### Budgets (single config struct, three tiers)

```ts
const BUDGETS = {
  fast:    { depth: 14, multipv: 3 },
  quality: { depth: 18, multipv: 5 },
  deep:    { depth: 22, multipv: 7 },  // user-selected single node only
};
```

V1 uses fast only. V2 adds quality. V4 exposes deep via engine settings UI.

### Played-move scoring fallback

```ts
async function scorePlayedMove(occ: Occurrence): Promise<Evaluation> {
  const position = getPosition(occ.positionId);
  // FEN is derived per-Occurrence: position.normalizedFen carries piece
  // placement etc.; occ.fiftyMoveClock + occ.ply supply the counters.
  // See lib/fen.ts:fenForEngine.
  const fen = fenForEngine(occ, position);

  const res = await engine.analyze({ ...BUDGETS.fast, fen });
  const hit = res.multipv.find(p => p.moves[0] === occ.moveUci);
  if (hit) return res; // played move was in the top-K

  // Played move outside MultiPV — re-issue with searchmoves restriction.
  return engine.analyze({
    ...BUDGETS.fast,
    fen,
    mode: 'searchmoves',
    restrictTo: occ.moveUci!,
  });
}
```

### One worker per tab

Each Stockfish worker uses ~50 MB (single-thread) to ~150 MB
(multi-thread). Multiple workers compete for hash and cores. Serial
analysis with the budget pipeline above is the right model.

### Cancellation semantics

When user switches games or navigates away: orchestrator clears its queue
+ sends `cancel` for the active request. Existing Occurrences and evals
remain (they're real — next time the game is opened, the cache hits).

---

## 13. Layout

Use `@dagrejs/dagre` for the underlying layered DAG layout, then
**post-process** trunk and branch coordinates to enforce the paper's
axis-parallel grammar. **Do not rely on `setNode(id, { rank: P })`** —
that field exists in dagre's internals but is not part of the documented
public API and behavior across versions is not guaranteed.

The layout pipeline is three passes:

1. **Dagre pass**: build the graph with `rankdir: 'LR'`. Set node
   `width`/`height` from the rendered EvoNode size. Add invisible
   high-weight (`weight: 100`) and `minlen: 1` edges chained through the
   played-trunk Occurrences in ply order — these encourage dagre to keep
   the trunk Occurrences on a tight monotonic ranking. Run
   `dagre.layout(g)`.

2. **Trunk x-pin pass**: overwrite trunk Occurrences' x-coordinates with
   `x = baseX + ply × trunkSpacing` (constants from the visual tokens).
   This guarantees exact horizontal spacing regardless of what dagre
   chose, which is the paper's most load-bearing visual invariant. The
   chained-edge weights above ensure dagre's *relative* trunk ordering
   already matches ply order; the pin pass just normalizes the spacing.

3. **Branch lane-allocation pass**: group alternative Occurrences by
   their trunk-Occurrence anchor (the played Occurrence they branch
   from). Walk the trunk left-to-right; place successive non-empty
   branch groups alternately above/below the trunk y-baseline by
   shifting their y-coordinates as a block. Within a group, preserve
   dagre's relative y-order. Cap branch-group vertical extent at
   `maxBranchHeight` (a token, default ~200 px).

4. **Trunk y-pin pass**: snap trunk Occurrences to exactly `y = 0` (the
   centerline). Branches inherit their y from the lane-allocation pass.

### Escape hatch

If V0's golden-diff fails on this dagre-plus-post-processing approach
(branch groups overlap, x-spacing still drifts when many alternatives
crowd a trunk position, etc.), switch to a custom deterministic
paper-layout engine: assign trunk x by ply directly, allocate branches
to vertical lanes via greedy interval-overlap avoidance, route edges as
orthogonal connectors. **Do not default to custom layout** — it's 2–4
extra weeks and the crossing-minimization long tail is ugly. Try the
post-processed dagre approach first.

### Layout cadence (per §14)

Layout is **separate from data streaming**. New nodes accumulate in the
store at up to 4 Hz; the layout function runs at most once per 500 ms,
flushing all accumulated changes at once via Motion's FLIP transition.

---

## 14. Streaming UX

Phase-based progress, never per-info-line. Internal events posted from
the orchestrator to `analysisStore`:

| Event | Payload |
|---|---|
| `skeleton-ready` | — |
| `fast-pass-progress` | `{ moveN, total }` |
| `fast-pass-complete` | — |
| `quality-pass-progress` | `{ moveN, total }` |
| `alternatives-ready` | `{ count }` |
| `refining-progress` | `{ branchesDone, branchesTotal }` |
| `complete` | — |
| `cancelled` | — |

**Cadence**: tree mutations ≤ 4 Hz. Layout re-runs ≤ 2 Hz (every 500 ms
minimum cooldown). During a layout freeze window, accumulate new
Occurrences off-screen and reveal them all at once via Motion's
`AnimatePresence` + FLIP at the end of the window.

**Streaming indicator** (small overlay in graph corner):

- Engine name + version.
- Current phase ("Quality pass — move 12 / 27").
- Pause / Cancel buttons.

**Pause semantics**: Stockfish receives UCI `stop`. State preserved.
"Resume" issues a *new* search at the position's last achieved depth.
The persistent transposition table inside Stockfish makes the resume
fast in practice, but this is **not** a guarantee — wording in the UI
should say "Continue" not "Resume," and not promise zero rework.

---

## 15. Import surfaces

### V1 sources

- **PGN paste** — `[Event "..."]` header signature. The only V1 source.

### V3 additions (paired with the real CORS proxy in §16)

- **Lichess game URL** — `lichess.org/<8-char>[<4-char-color-suffix>][/<color>][#<ply>]`.
- **Lichess study URL** — `lichess.org/study/<8>[/<8-chapter>]`.
- **Lichess broadcast URL** — `lichess.org/broadcast/<slug>/<slug>/<8>[/<8>]`.
- **Lichess username** — 3–25-char `[A-Za-z0-9_-]`. Show user-archive
  picker.

### V4 additions

- **Chess.com username** → monthly archive picker.
- **Move sequence** typed by user (SAN/LAN/UCI, permissive parse).

### Detection

A single `detect(input: string): ParsedInput` function returns a tagged
union. Implemented incrementally per phase — V1 only needs PGN-shape
detection (look for `[Event "..."]` or similar header lines). All URL,
username, and move-sequence detection arrives in V3+ alongside the
network-dependent surfaces.

### Error surfaces

Structured error codes: `network`, `not-found`, `rate-limited`, `cors`,
`parse`, `invalid-input`, `private-game`, `cancelled`, `unknown`.
Per-code UI per the original spec's error-handling table.

### History

`viewStore.persist` keeps the last 20 successful imports
(`{source, identifier, label, ts}`) in localStorage. **Never store PGN
bytes** in localStorage — those live in Dexie.

---

## 16. CORS proxy as real infrastructure

The proxy is **a deployed service**, not free plumbing. V3 ships it as
part of the V3 gate. Until V3, dev uses Vite's proxy config.

### Contract

- **Allowlist** of upstream hosts:
  - V3: `lichess.org` only.
  - V4: add `api.chess.com`.
  - **Never**: `chess.com/callback/*` (out of scope; experimental flag
    only, never on the production deploy).
- **Rate limits** per source IP hash: 10 req/s, 100 req/min, 1000 req/hr.
  Return `429` with `Retry-After`.
- **No client-supplied auth forwarding**: strip `Authorization`, cookies,
  and any custom auth headers. OAuth-token-forwarding is **not** a V3
  feature (defer or never).
- **Outbound User-Agent** set by the proxy:
  `enpassant/<version> (https://github.com/jeanluciradukunda/enpassant)`.
  Browsers can't set `User-Agent` from `fetch`; only the proxy can.
- **Streaming pass-through** via `ReadableStream` — never buffer entire
  response bodies (NDJSON streams must arrive incrementally).
- **30 s request timeout**.
- **Structured logs**: `{ ts, source_ip_sha256, upstream_host, status,
  bytes }`. Scrubbed: usernames, game IDs, query strings except endpoint
  selection. No raw IPs.
- **Open metrics** (req/s, error rate, p95 latency) behind admin-token
  auth at `/_admin/metrics`.

### Why this matters

Browsers can't set `User-Agent` (WHATWG fetch spec — forbidden header).
Chess.com's PubAPI explicitly asks for a contact-bearing UA. That alone
makes the proxy a hard requirement — every "client-only" claim in the
research spec was fiction. Acknowledge this as deployed infrastructure
with security, abuse, uptime, and privacy commitments.

---

## 17. State management

Four Zustand stores with narrow responsibilities. Three middleware on
each: `subscribeWithSelector`, Immer, and `persist` (only on `viewStore`).

| Store | Purpose | Mutated by |
|---|---|---|
| `gameTreeStore` | Position + Occurrence maps + edges + transposition links | PGN parser, worker-message handlers |
| `viewStore` | UI state (selected, hovered, mode, path visibilities, board flip, theme) | UI events |
| `importStore` (V3+) | In-flight imports, queue, retries, history | Import dialog, network callbacks |
| `analysisStore` (V1+) | Per-Occurrence engine progress, current phase, queue | Orchestrator |

### Selector discipline

Every `useStore(s => …)` returns an atomic primitive or a single object
reference. Compound selections use `shallow` equality from
`zustand/shallow`. No array literals in selectors (most common bug:
`useStore(s => [s.a, s.b])` creates a new array per call → infinite
re-renders).

Either an ESLint rule or a code-review checklist enforces this.

---

## 18. Accessibility

The graph is a 2D DAG with score-chart cross-references — **not a tree**.
Do not expose it via `role="tree"`. Provide an alternate accessible
model:

- **SVG itself**: `aria-hidden`, decorative.
- **Move list** (`<table>`, always present in the DOM):
  - Columns: ply, SAN, side, eval, classification.
  - One row per played Occurrence.
  - Row gets `aria-current="true"` when its Occurrence is selected.
  - Arrow keys move row-by-row → equivalent to walking the trunk.
- **Path list** (`<ul>`):
  - One `<li>` per canonical or user path, with a `<button>` toggle.
  - `aria-pressed` reflects visibility.
- **Selected-position announcement** (`<section aria-live="polite">`):
  - Announces "Move 12, Nf3 by White, eval +0.4 (excellent), 3
    alternatives considered" on selection change.
- **Keyboard nav**:
  - Tab cycles: toolbar → move list → board → path list → footer.
  - In the move list, arrow keys move between played Occurrences; `Enter`
    cycles between alternatives at that ply.
  - On the board, arrow keys = prev/next ply on the currently-highlighted
    path; `f` = flip.
  - Global: `i` = import, `Esc` = close dialog, `?` = shortcuts help.
- **Focus rings** preserved everywhere. 2 px solid outline-offset.
- **`prefers-reduced-motion`**: disables all entrance/exit animations,
  layout transitions, board piece tweens (instant FEN swaps).
- **Color contrast**: 4.5:1 normal text, 3:1 graphics. Verify the
  paper's `darkseagreen` + `#999` gray-square combo (borderline 3:1; may
  need a thin contrasting border).

WCAG 2.1 AA. axe-core in CI gates V4.

---

## 19. Performance budgets (per phase)

The research-stage spec's "60 fps at 200 nodes" was calibrated for
hypothetical games; Plaskett-Shipov already runs to 250–400 nodes after
shortening. Revised upward.

| Metric | V0 | V1 | V2 | V3+ |
|---|---|---|---|---|
| Initial JS gzip (excl. Stockfish) | <250 KB | <300 KB | <400 KB | <500 KB |
| TTFP (4G mid-tier) | <1 s | <1 s | <1.5 s | <1.5 s |
| TTI (4G mid-tier) | <2 s | <3 s | <4 s | <4 s |
| Graph fps, idle | 60 @ 400 nodes | 60 @ 300 | 60 @ 400 | 60 @ 500 |
| Graph fps, streaming | n/a | n/a | ≥30 @ 400 | ≥30 @ 400 |
| Stockfish init (cold) | n/a | <800 ms | <800 ms | <800 ms |
| IDB cache lookup p95 | n/a | <50 ms | <50 ms | <50 ms |
| Memory after 30 min | n/a | <300 MB | <500 MB | <500 MB |
| Cold analyze, 40-move game | n/a | ≤90 s | ≤180 s | ≤180 s |

Bundle-size CI gate fails if any chunk exceeds 200 KB gzipped (excluding
the static Stockfish WASM).

---

## 20. Browser compatibility + PWA scope

Targets: Chrome/Edge 110+, Firefox 110+, Safari 16.4+, iOS Safari 16.4+,
Chrome Android 110+.

Feature detection on boot:

- **SharedArrayBuffer + crossOriginIsolated**: required for multi-thread
  Stockfish. Missing → fall back to single-thread + banner.
- **Web Worker module support**: **required**. Missing → error page.
- **IndexedDB**: **required for V1+ cache**. Missing → degrade to
  no-cache mode + banner.

### PWA (V4)

- **Manifest** at `/manifest.webmanifest`:
  - name, short_name, description.
  - `display: standalone`.
  - `start_url: /`, `scope: /`.
  - `background_color: #8FBC8F`, `theme_color: #8FBC8F`.
  - 192×192 + 512×512 PNG icons (+ maskable variants).
- **Service Worker** via `vite-plugin-pwa` (Workbox-generated):
  - **Cache-first** + immutable for `/stockfish/*` and `/pieces/*`.
  - **Stale-while-revalidate** for `/assets/*` (Vite-hashed bundles).
  - **Network-first** with cache fallback for `index.html`.
  - **Network-only** for `/proxy/*` (never cache cross-origin chess data).
  - Skip waiting on activate; surface a "New version available" toast.
- **Install prompt UX**: stash `beforeinstallprompt`, show "Install app"
  affordance on Chromium. Safari hint on first visit. 30-day dismissal
  persistence.

---

## 21. Testing strategy

- **Unit (Vitest)**: FEN normalization, X-FEN edge cases, PGN parsing,
  input detection, move parsing (SAN/LAN/UCI/permissive), UCI info
  parser (20+ real lines), edge thickness math, path computation,
  **Occurrence-tree invariants** (single parent, no cycles, repetition
  count correctness), TranspositionLink detection.
- **Integration (Vitest)**: full PGN → Occurrence-tree pipeline with
  mocked Stockfish; Lichess client with MSW mocks.
- **Component (Testing Library)**: EvoNode states (default, selected,
  analyzing, checkmate), ImportDialog flows, BoardControls.
- **E2E (Playwright)**: per-phase gate scenarios.
- **Golden visual regression (Playwright)**: V0's deliverable. Render
  fixture at fixed viewport, screenshot, diff against
  `tests/golden/figure5.png`. ≤15% pixel delta. **This is V0's gate.**
- **Accessibility (axe-core via Playwright)**: zero violations on the
  V1/V2/V4 gate scenarios.
- **Bundle-size (size-limit or bundlewatch)**: enforces §19 budgets.

Test fixtures live in `tests/fixtures/`:

- Canonical PGNs for the 7 demo games.
- Edge-case PGNs: empty, 1-move, 200-move, custom-FEN, deep variations,
  Cyrillic names, stalemate, threefold draw.
- Pre-recorded Stockfish outputs for deterministic engine tests.

---

## 22. Deployment & telemetry posture

### Hosting

Cloudflare Pages for the SPA + Cloudflare Workers for the CORS proxy
(`workers-cors-proxy/`). Same GitHub repo, separate `wrangler.toml`.

### Required HTTP headers (Pages)

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin   # on /pieces, /stockfish

X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Cache control:

```
/stockfish/*: public, max-age=31536000, immutable
/pieces/*:    public, max-age=31536000, immutable
/assets/*:    public, max-age=31536000, immutable
```

### Telemetry posture (reconciled)

The research spec contradicted itself ("no telemetry beyond opt-in error
reporting" alongside "Cloudflare Analytics" and env-gated Sentry).
Resolution:

- **No Cloudflare Web Analytics by default.** Opt-in via a toggle in
  the in-app settings dialog. Toggle state persists to localStorage.
- **Sentry off by default.** Opt-in via the same toggle. Build-time
  env var enables it for self-hosted forks that want telemetry-on.
- **Proxy logs**: aggregate counters only, no IPs (SHA-256 hashes
  instead), no usernames, no game IDs.

The charter promise of "no telemetry beyond opt-in error reporting"
holds.

### CI/CD (GitHub Actions)

On non-main pushes:

- `pnpm install --frozen-lockfile`
- `pnpm type-check && pnpm lint && pnpm test && pnpm build`
- Upload bundle stats

On main pushes:

- All of the above
- `pnpm test:e2e` (Playwright incl. golden diffs and axe-core)
- Deploy to CF Pages preview via Wrangler
- Lighthouse CI against preview; fail below thresholds
- Promote preview → production on green

### Bundle-size gate

`size-limit` or `bundlewatch` enforces §19 budgets per chunk.

---

## 23. Open questions deferred to builder

These are decisions the builder makes at implementation time, based on
profiling and the V0/V1 results:

- **Orchestrator location**: main thread vs dedicated Worker. Start on
  main thread; move to Worker only if profiling shows main-thread
  blocking.
- **CSS approach**: Tailwind 4 vs plain CSS custom properties. Decide
  during V0; document the choice.
- **AlphaZero game licensing**: verify DeepMind's released PGNs are
  compatible with this app's GPL-3 distribution before bundling.
- **Color-blind palette**: pick a deuteranopia-safe alternative (e.g.,
  Okabe-Ito) for V4's settings toggle.
- **i18n**: single English locale file from day one (V0), so future
  translation drops in without refactor. Library choice (react-intl
  vs i18next vs plain object) deferred.
- **Lichess Cloud-Eval rate-limit budget**: ≤ 1 req/s seems safe per
  community guidance; verify at V3 deploy time.
- **Custom-layout fallback**: only triggered if V0 golden-diff fails on
  constrained dagre. Don't pre-build it.

---

## 24. Acceptance criteria — phase rollup

### V0

- [ ] Repo scaffolded with Vite + React 19 + TS strict; CI green
      (lint, typecheck, unit, e2e).
- [ ] EvoGraph + EvoNode + EvoEdge + ScoreChart + DetailZoomCallout
      components render the fixture at the index route.
- [ ] `tests/golden/figure5.png` committed.
- [ ] Playwright visual-regression test passes ≤15% pixel delta in
      salient region.
- [ ] Maintainer eyeballs side-by-side with Figure 5 → "recognizably
      the same visual language."

### V1

- [ ] PGN paste input works (Lichess URL deferred to V3).
- [ ] Played-trunk graph renders with real Stockfish 18 evals.
- [ ] Score chart shows played-game eval line.
- [ ] Click trunk circle → board syncs.
- [ ] Anderssen-Kieseritzky PGN: 17 circles + chart + board sync.
- [ ] Played-move scoring uses `searchmoves` fallback when needed.
- [ ] Cold analyze 40-move game ≤ 90 s.
- [ ] Warm reopen < 1 s (cache hit).

### V2

- [ ] Quality-tier analysis ran on all played positions.
- [ ] Curated alternatives visible for the 7 demo games.
- [ ] Branch shortening with dotted edges; click-to-expand.
- [ ] Score-chart click jumps graph + board.
- [ ] Multi-ply board animation works for non-adjacent jumps.
- [ ] Detail zoom callout responds to selection.
- [ ] 60 fps idle @ 300 nodes; ≥ 30 fps during streaming reveal.
- [ ] Side-by-side Plaskett-Shipov ↔ Figure 5 → recognizably the same.

### V3

- [ ] 5 Lichess URL forms parse and import.
- [ ] Lichess study chapter imports.
- [ ] Lichess user archive NDJSON imports.
- [ ] CORS proxy deployed; allowlisted; rate-limited; logs scrubbed.
- [ ] Lichess Cloud-Eval L2 cache used for opening positions.
- [ ] Share URL for a Lichess-imported game round-trips state.
- [ ] Pasted-PGN share path explicitly disabled with clear messaging.

### V4

- [ ] PWA installable on Chromium + Safari (with hint).
- [ ] Custom paths creatable by clicking N nodes.
- [ ] Chess.com monthly archive import works.
- [ ] Chess.com callback NOT in the production deploy (experimental flag
      only, off by default).
- [ ] Engine settings UI (depth + MultiPV sliders) wired.
- [ ] Dark mode token swap.
- [ ] axe-core: zero violations on V1/V2/V4 scenarios.
- [ ] All 7 demo games load + analyze correctly via the Demo Games panel.
- [ ] Lighthouse Performance >90, Accessibility >95.
- [ ] Bundle sizes within §19 budgets.
- [ ] Docs: README, ARCHITECTURE, DEPLOYMENT, CONTRIBUTING committed.

---

## 25. References

- **Lu, Wang, Lin (2014).** "Chess Evolution Visualization." *IEEE TVCG*
  20(5), 702–713. DOI: 10.1109/TVCG.2014.2299803. Alternate access if
  paywalled: <https://scholar.nycu.edu.tw/en/publications/chess-evolution-visualization>.
- **Hyatt & Cozzie (2005).** "The Effect of Hash Signature Collisions in
  a Chess Program." *ICGA Journal* 28(3). Cited by the paper for the
  transposition-merge technique. Not directly used because the
  Occurrence-tree model in §5 sidesteps the need for hash-merge entirely.
- **Stockfish 18** release (2026-01-31): <https://stockfishchess.org/>.
- **Stockfish.js** (Nathan Rugg WASM port): <https://github.com/nmrugg/stockfish.js>.
- **Stockfish UCI protocol**: <https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html>.
- **React 19**: <https://react.dev/blog/2024/12/05/react-19>.
- **React 19.2** (current minor as of 2025-10-01):
  <https://react.dev/blog/2025/10/01/react-19-2>.
- **Tailwind v4**: <https://tailwindcss.com/blog/tailwindcss-v4>.
- **Vite releases**: <https://vite.dev/releases>.
- **@xyflow/react**: <https://reactflow.dev/>.
- **@dagrejs/dagre**: <https://github.com/dagrejs/dagre>.
- **chess.js**: <https://github.com/jhlywa/chess.js>.
- **chessops**: <https://github.com/niklasf/chessops>.
- **chessground**: <https://github.com/lichess-org/chessground>.
- **@mliebelt/pgn-parser**: <https://github.com/mliebelt/pgn-parser>.
- **Lichess API**: <https://lichess.org/api>.
- **Chess.com Published-Data API**: <https://www.chess.com/news/view/published-data-api>.
- **Zustand**: <https://docs.pmnd.rs/zustand>.
- **Motion**: <https://motion.dev/>.
- **Recharts**: <https://recharts.org/>.
- **Dexie**: <https://dexie.org/>.
- **Chess math (Shannon-derived game-tree numbers)**:
  Ng, "Chess Math to Check Mate," <https://jng15.medium.com/chess-math-to-check-mate-the-mathematics-of-chess-2b1ee5eacb18>.
  Frames *why* the product must curate aggressively (Shannon ~10¹²⁰,
  ~30 avg legal moves, ~80-ply average game).

For visual reference:

- **Lichess analysis board**: <https://lichess.org/analysis> — analysis
  panel UX patterns.
- **Chess.com Game Review** — move classification visualization.
- **Paper Figure 5 image** — see repo `tests/golden/figure5.png` (added
  during V0).

The research-stage spec is preserved at `docs/SPEC-v0-research.md` —
useful for tracing why decisions were made or why options were rejected.

---

**End of specification.**

If the builder encounters ambiguity, re-read the relevant section. If
still ambiguous, default to the **most conservative interpretation that
does not violate any other section**, and prefer the gate criteria in
§24 over implementation prose. Lower-numbered sections take precedence
over higher-numbered ones when in conflict.
