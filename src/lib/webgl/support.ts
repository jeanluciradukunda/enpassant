let cached: boolean | undefined;

/** One WebGL2 probe per page. The SVG marks remain the fallback renderer. */
export function supportsWebGL2(): boolean {
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined')
    return (cached = false);
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}

export type RendererMode = 'webgl' | 'svg';

/** WebGL in the browser; the SVG marks only for server rendering or when WebGL2 is missing. */
export function preferredRenderer(): RendererMode {
  if (import.meta.env.SSR) return 'svg';
  return supportsWebGL2() ? 'webgl' : 'svg';
}
