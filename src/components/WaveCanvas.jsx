// ============================================================================
// WaveCanvas — owns the canvas, the RAF loop, the backend, the FPS governor,
// uniform/beat derivation, pointer ripple, entrance ceremony, and teardown.
// Both backends share the uniform model it produces.
// ============================================================================
import { useEffect, useRef } from "react";
import { selectBackend } from "../renderer/index.js";
import { beats, PEAK_BEAT_INDEX } from "../content/beats.js";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// source screen positions (uv) — a wide triangle so fringes fill the field
const SRC_POS = [
  [0.22, 0.34],
  [0.78, 0.30],
  [0.5, 0.78],
];

const BASE_LIGHT = [-0.45, 0.55, 0.78];
const ENTRANCE_MS = 1400;
const STAGGER_MS = 120;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default function WaveCanvas({ progressRef, hudRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let renderer = null;
    let raf = 0;
    let disposed = false;

    // smoothed per-source amplitudes (for stagger / velocity-aware easing)
    const curAmp = [0, 0, 0];
    // pointer ripple state
    const ptr = { x: 0.5, y: 0.5, amp: 0, freq: 4.0, t0: 0 };
    // governor
    const frames = [];
    let tier = 2;
    let lastTierChange = 0;
    // timing
    const start = performance.now();
    let last = start;

    function dpr() {
      return Math.min(window.devicePixelRatio || 1, 2);
    }
    function resize() {
      const w = Math.floor(window.innerWidth * dpr());
      const h = Math.floor(window.innerHeight * dpr());
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      renderer && renderer.resize(w, h, dpr());
    }

    function onPointer(e) {
      const r = canvas.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / r.width;
      ptr.y = 1 - (e.clientY - r.top) / r.height; // gl uv is bottom-up
      ptr.amp = 0.5; // sharp rise
      ptr.t0 = performance.now();
    }

    // ---- governor: rolling fps → tier ----
    function governor(now, dtMs) {
      frames.push(dtMs);
      if (frames.length > 60) frames.shift();
      if (now - lastTierChange < 1500 || frames.length < 30) return;
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      const fps = 1000 / avg;
      if (fps < 48 && tier > 0) {
        tier--;
        renderer.setTier(tier);
        lastTierChange = now;
      } else if (fps > 58 && tier < 2) {
        tier++;
        renderer.setTier(tier);
        lastTierChange = now;
      }
    }

    // ---- derive uniforms for this frame ----
    function deriveUniforms(now, dt) {
      const elapsed = now - start;
      const p = progressRef.current;
      const i0 = p.index;
      const i1 = Math.min(beats.length - 1, i0 + 1);
      const f = p.frac;

      // velocity-aware easing: fast scroll snaps, slow glides
      const vel = Math.min(p.velocity, 40);
      const ease = Math.min(0.25, 0.05 + vel * 0.004);

      // entrance envelope (0..1) over ENTRANCE_MS, staggered per source
      const targetAmp = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const a = lerp(beats[i0].sources[i].amp, beats[i1].sources[i].amp, f);
        const enterDelay = i * STAGGER_MS;
        const env = REDUCED
          ? 1
          : Math.max(0, Math.min(1, (elapsed - enterDelay) / (ENTRANCE_MS - enterDelay)));
        // harmonic breathing at rest
        const breathe = 0.02 * Math.sin(now / 6000 + i * 2.1);
        targetAmp[i] = a * env + breathe * env;
      }

      // per-source staggered ease toward target (later sources lag slightly)
      for (let i = 0; i < 3; i++) {
        const k = ease * (1 - i * 0.12);
        curAmp[i] += (targetAmp[i] - curAmp[i]) * k;
      }

      const peak = lerp(beats[i0].peak, beats[i1].peak, f);

      // entrance specular sweep: animate light L→R once over ENTRANCE_MS
      let light = BASE_LIGHT;
      if (!REDUCED && elapsed < ENTRANCE_MS) {
        const s = elapsed / ENTRANCE_MS;
        light = [lerp(-1.0, 0.6, s), 0.5, 0.78];
      }

      // pointer ripple envelope: timestamp-based ~200ms tail
      let pAmp = 0;
      if (ptr.amp > 0) {
        const age = (now - ptr.t0) / 1000;
        pAmp = ptr.amp * Math.exp(-age / 0.2);
        if (pAmp < 0.001) pAmp = 0;
      }

      const sources = [0, 1, 2].map((i) => ({
        pos: SRC_POS[i],
        amp: curAmp[i],
        freq: lerp(beats[i0].sources[i].freq, beats[i1].sources[i].freq, f),
        phase: beats[i0].sources[i].phase,
      }));

      return {
        time: elapsed / 1000,
        dt,
        peak,
        sources,
        pointer: [ptr.x, ptr.y, pAmp, ptr.freq],
        lightDir: light,
        _beatIndex: i0,
      };
    }

    function writeHud(u, now) {
      if (!hudRef) return;
      const avg = frames.length
        ? frames.reduce((a, b) => a + b, 0) / frames.length
        : 16;
      hudRef.current = {
        backend: renderer ? renderer.backend : "—",
        tier,
        fps: Math.round(1000 / avg),
        peak: u.peak,
        beatIndex: u._beatIndex,
        beatLabel: beats[u._beatIndex].label || beats[u._beatIndex].id.toUpperCase(),
        pointer: [u.pointer[0], u.pointer[1]],
        sources: u.sources.map((s) => ({
          amp: s.amp,
          freq: s.freq,
          phase: s.phase,
        })),
        constructiveMax: u._beatIndex === PEAK_BEAT_INDEX,
        hudVisible: tier === 2,
      };
    }

    // ---- reduced-motion still: build a peak pattern, render once, stop ----
    function renderStill() {
      const peakBeat = beats[PEAK_BEAT_INDEX];
      const u = {
        time: 6.0,
        dt: 0.016,
        peak: peakBeat.peak,
        sources: [0, 1, 2].map((i) => ({
          pos: SRC_POS[i],
          amp: peakBeat.sources[i].amp,
          freq: peakBeat.sources[i].freq,
          phase: peakBeat.sources[i].phase,
        })),
        pointer: [0.5, 0.5, 0, 4],
        lightDir: BASE_LIGHT,
        _beatIndex: PEAK_BEAT_INDEX,
      };
      // advance the field enough to form a developed interference pattern
      for (let n = 0; n < 240; n++) {
        u.time = n * 0.016;
        renderer.step(0.016, u);
      }
      u.time = 6.0;
      renderer.render(u);
      writeHud(u, performance.now());
    }

    function loop(now) {
      if (disposed) return;
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.033); // clamp spikes

      const u = deriveUniforms(now, dt);
      renderer.step(dt, u);
      renderer.render(u);
      writeHud(u, now);
      governor(now, dt * 1000);

      raf = requestAnimationFrame(loop);
    }

    (async () => {
      try {
        resize();
        renderer = await selectBackend(canvas);
        if (disposed) {
          renderer.dispose();
          return;
        }
        resize();
        renderer.setTier(tier);

        window.addEventListener("resize", resize);
        if (!REDUCED) {
          window.addEventListener("pointermove", onPointer, { passive: true });
          window.addEventListener("pointerdown", onPointer, { passive: true });
          raf = requestAnimationFrame(loop);
        } else {
          renderStill();
        }
      } catch (e) {
        console.error("[Interference] renderer init failed:", e);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      renderer && renderer.dispose();
    };
  }, [progressRef, hudRef]);

  return <canvas ref={canvasRef} className="field-canvas" aria-hidden="true" />;
}
