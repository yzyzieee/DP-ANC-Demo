import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, type StemKey } from "../lib/audioEngine";
import { assetUrl } from "./useSceneManifest";
import {
  COMPONENT_ORDER,
  METHOD_ORDER,
  type ComponentId,
  type MethodId,
  type Scene,
} from "../types/scene";

export type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function stemKey(method: MethodId, component: ComponentId): StemKey {
  return `${method}:${component}`;
}

interface AudioControls {
  loadState: LoadState;
  isPlaying: boolean;
  /** Playback position in [0, 1] of the clip, for the visualization cursor. */
  progress: number;
  duration: number;
  volume: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  setVolume: (v: number) => void;
  /** Peak envelope of a given stem for the waveform view (null until loaded). */
  peaksFor: (method: MethodId, component: ComponentId, bins: number) => number[] | null;
}

/**
 * Owns a single AudioEngine, preloads all stems of `scene`, and keeps the active
 * stem in sync with (method, component). Switching method/component preserves the
 * timeline; switching scene stops and reloads.
 */
export function useSynchronizedAudio(
  scene: Scene | null,
  method: MethodId,
  component: ComponentId
): AudioControls {
  const engineRef = useRef<AudioEngine | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);

  // Lazily create the engine on first use (needs a browser AudioContext).
  const getEngine = useCallback((): AudioEngine => {
    if (!engineRef.current) engineRef.current = new AudioEngine();
    return engineRef.current;
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Preload stems whenever the scene changes.
  useEffect(() => {
    if (!scene) {
      setLoadState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    setIsPlaying(false);

    (async () => {
      try {
        const engine = getEngine();
        const jobs: Array<Promise<[StemKey, AudioBuffer]>> = [];
        for (const m of METHOD_ORDER) {
          const entry = scene.methods[m];
          if (!entry?.available || !entry.audio) continue;
          for (const c of COMPONENT_ORDER) {
            const rel = entry.audio[c];
            jobs.push(
              (async () => {
                const res = await fetch(assetUrl(rel));
                if (!res.ok)
                  throw new Error(`HTTP ${res.status} loading ${rel}`);
                const buf = await engine.decode(await res.arrayBuffer());
                return [stemKey(m, c), buf] as [StemKey, AudioBuffer];
              })()
            );
          }
        }
        if (jobs.length === 0) throw new Error("Scene has no playable audio.");
        const decoded = await Promise.all(jobs);
        if (cancelled) return;

        const map = new Map<StemKey, AudioBuffer>(decoded);
        const dur = decoded[0][1].duration;
        engine.setBuffers(map, dur);
        setDuration(dur);
        setProgress(0);
        setLoadState({ status: "ready" });
      } catch (err) {
        if (!cancelled)
          setLoadState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scene, getEngine]);

  // Keep the active stem in sync with the selection.
  useEffect(() => {
    if (loadState.status !== "ready") return;
    const engine = getEngine();
    const key = stemKey(method, component);
    if (engine.hasStem(key)) engine.select(key);
  }, [method, component, loadState.status, getEngine]);

  // rAF loop for the playback cursor.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        const dur = engine.getDuration();
        setProgress(dur > 0 ? engine.getPosition() / dur : 0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const play = useCallback(() => {
    if (loadState.status !== "ready") return;
    const engine = getEngine();
    engine.select(stemKey(method, component));
    void engine.play().then(() => setIsPlaying(engine.isPlaying()));
  }, [getEngine, loadState.status, method, component]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const restart = useCallback(() => {
    engineRef.current?.restart();
    setProgress(0);
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      getEngine().setVolume(v);
    },
    [getEngine]
  );

  const peaksFor = useCallback(
    (m: MethodId, c: ComponentId, bins: number) =>
      loadState.status === "ready"
        ? getEngine().getPeaks(stemKey(m, c), bins)
        : null,
    [getEngine, loadState.status]
  );

  return {
    loadState,
    isPlaying,
    progress,
    duration,
    volume,
    play,
    pause,
    toggle,
    restart,
    setVolume,
    peaksFor,
  };
}
