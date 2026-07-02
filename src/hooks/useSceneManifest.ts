import { useEffect, useState } from "react";
import type { SceneManifest } from "../types/scene";

/** Prefix a manifest-relative path with Vite's base URL so it resolves on GitHub Pages. */
export function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL; // e.g. "/dp-anc-demo/" or "/"
  const clean = relative.replace(/^\/+/, "");
  return `${base}${clean}`;
}

export type ManifestState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; manifest: SceneManifest };

/** Load and lightly validate public/data/scenes.json. Fails loudly, never silently. */
export function useSceneManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(assetUrl("data/scenes.json"), {
          cache: "no-cache",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} loading scenes.json`);
        const manifest = (await res.json()) as SceneManifest;
        if (!manifest.experiments || manifest.experiments.length === 0) {
          throw new Error("Manifest contains no experiments.");
        }
        if (!cancelled) setState({ status: "ready", manifest });
      } catch (err) {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
