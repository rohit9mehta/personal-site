// Checks data/coffee.csv and data/places.json, and prints a short summary.
//   npm run validate

import { buildDataset, formatIssues } from '../lib/dataset.ts';
import { CSV_PATH, displayPath, jobSummary, readPlaces, readRatingsText } from '../lib/files.ts';

const file = displayPath(CSV_PATH);
const { dataset, issues, unlocated } = buildDataset(readRatingsText(), readPlaces());

if (issues.length) {
  console.error(`✗ ${file} has ${issues.length} problem(s):\n`);
  console.error(formatIssues(file, issues));
  jobSummary(
    `### ✗ ${file} needs fixing\n\n${issues.map((i) => `- ${i.line ? `line ${i.line}: ` : ''}${i.message}`).join('\n')}`,
  );
  process.exit(1);
}

const { shops } = dataset;
const visits = shops.reduce((n, s) => n + s.visits.length, 0);
const approximate = shops.filter((s) => s.precision === 'city').length;
const chains = shops.filter((s) => s.multiLocation).length;
console.log(`✓ ${file}: ${shops.length} cafés, ${visits} ratings`);
if (chains) console.log(`  ${chains} rated as chains (no single location)`);
if (approximate) console.log(`  ${approximate} placed at their city center (exact spot unknown)`);
if (unlocated.length) {
  const some = unlocated.slice(0, 8).join(', ');
  console.log(`  ${unlocated.length} not on the map yet: ${some}${unlocated.length > 8 ? ', …' : ''}`);
}
