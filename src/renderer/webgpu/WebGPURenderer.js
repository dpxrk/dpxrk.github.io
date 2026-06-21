// ============================================================================
// WebGPURenderer — WGSL compute FDTD + multi-pass render, at parity with the
// WebGL2 backend (scene → bright → blur → compose, tier-scaled grid, bloom,
// thin-film, ACES, dither, vignette, grain, chromatic aberration).
//
// GATED + opt-in (?gpu=1); selectBackend() falls back to WebGL2 on ANY failure.
//
// ⚠ ORIENTATION / VALIDATION: WebGPU rendering cannot be validated headlessly.
// The scene pass samples the field with a Y-flipped uv (`fuv`) to match the
// WebGL2 (GL bottom-up) convention; render-target round-trips use plain uv so
// writes/reads stay consistent. Verify on a real device with ?gpu=1 — if the
// field looks vertically mirrored vs WebGL2, flip `fuv.y` in fsScene.
//
// NOTE: uniform structs use explicit scalar pads (no vec3f) so the JS byte
// layout below matches WGSL std140 alignment exactly. (The previous SimU used a
// vec3f pad, which silently mis-aligned the source array.)
// ============================================================================
import { Renderer } from "../Renderer.js";

// Mirror WebGL2 TIERS: grid resolution, substeps, and which effects are live.
const TIERS = [
  { grid: 384, substeps: 1, bloom: 0.0, aberration: 0.0, micro: 0.0 },
  { grid: 640, substeps: 2, bloom: 0.9, aberration: 0.0, micro: 0.0 },
  { grid: 1024, substeps: 2, bloom: 1.0, aberration: 0.6, micro: 1.0 },
];

// ---- WGSL: FDTD compute step ----------------------------------------------
const SIM_WGSL = /* wgsl */ `
struct SimU {
  res: vec2f,
  time: f32,
  c2: f32,
  damp: f32,
  _p0: f32, _p1: f32, _p2: f32,   // pad src to 16-byte boundary (offset 32)
  src: array<vec4f, 3>,           // (posX, posY, amp, freq)
  phase: vec4f,                   // (p0, p1, p2, _)
  pointer: vec4f,                 // (x, y, amp, freq)
};
@group(0) @binding(0) var<uniform> u: SimU;
@group(0) @binding(1) var stateIn: texture_2d<f32>;
@group(0) @binding(2) var stateOut: texture_storage_2d<rgba16float, write>;

const TAU = 6.28318530718;
const SOURCE_DRIVE = 0.10;

fn loadU(p: vec2i) -> f32 {
  let n = vec2i(i32(u.res.x), i32(u.res.y));
  let q = clamp(p, vec2i(0), n - vec2i(1));
  return textureLoad(stateIn, q, 0).r;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n = vec2i(i32(u.res.x), i32(u.res.y));
  let p = vec2i(gid.xy);
  if (p.x >= n.x || p.y >= n.y) { return; }

  let c = textureLoad(stateIn, p, 0).rg;
  let cur = c.r;
  let prev = c.g;

  let lap = loadU(p + vec2i(-1, 0)) + loadU(p + vec2i(1, 0)) +
            loadU(p + vec2i(0, -1)) + loadU(p + vec2i(0, 1)) - 4.0 * cur;

  var next = 2.0 * cur - prev + u.c2 * lap;
  next -= u.damp * (cur - prev);

  let st = (vec2f(p) + 0.5) / u.res;
  let edge = min(st, vec2f(1.0) - st);
  let border = smoothstep(0.0, 0.06, min(edge.x, edge.y));
  next *= mix(0.94, 1.0, border);

  for (var i = 0; i < 3; i = i + 1) {
    let s = u.src[i];
    let dpx = distance(st, s.xy);
    let g = exp(-dpx * dpx / 0.00035);
    next += SOURCE_DRIVE * s.z * sin(TAU * s.w * u.time + u.phase[i]) * g;
  }
  if (u.pointer.z > 0.0001) {
    let dpp = distance(st, u.pointer.xy);
    let g = exp(-dpp * dpp / 0.0006);
    next += SOURCE_DRIVE * u.pointer.z * sin(TAU * u.pointer.w * u.time) * g;
  }

  next = clamp(next, -4.0, 4.0);
  // NaN/Inf scrub (comparisons are false for NaN) — matches WebGL2 safety.
  if (!(next >= -4.0 && next <= 4.0)) { next = 0.0; }
  textureStore(stateOut, p, vec4f(next, cur, 0.0, 1.0));
}`;

// ---- WGSL shared: fullscreen-triangle VS ----------------------------------
const VS_WGSL = /* wgsl */ `
struct VSOut { @builtin(position) pos: vec4f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  return o;
}
fn hash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 345.45));
  q += dot(q, q + 34.345);
  return fract(q.x * q.y);
}`;

// ---- WGSL: scene (lit/colored field → HDR) --------------------------------
const SCENE_WGSL = VS_WGSL + /* wgsl */ `
struct RenderU {
  res: vec2f,
  grid: vec2f,
  time: f32, peak: f32, relief: f32, exposure: f32,
  sat: f32, micro: f32, _p0: f32, _p1: f32,
  light: vec4f,
};
@group(0) @binding(0) var<uniform> u: RenderU;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

const TAU = 6.28318530718;
fn toLinear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); var f = fract(p); f = f * f * (3.0 - 2.0 * f);
  let a = hash(i); let b = hash(i + vec2f(1, 0));
  let c = hash(i + vec2f(0, 1)); let d = hash(i + vec2f(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn fbm(p0: vec2f) -> f32 {
  var v = 0.0; var a = 0.5; var p = p0;
  for (var i = 0; i < 3; i = i + 1) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
fn platinum(t0: f32) -> vec3f {
  let t = clamp(t0, 0.0, 1.0);
  let c0 = toLinear(vec3f(0.024, 0.024, 0.027));
  let c1 = toLinear(vec3f(0.078, 0.086, 0.098));
  let c2 = toLinear(vec3f(0.16, 0.17, 0.19));
  let c3 = toLinear(vec3f(0.36, 0.38, 0.41));
  let c4 = toLinear(vec3f(0.55, 0.57, 0.60));
  let c5 = toLinear(vec3f(0.78, 0.80, 0.83));
  let c6 = toLinear(vec3f(0.93, 0.95, 0.97));
  let s = t * 6.0;
  if (s < 1.0) { return mix(c0, c1, s); }
  if (s < 2.0) { return mix(c1, c2, s - 1.0); }
  if (s < 3.0) { return mix(c2, c3, s - 2.0); }
  if (s < 4.0) { return mix(c3, c4, s - 3.0); }
  if (s < 5.0) { return mix(c4, c5, s - 4.0); }
  return mix(c5, c6, s - 5.0);
}
fn thinFilm(thickness: f32, fresnel: f32) -> vec3f {
  let phase = thickness * 9.0 + fresnel * 2.5;
  let spec = 0.5 + 0.5 * cos(TAU * (vec3f(1.0, 0.97, 0.92) * phase + vec3f(0.0, 0.33, 0.66)));
  let env = vec3f(1.0 - 0.35 * fresnel, 1.0 - 0.12 * fresnel, 1.0);
  return spec * env;
}
fn sampleH(uv: vec2f) -> f32 { return textureSampleLevel(field, samp, uv, 0.0).r; }

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let scr = pos.xy / u.res;                  // top-down framebuffer uv
  let baseUv = vec2f(scr.x, 1.0 - scr.y);    // GL-convention (match WebGL2). Flip here if mirrored.
  let texel = 1.0 / u.grid;

  let warp = vec2f(fbm(baseUv * 6.0 + u.time * 0.03), fbm(baseUv * 6.0 - u.time * 0.025 + 11.7)) - 0.5;
  let uv = baseUv + warp * 0.012;

  let h = sampleH(uv);
  let hx = sampleH(uv + vec2f(texel.x, 0.0)) - sampleH(uv - vec2f(texel.x, 0.0));
  let hy = sampleH(uv + vec2f(0.0, texel.y)) - sampleH(uv - vec2f(0.0, texel.y));
  let micro = (fbm(uv * 220.0) - 0.5) * 0.06 * u.micro;
  let N = normalize(vec3f(-(hx * u.relief + micro), -(hy * u.relief + micro), 1.0));

  let V = vec3f(0.0, 0.0, 1.0);
  let L = normalize(u.light.xyz);
  let H = normalize(L + V);

  let ambient = 0.12 + 0.06 * N.z;
  let Ha = normalize(H * vec3f(0.25, 1.0, 1.0));
  let spec = pow(max(dot(N, Ha), 0.0), 90.0);
  let fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  let diff = max(dot(N, L), 0.0);

  var lum = ambient + 0.7 * diff + 0.35 * fres + 0.15 * (h * 0.5 + 0.5);
  lum = clamp(lum, 0.0, 1.0);

  var col = platinum(lum);
  let thickness = clamp(abs(h) * 1.3 + fres * 0.4, 0.0, 1.0);
  let film = thinFilm(thickness, fres);
  let filmMix = u.sat * smoothstep(0.3, 0.85, thickness);   // disciplined: color toward peaks
  col = mix(col, col * (0.5 + film), filmMix);

  let ignite = spec * (0.6 + 0.8 * u.peak) + u.peak * smoothstep(0.7, 1.0, lum) * 0.6;
  col += vec3f(ignite);

  col *= u.exposure * (0.85 + 0.4 * u.peak);
  col = aces(col);
  return vec4f(col, 1.0);                     // HDR scene; post happens in compose
}`;

// ---- WGSL: bright-pass ----------------------------------------------------
const BRIGHT_WGSL = VS_WGSL + /* wgsl */ `
struct BrightU { res: vec2f, threshold: f32, _p: f32 };
@group(0) @binding(0) var<uniform> u: BrightU;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.res;
  let c = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  let k = max(l - u.threshold, 0.0) / max(1.0 - u.threshold, 1e-3);
  return vec4f(c * k, 1.0);
}`;

// ---- WGSL: separable blur -------------------------------------------------
const BLUR_WGSL = VS_WGSL + /* wgsl */ `
struct BlurU { res: vec2f, dir: vec2f };
@group(0) @binding(0) var<uniform> u: BlurU;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.res;
  var w = array<f32, 5>(0.227027, 0.194595, 0.121622, 0.054054, 0.016216);
  var c = textureSampleLevel(tex, samp, uv, 0.0).rgb * w[0];
  for (var i = 1; i < 5; i = i + 1) {
    let o = u.dir * f32(i);
    c += textureSampleLevel(tex, samp, uv + o, 0.0).rgb * w[i];
    c += textureSampleLevel(tex, samp, uv - o, 0.0).rgb * w[i];
  }
  return vec4f(c, 1.0);
}`;

// ---- WGSL: compose to canvas ----------------------------------------------
// Canvas uses a non-sRGB format (getPreferredCanvasFormat returns *unorm, not
// *unorm-srgb), so the manual gamma below is correct — no double-gamma.
const COMPOSE_WGSL = VS_WGSL + /* wgsl */ `
struct ComposeU {
  res: vec2f, time: f32, bloom: f32,
  aberration: f32, vignette: f32, grain: f32, _p: f32,
};
@group(0) @binding(0) var<uniform> u: ComposeU;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.res;
  let fromCenter = uv - 0.5;

  var scene3: vec3f;
  if (u.aberration > 0.0001) {
    let off = fromCenter * (u.aberration / u.res.x) * length(fromCenter);
    scene3 = vec3f(
      textureSampleLevel(scene, samp, uv + off, 0.0).r,
      textureSampleLevel(scene, samp, uv, 0.0).g,
      textureSampleLevel(scene, samp, uv - off, 0.0).b);
  } else {
    scene3 = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  }

  let bloom = textureSampleLevel(bloomTex, samp, uv, 0.0).rgb;
  var col = scene3 + bloom * u.bloom;

  let vig = smoothstep(0.9, 0.2, length(fromCenter));
  col = mix(vec3f(0.020, 0.020, 0.027), col, mix(1.0 - u.vignette, 1.0, vig));

  col += (hash(uv * u.res + u.time) - 0.5) * u.grain;
  col = pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2));
  col += (hash(floor(pos.xy)) - 0.5) / 255.0;     // centered dither, breaks banding
  return vec4f(col, 1.0);
}`;

export class WebGPURenderer extends Renderer {
  get backend() {
    return "WebGPU";
  }

  async init(canvas) {
    if (!navigator.gpu) throw new Error("navigator.gpu unavailable");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("WebGPU adapter unavailable (platform/CSP?)");
    const device = await adapter.requestDevice();
    this.device = device;
    this.canvas = canvas;
    this.tier = 2;
    this.cfg = TIERS[2];
    this.grid = this.cfg.grid;
    this.viewW = canvas.width;
    this.viewH = canvas.height;

    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("no webgpu context");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });

    // uniform buffers (stable; views/bind groups rebuild on tier/resize)
    const UNI = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.simU = device.createBuffer({ size: 112, usage: UNI });
    this.renderU = device.createBuffer({ size: 64, usage: UNI });
    this.brightU = device.createBuffer({ size: 16, usage: UNI });
    this.blurUH = device.createBuffer({ size: 16, usage: UNI });
    this.blurUV = device.createBuffer({ size: 16, usage: UNI });
    this.composeU = device.createBuffer({ size: 32, usage: UNI });

    this.sampler = device.createSampler({
      magFilter: "linear", minFilter: "linear",
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
    });

    // pipelines
    const HDR = "rgba16float";
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    this.simPipeline = device.createComputePipeline({
      layout: "auto", compute: { module: simMod, entryPoint: "main" },
    });
    const mk = (code, target) => {
      const m = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: "auto",
        vertex: { module: m, entryPoint: "vs" },
        fragment: { module: m, entryPoint: "fs", targets: [{ format: target }] },
        primitive: { topology: "triangle-list" },
      });
    };
    this.scenePipeline = mk(SCENE_WGSL, HDR);
    this.brightPipeline = mk(BRIGHT_WGSL, HDR);
    this.blurPipeline = mk(BLUR_WGSL, HDR);
    this.composePipeline = mk(COMPOSE_WGSL, this.format);

    this._allocSim();
    this._allocScene();
    this._buildSimBinds();
    this._buildSceneBinds();
  }

  // ---- sim textures (grid-sized; reallocated on tier change) ----
  _allocSim() {
    const device = this.device;
    const g = this.grid;
    const usage =
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    this.simTex?.forEach((t) => t.destroy());
    this.simTex = [0, 1].map(() => device.createTexture({ size: [g, g], format: "rgba16float", usage }));
    this.simView = this.simTex.map((t) => t.createView());
    this.simSrc = 0;
  }

  // ---- scene + bloom targets (viewport-sized; reallocated on resize) ----
  _allocScene() {
    const device = this.device;
    const w = Math.max(1, this.viewW | 0);
    const h = Math.max(1, this.viewH | 0);
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.sceneTex?.destroy();
    this.sceneTex = device.createTexture({ size: [w, h], format: "rgba16float", usage });
    this.sceneView = this.sceneTex.createView();

    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    this.bloomW = bw; this.bloomH = bh;
    this.bloomTex?.forEach((t) => t.destroy());
    this.bloomTex = [0, 1].map(() => device.createTexture({ size: [bw, bh], format: "rgba16float", usage }));
    this.bloomView = this.bloomTex.map((t) => t.createView());

    // clear bloom[0] once so tier-0 compose (bloomStrength 0) never reads NaN*0.
    const enc = device.createCommandEncoder();
    for (const v of this.bloomView) {
      enc.beginRenderPass({
        colorAttachments: [{ view: v, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
      }).end();
    }
    device.queue.submit([enc.finish()]);

    // static post uniforms that depend on bloom size
    this._writeU(this.brightU, [bw, bh, 0.82, 0]);
    this._writeU(this.blurUH, [bw, bh, 1 / bw, 0]);
    this._writeU(this.blurUV, [bw, bh, 0, 1 / bh]);
  }

  _buildSimBinds() {
    const device = this.device;
    this.simBind = [0, 1].map((src) =>
      device.createBindGroup({
        layout: this.simPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simU } },
          { binding: 1, resource: this.simView[src] },
          { binding: 2, resource: this.simView[1 - src] },
        ],
      })
    );
    this.sceneBind = [0, 1].map((src) =>
      device.createBindGroup({
        layout: this.scenePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.renderU } },
          { binding: 1, resource: this.simView[src] },
          { binding: 2, resource: this.sampler },
        ],
      })
    );
  }

  _buildSceneBinds() {
    const device = this.device;
    this.brightBind = device.createBindGroup({
      layout: this.brightPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.brightU } },
        { binding: 1, resource: this.sceneView },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.blurBindH = device.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.blurUH } },
        { binding: 1, resource: this.bloomView[0] },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.blurBindV = device.createBindGroup({
      layout: this.blurPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.blurUV } },
        { binding: 1, resource: this.bloomView[1] },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.composeBind = device.createBindGroup({
      layout: this.composePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.composeU } },
        { binding: 1, resource: this.sceneView },
        { binding: 2, resource: this.bloomView[0] },
        { binding: 3, resource: this.sampler },
      ],
    });
  }

  setTier(tier) {
    tier = Math.max(0, Math.min(2, tier | 0));
    if (tier === this.tier) return;
    const prevGrid = this.cfg.grid;
    this.tier = tier;
    this.cfg = TIERS[tier];
    if (this.cfg.grid !== prevGrid) {
      this.grid = this.cfg.grid;
      this._allocSim();
      this._buildSimBinds(); // sceneBind references simView → rebuild too
    }
  }

  resize(w, h) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = w; this.viewH = h;
    this._allocScene();
    this._buildSceneBinds();
  }

  // write a flat Float32 list into a uniform buffer
  _writeU(buffer, values) {
    this.device.queue.writeBuffer(buffer, 0, new Float32Array(values));
  }

  _writeSimU(u, time) {
    const f = new Float32Array(28); // 112 bytes
    f[0] = this.grid; f[1] = this.grid;
    f[2] = time; f[3] = 0.49; f[4] = 0.0008;
    let o = 8; // src array at byte 32 (= index 8)
    for (let i = 0; i < 3; i++) {
      const s = u.sources[i];
      f[o++] = s.pos[0]; f[o++] = s.pos[1]; f[o++] = s.amp; f[o++] = s.freq;
    }
    f[20] = u.sources[0].phase; f[21] = u.sources[1].phase; f[22] = u.sources[2].phase;
    f[24] = u.pointer[0]; f[25] = u.pointer[1]; f[26] = u.pointer[2]; f[27] = u.pointer[3];
    this.device.queue.writeBuffer(this.simU, 0, f);
  }

  _writeRenderU(u) {
    const f = new Float32Array(16); // 64 bytes
    f[0] = this.viewW; f[1] = this.viewH;
    f[2] = this.grid; f[3] = this.grid;
    f[4] = u.time; f[5] = u.peak; f[6] = 45.0; f[7] = 1.15;
    f[8] = 0.2; f[9] = this.cfg.micro;             // sat (disciplined), micro
    f[12] = u.lightDir[0]; f[13] = u.lightDir[1]; f[14] = u.lightDir[2];
    this.device.queue.writeBuffer(this.renderU, 0, f);
  }

  _writeComposeU(u) {
    const f = new Float32Array(8); // 32 bytes
    f[0] = this.viewW; f[1] = this.viewH;
    f[2] = u.time; f[3] = this.cfg.bloom;
    f[4] = this.cfg.aberration; f[5] = 0.5; f[6] = 0.04;
    this.device.queue.writeBuffer(this.composeU, 0, f);
  }

  step(dt, u) {
    const subs = this.cfg.substeps;
    for (let n = 0; n < subs; n++) {
      this._writeSimU(u, u.time + (n / subs) * dt); // per-substep time (parity w/ WebGL2)
      const enc = this.device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(this.simPipeline);
      pass.setBindGroup(0, this.simBind[this.simSrc]);
      pass.dispatchWorkgroups(Math.ceil(this.grid / 8), Math.ceil(this.grid / 8));
      pass.end();
      this.device.queue.submit([enc.finish()]);
      this.simSrc = 1 - this.simSrc;
    }
  }

  render(u) {
    this._writeRenderU(u);
    this._writeComposeU(u);
    const enc = this.device.createCommandEncoder();
    const pass = (view) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, clearValue: { r: 0.024, g: 0.024, b: 0.027, a: 1 }, loadOp: "clear", storeOp: "store" }],
      });

    // scene → HDR
    const sc = pass(this.sceneView);
    sc.setPipeline(this.scenePipeline);
    sc.setBindGroup(0, this.sceneBind[this.simSrc]);
    sc.draw(3); sc.end();

    if (this.cfg.bloom > 0.0) {
      const b = pass(this.bloomView[0]);
      b.setPipeline(this.brightPipeline); b.setBindGroup(0, this.brightBind); b.draw(3); b.end();
      const h = pass(this.bloomView[1]);
      h.setPipeline(this.blurPipeline); h.setBindGroup(0, this.blurBindH); h.draw(3); h.end();
      const v = pass(this.bloomView[0]);
      v.setPipeline(this.blurPipeline); v.setBindGroup(0, this.blurBindV); v.draw(3); v.end();
    }

    // compose → canvas
    const co = enc.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.024, g: 0.024, b: 0.027, a: 1 }, loadOp: "clear", storeOp: "store",
      }],
    });
    co.setPipeline(this.composePipeline);
    co.setBindGroup(0, this.composeBind);
    co.draw(3); co.end();

    this.device.queue.submit([enc.finish()]);
  }

  dispose() {
    this.simTex?.forEach((t) => t.destroy());
    this.sceneTex?.destroy();
    this.bloomTex?.forEach((t) => t.destroy());
    [this.simU, this.renderU, this.brightU, this.blurUH, this.blurUV, this.composeU].forEach(
      (b) => b?.destroy?.()
    );
    this.device?.destroy?.();
  }
}

export default WebGPURenderer;
