// One-off: turns rows copied out of the "One Sip Coffee Ratings" Google Sheet
// (tab-separated when pasted, or a CSV download) into data/coffee.csv.
//   node scripts/dev/import-sheet.ts <pasted.tsv|export.csv> [--write]
// Without --write it only prints what it would produce.

import { readFileSync, writeFileSync } from 'node:fs';
import { formatCsvRow, parseCsv } from '../../lib/csv.ts';
import { parseDate, parseScore } from '../../lib/dataset.ts';
import { CSV_PATH } from '../../lib/files.ts';

const [file, flag] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/dev/import-sheet.ts <file> [--write]');
  process.exit(1);
}

const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
const rows: string[][] = firstLine.includes('\t')
  ? text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.split('\t').map((v) => v.trim()))
  : parseCsv(text).map((r) => r.fields);

const COLUMN_NAMES: Record<string, RegExp> = {
  name: /^(name|shop|caf[eé]|coffee ?shop|place|spot|store)s?$/i,
  city: /^(city|location|town|where|place)$/i,
  score: /^(score|rating|rate|out of 10|\/10|grade)$/i,
  date: /^(date|visited|when|day)$/i,
  note: /^(notes?|comments?|thoughts|drink|order)$/i,
};

// Common shorthand → the name a geocoder (and a visitor) understands.
const CITY_ALIASES: Record<string, string> = {
  sf: 'San Francisco',
  'san fran': 'San Francisco',
  nyc: 'New York',
  ny: 'New York',
  'new york city': 'New York',
  la: 'Los Angeles',
  dc: 'Washington',
  'washington dc': 'Washington',
  'washington, dc': 'Washington',
  'washington d.c.': 'Washington',
  philly: 'Philadelphia',
  vegas: 'Las Vegas',
};

const header = rows[0] ?? [];
const index: Partial<Record<keyof typeof COLUMN_NAMES, number>> = {};
header.forEach((cell, i) => {
  for (const [col, re] of Object.entries(COLUMN_NAMES)) {
    if (index[col] === undefined && re.test(cell.trim())) {
      index[col] = i;
      break;
    }
  }
});
const hasHeader = index.name !== undefined || index.score !== undefined;
if (!hasHeader) {
  // No recognizable header: assume name, city, score.
  index.name = 0;
  index.city = 1;
  index.score = 2;
}
console.log('columns:', index, hasHeader ? `(from header: ${header.join(' | ')})` : '(assumed)');

const out: string[] = ['name,city,score,date,note'];
const problems: string[] = [];
for (const [n, row] of (hasHeader ? rows.slice(1) : rows).entries()) {
  const get = (col: keyof typeof COLUMN_NAMES) => (index[col] === undefined ? '' : (row[index[col]!] ?? '').trim());
  const name = get('name').replace(/\s+/g, ' ');
  if (!name) continue;
  const rawCity = get('city').replace(/\s+/g, ' ');
  const city = CITY_ALIASES[rawCity.toLowerCase()] ?? rawCity;
  const score = parseScore(get('score'));
  const date = get('date') ? parseDate(get('date')) : '';
  if (!city || score === null) {
    problems.push(`row ${n + (hasHeader ? 2 : 1)}: ${row.join(' | ')}`);
    continue;
  }
  out.push(formatCsvRow([name, city, String(score), date ?? '', get('note')]).replace(/,+$/, ''));
}

console.log(`${out.length - 1} ratings${problems.length ? `, ${problems.length} skipped:` : ''}`);
for (const p of problems) console.log(`  ${p}`);
if (flag === '--write') {
  writeFileSync(CSV_PATH, `${out.join('\n')}\n`);
  console.log(`wrote ${CSV_PATH}`);
} else {
  console.log(out.slice(0, 8).join('\n'));
}
