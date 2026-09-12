import {
  BufferAttribute,
  BufferGeometry,
  ColorManagement,
  DoubleSide,
  DynamicDrawUsage,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { diagramStyle as style } from '../diagramStyle';
import type { GraphScene } from '../graphScene';
import { parseColor, type Rgb } from './color';
import { glyphAtlas } from './glyphAtlas';
import {
  arrowhead,
  dashPattern,
  flattenPath,
  strokeStrip,
  trimEnd,
  type Point,
  type StrokeStrip,
} from './pathGeometry';
import {
  REVEAL_MS,
  UNFOLD_MS,
  edgeFragment,
  edgeVertex,
  nodeFragment,
  nodeVertex,
  spriteFragment,
  spriteVertex,
} from './shaders';
import { viewBoxToOrtho, type ViewBox } from './viewBox';

// Flat sRGB values in, the same values out: the SVG marks blend in sRGB too.
ColorManagement.enabled = false;

export interface UpdateOptions {
  /** Growing replay: edges fade in when they first appear, like the CSS rule. */
  replaying: boolean;
  reducedMotion: boolean;
}

const ARROW_LENGTH = 4.5;
const ARROW_HALF = 2.25;
const LABEL_SIZE = 8.7;
const LABEL_BASELINE = 2.8;
const DIM = 0.1;
const NO_ANIMATION = -1;

const unitQuad = () => {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;
  return geometry;
};

/** Preallocated per-instance attributes; grows by half when exceeded so the
 * old GL buffers are freed through `dispose` rather than leaked. */
class InstanceBuffers {
  geometry = unitQuad();
  capacity = 0;
  readonly arrays = new Map<string, Float32Array>();
  private readonly attributes = new Map<string, InstancedBufferAttribute>();
  constructor(private readonly layout: Record<string, number>) {}
  reserve(count: number) {
    if (count <= this.capacity) return false;
    const capacity = Math.max(64, Math.ceil(count * 1.5));
    this.geometry.dispose();
    this.geometry = unitQuad();
    for (const [name, size] of Object.entries(this.layout)) {
      const array = new Float32Array(capacity * size);
      const attribute = new InstancedBufferAttribute(array, size);
      attribute.setUsage(DynamicDrawUsage);
      this.geometry.setAttribute(name, attribute);
      this.arrays.set(name, array);
      this.attributes.set(name, attribute);
    }
    this.capacity = capacity;
    return true;
  }
  commit(count: number) {
    for (const attribute of this.attributes.values()) attribute.needsUpdate = true;
    this.geometry.instanceCount = count;
  }
  dispose() {
    this.geometry.dispose();
  }
}

class EdgeBuffers {
  geometry = new BufferGeometry();
  vertexCapacity = 0;
  indexCapacity = 0;
  readonly arrays = new Map<string, Float32Array>();
  index = new Uint32Array();
  private readonly attributes: BufferAttribute[] = [];
  private readonly layout: Record<string, number> = {
    position: 3,
    aDist: 1,
    aColor: 4,
    aDash: 2,
    aBorn: 1,
  };
  reserve(vertices: number, indices: number) {
    if (vertices <= this.vertexCapacity && indices <= this.indexCapacity) return false;
    this.vertexCapacity = Math.max(256, Math.ceil(vertices * 1.5));
    this.indexCapacity = Math.max(512, Math.ceil(indices * 1.5));
    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.attributes.length = 0;
    for (const [name, size] of Object.entries(this.layout)) {
      const array = new Float32Array(this.vertexCapacity * size);
      const attribute = new BufferAttribute(array, size);
      attribute.setUsage(DynamicDrawUsage);
      this.geometry.setAttribute(name, attribute);
      this.arrays.set(name, array);
      this.attributes.push(attribute);
    }
    this.index = new Uint32Array(this.indexCapacity);
    const index = new BufferAttribute(this.index, 1);
    index.setUsage(DynamicDrawUsage);
    this.geometry.setIndex(index);
    this.attributes.push(index);
    this.geometry.setDrawRange(0, 0);
    return true;
  }
  commit(indices: number) {
    for (const attribute of this.attributes) attribute.needsUpdate = true;
    this.geometry.setDrawRange(0, indices);
  }
  dispose() {
    this.geometry.dispose();
  }
}

const material = (
  vertexShader: string,
  fragmentShader: string,
  uniforms: ShaderMaterial['uniforms'],
) =>
  new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });

/** Draws one `GraphScene` with three.js: edges as one anti-aliased stroke
 * mesh, glyphs as SDF-shaded instanced quads, digits and crowns as atlas
 * sprites. The camera is a uniform, so panning and zooming never touch
 * geometry. Rendering is on demand; a frame loop runs only while animating. */
export class GraphRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, -10, 10);
  private readonly edges = new EdgeBuffers();
  private readonly nodes = new InstanceBuffers({
    iCenter: 2,
    iHalf: 1,
    iShape: 1,
    iFill: 4,
    iStroke: 4,
    iStrokeWidth: 1,
    iAlpha: 1,
    iOrigin: 2,
    iBorn: 1,
  });
  private readonly sprites = new InstanceBuffers({
    iCenter: 2,
    iSize: 2,
    iUv: 4,
    iColor: 4,
    iOrigin: 2,
    iBorn: 1,
  });
  private readonly edgeMesh: Mesh;
  private readonly nodeMesh: Mesh;
  private readonly spriteMesh: Mesh;
  private readonly uTime = { value: 0 };
  private readonly uPixel = { value: 1 };
  private readonly epoch = performance.now();
  private readonly firstSeen = new Map<string, number>();
  private readonly unfoldSeen = new Map<string, number>();
  private animatingUntil = 0;
  private frame: number | null = null;
  private viewBox: ViewBox | null = null;
  private size = { width: 0, height: 0 };
  private disposed = false;
  private readonly onRestored = () => this.requestFrame();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.sortObjects = false;
    this.renderer.setClearColor(Number.parseInt(style.green.slice(1), 16), 1);
    const atlas = glyphAtlas();
    this.edgeMesh = new Mesh(
      this.edges.geometry,
      material(edgeVertex, edgeFragment, { uTime: this.uTime }),
    );
    this.nodeMesh = new Mesh(
      this.nodes.geometry,
      material(nodeVertex, nodeFragment, { uTime: this.uTime, uPixel: this.uPixel }),
    );
    this.spriteMesh = new Mesh(
      this.sprites.geometry,
      material(spriteVertex, spriteFragment, {
        uTime: this.uTime,
        uAtlas: { value: atlas.texture },
      }),
    );
    for (const [order, mesh] of [this.edgeMesh, this.nodeMesh, this.spriteMesh].entries()) {
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.scene.add(mesh);
    }
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  setSize(width: number, height: number, pixelRatio = 1) {
    if (this.disposed) return;
    this.size = { width, height };
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.applyCamera();
  }

  setViewBox(viewBox: ViewBox) {
    this.viewBox = viewBox;
    this.applyCamera();
  }

  private applyCamera() {
    if (!this.viewBox) return;
    const bounds = viewBoxToOrtho(this.size, this.viewBox);
    this.camera.left = bounds.left;
    this.camera.right = bounds.right;
    this.camera.top = bounds.top;
    this.camera.bottom = bounds.bottom;
    this.camera.updateProjectionMatrix();
    this.uPixel.value = bounds.unitsPerPixel;
  }

  private now() {
    return performance.now() - this.epoch;
  }

  update(scene: GraphScene, { replaying, reducedMotion }: UpdateOptions) {
    if (this.disposed) return;
    const now = this.now();
    this.animatingUntil = 0;
    const animated = (start: number, duration: number) => {
      this.animatingUntil = Math.max(this.animatingUntil, start + duration);
      return start;
    };
    // Edge reveal follows the CSS rule: it runs when an edge first matches in
    // replay mode, and every edge matches again when replay mode is entered.
    if (replaying) {
      const present = new Set<string>();
      for (const { edge } of scene.edges) {
        present.add(edge.id);
        if (!this.firstSeen.has(edge.id)) this.firstSeen.set(edge.id, now);
      }
      for (const id of this.firstSeen.keys()) if (!present.has(id)) this.firstSeen.delete(id);
    } else this.firstSeen.clear();
    const unfolding = new Set<string>();
    for (const vertex of scene.vertices)
      if (vertex.origin) {
        unfolding.add(vertex.node.id);
        if (!this.unfoldSeen.has(vertex.node.id)) this.unfoldSeen.set(vertex.node.id, now);
      }
    for (const id of this.unfoldSeen.keys()) if (!unfolding.has(id)) this.unfoldSeen.delete(id);

    this.buildEdges(scene, (id) =>
      replaying && !reducedMotion ? animated(this.firstSeen.get(id)!, REVEAL_MS) : NO_ANIMATION,
    );
    this.buildGlyphs(scene, (id) =>
      !reducedMotion && this.unfoldSeen.has(id)
        ? animated(this.unfoldSeen.get(id)!, UNFOLD_MS)
        : NO_ANIMATION,
    );
  }

  /** Flattened strokes per scene edge. `buildScene` keeps unchanged edges
   * referentially stable, so a replay step only flattens what appeared. */
  private readonly strokes = new WeakMap<
    GraphScene['edges'][number],
    { strip: StrokeStrip | null; arrow: Point[] | null }[]
  >();

  private strokesFor(item: GraphScene['edges'][number]) {
    let pieces = this.strokes.get(item);
    if (pieces) return pieces;
    pieces = [];
    for (const polyline of flattenPath(item.edge.d)) {
      if (polyline.length < 2) continue;
      const arrow = arrowhead(polyline, ARROW_LENGTH, ARROW_HALF);
      const body = arrow ? trimEnd(polyline, ARROW_LENGTH) : polyline;
      pieces.push({ strip: body.length >= 2 ? strokeStrip(body, item.width / 2) : null, arrow });
    }
    this.strokes.set(item, pieces);
    return pieces;
  }

  private buildEdges(scene: GraphScene, born: (edgeId: string) => number) {
    const position: number[] = [];
    const dist: number[] = [];
    const color: number[] = [];
    const dash: number[] = [];
    const bornAt: number[] = [];
    const index: number[] = [];
    const ink = parseColor(style.ink);
    for (const item of scene.edges) {
      const alpha = item.dim ? DIM : 1;
      const [on, period] = dashPattern(item.dash);
      const start = born(item.edge.id);
      for (const { strip, arrow } of this.strokesFor(item)) {
        if (strip) {
          const base = position.length / 3;
          for (let i = 0; i < strip.distances.length; i++) {
            position.push(strip.positions[2 * i], strip.positions[2 * i + 1], 0);
            dist.push(strip.distances[i]);
            color.push(ink[0], ink[1], ink[2], alpha);
            dash.push(on, period);
            bornAt.push(start);
          }
          for (const i of strip.indices) index.push(base + i);
        }
        if (arrow) {
          const base = position.length / 3;
          for (const [x, y] of arrow) {
            position.push(x, y, 0);
            dist.push(0);
            color.push(ink[0], ink[1], ink[2], alpha);
            dash.push(0, 0);
            bornAt.push(start);
          }
          index.push(base, base + 1, base + 2);
        }
      }
    }
    if (this.edges.reserve(position.length / 3, index.length))
      this.edgeMesh.geometry = this.edges.geometry;
    this.edges.arrays.get('position')!.set(position);
    this.edges.arrays.get('aDist')!.set(dist);
    this.edges.arrays.get('aColor')!.set(color);
    this.edges.arrays.get('aDash')!.set(dash);
    this.edges.arrays.get('aBorn')!.set(bornAt);
    this.edges.index.set(index);
    this.edges.commit(index.length);
  }

  private buildGlyphs(scene: GraphScene, born: (nodeId: string) => number) {
    const atlas = glyphAtlas();
    const node = {
      iCenter: [] as number[],
      iHalf: [] as number[],
      iShape: [] as number[],
      iFill: [] as number[],
      iStroke: [] as number[],
      iStrokeWidth: [] as number[],
      iAlpha: [] as number[],
      iOrigin: [] as number[],
      iBorn: [] as number[],
    };
    const sprite = {
      iCenter: [] as number[],
      iSize: [] as number[],
      iUv: [] as number[],
      iColor: [] as number[],
      iOrigin: [] as number[],
      iBorn: [] as number[],
    };
    const glyph = (
      x: number,
      y: number,
      half: number,
      shape: 0 | 1,
      fill: Rgb,
      fillAlpha: number,
      stroke: Rgb,
      strokeWidth: number,
      alpha: number,
      origin: { x: number; y: number },
      start: number,
    ) => {
      node.iCenter.push(x, y);
      node.iHalf.push(half);
      node.iShape.push(shape);
      node.iFill.push(fill[0], fill[1], fill[2], fillAlpha);
      node.iStroke.push(stroke[0], stroke[1], stroke[2], 1);
      node.iStrokeWidth.push(strokeWidth);
      node.iAlpha.push(alpha);
      node.iOrigin.push(origin.x, origin.y);
      node.iBorn.push(start);
    };
    const selection = parseColor(style.selection);
    const red = parseColor(style.red);
    const none: Rgb = [0, 0, 0];
    if (scene.selectedHidden)
      glyph(
        scene.selected.x,
        scene.selected.y,
        4,
        0,
        none,
        0,
        selection,
        1,
        1,
        scene.selected,
        NO_ANIMATION,
      );
    const rings: (() => void)[] = [];
    const scale = LABEL_SIZE / atlas.em;
    for (const vertex of scene.vertices) {
      const { node: n } = vertex;
      const alpha = vertex.lit ? 1 : DIM;
      const origin = vertex.origin ?? n;
      const start = born(n.id);
      const shift = { x: origin.x - n.x, y: origin.y - n.y };
      glyph(
        n.x,
        n.y,
        vertex.played ? style.circleRadius : style.squareSide / 2,
        vertex.played ? 0 : 1,
        parseColor(vertex.fill),
        1,
        parseColor(vertex.stroke),
        vertex.strokeWidth,
        alpha,
        origin,
        start,
      );
      const stamp = (
        cx: number,
        cy: number,
        hw: number,
        hh: number,
        uv: readonly number[],
        tint: Rgb,
      ) => {
        sprite.iCenter.push(cx, cy);
        sprite.iSize.push(hw, hh);
        sprite.iUv.push(uv[0], uv[1], uv[2], uv[3]);
        sprite.iColor.push(tint[0], tint[1], tint[2], alpha);
        sprite.iOrigin.push(cx + shift.x, cy + shift.y);
        sprite.iBorn.push(start);
      };
      if (vertex.label && vertex.labelColor) {
        const chars = [...vertex.label].map((c) => atlas.glyphs.get(c)).filter((g) => !!g);
        const total = chars.reduce((sum, g) => sum + g.advance * scale, 0);
        let pen = n.x - total / 2;
        const baseline = n.y + LABEL_BASELINE;
        const tint = parseColor(vertex.labelColor);
        for (const g of chars) {
          const left = pen - g.originX * scale;
          const top = baseline - g.baseline * scale;
          const w = g.width * scale;
          const h = g.height * scale;
          stamp(left + w / 2, top + h / 2, w / 2, h / 2, g.uv, tint);
          pen += g.advance * scale;
        }
      }
      if (n.mate)
        stamp(
          n.x,
          n.y,
          atlas.crown.width / 2 / atlas.crownScale,
          atlas.crown.height / 2 / atlas.crownScale,
          atlas.crown.uv,
          red,
        );
      if (vertex.selected)
        rings.push(() =>
          glyph(n.x, n.y, vertex.played ? 10 : 6, 0, none, 0, selection, 1, alpha, origin, start),
        );
    }
    for (const ring of rings) ring();
    const nodeCount = node.iHalf.length;
    if (this.nodes.reserve(nodeCount)) this.nodeMesh.geometry = this.nodes.geometry;
    for (const [name, values] of Object.entries(node)) this.nodes.arrays.get(name)!.set(values);
    this.nodes.commit(nodeCount);
    const spriteCount = sprite.iBorn.length;
    if (this.sprites.reserve(spriteCount)) this.spriteMesh.geometry = this.sprites.geometry;
    for (const [name, values] of Object.entries(sprite)) this.sprites.arrays.get(name)!.set(values);
    this.sprites.commit(spriteCount);
  }

  requestFrame() {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  /** Draw immediately; schedules more frames while an animation is running. */
  render() {
    if (this.disposed || !this.viewBox || !this.size.width || !this.size.height) return;
    this.uTime.value = this.now();
    this.renderer.render(this.scene, this.camera);
    if (this.uTime.value < this.animatingUntil) this.requestFrame();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.edges.dispose();
    this.nodes.dispose();
    this.sprites.dispose();
    for (const mesh of [this.edgeMesh, this.nodeMesh, this.spriteMesh])
      (mesh.material as ShaderMaterial).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
