// Turns data/coffee.csv (what Rohit edits) and data/places.json (what the
// geocoder maintains) into the dataset the map renders. Pure functions only:
// file access lives in the callers.

import { parseCsv, CsvSyntaxError } from './csv.ts';

export const COLUMNS = ['name', 'city', 'score', 'date', 'note'] as const;
export type Column = (typeof COLUMNS)[number];
const REQUIRED_COLUMNS: readonly Column[] = ['name', 'city', 'score'];

export interface RatingRow {
  line: number;
  name: string;
  city: string;
  score: number;
  date?: string;
  note?: string;
}

export interface DataIssue {
  line?: number;
  message: string;
}

/** How exactly a café's coordinates are known. */
export type Precision = 'exact' | 'address' | 'city';

/** One entry of data/places.json, keyed by placeKey(name, city). */
export interface PlaceInfo {
  name: string;
  city: string;
  lat?: number;
  lng?: number;
  precision?: Precision;
  /** Human-written address. Used as a geocoding hint and shown as-is. */
  address?: string;
  street?: string;
  postcode?: string;
  neighborhood?: string;
  locality?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  /** OpenStreetMap object, e.g. "node/123". */
  osm?: string;
  source?: string;
  /** Date the geocoder last looked this place up. */
  checked?: string;
  /** Set when even the city could not be found. */
  unresolved?: boolean;
}

export type PlacesFile = Record<string, PlaceInfo>;

export interface Visit {
  score: number;
  date?: string;
  note?: string;
}

export interface Shop {
  id: string;
  name: string;
  city: string;
  /** The most recent rating. */
  score: number;
  /** 1 = best. Ties share a rank. */
  rank: number;
  /** Oldest first. */
  visits: Visit[];
  note?: string;
  date?: string;
  lat?: number;
  lng?: number;
  precision?: Precision;
  address?: string;
  neighborhood?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  osm?: string;
}

export interface Dataset {
  shops: Shop[];
  /** ISO date the dataset was built. */
  updated: string;
}

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  // Names in non-Latin scripts: fall back to a stable hash (FNV-1a).
  let hash = 0x811c9dc5;
  for (const ch of input.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `x${hash.toString(36)}`;
}

/** Stable id for a café: the same name in the same city is the same place. */
export function placeKey(name: string, city: string): string {
  return `${slugify(name)}--${slugify(city)}`;
}

const SCORE_RE = /^(\d{1,2}(?:\.\d{1,2})?|\.\d{1,2})(?:\s*\/\s*10)?$/;

export function parseScore(raw: string): number | null {
  const match = SCORE_RE.exec(raw.trim());
  if (!match?.[1]) return null;
  const score = Number(match[1]);
  return score >= 0 && score <= 10 ? score : null;
}

/** Accepts 2024-03-05, 2024-03, or US-style 3/5/2024. Returns ISO or null. */
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  let year: number;
  let month: number;
  let day: number | undefined;
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(value);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = m[3] ? Number(m[3]) : undefined;
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
    if (!m) return null;
    month = Number(m[1]);
    day = Number(m[2]);
    year = Number(m[3]);
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  const mm = String(month).padStart(2, '0');
  if (day === undefined) return `${year}-${mm}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${mm}-${String(day).padStart(2, '0')}`;
}

export function parseRatings(text: string): { rows: RatingRow[]; issues: DataIssue[] } {
  const issues: DataIssue[] = [];
  let records;
  try {
    records = parseCsv(text);
  } catch (err) {
    if (err instanceof CsvSyntaxError) return { rows: [], issues: [{ line: err.line, message: err.message }] };
    throw err;
  }
  const [header, ...body] = records;
  if (!header) return { rows: [], issues: [{ message: 'the file is empty; it needs a header row: name,city,score' }] };

  const columns = header.fields.map((f) => f.trim().toLowerCase());
  const index = new Map<Column, number>();
  columns.forEach((col, i) => {
    if (!(COLUMNS as readonly string[]).includes(col)) {
      issues.push({
        line: header.line,
        message: `unknown column "${header.fields[i]}" (allowed: ${COLUMNS.join(', ')})`,
      });
    } else if (index.has(col as Column)) {
      issues.push({ line: header.line, message: `column "${col}" appears twice` });
    } else {
      index.set(col as Column, i);
    }
  });
  for (const col of REQUIRED_COLUMNS) {
    if (!index.has(col)) issues.push({ line: header.line, message: `missing required column "${col}"` });
  }
  if (issues.length) return { rows: [], issues };

  const rows: RatingRow[] = [];
  for (const record of body) {
    const get = (col: Column) => {
      const i = index.get(col);
      return i === undefined ? '' : (record.fields[i] ?? '').trim();
    };
    if (record.fields.length > columns.length && record.fields.slice(columns.length).some((f) => f.trim())) {
      issues.push({
        line: record.line,
        message: `has ${record.fields.length} values but the header has ${columns.length}; wrap values that contain commas in double quotes`,
      });
      continue;
    }
    const name = get('name');
    const city = get('city');
    const rawScore = get('score');
    const rawDate = get('date');
    const note = get('note');
    const problems: string[] = [];
    if (!name) problems.push('name is empty');
    if (!city) problems.push('city is empty');
    const score = parseScore(rawScore);
    if (score === null)
      problems.push(rawScore ? `score "${rawScore}" must be a number from 0 to 10` : 'score is empty');
    const date = rawDate ? parseDate(rawDate) : undefined;
    if (date === null) problems.push(`date "${rawDate}" should look like 2026-10-21`);
    if (problems.length || score === null || date === null) {
      issues.push({ line: record.line, message: problems.join('; ') });
      continue;
    }
    const row: RatingRow = { line: record.line, name, city, score };
    if (date) row.date = date;
    if (note) row.note = note;
    rows.push(row);
  }
  return { rows, issues };
}

/** Street-level address line for display, e.g. "270 7th Street". */
export function displayAddress(place: PlaceInfo | undefined): string | undefined {
  if (!place) return undefined;
  if (place.address) return place.address;
  return place.street || undefined;
}

export function buildDataset(
  csvText: string,
  places: PlacesFile,
  updated: string = new Date().toISOString().slice(0, 10),
): { dataset: Dataset; issues: DataIssue[]; unlocated: string[] } {
  const { rows, issues } = parseRatings(csvText);
  const byKey = new Map<string, RatingRow[]>();
  for (const row of rows) {
    const key = placeKey(row.name, row.city);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const shops: Shop[] = [];
  const unlocated: string[] = [];
  for (const [id, visitsRows] of byKey) {
    // The file is a log: the last row for a café is its current rating.
    const latest = visitsRows[visitsRows.length - 1]!;
    const place = places[id];
    const shop: Shop = {
      id,
      name: latest.name,
      city: latest.city,
      score: latest.score,
      rank: 0,
      visits: visitsRows.map(({ score, date, note }) => ({ score, ...(date && { date }), ...(note && { note }) })),
    };
    const note = [...visitsRows].reverse().find((r) => r.note)?.note;
    if (note) shop.note = note;
    if (latest.date) shop.date = latest.date;
    if (place && typeof place.lat === 'number' && typeof place.lng === 'number') {
      shop.lat = place.lat;
      shop.lng = place.lng;
      shop.precision = place.precision ?? 'exact';
    } else {
      unlocated.push(`${latest.name} (${latest.city})`);
    }
    const address = displayAddress(place);
    if (address) shop.address = address;
    if (place?.neighborhood) shop.neighborhood = place.neighborhood;
    if (place?.region) shop.region = place.region;
    if (place?.country) shop.country = place.country;
    if (place?.countryCode) shop.countryCode = place.countryCode;
    if (place?.osm) shop.osm = place.osm;
    shops.push(shop);
  }

  shops.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  shops.forEach((shop, i) => {
    const prev = shops[i - 1];
    shop.rank = prev && prev.score === shop.score ? prev.rank : i + 1;
  });

  return { dataset: { shops, updated }, issues, unlocated };
}

export function formatIssues(file: string, issues: DataIssue[]): string {
  return issues.map((issue) => `${file}${issue.line ? `:${issue.line}` : ''}  ${issue.message}`).join('\n');
}
