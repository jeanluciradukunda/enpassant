/** The SVG overlay and the WebGL canvas must agree to the pixel. Both derive
 * their mapping from one `viewBox`; the browser applies
 * `preserveAspectRatio="xMidYMid meet"` to the overlay, and this module applies
 * the same rule to the orthographic camera. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrthoBounds {
  left: number;
  right: number;
  /** Smallest visible world y (graph space grows downward). */
  top: number;
  bottom: number;
  /** World units covered by one CSS pixel. */
  unitsPerPixel: number;
}

export function viewBoxToOrtho(
  box: { width: number; height: number },
  viewBox: ViewBox,
): OrthoBounds {
  if (!(box.width > 0) || !(box.height > 0) || !(viewBox.width > 0) || !(viewBox.height > 0))
    return {
      left: viewBox.x,
      right: viewBox.x + viewBox.width,
      top: viewBox.y,
      bottom: viewBox.y + viewBox.height,
      unitsPerPixel: 1,
    };
  const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
  const visibleWidth = box.width / scale;
  const visibleHeight = box.height / scale;
  const left = viewBox.x - (visibleWidth - viewBox.width) / 2;
  const top = viewBox.y - (visibleHeight - viewBox.height) / 2;
  return {
    left,
    right: left + visibleWidth,
    top,
    bottom: top + visibleHeight,
    unitsPerPixel: 1 / scale,
  };
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const cameraViewBox = (
  camera: Camera,
  graph: { width: number; height: number },
): ViewBox => ({
  x: camera.x,
  y: camera.y,
  width: graph.width / camera.zoom,
  height: graph.height / camera.zoom,
});

export const viewBoxAttribute = (viewBox: ViewBox) =>
  `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

/** The detail lens shows 170 × 140 graph units centred on the selection; the
 * main diagram outlines the same rectangle. */
export const LENS = { width: 170, height: 140 };
export const lensViewBox = (selected: { x: number; y: number }): ViewBox => ({
  x: selected.x - LENS.width / 2,
  y: selected.y - LENS.height / 2,
  width: LENS.width,
  height: LENS.height,
});
