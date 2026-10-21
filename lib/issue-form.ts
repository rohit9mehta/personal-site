// Turns a "Log a coffee" GitHub issue into a new row of data/coffee.csv.

import { formatCsvRow, parseCsv } from './csv.ts';
import { parseDate, parseScore, placeKey, type Column } from './dataset.ts';

export interface LoggedCoffee {
  name: string;
  city: string;
  score: number;
  date?: string;
  note?: string;
}

const HEADINGS: Record<string, keyof LoggedCoffee> = {
  cafe: 'name',
  café: 'name',
  name: 'name',
  'coffee shop': 'name',
  city: 'city',
  score: 'score',
  rating: 'score',
  date: 'date',
  note: 'note',
  notes: 'note',
};

/** Reads the "### Heading\n\nvalue" sections GitHub renders from an issue form. */
export function parseIssueForm(body: string): Partial<Record<keyof LoggedCoffee, string>> {
  const fields: Partial<Record<keyof LoggedCoffee, string>> = {};
  const sections = body
    .replace(/\r\n/g, '\n')
    .split(/^###\s+/m)
    .slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = (newline === -1 ? section : section.slice(0, newline)).trim().toLowerCase();
    const value = newline === -1 ? '' : section.slice(newline + 1).trim();
    const field = HEADINGS[heading];
    if (field && value && value !== '_No response_') fields[field] = value.replace(/\s*\n\s*/g, ' ');
  }
  return fields;
}

export function toCoffee(fields: Partial<Record<keyof LoggedCoffee, string>>, today: string): LoggedCoffee {
  const problems: string[] = [];
  if (!fields.name) problems.push('the café name is missing');
  if (!fields.city) problems.push('the city is missing');
  const score = fields.score ? parseScore(fields.score) : null;
  if (score === null)
    problems.push(fields.score ? `"${fields.score}" isn't a score from 0 to 10` : 'the score is missing');
  const date = fields.date ? parseDate(fields.date) : today;
  if (date === null) problems.push(`"${fields.date}" isn't a date like 2026-10-21`);
  if (problems.length) throw new Error(problems.join('; '));
  return {
    name: fields.name!,
    city: fields.city!,
    score: score!,
    date: date!,
    ...(fields.note && { note: fields.note }),
  };
}

/** Appends the coffee to the CSV text, following whatever columns the header has. */
export function appendCoffee(csv: string, coffee: LoggedCoffee): { csv: string; previous: number[] } {
  const records = parseCsv(csv);
  const header = records[0]?.fields.map((f) => f.trim().toLowerCase()) as Column[] | undefined;
  if (!header) throw new Error('data/coffee.csv has no header row');
  const key = placeKey(coffee.name, coffee.city);
  const at = (col: Column) => header.indexOf(col);
  const previous = records
    .slice(1)
    .filter((r) => placeKey(r.fields[at('name')] ?? '', r.fields[at('city')] ?? '') === key)
    .map((r) => parseScore(r.fields[at('score')] ?? '') ?? NaN);
  const values: Record<Column, string> = {
    name: coffee.name,
    city: coffee.city,
    score: String(coffee.score),
    date: coffee.date ?? '',
    note: coffee.note ?? '',
  };
  const row = formatCsvRow(header.map((col) => values[col] ?? '')).replace(/,+$/, '');
  const base = csv.endsWith('\n') || csv === '' ? csv : `${csv}\n`;
  return { csv: `${base}${row}\n`, previous };
}
