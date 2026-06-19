// ============================================================================
// Interference — WebGL2 GLSL ES 3.00 shader sources.
//
// Pipeline (per frame):
//   SIM      ping-pong FDTD step on a float grid (RG16F: r=u_curr, g=u_prev)
//   RENDER   field -> normal -> 3-term metal lighting -> platinum ramp ->
//            physical thin-film -> ACES tonemap -> HDR-ish linear scene
//   BRIGHT   threshold bright-pass to half-res
//   BLUR     separable Gaussian (2 passes)
//   COMPOSE  scene + bloom + chromatic aberration + blue-noise dither +
//            film grain + cool vignette + gamma
//
// Uniform names are the contract with WebGL2Renderer.js.
// ============================================================================

// Fullscreen triangle — no attributes, driven by gl_VertexID. Draw 3 verts.
export const VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ----------------------------------------------------------------------------
// SIM — 2D scalar wave equation, FDTD.
//   u_next = 2u - u_prev + C2 * laplacian(u) - damp*(u - u_prev)
// State texel = vec2(u_curr, u_prev). CFL: C2 = (C*dt/dx)^2 <= 0.5 (2D).
// ----------------------------------------------------------------------------
export const SIM_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outState;

uniform sampler2D uState;
uniform vec2 uResolution;   // grid size in texels
uniform float uTime;        // seconds
uniform float uC2;          // courant^2 (<= 0.5)
uniform float uDamp;        // global damping
uniform vec2 uSrcPos[3];    // source positions in uv (0..1)
uniform float uSrcAmp[3];
uniform float uSrcFreq[3];
uniform float uSrcPhase[3];
uniform vec4 uPointer;      // xy = uv pos, z = amplitude, w = freq

const float TAU = 6.28318530718;
// Converts beat emphasis weights (~0.07–0.2) into a stable per-step drive.
// Single tuning knob: raise for a more energetic field, lower if it saturates.
const float SOURCE_DRIVE = 0.10;

float sampleU(vec2 uv) {
  return texture(uState, uv).r;
}

void main() {
  vec2 texel = 1.0 / uResolution;
  vec2 st = vUv;

  vec2 c = texture(uState, st).rg; // (u_curr, u_prev)
  float u = c.r;
  float uPrev = c.g;

  // 5-point Laplacian
  float l = sampleU(st - vec2(texel.x, 0.0));
  float r = sampleU(st + vec2(texel.x, 0.0));
  float d = sampleU(st - vec2(0.0, texel.y));
  float t = sampleU(st + vec2(0.0, texel.y));
  float lap = (l + r + d + t - 4.0 * u);

  float uNext = 2.0 * u - uPrev + uC2 * lap;
  uNext -= uDamp * (u - uPrev);

  // Absorbing-ish boundary: feather amplitude toward the edges so reflections
  // don't pile up into standing artifacts.
  vec2 edge = min(st, 1.0 - st);
  float border = smoothstep(0.0, 0.06, min(edge.x, edge.y));
  uNext *= mix(0.94, 1.0, border);

  // Continuous sources (Gaussian-localized sinusoids, added to the field rate).
  for (int i = 0; i < 3; i++) {
    float dpx = distance(st, uSrcPos[i]);
    float g = exp(-dpx * dpx / 0.00035);
    uNext += SOURCE_DRIVE * uSrcAmp[i] * sin(TAU * uSrcFreq[i] * uTime + uSrcPhase[i]) * g;
  }

  // Pointer ripple (transient source injected from JS envelope).
  if (uPointer.z > 0.0001) {
    float dpp = distance(st, uPointer.xy);
    float g = exp(-dpp * dpp / 0.0006);
    uNext += SOURCE_DRIVE * uPointer.z * sin(TAU * uPointer.w * uTime) * g;
  }

  // Clamp for numerical safety; NaNs are scrubbed to 0.
  uNext = clamp(uNext, -4.0, 4.0);
  if (!(uNext == uNext)) uNext = 0.0;

  outState = vec4(uNext, u, 0.0, 1.0);
}`;

// ----------------------------------------------------------------------------
// RENDER — the big visual jump. Field height -> lit, colored, tonemapped scene.
// ----------------------------------------------------------------------------
export const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uField;
uniform vec2 uResolution;
uniform float uRelief;      // ~45
uniform float uTime;
uniform float uPeak;        // 0..1 ignition
uniform vec3 uLightDir;
uniform float uExposure;
uniform float uSat;         // thin-film saturation cap (~0.4)
uniform float uMicro;       // micro-detail octave strength (tier-gated 0/1)

const float TAU = 6.28318530718;

// --- sRGB <-> linear ---
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

// --- hash / value noise for domain warp + micro grain ---
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0));
  float c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

float sampleH(vec2 uv) { return texture(uField, uv).r; }

// --- ACES filmic (Narkowicz) ---
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// --- 7-stop platinum ramp, evaluated in LINEAR space ---
vec3 platinum(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = toLinear(vec3(0.024, 0.024, 0.027)); // obsidian
  vec3 c1 = toLinear(vec3(0.078, 0.086, 0.098)); // graphite
  vec3 c2 = toLinear(vec3(0.16, 0.17, 0.19));    // cool steel
  vec3 c3 = toLinear(vec3(0.36, 0.38, 0.41));    // pewter
  vec3 c4 = toLinear(vec3(0.55, 0.57, 0.60));    // brushed pewter
  vec3 c5 = toLinear(vec3(0.78, 0.80, 0.83));    // silver
  vec3 c6 = toLinear(vec3(0.93, 0.95, 0.97));    // silver-white (L~92)
  float s = t * 6.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  if (s < 5.0) return mix(c4, c5, s - 4.0);
  return mix(c5, c6, s - 5.0);
}

// --- physical-ish thin film: cosine spectrum indexed by Fresnel * thickness ---
vec3 thinFilm(float thickness, float fresnel) {
  float phase = thickness * 9.0 + fresnel * 2.5;
  vec3 spec = 0.5 + 0.5 * cos(TAU * (vec3(1.0, 0.97, 0.92) * phase + vec3(0.0, 0.33, 0.66)));
  // spectral envelope: reds fall off faster on exit angle than blues.
  vec3 env = vec3(1.0 - 0.35 * fresnel, 1.0 - 0.12 * fresnel, 1.0);
  return spec * env;
}

void main() {
  vec2 texel = 1.0 / uResolution;

  // domain warp the sample point so flow looks molten, not gridded (~low cost)
  vec2 warp = vec2(
    fbm(vUv * 6.0 + uTime * 0.03),
    fbm(vUv * 6.0 - uTime * 0.025 + 11.7)
  ) - 0.5;
  vec2 uv = vUv + warp * 0.012;

  float h = sampleH(uv);

  // normal from finite differences, relief carried by lighting (not bump)
  float hx = sampleH(uv + vec2(texel.x, 0.0)) - sampleH(uv - vec2(texel.x, 0.0));
  float hy = sampleH(uv + vec2(0.0, texel.y)) - sampleH(uv - vec2(0.0, texel.y));

  // optional high-freq micro-detail (brushed-metal grain) — tier-gated
  float micro = (fbm(uv * 220.0) - 0.5) * 0.06 * uMicro;
  vec3 N = normalize(vec3(-(hx * uRelief + micro), -(hy * uRelief + micro), 1.0));

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);

  // (1) wide soft ambient floor — blacks keep depth
  float ambient = 0.12 + 0.06 * (N.z);

  // (2) anisotropic specular streak: stretch the half-vector in x (~4:1) so the
  //     highlight reads as a swept liquid sheet, not a round dot.
  vec3 Ha = normalize(H * vec3(0.25, 1.0, 1.0));
  float spec = pow(max(dot(N, Ha), 0.0), 90.0);

  // (3) Fresnel rim — lifts only steep wave shoulders
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);

  float diff = max(dot(N, L), 0.0);

  // luminance basis for the ramp: ambient + diffuse, height-biased
  float lum = ambient + 0.7 * diff + 0.35 * fres + 0.15 * (h * 0.5 + 0.5);
  lum = clamp(lum, 0.0, 1.0);

  vec3 col = platinum(lum);

  // thin-film iridescence — born of interference (amplitude + Fresnel driven)
  float thickness = clamp(abs(h) * 1.3 + fres * 0.4, 0.0, 1.0);
  vec3 film = thinFilm(thickness, fres);
  float filmMix = uSat * smoothstep(0.05, 0.6, thickness);
  col = mix(col, col * (0.5 + film), filmMix);

  // specular sweep + constructive peak get reserved pure white as an *event*
  float ignite = spec * (0.6 + 0.8 * uPeak) + uPeak * smoothstep(0.7, 1.0, lum) * 0.6;
  col += vec3(ignite);

  // exposure (peak-driven) then ACES
  col *= uExposure * (0.85 + 0.4 * uPeak);
  col = aces(col);

  outColor = vec4(col, 1.0);
}`;

// ----------------------------------------------------------------------------
// BRIGHT — threshold bright-pass (run at half res into RGBA16F).
// ----------------------------------------------------------------------------
export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uThreshold;   // ~0.82
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - uThreshold, 0.0) / max(1.0 - uThreshold, 1e-3);
  outColor = vec4(c * k, 1.0);
}`;

// ----------------------------------------------------------------------------
// BLUR — separable Gaussian (9-tap). uDir = (texel,0) then (0,texel).
// ----------------------------------------------------------------------------
export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  float w[5];
  w[0] = 0.227027; w[1] = 0.194595; w[2] = 0.121622; w[3] = 0.054054; w[4] = 0.016216;
  vec3 c = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    c += texture(uTex, vUv + o).rgb * w[i];
    c += texture(uTex, vUv - o).rgb * w[i];
  }
  outColor = vec4(c, 1.0);
}`;

// ----------------------------------------------------------------------------
// COMPOSE — final assembly to the default framebuffer.
// ----------------------------------------------------------------------------
export const COMPOSE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBlueNoise;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBloomStrength;   // 0 when bloom tier-gated off
uniform float uAberration;      // px at edges, 0 on low tier
uniform float uVignette;
uniform float uGrain;
uniform float uUseBlueNoise;    // 1 blue-noise, 0 bayer fallback

// 4x4 Bayer fallback
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0;m[1]=8.0;m[2]=2.0;m[3]=10.0;
  m[4]=12.0;m[5]=4.0;m[6]=14.0;m[7]=6.0;
  m[8]=3.0;m[9]=11.0;m[10]=1.0;m[11]=9.0;
  m[12]=15.0;m[13]=7.0;m[14]=13.0;m[15]=5.0;
  return (m[i] + 0.5) / 16.0 - 0.5;
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;

  // radial chromatic aberration (desktop/high tier only)
  vec3 scene;
  if (uAberration > 0.0001) {
    vec2 off = fromCenter * (uAberration / uResolution.x) * length(fromCenter) * 2.0;
    scene.r = texture(uScene, uv + off).r;
    scene.g = texture(uScene, uv).g;
    scene.b = texture(uScene, uv - off).b;
  } else {
    scene = texture(uScene, uv).rgb;
  }

  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 col = scene + bloom * uBloomStrength;

  // cool-cast vignette toward edge color
  float vig = smoothstep(0.9, 0.2, length(fromCenter));
  vec3 edgeCol = vec3(0.020, 0.020, 0.027); // ~#050507
  col = mix(edgeCol, col, mix(1.0 - uVignette, 1.0, vig));

  // film grain over the dark gradient
  float g = (hash(uv * uResolution + uTime) - 0.5) * uGrain;
  col += g;

  // gamma
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));

  // dither to break 8-bit banding
  float d;
  if (uUseBlueNoise > 0.5) {
    d = texture(uBlueNoise, gl_FragCoord.xy / 64.0).r - 0.5;
  } else {
    d = bayer(gl_FragCoord.xy);
  }
  col += d / 255.0;

  outColor = vec4(col, 1.0);
}`;
