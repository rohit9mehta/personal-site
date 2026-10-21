import { describe, expect, it } from 'vitest';
import {
  Geocoder,
  distanceKm,
  fromNominatim,
  nameSimilarity,
  type NominatimResult,
  type PhotonFeature,
} from './geocode.ts';

describe('nameSimilarity', () => {
  it.each([
    ['Sightglass', 'Sightglass Coffee'],
    ['Blue Bottle Coffee', 'Blue Bottle'],
    ['Sight Glass', 'Sightglass Coffee'],
    ['Coffee Bar', 'Coffee Bar'],
    ['Café de Flore', 'Cafe de Flore'],
    ['Ritual Coffee', 'Ritual Coffee Roasters'],
  ])('%j matches %j', (a, b) => expect(nameSimilarity(a, b)).toBeGreaterThanOrEqual(0.8));

  it.each([
    ['Ritual', 'Philz Coffee'],
    ['Saint Frank', 'Sightglass Coffee'],
    ['Four Barrel', 'Barrel House'],
  ])('%j does not match %j', (a, b) => expect(nameSimilarity(a, b)).toBeLessThan(0.6));
});

describe('distanceKm', () => {
  it('measures great-circle distance', () => {
    expect(distanceKm(37.7749, -122.4194, 37.8044, -122.2712)).toBeCloseTo(13.4, 0);
  });
});

describe('fromNominatim', () => {
  it('orders house numbers the local way', () => {
    const base = { lat: '1', lon: '2', osm_type: 'node', osm_id: 7 };
    expect(
      fromNominatim({ ...base, address: { road: '7th Street', house_number: '270', country_code: 'us' } }, 'exact')
        .street,
    ).toBe('270 7th Street');
    expect(
      fromNominatim({ ...base, address: { road: 'Grüners gate', house_number: '1', country_code: 'no' } }, 'exact')
        .street,
    ).toBe('Grüners gate 1');
  });
});

const SF: NominatimResult = {
  lat: '37.7792588',
  lon: '-122.4193286',
  category: 'boundary',
  type: 'administrative',
  name: 'San Francisco',
  boundingbox: ['37.6403143', '37.9298443', '-123.1738', '-122.281479'],
  address: { city: 'San Francisco', state: 'California', country: 'United States', country_code: 'us' },
};

const SIGHTGLASS: NominatimResult = {
  lat: '37.7770',
  lon: '-122.4086',
  category: 'amenity',
  type: 'cafe',
  name: 'Sightglass Coffee',
  importance: 0.2,
  osm_type: 'node',
  osm_id: 123,
  address: {
    house_number: '270',
    road: '7th Street',
    neighbourhood: 'SoMa',
    city: 'San Francisco',
    state: 'California',
    postcode: '94103',
    country: 'United States',
    country_code: 'us',
  },
};

function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const key = u.hostname.startsWith('photon')
      ? `photon:${u.searchParams.get('q')}`
      : `${u.searchParams.get('q')}|${u.searchParams.get('bounded') ?? ''}`;
    return routes[key] ?? (u.hostname.startsWith('photon') ? { features: [] } : []);
  };
  return { fetchJson, calls };
}

const quiet = { nominatimDelayMs: 0, photonDelayMs: 0 };

describe('Geocoder.place', () => {
  it('picks the café in the right city and ignores look-alikes', async () => {
    const { fetchJson } = fakeFetch({
      'San Francisco|': [SF],
      'Sightglass, San Francisco|': [
        { ...SIGHTGLASS, category: 'highway', type: 'residential', name: 'Sightglass Lane' },
        { ...SIGHTGLASS, lat: '21.30', lon: '-157.85', osm_id: 999 },
        SIGHTGLASS,
      ],
    });
    const hit = await new Geocoder({ fetchJson, ...quiet }).place('Sightglass', 'San Francisco');
    expect(hit).toMatchObject({
      lat: 37.777,
      lng: -122.4086,
      precision: 'exact',
      street: '270 7th Street',
      neighborhood: 'SoMa',
      countryCode: 'us',
      osm: 'node/123',
    });
  });

  it('falls back to a bounded search, then Photon', async () => {
    const photon: PhotonFeature = {
      geometry: { coordinates: [-122.4213, 37.7564] },
      properties: {
        name: 'Ritual Coffee Roasters',
        osm_key: 'amenity',
        osm_value: 'cafe',
        osm_type: 'N',
        osm_id: 5,
        street: 'Valencia Street',
        housenumber: '1026',
        city: 'San Francisco',
        countrycode: 'US',
      },
    };
    const { fetchJson, calls } = fakeFetch({ 'San Francisco|': [SF], 'photon:Ritual': { features: [photon] } });
    const hit = await new Geocoder({ fetchJson, ...quiet }).place('Ritual', 'San Francisco');
    expect(hit).toMatchObject({ precision: 'exact', street: '1026 Valencia Street', source: 'photon', osm: 'node/5' });
    expect(calls.some((c) => c.includes('bounded=1'))).toBe(true);
  });

  it('uses the city center when the café is not on OpenStreetMap', async () => {
    const { fetchJson } = fakeFetch({ 'San Francisco|': [SF] });
    const hit = await new Geocoder({ fetchJson, ...quiet }).place('Tiny Pop-up', 'San Francisco');
    expect(hit).toEqual({
      lat: 37.7792588,
      lng: -122.4193286,
      precision: 'city',
      source: 'nominatim',
      locality: 'San Francisco',
      region: 'California',
      country: 'United States',
      countryCode: 'us',
    });
  });

  it('uses a written address to choose the right branch', async () => {
    const mint = { ...SIGHTGLASS, name: 'Blue Bottle Coffee', lat: '37.7826', lon: '-122.4078', osm_id: 2 };
    const ferry = {
      ...SIGHTGLASS,
      name: 'Blue Bottle Coffee',
      lat: '37.7955',
      lon: '-122.3937',
      osm_id: 3,
      importance: 0.5,
    };
    const { fetchJson } = fakeFetch({
      'San Francisco|': [SF],
      '66 Mint St, San Francisco|': [{ ...mint, category: 'place', type: 'house', name: undefined }],
      'Blue Bottle Coffee, San Francisco|': [ferry, mint],
    });
    const hit = await new Geocoder({ fetchJson, ...quiet }).place('Blue Bottle Coffee', 'San Francisco', {
      address: '66 Mint St',
    });
    expect(hit).toMatchObject({ osm: 'node/2', precision: 'exact' });
  });

  it('returns null when the city cannot be found', async () => {
    const { fetchJson } = fakeFetch({});
    expect(await new Geocoder({ fetchJson, ...quiet }).place('Anything', 'Atlantis')).toBeNull();
  });

  it('looks each city up once', async () => {
    const { fetchJson, calls } = fakeFetch({ 'San Francisco|': [SF] });
    const geocoder = new Geocoder({ fetchJson, ...quiet });
    await geocoder.place('A', 'San Francisco');
    await geocoder.place('B', 'san francisco');
    expect(calls.filter((c) => c.includes('featureType=settlement'))).toHaveLength(1);
  });
});
