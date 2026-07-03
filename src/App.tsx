import { useEffect, useMemo, useState } from "react";
import "./styles/app.css";
import { useSceneManifest } from "./hooks/useSceneManifest";
import { useSynchronizedAudio } from "./hooks/useSynchronizedAudio";
import {
  METHOD_ORDER,
  METHOD_LABELS,
  OURS_METHOD,
  type ComponentId,
  type ContentInfo,
  type MethodId,
  type SceneManifest,
} from "./types/scene";
import {
  contentsInRole,
  desiredDirsFor,
  noiseDirsFor,
  directivityFor,
  resolveScene,
  type SceneSelection,
} from "./lib/sceneResolver";
import { AcousticScene } from "./components/AcousticScene";
import { ExperimentTabs } from "./components/ExperimentTabs";
import { SceneControls } from "./components/SceneControls";
import { MethodSelector } from "./components/MethodSelector";
import { PlaybackControls } from "./components/PlaybackControls";
import { MetricsPanel } from "./components/MetricsPanel";
import { AudioVisualization } from "./components/AudioVisualization";
import { DirectivityPlot } from "./components/DirectivityPlot";

const VIZ_BINS = 900;

const METHOD_COLOR: Record<MethodId, string> = {
  mixture: "var(--neutral)",
  conventional_anc: "#c2410c",
  analytical_ssanc: "#7c3aed",
  dp_anc: "var(--ours)",
};

function firstAvailableMethod(methods: Partial<Record<MethodId, { available: boolean }>>): MethodId {
  return METHOD_ORDER.find((m) => methods[m]?.available) ?? "mixture";
}

export default function App() {
  const state = useSceneManifest();

  if (state.status === "loading")
    return <div className="app"><p>Loading demo…</p></div>;
  if (state.status === "error")
    return (
      <div className="app">
        <div className="notice error">Failed to load the scene manifest: {state.message}</div>
      </div>
    );

  return <Demo manifest={state.manifest} />;
}

function Demo({ manifest }: { manifest: SceneManifest }) {
  const experiments = manifest.experiments;
  const contentById = useMemo(() => {
    const m = new Map<string, ContentInfo>();
    for (const c of manifest.contents) m.set(c.id, c);
    return m;
  }, [manifest.contents]);

  const [experimentId, setExperimentId] = useState(experiments[0].id);
  const exp = experiments.find((e) => e.id === experimentId) ?? experiments[0];

  const [selection, setSelection] = useState<SceneSelection>(() => {
    const s0 = exp.scenes[0];
    return {
      desiredContent: s0.desired.content_id,
      noiseContent: s0.noise.content_id,
      desiredDeg: s0.desired.direction_deg,
      noiseDeg: s0.noise.direction_deg,
    };
  });

  const [method, setMethod] = useState<MethodId>(OURS_METHOD);
  const [component, setComponent] = useState<ComponentId>("output");

  // Resolve selection → concrete scene (with nearest fallback).
  const resolved = useMemo(() => resolveScene(exp, selection), [exp, selection]);
  const scene = resolved.scene;

  // When the experiment changes, reset the selection to its first scene.
  useEffect(() => {
    const s0 = exp.scenes[0];
    setSelection({
      desiredContent: s0.desired.content_id,
      noiseContent: s0.noise.content_id,
      desiredDeg: s0.desired.direction_deg,
      noiseDeg: s0.noise.direction_deg,
    });
  }, [exp]);

  // If the current method isn't available for the loaded scene, fall back.
  useEffect(() => {
    if (!scene.methods[method]?.available) {
      setMethod(firstAvailableMethod(scene.methods));
    }
  }, [scene, method]);

  const audio = useSynchronizedAudio(scene, method, component);

  // Content option menus (only contents actually present in this experiment/role).
  const desiredContents = useMemo(
    () => contentsInRole(exp, "desired").map((id) => contentById.get(id)!).filter(Boolean),
    [exp, contentById]
  );
  const noiseContents = useMemo(
    () => contentsInRole(exp, "noise").map((id) => contentById.get(id)!).filter(Boolean),
    [exp, contentById]
  );
  // The scene actually loaded drives every displayed value (snap-to-available).
  const dDeg = scene.desired.direction_deg;
  const nDeg = scene.noise.direction_deg;

  // Content-aware grids: desired snaps to its anchors; noise snaps to the directions
  // available for the current desired + noise content.
  const desiredDirections = useMemo(
    () => desiredDirsFor(exp, scene.desired.content_id),
    [exp, scene.desired.content_id]
  );
  const noiseDirections = useMemo(
    () => noiseDirsFor(exp, scene.desired.content_id, dDeg, scene.noise.content_id),
    [exp, scene.desired.content_id, dDeg, scene.noise.content_id]
  );

  // Directivity samples (NR vs non-desired direction) for the selected method.
  const directivitySamples = useMemo(
    () => directivityFor(exp, scene.desired.content_id, dDeg, scene.noise.content_id, method),
    [exp, scene.desired.content_id, dDeg, scene.noise.content_id, method]
  );

  const vizColor =
    component === "desired"
      ? "var(--desired)"
      : component === "noise"
      ? "var(--noise)"
      : method === OURS_METHOD
      ? "var(--ours)"
      : "var(--neutral)";

  const peaks = audio.peaksFor(method, component, VIZ_BINS);

  return (
    <div className="app">
      <header className="header">
        <h1>Directional Preservation Active Noise Control</h1>
        <p className="subtitle">Interactive listening demo for DP-ANC</p>
        <nav className="links">
          <a href="#" aria-disabled="true">Paper</a>
          <a href="https://github.com/yzyzieee/DP-ANC-Demo" target="_blank" rel="noreferrer">Code</a>
          <a href="#" aria-disabled="true">Audio data</a>
          <a href="#citation">Citation</a>
        </nav>
      </header>

      <ExperimentTabs experiments={experiments} currentId={experimentId} onSelect={setExperimentId} />

      {!resolved.exact && resolved.fallbackNote && (
        <div className="notice warn" role="status">{resolved.fallbackNote}</div>
      )}
      {audio.loadState.status === "error" && (
        <div className="notice error" role="alert">Audio failed to load: {audio.loadState.message}</div>
      )}

      <div className="main-grid">
        {/* Left: acoustic scene */}
        <section className="panel">
          <h2>Acoustic scene (top view)</h2>
          <AcousticScene
            geometry={exp.geometry}
            desiredDeg={dDeg}
            noiseDeg={nDeg}
            desiredLabel={scene.desired.label}
            noiseLabel={scene.noise.label}
            desiredGrid={desiredDirections}
            noiseGrid={noiseDirections}
            onChangeDesired={(deg) => setSelection((s) => ({ ...s, desiredDeg: deg }))}
            onChangeNoise={(deg) => setSelection((s) => ({ ...s, noiseDeg: deg }))}
          />
          <div className="scene-legend">
            <span><span className="dot" style={{ background: "var(--desired)" }} />Desired — {scene.desired.label} @ {Math.round(dDeg)}°</span>
            <span><span className="dot" style={{ background: "var(--noise)" }} />Non-desired — {scene.noise.label} @ {Math.round(nDeg)}°</span>
          </div>
          <p className="scene-hint">Drag the orange (N) marker around, or use the dropdowns. Move it close to the blue (D) desired direction to hear the array's angular-resolution limit — nearly-coincident sources cannot be separated.</p>
        </section>

        {/* Right: controls */}
        <section className="panel">
          <h2>Controls</h2>
          <SceneControls
            desiredContents={desiredContents}
            noiseContents={noiseContents}
            desiredContent={scene.desired.content_id}
            noiseContent={scene.noise.content_id}
            desiredDeg={dDeg}
            noiseDeg={nDeg}
            desiredDirections={desiredDirections}
            noiseDirections={noiseDirections}
            onChangeDesiredContent={(id) => setSelection((s) => ({ ...s, desiredContent: id }))}
            onChangeNoiseContent={(id) => setSelection((s) => ({ ...s, noiseContent: id }))}
            onChangeDesiredDeg={(deg) => setSelection((s) => ({ ...s, desiredDeg: deg }))}
            onChangeNoiseDeg={(deg) => setSelection((s) => ({ ...s, noiseDeg: deg }))}
          />
          <MethodSelector scene={scene} current={method} onSelect={setMethod} />
          <PlaybackControls
            isPlaying={audio.isPlaying}
            canPlay={audio.loadState.status === "ready"}
            component={component}
            volume={audio.volume}
            onToggle={audio.toggle}
            onRestart={audio.restart}
            onChangeComponent={setComponent}
            onChangeVolume={audio.setVolume}
          />
          <p className="scene-hint">Headphones are recommended for comparison.</p>
        </section>
      </div>

      <DirectivityPlot
        samples={directivitySamples}
        currentDeg={nDeg}
        desiredDeg={dDeg}
        color={METHOD_COLOR[method]}
        methodLabel={METHOD_LABELS[method]}
      />

      <MetricsPanel scene={scene} method={method} />

      <AudioVisualization
        peaks={peaks}
        progress={audio.progress}
        positionSec={audio.progress * audio.duration}
        durationSec={audio.duration}
        color={vizColor}
      />

      <footer className="footer" id="citation">
        <p><strong>Offline auralization.</strong> {manifest.disclaimer}</p>
        <p>Methods: ANC off (reference) · Conventional ANC · Analytical SSANC · DP-ANC.</p>
        <p>Contact: <a href="mailto:ziyi016@e.ntu.edu.sg">ziyi016@e.ntu.edu.sg</a></p>
      </footer>
    </div>
  );
}
