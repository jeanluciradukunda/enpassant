// GLSL ES 3.00. three.js prepends its uniforms (projectionMatrix,
// modelViewMatrix) and the `position` attribute for ShaderMaterial, but not a
// fragment output, so each fragment shader declares `fragColor` itself.

export const REVEAL_MS = 180;
export const UNFOLD_MS = 260;

export const edgeVertex = /* glsl */ `
in float aDist;
in vec4 aColor;
in vec2 aDash;
in float aBorn;
out float vDist;
out vec4 vColor;
out vec2 vDash;
out float vBorn;
void main() {
  vDist = aDist;
  vColor = aColor;
  vDash = aDash;
  vBorn = aBorn;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const edgeFragment = /* glsl */ `
out vec4 fragColor;
uniform float uTime;
in float vDist;
in vec4 vColor;
in vec2 vDash;
in float vBorn;
float onLength(float x, float on, float period) {
  float k = floor(x / period);
  return k * on + clamp(x - k * period, 0.0, on);
}
void main() {
  float alpha = vColor.a;
  if (vDash.y > 0.0) {
    // Exact coverage of this pixel's arc-length footprint by the dash pattern:
    // sub-pixel dashes turn into the right grey instead of aliasing.
    float fw = max(fwidth(vDist), 1e-4);
    alpha *= (onLength(vDist + 0.5 * fw, vDash.x, vDash.y) - onLength(vDist - 0.5 * fw, vDash.x, vDash.y)) / fw;
  }
  if (vBorn >= 0.0) alpha *= clamp((uTime - vBorn) / ${REVEAL_MS}.0, 0.0, 1.0);
  fragColor = vec4(vColor.rgb, alpha);
}
`;

const unfold = /* glsl */ `
  float t = iBorn < 0.0 ? 1.0 : clamp((uTime - iBorn) / ${UNFOLD_MS}.0, 0.0, 1.0);
  float eased = 1.0 - (1.0 - t) * (1.0 - t);
  vec2 center = mix(iOrigin, iCenter, eased);
  float fade = mix(0.25, 1.0, t);
`;

export const nodeVertex = /* glsl */ `
uniform float uTime;
uniform float uPixel;
in vec2 iCenter;
in float iHalf;
in float iShape;
in vec4 iFill;
in vec4 iStroke;
in float iStrokeWidth;
in float iAlpha;
in vec2 iOrigin;
in float iBorn;
out vec2 vLocal;
out float vHalf;
out float vShape;
out vec4 vFill;
out vec4 vStroke;
out float vStrokeWidth;
out float vAlpha;
void main() {
  ${unfold}
  float extent = iHalf + 0.5 * iStrokeWidth + uPixel;
  vLocal = position.xy * extent;
  vHalf = iHalf;
  vShape = iShape;
  vFill = iFill;
  vStroke = iStroke;
  vStrokeWidth = iStrokeWidth;
  vAlpha = iAlpha * fade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + vLocal, 0.0, 1.0);
}
`;

export const nodeFragment = /* glsl */ `
out vec4 fragColor;
in vec2 vLocal;
in float vHalf;
in float vShape;
in vec4 vFill;
in vec4 vStroke;
in float vStrokeWidth;
in float vAlpha;
void main() {
  // Signed distance to the glyph boundary; the SVG stroke is centred on it.
  float d = vShape < 0.5 ? length(vLocal) - vHalf : max(abs(vLocal.x), abs(vLocal.y)) - vHalf;
  float aa = 0.5 * max(fwidth(d), 1e-4);
  float hw = 0.5 * vStrokeWidth;
  float band = smoothstep(-hw - aa, -hw + aa, d);
  float inside = 1.0 - smoothstep(hw - aa, hw + aa, d);
  vec4 color = mix(vFill, vStroke, band);
  fragColor = vec4(color.rgb, color.a * inside * vAlpha);
}
`;

export const spriteVertex = /* glsl */ `
uniform float uTime;
in vec2 iCenter;
in vec2 iSize;
in vec4 iUv;
in vec4 iColor;
in vec2 iOrigin;
in float iBorn;
out vec2 vUv;
out vec4 vColor;
void main() {
  ${unfold}
  vec2 corner = position.xy;
  vUv = mix(iUv.xy, iUv.zw, corner * 0.5 + 0.5);
  vColor = vec4(iColor.rgb, iColor.a * fade);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + corner * iSize, 0.0, 1.0);
}
`;

export const spriteFragment = /* glsl */ `
out vec4 fragColor;
uniform sampler2D uAtlas;
in vec2 vUv;
in vec4 vColor;
void main() {
  fragColor = vec4(vColor.rgb, vColor.a * texture(uAtlas, vUv).a);
}
`;
