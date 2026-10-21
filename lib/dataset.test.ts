import { describe, expect, it } from 'vitest';
import { buildDataset, parseDate, parseRatings, parseScore, placeKey, slugify } from './dataset.ts';

describe('slugify / placeKey', () => {
  it('makes readable ascii slugs', () => {
    expect(slugify('Café de Flore')).toBe('cafe-de-flore');
    expect(slugify("Peet's Coffee & Tea")).toBe('peets-coffee-and-tea');
    expect(placeKey('Sightglass Coffee', 'San Francisco')).toBe('sightglass-coffee--san-francisco');
  });

  it('is case and accent insensitive', () => {
    expect(placeKey('CAFÉ  Reveille', 'san francisco')).toBe(placeKey('Cafe Reveille', 'San Francisco'));
  });

  it('falls back to a stable hash for non-latin names', () => {
    const a = slugify('猿田彦珈琲');
    expect(a).toMatch(/^x[0-9a-z]+$/);
    expect(slugify('猿田彦珈琲')).toBe(a);
    expect(slugify('丸山珈琲')).not.toBe(a);
  });
});

describe('parseScore', () => {
  it.each([
    ['8', 8],
    ['8.5', 8.5],
    ['10', 10],
    ['0', 0],
    ['.5', 0.5],
    ['7.25', 7.25],
    ['9/10', 9],
    [' 6.5 ', 6.5],
  ])('accepts %s', (raw, expected) => expect(parseScore(raw)).toBe(expected));

  it.each(['', '11', '10.5', '-1', 'eight', '8.555', '8,5'])('rejects %j', (raw) => expect(parseScore(raw)).toBeNull());
});

describe('parseDate', () => {
  it('normalizes supported formats', () => {
    expect(parseDate('2026-10-21')).toBe('2026-10-21');
    expect(parseDate('2026-3-5')).toBe('2026-03-05');
    expect(parseDate('2026-03')).toBe('2026-03');
    expect(parseDate('3/5/2024')).toBe('2024-03-05');
    expect(parseDate('3/5/24')).toBe('2024-03-05');
  });

  it('rejects impossible dates', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('yesterday')).toBeNull();
  });
});

describe('parseRatings', () => {
  it('reads rows with optional columns in any order', () => {
    const { rows, issues } = parseRatings(
      'Score,Name,City,Note\n8.5,Sightglass,San Francisco,cortado\n7,Ritual,San Francisco,\n',
    );
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { line: 2, name: 'Sightglass', city: 'San Francisco', score: 8.5, note: 'cortado' },
      { line: 3, name: 'Ritual', city: 'San Francisco', score: 7 },
    ]);
  });

  it('accepts short rows when trailing optional columns are left off', () => {
    const { rows, issues } = parseRatings('name,city,score,date,note\nSightglass,San Francisco,8.5\n');
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ name: 'Sightglass', score: 8.5 });
  });

  it('reports every bad row with its line number and keeps the good ones', () => {
    const { rows, issues } = parseRatings('name,city,score,date\nA,B,11,\n,B,7,\nC,D,7,2026-02-30\nE,F,6,\n');
    expect(rows.map((r) => r.name)).toEqual(['E']);
    expect(issues).toEqual([
      { line: 2, message: 'score "11" must be a number from 0 to 10' },
      { line: 3, message: 'name is empty' },
      { line: 4, message: 'date "2026-02-30" should look like 2026-10-21' },
    ]);
  });

  it('flags an unquoted comma that adds a column', () => {
    const { issues } = parseRatings('name,city,score\nBlue Bottle,Portland, OR,8\n');
    expect(issues[0]?.message).toMatch(/wrap values that contain commas in double quotes/);
  });

  it('validates the header', () => {
    expect(parseRatings('name,city\n').issues).toEqual([{ line: 1, message: 'missing required column "score"' }]);
    expect(parseRatings('name,city,socre\n').issues.map((i) => i.message)).toEqual([
      'unknown column "socre" (allowed: name, city, score, date, note)',
      'missing required column "score"',
    ]);
    expect(parseRatings('').issues[0]?.message).toMatch(/empty/);
  });
});

describe('buildDataset', () => {
  const csv = [
    'name,city,score,date,note',
    'Sightglass Coffee,San Francisco,8,2025-01-02,',
    'Ritual,San Francisco,7.5,,',
    'Fuglen,Tokyo,9,,great',
    'sightglass coffee,San Francisco,8.5,2026-04-01,better this time',
    'Unknown Spot,Nowhere,7.5,,',
  ].join('\n');
  const places = {
    'sightglass-coffee--san-francisco': {
      name: 'Sightglass Coffee',
      city: 'San Francisco',
      lat: 37.777,
      lng: -122.408,
      precision: 'exact' as const,
      street: '270 7th Street',
      neighborhood: 'SoMa',
      country: 'United States',
      countryCode: 'us',
    },
    'fuglen--tokyo': { name: 'Fuglen', city: 'Tokyo', lat: 35.67, lng: 139.69, address: '1-16-11 Tomigaya, Shibuya' },
    'ritual--san-francisco': {
      name: 'Ritual',
      city: 'San Francisco',
      lat: 37.75,
      lng: -122.42,
      precision: 'city' as const,
    },
  };

  it('merges repeat visits, keeping the latest score and the full history', () => {
    const { dataset } = buildDataset(csv, places, '2026-10-21');
    const sightglass = dataset.shops.find((s) => s.id === 'sightglass-coffee--san-francisco')!;
    expect(sightglass.name).toBe('sightglass coffee');
    expect(sightglass.score).toBe(8.5);
    expect(sightglass.date).toBe('2026-04-01');
    expect(sightglass.note).toBe('better this time');
    expect(sightglass.visits).toEqual([
      { score: 8, date: '2025-01-02' },
      { score: 8.5, date: '2026-04-01', note: 'better this time' },
    ]);
    expect(sightglass).toMatchObject({
      lat: 37.777,
      address: '270 7th Street',
      neighborhood: 'SoMa',
      countryCode: 'us',
    });
  });

  it('ranks by score with shared ranks for ties', () => {
    const { dataset } = buildDataset(csv, places, '2026-10-21');
    expect(dataset.shops.map((s) => [s.name, s.rank])).toEqual([
      ['Fuglen', 1],
      ['sightglass coffee', 2],
      ['Ritual', 3],
      ['Unknown Spot', 3],
    ]);
  });

  it('prefers a hand-written address and defaults precision to exact', () => {
    const fuglen = buildDataset(csv, places).dataset.shops.find((s) => s.name === 'Fuglen')!;
    expect(fuglen.address).toBe('1-16-11 Tomigaya');
    expect(fuglen.precision).toBe('exact');
  });

  it('keeps chains rated across locations off the map without flagging them', () => {
    const { dataset, unlocated } = buildDataset('name,city,score\nStarbucks,Multiple,7.3\n', {});
    expect(dataset.shops[0]).toMatchObject({ name: 'Starbucks', multiLocation: true });
    expect(dataset.shops[0]?.lat).toBeUndefined();
    expect(unlocated).toEqual([]);
  });

  it('lists cafés that have no coordinates yet', () => {
    const { unlocated, dataset } = buildDataset(csv, places);
    expect(unlocated).toEqual(['Unknown Spot (Nowhere)']);
    expect(dataset.shops.find((s) => s.name === 'Unknown Spot')?.lat).toBeUndefined();
  });
});
