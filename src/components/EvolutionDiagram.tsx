import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EvolutionCanvas } from './EvolutionCanvas';
import { EvolutionMarks } from './EvolutionMarks';
import type { MarksProps } from './EvolutionMarks';
import { HitMarks } from './HitMarks';
import { buildScene, type GraphScene } from '../lib/graphScene';
import { moveLabel, scoreLabel } from '../lib/games';
import { scoreBands } from '../lib/scoreBands';
import { preferredRenderer, type RendererMode } from '../lib/webgl/support';
import { cameraViewBox, lensViewBox, viewBoxAttribute, type Camera } from '../lib/webgl/viewBox';
import type { Analysis, EvolutionGraph, EvolutionNode, Game } from '../types/game';

export { EvolutionMarks as GraphMarks } from './EvolutionMarks';
interface Props extends MarksProps {
  game: Game;
  analysis: Map<string, Analysis>;
}
// Warm the three.js chunk while the engine is still analysing.
if (!import.meta.env.SSR && typeof WebGL2RenderingContext !== 'undefined')
  void import('../lib/webgl/GraphRenderer').catch(() => {});

export function EvolutionDiagram(props: Props) {
  const {
    graph,
    game,
    analysis,
    cursor,
    overview,
    exploringPly,
    selected,
    isolated,
    checkMode,
    onSelect,
    onUnfold,
  } = props;
  const [mode, setMode] = useState<RendererMode>(() => preferredRenderer());
  const fallback = useCallback(() => setMode('svg'), []);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null);
  const zoom = (factor: number) =>
    setCamera((c) => {
      const z = Math.max(0.15, Math.min(8, c.zoom * factor));
      return z === 1
        ? { x: 0, y: 0, zoom: 1 }
        : {
            x: c.x + (graph.width / 2) * (1 / c.zoom - 1 / z),
            y: c.y + (graph.height / 2) * (1 / c.zoom - 1 / z),
            zoom: z,
          };
    });
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const rx = (event.clientX - bounds.left) / bounds.width;
      const ry = (event.clientY - bounds.top) / bounds.height;
      setCamera((c) => {
        const z = Math.max(0.15, Math.min(8, c.zoom * Math.exp(-event.deltaY * 0.002)));
        return z === 1
          ? { x: 0, y: 0, zoom: 1 }
          : {
              x: c.x + rx * graph.width * (1 / c.zoom - 1 / z),
              y: c.y + ry * graph.height * (1 / c.zoom - 1 / z),
              zoom: z,
            };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [graph.width, graph.height, mode]);
  const count = overview ? game.positions.length - 1 : cursor;
  const searchedRoots = [...analysis.values()].filter((result) => result.lines.length).length;
  const extent = useMemo(
    () => ({
      minY: Math.min(0, ...graph.nodes.map((n) => n.y - 16)),
      maxY: Math.max(graph.height, ...graph.nodes.map((n) => n.y + 16)),
      maxX: Math.max(graph.width, ...graph.nodes.map((n) => n.x + 25)),
    }),
    [graph],
  );
  const viewBox = useMemo(() => cameraViewBox(camera, graph), [camera, graph]);
  const previousScene = useRef<GraphScene | undefined>(undefined);
  const scene = useMemo(() => {
    const next = buildScene(
      { graph, cursor, overview, exploringPly, selected, isolated, checkMode },
      previousScene.current,
    );
    previousScene.current = next;
    return next;
  }, [graph, cursor, overview, exploringPly, selected, isolated, checkMode]);
  const lens = lensViewBox(selected);
  const pointerHandlers = {
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
      if ((event.target as Element).closest('[data-position],.compressed-target')) return;
      drag.current = { x: event.clientX, y: event.clientY, camera };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drag.current) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const start = drag.current;
      setCamera({
        ...start.camera,
        x:
          start.camera.x -
          (((event.clientX - start.x) / bounds.width) * graph.width) / start.camera.zoom,
        y:
          start.camera.y -
          (((event.clientY - start.y) / bounds.height) * graph.height) / start.camera.zoom,
      });
    },
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onLostPointerCapture: () => {
      drag.current = null;
    },
  };
  const region = graph.ready && (
    <rect
      data-testid="live-detail-region"
      {...lens}
      stroke="#ee001b"
      strokeWidth="2"
      strokeDasharray="6 4"
      fill="none"
      pointerEvents="none"
    />
  );
  return (
    <div className="evolution-diagram" data-renderer={mode}>
      <div className="diagram-tools">
        <span className="eyebrow">
          CHESS EVOLUTION{' '}
          <span className="muted">
            / {graph.ready ? `${graph.vertices.length} junctions & events` : 'PREPARING THE MAP'}
          </span>
        </span>
        <div className="tool-buttons">
          <button
            aria-label="Zoom out"
            disabled={camera.zoom <= 0.15}
            onClick={() => zoom(1 / 1.4)}
          >
            −
          </button>
          <output aria-label="Diagram zoom">{Math.round(camera.zoom * 100)}%</output>
          <button aria-label="Zoom in" disabled={camera.zoom === 8} onClick={() => zoom(1.4)}>
            +
          </button>
          <button
            onClick={() =>
              setCamera({
                x: 0,
                y: extent.minY,
                zoom: Math.min(
                  1,
                  graph.width / extent.maxX,
                  graph.height / (extent.maxY - extent.minY),
                ),
              })
            }
          >
            Fit graph
          </button>
        </div>
      </div>
      {mode === 'webgl' ? (
        <div
          className="live-graph-stage"
          style={{ aspectRatio: `${graph.width} / ${graph.height}` }}
        >
          <EvolutionCanvas
            scene={scene}
            viewBox={viewBox}
            replaying={!overview}
            className="live-graph-canvas"
            onFallback={fallback}
          />
          <svg
            ref={svg}
            data-testid="evolution-graph"
            data-replay={!overview}
            className="live-graph live-graph-overlay"
            viewBox={viewBoxAttribute(viewBox)}
            aria-label="Interactive game evolution diagram"
            role="group"
            tabIndex={0}
            {...pointerHandlers}
          >
            <HitMarks scene={scene} byId={graph.byId} onSelect={onSelect} onUnfold={onUnfold} />
            {region}
          </svg>
        </div>
      ) : (
        <svg
          ref={svg}
          data-testid="evolution-graph"
          data-replay={!overview}
          className="live-graph"
          style={{ height: 'auto', aspectRatio: `${graph.width} / ${graph.height}` }}
          viewBox={viewBoxAttribute(viewBox)}
          aria-label="Interactive game evolution diagram"
          role="group"
          tabIndex={0}
          {...pointerHandlers}
        >
          <EvolutionMarks {...props} />
          {region}
        </svg>
      )}
      <div className="score-caption">
        <span className="eyebrow">ACTUAL & POTENTIAL ADVANTAGE</span>
        <span>White / Black · Log scale · ±10 pawns · ▲ mate</span>
      </div>
      <svg
        data-testid="live-score-chart"
        className="live-chart paper-score-bands"
        style={{ height: 'auto', aspectRatio: `${graph.width} / 180` }}
        viewBox={`${camera.x} 0 ${graph.width / camera.zoom} 180`}
        preserveAspectRatio="none"
        role="group"
        aria-label="Actual scores and potential ranges for White and Black"
      >
        <ScoreChart
          graph={graph}
          game={game}
          analysis={analysis}
          count={count}
          onSelect={onSelect}
        />
      </svg>
      <div className="map-note">
        {graph.ready
          ? `${searchedRoots} searched roots${analysis.size > searchedRoots ? ` · ${analysis.size - searchedRoots} terminal positions` : ''} · ${graph.stats.positions.toLocaleString()} reconstructed positions · ${graph.stats.merged} occurrences share glyphs · ${graph.stats.shortened} positions folded`
          : 'Analyzing candidate lines, then arranging the map. Replay stays available.'}
      </div>
    </div>
  );
}

interface ChartProps {
  graph: EvolutionGraph;
  game: Game;
  analysis: Map<string, Analysis>;
  count: number;
  onSelect: (node: EvolutionNode) => void;
}

/** Chart contents are independent of the camera; only the parent's viewBox pans. */
const ScoreChart = memo(function ScoreChart({
  graph,
  game,
  analysis,
  count,
  onSelect,
}: ChartProps) {
  const bands = scoreBands(game, analysis, count);
  const x = (id: string) => graph.byId.get(id)!.x;
  return (
    <>
      <line
        x1="0"
        x2={graph.width}
        y1="83"
        y2="83"
        stroke="#fff"
        strokeOpacity=".55"
        strokeWidth=".7"
      />
      {bands.map(({ side, segments }) => {
        const runs: (typeof segments)[] = [];
        let current: typeof segments = [];
        for (const point of segments) {
          if (!point) {
            if (current.length) runs.push(current);
            current = [];
          } else current.push(point);
        }
        if (current.length) runs.push(current);
        return (
          <g key={side} data-score-side={side}>
            {runs.map((run, i) => {
              const pts = run.filter((p) => p !== null);
              return (
                <path
                  key={i}
                  data-score-band={side}
                  d={`${pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.pos.id)},${p.high}`).join(' ')} ${[
                    ...pts,
                  ]
                    .reverse()
                    .map((p) => `L${x(p.pos.id)},${p.low}`)
                    .join(' ')}Z`}
                  fill={side === 'w' ? '#fff' : '#000'}
                  fillOpacity=".498"
                  stroke="none"
                />
              );
            })}
            {segments
              .filter((p) => p !== null)
              .map((p) => (
                <g key={p.pos.id} fill={side === 'w' ? '#fff' : '#000'}>
                  {p.actual.type === 'mate' && (
                    <path
                      data-score-mate
                      d={`M${x(p.pos.id)},${p.y - 3}l-2.6,4.5h5.2Z`}
                      fill="#ed001b"
                    >
                      <title>{scoreLabel(p.actual)}</title>
                    </path>
                  )}
                  <circle
                    cx={x(p.pos.id)}
                    cy={p.y}
                    r="1.6"
                    fill="none"
                    stroke={side === 'w' ? '#fff' : '#000'}
                    strokeWidth=".6"
                  >
                    <title>
                      {`${scoreLabel(p.actual)} · depth ${p.depth} · played candidate at the preceding search root`}
                    </title>
                  </circle>
                  <text
                    x={x(p.pos.id)}
                    y={p.y - 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontFamily="Georgia,serif"
                  >
                    {p.pos.turn === 'b' ? p.pos.moveNumber : p.pos.moveNumber - 1}
                  </text>
                </g>
              ))}
          </g>
        );
      })}
      {game.positions.slice(0, count + 1).map((pos, i) => {
        const cx = x(pos.id);
        const before = i ? x(game.positions[i - 1].id) : cx - 22;
        const after = game.positions[i + 1] ? x(game.positions[i + 1].id) : cx + 22;
        const half = Math.min(cx - before, after - cx) / 2;
        return (
          <g
            key={pos.id}
            data-score-ply={pos.ply}
            role="button"
            tabIndex={-1}
            aria-label={`${moveLabel(pos)}, ${scoreLabel(analysis.get(pos.id)?.lines[0]?.score)}`}
            onClick={() => onSelect(graph.byId.get(pos.id)!)}
          >
            <rect
              x={cx - half}
              y="0"
              width={2 * half}
              height="175"
              fill="transparent"
              className="score-hit"
            />
          </g>
        );
      })}
    </>
  );
});
