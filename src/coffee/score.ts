// Score → color. One hue, six steps. In the light theme it runs latte →
// espresso (the great cups are darkest); in the dark theme it runs the other
// way, dim → crema, so the best stand out there too. Both ramps are validated
// as ordinal ramps against their map surface (monotone lightness, visible
// steps, faintest step >= 2:1). The hex values live in src/shared/base.css as
// --score-0 … --score-5, with matching text colors --score-ink-0 … 5.

// Band edges follow where scores actually fall (median ~7.8), so the map isn't
// one color: under 7, 7–7.5, 7.5–8, 8–8.5, 8.5–9, 9 and up.
export const SCORE_THRESHOLDS = [7, 7.5, 8, 8.5, 9] as const;
export const SCORE_STEPS = [0, 1, 2, 3, 4, 5] as const;

/** 0 (under 7) to 5 (9 and up). */
export function scoreStep(score: number): number {
  let step = 0;
  for (const t of SCORE_THRESHOLDS) if (score >= t) step++;
  return step;
}

export function stepColor(step: number): string {
  return `var(--score-${step})`;
}

export function scoreColor(score: number): string {
  return stepColor(scoreStep(score));
}

/** Text color that stays readable on top of scoreColor(score). */
export function scoreInk(score: number): string {
  return `var(--score-ink-${scoreStep(score)})`;
}

/** 8 → "8.0", 7.25 → "7.25". */
export function formatScore(score: number): string {
  return Number.isInteger(score * 10) ? score.toFixed(1) : score.toFixed(2);
}
