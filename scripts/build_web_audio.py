"""
Generate web-ready listening-demo audio for the DP-ANC GitHub Pages demo.

This is the ONLY place research code is invoked. It reuses the paper's simulator
(ScenarioSimulator), analytical solver (compute_analytical_W, which returns BOTH the
Frost-constrained W = Analytical SSANC AND the unconstrained Wiener = Conventional ANC),
and the amortized network (predict_CNN_W = DP-ANC). For each scene it produces, per
method, the three error-mic stems and writes them with ONE shared per-scene gain so
relative levels are preserved (plan §6.2). Metrics are computed from the exact exported
signals (plan §12) and written into public/data/scenes.json.

Physics / decomposition (feedforward ANC, error mic never a network input):
    anti_s = g * (W * s_ref)        # secondary output driven by the desired refs
    anti_v = g * (W * v_ref)        # secondary output driven by the noise refs
    desired_out = s_err + anti_s    # desired component at the error mic
    noise_out   = v_err + anti_v    # non-desired component at the error mic
    output      = desired_out + noise_out   (== primary + total secondary; exact)

Operating point: W is ESTIMATED on a 0.5 s observation window (the realistic short
window where DP is competitive), then applied as a fixed FIR over the full clip that
the listener hears. Metrics (energy ratios in [20,2500] Hz) are measured on that clip.

Run (from anywhere):
    C:/Users/11324/.conda/envs/dirANC_stage1/python.exe scripts/build_web_audio.py
Env:
    DPANC_SENSOR_SNR=30   (set automatically below; the standard sensor floor)
    --limit N             only generate the first N simulated scenes (smoke test)
    --experiments a,b     subset of {simulated} to generate (hearpiece added separately)
"""
import argparse
import json
import math
import os
import sys
from pathlib import Path

# One BLAS thread per process: parallelism comes from the process pool over scenes, so
# per-process single-threaded BLAS avoids oversubscription. Must be set before numpy import.
for _v in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

import numpy as np
import soundfile as sf
import torch

# ---- locate the research repo and import its modules --------------------------
SCRIPT_DIR = Path(__file__).resolve().parent          # .../Githubpage/scripts
DEMO_ROOT = SCRIPT_DIR.parent                          # .../Githubpage
RESEARCH_ROOT = DEMO_ROOT.parent                       # .../Stage2_claude
for p in ("v4_multinoise", "v6_arch_noise", ""):
    sys.path.insert(0, str(RESEARCH_ROOT / p) if p else str(RESEARCH_ROOT))

os.environ.setdefault("DPANC_SENSOR_SNR", "30")        # standard floor, in eval too

import eval_v4  # noqa: E402
from eval_v4 import compute_analytical_W, predict_CNN_W, load_ckpt_to_model  # noqa: E402
from scenario_simulator import (  # noqa: E402
    ScenarioSimulator, _bandpass, _batched_conv, _batched_W_conv,
    _batched_g_conv, _gen_irs_one_angle,
)

# ---- fixed config (matches the paper's simulated array) -----------------------
FS = 8000
BP_LOW, BP_HIGH, BP_TAPS = 20, 2500, 513
DUR_S = 4.0                       # listening clip length
OBS_S = 0.5                       # W-estimation window
INPUT_SNR_DB = -10.0
LAMBDA = 0.1
SENSOR_SNR_DB = 30.0
SSANC_BF, SSANC_RF = eval_v4.ANALYTICAL_BF, 400
DP_CKPT = RESEARCH_ROOT / "v7_paper" / "checkpoints" / "best_model_paper_8x4mixed_lf2500_lam0p1_rsnr15p5.pt"
ALARM_CACHE = RESEARCH_ROOT / "data" / "alarm_data" / "cache" / "alarm_val_8000hz_bp[20-3500].pt"
US_ROOT = Path("E:/NTU/Database/UrbanSound8K")
SEED = 20260703

# hearpiece (v8 measured paths)
HP_NPZ = RESEARCH_ROOT / "v8_hearpiece" / "data" / "hearpiece" / "processed" / "KEMAR_DV0001_rep1_fs8000_Lp256_Lg256.npz"
HP_CKPT = RESEARCH_ROOT / "v8_hearpiece" / "checkpoints" / "best_model_v8_dvar_lam1p0.pt"
HP_SNR_DB = -5.0
HP_LAMBDA = 1.0
# angles must lie on the measured 7.5° azimuth grid
# Hearpiece: desired fixed at 45deg; non-desired (street noise) swept around the full
# circle on the measured 7.5deg grid, INCLUDING small gaps (37.5/52.5 = +-7.5, 30/60 =
# +-15) to show the resolution limit on measured paths. Plus a drilling accent.
HP_SCENES = [
    ("siren", 45, "street_music", 135, None),   # default
    ("siren", 45, "street_music", 37.5, None),  # +-7.5deg gap: the limit
    ("siren", 45, "street_music", 52.5, None),
    ("siren", 45, "street_music", 30, None),    # +-15deg gap
    ("siren", 45, "street_music", 60, None),
    ("siren", 45, "street_music", 90, None),
    ("siren", 45, "street_music", 180, None),
    ("siren", 45, "street_music", 225, None),
    ("siren", 45, "street_music", 270, None),
    ("siren", 45, "street_music", 315, None),
    ("siren", 45, "drilling", 135, None),
]

AUDIO_OUT = DEMO_ROOT / "public" / "audio"
DATA_OUT = DEMO_ROOT / "public" / "data"

# ---- content catalog ----------------------------------------------------------
# content_id -> (label, kind, spec). kind: "gaussian" | "synth" | "urbansound".
# Desired sources are CLEAN synthetic alarms (no background hiss) — they are still tonal/
# harmonic, i.e. out-of-distribution vs the band-limited-Gaussian training desired, so they
# still demonstrate content generalization while giving a clean A/B comparison.
CONTENTS = {
    "siren": ("Two-tone siren", "synth", "siren"),
    "beep_alarm": ("Beeping alarm", "synth", "beep"),
    "warble": ("Warble alarm", "synth", "warble"),
    "bandlimited_gaussian": ("Band-limited noise", "gaussian", None),
    "jackhammer": ("Jackhammer", "urbansound", "jackhammer"),
    "engine_idling": ("Engine", "urbansound", "engine_idling"),
    "street_music": ("Street noise", "urbansound", "street_music"),
    "drilling": ("Machinery", "urbansound", "drilling"),
}
CONTENT_ROLE = {  # for the manifest menu
    "siren": "desired", "beep_alarm": "desired", "warble": "desired",
    "bandlimited_gaussian": "desired",
    "jackhammer": "both", "engine_idling": "noise",
    "street_music": "noise", "drilling": "both",
}
CONTENT_SOURCE = {
    "siren": "Synthetic clean alarm",
    "beep_alarm": "Synthetic clean alarm",
    "warble": "Synthetic clean alarm",
    "bandlimited_gaussian": "Synthetic band-limited noise",
    "jackhammer": "UrbanSound8K (CC-BY-NC)",
    "engine_idling": "UrbanSound8K (CC-BY-NC)",
    "street_music": "UrbanSound8K (CC-BY-NC)",
    "drilling": "UrbanSound8K (CC-BY-NC)",
}

# ---- simulated-array scenes ----
# Desired is anchored at a few directions; the non-desired source is swept DENSELY
# around the full circle, INCLUDING small angular gaps to the desired direction so the
# demo shows the array's angular-resolution limit (near-coincident sources cannot be
# separated). Flagship content = two-tone siren (desired) vs jackhammer (noise).
FLAGSHIP_DESIRED = "siren"
DESIRED_ANCHORS = [0, 60, 120, 180, 240, 300]   # a few, evenly around the full circle
NOISE_BASE = list(range(0, 360, 30))             # coarse full-circle -> directivity shape
NEAR_OFF = [5, 10, 15, 22.5, 30]                 # fine points near the desired -> the dip / limit


def _noise_dirs_for(dd):
    """Non-desired directions for a given desired anchor: coarse full circle + fine near it."""
    g = set(NOISE_BASE)
    for o in NEAR_OFF:
        g.add(round((dd + o) % 360, 1))
        g.add(round((dd - o) % 360, 1))
    g.discard(dd % 360)                            # no identical direction
    return sorted(g)


def _sim_scenes():
    default = (FLAGSHIP_DESIRED, 0, "jackhammer", 90, None)
    out = [default]
    seen = {default[:4]}
    for dd in DESIRED_ANCHORS:
        for nd in _noise_dirs_for(dd):
            key = (FLAGSHIP_DESIRED, dd, "jackhammer", nd)
            if key in seen:
                continue
            seen.add(key)
            out.append((*key, None))
    return out


NOISE_GRID = sorted({n for a in DESIRED_ANCHORS for n in _noise_dirs_for(a)})
ANGLE_GRID = sorted(set(DESIRED_ANCHORS) | set(NOISE_GRID))


# A few accent scenes so other contents are still selectable (sparse, at anchor dirs).
SIM_ACCENTS = [
    ("siren", 0, "engine_idling", 90, None),
    ("beep_alarm", 0, "street_music", 90, None),
    ("bandlimited_gaussian", 0, "drilling", 90, None),
]
SIM_SCENES = _sim_scenes() + SIM_ACCENTS

METHODS = ["mixture", "conventional_anc", "analytical_ssanc", "dp_anc"]
METHOD_LABELS = {
    "mixture": "ANC off", "conventional_anc": "Conventional ANC",
    "analytical_ssanc": "Analytical SSANC", "dp_anc": "DP-ANC",
}


def _fmt_deg(d):
    return str(int(d)) if float(d).is_integer() else str(d).replace(".", "p")


def scene_id(exp, desired, dd, noise, nd):
    return f"{exp}__{desired}_{_fmt_deg(dd)}__{noise}_{_fmt_deg(nd)}"


# ---- signal helpers -----------------------------------------------------------
_alarm_clips = None


def _pick_loudest_window(x, N):
    """Return the N-sample window of 1-D tensor x with the highest energy."""
    if x.shape[0] <= N:
        return torch.nn.functional.pad(x, (0, N - x.shape[0]))
    # coarse search over hop-spaced windows
    hop = max(1, N // 4)
    best_i, best_e = 0, -1.0
    for i in range(0, x.shape[0] - N + 1, hop):
        e = float((x[i:i + N] ** 2).sum())
        if e > best_e:
            best_e, best_i = e, i
    return x[best_i:best_i + N]


def _synth_alarm(kind, N, dev):
    """Clean synthetic alarm (no background noise), band-limited within [20,2500] Hz."""
    t = torch.arange(N, device=dev, dtype=torch.float32) / FS
    if kind == "siren":                        # two-tone siren alternating every 0.5 s
        f1, f2, period = 700.0, 1050.0, 0.5
        sel = ((t % period) < period / 2).float()
        x = sel * torch.sin(2 * math.pi * f1 * t) + (1 - sel) * torch.sin(2 * math.pi * f2 * t)
    elif kind == "beep":                       # periodic beeps, 1000 Hz, 0.18 on / 0.18 off
        f, on, off = 1000.0, 0.18, 0.18
        ph = (t % (on + off))
        gate = torch.clamp(torch.minimum(ph, on - ph) / 0.01, 0.0, 1.0)  # 10 ms raised edges
        gate = torch.where(ph < on, gate, torch.zeros_like(gate))
        x = torch.sin(2 * math.pi * f * t) * gate
    elif kind == "warble":                     # FM warble, 1000 +- 300 Hz at 5 Hz
        fc, fdev, fm = 1000.0, 300.0, 5.0
        phase = 2 * math.pi * torch.cumsum(fc + fdev * torch.sin(2 * math.pi * fm * t), dim=0) / FS
        x = torch.sin(phase)
    else:
        raise ValueError(kind)
    return x


def load_content(content_id, N, bp, dev, gen):
    """Load one content signal, band-limited to [20,2500] Hz and unit-std, shape (N,)."""
    _label, kind, spec = CONTENTS[content_id]
    if kind == "gaussian":
        x = torch.randn(N, device=dev, generator=gen)
    elif kind == "synth":
        x = _synth_alarm(spec, N, dev)
    elif kind == "urbansound":
        x = _load_urbansound_class(spec, N, dev, gen)
    else:
        raise ValueError(kind)
    x = _bandpass(x.unsqueeze(0), bp).squeeze(0)
    return x / (x.std() + 1e-10)


_us_index = None


def _load_urbansound_class(class_name, N, dev, gen):
    """Pick a random UrbanSound8K clip of `class_name` (test-ish fold 10), 8 kHz, (N,)."""
    global _us_index
    if _us_index is None:
        import csv
        _us_index = {}
        meta = US_ROOT / "metadata" / "UrbanSound8K.csv"
        with open(meta) as f:
            for r in csv.DictReader(f):
                _us_index.setdefault(r["class"], []).append((r["fold"], r["slice_file_name"]))
    files = _us_index.get(class_name)
    if not files:
        raise ValueError(f"UrbanSound class not found: {class_name}")
    # deterministic pick per class via the torch generator
    idx = int(torch.randint(0, len(files), (1,), device=dev, generator=gen if gen.device == dev else None).item()) \
        if gen.device == dev else int(torch.randint(0, len(files), (1,)).item())
    fold, fname = files[idx]
    from scipy.signal import resample_poly
    wav, sr = sf.read(str(US_ROOT / "audio" / f"fold{fold}" / fname))
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    if sr != FS:
        from math import gcd
        g = gcd(int(sr), FS)
        wav = resample_poly(wav, FS // g, int(sr) // g)
    x = torch.tensor(wav, dtype=torch.float32, device=dev)
    if x.shape[0] < N:  # tile short clips
        reps = int(math.ceil(N / x.shape[0]))
        x = x.repeat(reps)
    return x[:N].clone()


def build_ir(sim, theta_deg, dev):
    irs = _gen_irs_one_angle(sim.mic_pos, theta_deg, sim.c, sim.fs, sim.Lir)
    return torch.tensor(np.stack(irs), dtype=torch.float32, device=dev)  # (K+1, Lir)


def energy_db(num, den):
    num = float((num ** 2).sum()); den = float((den ** 2).sum()) + 1e-12
    return 10.0 * math.log10(max(num / den, 1e-12))


def _sim_fields(sim, bp, dev, desired, dd, noise, nd, length, gen):
    """One realization of the simulated scene: error-mic + reference fields, SNR-scaled,
    with the sensor floor folded in. Returns (s_full, v_full) each (1, K+1, length)."""
    K = sim.K
    ds = load_content(desired, length, bp, dev, gen)
    ns = load_content(noise, length, bp, dev, gen)
    s_full = _batched_conv(ds.unsqueeze(0), build_ir(sim, dd, dev).unsqueeze(0), length)
    v_full = _batched_conv(ns.unsqueeze(0), build_ir(sim, nd, dev).unsqueeze(0), length)
    snr_lin = 10 ** (INPUT_SNR_DB / 10.0)
    scv = torch.sqrt((s_full[:, K] ** 2).sum(1) / ((v_full[:, K] ** 2).sum(1) * snr_lin + 1e-12))
    v_full = v_full * scv.view(-1, 1, 1)
    sn = _bandpass(torch.randn(1, K + 1, length, device=dev, generator=gen), bp)
    sn = sn / (sn.std(2, keepdim=True) + 1e-10)
    v_full = v_full + sn * (s_full + v_full).std(2, keepdim=True) * 10 ** (-SENSOR_SNR_DB / 20.0)
    return s_full, v_full


# ---- per-scene generation -----------------------------------------------------
@torch.no_grad()
def generate_scene(sim, cfg, bp, dev, exp, desired, dd, noise, nd, swap_of):
    N = int(FS * DUR_S)
    Nobs = int(FS * OBS_S)
    K = sim.K
    # Fair A/B (no optimization leakage): estimate W on an INDEPENDENT realization A over a
    # 0.5 s window (the paper's realistic short operating point), auralize/measure realization
    # B. Deterministic per-scene seeds (builtin hash() is per-process randomized).
    import hashlib
    sid_hash = int(hashlib.md5(scene_id(exp, desired, dd, noise, nd).encode()).hexdigest(), 16) % (2**31)
    genA = torch.Generator(device=dev).manual_seed((SEED + sid_hash) % (2**31))
    genB = torch.Generator(device=dev).manual_seed((SEED + sid_hash + 7919) % (2**31))

    sA, vA = _sim_fields(sim, bp, dev, desired, dd, noise, nd, Nobs, genA)
    s_full, v_full = _sim_fields(sim, bp, dev, desired, dd, noise, nd, N, genB)

    # ---- estimate W per method on realization A (0.5 s) ----
    Wan_np, Wunc_np = compute_analytical_W(
        (sA[0] + vA[0]).cpu().numpy(), vA[0].cpu().numpy(), sA[0].cpu().numpy(),
        sim.g.cpu().numpy(), sim.mic_pos, err_idx=K, K=K,
        Lw=cfg["Lw"], Lg=sim.Lg, Lh=cfg["Lw"], Lir=sim.Lir, N=Nobs, fs=FS, c=sim.c,
        theta_d=dd, bf=SSANC_BF, rf=SSANC_RF, also_unconstrained=True, hp_low=BP_LOW)
    xd = torch.tensor([[math.cos(math.radians(dd)), math.sin(math.radians(dd))]],
                      dtype=torch.float32, device=dev)
    mic_obs = (sA + vA)[:, :K, :]
    Wdp = predict_CNN_W(cfg["model"], mic_obs, xd, cfg["sm"], cfg["ss"], cfg["Yfm"],
                        cfg["Yfs"], cfg["snfft"], cfg["shop"], cfg["nf"], cfg["nc"],
                        cfg["NFFT"], cfg["Lw"])
    W_by_method = {
        "mixture": torch.zeros_like(Wdp),
        "conventional_anc": torch.tensor(Wunc_np[None], dtype=torch.float32, device=dev),
        "analytical_ssanc": torch.tensor(Wan_np[None], dtype=torch.float32, device=dev),
        "dp_anc": Wdp,
    }

    def apply_W(W, ref):
        return _batched_g_conv(_batched_W_conv(W, ref, N), sim.g, N)[0]

    return _finalize(exp, desired, dd, noise, nd, swap_of, W_by_method,
                     s_full, v_full, apply_W, bp, K, LAMBDA, INPUT_SNR_DB, OBS_S)


def _finalize(exp, desired, dd, noise, nd, swap_of, W_by_method,
              s_full, v_full, apply_W, bp, K, lam, snr_db, obs_s):
    """Shared: apply each W over the full clip, build the 3 stems + metrics, apply ONE
    shared per-scene gain, write WAVs, and return the manifest scene dict. Used by both
    the simulated array and the hearpiece generators."""
    s_err_bp = _bandpass(s_full[:, K], bp)[0]       # clean desired ref
    v_err_bp = _bandpass(v_full[:, K], bp)[0]       # NR reference (mixture noise)

    stems, metrics, peak = {}, {}, 1e-9
    for m in METHODS:
        anti_s = apply_W(W_by_method[m], s_full[:, :K])
        anti_v = apply_W(W_by_method[m], v_full[:, :K])
        desired_out = _bandpass((s_full[0, K] + anti_s).unsqueeze(0), bp)[0]
        noise_out = _bandpass((v_full[0, K] + anti_v).unsqueeze(0), bp)[0]
        output = desired_out + noise_out
        anti_s_bp = _bandpass(anti_s.unsqueeze(0), bp)[0]

        stems[m] = {"output": output, "desired": desired_out, "noise": noise_out}
        for sig in stems[m].values():
            peak = max(peak, float(sig.abs().max()))

        nr = energy_db(v_err_bp, noise_out)
        dist = None if m == "mixture" else energy_db(anti_s_bp, s_err_bp)
        osnr = energy_db(desired_out, noise_out)
        metrics[m] = {"nr_db": round(nr, 2),
                      "desired_distortion_db": None if dist is None else round(dist, 2),
                      "output_snr_db": round(osnr, 2), "stoi": None}

    gain = 0.95 / peak
    sid = scene_id(exp, desired, dd, noise, nd)
    out_dir = AUDIO_OUT / exp / sid
    out_dir.mkdir(parents=True, exist_ok=True)
    method_entries = {}
    for m in METHODS:
        audio_paths = {}
        for comp in ("output", "desired", "noise"):
            data = (stems[m][comp] * gain).clamp(-1, 1).cpu().numpy().astype(np.float32)
            fname = f"{m}_{comp}.wav"
            sf.write(str(out_dir / fname), data, FS, subtype="PCM_16")
            audio_paths[comp] = f"audio/{exp}/{sid}/{fname}"
        method_entries[m] = {"label": METHOD_LABELS[m], "available": True,
                             "audio": audio_paths, "metrics": metrics[m]}

    scene = {
        "id": sid,
        "desired": {"content_id": desired, "label": CONTENTS[desired][0], "direction_deg": dd},
        "noise": {"content_id": noise, "label": CONTENTS[noise][0], "direction_deg": nd},
        "input_snr_db": snr_db, "lambda": lam, "duration_s": DUR_S,
        "shared_gain_db": round(20 * math.log10(gain), 2), "observation_window_s": obs_s,
        "methods": method_entries,
    }
    if swap_of:
        scene["swap_of"] = swap_of
    print(f"  {sid}: NR dp={metrics['dp_anc']['nr_db']:+.1f} dist dp={metrics['dp_anc']['desired_distortion_db']:+.1f} "
          f"| ssanc NR={metrics['analytical_ssanc']['nr_db']:+.1f} dist={metrics['analytical_ssanc']['desired_distortion_db']:+.1f}")
    return scene


_SIM_CTX = None


def _sim_ctx():
    """Per-process simulated context (CPU): DP model + simulator + bandpass. Built once."""
    global _SIM_CTX
    if _SIM_CTX is None:
        torch.set_num_threads(1)
        dev = torch.device("cpu")
        cfg = load_ckpt_to_model(DP_CKPT, dev)
        sim = ScenarioSimulator(fs=FS, K=6, snr_db=INPUT_SNR_DB, T_sig=DUR_S, noise_src_range=(1, 1),
                                noise_protect_deg=15.0, bp_low=BP_LOW, bp_high=BP_HIGH,
                                bp_taps=BP_TAPS, device="cpu")
        from scipy.signal import firwin
        bp = torch.tensor(firwin(BP_TAPS, [BP_LOW, BP_HIGH], fs=FS, pass_zero=False),
                          dtype=torch.float32, device=dev)
        _SIM_CTX = (dev, cfg, sim, bp)
    return _SIM_CTX


def _sim_worker(scene_tuple):
    dev, cfg, sim, bp = _sim_ctx()
    desired, dd, noise, nd, swap_of = scene_tuple
    return generate_scene(sim, cfg, bp, dev, "sim", desired, dd, noise, nd, swap_of)


def gen_simulated(limit=None, workers=1):
    todo = SIM_SCENES[:limit] if limit else SIM_SCENES
    print(f"[simulated] {len(todo)} scenes, workers={workers} (CPU)")
    if workers > 1:
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=workers) as ex:
            scenes = list(ex.map(_sim_worker, todo))
    else:
        scenes = [_sim_worker(s) for s in todo]
    return {
        "id": "sim", "label": "Simulated array",
        "description": "Six-microphone circular reference array (radius 0.20 m) with a center error microphone.",
        "angle_grid_deg": ANGLE_GRID,
        "geometry": {"n_ref_mics": 6, "circular": True},
        "scenes": scenes,
    }


def _hp_frost_and_unc_W(sim, mix_full, theta_d, Lw, beta_rel=1e-3):
    """Hearpiece analytical solve on the observation window (adapted from
    v8_hearpiece/eval_aligned.frost_ssanc_W): returns (W_frost, W_unconstrained).
    W_unconstrained = min total error (Conventional ANC); W_frost projects it onto the
    distortionless-to-desired-direction subspace (Analytical SSANC, hard Frost)."""
    from scipy.linalg import convolution_matrix
    K = sim.K
    N = mix_full.shape[-1]
    g = sim.g.cpu().numpy()
    x = mix_full[0, :K].cpu().numpy()
    p = mix_full[0, K].cpu().numpy()
    fr = np.stack([np.convolve(g, x[k])[:N] for k in range(K)])
    A = np.hstack([convolution_matrix(fr[k], Lw, mode="full")[:N] for k in range(K)])
    R = A.T @ A
    R += beta_rel * np.trace(R) / R.shape[0] * np.eye(R.shape[0])
    w_unc = np.linalg.solve(R, -A.T @ p)
    Rd = sim.ir[sim.dir_index(theta_d), :K].cpu().numpy()
    gRd = [np.convolve(g, Rd[k]) for k in range(K)]
    Lc = len(gRd[0]) + Lw - 1
    C = np.hstack([convolution_matrix(gRd[k], Lw, mode="full")[:Lc] for k in range(K)])
    RiCt = np.linalg.solve(R, C.T)
    w = w_unc - RiCt @ np.linalg.solve(C @ RiCt + 1e-9 * np.eye(C.shape[0]), C @ w_unc)

    def to_W(wv):
        return torch.tensor(wv.reshape(K, Lw).T[None], dtype=torch.float32, device=sim.device)
    return to_W(w), to_W(w_unc)


@torch.no_grad()
def generate_hp_scene(sim, model, norm, info, bp, dev, desired, dd, noise, nd, swap_of):
    N = int(FS * DUR_S)
    Nobs = int(FS * OBS_S)
    K, Lw = sim.K, info["Lw"]
    import hashlib
    sid_hash = int(hashlib.md5(scene_id("hp", desired, dd, noise, nd).encode()).hexdigest(), 16) % (2**31)
    genA = torch.Generator(device=dev).manual_seed((SEED + sid_hash) % (2**31))
    genB = torch.Generator(device=dev).manual_seed((SEED + sid_hash + 7919) % (2**31))
    s_irs, v_irs = sim.scene_irs(dd, nd)

    # Fair A/B: estimate W on an INDEPENDENT realization A over a 0.5 s window; auralize B.
    sA, vA = sim._one(s_irs, v_irs, genA,
                      s0=load_content(desired, N, bp, dev, genA).unsqueeze(0),
                      v0=load_content(noise, N, bp, dev, genA).unsqueeze(0), snr_db=HP_SNR_DB)
    mixA_obs = (sA + vA)[:, :, :Nobs]
    W_frost, W_unc = _hp_frost_and_unc_W(sim, mixA_obs, dd, Lw)
    az = math.radians(dd)
    xd = torch.tensor([[math.cos(az), math.sin(az)]], dtype=torch.float32, device=dev)
    Wdp = predict_hp_W(model, norm, info, mixA_obs[:, :K], xd)
    W_by_method = {
        "mixture": torch.zeros(1, Lw, K, device=dev),
        "conventional_anc": W_unc,
        "analytical_ssanc": W_frost,
        "dp_anc": Wdp,
    }

    s_full, v_full = sim._one(s_irs, v_irs, genB,
                              s0=load_content(desired, N, bp, dev, genB).unsqueeze(0),
                              v0=load_content(noise, N, bp, dev, genB).unsqueeze(0), snr_db=HP_SNR_DB)

    def apply_W(W, ref):
        return sim._anti(W, ref)[0]

    return _finalize("hp", desired, dd, noise, nd, swap_of, W_by_method,
                     s_full, v_full, apply_W, bp, K, HP_LAMBDA, HP_SNR_DB, OBS_S)


def gen_hearpiece(limit=None):
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    v8 = str(RESEARCH_ROOT / "v8_hearpiece")
    if v8 not in sys.path:
        sys.path.insert(0, v8)
    global predict_hp_W
    from hearpiece_sim import HearpieceSim
    from model_hearpiece import load_model, predict_W as predict_hp_W
    print(f"[hearpiece] device={dev}  ckpt={HP_CKPT.name}")
    sim = HearpieceSim(str(HP_NPZ), snr_db=HP_SNR_DB, t_obs=DUR_S, sensor_snr_db=30.0,
                       device=str(dev), ideal_secondary=True)
    model, norm, info = load_model(HP_CKPT, dev)
    bp = sim.bp
    grid = sorted(round(float(a), 1) for a in np.asarray(sim.az)[sim.horiz])
    scenes = []
    todo = HP_SCENES[:limit] if limit else HP_SCENES
    for (desired, dd, noise, nd, swap_of) in todo:
        scenes.append(generate_hp_scene(sim, model, norm, info, bp, dev, desired, dd, noise, nd, swap_of))
    return {
        "id": "hp", "label": "Hearpiece (measured paths)",
        "description": ("Four external reference microphones (concha and entrance, left/right) with the "
                        "error microphone at the right eardrum; measured KEMAR acoustic paths, ideal "
                        "minimum-phase secondary path."),
        "angle_grid_deg": grid,
        "geometry": {"n_ref_mics": 4, "circular": False, "ref_mic_deg": [60, 120, 240, 300]},
        "scenes": scenes,
    }


def build_manifest(experiments):
    used = set()
    for e in experiments:
        for s in e["scenes"]:
            used.add(s["desired"]["content_id"]); used.add(s["noise"]["content_id"])
    contents = [{"id": cid, "label": CONTENTS[cid][0], "role": CONTENT_ROLE[cid],
                 "source": CONTENT_SOURCE[cid]} for cid in CONTENTS if cid in used]
    return {
        "version": 1,
        "generated_at": os.environ.get("DPANC_BUILD_TS", "generated-offline"),
        "sample_rate": FS,
        "contents": contents,
        "experiments": experiments,
        "disclaimer": (
            "This page presents precomputed error-microphone signals generated using the "
            "simulated and measured acoustic configurations described in the paper. It does "
            "not run physical ANC in the browser. The demo uses a finite set of source "
            "directions and audio scenes. Results show preservation behavior that generalizes "
            "beyond the desired-signal class used during training and is consistent with "
            "direction-conditioned control."
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--experiments", type=str, default="simulated,hearpiece")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2),
                    help="parallel processes for the simulated analytical solves (CPU)")
    args = ap.parse_args()
    want = set(args.experiments.split(","))

    experiments = []
    if "simulated" in want:
        experiments.append(gen_simulated(limit=args.limit, workers=args.workers))
    if "hearpiece" in want:
        experiments.append(gen_hearpiece(limit=args.limit))

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest(experiments)
    with open(DATA_OUT / "scenes.json", "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nWrote {DATA_OUT / 'scenes.json'} with {sum(len(e['scenes']) for e in experiments)} scenes.")


if __name__ == "__main__":
    main()
