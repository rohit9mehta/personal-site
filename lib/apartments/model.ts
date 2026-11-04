// The apartment hunt's data, and the one function that decides whether a
// listing is worth a tour.
//
// Scan data (public, on the `apartments-data` branch): listings from StreetEasy
// alert emails, and per building its location and city pest records.
// Settings (private, in your browser): your filters, the places you commute to,
// how strict to be about pests, and what you found on Openigloo.

import type { BuildingGeo } from './geo.ts';
import { DEFAULT_PEST_RULES, judgePests, type BuildingRecords, type PestRules, type PestVerdict } from './records.ts';
import { AREAS, inAreas, parseSearchUrl, tidyAddress, type EmailListing } from './streeteasy.ts';
import type { LatLng, ProfileId, Trip } from './transit.ts';

// --- Scan data -----------------------------------------------------------------

export interface Listing {
  id: string;
  url: string;
  address: string;
  unit?: string;
  neighborhood?: string;
  kind?: string;
  price: number;
  noFee?: boolean;
  beds?: number;
  baths?: number;
  sqft?: number;
  broker?: string;
  /** StreetEasy's latest notes ("Open House", "Price Drop: $100"). */
  updates: string[];
  /** Came as a "Because you searched for…" suggestion rather than a match. */
  suggested?: boolean;
  /** StreetEasy says it's rented. */
  offMarket?: boolean;
  /** The StreetEasy saved search that sent it. */
  search?: string;
  /** ISO timestamps. */
  firstSeen: string;
  lastSeen: string;
  /** Every price it has been listed at, oldest first. */
  prices: { date: string; price: number }[];
  /** Key into `buildings`. */
  building: string;
}

export interface Building {
  /** As listed: "753 East 5th Street". */
  address: string;
  geo?: BuildingGeo;
  geoError?: string;
  records?: BuildingRecords;
}

export interface ProcessedEmail {
  /** Gmail message id. */
  id: string;
  /** When the email was sent. */
  date: string;
  /** How many listings were in it. */
  found: number;
}

export interface ScanData {
  version: 1;
  updatedAt: string;
  listings: Listing[];
  buildings: Record<string, Building>;
  emails: ProcessedEmail[];
}

export const EMPTY_SCAN: ScanData = { version: 1, updatedAt: '', listings: [], buildings: {}, emails: [] };

const WORDS: [RegExp, string][] = [
  [/\bstreet\b/g, 'st'],
  [/\bavenue\b/g, 'ave'],
  [/\bplace\b/g, 'pl'],
  [/\bboulevard\b/g, 'blvd'],
  [/\beast\b/g, 'e'],
  [/\bwest\b/g, 'w'],
  [/\bnorth\b/g, 'n'],
  [/\bsouth\b/g, 's'],
];

/** One key per building, however the address is spelled: "753 East 5th Street" → "753 e 5 st". */
export function buildingKey(address: string): string {
  let k = address
    .toLowerCase()
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9-]+/g, ' ');
  for (const [re, short] of WORDS) k = k.replace(re, short);
  return k.replace(/\s+/g, ' ').trim();
}

/** Adds listings from one alert email. Returns the ones that are new to us. */
export function mergeListings(data: ScanData, incoming: EmailListing[], seenAt: string): Listing[] {
  const byId = new Map(data.listings.map((l) => [l.id, l]));
  const added: Listing[] = [];
  for (const e of incoming) {
    if (!e.address || e.price === undefined) continue;
    const key = buildingKey(e.address);
    data.buildings[key] ??= { address: e.address };
    const existing = byId.get(e.id);
    if (existing) {
      if (existing.price !== e.price) existing.prices.push({ date: seenAt.slice(0, 10), price: e.price });
      Object.assign(existing, {
        price: e.price,
        updates: e.updates,
        lastSeen: seenAt > existing.lastSeen ? seenAt : existing.lastSeen,
        ...(e.noFee !== undefined ? { noFee: e.noFee } : {}),
        ...(e.section !== 'suggested' ? { suggested: false } : {}),
        ...(e.offMarket ? { offMarket: true } : {}),
      });
      // Fill in what an earlier email left out (or an older parser missed).
      for (const field of ['unit', 'neighborhood', 'kind', 'beds', 'baths', 'sqft', 'broker', 'search'] as const) {
        if (existing[field] === undefined && e[field] !== undefined) Object.assign(existing, { [field]: e[field] });
      }
      continue;
    }
    const listing: Listing = {
      id: e.id,
      url: e.url,
      address: e.address,
      price: e.price,
      updates: e.updates,
      firstSeen: seenAt,
      lastSeen: seenAt,
      prices: [{ date: seenAt.slice(0, 10), price: e.price }],
      building: key,
      ...(e.unit ? { unit: e.unit } : {}),
      ...(e.neighborhood ? { neighborhood: e.neighborhood } : {}),
      ...(e.kind ? { kind: e.kind } : {}),
      ...(e.noFee ? { noFee: true } : {}),
      ...(e.beds !== undefined ? { beds: e.beds } : {}),
      ...(e.baths !== undefined ? { baths: e.baths } : {}),
      ...(e.sqft !== undefined ? { sqft: e.sqft } : {}),
      ...(e.broker ? { broker: e.broker } : {}),
      ...(e.section === 'suggested' ? { suggested: true } : {}),
      ...(e.offMarket ? { offMarket: true } : {}),
      ...(e.search ? { search: e.search } : {}),
    };
    data.listings.push(listing);
    byId.set(listing.id, listing);
    added.push(listing);
  }
  return added;
}

/**
 * Puts right the addresses an older parser misread: it took the email's preview line
 * ("515 2nd Avenue and 9 more updates" + invisible padding) for the first listing's.
 * Returns how many it fixed; their buildings get located again under the right name.
 */
export function repairListings(data: ScanData): number {
  let fixed = 0;
  for (const listing of data.listings) {
    const address = tidyAddress(listing.address);
    if (address === listing.address) continue;
    listing.address = address;
    listing.building = buildingKey(address);
    data.buildings[listing.building] ??= { address };
    fixed++;
  }
  return fixed;
}

// --- Settings ------------------------------------------------------------------

export interface Search {
  id: string;
  name: string;
  /** StreetEasy area ids. */
  areas: number[];
  /** 0 = studio; 4 = 4+. */
  beds: number[];
  maxPrice: number;
  /** How far over the max you'd still look (shown as a stretch). */
  stretch: number;
  noFeeOnly?: boolean;
}

export interface Place {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  /** Door to door, by subway or on foot. */
  maxMinutes: number;
  /** When you'd usually make the trip. */
  profile: ProfileId;
}

export type IglooVerdict = 'clean' | 'pests';

export interface Settings {
  searches: Search[];
  places: Place[];
  pests: PestRules;
}

/** Your neighborhoods, from the brief: Midtown & Midtown East down through SoHo, NoHo, Nolita. */
export const DEFAULT_AREAS = [120, 123, 115, 107, 118, 162, 159, 158, 116, 113];

export const DEFAULT_SETTINGS: Settings = {
  searches: [
    { id: 'small', name: 'Studio or 1 bed', areas: DEFAULT_AREAS, beds: [0, 1], maxPrice: 3500, stretch: 250 },
    { id: 'two', name: '2 bed', areas: DEFAULT_AREAS, beds: [2], maxPrice: 7000, stretch: 0 },
  ],
  places: [],
  pests: DEFAULT_PEST_RULES,
};

// --- Judging -------------------------------------------------------------------

export interface Commute {
  place: Place;
  trip: Trip;
  ok: boolean;
}

export type Status = 'ready' | 'check' | 'pending' | 'out';

export interface Evaluation {
  listing: Listing;
  building: Building | undefined;
  /** The filter it fits (the closest one when it fits none). */
  search: Search | undefined;
  fits: boolean;
  /** Fits only thanks to the stretch above your max. */
  stretch: boolean;
  commutes: Commute[];
  pests: PestVerdict;
  igloo: IglooVerdict | 'unchecked';
  /** Why it's out, in plain words. */
  reasons: string[];
  status: Status;
}

const bedsLabel = (n: number) => (n === 0 ? 'studio' : `${n} bed`);
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

/** What keeps a listing out of one filter (empty: it fits). */
export function searchProblems(listing: Listing, search: Search): string[] {
  const problems: string[] = [];
  if (listing.price > search.maxPrice + search.stretch)
    problems.push(`${usd(listing.price)} is over ${usd(search.maxPrice)}`);
  if (listing.beds !== undefined && search.beds.length) {
    const beds = Math.min(4, Math.floor(listing.beds));
    if (!search.beds.includes(beds)) problems.push(`${bedsLabel(beds)} isn't in “${search.name}”`);
  }
  if (search.noFeeOnly && !listing.noFee) problems.push('has a broker fee');
  if (search.areas.length) {
    const named = inAreas(listing.neighborhood, search.areas);
    // Neighborhood names we don't know: trust the StreetEasy search that sent it, if it was a real match.
    const fromSearch =
      !listing.suggested &&
      !!listing.search &&
      !!parseSearchUrl(listing.search)?.areas.some((a) => search.areas.includes(a));
    if (!named && !(fromSearch && !knownName(listing.neighborhood))) {
      problems.push(`${listing.neighborhood ?? 'Its neighborhood'} isn't one of your areas`);
    }
  }
  return problems;
}

const knownName = (n: string | undefined) =>
  !!n &&
  inAreas(
    n,
    AREAS.map((a) => a.id),
  );

export type CommuteFn = (place: Place, from: LatLng) => Trip | undefined;

export function evaluate(
  listing: Listing,
  building: Building | undefined,
  settings: Settings,
  commute: CommuteFn,
  igloo: IglooVerdict | undefined,
  now = new Date(),
): Evaluation {
  const reasons: string[] = [];
  if (listing.offMarket) reasons.push('Rented, says StreetEasy');

  let search: Search | undefined;
  let fewest = Infinity;
  let problems: string[] = [];
  for (const s of settings.searches) {
    const p = searchProblems(listing, s);
    if (p.length < fewest) {
      fewest = p.length;
      search = s;
      problems = p;
    }
  }
  const fits = !!search && problems.length === 0;
  if (!settings.searches.length) reasons.push('No filters set up');
  else reasons.push(...problems);
  const stretch = fits && listing.price > search!.maxPrice;

  const geo = building?.geo;
  const commutes: Commute[] = [];
  if (geo) {
    for (const place of settings.places) {
      if (place.lat === undefined || place.lng === undefined) continue;
      const trip = commute(place, geo);
      if (!trip) continue;
      const ok = trip.minutes <= place.maxMinutes;
      commutes.push({ place, trip, ok });
      if (!ok) reasons.push(`${trip.minutes} min to ${place.label} (max ${place.maxMinutes})`);
    }
  }

  const pests = judgePests(building?.records, settings.pests, now);
  if (pests.status === 'pests') {
    const n = pests.counted.length;
    reasons.push(`${n} pest record${n === 1 ? '' : 's'} with the city in ${settings.pests.years} yr`);
  }
  if (igloo === 'pests') reasons.push('Openigloo reviews mention pests');

  let status: Status;
  if (reasons.length) status = 'out';
  else if (!geo || pests.status === 'unknown') status = 'pending';
  else if (igloo !== 'clean') status = 'check';
  else status = 'ready';

  return {
    listing,
    building,
    search,
    fits,
    stretch,
    commutes,
    pests,
    igloo: igloo ?? 'unchecked',
    reasons,
    status,
  };
}
