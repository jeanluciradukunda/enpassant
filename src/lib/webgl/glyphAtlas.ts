import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three';

/** White glyphs on transparent: the ten Georgia digits used for move numbers
 * and the mate crown. Sprites tint them per instance. Built once per page. */
export interface Glyph {
  /** Atlas rectangle in texture coordinates (v grows downward; flipY is off). */
  uv: [number, number, number, number];
  /** Cell size in atlas pixels. */
  width: number;
  height: number;
  /** Horizontal pen advance in atlas pixels (digits only). */
  advance: number;
  /** Cell-local pen origin: glyphs are drawn from x = padding on the baseline. */
  originX: number;
  baseline: number;
}

export interface GlyphAtlas {
  texture: CanvasTexture;
  glyphs: Map<string, Glyph>;
  /** Digit em size in atlas pixels. */
  em: number;
  crown: Glyph;
  /** Atlas pixels per graph unit for the crown cell. */
  crownScale: number;
}

const CROWN_PATH =
  'M-.55-4.4H.55V-3.3H1.65V-2.3H.55V-1.4C2.7-3 4-1.2 2.5.4L1.9 1.5H-1.9L-2.5.4C-4-1.2-2.7-3-.55-1.4V-2.3H-1.65V-3.3H-.55ZM-2 2H2V2.9H-2Z';
const CELL_W = 128;
const CELL_H = 160;
const COLUMNS = 4;
const SIZE = 512;
const EM = 128;
const PADDING = 12;
const BASELINE = 118;
const CROWN_SCALE = 14;

let atlas: GlyphAtlas | undefined;

export function glyphAtlas(): GlyphAtlas {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#fff';
  ctx.font = `${EM}px Georgia, serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const glyphs = new Map<string, Glyph>();
  const cell = (index: number): Glyph => {
    const x = (index % COLUMNS) * CELL_W;
    const y = Math.floor(index / COLUMNS) * CELL_H;
    return {
      uv: [x / SIZE, y / SIZE, (x + CELL_W) / SIZE, (y + CELL_H) / SIZE],
      width: CELL_W,
      height: CELL_H,
      advance: 0,
      originX: PADDING,
      baseline: BASELINE,
    };
  };
  for (let digit = 0; digit < 10; digit++) {
    const glyph = cell(digit);
    const x = (digit % COLUMNS) * CELL_W;
    const y = Math.floor(digit / COLUMNS) * CELL_H;
    glyph.advance = ctx.measureText(String(digit)).width;
    ctx.fillText(String(digit), x + PADDING, y + BASELINE);
    glyphs.set(String(digit), glyph);
  }
  const crown = cell(10);
  {
    const x = (10 % COLUMNS) * CELL_W + CELL_W / 2;
    const y = Math.floor(10 / COLUMNS) * CELL_H + CELL_H / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(CROWN_SCALE, CROWN_SCALE);
    ctx.fill(new Path2D(CROWN_PATH));
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = NoColorSpace;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  atlas = { texture, glyphs, em: EM, crown, crownScale: CROWN_SCALE };
  return atlas;
}
