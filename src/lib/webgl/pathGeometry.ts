/** CPU-side stroke geometry for the WebGL edge renderer. Everything here is
 * pure so it can be unit-tested without a GL context. World coordinates are
 * graph units; widths are the SVG stroke widths the marks use today. */
export type Point = [number, number];

/** Parse the subset of SVG path syntax the layout emits (absolute M, C, L) and
 * flatten every cubic into a polyline. Returns one polyline per subpath. */
export function flattenPath(d: string, maxSegments = 24): Point[][] {
  const polylines: Point[][] = [];
  let current: Point[] = [];
  const tokens = d.match(/[MCLmcl]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let command = '';
  const number = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[MCLmcl]$/.test(token)) {
      command = token.toUpperCase();
      i++;
      continue;
    }
    if (command === 'M') {
      if (current.length) polylines.push(current);
      current = [[number(), number()]];
      command = 'L';
    } else if (command === 'L') {
      current.push([number(), number()]);
    } else if (command === 'C') {
      const [x0, y0] = current[current.length - 1] ?? [0, 0];
      const x1 = number(),
        y1 = number(),
        x2 = number(),
        y2 = number(),
        x3 = number(),
        y3 = number();
      const chord = Math.hypot(x3 - x0, y3 - y0);
      const segments = Math.max(6, Math.min(maxSegments, Math.ceil(chord / 2)));
      for (let k = 1; k <= segments; k++) {
        const t = k / segments;
        const u = 1 - t;
        current.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
    } else {
      i++;
    }
  }
  if (current.length) polylines.push(current);
  return polylines.map(dedupe);
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) out.push(p);
  }
  return out;
}

export interface StrokeStrip {
  /** Interleaved x, y per vertex; two vertices per polyline point. */
  positions: Float32Array;
  /** Arc length from the path start, per vertex. */
  distances: Float32Array;
  /** Triangle list into `positions`. */
  indices: Uint32Array;
  length: number;
}

/** Offset a polyline by ±halfWidth along miter normals. Miters are capped at
 * twice the half width so hairpins never shoot off. */
export function strokeStrip(points: Point[], halfWidth: number): StrokeStrip {
  const n = points.length;
  if (n < 2)
    return {
      positions: new Float32Array(),
      distances: new Float32Array(),
      indices: new Uint32Array(),
      length: 0,
    };
  const positions = new Float32Array(n * 4);
  const distances = new Float32Array(n * 2);
  const indices = new Uint32Array((n - 1) * 6);
  const dirs: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const len = Math.hypot(dx, dy) || 1;
    dirs.push([dx / len, dy / len]);
  }
  let length = 0;
  for (let i = 0; i < n; i++) {
    const before = dirs[Math.max(0, i - 1)];
    const after = dirs[Math.min(n - 2, i)];
    let tx = before[0] + after[0];
    let ty = before[1] + after[1];
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) {
      tx = after[0];
      ty = after[1];
    } else {
      tx /= tl;
      ty /= tl;
    }
    const nx = -ty;
    const ny = tx;
    // Segment normal of the outgoing segment; the miter grows as the turn sharpens.
    const cos = Math.max(0.5, nx * -after[1] + ny * after[0]);
    const scale = halfWidth / cos;
    if (i > 0)
      length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    positions[i * 4] = points[i][0] + nx * scale;
    positions[i * 4 + 1] = points[i][1] + ny * scale;
    positions[i * 4 + 2] = points[i][0] - nx * scale;
    positions[i * 4 + 3] = points[i][1] - ny * scale;
    distances[i * 2] = length;
    distances[i * 2 + 1] = length;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  return { positions, distances, indices, length };
}

/** Triangle matching the SVG marker (viewBox 0 0 6 6 drawn at 4.5 units,
 * refX at the tip): tip on the path end, base `length` back along the tangent. */
export function arrowhead(points: Point[], length = 4.5, halfWidth = 2.25): Point[] | null {
  if (points.length < 2) return null;
  const tip = points[points.length - 1];
  let j = points.length - 2;
  while (j > 0 && Math.hypot(tip[0] - points[j][0], tip[1] - points[j][1]) < 1e-3) j--;
  const dx = tip[0] - points[j][0];
  const dy = tip[1] - points[j][1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const tx = dx / len;
  const ty = dy / len;
  const bx = tip[0] - tx * length;
  const by = tip[1] - ty * length;
  return [
    tip,
    [bx - ty * halfWidth, by + tx * halfWidth],
    [bx + ty * halfWidth, by - tx * halfWidth],
  ];
}

/** Cumulative "on" length of a dash pattern up to arc length x. */
function onLength(x: number, on: number, period: number) {
  const k = Math.floor(x / period);
  return k * on + Math.min(on, Math.max(0, x - k * period));
}

/** Fraction of the footprint [s − half, s + half] covered by dashes. Mirrors the
 * fragment shader so the anti-aliased dash rule is testable on the CPU. */
export function dashCoverage(s: number, half: number, on: number, period: number) {
  if (!(period > 0)) return 1;
  const width = Math.max(2 * half, 1e-4);
  return (onLength(s + width / 2, on, period) - onLength(s - width / 2, on, period)) / width;
}

/** Parse an SVG `stroke-dasharray` with one on/off pair into shader parameters. */
export function dashPattern(dasharray?: string): [on: number, period: number] {
  if (!dasharray) return [0, 0];
  const [on, off] = dasharray
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!(on > 0)) return [0, 0];
  return [on, on + (off || on)];
}

/** Shorten a polyline from its end so the stroke stops where the arrowhead
 * begins. The SVG marker covers that stretch anyway; leaving it out avoids a
 * darker overlap when an edge is drawn translucently. */
export function trimEnd(points: Point[], amount: number): Point[] {
  if (points.length < 2 || amount <= 0) return points;
  let remaining = amount;
  const out = points.slice();
  while (out.length >= 2) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > remaining) {
      const t = (len - remaining) / len;
      out[out.length - 1] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return out;
    }
    remaining -= len;
    out.pop();
  }
  return points.slice(0, 1);
}
