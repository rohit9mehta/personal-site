// The apartment scan. Runs in GitHub Actions (.github/workflows/apartments.yml)
// whenever the Gmail relay forwards new StreetEasy alert emails, and every few
// hours to refresh city records:
//
//   1. reads listings out of the forwarded emails,
//   2. locates each new building (NYC GeoSearch → coordinates, BBL, BIN),
//   3. pulls its pest records from NYC Open Data (re-checked weekly),
//   4. saves everything to scan.json on the `apartments-data` branch,
//      which the site reads directly.
//
// Commute times aren't computed here: the site works them out in your browser,
// so the addresses you commute to never leave it.
//
//   node scripts/apartments/scan.ts --data .apartments-data
//   node scripts/apartments/scan.ts --data /tmp/x --email lib/apartments/fixtures/alert-a.txt

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jobSummary } from '../../lib/files.ts';
import { locate } from '../../lib/apartments/geo.ts';
import { EMPTY_SCAN, mergeListings, repairListings, type ScanData } from '../../lib/apartments/model.ts';
import { fetchPestRecords } from '../../lib/apartments/records.ts';
import { geocodeQuery, parseAlertEmail } from '../../lib/apartments/streeteasy.ts';
import { fetchJson } from './http.ts';

interface ForwardedEmail {
  id: string;
  date: string;
  subject?: string;
  text: string;
}

const DAY = 86_400_000;
/** Re-check a building's city records this often. */
const RECHECK_DAYS = 7;
/** Stop looking after listings StreetEasy hasn't mentioned in this long. */
const ACTIVE_DAYS = 45;
/** Forget listings entirely after this long. */
const KEEP_DAYS = 120;
/** Upper bound on buildings looked up per run, to keep runs short. */
const MAX_LOOKUPS = 60;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Emails forwarded by the Gmail relay (repository_dispatch), or a local file for testing. */
function incomingEmails(): ForwardedEmail[] {
  const file = arg('email');
  if (file) {
    return [{ id: `local-${file}`, date: new Date().toISOString(), subject: file, text: readFileSync(file, 'utf8') }];
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || process.env.GITHUB_EVENT_NAME !== 'repository_dispatch') return [];
  const event = JSON.parse(readFileSync(eventPath, 'utf8')) as { client_payload?: { emails?: unknown } };
  const emails = event.client_payload?.emails;
  if (!Array.isArray(emails)) return [];
  return emails.filter(
    (e): e is ForwardedEmail =>
      !!e && typeof e.id === 'string' && typeof e.text === 'string' && typeof e.date === 'string',
  );
}

async function main() {
  const dir = resolve(arg('data') ?? '.apartments-data');
  const path = resolve(dir, 'scan.json');
  const data: ScanData = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as ScanData)
    : structuredClone(EMPTY_SCAN);
  const now = new Date();
  const summary: string[] = [];

  const repaired = repairListings(data);
  if (repaired)
    console.log(
      `Fixed the address of ${repaired} listing${repaired === 1 ? '' : 's'} read from an email's preview line.`,
    );

  // 1. New emails → listings.
  const seen = new Set(data.emails.map((e) => e.id));
  let added = 0;
  for (const email of incomingEmails()) {
    if (seen.has(email.id)) continue;
    seen.add(email.id);
    const parsed = parseAlertEmail(email.text);
    const fresh = mergeListings(data, parsed.listings, new Date(email.date).toISOString());
    added += fresh.length;
    data.emails.push({ id: email.id, date: email.date, found: parsed.listings.length });
    const what = `“${email.subject ?? 'alert'}”: ${parsed.listings.length} listings, ${fresh.length} new`;
    console.log(what);
    summary.push(`- ${what}`);
    if (!parsed.listings.length) {
      console.log(
        `::warning::No listings found in “${email.subject ?? email.id}”. If it was an alert, the format may have changed.`,
      );
    }
  }
  data.emails = data.emails.slice(-400);

  // 2 & 3. Locate buildings and check their records, newest listings first.
  const active = data.listings
    .filter((l) => now.getTime() - Date.parse(l.lastSeen) < ACTIVE_DAYS * DAY)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
  const keys = [...new Set(active.map((l) => l.building))];
  let lookups = 0;
  let located = 0;
  let checked = 0;
  for (const key of keys) {
    const building = data.buildings[key];
    if (!building || lookups >= MAX_LOOKUPS) continue;
    const needsGeo = !building.geo && !building.geoError;
    const stale = !building.records || now.getTime() - Date.parse(building.records.checkedAt) > RECHECK_DAYS * DAY;
    // A source that didn't answer gets another try the next day, not every run.
    const failed =
      !!building.records &&
      Object.keys(building.records.errors).length > 0 &&
      now.getTime() - Date.parse(building.records.checkedAt) > DAY;
    if (!needsGeo && !stale && !failed) continue;
    lookups++;
    if (needsGeo) {
      try {
        const geo = await locate(geocodeQuery(building.address), fetchJson);
        if (geo) {
          building.geo = geo;
          located++;
        } else building.geoError = 'address not found';
      } catch (err) {
        console.log(`  couldn't locate ${building.address}: ${(err as Error).message}`);
      }
      await sleep(1100); // OpenStreetMap asks for at most one lookup a second
    }
    if (building.geo?.bbl && (stale || failed)) {
      building.records = await fetchPestRecords(building.geo.bbl, fetchJson, { now });
      checked++;
      const errors = Object.entries(building.records.errors);
      const n = building.records.records.length;
      console.log(
        `  ${building.address}: ${n} pest record${n === 1 ? '' : 's'} in 5 yr` +
          (errors.length ? ` (couldn't read ${errors.map(([s, e]) => `${s}: ${e}`).join('; ')})` : ''),
      );
    }
  }

  // 4. Forget old listings and buildings nobody lists any more.
  data.listings = data.listings.filter((l) => now.getTime() - Date.parse(l.lastSeen) < KEEP_DAYS * DAY);
  const used = new Set(data.listings.map((l) => l.building));
  for (const key of Object.keys(data.buildings)) if (!used.has(key)) delete data.buildings[key];

  data.updatedAt = now.toISOString();
  writeFileSync(path, JSON.stringify(data, null, 1) + '\n');

  const line = `${added} new listing${added === 1 ? '' : 's'}; located ${located} building${located === 1 ? '' : 's'}, checked records for ${checked}. ${data.listings.length} listings on file.`;
  console.log(line);
  jobSummary(['### Apartment scan', '', line, '', ...summary].join('\n'));
}

await main();
