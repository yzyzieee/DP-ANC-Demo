import {
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

// SSANC is an analytical baseline (the per-scene directional-preservation competitor),
// so it belongs with the baselines; DP-ANC is the proposed learned method.
const GROUPS: { title: string; methods: MethodId[] }[] = [
  { title: "Baselines", methods: ["mixture", "conventional_anc", "analytical_ssanc"] },
  { title: "Ours", methods: ["dp_anc"] },
];

export function MethodSelector({ scene, current, onSelect }: Props) {
  return (
    <div className="control-group">
      <label id="method-label">Method</label>
      <div className="method-groups" role="radiogroup" aria-labelledby="method-label">
        {GROUPS.map((g) => (
          <fieldset className="method-group" key={g.title}>
            <legend>{g.title}</legend>
            <div className="segmented">
              {g.methods.map((m) => {
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
          </fieldset>
        ))}
      </div>
      <p className="scene-hint" style={{ marginTop: 6 }}>
        <strong>ANC off</strong> = reference · <strong>Conventional ANC</strong> removes all sound ·{" "}
        <strong>Analytical SSANC</strong> (analytical) and <strong>DP-ANC</strong> (ours) preserve the
        desired direction.
      </p>
    </div>
  );
}
