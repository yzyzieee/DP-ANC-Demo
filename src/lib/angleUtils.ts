// Pure angle helpers for the acoustic-scene SVG and direction snapping.
// Angle convention: degrees, 0 = +x axis (East), increasing counter-clockwise,
// matching the simulator (cos θ, sin θ). All functions are side-effect free.

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Smallest absolute circular distance between two angles, in [0, 180]. */
export function circularDistanceDeg(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(d, 360 - d);
}

/** Snap an angle to the nearest value in `grid` (grid assumed non-empty). */
export function snapToGrid(deg: number, grid: number[]): number {
  if (grid.length === 0) return normalizeDeg(deg);
  let best = grid[0];
  let bestDist = circularDistanceDeg(deg, grid[0]);
  for (const g of grid) {
    const dist = circularDistanceDeg(deg, g);
    if (dist < bestDist) {
      bestDist = dist;
      best = g;
    }
  }
  return best;
}

/**
 * Convert a scene angle (deg, CCW from +x) to SVG pixel coordinates.
 * SVG y grows downward, so we negate sin to keep 90° pointing "up" on screen.
 */
export function polarToSvg(
  deg: number,
  radius: number,
  cx: number,
  cy: number
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

/** Inverse of polarToSvg: pointer position → scene angle in [0, 360). */
export function svgToPolarDeg(
  x: number,
  y: number,
  cx: number,
  cy: number
): number {
  const rad = Math.atan2(-(y - cy), x - cx);
  return normalizeDeg((rad * 180) / Math.PI);
}
