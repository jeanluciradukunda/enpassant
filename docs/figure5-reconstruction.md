# Figure 5 reconstruction — 7 September 2026

The first implementation estimated the picture with synthetic branch chains,
move-local offsets and pseudo-random jitter. Its screenshot gate compared that
approximation with its own baseline. The new V0 page instead reconstructs the
visual fixture from the original PDF and measures it against an independent
raster of Figure 5.

## Source

- Lu, Wang & Lin, _Chess Evolution Visualization_, IEEE TVCG 20(5), 2014.
- Author copy: https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf
- Figure 5 is on physical page 7 of that author manuscript (physical page 6 of
  the typeset IEEE version). Do not interchange page indices.
- The exact input SHA-256 is included in `src/fixtures/figure5.json`.
- The source artwork is not relicensed as application code.

## What changed in the interpretation

The actual figure resolves several contradictions in the earlier spec:

| Earlier assumption                         | Direct observation and current rendering                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 28 played nodes through move 27            | 54 circles: White and Black entries for each of 27 move numbers                             |
| Approximately 250–400 visible nodes        | 938 distinct visible nodes and 972 edges in the main graph                                  |
| Constant trunk y, mirrored branch groups   | The trunk bends slightly; the real branching is irregular and asymmetric                    |
| Darkseagreen `#8fbc8f`                     | Outer canvas `#9dcd9d`; main graph interior `#9dcd9b`                                       |
| Filled circles alternating black and white | Green interiors with side-colored borders and numerals; selected inset has a white interior |
| Invent a single played-evaluation line     | Preserve the actual two translucent envelopes, markers and per-side move labels             |
| A separately drawn terminal fan            | Magnify the same geometry inside the source selection rectangle                             |

For **V0**, these direct observations supersede the approximations and fixed
library choices in SPEC §§2, 6, 7 and 13. Native SVG is used because it preserves
recovered paths, a common chart/graph transform, and clipping without running a
second layout algorithm over positions that are already known. This is a fixed
visual fixture, not a replacement general-purpose layout algorithm for V1/V2.

## Extraction

```sh
python scripts/extract-figure5.py /path/to/ChessVis14.pdf
```

Requires `pdfplumber`. No PDF is fetched or processed by the browser.
The script reads vector curves from page 7, deduplicates filled/stroked copies
of nodes, identifies cubic edge routes and their arrowheads, and associates
edge endpoints with adjacent node centers. It recovers the two score envelopes,
text labels and mate-marker locations. It validates 54 trunk nodes, 972 edges,
and an endpoint-to-node-center distance below 3 PDF points.

PDF coordinates are normalized around `(36, 53.14)` into a
`490.168 × 169.673` viewBox. The nested PDF drawing transform must be applied to
line widths: pdfminer does not account for the innermost 0.1 scale in this
figure. This correction was verified against `pdftocairo -svg` output.

The independent reference was rendered with Poppler:

```sh
pdftoppm -f 7 -l 7 -singlefile -r 288 \
  -x 144 -y 213 -W 1961 -H 679 -png \
  /path/to/ChessVis14.pdf public/reference/figure5
```

The source crop includes the printed inset and callout; it is only displayed
when the user chooses **Original paper**. The reconstruction uses SVG primitives
and data, not a source-image background. Mate crowns are small native SVG glyphs;
fonts and rasterization can differ from the PDF. Therefore the source gate
permits limited color and two-pixel ink-location differences.

## Interaction and limits

- Node and chart-column selection update the same magnifier region.
- Continuation isolation follows recovered directed edges, including merges.
- Zoom and pan transform chart and graph together; the inset stays readable.
- Arrow keys move through the played sequence; Escape and Reset restore Figure 5.
- At phone widths the complete overview is retained and zoom is available.

The graph has visual topology and encoded events, but **no chess position data**.
No FENs, legality, move names or engine scores are fabricated. A fresh Stockfish
analysis of the same game would not necessarily reproduce a 2014 engine's
search tree. Generalizing this visual language requires a separate engine and
layout pipeline, validated against this fixed visual reference.

V0's automated source and interaction gates can pass locally. Maintainer visual
acceptance remains the user's judgment; the broader V1–V4 roadmap is unfinished.
