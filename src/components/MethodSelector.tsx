import {
  METHOD_ORDER,
  METHOD_LABELS,
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
              title={!available ? entry?.note ?? "Not available for this scene" : METHOD_LABELS[m]}
              onClick={() => available && onSelect(m)}
            >
              {METHOD_LABELS[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
