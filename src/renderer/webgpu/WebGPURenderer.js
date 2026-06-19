// ============================================================================
// WebGPURenderer — WGSL compute FDTD + render port of the WebGL2 backend.
//
// GATED + UNVALIDATED ON HARDWARE: selection only reaches here on explicit
// opt-in (?gpu=1). selectBackend() falls back to WebGL2 on ANY failure here.
// Per the plan this is a pure enhancement layer sequenced last; bloom is not
// yet ported (it is tier-gated/optional), flagged TODO — the WebGL2 baseline
// remains the reference look until this path is validated on real devices.
//
// Same physics/visual math as the GLSL path: FDTD (RG packed into rgba16float
// storage texture, ping-pong), 3-source model, relief lighting, platinum ramp,
// thin film, ACES, vignette, grain, dither.
// ============================================================================
import { Renderer } from "../Renderer.js";

const GRID = 1024;

const SIM_WGSL = /* wgsl */ `
struct SimU {
  res: vec2f,
  time: f32,
  c2: f32,
  damp: f32,
  _pad: vec3f,
  src: array<vec4f, 3>,   // (posX, posY, amp, freq)
  phase: vec4f,           // (p0, p1, p2, _)
  pointer: vec4f,         // (x, y, amp, freq)
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
  textureStore(stateOut, p, vec4f(next, cur, 0.0, 1.0));
}`;

const RENDER_WGSL = /* wgsl */ `
struct RenderU {
  res: vec2f,
  grid: vec2f,
  time: f32,
  peak: f32,
  relief: f32,
  exposure: f32,
  sat: f32,
  micro: f32,
  _pad: vec2f,
  light: vec4f,
};
@group(0) @binding(0) var<uniform> u: RenderU;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

const TAU = 6.28318530718;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = p[vi] * 0.5 + 0.5;
  return o;
}

fn toLinear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
fn hash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 345.45));
  q += dot(q, q + 34.345);
  return fract(q.x * q.y);
}
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

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let texel = 1.0 / u.grid;
  let warp = vec2f(fbm(in.uv * 6.0 + u.time * 0.03), fbm(in.uv * 6.0 - u.time * 0.025 + 11.7)) - 0.5;
  let uv = in.uv + warp * 0.012;

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
  let filmMix = u.sat * smoothstep(0.05, 0.6, thickness);
  col = mix(col, col * (0.5 + film), filmMix);

  let ignite = spec * (0.6 + 0.8 * u.peak) + u.peak * smoothstep(0.7, 1.0, lum) * 0.6;
  col += vec3f(ignite);

  col *= u.exposure * (0.85 + 0.4 * u.peak);
  col = aces(col);

  // vignette + grain + gamma + dither (post folded into one pass; bloom: TODO)
  let fromCenter = in.uv - 0.5;
  let vig = smoothstep(0.9, 0.2, length(fromCenter));
  col = mix(vec3f(0.020, 0.020, 0.027), col, mix(0.5, 1.0, vig));
  col += (hash(in.uv * u.res + u.time) - 0.5) * 0.04;
  col = pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2));
  return vec4f(col, 1.0);
}`;

export class WebGPURenderer extends Renderer {
  get backend() {
    return "WebGPU";
  }

  async init(canvas) {
    if (!navigator.gpu) throw new Error("navigator.gpu unavailable");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("no GPU adapter");
    const device = await adapter.requestDevice();
    this.device = device;
    this.canvas = canvas;
    this.tier = 2;

    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error("no webgpu context");
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: "opaque" });

    this.grid = GRID;
    this._allocSim();

    // uniforms
    this.simU = device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.renderU = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    // compute pipeline
    const simMod = device.createShaderModule({ code: SIM_WGSL });
    this.simPipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: simMod, entryPoint: "main" },
    });

    // render pipeline
    const rMod = device.createShaderModule({ code: RENDER_WGSL });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: rMod, entryPoint: "vs" },
      fragment: { module: rMod, entryPoint: "fs", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });

    this._buildBindGroups();
  }

  _allocSim() {
    const device = this.device;
    const g = this.grid;
    const usage =
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    this.simTex = [0, 1].map(() =>
      device.createTexture({ size: [g, g], format: "rgba16float", usage })
    );
    this.simView = this.simTex.map((t) => t.createView());
    this.simSrc = 0;
  }

  _buildBindGroups() {
    const device = this.device;
    // compute bind groups for each ping-pong direction
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
    this.renderBind = [0, 1].map((src) =>
      device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.renderU } },
          { binding: 1, resource: this.simView[src] },
          { binding: 2, resource: this.sampler },
        ],
      })
    );
  }

  setTier(tier) {
    this.tier = Math.max(0, Math.min(2, tier | 0));
  }

  resize(w, h) {
    this.viewW = w;
    this.viewH = h;
    // canvas backing size already set by WaveCanvas; ctx auto-tracks canvas size.
  }

  _writeSimU(dt, u) {
    const buf = new ArrayBuffer(160);
    const f = new Float32Array(buf);
    f[0] = this.grid; f[1] = this.grid;       // res
    f[2] = u.time; f[3] = 0.49; f[4] = 0.0008; // time, c2, damp
    // f[5..7] pad
    let o = 8; // src array starts at 32 bytes
    for (let i = 0; i < 3; i++) {
      const s = u.sources[i];
      f[o++] = s.pos[0]; f[o++] = s.pos[1]; f[o++] = s.amp; f[o++] = s.freq;
    }
    // phase vec4 at offset 8+12 = 20
    f[20] = u.sources[0].phase; f[21] = u.sources[1].phase; f[22] = u.sources[2].phase; f[23] = 0;
    // pointer vec4 at 24
    f[24] = u.pointer[0]; f[25] = u.pointer[1]; f[26] = u.pointer[2]; f[27] = u.pointer[3];
    this.device.queue.writeBuffer(this.simU, 0, buf);
  }

  _writeRenderU(u) {
    const buf = new ArrayBuffer(80);
    const f = new Float32Array(buf);
    f[0] = this.viewW || this.canvas.width; f[1] = this.viewH || this.canvas.height;
    f[2] = this.grid; f[3] = this.grid;
    f[4] = u.time; f[5] = u.peak; f[6] = 45.0; f[7] = 1.15; // time, peak, relief, exposure
    f[8] = 0.4; f[9] = this.tier === 2 ? 1.0 : 0.0;          // sat, micro
    // f[10..11] pad ; light vec4 at offset 12
    f[12] = u.lightDir[0]; f[13] = u.lightDir[1]; f[14] = u.lightDir[2]; f[15] = 0;
    this.device.queue.writeBuffer(this.renderU, 0, buf);
  }

  step(dt, u) {
    this._writeSimU(dt, u);
    const subs = this.tier === 0 ? 1 : 2;
    const enc = this.device.createCommandEncoder();
    for (let n = 0; n < subs; n++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.simPipeline);
      pass.setBindGroup(0, this.simBind[this.simSrc]);
      pass.dispatchWorkgroups(Math.ceil(this.grid / 8), Math.ceil(this.grid / 8));
      pass.end();
      this.simSrc = 1 - this.simSrc;
    }
    this.device.queue.submit([enc.finish()]);
  }

  render(u) {
    this._writeRenderU(u);
    const enc = this.device.createCommandEncoder();
    const view = this.ctx.getCurrentTexture().createView();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0.024, g: 0.024, b: 0.027, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pass.setPipeline(this.renderPipeline);
    // current state is in simTex[simSrc] (last written destination)
    pass.setBindGroup(0, this.renderBind[this.simSrc]);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  dispose() {
    this.simTex?.forEach((t) => t.destroy());
    this.device?.destroy?.();
  }
}

export default WebGPURenderer;
