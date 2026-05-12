// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import { EvoGraph } from './components/EvoGraph';
import { ScoreChart } from './components/ScoreChart';
import { DetailZoomCallout } from './components/DetailZoomCallout';
import { buildPlaskettShipovFixture } from './fixtures/plaskettShipov';

/**
 * V0 page layout:
 *
 *   ┌────────────────────────────────────────┐   ┌──────────┐
 *   │                                        │   │          │
 *   │           EvoGraph (graph)             │   │  Detail  │
 *   │                                        │   │   Zoom   │
 *   │                                        │   │ Callout  │
 *   ├────────────────────────────────────────┤   │          │
 *   │           ScoreChart                   │   │          │
 *   └────────────────────────────────────────┘   └──────────┘
 *
 * Graph + chart share x-axis alignment (move 1 in chart sits below circle 1).
 * Zoom callout is a corner inset, like Figure 5's red-bordered detail box.
 */
export function App() {
  const graph = useMemo(() => buildPlaskettShipovFixture(), []);

  return (
    <main
      data-testid="v0-root"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gridTemplateRows: '1fr',
        gap: 24,
        padding: 24,
        height: '100vh',
        boxSizing: 'border-box',
        background: 'var(--bg-graph)',
      }}
    >
      <section
        style={{
          display: 'grid',
          gridTemplateRows: '1fr 160px',
          gap: 12,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          data-testid="evo-graph"
          style={{
            position: 'relative',
            minHeight: 0,
            background: 'var(--bg-graph)',
          }}
        >
          <EvoGraph graph={graph} />
        </div>
        <div
          data-testid="score-chart"
          style={{
            background: 'var(--bg-graph)',
            padding: '4px 8px',
          }}
        >
          <ScoreChart graph={graph} />
        </div>
      </section>

      <aside
        data-testid="detail-zoom"
        style={{ alignSelf: 'start' }}
        aria-label="Detail zoom inset"
      >
        <DetailZoomCallout />
      </aside>
    </main>
  );
}
