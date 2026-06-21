// Interference beats — the single source of truth for copy AND field parameters.
//
// Each beat drives the three FDTD sources. `sources[i]` = { amp, freq, phase } for
// source i (0 = DOMAIN, 1 = ENGINEERING, 2 = AI). Per-beat emphasis amplitudes are
// roughly constant-sum so the field's total energy stays balanced as beats change;
// the lead source for a beat sits higher so that career visibly leads.
//
// `peak` (0..1) drives exposure / ignition. PactWise is the brightest (1.0) and the
// only beat where all three amplitudes are equal — the instrument confirming the thesis
// that the value lives in the constructive peak.
//
// METRICS NOTE: figures below (27 agents / <200KB, Ariba SLP, 500 vendors, +50% YoY)
// are PLACEHOLDERS flagged UNVERIFIED — reconcile against the real resume before deploy.

export const SOURCE_LABELS = ["DOMAIN", "ENGINEERING", "AI"];

// base frequencies (cycles across the field) per source — kept close so interference
// fringes are broad and legible rather than a fine moiré.
const BASE_FREQ = [3.1, 3.7, 4.3];

const src = (amp, srcIndex, phase = 0) => ({
  amp,
  freq: BASE_FREQ[srcIndex],
  phase,
});

export const beats = [
  {
    id: "hook",
    label: null,
    kind: "hook",
    eyebrow: "DANIEL PARK",
    title: "I build the software I used to buy.",
    body: null,
    sub: "An interference field. Three careers, one constructive peak.",
    peak: 0.35,
    sources: [src(0.1, 0), src(0.1, 1), src(0.1, 2)],
  },
  {
    id: "domain",
    label: "DOMAIN",
    kind: "sources",
    eyebrow: "SOURCE 01",
    title: "I bought enterprise software for a living.",
    body: "Years inside procurement taught me exactly where the money leaks and why the tools never fix it.",
    sub: "Bank of America · Richemont · Stevens",
    peak: 0.45,
    sources: [src(0.18, 0), src(0.07, 1), src(0.07, 2)],
  },
  {
    id: "engineering",
    label: "ENGINEERING",
    kind: "sources",
    eyebrow: "SOURCE 02",
    title: "Then I learned to build it.",
    body: "Production systems, not prototypes — the discipline to ship software that holds up under real load.",
    sub: "Full-stack · distributed systems · Rutgers",
    peak: 0.45,
    sources: [src(0.07, 0), src(0.18, 1), src(0.07, 2)],
  },
  {
    id: "ai",
    label: "AI",
    kind: "sources",
    eyebrow: "SOURCE 03",
    title: "Now I compound it with agents.",
    body: "Multi-agent systems that do the work, not demos that describe it.",
    sub: "Agent orchestration · evals · tooling",
    peak: 0.45,
    sources: [src(0.07, 0), src(0.07, 1), src(0.18, 2)],
  },
  {
    id: "thesis",
    label: "THESIS",
    kind: "thesis",
    eyebrow: "WHERE THEY MEET",
    title: "Three waves in phase don't add. They amplify.",
    body: "Domain knowledge, engineering, and AI are each ordinary alone. Aligned, they constructively interfere — and the value lives in the peak.",
    sub: null,
    peak: 0.4, // quiet before the ignition
    sources: [src(0.12, 0), src(0.12, 1), src(0.12, 2)],
  },
  {
    id: "pactwise",
    label: "PACTWISE",
    kind: "pactwise",
    eyebrow: "THE CONSTRUCTIVE MAX",
    title: "PactWise",
    body: "Procurement intelligence that reads a contract the way a buyer does — and tells you what to do about it before the renewal lands.",
    // outcome sentence first (buyer's words), then spec list:
    outcome:
      "It catches the auto-renewal you'd have missed and the clause that costs you at scale.",
    specs: [
      "27-agent orchestration", // UNVERIFIED
      "<200KB initial bundle", // UNVERIFIED
      "Real-time contract analysis",
      "Built end-to-end, solo",
    ],
    url: "https://pactwise.com", // UNVERIFIED — replace with real URL
    sub: null,
    peak: 1.0, // brightest ignition — all sources equal
    sources: [src(0.2, 0), src(0.2, 1), src(0.2, 2)],
  },
  {
    id: "record",
    label: "RECORD",
    kind: "record",
    eyebrow: "TRACK RECORD",
    title: "The numbers behind the judgment.",
    body: null,
    // UNVERIFIED metrics — confirm before deploy.
    metrics: [
      { value: "500", unit: "vendors", note: "Ariba SLP onboarding" },
      { value: "+50%", unit: "YoY", note: "NSPO spend under management" },
      { value: "27", unit: "agents", note: "PactWise orchestration" },
    ],
    sub: null,
    peak: 0.55,
    sources: [src(0.13, 0), src(0.13, 1), src(0.13, 2)],
  },
  {
    id: "close",
    label: "CLOSE",
    kind: "close",
    eyebrow: "THE LOOP",
    title: "This site was built with Claude Code.",
    body: "The same recursive method — domain, engineering, agents — that built PactWise built the thing you're reading. The loop closes.",
    sub: "Let's build something that compounds.",
    peak: 0.85, // closing image holds near the peak
    sources: [src(0.18, 0), src(0.18, 1), src(0.18, 2)],
  },
];

// The beat index whose peak is the thesis ignition (used by HUD + reduced-motion still).
export const PEAK_BEAT_INDEX = beats.findIndex((b) => b.id === "pactwise");

export default beats;
