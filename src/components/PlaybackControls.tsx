import {
  COMPONENT_ORDER,
  COMPONENT_LABELS,
  type ComponentId,
} from "../types/scene";

interface Props {
  isPlaying: boolean;
  canPlay: boolean;
  component: ComponentId;
  volume: number;
  onToggle: () => void;
  onRestart: () => void;
  onChangeComponent: (c: ComponentId) => void;
  onChangeVolume: (v: number) => void;
}

export function PlaybackControls({
  isPlaying,
  canPlay,
  component,
  volume,
  onToggle,
  onRestart,
  onChangeComponent,
  onChangeVolume,
}: Props) {
  return (
    <>
      <div className="control-group">
        <label id="component-label">Playback mode</label>
        <div className="segmented" role="group" aria-labelledby="component-label">
          {COMPONENT_ORDER.map((c) => (
            <button
              key={c}
              className="seg-btn"
              aria-pressed={c === component}
              onClick={() => onChangeComponent(c)}
            >
              {COMPONENT_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <div className="playback">
          <button className="btn primary" onClick={onToggle} disabled={!canPlay} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button className="btn" onClick={onRestart} disabled={!canPlay}>↻ Restart</button>
          <div className="volume">
            <label htmlFor="vol">Volume</label>
            <input
              id="vol"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onChangeVolume(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </>
  );
}
