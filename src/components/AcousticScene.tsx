import { useCallback, useRef } from "react";
import type { ArrayGeometry } from "../types/scene";
import { polarToSvg, snapToGrid, svgToPolarDeg, normalizeDeg } from "../lib/angleUtils";

const VB = 360;
const C = VB / 2;
const R_RING = 118;
const R_SRC = 150;
const R_LABEL = 150;
const PROTECT_HALF_DEG = 15; // angular-resolution limit (empirical), not a trained sector

interface Props {
  geometry: ArrayGeometry;
  desiredDeg: number;
  noiseDeg: number;
  desiredLabel: string;
  noiseLabel: string;
  grid: number[];
  onChangeDesired: (deg: number) => void;
  onChangeNoise: (deg: number) => void;
}

/** SVG pie-wedge for the desired protection sector. */
function wedgePath(centerDeg: number, halfDeg: number, r: number): string {
  const a0 = centerDeg - halfDeg;
  const a1 = centerDeg + halfDeg;
  const p0 = polarToSvg(a0, r, C, C);
  const p1 = polarToSvg(a1, r, C, C);
  // sweep-flag 0 because SVG y is flipped relative to our CCW convention
  return `M ${C} ${C} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 0 0 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

export function AcousticScene({
  geometry,
  desiredDeg,
  noiseDeg,
  desiredLabel,
  noiseLabel,
  grid,
  onChangeDesired,
  onChangeNoise,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<"desired" | "noise" | null>(null);

  const refMicAngles = geometry.circular
    ? Array.from({ length: geometry.n_ref_mics }, (_, k) => (360 * k) / geometry.n_ref_mics)
    : geometry.ref_mic_deg ?? [];

  const pointerToDeg = useCallback((clientX: number, clientY: number): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VB;
    const y = ((clientY - rect.top) / rect.height) * VB;
    return svgToPolarDeg(x, y, C, C);
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragging.current) return;
      const snapped = snapToGrid(pointerToDeg(clientX, clientY), grid);
      if (dragging.current === "desired") onChangeDesired(snapped);
      else onChangeNoise(snapped);
    },
    [grid, onChangeDesired, onChangeNoise, pointerToDeg]
  );

  const onPointerDown = (which: "desired" | "noise") => (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = which;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => handleMove(e.clientX, e.clientY);
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const stepAngle = (which: "desired" | "noise", dir: 1 | -1) => {
    const cur = which === "desired" ? desiredDeg : noiseDeg;
    if (grid.length === 0) return;
    const sorted = [...grid].sort((a, b) => a - b);
    const idx = sorted.findIndex((g) => Math.abs(normalizeDeg(g) - normalizeDeg(cur)) < 1e-6);
    const next = sorted[(idx + dir + sorted.length) % sorted.length] ?? sorted[0];
    if (which === "desired") onChangeDesired(next);
    else onChangeNoise(next);
  };

  const onKey = (which: "desired" | "noise") => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); stepAngle(which, 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); stepAngle(which, -1); }
  };

  const desiredPos = polarToSvg(desiredDeg, R_SRC, C, C);
  const noisePos = polarToSvg(noiseDeg, R_SRC, C, C);
  const desiredLabelPos = polarToSvg(desiredDeg, R_LABEL + 22, C, C);
  const noiseLabelPos = polarToSvg(noiseDeg, R_LABEL + 22, C, C);

  return (
    <svg
      ref={svgRef}
      className="scene-svg"
      viewBox={`0 0 ${VB} ${VB}`}
      role="group"
      aria-label="Top-view acoustic scene: microphone array with desired and non-desired sources"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* protection sector around the desired direction */}
      <path d={wedgePath(desiredDeg, PROTECT_HALF_DEG, R_SRC)} fill="var(--desired-soft)" opacity={0.65} />

      {/* array ring */}
      <circle cx={C} cy={C} r={R_RING} fill="none" stroke="var(--neutral-soft)" strokeWidth={2} />

      {/* reference mics */}
      {refMicAngles.map((a, i) => {
        const p = polarToSvg(a, R_RING, C, C);
        return <circle key={i} cx={p.x} cy={p.y} r={5} fill="var(--neutral)" />;
      })}

      {/* center error mic */}
      <rect x={C - 6} y={C - 6} width={12} height={12} rx={2} fill="#374151" />
      <text x={C} y={C + 22} textAnchor="middle" fontSize={10} fill="var(--text-dim)">error mic</text>

      {/* radial lines to sources */}
      <line x1={C} y1={C} x2={desiredPos.x} y2={desiredPos.y} stroke="var(--desired)" strokeWidth={2} strokeDasharray="1 0" opacity={0.5} />
      <line x1={C} y1={C} x2={noisePos.x} y2={noisePos.y} stroke="var(--noise)" strokeWidth={2} opacity={0.5} />

      {/* desired source (draggable) */}
      <g
        role="slider"
        tabIndex={0}
        aria-label={`Desired source direction: ${desiredLabel}`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(desiredDeg)}
        aria-valuetext={`${Math.round(desiredDeg)} degrees, ${desiredLabel}`}
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown("desired")}
        onKeyDown={onKey("desired")}
      >
        <circle cx={desiredPos.x} cy={desiredPos.y} r={13} fill="var(--desired)" stroke="#fff" strokeWidth={2} />
        <text x={desiredPos.x} y={desiredPos.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">D</text>
        <text x={desiredLabelPos.x} y={desiredLabelPos.y} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--desired)">
          {Math.round(desiredDeg)}°
        </text>
      </g>

      {/* non-desired source (draggable) */}
      <g
        role="slider"
        tabIndex={0}
        aria-label={`Non-desired source direction: ${noiseLabel}`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(noiseDeg)}
        aria-valuetext={`${Math.round(noiseDeg)} degrees, ${noiseLabel}`}
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown("noise")}
        onKeyDown={onKey("noise")}
      >
        <circle cx={noisePos.x} cy={noisePos.y} r={13} fill="var(--noise)" stroke="#fff" strokeWidth={2} />
        <text x={noisePos.x} y={noisePos.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">N</text>
        <text x={noiseLabelPos.x} y={noiseLabelPos.y} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--noise)">
          {Math.round(noiseDeg)}°
        </text>
      </g>
    </svg>
  );
}
