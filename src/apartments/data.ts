// Loading the scan, and checking a listing you add by hand right here in the
// browser (NYC GeoSearch and NYC Open Data both allow that).

import { locate } from '../../lib/apartments/geo.ts';
import { EMPTY_SCAN, buildingKey, type Building, type Listing, type ScanData } from '../../lib/apartments/model.ts';
import { fetchPestRecords, type FetchJson } from '../../lib/apartments/records.ts';
import { geocodeQuery } from '../../lib/apartments/streeteasy.ts';

const REPO = 'rohit9mehta/personal-site';
export const SCAN_URL = `https://raw.githubusercontent.com/${REPO}/apartments-data/scan.json`;
export const WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/apartments.yml`;
export const RELAY_GUIDE_URL = `https://github.com/${REPO}/blob/main/apps-script/README.md`;

export const fetchJson: FetchJson = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export interface ScanResult {
  data: ScanData;
  /** False until the first scan has run. */
  exists: boolean;
}

export async function fetchScan(): Promise<ScanResult> {
  if (import.meta.env.VITE_APARTMENTS_SAMPLE) {
    const sample = structuredClone(
      (await import('../../fixtures/apartments/scan.json')).default,
    ) as unknown as ScanData;
    // Make the made-up scan look like it just ran.
    const shift = Date.now() - 14 * 60_000 - Date.parse(sample.updatedAt);
    const move = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
    sample.updatedAt = move(sample.updatedAt);
    for (const l of sample.listings) Object.assign(l, { firstSeen: move(l.firstSeen), lastSeen: move(l.lastSeen) });
    for (const e of sample.emails) e.date = move(e.date);
    return { data: sample, exists: true };
  }
  const res = await fetch(`${SCAN_URL}?t=${Math.floor(Date.now() / 60_000)}`, { cache: 'no-store' });
  if (res.status === 404) return { data: EMPTY_SCAN, exists: false };
  if (!res.ok) throw new Error(`Couldn't load the scan (HTTP ${res.status}).`);
  return { data: (await res.json()) as ScanData, exists: true };
}

const BOROUGHS: Record<string, string> = {
  new_york: 'Manhattan',
  manhattan: 'Manhattan',
  brooklyn: 'Brooklyn',
  queens: 'Queens',
  bronx: 'Bronx',
  staten_island: 'Staten Island',
};

/** What a StreetEasy link says about a listing. Building links spell out the address. */
export function readListingUrl(
  raw: string,
): { id: string; url: string; address?: string; unit?: string; borough?: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)streeteasy\.com$/.test(u.hostname)) return null;
  const rental = u.pathname.match(/^\/rental\/(\d+)/);
  if (rental) return { id: rental[1]!, url: `https://streeteasy.com/rental/${rental[1]}` };
  const building = u.pathname.match(/^\/building\/([a-z0-9-]+?)(?:_([a-z_]+))?\/([a-z0-9-]+)\/?$/i);
  if (building) {
    const [, slug, place, unit] = building;
    const address = slug!
      .split('-')
      .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
    return {
      id: `${slug}${place ? `_${place}` : ''}/${unit}`,
      url: `https://streeteasy.com/building/${slug}${place ? `_${place}` : ''}/${unit}`,
      address,
      unit: unit!.toUpperCase(),
      borough: BOROUGHS[place ?? ''] ?? 'Manhattan',
    };
  }
  return null;
}

/** Locates a building and pulls its city records, in the browser. */
export async function checkBuilding(address: string, borough = 'Manhattan'): Promise<Building> {
  const building: Building = { address };
  const geo = await locate(geocodeQuery(address, borough), fetchJson);
  if (!geo) return { ...building, geoError: 'address not found' };
  building.geo = geo;
  if (geo.bbl) building.records = await fetchPestRecords(geo.bbl, fetchJson);
  return building;
}

export function manualListing(fields: {
  id: string;
  url: string;
  address: string;
  unit?: string;
  price: number;
  beds?: number;
  neighborhood?: string;
}): Listing {
  const now = new Date().toISOString();
  return {
    id: fields.id,
    url: fields.url,
    address: fields.address,
    price: fields.price,
    updates: [],
    firstSeen: now,
    lastSeen: now,
    prices: [{ date: now.slice(0, 10), price: fields.price }],
    building: buildingKey(fields.address),
    ...(fields.unit ? { unit: fields.unit } : {}),
    ...(fields.beds !== undefined ? { beds: fields.beds } : {}),
    ...(fields.neighborhood ? { neighborhood: fields.neighborhood } : {}),
  };
}
