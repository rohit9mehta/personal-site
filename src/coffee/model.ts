// Filtering, sorting and summary stats over the dataset. No React here.

import type { Shop } from '../../lib/dataset.ts';

export type SortKey = 'best' | 'worst' | 'name' | 'city' | 'recent';

export const SORT_LABELS: Record<SortKey, string> = {
  best: 'Highest rated',
  worst: 'Lowest rated',
  name: 'Name, A–Z',
  city: 'City',
  recent: 'Most recent',
};

export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '');
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^\p{L}\p{N}.]+/u)
    .filter(Boolean);
}

const haystacks = new WeakMap<Shop, string>();

function haystack(shop: Shop): string {
  let text = haystacks.get(shop);
  if (text === undefined) {
    text = normalize(
      [shop.name, shop.city, shop.neighborhood, shop.region, shop.country, shop.address, shop.note]
        .filter(Boolean)
        .join(' · '),
    );
    haystacks.set(shop, text);
  }
  return text;
}

export function matchesQuery(shop: Shop, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const text = haystack(shop);
  return tokens.every((t) => text.includes(t));
}

export interface Filters {
  query: string;
  minScore: number | null;
}

export function filterShops(shops: Shop[], { query, minScore }: Filters): Shop[] {
  const scored = shops.filter((s) => minScore === null || s.score >= minScore);
  const tokens = tokenize(query);
  if (tokens.length > 1) {
    // "san francisco" should mean the city, not any café with "San" in one
    // field and "Francisco" in another; fall back to loose matching if no
    // café has the words together.
    const phrase = tokens.join(' ');
    const together = scored.filter((s) =>
      haystack(s)
        .replace(/[^\p{L}\p{N}.]+/gu, ' ')
        .includes(phrase),
    );
    if (together.length) return together;
  }
  return scored.filter((s) => matchesQuery(s, tokens));
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function inBounds(shop: Shop, b: Bounds): boolean {
  if (shop.lat === undefined || shop.lng === undefined) return false;
  if (shop.lat < b.south || shop.lat > b.north) return false;
  // Bounds can cross the antimeridian.
  return b.west <= b.east ? shop.lng >= b.west && shop.lng <= b.east : shop.lng >= b.west || shop.lng <= b.east;
}

const byName = (a: Shop, b: Shop) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function sortShops(shops: Shop[], key: SortKey): Shop[] {
  const list = [...shops];
  switch (key) {
    case 'best':
      return list.sort((a, b) => b.score - a.score || byName(a, b));
    case 'worst':
      return list.sort((a, b) => a.score - b.score || byName(a, b));
    case 'name':
      return list.sort(byName);
    case 'city':
      return list.sort(
        (a, b) => a.city.localeCompare(b.city, undefined, { sensitivity: 'base' }) || b.score - a.score || byName(a, b),
      );
    case 'recent':
      return list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.score - a.score || byName(a, b));
  }
}

export interface Stats {
  count: number;
  cities: number;
  countries: number;
  median: number | null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function cityKey(shop: Shop): string {
  return `${normalize(shop.city)}|${shop.countryCode ?? ''}`;
}

export function computeStats(shops: Shop[]): Stats {
  return {
    count: shops.length,
    cities: new Set(shops.filter((s) => !s.multiLocation).map(cityKey)).size,
    countries: new Set(shops.map((s) => s.countryCode).filter(Boolean)).size,
    median: median(shops.map((s) => s.score)),
  };
}

export interface Bucket {
  /** Lower edge; the first bucket may instead collect everything below `floor`. */
  from: number;
  to: number;
  count: number;
  /** True for the catch-all "under <floor>" bucket. */
  below?: true;
}

/**
 * Histogram of scores in buckets of width `step`. Scores under `floor` share
 * one leading bucket, so a few very low outliers don't squash the rest.
 */
export function histogram(shops: Shop[], step = 0.25, floor = 6): Bucket[] {
  if (!shops.length) return [];
  const scores = shops.map((s) => s.score);
  const min = Math.min(...scores);
  const lo = Math.max(floor, Math.floor(min / step) * step);
  const hi = Math.floor(Math.max(...scores, lo) / step) * step;
  const buckets: Bucket[] = [];
  if (min < lo) buckets.push({ from: 0, to: lo, count: 0, below: true });
  for (let from = lo; from <= hi + 1e-9; from += step) {
    const edge = Math.round(from * 100) / 100;
    buckets.push({ from: edge, to: Math.round((edge + step) * 100) / 100, count: 0 });
  }
  const offset = buckets[0]?.below ? 1 : 0;
  for (const score of scores) {
    const i = score < lo ? 0 : Math.min(buckets.length - 1, offset + Math.floor((score - lo) / step + 1e-9));
    buckets[i]!.count++;
  }
  return buckets;
}

export function hasDates(shops: Shop[]): boolean {
  return shops.some((s) => s.date);
}
