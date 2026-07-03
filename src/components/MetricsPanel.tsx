import {
  METHOD_LABELS,
  OURS_METHOD,
  type MethodId,
  type Scene,
} from "../types/scene";
import { metricRows } from "../lib/metricFormatting";

interface Props {
  scene: Scene;
  method: MethodId;
}

export function MetricsPanel({ scene, method }: Props) {
  const entry = scene.methods[method];
  const rows = metricRows(entry?.metrics);
  const isMixture = method === "mixture";

  return (
    <section className="panel" aria-live="polite">
      <h2>Metrics</h2>
      <div className="method-metric-title">
        {METHOD_LABELS[method]}
        {method === OURS_METHOD && <span className="badge-ours">ours</span>}
      </div>

      {!entry?.available ? (
        <p className="metric-label">{entry?.note ?? "This method is not available for the current scene."}</p>
      ) : (
        <div className="metrics">
          {rows.map((r) => (
            <div className="metric-row" key={r.key}>
              <span className="metric-label">
                {r.label}
                <span className="metric-hint" title={r.tooltip} aria-label={r.tooltip}>ⓘ</span>
              </span>
              <span className="metric-value">{r.value}</span>
            </div>
          ))}
          {isMixture && (
            <p className="metric-label" style={{ marginTop: 4 }}>
              With ANC off nothing is cancelled — this is the reference, so noise reduction is 0 dB by definition.
            </p>
          )}
        </div>
      )}
      <p className="metric-label" style={{ marginTop: 12, fontSize: "0.78rem" }}>
        Values are energy ratios (dB) measured on the played clip, with the control filter
        estimated from a {scene.observation_window_s}s observation window (λ = {scene.lambda},
        input SNR {scene.input_snr_db} dB).
      </p>
    </section>
  );
}
