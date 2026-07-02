import { describe, it, expect } from "vitest";
import { formatDb, formatStoi, metricRows } from "./metricFormatting";

describe("formatDb", () => {
  it("adds an explicit + for positive values", () => {
    expect(formatDb(23.55)).toBe("+23.6 dB");
  });
  it("keeps the minus for negative values", () => {
    expect(formatDb(-12.6)).toBe("-12.6 dB");
  });
  it("renders an em dash for null/NaN", () => {
    expect(formatDb(null)).toBe("—");
    expect(formatDb(NaN)).toBe("—");
  });
});

describe("formatStoi", () => {
  it("uses three decimals", () => {
    expect(formatStoi(0.9123)).toBe("0.912");
  });
  it("em dash for null", () => {
    expect(formatStoi(null)).toBe("—");
  });
});

describe("metricRows", () => {
  it("omits STOI when null and includes it when present", () => {
    const noStoi = metricRows({ nr_db: 23, desired_distortion_db: -12, output_snr_db: 15, stoi: null });
    expect(noStoi.some((r) => r.key === "stoi")).toBe(false);
    expect(noStoi).toHaveLength(3);

    const withStoi = metricRows({ nr_db: 23, desired_distortion_db: -12, output_snr_db: 15, stoi: 0.9 });
    expect(withStoi.some((r) => r.key === "stoi")).toBe(true);
  });
  it("marks distortion as lower-is-better", () => {
    const rows = metricRows({ nr_db: 1, desired_distortion_db: -1, output_snr_db: 1, stoi: null });
    expect(rows.find((r) => r.key === "desired_distortion_db")?.higherBetter).toBe(false);
    expect(rows.find((r) => r.key === "nr_db")?.higherBetter).toBe(true);
  });
});
