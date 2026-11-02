// Checks one address the way the scan would, and prints what it finds — handy
// for vetting a listing from the Actions tab, or seeing that the city's data
// sources still answer. Changes nothing.
//
//   node scripts/apartments/check.ts "212 East 29th Street"

import { jobSummary } from '../../lib/files.ts';
import { locate, openiglooUrl } from '../../lib/apartments/geo.ts';
import { PEST_KINDS, SOURCES, fetchPestRecords } from '../../lib/apartments/records.ts';
import { geocodeQuery } from '../../lib/apartments/streeteasy.ts';
import { fetchJson } from './http.ts';

const address = (process.argv[2] ?? process.env.ADDRESS ?? '').trim();
if (!address) {
  console.error('Usage: node scripts/apartments/check.ts "212 East 29th Street"');
  process.exit(2);
}

const lines: string[] = [`### ${address}`, ''];
const say = (line = '') => {
  console.log(line);
  lines.push(line);
};

const query = /\b(manhattan|brooklyn|queens|bronx|staten island)\b/i.test(address) ? address : geocodeQuery(address);
const geo = await locate(query, fetchJson).catch((err: Error) => {
  say(`Couldn't reach the address lookup: ${err.message}${err.cause ? ` (${(err.cause as Error).message})` : ''}`);
  jobSummary(lines.join('\n'));
  process.exit(1);
});
if (!geo) {
  say(`Couldn't find “${query}”.`);
  jobSummary(lines.join('\n'));
  process.exit(1);
}
say(`Found: ${geo.label} (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}) via ${geo.source}`);
say(`BBL ${geo.bbl ?? '—'} · BIN ${geo.bin ?? '—'} · ${geo.neighborhood ?? ''}`);
say(`Openigloo: ${openiglooUrl(geo, address)}`);
say();

if (geo.bbl) {
  const result = await fetchPestRecords(geo.bbl, fetchJson);
  for (const source of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    const err = result.errors[source];
    const n = result.records.filter((r) => r.source === source).length;
    say(
      `- ${SOURCES[source].label}: ${err ? `couldn't read (${err})` : `${n} pest record${n === 1 ? '' : 's'} since ${result.since}`}`,
    );
  }
  say();
  for (const r of result.records.slice(0, 25)) {
    const kinds = r.kinds.map((k) => PEST_KINDS[k]).join(', ');
    say(
      `  ${r.date}  ${SOURCES[r.source].label} — ${kinds}: ${r.text}${r.apartment ? ` (apt ${r.apartment})` : ''}${r.status ? ` [${r.status}]` : ''}`,
    );
  }
  if (Object.keys(result.errors).length === Object.keys(SOURCES).length) process.exitCode = 1;
}
jobSummary(lines.join('\n'));
