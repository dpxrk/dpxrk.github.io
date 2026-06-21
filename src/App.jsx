import { useRef } from "react";
import WaveCanvas from "./components/WaveCanvas.jsx";
import FieldHUD from "./components/FieldHUD.jsx";
import useBeatProgress from "./hooks/useBeatProgress.js";
import { beats, PEAK_BEAT_INDEX } from "./content/beats.js";

function Beat({ beat }) {
  const { kind } = beat;
  return (
    <section className={`beat ${kind === "hook" ? "beat__hook" : ""}`} id={beat.id}>
      <div className="beat__inner reveal">
        <div className="beat__scrim" />
        {beat.eyebrow && <p className="eyebrow">{beat.eyebrow}</p>}
        <h2 className="beat__title">{beat.title}</h2>

        {beat.outcome && <p className="beat__outcome">{beat.outcome}</p>}
        {beat.body && <p className="beat__body">{beat.body}</p>}

        {kind === "pactwise" && (
          <>
            <ul className="spec-list">
              {beat.specs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {beat.url && (
              <p className="beat__sub">
                <a href={beat.url} target="_blank" rel="noreferrer">
                  Visit PactWise ↗
                </a>
              </p>
            )}
          </>
        )}

        {kind === "record" && (
          <div className="metric-list">
            {beat.metrics.map((m) => (
              <div className="metric" key={m.note}>
                <span className="metric__value">{m.value}</span>
                <span className="metric__unit">{m.unit}</span>
                <span className="metric__note">{m.note}</span>
              </div>
            ))}
          </div>
        )}

        {beat.sub && <p className="beat__sub">{beat.sub}</p>}
      </div>
    </section>
  );
}

export default function App() {
  const progressRef = useBeatProgress(beats.length, PEAK_BEAT_INDEX);
  const hudRef = useRef({
    backend: "—",
    tier: 2,
    fps: 60,
    peak: 0,
    beatIndex: 0,
    beatLabel: "",
    pointer: [0.5, 0.5],
    sources: [
      { amp: 0, freq: 0, phase: 0 },
      { amp: 0, freq: 0, phase: 0 },
      { amp: 0, freq: 0, phase: 0 },
    ],
    constructiveMax: false,
    hudVisible: false,
  });

  return (
    <>
      <WaveCanvas progressRef={progressRef} hudRef={hudRef} />
      <FieldHUD hudRef={hudRef} />
      <main className="beats">
        {beats.map((b) => (
          <Beat key={b.id} beat={b} />
        ))}
      </main>
    </>
  );
}
