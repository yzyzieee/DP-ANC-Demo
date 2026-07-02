// Formatting + tooltip text for the metrics panel. Pure functions (plan §14).

import type { MethodMetrics } from "../types/scene";

/** Format a dB value with a fixed sign and one decimal, or an em dash for null. */
export function formatDb(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value.toFixed(1)} dB`;
}

/** Format STOI (0..1) to three decimals, or em dash. */
export function formatStoi(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

export interface MetricRow {
  key: keyof MethodMetrics;
  label: string;
  value: string;
  tooltip: string;
  /** true = higher is better, false = lower/more-negative is better, null = neutral. */
  higherBetter: boolean | null;
}

/** Build the display rows for one method's metrics, hiding STOI when not applicable. */
export function metricRows(m: MethodMetrics | undefined): MetricRow[] {
  const rows: MetricRow[] = [
    {
      key: "nr_db",
      label: "Noise reduction",
      value: formatDb(m?.nr_db ?? null),
      tooltip: "Energy reduction of the non-desired sound at the error mic. Higher is better.",
      higherBetter: true,
    },
    {
      key: "desired_distortion_db",
      label: "Desired-signal distortion",
      value: formatDb(m?.desired_distortion_db ?? null),
      tooltip:
        "How much control the filter applies to the desired sound. More negative means the desired sound is left more intact.",
      higherBetter: false,
    },
    {
      key: "output_snr_db",
      label: "Output SNR",
      value: formatDb(m?.output_snr_db ?? null),
      tooltip: "Desired-signal energy relative to residual non-desired energy after control. Higher is better.",
      higherBetter: true,
    },
  ];
  // STOI is shown only when the scene actually provides it (speech scenes).
  if (m && m.stoi !== null && m.stoi !== undefined) {
    rows.push({
      key: "stoi",
      label: "Output STOI",
      value: formatStoi(m.stoi),
      tooltip: "Short-time objective intelligibility, shown for speech scenes only. Higher is better.",
      higherBetter: true,
    });
  }
  return rows;
}
