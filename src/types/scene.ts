// Data contract for the DP-ANC listening demo.
//
// This file is the single source of truth for the shape of public/data/scenes.json.
// The Python generator (scripts/build_web_audio.py) emits exactly this schema, and
// the React app consumes it. Do NOT hard-code scene metadata in components — read it
// from the manifest so the two stay in sync.

/** The four methods shown in the demo. Keys and labels match the paper exactly. */
export type MethodId =
  | "mixture"
  | "conventional_anc"
  | "analytical_ssanc"
  | "dp_anc";

/** Fixed display order + canonical labels. Never render a method under any other name. */
export const METHOD_ORDER: MethodId[] = [
  "mixture",
  "conventional_anc",
  "analytical_ssanc",
  "dp_anc",
];

export const METHOD_LABELS: Record<MethodId, string> = {
  mixture: "Original mixture",
  conventional_anc: "Conventional ANC",
  analytical_ssanc: "Analytical SSANC",
  dp_anc: "DP-ANC",
};

/** Which method is "ours" — used only for a subtle highlight, never for an inline "(ours)" tag. */
export const OURS_METHOD: MethodId = "dp_anc";

/** Three separable playback stems per method (linearity: output = desired + noise). */
export type ComponentId = "output" | "desired" | "noise";

export const COMPONENT_ORDER: ComponentId[] = ["output", "desired", "noise"];

export const COMPONENT_LABELS: Record<ComponentId, string> = {
  output: "Full output",
  desired: "Desired component only",
  noise: "Non-desired component only",
};

/**
 * Metrics for one method, computed from the exact web audio assets (not copied
 * from experiment logs). All are energy (power) ratios in dB over the played clip.
 * `null` means "not applicable / not defined for this method" (e.g. distortion for
 * the original mixture, or STOI for a non-speech scene).
 */
export interface MethodMetrics {
  /** Noise reduction, higher is better. Mixture is the 0 dB reference. */
  nr_db: number | null;
  /** Desired-signal distortion, more negative = less control applied to the desired sound. */
  desired_distortion_db: number | null;
  /** Output SNR after control (desired energy / residual-noise energy). */
  output_snr_db: number | null;
  /** Short-time objective intelligibility, speech scenes only. null otherwise. */
  stoi: number | null;
}

/** Relative URLs (under public/) of the three stems for one method. */
export interface MethodAudio {
  output: string;
  desired: string;
  noise: string;
}

export interface MethodEntry {
  label: string;
  /**
   * Whether this method is available for this scene. When false, `audio`/`metrics`
   * may be absent and the UI must state the method is unavailable rather than
   * substituting placeholder assets.
   */
  available: boolean;
  audio?: MethodAudio;
  metrics?: MethodMetrics;
  /** Optional human-readable note (e.g. why a method is unavailable). */
  note?: string;
}

/** One source (desired or non-desired) placed in the acoustic scene. */
export interface SourceSpec {
  content_id: string;
  label: string;
  direction_deg: number;
}

export interface Scene {
  id: string;
  desired: SourceSpec;
  noise: SourceSpec;
  input_snr_db: number;
  /** λ of the DP-ANC model used for this scene (preservation weight). */
  lambda: number;
  duration_s: number;
  /** Single shared linear gain (in dB) applied to every method+component of this scene. */
  shared_gain_db: number;
  /**
   * Window (seconds) the control filter W was estimated from before being applied to
   * the full clip. Documents the operating point (metrics are tied to it).
   */
  observation_window_s: number;
  methods: Partial<Record<MethodId, MethodEntry>>;
  /** id of the scene this one is the role-swap of (if any), for the Swap-roles action. */
  swap_of?: string;
}

/** Geometry hints so the SVG scene can be drawn from the manifest, not hard-coded. */
export interface ArrayGeometry {
  /** Number of reference microphones. */
  n_ref_mics: number;
  /** true = mics on a ring with a center error mic (simulated array); false = custom (hearpiece). */
  circular: boolean;
  /** Optional explicit mic azimuths (deg) for non-circular geometries. */
  ref_mic_deg?: number[];
}

export interface Experiment {
  id: string;
  label: string;
  description: string;
  /** Angles (deg) that have precomputed assets; the UI snaps source directions to these. */
  angle_grid_deg: number[];
  geometry: ArrayGeometry;
  scenes: Scene[];
}

/** Catalog entry describing a selectable sound content (for menus + icons). */
export interface ContentInfo {
  id: string;
  label: string;
  /** "desired" | "noise" | "both" — which role this content is offered in. */
  role: "desired" | "noise" | "both";
  /** Provenance shown in tooltips / attribution. */
  source: string;
}

export interface SceneManifest {
  version: number;
  /** ISO timestamp stamped by the generator. */
  generated_at: string;
  /** Global sample rate (Hz) of all assets. */
  sample_rate: number;
  contents: ContentInfo[];
  experiments: Experiment[];
  /** Free-text provenance / disclaimer surfaced in the UI. */
  disclaimer: string;
}
