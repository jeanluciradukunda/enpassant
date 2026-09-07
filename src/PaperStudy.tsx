// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaperGraph } from './components/PaperGraph';
import { PaperChart } from './components/PaperChart';
import { continuations, describeNode, figure5, nodeById, regionForNode } from './lib/paper';
import type { PaperNode } from './types/paper';

const initialId = figure5.trunk.at(-1)!;
const HOME = { x: 0, y: 0, zoom: 1 };
const PLOT_WIDTH = 382;

// Nested SVG bounds include offscreen child geometry. Use the outer viewport
// for pointer distances, otherwise pan speed and cursor-centered zoom drift.
function plotBounds(plot: SVGSVGElement) {
  const bounds = plot.ownerSVGElement!.getBoundingClientRect();
  return {
    left: bounds.left,
    top: bounds.top,
    width: (bounds.width * PLOT_WIDTH) / figure5.width,
    height: bounds.height,
  };
}

export function PaperStudy() {
  const [selectedId, setSelectedId] = useState(initialId);
  const [focused, setFocused] = useState(false);
  const [reference, setReference] = useState(false);
  const [camera, setCamera] = useState(HOME);
  const plotRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; camera: typeof HOME } | null>(null);
  const selected = nodeById.get(selectedId)!;
  const descendants = useMemo(() => continuations(selectedId), [selectedId]);
  const lens = regionForNode(selected);
  const inset = figure5.inset;
  const mateCount = figure5.nodes.filter((node) => descendants.has(node.id) && node.mate).length;
  const select = useCallback((node: PaperNode) => setSelectedId(node.id), []);

  const zoomBy = useCallback((factor: number) => {
    setCamera((current) => {
      const zoom = Math.max(1, Math.min(6, current.zoom * factor));
      if (zoom === 1) return HOME;
      return {
        zoom,
        x: current.x + PLOT_WIDTH / current.zoom / 2 - PLOT_WIDTH / zoom / 2,
        y: current.y + figure5.height / current.zoom / 2 - figure5.height / zoom / 2,
      };
    });
  }, []);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    function wheel(event: WheelEvent) {
      if (reference) return;
      event.preventDefault();
      const bounds = plotBounds(plot!);
      const rx = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const ry = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      setCamera((current) => {
        const zoom = Math.max(1, Math.min(6, current.zoom * Math.exp(-event.deltaY * 0.002)));
        if (zoom === 1) return HOME;
        return {
          zoom,
          x: current.x + rx * PLOT_WIDTH * (1 / current.zoom - 1 / zoom),
          y: current.y + ry * figure5.height * (1 / current.zoom - 1 / zoom),
        };
      });
    }
    plot.addEventListener('wheel', wheel, { passive: false });
    return () => plot.removeEventListener('wheel', wheel);
  }, [reference]);

  function step(direction: number) {
    const index = figure5.trunk.indexOf(selectedId);
    const next = Math.max(0, Math.min(figure5.trunk.length - 1, index < 0 ? 0 : index + direction));
    setSelectedId(figure5.trunk[next]);
  }

  function reset() {
    setCamera(HOME);
    setSelectedId(initialId);
    setFocused(false);
    setReference(false);
  }

  return (
    <main className="study" data-testid="v0-root">
      <header className="study-header">
        <div className="identity">
          <span className="wordmark">
            enpassant<span className="wordmark-dot">.</span>
          </span>
          <a className="source-link" href="/">
            ← Game visualizer
          </a>
        </div>
        <a className="source-link" href={figure5.provenance.url} target="_blank" rel="noreferrer">
          Lu, Wang &amp; Lin, 2014 <span aria-hidden="true">↗</span>
        </a>
      </header>
      <section className="workspace" aria-label="Figure 5 interactive study">
        <div className="figure-toolbar">
          <div className="figure-title">
            <span className="figure-number">FIG. 05</span>
            <h1>
              Plaskett <span className="versus">/</span> Shipov
            </h1>
          </div>
          <div className="view-controls">
            <button
              className={reference ? 'active' : ''}
              aria-pressed={reference}
              onClick={() => setReference(!reference)}
            >
              Original paper
            </button>
            <span className="control-divider" />
            <button
              aria-label="Zoom out"
              disabled={reference || camera.zoom === 1}
              onClick={() => zoomBy(1 / 1.35)}
            >
              −
            </button>
            <output className="zoom-level" aria-label="Zoom level">
              {Math.round(camera.zoom * 100)}%
            </output>
            <button
              aria-label="Zoom in"
              disabled={reference || camera.zoom === 6}
              onClick={() => zoomBy(1.35)}
            >
              +
            </button>
            <button onClick={reset}>Reset view</button>
          </div>
        </div>
        <div className={`paper-canvas${reference ? ' showing-reference' : ''}`}>
          <svg
            data-testid="paper-figure"
            className="paper-figure"
            tabIndex={0}
            viewBox={`0 0 ${figure5.width} ${figure5.height}`}
            aria-label={
              reference
                ? 'Original Figure 5 from the paper'
                : 'Chess evolution graph with aligned score chart and detail magnifier'
            }
            onKeyDown={(event) => {
              if (reference) return;
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                event.currentTarget.focus();
                step(event.key === 'ArrowRight' ? 1 : -1);
              }
              if (event.key === 'Escape' || event.key === '0') {
                event.preventDefault();
                reset();
              }
            }}
          >
            <rect width={figure5.width} height={figure5.height} fill="#9dcd9d" />
            <svg
              ref={plotRef}
              data-testid="plot-viewport"
              width={PLOT_WIDTH}
              height={figure5.height}
              viewBox={`${camera.x} ${camera.y} ${PLOT_WIDTH / camera.zoom} ${figure5.height / camera.zoom}`}
              overflow="hidden"
              onPointerDown={(event) => {
                if (reference || (event.target as Element).closest('[data-node], [data-chart-ply]'))
                  return;
                drag.current = { x: event.clientX, y: event.clientY, camera };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                const bounds = plotBounds(event.currentTarget);
                const original = drag.current.camera;
                setCamera({
                  ...original,
                  x:
                    original.x -
                    (((event.clientX - drag.current.x) / bounds.width) * PLOT_WIDTH) /
                      original.zoom,
                  y:
                    original.y -
                    (((event.clientY - drag.current.y) / bounds.height) * figure5.height) /
                      original.zoom,
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              <rect width="1000" height="1000" x="-200" y="-200" fill="#9dcd9d" />
              <PaperGraph
                selectedId={selectedId}
                emphasized={focused ? descendants : null}
                interactive
                onSelect={select}
              />
              <PaperChart onSelect={select} />
              <rect
                data-testid="detail-region"
                {...lens}
                fill="none"
                stroke="#ee0018"
                strokeWidth="1.5"
                strokeDasharray="3 2"
                pointerEvents="none"
              />
              {selectedId !== initialId && (
                <circle
                  cx={selected.x}
                  cy={selected.y}
                  r="3"
                  fill="none"
                  stroke="#ee0018"
                  strokeWidth=".55"
                  pointerEvents="none"
                />
              )}
            </svg>
            {camera.zoom === 1 && selectedId === initialId && (
              <g fill="#ee0018" stroke="#ee0018" strokeWidth="1.8">
                <path d="M349.97 90.1V119.8H370.5" fill="none" />
                <path d="M369.9 115L381.85 120.27 369.9 125.54Z" />
              </g>
            )}
            <svg
              data-testid="detail-zoom"
              x={inset.x}
              y={inset.y}
              width={inset.width}
              height={inset.height}
              viewBox={`${lens.x} ${lens.y} ${lens.width} ${lens.height}`}
              overflow="hidden"
              preserveAspectRatio="none"
              aria-label={`Magnified region: ${describeNode(selected)}`}
            >
              <rect x={lens.x} y={lens.y} width={lens.width} height={lens.height} fill="#9dcd9b" />
              <PaperGraph selectedId={selectedId} emphasized={focused ? descendants : null} />
            </svg>
            <rect {...inset} fill="none" stroke="#ee0018" strokeWidth="2.65" pointerEvents="none" />
            {reference && (
              <image
                data-testid="paper-reference"
                href="/reference/figure5.png"
                width={figure5.width}
                height={figure5.height}
                preserveAspectRatio="none"
              />
            )}
          </svg>
        </div>
        <div className="figure-footer">
          <div className="selection-controls">
            <button
              aria-label="Previous played position"
              disabled={reference || selectedId === figure5.trunk[0]}
              onClick={() => step(-1)}
            >
              ←
            </button>
            <button
              aria-label="Next played position"
              disabled={reference || selectedId === initialId}
              onClick={() => step(1)}
            >
              →
            </button>
            <span className="selection-label" aria-live="polite">
              {reference ? 'Original · Figure 5' : describeNode(selected)}
            </span>
            {!reference && (
              <span className="selection-count">
                {descendants.size - 1} continuations{mateCount > 0 ? ` · ${mateCount} mates` : ''}
              </span>
            )}
          </div>
          <button
            className={`focus-button${focused ? ' active' : ''}`}
            disabled={reference}
            aria-pressed={focused}
            onClick={() => setFocused(!focused)}
          >
            {focused ? 'Show whole graph' : 'Isolate continuations'}
          </button>
        </div>
      </section>
      <footer className="study-footer">
        <p>
          Select a position or score chart column to magnify.{' '}
          <span>Scroll to zoom · Drag to pan · ← → step through moves</span>
        </p>
        <div className="legend" aria-label="Graph legend">
          <span>
            <i className="legend-circle" />
            Played
          </span>
          <span>
            <i className="legend-square" />
            Alternative
          </span>
          <span>
            <i className="legend-check" />
            Check
          </span>
          <span>
            <i className="legend-mate">♛</i>Mate
          </span>
        </div>
      </footer>
    </main>
  );
}
