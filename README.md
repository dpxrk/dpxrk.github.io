# Interference — "Spectral Mercury Instrument"

A liquid-mercury interference field for Daniel Park's portfolio. A real 2D
finite-difference time-domain (FDTD) wave simulation runs behind a scrollable
narrative; three sources (DOMAIN · ENGINEERING · AI) constructively interfere
into a peak at the PactWise beat — the thesis ("the value lives in the
constructive peak") rendered literally.

Built with Vite + React. No Tailwind, no three.js — the field is hand-written
GLSL on a WebGL2 baseline, with an opt-in WebGPU compute path.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview
```

## Architecture

```
App.jsx ── WaveCanvas (RAF loop, governor, uniforms, pointer, entrance)
        ├─ FieldHUD   (live FDTD readouts via RAF→textContent)
        └─ beats[]    (DOM sections, CSS scroll-driven reveals)

renderer/index.js  selectBackend(): navigator.gpu (opt-in) → WebGPU : WebGL2
  ├─ webgl2/WebGL2Renderer.js   FDTD ping-pong float FBOs + render + post  (baseline)
  └─ webgpu/WebGPURenderer.js   WGSL compute FDTD + render                 (enhancement)
```

- **Physics** (`src/shaders/waveShaders.js`, mirrored in WGSL): scalar wave eq
  `u_next = 2u − u_prev + C²∇²u − damp·(u−u_prev)`, 3 Gaussian sources, CFL-safe
  `C²=0.49`, absorbing edges, NaN clamp. `SOURCE_DRIVE` is the single knob for
  field energy.
- **Look**: ACES tonemap, 7-stop platinum ramp in linear space, 3-term metal
  lighting (ambient + anisotropic specular streak + Fresnel rim), domain-warped
  normals, physical thin-film color, half-res threshold bloom, blue-noise dither,
  grain, cool vignette, chromatic aberration.
- **Tiers / governor**: `WaveCanvas` measures rolling FPS and steps tier 2→0,
  dropping aberration → bloom → micro-detail → grid resolution to hold ≥48fps.
- **Motion**: Lenis smooth scroll → continuous, velocity-aware beat progress;
  per-source stagger; entrance specular sweep; harmonic breathing; pointer ripple.
  `prefers-reduced-motion` renders a single composed peak still.

## WebGPU

Gated behind explicit opt-in until validated on real hardware:

- enable: `?gpu=1` or `localStorage.setItem('interference:webgpu','1')`
- disable: `?gpu=0`

Any failure falls back to WebGL2 automatically. The WebGPU path does not yet
port bloom (tier-gated/optional) — WebGL2 is the reference look.

## Before deploy (open items)

- [ ] **Verify metrics** in `src/content/beats.js` (flagged UNVERIFIED: PactWise
      27-agents/<200KB, Ariba 500-vendor SLP, +50% YoY NSPO) before they ship in
      large type.
- [ ] Replace the placeholder PactWise URL in `beats.js`.
- [ ] Add the real résumé PDF to `public/` and link it.
- [ ] Confirm the GitHub Pages publish path serves the built `dist/` (this is a
      `*.github.io` user site; the dev `index.html` references `/src/main.jsx`).
- [ ] Validate on a real phone and a non-Chrome desktop browser; test the WebGPU
      path on supporting hardware.
