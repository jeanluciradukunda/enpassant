# Working on Enpassant

The app has two routes: `/` for real games and `/paper` for the recovered Figure 5 study. Both render native SVG; the original React Flow prototype has been removed.

## Local setup

Use Node 24 LTS (`.nvmrc`) and pnpm 10.33.4. The package-manager version is pinned in `package.json`; Node’s supported versions are declared in `engines`.

```sh
nvm use
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5173. `predev`, `prebuild` and `pretest:e2e` prepare the pinned Stockfish worker, WASM and license under ignored `public/engine/`. The vendor build script is intentionally disabled; Enpassant copies the published lite binaries itself. `esbuild` is the only package allowed to run an installation build script.

## Checks

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs types, lint, formatting and the unit suite. Browser tests exercise the actual WASM engine, replay, imports, cache recovery, chart alignment and the independent paper-image comparison. On Linux, Playwright may need `pnpm exec playwright install --with-deps chromium`.

External services are deliberately opt-in:

```sh
LIVE_IMPORTS=1 pnpm test:e2e tests/e2e/import-live.spec.ts
```

The GitHub Actions workflow runs the deterministic suite on pull requests and `main`. It uses Node 24, the frozen lockfile, pinned action commits and read-only repository permissions. Network imports are tested separately because public archives and service availability change.

## Where things live

| Area                                       | Entry point                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Routing and remembered game                | `src/App.tsx`                                                                    |
| Imports and legal PGN replay               | `src/lib/importers.ts`, `src/lib/games.ts`                                       |
| Stockfish and history-sensitive cache      | `src/lib/engine.ts`                                                              |
| Analysis scheduling and replay publication | `src/lib/useAnalysis.ts`                                                         |
| Move occurrences and display graph         | `src/lib/evolution.ts`, `src/lib/evolutionLayout.ts`                             |
| Layout worker and recovery                 | `src/lib/graphviz.ts`, `src/lib/graphviz.worker.ts`                              |
| Game interface and SVG marks               | `src/components/GameWorkbench.tsx`, `EvolutionDiagram.tsx`, `EvolutionMarks.tsx` |
| Original paper study                       | `src/PaperStudy.tsx`, `src/fixtures/figure5.json`                                |
| Brand and layout styles                    | `src/styles/study.css`, `src/styles/workbench.css`                               |

The displayed graph can merge equivalent positions while their full occurrence histories remain separate. Preserve that distinction: engine searches, repetition detection and board replay must use the selected occurrence’s complete move path.

A layout must rank the **shortened graph**, not reserve a column for every hidden move. Existing positions must remain fixed during replay and later branch exploration. See [the architecture notes](game-visualizer.md) before changing this pipeline.

## Visual references and media

- `public/reference/figure5.png` is an independent raster of the author’s PDF. Do not replace it with an application screenshot to make a test pass.
- `docs/images/readme-header.svg` is the editable README wordmark composition. The README uses its 2× PNG export, `docs/images/readme-header.png`, for consistent font rendering. The right-hand motif uses a crop of the attributed Figure 5 vectors.
- `docs/images/game-visualizer.png` shows the real bundled game. `docs/media/replay.gif` and `replay.mp4` are recordings of that game at 4× speed. The README embeds the GIF with a reduced-motion poster and links to the full MP4 recording.
- `scripts/capture-paper-replay.mjs` captures a production preview, checks fixed coordinates through replay and saves evidence under ignored `artifacts/`. Start `pnpm preview` first. `PREVIEW_URL` overrides its default port 4173.

Keep recordings small and readable. Keep source assets in the repository and ordinary document links relative. Publish the README header, replay preview, reduced-motion poster and recording as GitHub attachments so their display does not depend on the raw-file service. Source artwork, engine binaries and application screenshots have distinct provenance: [attribution](ATTRIBUTION.md).

If GitHub cannot display an asset, check its HTTP response and the rendered page before changing the artwork or codec. On 9 September 2026, the raw SVG and MP4 URLs returned `503 Backend.max_conn reached`; newly published PNG and GIF URLs failed too. The SVG rendered locally and the complete MP4 decoded without errors (H.264, yuv420p, with its playback metadata at the start). The attachment versions rendered and played in a signed-out browser. A successful local render or image export alone does not verify publication.

The published media is attached to [PR #6](https://github.com/jeanluciradukunda/enpassant/pull/6). To replace it, use [GitHub's attachment workflow](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files), or `gh pr edit <number> --attach <file>` with a CLI version that supports attachments. Put the stable `https://github.com/user-attachments/assets/...` URL in the README, never the temporary signed URL produced by a redirect. Verify the README, reduced-motion poster and full video while signed out before merging.

After editing the header SVG, regenerate its PNG with `rsvg-convert` (from librsvg):

```sh
rsvg-convert --width 2560 --height 720 --output docs/images/readme-header.png docs/images/readme-header.svg
```

Use a machine with Georgia and Arial installed, then visually check the export before committing it.

## Hosting

`pnpm build` produces `dist/`, including the local engine. Serve it with an SPA fallback so `/paper` resolves to `index.html`. Deploy at the origin root; subpath hosting has not been validated. Serve `.wasm` as `application/wasm` and allow same-origin workers. The single-thread engine does not need cross-origin-isolation headers.

There is no production deployment or backend configured in this repo. Public imports depend on the providers’ browser-accessible APIs; downloaded PGN files remain the fallback. The app stores the last imported PGN in localStorage and analysis in IndexedDB, without telemetry.

See [the dated audit](audit-2026-09-07.md) for the remaining accessibility, browser and scale work.
