// ============================================================================
// FieldHUD — live FDTD readout overlay. Hairline, sparse, REAL values only.
// Updated by a RAF loop writing textContent (NOT React state) so it never
// triggers a re-render. Desktop/high-tier only (hidden otherwise).
// ============================================================================
import { useEffect, useRef } from "react";
import { SOURCE_LABELS } from "../content/beats.js";

const fmt = (n, d = 2) => (n >= 0 ? " " : "") + n.toFixed(d);

export default function FieldHUD({ hudRef }) {
  const rootRef = useRef(null);
  const srcRefs = useRef([]);
  const ptrRef = useRef(null);
  const beatRef = useRef(null);
  const sysRef = useRef(null);
  const annRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const h = hudRef.current;
      const root = rootRef.current;
      if (h && root) {
        root.dataset.hud = h.hudVisible ? "on" : "off";

        for (let i = 0; i < 3; i++) {
          const el = srcRefs.current[i];
          const s = h.sources && h.sources[i];
          if (el && s) {
            el.textContent =
              `${SOURCE_LABELS[i].padEnd(11)} f ${fmt(s.freq, 2)}  φ ${fmt(s.phase, 2)}  A ${fmt(s.amp, 3)}`;
          }
        }
        if (ptrRef.current) {
          ptrRef.current.textContent = `PTR  x ${fmt(h.pointer[0], 3)}  y ${fmt(h.pointer[1], 3)}`;
        }
        if (beatRef.current) {
          beatRef.current.textContent = `BEAT ${h.beatLabel}  ·  PEAK ${fmt(h.peak, 2)}`;
        }
        if (sysRef.current) {
          sysRef.current.textContent = `${h.backend}  T${h.tier}  ${h.fps}fps`;
        }
        if (annRef.current) {
          annRef.current.dataset.on = h.constructiveMax ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hudRef]);

  return (
    <div className="hud" ref={rootRef} data-hud="off" aria-hidden="true">
      <span className="hud__crop hud__crop--tl" />
      <span className="hud__crop hud__crop--tr" />
      <span className="hud__crop hud__crop--bl" />
      <span className="hud__crop hud__crop--br" />

      <div className="hud__corner hud__corner--tl">
        <div className="hud__row" ref={(el) => (srcRefs.current[0] = el)} />
        <div className="hud__row" ref={(el) => (srcRefs.current[1] = el)} />
        <div className="hud__row" ref={(el) => (srcRefs.current[2] = el)} />
      </div>

      <div className="hud__corner hud__corner--tr">
        <div className="hud__row" ref={sysRef} />
      </div>

      <div className="hud__corner hud__corner--bl">
        <div className="hud__row" ref={beatRef} />
      </div>

      <div className="hud__corner hud__corner--br">
        <div className="hud__row" ref={ptrRef} />
      </div>

      <div className="hud__annotation" ref={annRef} data-on="0">
        <span className="hud__leader" />
        <span>CONSTRUCTIVE MAX</span>
      </div>
    </div>
  );
}
