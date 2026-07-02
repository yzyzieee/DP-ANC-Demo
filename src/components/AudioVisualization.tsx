import { useEffect, useRef } from "react";

interface Props {
  peaks: number[] | null;
  progress: number; // 0..1
  positionSec: number;
  durationSec: number;
  /** Color of the waveform (matches the active method's semantic color). */
  color: string;
}

const W = 900;
const H = 120;

function fmt(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1);
  return `${m}:${rem.padStart(4, "0")}`;
}

export function AudioVisualization({ peaks, progress, positionSec, durationSec, color }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    // baseline
    ctx.strokeStyle = "#cbd2da";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    if (peaks && peaks.length > 0) {
      const maxPeak = Math.max(1e-6, ...peaks);
      const barW = W / peaks.length;
      ctx.fillStyle = color;
      for (let i = 0; i < peaks.length; i++) {
        const h = (peaks[i] / maxPeak) * (H / 2 - 4);
        const x = i * barW;
        ctx.fillRect(x, H / 2 - h, Math.max(1, barW - 0.5), h * 2);
      }
    } else {
      ctx.fillStyle = "#9aa3af";
      ctx.font = "13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Loading audio…", W / 2, H / 2 - 8);
    }

    // playback cursor
    const cx = Math.min(W - 1, Math.max(0, progress * W));
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.stroke();
  }, [peaks, progress, color]);

  return (
    <div className="viz-wrap panel">
      <h2>Waveform (synchronized cursor)</h2>
      <canvas ref={canvasRef} className="viz-canvas" width={W} height={H} aria-hidden="true" />
      <div className="viz-time">{fmt(positionSec)} / {fmt(durationSec)}</div>
    </div>
  );
}
