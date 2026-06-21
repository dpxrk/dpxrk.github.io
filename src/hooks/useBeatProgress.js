// ============================================================================
// useBeatProgress — Lenis smooth scroll → continuous beat progress + velocity.
//
// Returns a mutable ref (not React state — this is read on the RAF hot path):
//   { index, frac, velocity, progress }
//     index    active beat (0..count-1)
//     frac     0..1 progress within the active beat toward the next
//     velocity |scroll velocity| (px/frame-ish), capped by the consumer
//     progress 0..1 overall scroll progress
// ============================================================================
import { useEffect, useRef } from "react";
import Lenis from "lenis";

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useBeatProgress(count, peakIndex = 0) {
  const ref = useRef({ index: 0, frac: 0, velocity: 0, progress: 0 });

  useEffect(() => {
    if (prefersReducedMotion) {
      // hold on the constructive peak; WaveCanvas renders a single still.
      ref.current = { index: peakIndex, frac: 0, velocity: 0, progress: 1 };
      return;
    }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      syncTouch: false,
    });

    const update = (scroll, velocity) => {
      const vh = window.innerHeight || 1;
      const pos = scroll / vh; // in beat units (one beat ≈ one viewport)
      const index = Math.min(count - 1, Math.max(0, Math.floor(pos)));
      const frac = Math.min(1, Math.max(0, pos - index));
      const limit = Math.max(1, (count - 1) * vh);
      ref.current = {
        index,
        frac,
        velocity: Math.abs(velocity || 0),
        progress: Math.min(1, scroll / limit),
      };
    };

    const onScroll = (e) => update(e.scroll, e.velocity);
    lenis.on("scroll", onScroll);

    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    });

    update(window.scrollY || 0, 0);

    return () => {
      cancelAnimationFrame(raf);
      lenis.off("scroll", onScroll);
      lenis.destroy();
    };
  }, [count, peakIndex]);

  return ref;
}

export default useBeatProgress;
