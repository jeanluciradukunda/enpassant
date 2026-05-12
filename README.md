# enpassant

Interactive reproduction of the chess evolution graph from Lu, Wang & Lin 2014
(_IEEE TVCG_ 20(5)). Turns any chess game into a navigable tree of what was
played and what could have been, with Stockfish doing the heavy lifting and
the user steering the exploration.

The canonical build contract is in [`SPEC.md`](./SPEC.md) — V0→V4 phased
gates. Earlier research-stage spec is preserved at
[`docs/SPEC-v0-research.md`](./docs/SPEC-v0-research.md) for lineage.

## Status

| Phase  | Goal                                                                               | State           |
| ------ | ---------------------------------------------------------------------------------- | --------------- |
| **V0** | Static reproduction of Figure 5 from hand-coded fixture data. Visual-diff CI gate. | **in progress** |
| V1     | PGN paste → played trunk → Stockfish on played positions.                          | pending         |
| V2     | Curated alternatives + branch shortening + score-chart-driven nav.                 | pending         |
| V3     | Lichess imports + real CORS proxy + cache + share links.                           | pending         |
| V4     | PWA + custom paths + Chess.com archive + a11y audit + demo library.                | pending         |

## Quick start

```
pnpm install
pnpm dev               # http://localhost:5173
```

## Scripts

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `pnpm dev`             | Run Vite dev server.                                   |
| `pnpm build`           | Type-check + production build.                         |
| `pnpm preview`         | Serve the production build locally.                    |
| `pnpm type-check`      | TypeScript-only check, no emit.                        |
| `pnpm lint`            | ESLint flat config.                                    |
| `pnpm format`          | Prettier write.                                        |
| `pnpm format:check`    | Prettier check, no write.                              |
| `pnpm test`            | Vitest unit tests (placeholder until V0 stabilises).   |
| `pnpm test:e2e`        | Playwright tests, including the V0 golden visual diff. |
| `pnpm test:e2e:update` | Re-baseline the V0 golden screenshot.                  |

## V0 contract

V0 renders a static reproduction of Figure 5 from typed fixture data. No
engine, no imports, no network. The deliverable lives at the index route and
is screen-shotted by the Playwright golden test in
[`tests/e2e/golden.spec.ts`](./tests/e2e/golden.spec.ts).

### Gate

The Playwright golden-diff against `tests/e2e/golden.spec.ts-snapshots/figure5-chromium-darwin.png`
must pass under `maxDiffPixelRatio: 0.15`. After intentional visual changes,
run `pnpm test:e2e:update` to re-baseline.

### What V0 proves

The visual chassis works before any chess code is real:

- Layout pipeline turns Occurrences into positioned React Flow nodes.
- EvoGraph + EvoNode + EvoEdge renderers respect the paper's encoding
  (white-filled circles, side-to-move borders, red crowns, dotted compressed
  edges, per-source edge thickness).
- ScoreChart's translucent area bands and played-eval line align with the
  trunk x-axis.
- DetailZoomCallout reproduces the paper's red-bordered magnification inset.
- All visual tokens from SPEC §6 are wired through CSS custom properties.

## Stack

See [`SPEC.md` §4](./SPEC.md). Headlines: Vite + React 19 + TS 5.7 strict +
@xyflow/react v12 + @dagrejs/dagre + Recharts + Motion + Tailwind v4 + Dexie.
Future V1+ adds Stockfish 18 (released 2026-01-31), chess.js, chessops, and
@mliebelt/pgn-parser.

## License

GPL-3.0-or-later. The bundle inherits GPL-3 contamination from Stockfish and
chessground (added in V1+). See [`LICENSE`](./LICENSE).

## Project layout

```
src/
├── components/         EvoGraph, EvoNode, EvoEdge, ScoreChart, DetailZoomCallout
├── fixtures/           Hand-coded data shaped like Figure 5 (V0)
├── lib/                Layout pipeline (constrained, trunk-anchored)
├── styles/             CSS tokens + Tailwind import
├── types/              Position, Occurrence, TranspositionLink, ImpactFrame
├── App.tsx             V0 index page
└── main.tsx
tests/
└── e2e/
    ├── golden.spec.ts                            Playwright golden-diff gate
    └── golden.spec.ts-snapshots/                 Committed golden image
docs/
└── SPEC-v0-research.md  Original research-stage spec (preserved for lineage)
SPEC.md                  Canonical V0→V4 build contract
```

## Contributing

PRs land on `main` via squash merge with linear history. Branch protection
requires a PR — direct pushes to `main` are blocked locally and remotely. The
preferred branch naming is `<phase>/<short-topic>` (e.g., `v0/foundation`,
`v1/pgn-import`).

Per SPEC §1's visual priority rule: when paper fidelity conflicts with modern
polish, **paper fidelity wins**. No gradients, no hero cards, no
glassmorphism. Flat darkseagreen canvas, thin black connectors, small
encoded nodes.
