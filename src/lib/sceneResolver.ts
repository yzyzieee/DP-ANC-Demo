// Scene resolution: turn a user's selection into a concrete manifest Scene, with
// explicit nearest-available fallback and role-swap logic. All pure functions so
// they can be unit-tested without React or the DOM (plan §14).

import type { Experiment, Scene } from "../types/scene";
import { circularDistanceDeg } from "./angleUtils";

/** A user's current selection within one experiment. */
export interface SceneSelection {
  desiredContent: string;
  noiseContent: string;
  desiredDeg: number;
  noiseDeg: number;
}

export interface ResolveResult {
  scene: Scene;
  /** true when an exact match existed; false when we fell back to the nearest scene. */
  exact: boolean;
  /** Human-readable note when a fallback happened (else undefined). */
  fallbackNote?: string;
}

/** Exact match: same contents AND same directions. */
function findExact(exp: Experiment, sel: SceneSelection): Scene | undefined {
  return exp.scenes.find(
    (s) =>
      s.desired.content_id === sel.desiredContent &&
      s.noise.content_id === sel.noiseContent &&
      s.desired.direction_deg === sel.desiredDeg &&
      s.noise.direction_deg === sel.noiseDeg
  );
}

/**
 * Score how far a scene is from a selection. Content mismatch is penalized far more
 * than angle mismatch so we prefer the right sounds at a nearby angle over the wrong
 * sounds at the exact angle.
 */
function distance(scene: Scene, sel: SceneSelection): number {
  const contentPenalty =
    (scene.desired.content_id === sel.desiredContent ? 0 : 1000) +
    (scene.noise.content_id === sel.noiseContent ? 0 : 1000);
  const anglePenalty =
    circularDistanceDeg(scene.desired.direction_deg, sel.desiredDeg) +
    circularDistanceDeg(scene.noise.direction_deg, sel.noiseDeg);
  return contentPenalty + anglePenalty;
}

/** Nearest available scene by the scoring above (exp assumed to have ≥1 scene). */
export function findNearest(exp: Experiment, sel: SceneSelection): Scene {
  let best = exp.scenes[0];
  let bestD = distance(best, sel);
  for (const s of exp.scenes) {
    const d = distance(s, sel);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/**
 * Resolve a selection to a concrete scene. Never fails silently: when no exact
 * match exists it returns the nearest scene with `exact: false` and a note.
 */
export function resolveScene(
  exp: Experiment,
  sel: SceneSelection
): ResolveResult {
  const exact = findExact(exp, sel);
  if (exact) return { scene: exact, exact: true };

  const scene = findNearest(exp, sel);
  const contentChanged =
    scene.desired.content_id !== sel.desiredContent ||
    scene.noise.content_id !== sel.noiseContent;
  const note = contentChanged
    ? "That exact combination has no precomputed audio. Showing the closest available scene."
    : "That exact direction pair has no precomputed audio. Snapped to the nearest available scene.";
  return { scene, exact: false, fallbackNote: note };
}

/** The selection produced by swapping the desired and non-desired roles (§5.3). */
export function swapSelection(sel: SceneSelection): SceneSelection {
  return {
    desiredContent: sel.noiseContent,
    noiseContent: sel.desiredContent,
    desiredDeg: sel.noiseDeg,
    noiseDeg: sel.desiredDeg,
  };
}

/** The set of content ids that appear in a given role across an experiment's scenes. */
export function contentsInRole(
  exp: Experiment,
  role: "desired" | "noise"
): string[] {
  const seen = new Set<string>();
  for (const s of exp.scenes) seen.add(s[role].content_id);
  return [...seen];
}

/** Distinct direction values that appear in a given role (for dropdown fallbacks). */
export function directionsInRole(
  exp: Experiment,
  role: "desired" | "noise"
): number[] {
  const seen = new Set<number>();
  for (const s of exp.scenes) seen.add(s[role].direction_deg);
  return [...seen].sort((a, b) => a - b);
}
