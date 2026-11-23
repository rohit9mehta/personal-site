import { describe, expect, it } from 'vitest';
import { nearness, shrinkAt, wave } from './name.ts';

describe('nearness', () => {
  it('pulls hardest right under the cursor and fades with distance', () => {
    expect(nearness(0, 100)).toBe(1);
    expect(nearness(50, 100)).toBeGreaterThan(nearness(100, 100));
    expect(nearness(250, 100)).toBeLessThan(0.01);
  });
});

describe('wave', () => {
  it('peaks where the ripple has reached', () => {
    expect(wave(300, 300, 40)).toBe(1);
    expect(wave(200, 300, 40)).toBeLessThan(0.01);
    expect(wave(400, 300, 40)).toBeLessThan(0.01);
  });
});

describe('shrinkAt', () => {
  const path = { end: 600, scale: 0.1, dx: -12, fadeFrom: 0.9 };

  it('starts full size with the mark hidden', () => {
    const start = shrinkAt(0, path);
    expect(start).toMatchObject({ progress: 0, scale: 1, nameOpacity: 1, markOpacity: 0 });
    expect(start.x).toBeCloseTo(0);
  });

  it('shrinks by the same ratio for each pixel scrolled', () => {
    expect(shrinkAt(300, path).scale).toBeCloseTo(Math.sqrt(0.1));
    expect(shrinkAt(300, path).x).toBe(-6);
  });

  it('fades the name into the mark only at the very end', () => {
    expect(shrinkAt(500, path).markOpacity).toBe(0);
    const late = shrinkAt(570, path);
    expect(late.nameOpacity).toBeCloseTo(0.5);
    expect(late.markOpacity).toBeCloseTo(0.5);
  });

  it('stays in the header once it gets there', () => {
    for (const y of [600, 2000]) {
      expect(shrinkAt(y, path)).toEqual({ progress: 1, scale: 0.1, x: -12, nameOpacity: 0, markOpacity: 1 });
    }
  });

  it('copes with a hero too short to scroll through', () => {
    expect(shrinkAt(0, { ...path, end: 0 }).progress).toBe(1);
  });
});
