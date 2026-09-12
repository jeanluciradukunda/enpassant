import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GraphScene } from '../lib/graphScene';
import type { GraphRenderer } from '../lib/webgl/GraphRenderer';
import type { ViewBox } from '../lib/webgl/viewBox';

interface Props {
  scene: GraphScene;
  viewBox: ViewBox;
  /** Growing replay: newly revealed edges fade in. */
  replaying: boolean;
  className: string;
  testId?: string;
  /** WebGL could not start: the parent switches to the SVG marks. */
  onFallback: () => void;
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A canvas driven by `GraphRenderer`. three.js is loaded on demand so the
 * server-side renderer and the SVG fallback never pay for it. */
export function EvolutionCanvas({
  scene,
  viewBox,
  replaying,
  className,
  testId,
  onFallback,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GraphRenderer | null>(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let instance: GraphRenderer | null = null;
    let observer: ResizeObserver | null = null;
    import('../lib/webgl/GraphRenderer').then(
      ({ GraphRenderer }) => {
        const element = canvas.current;
        if (cancelled || !element) return;
        try {
          instance = new GraphRenderer(element);
        } catch (error) {
          console.warn('WebGL renderer unavailable, using SVG marks.', error);
          onFallback();
          return;
        }
        renderer.current = instance;
        const resize = (width: number, height: number) => {
          instance?.setSize(width, height, window.devicePixelRatio || 1);
          instance?.render();
        };
        observer = new ResizeObserver((entries) => {
          const box = entries[0]?.contentBoxSize?.[0];
          if (box) resize(box.inlineSize, box.blockSize);
          else resize(element.clientWidth, element.clientHeight);
        });
        observer.observe(element);
        resize(element.clientWidth, element.clientHeight);
        setReady((n) => n + 1);
      },
      (error: unknown) => {
        if (cancelled) return;
        console.warn('WebGL renderer failed to load, using SVG marks.', error);
        onFallback();
      },
    );
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.dispose();
      renderer.current = null;
    };
  }, [onFallback]);
  useLayoutEffect(() => {
    if (!renderer.current) return;
    renderer.current.update(scene, { replaying, reducedMotion: reducedMotion() });
    renderer.current.render();
  }, [scene, replaying, ready]);
  useLayoutEffect(() => {
    if (!renderer.current) return;
    renderer.current.setViewBox(viewBox);
    renderer.current.render();
  }, [viewBox, ready]);
  return <canvas ref={canvas} className={className} data-testid={testId} aria-hidden="true" />;
}
