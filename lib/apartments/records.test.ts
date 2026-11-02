import { describe, expect, it } from 'vitest';
import { fromGeoSearch, fromNominatim, houseNumber, openiglooUrl } from './geo.ts';
import {
  DEFAULT_PEST_RULES,
  classify,
  fetchPestRecords,
  judgePests,
  tidyViolation,
  type BuildingRecords,
  type FetchJson,
} from './records.ts';

describe('classify', () => {
  it('sorts city text into pests', () => {
    expect(classify('ABATE THE NUISANCE CONSISTING OF MICE IN THE ENTIRE APARTMENT')).toEqual(['rodents']);
    expect(classify('Rat Sighting')).toEqual(['rodents']);
    expect(classify('UNSANITARY CONDITION PESTS ROACHES')).toEqual(['roaches']);
    expect(classify('BEDBUGS')).toEqual(['bedbugs']);
    expect(classify('BED BUGS')).toEqual(['bedbugs']);
    expect(classify('UNSANITARY CONDITION PESTS')).toEqual(['other']);
  });

  it("doesn't see rats in every word", () => {
    expect(classify('SEPARATE ACCURATE RATE GRATE')).toEqual([]);
    expect(classify('PAINT/PLASTER WALLS')).toEqual([]);
  });

  it('tidies violation text', () => {
    expect(
      tidyViolation(
        '§ 27-2018 ADM CODE ABATE THE NUISANCE CONSISTING OF MICE IN THE ENTIRE APARTMENT LOCATED AT APT 4B, 4th STORY',
      ),
    ).toBe('Abate the nuisance consisting of mice in the entire apartment');
  });
});

describe('fetchPestRecords', () => {
  const NOW = new Date('2026-11-02T12:00:00Z');
  const responses: Record<string, unknown> = {
    'wvxf-dwi5': [
      {
        buildingid: '12345',
        inspectiondate: '2026-03-04T00:00:00.000',
        novdescription:
          '§ 27-2018 ADM CODE ABATE THE NUISANCE CONSISTING OF ROACHES IN THE ENTIRE APARTMENT LOCATED AT APT 2',
        violationstatus: 'Close',
        apartment: '2',
      },
      { inspectiondate: '2025-01-01T00:00:00.000', novdescription: 'SEPARATE AND PAINT' },
    ],
    'ygpa-z7cr': [
      {
        received_date: '2025-08-01T00:00:00.000',
        major_category: 'UNSANITARY CONDITION',
        minor_category: 'PESTS',
        problem_code: 'MICE',
        problem_status: 'CLOSE',
        apartment: '5C',
      },
    ],
    'wz6d-d3jb': [
      { filing_date: '2025-12-01T00:00:00.000', infested_dwelling_unit_count: '0', of_dwelling_units: '40' },
      {
        filing_date: '2024-12-01T00:00:00.000',
        infested_dwelling_unit_count: '2',
        re_infested_dwelling_unit: '0',
        of_dwelling_units: '40',
      },
    ],
    'p937-wjvj': [{ inspection_date: '2026-06-01T00:00:00.000', result: 'Passed' }],
  };
  const fake: FetchJson = async (url) => {
    const dataset = url.match(/resource\/([a-z0-9-]+)\.json/)![1]!;
    if (dataset === 'erm2-nwe9') throw new Error('HTTP 503');
    return responses[dataset];
  };

  it('collects pest records from every source, newest first', async () => {
    const result = await fetchPestRecords('1009060030', fake, { now: NOW });
    expect(result.since).toBe('2021-11-02');
    expect(result.hpdBuildingId).toBe('12345');
    expect(result.records.map((r) => [r.source, r.date, r.kinds.join()])).toEqual([
      ['hpd-violation', '2026-03-04', 'roaches'],
      ['hpd-complaint', '2025-08-01', 'rodents'],
      ['bedbugs', '2024-12-01', 'bedbugs'],
    ]);
    expect(result.records[0]).toMatchObject({ apartment: '2', status: 'Close' });
    expect(result.records[2]!.text).toBe('Landlord reported bedbugs in 2 of 40 apartments that year');
    expect(result.errors).toEqual({ '311': 'HTTP 503' });
  });

  it('asks the city by BBL and only for pests', async () => {
    const urls: string[] = [];
    await fetchPestRecords('1009060030', async (u) => (urls.push(u), []), { now: NOW });
    const violations = new URL(urls.find((u) => u.includes('wvxf-dwi5'))!).searchParams.get('$where')!;
    expect(violations).toContain("bbl='1009060030'");
    expect(violations).toContain("upper(novdescription) like '%MICE%'");
  });

  it('says so when there is no BBL to look up', async () => {
    const result = await fetchPestRecords('', fake, { now: NOW });
    expect(Object.keys(result.errors)).toHaveLength(5);
  });
});

describe('judgePests', () => {
  const NOW = new Date('2026-11-02T12:00:00Z');
  const records: BuildingRecords = {
    checkedAt: NOW.toISOString(),
    since: '2021-11-02',
    errors: {},
    records: [
      { source: 'hpd-complaint', date: '2026-01-10', kinds: ['rodents'], text: 'Complaint: Mice' },
      { source: 'hpd-violation', date: '2023-05-01', kinds: ['roaches'], text: 'Roaches' },
    ],
  };

  it('fails a building with recent pests', () => {
    const v = judgePests(records, DEFAULT_PEST_RULES, NOW);
    expect(v.status).toBe('pests');
    expect(v.counted).toHaveLength(1);
    expect(v.byKind).toEqual({ rodents: 1 });
  });

  it('respects the window, the allowance and the pests you care about', () => {
    expect(judgePests(records, { ...DEFAULT_PEST_RULES, allowed: 1 }, NOW).status).toBe('clear');
    expect(judgePests(records, { ...DEFAULT_PEST_RULES, years: 5, allowed: 1 }, NOW).status).toBe('pests');
    const noRodents = { ...DEFAULT_PEST_RULES, kinds: { ...DEFAULT_PEST_RULES.kinds, rodents: false } };
    expect(judgePests(records, noRodents, NOW).status).toBe('clear');
  });

  it("won't call a building clear when HPD couldn't be checked", () => {
    const blind = { ...records, records: [], errors: { 'hpd-violation': 'x', 'hpd-complaint': 'x' } };
    expect(judgePests(blind, DEFAULT_PEST_RULES, NOW).status).toBe('unknown');
    expect(judgePests(undefined, DEFAULT_PEST_RULES, NOW).status).toBe('unknown');
  });
});

describe('geo', () => {
  const feature = (housenumber: string, extra: object = {}) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-73.99419, 40.75693] },
    properties: {
      label: `${housenumber} West 38 Street, Manhattan, New York, NY, USA`,
      housenumber,
      street: 'West 38 Street',
      borough: 'Manhattan',
      postalcode: '10018',
      neighbourhood: 'Chelsea',
      addendum: { pad: { bbl: '1007107501', bin: '1090727' } },
      ...extra,
    },
  });

  it('reads coordinates and the building ids', () => {
    const g = fromGeoSearch({ features: [feature('515')] }, '515 West 38th Street, Manhattan, NY');
    expect(g).toMatchObject({ lat: 40.75693, lng: -73.99419, bbl: '1007107501', bin: '1090727', zip: '10018' });
    expect(openiglooUrl(g!, '515 West 38th Street')).toBe(
      'https://www.openigloo.com/building/nyc/1090727-1007107501/manhattan-chelsea-515-west-38-street-10018',
    );
  });

  it('rejects a match at a different house number', () => {
    expect(fromGeoSearch({ features: [feature('517')] }, '515 West 38th Street')).toBeNull();
  });

  it('finds the ids even if they move', () => {
    const moved = feature('515', { addendum: { other: { nested: { bbl: '1007107501', bin: '1090727' } } } });
    expect(fromGeoSearch({ features: [moved] }, '515 W 38 St')).toMatchObject({ bbl: '1007107501' });
  });

  it('falls back to OpenStreetMap coordinates inside the city only', () => {
    expect(fromNominatim([{ lat: '40.73', lon: '-73.99', display_name: 'x' }], 'q')).toMatchObject({ lat: 40.73 });
    expect(fromNominatim([{ lat: '42.0', lon: '-73.99' }], 'q')).toBeNull();
  });

  it('reads house numbers', () => {
    expect(houseNumber('70-80 Kenmare Street')).toBe('70-80');
    expect(houseNumber('40 Avenue B')).toBe('40');
    expect(houseNumber('Avenue B')).toBeUndefined();
  });
});
