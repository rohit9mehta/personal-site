import { describe, expect, it } from 'vitest';
import { ringMarkup } from './artboard.ts';

/** A small seeded generator, so a ring comes out the same every run. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ringMarkup', () => {
  it('always has a wash, a soaked band, a rim and an inner rim at the size asked for', () => {
    for (let seed = 1; seed < 20; seed++) {
      const markup = ringMarkup(40, seeded(seed));
      expect(markup).toContain('<circle r="40.0" class="ring__wash"/>');
      expect(markup).toContain('<circle r="36.5" class="ring__band"');
      expect(markup).toContain('class="ring__rim"');
      expect(markup).toContain('<circle r="32.0" class="ring__inner"');
    }
  });

  it('comes out differently each time, with a ghost ring or drips only sometimes', () => {
    const rings = Array.from({ length: 40 }, (_, seed) => ringMarkup(40, seeded(seed + 1)));
    expect(new Set(rings).size).toBe(rings.length);
    const ghosts = rings.filter((r) => r.includes('ring__ghost')).length;
    const drips = rings.filter((r) => r.includes('ring__drip')).length;
    expect(ghosts).toBeGreaterThan(0);
    expect(ghosts).toBeLessThan(rings.length);
    expect(drips).toBeGreaterThan(0);
    expect(drips).toBeLessThan(rings.length);
  });

  it('never closes the rim more than all the way round', () => {
    const rim = /class="ring__rim"[^>]*stroke-dasharray="([\d.]+) ([\d.]+)"/;
    for (let seed = 1; seed < 20; seed++) {
      const [, drawn, around] = rim.exec(ringMarkup(30, seeded(seed)))!;
      expect(Number(drawn)).toBeLessThanOrEqual(Number(around));
      expect(Number(drawn)).toBeGreaterThanOrEqual(0.8 * Number(around) - 0.1);
    }
  });
});
