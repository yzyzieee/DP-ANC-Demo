# DP-ANC Interactive Listening Demo

An interactive, static listening demo for **Deep Learning-Based Directional Preservation
Active Noise Control (DP-ANC)**. It lets you hear how DP-ANC preserves a sound arriving from
a chosen *desired direction* while suppressing sound from another direction, and compare it
against Conventional ANC and Analytical SSANC.

> **This is an offline auralization.** The page plays *precomputed error-microphone signals*
> generated from the simulated and measured acoustic configurations described in the paper.
> It does **not** run physical ANC in the browser, uses a **finite** set of source directions
> and audio scenes, and never claims the network depends only on direction — the results are
> *consistent with direction-conditioned control* that generalizes beyond the training class.

## Live demo

**https://yzyzieee.github.io/DP-ANC-Demo/** — deployed from the `gh-pages` branch (built site).
The Vite `base` path is `/DP-ANC-Demo/` to match the repository name.

## What you can do

- Pick an **experiment**: *Simulated array* (6-mic ring + center error mic) or *Hearpiece* (4
  measured binaural references, error mic at the right eardrum).
- Choose the **desired** and **non-desired** sound contents and their **directions** (drag the
  markers in the scene, or use the dropdowns; directions snap to precomputed angles).
- Switch **method** (Original mixture · Conventional ANC · Analytical SSANC · DP-ANC) — playback
  keeps its position, with a short crossfade.
- Solo the **full output**, **desired component**, or **non-desired component**.
- **Swap source roles** to hear that preservation is assigned *spatially*, not by sound class.
- Read the per-scene metrics (noise reduction, desired-signal distortion, output SNR).

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc project references
npm test           # vitest unit tests (angle/scene/metric logic)
npm run build      # -> dist/  (production base = /dp-anc-demo/)
npm run preview    # serve the built dist/
```

Requires Node 20+.

## Asset layout

```
public/
  data/scenes.json          # the manifest — single source of truth for all scenes
  audio/<experiment>/<scene-id>/<method>_<component>.wav
```

Each scene provides, per method, three mono WAV stems at 8 kHz: `output`, `desired`, `noise`,
with `output == desired + noise` (linearity of the error-mic signal). All stems of a scene share
**one gain** so relative levels between methods are preserved (see below).

The React app is manifest-driven: components never hard-code scene data. Types live in
[`src/types/scene.ts`](src/types/scene.ts); the resolver + fallback logic in
[`src/lib/sceneResolver.ts`](src/lib/sceneResolver.ts).

## How the audio and metrics are produced

`scripts/build_web_audio.py` is the **only** place the research code is invoked. It must be run
from inside the research repository (`Stage2_claude/`), which contains the models and datasets.

For each scene it:

1. Simulates the physical fields for the desired source (at θ_d) and the non-desired source (at
   θ_n) through the array/hearpiece acoustic paths, at input SNR with the standard 30 dB sensor
   floor.
2. Uses a **fair A/B protocol** (no optimization leakage): the control filter *W* for every
   method is estimated on an **independent** realization *A* over a 0.5 s observation window,
   then applied as a fixed FIR to an independent realization *B* — the clip you hear.
   - **Original mixture** = no control (W = 0).
   - **Conventional ANC** = unconstrained Wiener (maximizes cancellation, destroys the desired).
   - **Analytical SSANC** = Frost / distortionless-to-direction constrained Wiener.
   - **DP-ANC** = the network's one-forward-pass prediction from the reference mics + θ_d.
3. Decomposes the error-mic output by linearity into `desired = s_err + g*(W*s_ref)` and
   `noise = v_err + g*(W*v_ref)`.
4. Applies **one shared gain** per scene (0.95 / peak across all methods and components) so no
   method is independently normalized; the gain is stored as `shared_gain_db`.
5. Computes metrics **from the exact exported signals** (energy ratios in the [20, 2500] Hz band):
   - `nr_db` = 10·log10(‖noise@mixture‖² / ‖noise@method‖²) — higher is better.
   - `desired_distortion_db` = 10·log10(‖g*(W*s_ref)‖² / ‖s_err‖²) — more negative = less control
     applied to the desired sound.
   - `output_snr_db` = 10·log10(‖desired‖² / ‖noise‖²) after control.

Because these are honest per-scene numbers at a realistic short observation window, DP-ANC is
**competitive** with the per-scene analytical baseline while preserving the desired sound much
better — it is **not** claimed to beat the analytical unconditionally.

```bash
# from Stage2_claude/ (the research repo), with the project conda env:
python Githubpage/scripts/build_web_audio.py                 # all scenes, both experiments
python Githubpage/scripts/build_web_audio.py --limit 1        # smoke test
python Githubpage/scripts/validate_audio_assets.py           # verify manifest ↔ audio
```

## Adding a scene

1. Edit the `SIM_SCENES` (or `HP_SCENES`) list in `scripts/build_web_audio.py`. Each entry is
   `(desired_content_id, desired_deg, noise_content_id, noise_deg, swap_of)`. Add new content ids
   to the `CONTENTS` catalog (with a loader kind and a label). Simulated angles are arbitrary
   (fractional-delay IRs); hearpiece angles must lie on the measured 7.5° grid.
2. Re-run `build_web_audio.py`, then `validate_audio_assets.py`.
3. That's it — the app picks up the new scene from `scenes.json` with no code changes. For a
   role-swap pair, set `swap_of` to the id of the base scene.

## Deployment

`.github/workflows/deploy-pages.yml` builds on push to `main`: typecheck → unit tests → Vite
build (with `DPANC_BASE=/dp-anc-demo/`) → checks `dist/data/scenes.json` exists → deploys to
GitHub Pages. Enable Pages with source "GitHub Actions". If you rename the repo, update
`DPANC_BASE` and the default `base` in `vite.config.ts`.

## Reproducibility

All randomness is seeded deterministically per scene (`scripts/build_web_audio.py`, `SEED`,
md5-derived per-scene seeds), so regenerating produces identical audio. Metrics shown on the
site are always recomputed from the exact web assets — never copied from experiment logs.

## Citation

```bibtex
@article{dpanc,
  title  = {Deep Learning-Based Directional Preservation Active Noise Control},
  author = {<authors>},
  journal= {<venue>},
  year   = {<year>}
}
```

## Licenses and attribution

- **Code**: MIT (see `LICENSE`).
- **Desired-source clips** are derived from the **FSD50K** alarm subset (Creative Commons; see
  the FSD50K dataset license). **Non-desired-source clips** are derived from **UrbanSound8K**
  (Creative Commons **BY-NC** — non-commercial, attribution required). The demo audio are
  transformed derivatives (convolved with acoustic paths, band-limited, mixed, and filtered) and
  are redistributed here for **non-commercial academic** demonstration with attribution. If you
  publish this demo, keep the attributions and respect the non-commercial terms of UrbanSound8K.
