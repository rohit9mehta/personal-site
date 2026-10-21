import { describe, expect, it } from 'vitest';
import { boundsOf, densestWindow, type Point } from './geometry.ts';

const SF: Point = [-122.4, 37.8];
const NYC: Point = [-74, 40.7];
const LONDON: Point = [-0.1, 51.5];
const TOKYO: Point = [139.7, 35.7];
const MELBOURNE: Point = [145, -37.8];

describe('boundsOf', () => {
  it('is null without points', () => expect(boundsOf([])).toBeNull());

  it('spans west to east normally', () => {
    expect(boundsOf([SF, NYC, LONDON])).toEqual([
      [-122.4, 37.8],
      [-0.1, 51.5],
    ]);
  });

  it('wraps across the Pacific when that is much tighter', () => {
    expect(boundsOf([SF, TOKYO, MELBOURNE])).toEqual([
      [139.7, -37.8],
      [237.6, 37.8],
    ]);
  });
});

describe('densestWindow', () => {
  it('keeps the cluster that fits in the window', () => {
    const points = [SF, [-122.3, 37.9] as Point, NYC, LONDON, TOKYO];
    expect(densestWindow(points, 130)).toEqual([SF, [-122.3, 37.9], NYC, LONDON]);
  });

  it('can wrap around the antimeridian', () => {
    expect(densestWindow([SF, TOKYO, MELBOURNE, LONDON], 120)).toEqual([TOKYO, MELBOURNE, [237.6, 37.8]]);
  });
});
