// Score → color. One hue, light → dark: latte for the forgettable cups,
// espresso for the great ones. Validated as an ordinal ramp against the map's
// paper surface (light end >= 2:1, monotone lightness, single hue).

export const SCORE_THRESHOLDS = [5, 6, 7, 8, 9] as const;
export const SCORE_COLORS = ['#d79974', '#c37b4e', '#aa602e', '#8d4917', '#6d3509', '#4d2304'] as const;
export const SCORE_BANDS = ['under 5', '5–6', '6–7', '7–8', '8–9', '9–10'] as const;

/** Index into SCORE_COLORS. */
export function scoreStep(score: number): number {
  let step = 0;
  for (const t of SCORE_THRESHOLDS) if (score >= t) step++;
  return step;
}

export function scoreColor(score: number): string {
  return SCORE_COLORS[scoreStep(score)]!;
}

/** Text color that stays readable on top of scoreColor(score). */
export function scoreInk(score: number): string {
  return scoreStep(score) >= 3 ? '#fffaf2' : '#1e1a16';
}

/** 8 → "8.0", 7.25 → "7.25". */
export function formatScore(score: number): string {
  return Number.isInteger(score * 10) ? score.toFixed(1) : score.toFixed(2);
}
