import { describe, it, expect } from "vitest";
import {
  resolveScene,
  swapSelection,
  findNearest,
  contentsInRole,
  directionsInRole,
  type SceneSelection,
} from "./sceneResolver";
import type { Experiment, Scene } from "../types/scene";

function mkScene(id: string, dc: string, dd: number, nc: string, nd: number): Scene {
  return {
    id,
    desired: { content_id: dc, label: dc, direction_deg: dd },
    noise: { content_id: nc, label: nc, direction_deg: nd },
    input_snr_db: -10,
    lambda: 0.1,
    duration_s: 4,
    shared_gain_db: -6,
    observation_window_s: 0.5,
    methods: {},
  };
}

const exp: Experiment = {
  id: "sim",
  label: "Simulated array",
  description: "",
  angle_grid_deg: [0, 45, 90, 135, 180, 225, 270, 315],
  geometry: { n_ref_mics: 6, circular: true },
  scenes: [
    mkScene("a", "alarm", 0, "jackhammer", 90),
    mkScene("b", "alarm", 0, "jackhammer", 135),
    mkScene("swap_a", "jackhammer", 90, "alarm", 0), // role swap of "a"
    mkScene("c", "gaussian", 0, "street", 90),
  ],
};

describe("resolveScene", () => {
  it("returns an exact match when one exists", () => {
    const sel: SceneSelection = { desiredContent: "alarm", noiseContent: "jackhammer", desiredDeg: 0, noiseDeg: 90 };
    const r = resolveScene(exp, sel);
    expect(r.exact).toBe(true);
    expect(r.scene.id).toBe("a");
  });

  it("falls back to nearest by angle, keeping content, with a note", () => {
    const sel: SceneSelection = { desiredContent: "alarm", noiseContent: "jackhammer", desiredDeg: 0, noiseDeg: 100 };
    const r = resolveScene(exp, sel);
    expect(r.exact).toBe(false);
    expect(r.scene.id).toBe("a"); // 90 is closer to 100 than 135
    expect(r.fallbackNote).toBeTruthy();
  });

  it("prefers correct content over exact angle", () => {
    const sel: SceneSelection = { desiredContent: "gaussian", noiseContent: "street", desiredDeg: 0, noiseDeg: 135 };
    const r = resolveScene(exp, sel);
    expect(r.exact).toBe(false);
    expect(r.scene.id).toBe("c"); // content match beats the angle-perfect "b"
  });
});

describe("swapSelection", () => {
  it("exchanges contents and directions", () => {
    const sel: SceneSelection = { desiredContent: "alarm", noiseContent: "jackhammer", desiredDeg: 0, noiseDeg: 90 };
    const swapped = swapSelection(sel);
    expect(swapped).toEqual({ desiredContent: "jackhammer", noiseContent: "alarm", desiredDeg: 90, noiseDeg: 0 });
    // and it resolves to the precomputed swap scene
    expect(resolveScene(exp, swapped).scene.id).toBe("swap_a");
  });
});

describe("helpers", () => {
  it("findNearest never throws on any selection", () => {
    const s = findNearest(exp, { desiredContent: "x", noiseContent: "y", desiredDeg: 12, noiseDeg: 200 });
    expect(s).toBeTruthy();
  });
  it("contentsInRole lists distinct role contents", () => {
    expect(new Set(contentsInRole(exp, "desired"))).toEqual(new Set(["alarm", "jackhammer", "gaussian"]));
    expect(new Set(contentsInRole(exp, "noise"))).toEqual(new Set(["jackhammer", "alarm", "street"]));
  });
  it("directionsInRole is sorted + distinct", () => {
    expect(directionsInRole(exp, "noise")).toEqual([0, 90, 135]);
  });
});
