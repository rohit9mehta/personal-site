// Looks up map locations for cafés in data/coffee.csv that don't have one yet,
// and saves them to data/places.json. Runs in CI on every push to main.
//   npm run enrich                   locate new cafés
//   npm run enrich -- --retry-approx  also retry cafés only placed at their city
//   npm run enrich -- --prune         drop places no longer in the CSV
//   npm run enrich -- --dry-run       look up, but don't write anything

import { isMultiLocation, parseRatings, placeKey, type PlaceInfo } from '../lib/dataset.ts';
import { Geocoder, httpFetchJson, type GeoHit } from '../lib/geocode.ts';
import { PLACES_PATH, displayPath, jobSummary, readPlaces, readRatingsText, writePlaces } from '../lib/files.ts';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const retryApprox = args.has('--retry-approx');
const prune = args.has('--prune');

const { rows, issues } = parseRatings(readRatingsText());
if (issues.length) {
  console.error('data/coffee.csv has problems; run `npm run validate` for details.');
  process.exit(1);
}

const places = readPlaces();
const wanted = new Map<string, { name: string; city: string }>();
for (const row of rows) {
  if (!isMultiLocation(row.city)) wanted.set(placeKey(row.name, row.city), { name: row.name, city: row.city });
}

const todo = [...wanted].filter(([key]) => {
  const place = places[key];
  if (!place) return true;
  if (place.lat === undefined || place.lng === undefined) return true;
  return retryApprox && place.precision === 'city' && place.source !== 'manual';
});

const today = new Date().toISOString().slice(0, 10);
const geocoder = new Geocoder({
  fetchJson: httpFetchJson('OneSip/1.0 (+https://github.com/rohit9mehta/personal-site)'),
  log: (m) => console.log(m),
});

const located: { key: string; hit: GeoHit }[] = [];
const failed: string[] = [];

if (todo.length) console.log(`Locating ${todo.length} café(s)…`);
for (const [key, { name, city }] of todo) {
  const existing = places[key];
  console.log(`• ${name} (${city})`);
  let hit: GeoHit | null;
  try {
    hit = await geocoder.place(name, city, { address: existing?.address });
  } catch (err) {
    console.log(`  lookup failed: ${(err as Error).message}`);
    failed.push(`${name} (${city})`);
    continue;
  }
  if (!hit) {
    places[key] = { ...existing, name, city, unresolved: true, checked: today };
    failed.push(`${name} (${city})`);
    continue;
  }
  if (existing?.precision === 'city' && hit.precision === 'city') {
    console.log('  still only the city');
    continue;
  }
  const { matched, ...fields } = hit;
  const place: PlaceInfo = {
    name,
    city,
    ...(existing?.address && { address: existing.address }),
    ...fields,
    checked: today,
  };
  places[key] = place;
  located.push({ key, hit });
  console.log(
    `  → ${hit.precision}${matched ? ` "${matched}"` : ''} ${[hit.street, hit.neighborhood, hit.locality].filter(Boolean).join(', ')}`,
  );
}

let pruned = 0;
if (prune) {
  for (const key of Object.keys(places)) {
    if (!wanted.has(key)) {
      delete places[key];
      pruned++;
    }
  }
}

if (!dryRun && (todo.length || pruned)) writePlaces(places);

const exact = located.filter((l) => l.hit.precision !== 'city').length;
console.log(
  todo.length || pruned
    ? `\nDone: ${exact} located, ${located.length - exact} approximate, ${failed.length} not found, ${pruned} removed${dryRun ? ' (dry run, nothing written)' : ` → ${displayPath(PLACES_PATH)}`}`
    : 'Every café already has a location.',
);

if (located.length || failed.length) {
  const lines = located.map(({ key, hit }) => {
    const { name, city } = wanted.get(key)!;
    const where =
      hit.precision === 'city' ? '_city center only_' : [hit.street, hit.neighborhood].filter(Boolean).join(', ');
    const link = hit.osm
      ? `https://www.openstreetmap.org/${hit.osm}`
      : `https://www.openstreetmap.org/?mlat=${hit.lat}&mlon=${hit.lng}#map=17/${hit.lat}/${hit.lng}`;
    return `| ${name} | ${city} | ${where} | [map](${link}) |`;
  });
  jobSummary(
    [
      '### ☕ New coffee shops located',
      '',
      '| Café | City | Found | |',
      '| --- | --- | --- | --- |',
      ...lines,
      ...failed.map((f) => `| ${f} | | **not found** | |`),
      '',
      'Wrong spot? Add an `"address"` to that entry in `data/places.json`, delete its `lat`/`lng`, and push.',
    ].join('\n'),
  );
}
