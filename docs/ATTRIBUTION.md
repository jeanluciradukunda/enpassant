# Sources and attribution

**Application.** Enpassant’s source code is [GPL-3.0-or-later](../LICENSE). The wordmark composition, app screenshots and replay recordings are part of this repository; recordings show the bundled public game rather than synthetic analysis.

**Research artwork.** Lu, Wang & Lin, _Chess Evolution Visualization_, IEEE TVCG 20(5), 2014. [Author-hosted paper](https://people.cs.nycu.edu.tw/~yushuen/data/ChessVis14.pdf) · [DOI](https://doi.org/10.1109/TVCG.2014.2299803).

`public/reference/figure5.png`, the recovered geometry in `src/fixtures/figure5.json`, and the small graph motif in `docs/images/readme-header.svg` derive from Figure 5. Their original rights remain with the respective rights holders; the application license does not relicense the paper artwork. [Reconstruction and extraction details](figure5-reconstruction.md).

**Engine.** Stockfish.js 18.0.8, lite single-thread build, GPLv3. [Pinned source revision](https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918). The preparation script copies the package’s `Copying.txt` to `public/engine/COPYING.txt`, and the app links both license and corresponding source.

**Layout.** [Viz.js](https://github.com/mdaines/viz-js), the Graphviz WebAssembly wrapper. The wrapper is MIT-licensed; Graphviz and its bundled components have their own upstream licenses, separate from Enpassant’s. **Chess rules:** [chess.js](https://github.com/jhlywa/chess.js). **Interface:** [React](https://github.com/facebook/react). Consult the upstream projects for their licenses and distribution notices.

**Example game.** indigojeans–GM-Shadi, Chess.com, 10 August 2026, [game 172801642226](https://www.chess.com/game/live/172801642226). The exported PGN is bundled under `public/games/`; screenshots and replay media use this same public game.
