/** Hex colours from `diagramStyle` as raw 0–1 components. No gamma conversion:
 * the renderer disables three's colour management so pixels match the SVG. */
export type Rgb = [number, number, number];

const cache = new Map<string, Rgb>();

export function parseColor(hex: string): Rgb {
  const cached = cache.get(hex);
  if (cached) return cached;
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3)
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  const int = Number.parseInt(value.slice(0, 6), 16);
  const rgb: Rgb = Number.isNaN(int)
    ? [0, 0, 0]
    : [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  cache.set(hex, rgb);
  return rgb;
}
