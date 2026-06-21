// ============================================================================
// Renderer — backend-agnostic interface.
//
// Both WebGL2Renderer and WebGPURenderer conform to this contract so the
// backend is a swappable port, not a redesign. WaveCanvas owns the RAF loop,
// tiers, governor and uniform/beat model; the renderer only knows how to
// advance the FDTD field and paint it.
//
// Uniforms shape passed to step()/render():
//   {
//     time:     number,          // seconds
//     dt:       number,          // seconds since last frame (clamped)
//     peak:     number,          // 0..1 ignition / exposure driver
//     sources:  [{ pos:[x,y], amp, freq, phase } x3], // pos in uv 0..1
//     pointer:  [x, y, amp, freq],                    // transient ripple
//     lightDir: [x, y, z],
//   }
//
// Tier (0 low / 1 mid / 2 high) toggles grid resolution, substeps, bloom,
// chromatic aberration, micro-detail and dither path.
// ============================================================================

/**
 * @typedef {Object} RendererUniforms
 * @property {number} time
 * @property {number} dt
 * @property {number} peak
 * @property {{pos:[number,number],amp:number,freq:number,phase:number}[]} sources
 * @property {[number,number,number,number]} pointer
 * @property {[number,number,number]} lightDir
 */

/**
 * @interface
 */
export class Renderer {
  /** @returns {Promise<void>|void} */
  async init(/* canvas */) {
    throw new Error("not implemented");
  }
  /** @param {0|1|2} tier */
  setTier(/* tier */) {
    throw new Error("not implemented");
  }
  /** Advance the FDTD field. @param {number} dt @param {RendererUniforms} u */
  step(/* dt, u */) {
    throw new Error("not implemented");
  }
  /** Paint the field to screen. @param {RendererUniforms} u */
  render(/* u */) {
    throw new Error("not implemented");
  }
  /** @param {number} w @param {number} h @param {number} dpr */
  resize(/* w, h, dpr */) {
    throw new Error("not implemented");
  }
  dispose() {
    throw new Error("not implemented");
  }

  /** Backend id, for the HUD. @returns {string} */
  get backend() {
    return "none";
  }
}

export default Renderer;
