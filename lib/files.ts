// Where the data lives, and reading/writing it. Node only.

import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { PlaceInfo, PlacesFile } from './dataset.ts';

export const ROOT = resolve(import.meta.dirname, '..');
// COFFEE_DATA points at another folder (e.g. fixtures/sample) for local work.
export const DATA_DIR = resolve(ROOT, process.env.COFFEE_DATA ?? 'data');
export const CSV_PATH = resolve(DATA_DIR, 'coffee.csv');
export const PLACES_PATH = resolve(DATA_DIR, 'places.json');

export function displayPath(path: string): string {
  return relative(ROOT, path);
}

export function readRatingsText(path = CSV_PATH): string {
  return readFileSync(path, 'utf8');
}

export function readPlaces(path = PLACES_PATH): PlacesFile {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(text) as PlacesFile;
  } catch (err) {
    throw new Error(`${displayPath(path)} is not valid JSON: ${(err as Error).message}`, { cause: err });
  }
}

const FIELD_ORDER: (keyof PlaceInfo)[] = [
  'name',
  'city',
  'address',
  'lat',
  'lng',
  'precision',
  'street',
  'postcode',
  'neighborhood',
  'locality',
  'region',
  'country',
  'countryCode',
  'osm',
  'source',
  'checked',
  'unresolved',
];

/** Writes places.json sorted by key, one stable field order, for small diffs. */
export function writePlaces(places: PlacesFile, path = PLACES_PATH): void {
  const sorted: PlacesFile = {};
  for (const key of Object.keys(places).sort()) {
    const place = places[key]!;
    const ordered: Record<string, unknown> = {};
    for (const field of FIELD_ORDER) if (place[field] !== undefined) ordered[field] = place[field];
    for (const [field, value] of Object.entries(place)) if (!(field in ordered)) ordered[field] = value;
    sorted[key] = ordered as unknown as PlaceInfo;
  }
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** Appends Markdown to the GitHub Actions job summary, when running there. */
export function jobSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) writeFileSync(file, `${markdown}\n`, { flag: 'a' });
}
