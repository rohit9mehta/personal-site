import { describe, expect, it } from 'vitest';
import { DEFAULT_PEST_RULES, type BuildingRecords } from './records.ts';
import {
  DEFAULT_SETTINGS,
  EMPTY_SCAN,
  buildingKey,
  evaluate,
  mergeListings,
  type Building,
  type CommuteFn,
  type Settings,
} from './model.ts';
import type { EmailListing } from './streeteasy.ts';
import type { Trip } from './transit.ts';

const NOW = new Date('2026-11-02T12:00:00Z');

const email = (over: Partial<EmailListing> = {}): EmailListing => ({
  id: '1',
  url: 'https://streeteasy.com/rental/1',
  address: '212 East 29th Street',
  unit: '7',
  neighborhood: 'Kips Bay',
  price: 3400,
  beds: 1,
  baths: 1,
  updates: [],
  section: 'new',
  ...over,
});

describe('buildingKey', () => {
  it('spells a building one way', () => {
    expect(buildingKey('753 East 5th Street')).toBe('753 e 5 st');
    expect(buildingKey('753 E. 5 St')).toBe('753 e 5 st');
    expect(buildingKey('40 Avenue B')).toBe('40 ave b');
  });
});

describe('mergeListings', () => {
  it('adds new listings and tracks price changes on known ones', () => {
    const data = structuredClone(EMPTY_SCAN);
    const added = mergeListings(data, [email(), email({ id: '2', unit: '3' })], '2026-11-01T10:00:00Z');
    expect(added).toHaveLength(2);
    expect(Object.keys(data.buildings)).toEqual(['212 e 29 st']);
    const again = mergeListings(data, [email({ price: 3300, updates: ['Price Drop: $100'] })], '2026-11-02T10:00:00Z');
    expect(again).toHaveLength(0);
    expect(data.listings[0]).toMatchObject({
      price: 3300,
      firstSeen: '2026-11-01T10:00:00Z',
      lastSeen: '2026-11-02T10:00:00Z',
      updates: ['Price Drop: $100'],
      prices: [
        { date: '2026-11-01', price: 3400 },
        { date: '2026-11-02', price: 3300 },
      ],
    });
  });

  it('skips listings it could not read', () => {
    const data = structuredClone(EMPTY_SCAN);
    expect(mergeListings(data, [email({ address: undefined })], '2026-11-01T10:00:00Z')).toEqual([]);
  });
});

describe('evaluate', () => {
  const data = structuredClone(EMPTY_SCAN);
  mergeListings(data, [email()], '2026-11-01T10:00:00Z');
  const listing = data.listings[0]!;
  const clean: BuildingRecords = { checkedAt: NOW.toISOString(), since: '2021-11-02', records: [], errors: {} };
  const building: Building = {
    address: listing.address,
    geo: { lat: 40.743, lng: -73.98, label: '', bbl: '1009090001', source: 'geosearch' },
    records: clean,
  };
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    places: [
      {
        id: 'o',
        label: 'Office',
        address: 'Cooper Union',
        lat: 40.729,
        lng: -73.9905,
        maxMinutes: 25,
        profile: 'weekday',
      },
    ],
  };
  const trip = (minutes: number): Trip => ({ minutes, waitMinutes: 2, walkMinutes: 30, mode: 'subway', legs: [] });
  const fast: CommuteFn = () => trip(18);

  it('is ready when everything checks out', () => {
    expect(evaluate(listing, building, settings, fast, 'clean', NOW)).toMatchObject({
      status: 'ready',
      fits: true,
      stretch: false,
      reasons: [],
      search: { id: 'small' },
    });
  });

  it('asks you to check Openigloo before calling it ready', () => {
    expect(evaluate(listing, building, settings, fast, undefined, NOW).status).toBe('check');
  });

  it('waits for the scan to locate the building and check the records', () => {
    expect(evaluate(listing, { address: listing.address }, settings, fast, 'clean', NOW).status).toBe('pending');
  });

  it('says why a listing is out', () => {
    const pricey = { ...listing, price: 3900 };
    const pests: Building = {
      ...building,
      records: {
        ...clean,
        records: [{ source: 'hpd-complaint', date: '2026-05-01', kinds: ['rodents'], text: 'Mice' }],
      },
    };
    const e = evaluate(pricey, pests, settings, () => trip(31), 'pests', NOW);
    expect(e.status).toBe('out');
    expect(e.reasons).toEqual([
      '$3,900 is over $3,500',
      '31 min to Office (max 25)',
      '1 pest record with the city in 2 yr',
      'Openigloo reviews mention pests',
    ]);
  });

  it('marks prices in the stretch zone', () => {
    const e = evaluate({ ...listing, price: 3650 }, building, settings, fast, 'clean', NOW);
    expect(e).toMatchObject({ status: 'ready', stretch: true });
  });

  it('matches neighborhoods by area, including sub-neighborhoods', () => {
    const chelsea = evaluate({ ...listing, neighborhood: 'Chelsea' }, building, settings, fast, 'clean', NOW);
    expect(chelsea.fits).toBe(true);
    const uws = evaluate({ ...listing, neighborhood: 'Upper West Side' }, building, settings, fast, 'clean', NOW);
    expect(uws.reasons).toEqual(["Upper West Side isn't one of your areas"]);
  });

  it('picks the filter that fits: a 2 bed goes to the 2 bed search', () => {
    const two = evaluate({ ...listing, beds: 2, price: 6500 }, building, settings, fast, 'clean', NOW);
    expect(two).toMatchObject({ fits: true, search: { id: 'two' } });
  });

  it('honors relaxed pest rules', () => {
    const one: Building = {
      ...building,
      records: { ...clean, records: [{ source: '311', date: '2026-05-01', kinds: ['rodents'], text: 'Rat' }] },
    };
    const relaxed = { ...settings, pests: { ...DEFAULT_PEST_RULES, allowed: 1 } };
    expect(evaluate(listing, one, relaxed, fast, 'clean', NOW).status).toBe('ready');
  });
});
