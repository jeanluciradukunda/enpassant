import { expect, it } from 'vitest';
import {
  arrowhead,
  dashCoverage,
  dashPattern,
  flattenPath,
  strokeStrip,
} from '../src/lib/webgl/pathGeometry';
import { cameraViewBox, viewBoxAttribute, viewBoxToOrtho } from '../src/lib/webgl/viewBox';

it('flattens the M/C/L paths the layout emits and keeps their endpoints', () => {
  const [line] = flattenPath('M10,20C30,20 30,60 50,60 L70.5,60');
  expect(line[0]).toEqual([10, 20]);
  expect(line[line.length - 1]).toEqual([70.5, 60]);
  expect(line.length).toBeGreaterThan(8);
  const [straight] = flattenPath('M0,0C10,0 20,0 30,0');
  for (const [, y] of straight) expect(y).toBeCloseTo(0, 9);
  expect(flattenPath('M1,1L2,2M5,5L6,6')).toHaveLength(2);
  expect(flattenPath('M-.5,-4.4L.5,-3.3')[0]).toEqual([
    [-0.5, -4.4],
    [0.5, -3.3],
  ]);
});

it('builds a two-vertex-per-point stroke strip with monotone arc length', () => {
  const points = flattenPath('M0,0C20,0 20,40 40,40')[0];
  const strip = strokeStrip(points, 1.5);
  expect(strip.positions.length).toBe(points.length * 4);
  expect(strip.indices.length).toBe((points.length - 1) * 6);
  for (let i = 2; i < strip.distances.length; i += 2)
    expect(strip.distances[i]).toBeGreaterThan(strip.distances[i - 2]);
  expect(strip.length).toBeGreaterThan(Math.hypot(40, 40));
  // Straight horizontal line: offsets are exactly ±halfWidth in y.
  const flat = strokeStrip(
    [
      [0, 0],
      [10, 0],
    ],
    2,
  );
  expect(Array.from(flat.positions)).toEqual([0, 2, 0, -2, 10, 2, 10, -2]);
  // A hairpin never blows up beyond the miter cap.
  const hairpin = strokeStrip(
    [
      [0, 0],
      [10, 0],
      [0, 0.01],
    ],
    1,
  );
  for (const value of hairpin.positions) expect(Math.abs(value)).toBeLessThan(13);
});

it('points the arrowhead along the final segment with the tip on the path end', () => {
  const arrow = arrowhead([
    [0, 0],
    [10, 0],
    [10, 0],
  ])!;
  expect(arrow[0]).toEqual([10, 0]);
  expect(arrow[1][0]).toBeCloseTo(5.5);
  expect(arrow[2][0]).toBeCloseTo(5.5);
  expect(Math.abs(arrow[1][1])).toBeCloseTo(2.25);
  expect(arrowhead([[0, 0]])).toBeNull();
});

it('computes analytic dash coverage and parses dasharrays', () => {
  expect(dashPattern('0.2345 1.1725')).toEqual([0.2345, 1.407]);
  expect(dashPattern('4 2')).toEqual([4, 6]);
  expect(dashPattern(undefined)).toEqual([0, 0]);
  expect(dashCoverage(1, 0.01, 4, 6)).toBeCloseTo(1, 9);
  expect(dashCoverage(5, 0.01, 4, 6)).toBeCloseTo(0, 9);
  expect(dashCoverage(7.3, 5, 0.2345, 1.407)).toBeCloseTo(0.2345 / 1.407, 2);
  expect(dashCoverage(3, 0.5, 0, 0)).toBe(1);
});

it('maps a viewBox onto a box exactly like xMidYMid meet', () => {
  const exact = viewBoxToOrtho({ width: 200, height: 100 }, { x: 5, y: 7, width: 20, height: 10 });
  expect(exact).toEqual({ left: 5, right: 25, top: 7, bottom: 17, unitsPerPixel: 0.1 });
  const wide = viewBoxToOrtho({ width: 400, height: 100 }, { x: 0, y: 0, width: 20, height: 10 });
  expect(wide.top).toBe(0);
  expect(wide.bottom).toBe(10);
  expect(wide.left).toBe(-10);
  expect(wide.right).toBe(30);
  const tall = viewBoxToOrtho({ width: 100, height: 400 }, { x: 0, y: 0, width: 20, height: 10 });
  expect(tall.left).toBe(0);
  expect(tall.right).toBe(20);
  expect(tall.top).toBe(-35);
  expect(tall.bottom).toBe(45);
  const degenerate = viewBoxToOrtho({ width: 0, height: 0 }, { x: 1, y: 2, width: 3, height: 4 });
  expect(degenerate.right).toBe(4);
  const viewBox = cameraViewBox({ x: 3, y: 4, zoom: 2 }, { width: 800, height: 600 });
  expect(viewBoxAttribute(viewBox)).toBe('3 4 400 300');
});

it('trims the stroke end by the arrow length and parses colours', async () => {
  const { trimEnd } = await import('../src/lib/webgl/pathGeometry');
  const { parseColor } = await import('../src/lib/webgl/color');
  expect(
    trimEnd(
      [
        [0, 0],
        [10, 0],
        [10, 3],
      ],
      4.5,
    ),
  ).toEqual([
    [0, 0],
    [8.5, 0],
  ]);
  expect(trimEnd([[0, 0]], 4.5)).toEqual([[0, 0]]);
  expect(parseColor('#fff')).toEqual([1, 1, 1]);
  expect(parseColor('#9dcd9b')).toEqual([157 / 255, 205 / 255, 155 / 255]);
  expect(parseColor('#000')).toEqual([0, 0, 0]);
});
