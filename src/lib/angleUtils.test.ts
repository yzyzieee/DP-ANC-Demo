import { describe, it, expect } from "vitest";
import {
  normalizeDeg,
  circularDistanceDeg,
  snapToGrid,
  polarToSvg,
  svgToPolarDeg,
} from "./angleUtils";

describe("normalizeDeg", () => {
  it("wraps into [0,360)", () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
  });
});

describe("circularDistanceDeg", () => {
  it("is symmetric and wraps the short way", () => {
    expect(circularDistanceDeg(10, 350)).toBe(20);
    expect(circularDistanceDeg(0, 180)).toBe(180);
    expect(circularDistanceDeg(90, 90)).toBe(0);
  });
});

describe("snapToGrid", () => {
  const grid = [0, 45, 90, 135, 180, 225, 270, 315];
  it("snaps to nearest grid angle", () => {
    expect(snapToGrid(50, grid)).toBe(45);
    expect(snapToGrid(70, grid)).toBe(90);
    expect(snapToGrid(359, grid)).toBe(0); // wraps to 0, distance 1 < 44 to 315
  });
  it("returns normalized value on empty grid", () => {
    expect(snapToGrid(400, [])).toBe(40);
  });
});

describe("polar/svg round trip", () => {
  it("inverts within tolerance", () => {
    for (const deg of [0, 45, 90, 137, 200, 315]) {
      const p = polarToSvg(deg, 100, 180, 180);
      const back = svgToPolarDeg(p.x, p.y, 180, 180);
      expect(circularDistanceDeg(back, deg)).toBeLessThan(1e-6);
    }
  });
  it("90° points up (smaller y) in SVG coords", () => {
    const p = polarToSvg(90, 100, 180, 180);
    expect(p.y).toBeLessThan(180);
    expect(Math.abs(p.x - 180)).toBeLessThan(1e-6);
  });
});
