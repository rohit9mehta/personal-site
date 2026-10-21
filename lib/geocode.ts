// Finds a café on OpenStreetMap from just its name and city.
//
// Order of attempts:
//   1. a hand-written address hint (from places.json), if there is one
//   2. Nominatim free-text search "<name>, <city>"
//   3. Nominatim search for the name, bounded to the city
//   4. Photon (fuzzier OSM search) biased to the city
//   5. the address hint's location, or else the city center ("approximate")
// Candidates must be near the city and look like a café with a matching name.

import type { PlaceInfo, Precision } from './dataset.ts';
import { slugify } from './dataset.ts';

export type FetchJson = (url: string) => Promise<unknown>;

export interface GeoHit {
  lat: number;
  lng: number;
  precision: Precision;
  street?: string;
  postcode?: string;
  neighborhood?: string;
  locality?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  osm?: string;
  source: 'nominatim' | 'photon';
  /** The name of the OSM feature that matched. */
  matched?: string;
}

interface Area {
  lat: number;
  lng: number;
  /** south, north, west, east */
  bbox: [number, number, number, number];
  /** How far from the center a café may be, in km. */
  radiusKm: number;
  /** Locality, region and country of the city itself. */
  fields: Pick<GeoHit, 'locality' | 'region' | 'country' | 'countryCode'>;
}

/** The parts of a Nominatim jsonv2 result we use. */
export interface NominatimResult {
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  importance?: number;
  osm_type?: string;
  osm_id?: number;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string | undefined>;
}

/** The parts of a Photon GeoJSON feature we use. */
export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';

// Countries that write the house number after the street name.
const NUMBER_AFTER_STREET = new Set(
  'at be ch cz de dk ee es fi gr hr hu is it lt lv nl no pl pt ro rs se si sk tr ua ar br cl co mx pe uy'.split(' '),
);

const NAME_NOISE = new Set(
  'the and a co company coffee cafe caffe caffee kaffe koffee kaffee espresso roasters roastery roasting roaster bar house shop bakery kitchen'.split(
    ' ',
  ),
);

function tokens(name: string): string[] {
  return slugify(name).split('-').filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** 0–1: how well an OSM name matches the name Rohit wrote down. */
export function nameSimilarity(wanted: string, found: string): number {
  const all = tokens(wanted);
  const core = all.filter((t) => !NAME_NOISE.has(t));
  const want = core.length ? core : all;
  const gotAll = tokens(found);
  const gotCore = gotAll.filter((t) => !NAME_NOISE.has(t));
  const got = new Set(gotCore.length ? gotCore : gotAll);
  if (!want.length || !got.size) return 0;
  const coverage = want.filter((t) => got.has(t)).length / want.length;
  const a = want.join('');
  const b = [...got].join('');
  // Typos and spacing ("Sight Glass" / "Sightglass"); only near-identical counts.
  const closeness = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const fuzzy = closeness >= 0.8 ? closeness : 0;
  // One name inside the other ("Linea" / "Linea Caffe"), as long as most of it overlaps.
  const shorter = Math.min(a.length, b.length);
  const overlap = shorter / Math.max(a.length, b.length);
  const contained = shorter >= 4 && overlap >= 0.65 && (a.includes(b) || b.includes(a)) ? 0.85 : 0;
  return Math.max(coverage, fuzzy, contained);
}

/** Kilometers between two points. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const CAFE_KINDS = new Set(['amenity:cafe', 'shop:coffee', 'amenity:coffee_shop', 'cuisine:coffee_shop']);
const FOOD_KINDS = new Set([
  'amenity:restaurant',
  'amenity:fast_food',
  'amenity:bar',
  'amenity:ice_cream',
  'shop:bakery',
  'shop:tea',
  'shop:deli',
  'shop:pastry',
  'shop:convenience',
  'shop:books',
  'craft:coffee_roaster',
  'amenity:pub',
]);

function kindBonus(kind: string): number {
  if (CAFE_KINDS.has(kind)) return 0.3;
  if (FOOD_KINDS.has(kind)) return 0.1;
  if (kind.startsWith('shop:') || kind.startsWith('amenity:') || kind.startsWith('craft:')) return 0;
  return -1; // roads, places, buildings…
}

function street(road?: string, number?: string, countryCode?: string): string | undefined {
  if (!road) return undefined;
  if (!number) return road;
  return countryCode && NUMBER_AFTER_STREET.has(countryCode) ? `${road} ${number}` : `${number} ${road}`;
}

export function fromNominatim(r: NominatimResult, precision: Precision): GeoHit {
  const a = r.address ?? {};
  const countryCode = a.country_code?.toLowerCase();
  const hit: GeoHit = {
    lat: Number(r.lat),
    lng: Number(r.lon),
    precision,
    source: 'nominatim',
    street: street(a.road ?? a.pedestrian ?? a.footway ?? a.square, a.house_number, countryCode),
    postcode: a.postcode,
    neighborhood: a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.borough,
    locality: a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet,
    region: a.state ?? a.province ?? a.region,
    country: a.country,
    countryCode,
    osm: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : undefined,
    matched: r.name,
  };
  return prune(hit);
}

export function fromPhoton(f: PhotonFeature, precision: Precision): GeoHit {
  const p = f.properties;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  const countryCode = str('countrycode')?.toLowerCase();
  const osmType = { N: 'node', W: 'way', R: 'relation' }[str('osm_type') ?? ''];
  const hit: GeoHit = {
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    precision,
    source: 'photon',
    street: street(str('street'), str('housenumber'), countryCode),
    postcode: str('postcode'),
    neighborhood: str('district') ?? str('locality'),
    locality: str('city'),
    region: str('state'),
    country: str('country'),
    countryCode,
    osm: osmType && p.osm_id !== undefined ? `${osmType}/${p.osm_id}` : undefined,
    matched: str('name'),
  };
  return prune(hit);
}

function prune<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) if (obj[key] === undefined) delete obj[key];
  return obj;
}

interface Candidate {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  importance: number;
  toHit: () => GeoHit;
}

export interface GeocoderOptions {
  fetchJson: FetchJson;
  /** Milliseconds between Nominatim requests (their policy: at most 1/s). */
  nominatimDelayMs?: number;
  photonDelayMs?: number;
  log?: (message: string) => void;
}

export class Geocoder {
  private readonly fetchJson: FetchJson;
  private readonly nominatimDelay: number;
  private readonly photonDelay: number;
  private readonly log: (message: string) => void;
  private readonly areas = new Map<string, Promise<Area | null>>();
  private lastNominatim = 0;
  private lastPhoton = 0;

  constructor(options: GeocoderOptions) {
    this.fetchJson = options.fetchJson;
    this.nominatimDelay = options.nominatimDelayMs ?? 1100;
    this.photonDelay = options.photonDelayMs ?? 500;
    this.log = options.log ?? (() => {});
  }

  private async nominatim(path: string, params: Record<string, string>): Promise<NominatimResult[]> {
    const wait = this.lastNominatim + this.nominatimDelay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastNominatim = Date.now();
    const query = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'en', ...params });
    const result = await this.fetchJson(`${NOMINATIM}${path}?${query}`);
    return Array.isArray(result) ? (result as NominatimResult[]) : [];
  }

  private async photon(params: Record<string, string>): Promise<PhotonFeature[]> {
    const wait = this.lastPhoton + this.photonDelay - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastPhoton = Date.now();
    const result = (await this.fetchJson(`${PHOTON}/api/?${new URLSearchParams(params)}`)) as {
      features?: PhotonFeature[];
    };
    return result?.features ?? [];
  }

  /** The city as an area: center, bounding box and a search radius. */
  area(city: string): Promise<Area | null> {
    const key = city.trim().toLowerCase();
    let pending = this.areas.get(key);
    if (!pending) {
      pending = this.findArea(city);
      this.areas.set(key, pending);
    }
    return pending;
  }

  private async findArea(city: string): Promise<Area | null> {
    let results = await this.nominatim('/search', { q: city, featureType: 'settlement', limit: '1' });
    if (!results.length) results = await this.nominatim('/search', { q: city, limit: '1' });
    const r = results[0];
    if (!r) return null;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    const bb = (r.boundingbox ?? [r.lat, r.lat, r.lon, r.lon]).map(Number) as [number, number, number, number];
    const halfDiagonal = distanceKm(bb[0], bb[2], bb[1], bb[3]) / 2;
    const { locality, region, country, countryCode } = fromNominatim(r, 'city');
    return {
      lat,
      lng,
      bbox: bb,
      radiusKm: Math.min(80, Math.max(25, halfDiagonal + 10)),
      fields: prune({ locality, region, country, countryCode }),
    };
  }

  private pick(name: string, candidates: Candidate[], near: { lat: number; lng: number; km: number }): GeoHit | null {
    let best: { score: number; candidate: Candidate } | null = null;
    for (const c of candidates) {
      if (distanceKm(near.lat, near.lng, c.lat, c.lng) > near.km) continue;
      const bonus = kindBonus(c.kind);
      if (bonus < 0) continue;
      const similarity = nameSimilarity(name, c.name);
      if (similarity < 0.6) continue;
      const score = similarity + bonus + c.importance * 0.1;
      if (!best || score > best.score) best = { score, candidate: c };
    }
    return best ? best.candidate.toHit() : null;
  }

  private nominatimCandidates(results: NominatimResult[]): Candidate[] {
    return results
      .filter((r) => r.name)
      .map((r) => ({
        name: r.name!,
        kind: `${r.category}:${r.type}`,
        lat: Number(r.lat),
        lng: Number(r.lon),
        importance: r.importance ?? 0,
        toHit: () => fromNominatim(r, 'exact'),
      }));
  }

  private photonCandidates(features: PhotonFeature[]): Candidate[] {
    return features
      .filter((f) => typeof f.properties.name === 'string')
      .map((f) => ({
        name: f.properties.name as string,
        kind: `${f.properties.osm_key}:${f.properties.osm_value}`,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        importance: 0,
        toHit: () => fromPhoton(f, 'exact'),
      }));
  }

  async place(name: string, city: string, hint: Pick<PlaceInfo, 'address'> = {}): Promise<GeoHit | null> {
    const area = await this.area(city);
    if (!area) {
      this.log(`  could not find the city "${city}"`);
      return null;
    }

    // A written address pins down which branch of a chain it was.
    let addressHit: GeoHit | null = null;
    if (hint.address) {
      const q = hint.address.toLowerCase().includes(city.toLowerCase()) ? hint.address : `${hint.address}, ${city}`;
      const [r] = await this.nominatim('/search', { q, limit: '1' });
      if (r && distanceKm(area.lat, area.lng, Number(r.lat), Number(r.lon)) <= area.radiusKm) {
        addressHit = fromNominatim(r, 'address');
      } else {
        this.log(`  address "${hint.address}" not found near ${city}`);
      }
    }
    const near = addressHit
      ? { lat: addressHit.lat, lng: addressHit.lng, km: 0.5 }
      : { lat: area.lat, lng: area.lng, km: area.radiusKm };

    const free = await this.nominatim('/search', { q: `${name}, ${city}`, limit: '10' });
    let hit = this.pick(name, this.nominatimCandidates(free), near);

    if (!hit) {
      const pad = addressHit ? 0.01 : 0.05;
      const [south, north, west, east] = addressHit
        ? [addressHit.lat, addressHit.lat, addressHit.lng, addressHit.lng]
        : area.bbox;
      const bounded = await this.nominatim('/search', {
        q: name,
        limit: '10',
        bounded: '1',
        viewbox: [west - pad, north + pad, east + pad, south - pad].join(','),
      });
      hit = this.pick(name, this.nominatimCandidates(bounded), near);
    }

    if (!hit) {
      const features = await this.photon({
        q: name,
        lat: String(near.lat),
        lon: String(near.lng),
        limit: '15',
        lang: 'en',
      });
      hit = this.pick(name, this.photonCandidates(features), near);
    }

    if (hit) {
      // OSM POIs often lack a house number; borrow the written address's.
      if (addressHit && !hit.street) hit.street = addressHit.street;
      return { ...area.fields, ...hit, precision: 'exact' };
    }
    if (addressHit) return { ...area.fields, ...addressHit };
    return { ...area.fields, lat: area.lat, lng: area.lng, precision: 'city', source: 'nominatim' };
  }
}

/** fetch() wrapper with the headers Nominatim asks for, and polite retries. */
export function httpFetchJson(userAgent: string): FetchJson {
  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
      if (res.ok) return res.json();
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
  };
}
