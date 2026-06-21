// ============================================================================
// WebGL2Renderer — FDTD ping-pong sim + lit/colored render + post chain.
// The baseline backend: the site is fully beautiful on this alone.
// ============================================================================
import { Renderer } from "../Renderer.js";
import {
  VERT,
  SIM_FRAG,
  RENDER_FRAG,
  BRIGHT_FRAG,
  BLUR_FRAG,
  COMPOSE_FRAG,
} from "../../shaders/waveShaders.js";

// Tier configs — grid resolution, substeps, and which effects are live.
const TIERS = [
  { grid: 384, substeps: 1, bloom: 0.0, aberration: 0.0, micro: 0.0, blueNoise: 0.0 },
  { grid: 640, substeps: 2, bloom: 0.9, aberration: 0.0, micro: 0.0, blueNoise: 1.0 },
  { grid: 1024, substeps: 2, bloom: 1.0, aberration: 0.6, micro: 1.0, blueNoise: 1.0 },
];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function program(gl, fragSrc) {
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  // cache uniform locations lazily
  p._u = {};
  return p;
}

export class WebGL2Renderer extends Renderer {
  constructor() {
    super();
    this.gl = null;
    this.tier = 2;
    this.cfg = TIERS[2];
    this._disposed = false;
  }

  get backend() {
    return "WebGL2";
  }

  async init(canvas) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.canvas = canvas;

    // float render targets
    this.hasFloat = !!gl.getExtension("EXT_color_buffer_float");
    if (!this.hasFloat) {
      console.warn("[Interference] EXT_color_buffer_float missing — field may be unstable.");
    }

    // programs
    this.pSim = program(gl, SIM_FRAG);
    this.pRender = program(gl, RENDER_FRAG);
    this.pBright = program(gl, BRIGHT_FRAG);
    this.pBlur = program(gl, BLUR_FRAG);
    this.pCompose = program(gl, COMPOSE_FRAG);

    // empty VAO (fullscreen triangle uses gl_VertexID)
    this.vao = gl.createVertexArray();

    this.viewW = canvas.width;
    this.viewH = canvas.height;

    this._allocSim();
    this._allocScene();
    this._loadBlueNoise();
  }

  // ---- texture / FBO helpers ----
  _tex(w, h, internal, format, type, filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  _fbo(tex) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }

  _allocSim() {
    const gl = this.gl;
    const g = this.cfg.grid;
    this.gridSize = g;
    // RG16F: r = u_curr, g = u_prev. LINEAR is safe — the sim pass samples exact
    // texel centers (viewport == grid), and render upsamples the field smoothly.
    this.simTex = [0, 1].map(() =>
      this._tex(g, g, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR)
    );
    this.simFbo = this.simTex.map((t) => this._fbo(t));
    this.simSrc = 0;
    // seed both to zero
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo[i]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  _allocScene() {
    const gl = this.gl;
    const w = this.viewW;
    const h = this.viewH;
    // HDR scene (RGBA16F) so bloom threshold sees values > 1
    this.sceneTex = this._tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.sceneFbo = this._fbo(this.sceneTex);
    // half-res bloom buffers
    const bw = Math.max(1, w >> 1);
    const bh = Math.max(1, h >> 1);
    this.bloomW = bw;
    this.bloomH = bh;
    this.bloomTex = [0, 1].map(() =>
      this._tex(bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
    );
    this.bloomFbo = this.bloomTex.map((t) => this._fbo(t));
  }

  _loadBlueNoise() {
    const gl = this.gl;
    // 1x1 placeholder until the PNG loads (compose falls back to bayer anyway)
    this.blueNoise = this._tex(1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST);
    const img = new Image();
    img.onload = () => {
      if (this._disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, this.blueNoise);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.blueNoiseReady = true;
    };
    img.src = "/bluenoise.png";
  }

  setTier(tier) {
    tier = Math.max(0, Math.min(2, tier | 0));
    if (tier === this.tier) return;
    const prevGrid = this.cfg.grid;
    this.tier = tier;
    this.cfg = TIERS[tier];
    if (this.cfg.grid !== prevGrid) {
      // grid changed — reallocate the sim (field re-seeds; cheap, rare)
      const gl = this.gl;
      this.simTex.forEach((t) => gl.deleteTexture(t));
      this.simFbo.forEach((f) => gl.deleteFramebuffer(f));
      this._allocSim();
    }
  }

  resize(w, h) {
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = Math.max(1, w | 0);
    this.viewH = Math.max(1, h | 0);
    const gl = this.gl;
    gl.deleteTexture(this.sceneTex);
    gl.deleteFramebuffer(this.sceneFbo);
    this.bloomTex.forEach((t) => gl.deleteTexture(t));
    this.bloomFbo.forEach((f) => gl.deleteFramebuffer(f));
    this._allocScene();
  }

  // uniform setters (cached locations)
  _u(p, name) {
    if (p._u[name] === undefined) p._u[name] = this.gl.getUniformLocation(p, name);
    return p._u[name];
  }

  _draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  step(dt, u) {
    const gl = this.gl;
    const g = this.gridSize;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.pSim);
    gl.viewport(0, 0, g, g);
    const p = this.pSim;
    gl.uniform2f(this._u(p, "uResolution"), g, g);
    gl.uniform1f(this._u(p, "uC2"), 0.49); // CFL-safe courant^2
    gl.uniform1f(this._u(p, "uDamp"), 0.0008);
    for (let i = 0; i < 3; i++) {
      const s = u.sources[i];
      gl.uniform2f(this._u(p, `uSrcPos[${i}]`), s.pos[0], s.pos[1]);
      gl.uniform1f(this._u(p, `uSrcAmp[${i}]`), s.amp);
      gl.uniform1f(this._u(p, `uSrcFreq[${i}]`), s.freq);
      gl.uniform1f(this._u(p, `uSrcPhase[${i}]`), s.phase);
    }
    gl.uniform4f(this._u(p, "uPointer"), u.pointer[0], u.pointer[1], u.pointer[2], u.pointer[3]);

    const subs = this.cfg.substeps;
    for (let n = 0; n < subs; n++) {
      const dst = 1 - this.simSrc;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo[dst]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.simTex[this.simSrc]);
      gl.uniform1i(this._u(p, "uState"), 0);
      gl.uniform1f(this._u(p, "uTime"), u.time + (n / subs) * dt);
      this._draw();
      this.simSrc = dst;
    }
  }

  render(u) {
    const gl = this.gl;
    const cfg = this.cfg;
    gl.bindVertexArray(this.vao);

    // --- scene: lit/colored field into HDR FBO ---
    gl.useProgram(this.pRender);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, this.viewW, this.viewH);
    let p = this.pRender;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simTex[this.simSrc]);
    gl.uniform1i(this._u(p, "uField"), 0);
    gl.uniform2f(this._u(p, "uResolution"), this.gridSize, this.gridSize);
    gl.uniform1f(this._u(p, "uRelief"), 45.0);
    gl.uniform1f(this._u(p, "uTime"), u.time);
    gl.uniform1f(this._u(p, "uPeak"), u.peak);
    gl.uniform3f(this._u(p, "uLightDir"), u.lightDir[0], u.lightDir[1], u.lightDir[2]);
    gl.uniform1f(this._u(p, "uExposure"), 1.15);
    gl.uniform1f(this._u(p, "uSat"), 0.2); // dialed toward disciplined (was 0.4)
    gl.uniform1f(this._u(p, "uMicro"), cfg.micro);
    this._draw();

    // --- bloom (tier-gated) ---
    let bloomStrength = cfg.bloom;
    if (bloomStrength > 0.0) {
      // bright-pass scene -> bloom[0]
      gl.useProgram(this.pBright);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
      gl.viewport(0, 0, this.bloomW, this.bloomH);
      p = this.pBright;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(this._u(p, "uScene"), 0);
      gl.uniform1f(this._u(p, "uThreshold"), 0.82);
      this._draw();

      // separable blur: bloom[0]->[1] (H), [1]->[0] (V)
      gl.useProgram(this.pBlur);
      p = this.pBlur;
      const tx = 1.0 / this.bloomW;
      const ty = 1.0 / this.bloomH;
      // horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
      gl.uniform1i(this._u(p, "uTex"), 0);
      gl.uniform2f(this._u(p, "uDir"), tx, 0);
      this._draw();
      // vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[1]);
      gl.uniform2f(this._u(p, "uDir"), 0, ty);
      this._draw();
    }

    // --- compose to screen ---
    gl.useProgram(this.pCompose);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.viewW, this.viewH);
    p = this.pCompose;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this._u(p, "uScene"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
    gl.uniform1i(this._u(p, "uBloom"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blueNoise);
    gl.uniform1i(this._u(p, "uBlueNoise"), 2);
    gl.uniform2f(this._u(p, "uResolution"), this.viewW, this.viewH);
    gl.uniform1f(this._u(p, "uTime"), u.time);
    gl.uniform1f(this._u(p, "uBloomStrength"), bloomStrength);
    gl.uniform1f(this._u(p, "uAberration"), cfg.aberration);
    gl.uniform1f(this._u(p, "uVignette"), 0.5);
    gl.uniform1f(this._u(p, "uGrain"), 0.04);
    gl.uniform1f(this._u(p, "uUseBlueNoise"), this.blueNoiseReady && cfg.blueNoise ? 1.0 : 0.0);
    this._draw();
  }

  dispose() {
    this._disposed = true;
    const gl = this.gl;
    if (!gl) return;
    [this.pSim, this.pRender, this.pBright, this.pBlur, this.pCompose].forEach(
      (p) => p && gl.deleteProgram(p)
    );
    this.simTex?.forEach((t) => gl.deleteTexture(t));
    this.simFbo?.forEach((f) => gl.deleteFramebuffer(f));
    gl.deleteTexture(this.sceneTex);
    gl.deleteFramebuffer(this.sceneFbo);
    this.bloomTex?.forEach((t) => gl.deleteTexture(t));
    this.bloomFbo?.forEach((f) => gl.deleteFramebuffer(f));
    gl.deleteTexture(this.blueNoise);
    gl.deleteVertexArray(this.vao);
  }
}

export default WebGL2Renderer;
