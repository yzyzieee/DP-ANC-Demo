import type { ContentInfo } from "../types/scene";

interface Props {
  desiredContents: ContentInfo[];
  noiseContents: ContentInfo[];
  desiredContent: string;
  noiseContent: string;
  desiredDeg: number;
  noiseDeg: number;
  desiredDirections: number[];
  noiseDirections: number[];
  onChangeDesiredContent: (id: string) => void;
  onChangeNoiseContent: (id: string) => void;
  onChangeDesiredDeg: (deg: number) => void;
  onChangeNoiseDeg: (deg: number) => void;
}

/** Dropdown controls — the accessible fallback for the draggable SVG scene (§4). */
export function SceneControls({
  desiredContents,
  noiseContents,
  desiredContent,
  noiseContent,
  desiredDeg,
  noiseDeg,
  desiredDirections,
  noiseDirections,
  onChangeDesiredContent,
  onChangeNoiseContent,
  onChangeDesiredDeg,
  onChangeNoiseDeg,
}: Props) {
  return (
    <>
      <div className="control-group">
        <label htmlFor="desired-content">Desired content (blue)</label>
        <div className="row">
          <select
            id="desired-content"
            value={desiredContent}
            onChange={(e) => onChangeDesiredContent(e.target.value)}
          >
            {desiredContents.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select
            aria-label="Desired direction (degrees)"
            value={desiredDeg}
            onChange={(e) => onChangeDesiredDeg(Number(e.target.value))}
          >
            {desiredDirections.map((d) => (
              <option key={d} value={d}>{d}°</option>
            ))}
          </select>
        </div>
      </div>

      <div className="control-group">
        <label htmlFor="noise-content">Non-desired content (orange)</label>
        <div className="row">
          <select
            id="noise-content"
            value={noiseContent}
            onChange={(e) => onChangeNoiseContent(e.target.value)}
          >
            {noiseContents.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select
            aria-label="Non-desired direction (degrees)"
            value={noiseDeg}
            onChange={(e) => onChangeNoiseDeg(Number(e.target.value))}
          >
            {noiseDirections.map((d) => (
              <option key={d} value={d}>{d}°</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
