import type { Experiment } from "../types/scene";

interface Props {
  experiments: Experiment[];
  currentId: string;
  onSelect: (id: string) => void;
}

export function ExperimentTabs({ experiments, currentId, onSelect }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Experiment set">
      {experiments.map((exp) => (
        <button
          key={exp.id}
          role="tab"
          aria-selected={exp.id === currentId}
          className="tab"
          onClick={() => onSelect(exp.id)}
          title={exp.description}
        >
          {exp.label}
        </button>
      ))}
    </div>
  );
}
