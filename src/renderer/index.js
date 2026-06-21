// ============================================================================
// Backend selection: navigator.gpu? → WebGPU : WebGL2, with fallback on ANY
// failure. WebGPU is a pure enhancement and is GATED behind an explicit opt-in
// (?gpu=1 or localStorage 'interference:webgpu') until validated on real
// hardware — per the plan's "real-device testing mandatory before launch"
// guardrail. WebGL2 is the always-shippable baseline.
// ============================================================================
import { WebGL2Renderer } from "./webgl2/WebGL2Renderer.js";

function webgpuOptIn() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("gpu") === "1") return true;
    if (q.get("gpu") === "0") return false;
    return localStorage.getItem("interference:webgpu") === "1";
  } catch {
    return false;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<import('./Renderer.js').Renderer>}
 */
export async function selectBackend(canvas) {
  if (webgpuOptIn() && typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const { WebGPURenderer } = await import("./webgpu/WebGPURenderer.js");
      const r = new WebGPURenderer();
      await r.init(canvas);
      console.info("[Interference] backend: WebGPU");
      return r;
    } catch (e) {
      console.warn("[Interference] WebGPU init failed, falling back to WebGL2:", e);
      // canvas may be tainted by a failed gpu context request; the WebGL2 path
      // is created on the same element and will request its own context.
    }
  }
  const r = new WebGL2Renderer();
  await r.init(canvas);
  console.info("[Interference] backend: WebGL2");
  return r;
}

export default selectBackend;
