"""
Validate the web audio package against public/data/scenes.json. Fails LOUDLY (exit 1)
on any inconsistency so a broken dataset can never ship (plan §12).

Checks, per scene and method:
  - every audio path in the manifest exists,
  - all stems share one sample rate (== manifest.sample_rate) and length,
  - no NaN / Inf, no clipping beyond a threshold,
  - output ~= desired + noise within tolerance,
  - metadata duration matches the file duration,
  - method keys are complete for available methods,
  - metrics are present (or explicitly null) for available methods.

Run:
    C:/Users/11324/.conda/envs/dirANC_stage1/python.exe scripts/validate_audio_assets.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

DEMO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC = DEMO_ROOT / "public"
MANIFEST = PUBLIC / "data" / "scenes.json"

CLIP_THRESHOLD = 0.999
SUM_TOL = 2e-3          # max|output - (desired+noise)|, allows int16 quantization
DUR_TOL = 1e-3          # seconds
METHODS = ["mixture", "conventional_anc", "analytical_ssanc", "dp_anc"]
COMPONENTS = ["output", "desired", "noise"]

errors: list[str] = []


def err(msg: str):
    errors.append(msg)


def load(rel: str):
    p = PUBLIC / rel
    if not p.exists():
        err(f"missing file: {rel}")
        return None, None
    data, sr = sf.read(str(p))
    if data.ndim > 1:
        data = data.mean(axis=1)
    return data.astype(np.float64), sr


def main():
    if not MANIFEST.exists():
        print(f"FATAL: manifest not found at {MANIFEST}")
        sys.exit(1)
    manifest = json.loads(MANIFEST.read_text())
    fs = manifest["sample_rate"]
    n_scenes = n_methods = 0

    for exp in manifest["experiments"]:
        for scene in exp["scenes"]:
            n_scenes += 1
            sid = scene["id"]
            expect_len = None
            for m in METHODS:
                entry = scene["methods"].get(m)
                if entry is None:
                    err(f"{sid}: method key '{m}' absent")
                    continue
                if not entry.get("available", False):
                    continue  # unavailable methods legitimately omit audio/metrics
                n_methods += 1
                if "metrics" not in entry:
                    err(f"{sid}/{m}: metrics missing")
                stems = {}
                for c in COMPONENTS:
                    rel = entry.get("audio", {}).get(c)
                    if not rel:
                        err(f"{sid}/{m}: audio path for '{c}' missing")
                        continue
                    data, sr = load(rel)
                    if data is None:
                        continue
                    if sr != fs:
                        err(f"{sid}/{m}/{c}: sample rate {sr} != manifest {fs}")
                    if not np.all(np.isfinite(data)):
                        err(f"{sid}/{m}/{c}: contains NaN/Inf")
                    if np.max(np.abs(data)) > CLIP_THRESHOLD:
                        err(f"{sid}/{m}/{c}: clipping ({np.max(np.abs(data)):.3f})")
                    if expect_len is None:
                        expect_len = len(data)
                    elif len(data) != expect_len:
                        err(f"{sid}/{m}/{c}: length {len(data)} != {expect_len}")
                    stems[c] = data
                # output == desired + noise
                if all(k in stems for k in COMPONENTS):
                    d = np.max(np.abs(stems["output"] - (stems["desired"] + stems["noise"])))
                    if d > SUM_TOL:
                        err(f"{sid}/{m}: output != desired+noise (max diff {d:.2e})")
                # duration matches metadata
                if expect_len is not None:
                    file_dur = expect_len / fs
                    if abs(file_dur - scene["duration_s"]) > DUR_TOL:
                        err(f"{sid}/{m}: file duration {file_dur:.3f}s != metadata {scene['duration_s']}s")

    print(f"Checked {n_scenes} scenes, {n_methods} available methods.")
    if errors:
        print(f"\nFAILED with {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("OK — all audio assets are consistent with the manifest.")


if __name__ == "__main__":
    main()
