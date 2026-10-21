// Adds a rating from a "Log a coffee" issue to data/coffee.csv.
// Run by .github/workflows/log-coffee.yml with the issue in the environment.

import { appendFileSync, writeFileSync } from 'node:fs';
import { formatScore } from '../src/coffee/score.ts';
import { placeKey } from '../lib/dataset.ts';
import { CSV_PATH, readRatingsText } from '../lib/files.ts';
import { appendCoffee, parseIssueForm, toCoffee } from '../lib/issue-form.ts';

function output(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`${name}: ${value}`);
    return;
  }
  const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
};

const createdAt = process.env.ISSUE_CREATED_AT ? new Date(process.env.ISSUE_CREATED_AT) : new Date();
const timeZone = process.env.TZ || 'America/Los_Angeles';
const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
  createdAt,
);

try {
  const coffee = toCoffee(parseIssueForm(process.env.ISSUE_BODY ?? ''), today);
  const { csv, previous } = appendCoffee(readRatingsText(), coffee);
  writeFileSync(CSV_PATH, csv);

  const score = formatScore(coffee.score);
  const site = (process.env.SITE_URL ?? '').replace(/\/?$/, '/');
  const link = `${site}coffee/?shop=${placeKey(coffee.name, coffee.city)}`;
  const visit = previous.length
    ? ` That's your ${ordinal(previous.length + 1)} visit (last time: ${formatScore(previous[previous.length - 1]!)}).`
    : '';
  output('commit_message', `Log ${coffee.name} (${coffee.city}): ${score}`);
  output(
    'comment',
    `Logged **${coffee.name}** in ${coffee.city} at **${score}**/10.${visit}\n\nIt will be on the map in a couple of minutes: ${link}`,
  );
  console.log(`Logged ${coffee.name} (${coffee.city}): ${score}`);
} catch (err) {
  const message = (err as Error).message;
  output('comment', `Couldn't log this one: ${message}.\n\nEdit the issue to fix it and I'll try again.`);
  console.error(message);
  process.exit(1);
}
