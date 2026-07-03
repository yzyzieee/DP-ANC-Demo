import { useCallback, useRef } from "react";
import type { ArrayGeometry } from "../types/scene";
import { polarToSvg, snapToGrid, svgToPolarDeg, normalizeDeg } from "../lib/angleUtils";

const VB_W = 360;
const VB_H = 400;
const CX = VB_W / 2;
const CY = 232; // shifted down to leave room for the in-figure key at the top
const R_RING = 108;
const R_SRC = 138;
const PROTECT_HALF_DEG = 15; // angular-resolution limit (empirical), not a trained sector

interface Props {
  geometry: ArrayGeometry;
  desiredDeg: number;
  noiseDeg: number;
  desiredLabel: string;
  noiseLabel: string;
  desiredGrid: number[];
  noiseGrid: number[];
  onChangeDesired: (deg: number) => void;
  onChangeNoise: (deg: number) => void;
}

/** SVG pie-wedge for the desired protection sector. */
function wedgePath(centerDeg: number, halfDeg: number, r: number): string {
  const p0 = polarToSvg(centerDeg - halfDeg, r, CX, CY);
  const p1 = polarToSvg(centerDeg + halfDeg, r, CX, CY);
  return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 0 0 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

export function AcousticScene({
  geometry,
  desiredDeg,
  noiseDeg,
  desiredLabel,
  noiseLabel,
  desiredGrid,
  noiseGrid,
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
    const x = ((clientX - rect.left) / rect.width) * VB_W;
    const y = ((clientY - rect.top) / rect.height) * VB_H;
    return svgToPolarDeg(x, y, CX, CY);
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const which = dragging.current;
      if (!which) return;
      const g = which === "desired" ? desiredGrid : noiseGrid;
      const snapped = snapToGrid(pointerToDeg(clientX, clientY), g);
      if (which === "desired") onChangeDesired(snapped);
      else onChangeNoise(snapped);
    },
    [desiredGrid, noiseGrid, onChangeDesired, onChangeNoise, pointerToDeg]
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
    const g = which === "desired" ? desiredGrid : noiseGrid;
    if (g.length === 0) return;
    const sorted = [...g].sort((a, b) => a - b);
    const idx = sorted.findIndex((g) => Math.abs(normalizeDeg(g) - normalizeDeg(cur)) < 1e-6);
    const next = sorted[(idx + dir + sorted.length) % sorted.length] ?? sorted[0];
    if (which === "desired") onChangeDesired(next);
    else onChangeNoise(next);
  };

  const onKey = (which: "desired" | "noise") => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); stepAngle(which, 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); stepAngle(which, -1); }
  };

  const desiredPos = polarToSvg(desiredDeg, R_SRC, CX, CY);
  const noisePos = polarToSvg(noiseDeg, R_SRC, CX, CY);
  // Push each source's text label outward along its own radius, then clamp inside the viewBox.
  const dLbl = polarToSvg(desiredDeg, R_SRC + 26, CX, CY);
  const nLbl = polarToSvg(noiseDeg, R_SRC + 26, CX, CY);
  const clampX = (x: number) => Math.max(52, Math.min(VB_W - 52, x));

  // In-figure key entries
  const keyRow = (x: number, y: number, swatch: React.ReactNode, text: string, color: string) => (
    <g>
      <g transform={`translate(${x}, ${y})`}>{swatch}</g>
      <text x={x + 16} y={y + 4} fontSize={11} fill={color} fontWeight={600}>{text}</text>
    </g>
  );

  return (
    <svg
      ref={svgRef}
      className="scene-svg"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="group"
      aria-label="Top-view acoustic scene: microphone array with desired and non-desired sources"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* ---- in-figure key ---- */}
      {keyRow(10, 12, <circle r={6} fill="var(--desired)" stroke="#fff" strokeWidth={1.5} />, "Desired — keep this direction", "var(--desired)")}
      {keyRow(10, 30, <circle r={6} fill="var(--noise)" stroke="#fff" strokeWidth={1.5} />, "Non-desired — cancel this direction", "var(--noise)")}
      {keyRow(10, 48, <circle r={4.5} fill="var(--neutral)" />, `Reference mic × ${geometry.n_ref_mics}`, "var(--text-dim)")}
      {keyRow(200, 48, <rect x={-4} y={-4} width={8} height={8} rx={1.5} fill="#374151" />, "Error mic (center)", "var(--text-dim)")}

      {/* protection sector around the desired direction */}
      <path d={wedgePath(desiredDeg, PROTECT_HALF_DEG, R_SRC)} fill="var(--desired-soft)" opacity={0.7} />

      {/* array ring + reference mics */}
      <circle cx={CX} cy={CY} r={R_RING} fill="none" stroke="var(--neutral-soft)" strokeWidth={2} />
      {refMicAngles.map((a, i) => {
        const p = polarToSvg(a, R_RING, CX, CY);
        return <circle key={i} cx={p.x} cy={p.y} r={5} fill="var(--neutral)" />;
      })}
      <text x={CX} y={CY - R_RING - 8} textAnchor="middle" fontSize={10} fill="var(--text-dim)">
        reference mic array
      </text>

      {/* center error mic */}
      <rect x={CX - 6} y={CY - 6} width={12} height={12} rx={2} fill="#374151" />
      <text x={CX} y={CY + 22} textAnchor="middle" fontSize={10} fill="var(--text-dim)">error mic</text>

      {/* radial lines to sources */}
      <line x1={CX} y1={CY} x2={desiredPos.x} y2={desiredPos.y} stroke="var(--desired)" strokeWidth={2} opacity={0.45} />
      <line x1={CX} y1={CY} x2={noisePos.x} y2={noisePos.y} stroke="var(--noise)" strokeWidth={2} opacity={0.45} />

      {/* desired source (draggable) */}
      <g
        role="slider"
        tabIndex={0}
        aria-label={`Desired source direction: ${desiredLabel}`}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(desiredDeg)}
        aria-valuetext={`${Math.round(desiredDeg)} degrees, desired: ${desiredLabel}`}
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown("desired")}
        onKeyDown={onKey("desired")}
      >
        <circle cx={desiredPos.x} cy={desiredPos.y} r={14} fill="var(--desired)" stroke="#fff" strokeWidth={2.5} />
        <text x={desiredPos.x} y={desiredPos.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">D</text>
        <text
          x={clampX(dLbl.x)} y={dLbl.y} textAnchor="middle" fontSize={11} fontWeight={700}
          fill="var(--desired)" stroke="#fff" strokeWidth={3} paintOrder="stroke"
        >
          Desired · {Math.round(desiredDeg)}°
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
        aria-valuetext={`${Math.round(noiseDeg)} degrees, non-desired: ${noiseLabel}`}
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown("noise")}
        onKeyDown={onKey("noise")}
      >
        <circle cx={noisePos.x} cy={noisePos.y} r={14} fill="var(--noise)" stroke="#fff" strokeWidth={2.5} />
        <text x={noisePos.x} y={noisePos.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">N</text>
        <text
          x={clampX(nLbl.x)} y={nLbl.y} textAnchor="middle" fontSize={11} fontWeight={700}
          fill="var(--noise)" stroke="#fff" strokeWidth={3} paintOrder="stroke"
        >
          Noise · {Math.round(noiseDeg)}°
        </text>
      </g>
    </svg>
  );
}
