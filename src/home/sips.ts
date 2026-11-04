// What the homepage says about the coffee data: the latest café rated and
// every city rated in. No DOM here.

import type { Shop } from '../../lib/dataset.ts';
import { cityKey } from '../coffee/model.ts';

/** "San Francisco, CA" → "San Francisco". */
export function cityLabel(city: string): string {
  return city.split(',')[0]!.trim() || city.trim();
}

/** The café rated most recently (the last one logged in the CSV). */
export function lastSip(shops: readonly Shop[]): Shop | undefined {
  let latest: Shop | undefined;
  for (const shop of shops) {
    if (shop.logged === undefined) continue;
    if (!latest || shop.logged > (latest.logged ?? -1)) latest = shop;
  }
  return latest;
}

export interface CityTally {
  label: string;
  count: number;
  /** The city's highest-rated café. */
  best: Shop;
  /** 0 for the cities with fewest cafés, 1 for the city with most; square-root scaled. */
  weight: number;
}

/** Every city with a rated café (chains rated as a whole don't count), most cafés first. */
export function cityTally(shops: readonly Shop[]): CityTally[] {
  const groups = new Map<string, Shop[]>();
  for (const shop of shops) {
    if (shop.multiLocation) continue;
    const key = cityKey(shop);
    const group = groups.get(key);
    if (group) group.push(shop);
    else groups.set(key, [shop]);
  }
  const counts = [...groups.values()].map((g) => g.length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return [...groups.values()]
    .map((group) => ({
      label: cityLabel(group[0]!.city),
      count: group.length,
      best: group.reduce((a, b) => (b.score > a.score ? b : a)),
      weight: max > min ? Math.sqrt((group.length - min) / (max - min)) : 1,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
