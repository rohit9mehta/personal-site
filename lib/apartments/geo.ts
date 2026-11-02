// Finding an NYC address: coordinates plus the city's building ids (BBL, BIN),
// which every city record is filed under. Uses NYC Planning's GeoSearch (free,
// no key, built on the city's own address database), with OpenStreetMap as a
// fallback for coordinates only. Runs in the scan and in the browser.

import type { FetchJson } from './records.ts';

export interface BuildingGeo {
  lat: number;
  lng: number;
  /** As the city writes it: "753 EAST 5 STREET, Manhattan, New York, NY, USA". */
  label: string;
  bbl?: string;
  bin?: string;
  neighborhood?: string;
  borough?: string;
  zip?: string;
  houseNumber?: string;
  street?: string;
  source: 'geosearch' | 'nominatim';
}

const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2/search';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);

/** Finds a key anywhere below `o` (GeoSearch nests the PAD ids a few levels down). */
function deepFind(o: unknown, key: string, depth = 0): string | undefined {
  if (!o || typeof o !== 'object' || depth > 4) return undefined;
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase() === key && text(v)) return text(v);
  }
  for (const v of Object.values(o)) {
    const hit = deepFind(v, key, depth + 1);
    if (hit) return hit;
  }
  return undefined;
}

/** The leading house number of an address ("70-80 Kenmare St" → "70-80"). */
export function houseNumber(address: string): string | undefined {
  return address.trim().match(/^(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)\s/)?.[1];
}

export function fromGeoSearch(json: unknown, query: string): BuildingGeo | null {
  const features = obj(json).features;
  if (!Array.isArray(features)) return null;
  const wanted = houseNumber(query);
  for (const f of features) {
    const props = obj(obj(f).properties);
    const coords = obj(obj(f).geometry).coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const found = text(props.housenumber);
    // A different house number on the same street is a different building.
    if (wanted && found && wanted.split('-')[0] !== found.split('-')[0]) continue;
    const pad = obj(obj(props.addendum).pad);
    const bbl = text(pad.bbl) ?? deepFind(props, 'bbl');
    const bin = text(pad.bin) ?? deepFind(props, 'bin');
    return {
      lng: Number(coords[0]),
      lat: Number(coords[1]),
      label: text(props.label) ?? query,
      ...(bbl && /^\d{10}$/.test(bbl) ? { bbl } : {}),
      ...(bin && /^\d{7}$/.test(bin) && !/^\d000000$/.test(bin) ? { bin } : {}),
      ...(text(props.neighbourhood) ? { neighborhood: text(props.neighbourhood) } : {}),
      ...(text(props.borough) ? { borough: text(props.borough) } : {}),
      ...(text(props.postalcode) ? { zip: text(props.postalcode) } : {}),
      ...(found ? { houseNumber: found } : {}),
      ...(text(props.street) ? { street: text(props.street) } : {}),
      source: 'geosearch',
    };
  }
  return null;
}

export function fromNominatim(json: unknown, query: string): BuildingGeo | null {
  if (!Array.isArray(json) || !json.length) return null;
  const hit = obj(json[0]);
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Stay inside the five boroughs.
  if (lat < 40.49 || lat > 40.92 || lng < -74.27 || lng > -73.68) return null;
  return { lat, lng, label: text(hit.display_name) ?? query, source: 'nominatim' };
}

/** Looks up an address. `query` should include the borough ("…, Manhattan, NY"). */
export async function locate(query: string, fetchJson: FetchJson): Promise<BuildingGeo | null> {
  try {
    const hit = fromGeoSearch(await fetchJson(`${GEOSEARCH}?text=${encodeURIComponent(query)}&size=3`), query);
    if (hit) return hit;
  } catch {
    // fall through to OpenStreetMap
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
  return fromNominatim(await fetchJson(url), query);
}

/** Address suggestions as you type, for the places you commute to. */
export async function suggest(textQuery: string, fetchJson: FetchJson): Promise<BuildingGeo[]> {
  const json = await fetchJson(
    `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(textQuery)}&size=5`,
  );
  const features = obj(json).features;
  if (!Array.isArray(features)) return [];
  return features
    .map((f) => fromGeoSearch({ features: [f] }, ''))
    .filter((g): g is BuildingGeo => !!g && Number.isFinite(g.lat));
}

// --- Links -------------------------------------------------------------------

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The building's page on Openigloo (tenant reviews), when we know its ids. */
export function openiglooUrl(geo: BuildingGeo | undefined, address: string): string {
  if (geo?.bin && geo.bbl) {
    const borough = slug(geo.borough ?? 'manhattan');
    const parts = [borough, geo.neighborhood, geo.houseNumber ?? houseNumber(address), geo.street, geo.zip];
    return `https://www.openigloo.com/building/nyc/${geo.bin}-${geo.bbl}/${slug(parts.filter(Boolean).join(' '))}`;
  }
  return openiglooSearchUrl(address);
}

/** A web search for the building on Openigloo, for when the direct link misses. */
export function openiglooSearchUrl(address: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:openigloo.com "${address}"`)}`;
}

/** JustFix's Who Owns What: landlord, violations, complaints and evictions in one place. */
export function whoOwnsWhatUrl(bbl: string): string {
  return `https://whoownswhat.justfix.org/bbl/${bbl}`;
}

export function hpdOnlineUrl(buildingId: string): string {
  return `https://hpdonline.nyc.gov/hpdonline/building/${buildingId}`;
}

/** Google Maps transit directions, to double-check a commute. */
export function directionsUrl(from: string, to: string): string {
  const p = new URLSearchParams({ api: '1', origin: from, destination: to, travelmode: 'transit' });
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
