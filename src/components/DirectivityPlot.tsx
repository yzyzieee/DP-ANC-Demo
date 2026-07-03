import { useState } from "react";
import { polarToSvg } from "../lib/angleUtils";
import type { DirectivitySample } from "../lib/sceneResolver";

interface Props {
  samples: DirectivitySample[];
  currentDeg: number;
  desiredDeg: number;
  color: string;
  methodLabel: string;
}

type Metric = "nr" | "osnr" | "dist";

interface MetricCfg {
  short: string;        // toggle button
  label: string;        // full name (title + readout)
  min: number;
  max: number;
  better: "high" | "low";
  rings: number[];
  hint: string;
  blurb: string;
}

const METRICS: Record<Metric, MetricCfg> = {
  nr: {
    short: "Noise reduction",
    label: "Noise reduction",
    min: 0, max: 30, better: "high", rings: [0, 10, 20, 30], hint: "↑ better",
    blurb: "How much the non-desired sound is cancelled. It stays high even near the desired direction — because there it cancels the desired sound too.",
  },
  osnr: {
    short: "Output SNR",
    label: "Output SNR",
    min: -15, max: 20, better: "high", rings: [-10, 0, 10, 20], hint: "↑ better",
    blurb: "Desired vs residual-noise energy after control. Note the deep notch toward the desired direction: near-coincident sources cannot be separated (the resolution limit).",
  },
  dist: {
    short: "Preservation",
    label: "Desired-signal distortion",
    min: -20, max: 2, better: "low", rings: [0, -5, -10, -15], hint: "↓ better (more negative = preserved)",
    blurb: "How much the desired sound is altered. The curve bulges out where the desired is well preserved and pulls toward the center near the desired direction, where it gets cancelled too.",
  },
};

const VB = 320;
const C = VB / 2;
const R_MAX = 116;

export function DirectivityPlot({ samples, currentDeg, desiredDeg, color, methodLabel }: Props) {
  const [metric, setMetric] = useState<Metric>("dist");
  const cfg = METRICS[metric];

  // radius grows with "better" for every metric (high-better or low-better).
  const radius = (v: number) => {
    let frac = (Math.max(cfg.min, Math.min(cfg.max, v)) - cfg.min) / (cfg.max - cfg.min);
    if (cfg.better === "low") frac = 1 - frac;
    return frac * R_MAX;
  };

  const valueOf = (s: DirectivitySample): number | null =>
    metric === "nr" ? s.nr : metric === "osnr" ? s.osnr : s.dist;

  const pts = samples
    .map((s) => ({ deg: s.deg, v: valueOf(s) }))
    .filter((s): s is { deg: number; v: number } => s.v !== null && Number.isFinite(s.v));

  const poly = pts
    .map((s) => {
      const p = polarToSvg(s.deg, radius(s.v), C, C);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  const cur = pts.reduce<{ deg: number; v: number } | null>((best, s) => {
    if (best === null) return s;
    const d = (a: number) => Math.min(Math.abs(a - currentDeg), 360 - Math.abs(a - currentDeg));
    return d(s.deg) < d(best.deg) ? s : best;
  }, null);
  const curPos = cur ? polarToSvg(cur.deg, radius(cur.v), C, C) : null;
  const desiredEnd = polarToSvg(desiredDeg, R_MAX, C, C);
  const wedge = (half: number) =>
    `M ${C} ${C} L ${polarToSvg(desiredDeg - half, R_MAX, C, C).x} ${polarToSvg(desiredDeg - half, R_MAX, C, C).y} A ${R_MAX} ${R_MAX} 0 0 0 ${polarToSvg(desiredDeg + half, R_MAX, C, C).x} ${polarToSvg(desiredDeg + half, R_MAX, C, C).y} Z`;

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{cfg.label} vs. non-desired direction</h2>
        <div className="segmented" role="group" aria-label="Directivity metric" style={{ flex: "0 0 auto" }}>
          {(["nr", "osnr", "dist"] as Metric[]).map((m) => (
            <button key={m} className="seg-btn" aria-pressed={m === metric} onClick={() => setMetric(m)}>
              {METRICS[m].short}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <svg viewBox={`0 0 ${VB} ${VB}`} className="directivity-svg" role="img"
             aria-label={`Polar plot of ${cfg.label} versus non-desired direction for ${methodLabel}`}>
          {cfg.rings.map((db) => (
            <g key={db}>
              <circle cx={C} cy={C} r={radius(db)} fill="none" stroke="var(--neutral-soft)" strokeWidth={1} />
              <text x={C + 3} y={C - radius(db) + 11} fontSize={9} fill="var(--text-dim)">{db}</text>
            </g>
          ))}
          <text x={C + 3} y={C - R_MAX - 2} fontSize={9} fill="var(--text-dim)">dB</text>

          <path d={wedge(15)} fill="var(--desired-soft)" opacity={0.5} />
          <line x1={C} y1={C} x2={desiredEnd.x} y2={desiredEnd.y} stroke="var(--desired)" strokeWidth={1.5} strokeDasharray="4 3" />

          {pts.length > 1 && (
            <polygon points={poly} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          )}

          {curPos && (
            <>
              <line x1={C} y1={C} x2={curPos.x} y2={curPos.y} stroke="var(--noise)" strokeWidth={1.5} />
              <circle cx={curPos.x} cy={curPos.y} r={6} fill="var(--noise)" stroke="#fff" strokeWidth={2} />
            </>
          )}
        </svg>

        <div className="directivity-readout">
          <div className="dr-method" style={{ color }}>{methodLabel}</div>
          <div className="dr-value">{cur ? `${cur.v > 0 ? "+" : ""}${cur.v.toFixed(1)} dB` : "—"}</div>
          <div className="dr-sub">{cfg.label.toLowerCase()} at {Math.round(currentDeg)}° &middot; {cfg.hint}</div>
          <p className="scene-hint" style={{ marginTop: 10 }}>
            Blue = desired direction. Drag the non-desired source: the orange dot follows the curve. {cfg.blurb}
          </p>
        </div>
      </div>
    </div>
  );
}
