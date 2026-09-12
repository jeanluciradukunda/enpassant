import { useCallback, useMemo, useRef, useState } from 'react';
import { EvolutionCanvas } from './EvolutionCanvas';
import { EvolutionMarks, type MarksProps } from './EvolutionMarks';
import { buildScene, type GraphScene } from '../lib/graphScene';
import { preferredRenderer, type RendererMode } from '../lib/webgl/support';
import { lensViewBox, viewBoxAttribute } from '../lib/webgl/viewBox';

/** Magnified view around the selected position: a second camera on the same
 * scene. Falls back to the static SVG marks without WebGL2. */
export function DetailLens(props: MarksProps) {
  const { graph, cursor, overview, exploringPly, selected, isolated, checkMode } = props;
  const [mode, setMode] = useState<RendererMode>(() => preferredRenderer());
  const fallback = useCallback(() => setMode('svg'), []);
  const viewBox = useMemo(() => lensViewBox(selected), [selected]);
  const previousScene = useRef<GraphScene | undefined>(undefined);
  const scene = useMemo(() => {
    const next = buildScene(
      { graph, cursor, overview, exploringPly, selected, isolated, checkMode },
      previousScene.current,
    );
    previousScene.current = next;
    return next;
  }, [graph, cursor, overview, exploringPly, selected, isolated, checkMode]);
  if (mode === 'svg')
    return (
      <svg data-testid="live-detail" viewBox={viewBoxAttribute(viewBox)} className="live-detail">
        <EvolutionMarks {...props} detail />
      </svg>
    );
  return (
    <EvolutionCanvas
      scene={scene}
      viewBox={viewBox}
      replaying={false}
      className="live-detail"
      testId="live-detail"
      onFallback={fallback}
    />
  );
}
