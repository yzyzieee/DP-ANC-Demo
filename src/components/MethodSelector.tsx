import {
  METHOD_ORDER,
  METHOD_LABELS,
  METHOD_BLURB,
  OURS_METHOD,
  type MethodId,
  type Scene,
} from "../types/scene";

interface Props {
  scene: Scene;
  current: MethodId;
  onSelect: (m: MethodId) => void;
}

export function MethodSelector({ scene, current, onSelect }: Props) {
  return (
    <div className="control-group">
      <label id="method-label">Method</label>
      <div className="segmented" role="group" aria-labelledby="method-label">
        {METHOD_ORDER.map((m) => {
          const entry = scene.methods[m];
          const available = !!entry?.available;
          return (
            <button
              key={m}
              className={`seg-btn${m === OURS_METHOD ? " ours" : ""}`}
              aria-pressed={m === current}
              disabled={!available}
              title={!available ? entry?.note ?? "Not available for this scene" : METHOD_BLURB[m]}
              onClick={() => available && onSelect(m)}
            >
              {METHOD_LABELS[m]}
            </button>
          );
        })}
      </div>
      <p className="scene-hint" style={{ marginTop: 8 }}>
        <strong>ANC off</strong> = untouched reference · <strong>Conventional ANC</strong> removes
        everything (desired included) · <strong>Analytical SSANC</strong> and{" "}
        <strong>DP-ANC</strong> remove the noise while <em>preserving the desired direction</em>.
      </p>
      <p className="scene-hint" style={{ marginTop: 4 }}>{METHOD_BLURB[current]}</p>
    </div>
  );
}
