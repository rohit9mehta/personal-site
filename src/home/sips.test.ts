import { describe, expect, it } from 'vitest';
import type { Shop } from '../../lib/dataset.ts';
import { cityLabel, cityTally, lastSip } from './sips.ts';

function shop(name: string, city: string, score: number, extra: Partial<Shop> = {}): Shop {
  return { id: `${name}--${city}`, name, city, score, rank: 0, visits: [{ score }], ...extra };
}

describe('cityLabel', () => {
  it('drops the state or country', () => {
    expect(cityLabel('San Francisco, CA')).toBe('San Francisco');
    expect(cityLabel('Paris, France')).toBe('Paris');
    expect(cityLabel('Zermatt')).toBe('Zermatt');
  });
});

describe('lastSip', () => {
  it('is the café logged last, skipping the early rows whose order is unknown', () => {
    const shops = [
      shop('Old Favourite', 'Paris, France', 9.3),
      shop('Pura Vida', 'New York, NY', 7.4, { logged: 270 }),
      shop('Sant Ambroeus', 'New York, NY', 7.4, { logged: 264 }),
    ];
    expect(lastSip(shops)?.name).toBe('Pura Vida');
    expect(lastSip([shop('Old Favourite', 'Paris, France', 9.3)])).toBeUndefined();
  });
});

describe('cityTally', () => {
  const shops = [
    shop('Caffe Trieste', 'San Francisco, CA', 9.1, { countryCode: 'us' }),
    shop('Sightglass', 'San Francisco, CA', 8.5, { countryCode: 'us' }),
    shop('Ritual', 'San Francisco, CA', 8.0, { countryCode: 'us' }),
    shop('Café du Clown', 'Paris, France', 9.3, { countryCode: 'fr' }),
    shop('Telescope', 'Paris, France', 8.8, { countryCode: 'fr' }),
    shop('Subko', 'Mumbai, India', 9.2, { countryCode: 'in' }),
    shop('Starbucks', 'Multiple locations', 7.3, { multiLocation: true }),
  ];

  it('counts cafés per city, most first, and leaves out chains rated as a whole', () => {
    const tally = cityTally(shops);
    expect(tally.map((c) => [c.label, c.count])).toEqual([
      ['San Francisco', 3],
      ['Paris', 2],
      ['Mumbai', 1],
    ]);
    expect(tally.map((c) => c.best.name)).toEqual(['Caffe Trieste', 'Café du Clown', 'Subko']);
  });

  it('weighs cities from 0 (fewest cafés) to 1 (most) on a square-root scale', () => {
    expect(cityTally(shops).map((c) => c.weight)).toEqual([1, Math.sqrt(0.5), 0]);
    expect(cityTally([shops[5]!])[0]?.weight).toBe(1);
    expect(cityTally([])).toEqual([]);
  });
});
