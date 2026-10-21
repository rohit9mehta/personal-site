import { describe, expect, it } from 'vitest';
import type { Shop } from '../../lib/dataset.ts';
import { computeStats, filterShops, histogram, inBounds, sortShops, tokenize } from './model.ts';

function shop(name: string, city: string, score: number, extra: Partial<Shop> = {}): Shop {
  return { id: `${name}--${city}`, name, city, score, rank: 0, visits: [{ score }], ...extra };
}

const shops = [
  shop('Café du Clown', 'Paris, France', 9.3, { countryCode: 'fr', lat: 48.85, lng: 2.33 }),
  shop('Caffe Trieste', 'San Francisco, CA', 9.1, {
    countryCode: 'us',
    neighborhood: 'North Beach',
    lat: 37.8,
    lng: -122.4,
  }),
  shop('Timeless Coffee', 'Oakland, CA', 1.1, { countryCode: 'us', lat: 37.8, lng: -122.27 }),
  shop('Starbucks', 'Multiple locations', 7.3, { multiLocation: true }),
];

describe('search', () => {
  it('ignores case and accents and needs every word', () => {
    expect(tokenize('Café  CLOWN')).toEqual(['cafe', 'clown']);
    expect(filterShops(shops, { query: 'cafe paris', minScore: null }).map((s) => s.name)).toEqual(['Café du Clown']);
    expect(filterShops(shops, { query: 'north beach', minScore: null }).map((s) => s.name)).toEqual(['Caffe Trieste']);
    expect(filterShops(shops, { query: '', minScore: 9 }).map((s) => s.name)).toEqual([
      'Café du Clown',
      'Caffe Trieste',
    ]);
  });
});

describe('sortShops', () => {
  it('sorts best, worst, by name and by city', () => {
    expect(sortShops(shops, 'best')[0]?.name).toBe('Café du Clown');
    expect(sortShops(shops, 'worst')[0]?.name).toBe('Timeless Coffee');
    expect(sortShops(shops, 'name').map((s) => s.name)).toEqual([
      'Café du Clown',
      'Caffe Trieste',
      'Starbucks',
      'Timeless Coffee',
    ]);
    expect(sortShops(shops, 'city')[0]?.city).toBe('Multiple locations');
  });
});

describe('computeStats', () => {
  it('does not count chains as a city', () => {
    expect(computeStats(shops)).toEqual({ count: 4, cities: 3, countries: 2, median: 8.2 });
  });
});

describe('inBounds', () => {
  it('handles bounds across the antimeridian and shops without a location', () => {
    expect(inBounds(shops[1]!, { west: 170, east: -100, south: 0, north: 60 })).toBe(true);
    expect(inBounds(shops[0]!, { west: 170, east: -100, south: 0, north: 60 })).toBe(false);
    expect(inBounds(shops[3]!, { west: -180, east: 180, south: -90, north: 90 })).toBe(false);
  });
});

describe('histogram', () => {
  it('collects low outliers into one bucket and uses quarter points above it', () => {
    const buckets = histogram(shops);
    expect(buckets[0]).toEqual({ from: 0, to: 6, count: 1, below: true });
    expect(buckets[1]).toMatchObject({ from: 6, to: 6.25 });
    expect(buckets.at(-1)).toMatchObject({ from: 9.25, to: 9.5, count: 1 });
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  });

  it('has no catch-all bucket when nothing is that low', () => {
    expect(histogram([shop('A', 'X', 7.6), shop('B', 'X', 8.1)])[0]).toEqual({ from: 7.5, to: 7.75, count: 1 });
  });
});
