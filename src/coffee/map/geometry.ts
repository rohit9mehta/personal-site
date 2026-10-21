// Framing helpers for the map. Plain arrays, no MapLibre, so they're testable.

import type { Shop } from '../../../lib/dataset.ts';

export type Point = [lng: number, lat: number];
export type Bounds = [southWest: Point, northEast: Point];

export function pointsOf(shops: Shop[]): Point[] {
  return shops.filter((s) => s.lat !== undefined && s.lng !== undefined).map((s) => [s.lng!, s.lat!]);
}

/**
 * Bounds around the points. Longitudes wrap, so when going the other way round
 * the globe is much tighter (California + Japan, say) the bounds cross the
 * antimeridian (east > 180) instead of spanning Europe and the Atlantic.
 */
export function boundsOf(points: Point[]): Bounds | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]).sort((a, b) => a - b);
  const lats = points.map((p) => p[1]);
  let west = lngs[0]!;
  let east = lngs[lngs.length - 1]!;
  let widestGap = 0;
  let gapEnd = -1;
  for (let i = 1; i < lngs.length; i++) {
    const gap = lngs[i]! - lngs[i - 1]!;
    if (gap > widestGap) {
      widestGap = gap;
      gapEnd = i;
    }
  }
  if (gapEnd > 0 && 360 - widestGap < (east - west) * 0.75) {
    west = lngs[gapEnd]!;
    east = lngs[gapEnd - 1]! + 360;
  }
  return [
    [west, Math.min(...lats)],
    [east, Math.max(...lats)],
  ];
}

/** The points inside the longitude window of the given width that holds the most of them. */
export function densestWindow(points: Point[], width: number): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const wrapped = [...sorted, ...sorted.map(([lng, lat]): Point => [lng + 360, lat])];
  let best: [number, number] = [0, 0];
  for (let i = 0, j = 0; i < sorted.length; i++) {
    j = Math.max(j, i);
    while (j + 1 < i + sorted.length && wrapped[j + 1]![0] - wrapped[i]![0] <= width) j++;
    if (j - i > best[1] - best[0]) best = [i, j];
  }
  return wrapped.slice(best[0], best[1] + 1);
}
