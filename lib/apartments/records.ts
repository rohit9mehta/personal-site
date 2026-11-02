// What the City of New York knows about pests in a building, from NYC Open Data
// (free, no key, built for this). Five sources, all looked up by the building's
// BBL (borough-block-lot):
//
//   HPD violations   — an inspector found mice/rats/roaches/bedbugs in an apartment
//   HPD complaints   — a tenant called 311/HPD about pests
//   Bedbug reports   — the landlord's yearly filing of infested apartments
//   Rat inspections  — Health Department found rat activity on the property
//   311 rodent calls — mouse/rat sightings reported at the address
//
// Runs in the scan (Node) and in the browser (Socrata allows cross-origin reads).

export type PestKind = 'rodents' | 'roaches' | 'bedbugs' | 'other';

export const PEST_KINDS: Record<PestKind, string> = {
  rodents: 'Mice & rats',
  roaches: 'Roaches',
  bedbugs: 'Bedbugs',
  other: 'Other pests',
};

export type RecordSource = 'hpd-violation' | 'hpd-complaint' | 'bedbugs' | 'rat-inspection' | '311';

export const SOURCES: Record<RecordSource, { label: string; dataset: string }> = {
  'hpd-violation': { label: 'HPD violation', dataset: 'wvxf-dwi5' },
  'hpd-complaint': { label: 'Tenant complaint', dataset: 'ygpa-z7cr' },
  bedbugs: { label: 'Bedbug report', dataset: 'wz6d-d3jb' },
  'rat-inspection': { label: 'Rat inspection', dataset: 'p937-wjvj' },
  '311': { label: '311 call', dataset: 'erm2-nwe9' },
};

export interface PestRecord {
  source: RecordSource;
  /** YYYY-MM-DD */
  date: string;
  kinds: PestKind[];
  /** Short, human description. */
  text: string;
  apartment?: string;
  /** "Open", "Closed"… */
  status?: string;
}

export interface BuildingRecords {
  /** When these were fetched (ISO). */
  checkedAt: string;
  /** How far back they go (YYYY-MM-DD). */
  since: string;
  records: PestRecord[];
  /** Sources that couldn't be read, and why. Missing means it was checked. */
  errors: Partial<Record<RecordSource, string>>;
  /** HPD's id for the building, for linking to HPD Online. */
  hpdBuildingId?: string;
}

/** Which pests a piece of city text is about. */
export function classify(text: string): PestKind[] {
  const t = text.toUpperCase();
  const kinds: PestKind[] = [];
  if (/\b(MICE|MOUSE|RATS?|RODENTS?)\b/.test(t)) kinds.push('rodents');
  if (/ROACH/.test(t)) kinds.push('roaches');
  if (/BED ?-?BUGS?/.test(t)) kinds.push('bedbugs');
  if (!kinds.length && /\b(VERMIN|PESTS?|INSECTS?|FLIES|WATER ?BUGS?|SILVERFISH|TERMITES?|INFESTATION)\b/.test(t)) {
    kinds.push('other');
  }
  return kinds;
}

const PEST_LIKE = ['MICE', 'MOUSE', 'RATS', 'RAT ', 'RODENT', 'ROACH', 'BEDBUG', 'BED BUG', 'VERMIN', 'PEST', 'INSECT'];

export type FetchJson = (url: string) => Promise<unknown>;

const SOCRATA = 'https://data.cityofnewyork.us/resource';

export function soqlUrl(dataset: string, params: Record<string, string>): string {
  return `${SOCRATA}/${dataset}.json?${new URLSearchParams(params).toString()}`;
}

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const day = (v: unknown) => str(v).slice(0, 10);

/** First field whose name matches, for datasets whose column names drift. */
function field(row: Row, ...patterns: RegExp[]): string {
  for (const p of patterns) {
    for (const [k, v] of Object.entries(row)) if (p.test(k) && str(v)) return str(v);
  }
  return '';
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "§ 27-2018 ADM CODE ABATE THE NUISANCE CONSISTING OF MICE IN THE ENTIRE APARTMENT…" → readable. */
export function tidyViolation(text: string): string {
  const t = text
    .replace(/^§?\s*[\d.-]+\s*(ADM|HMC|MDL)?\s*CODE\s*/i, '')
    .replace(/\s+LOCATED AT.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const s = t.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function rows(fetchJson: FetchJson, dataset: string, params: Record<string, string>): Promise<Row[]> {
  const data = await fetchJson(soqlUrl(dataset, params));
  if (!Array.isArray(data)) throw new Error('unexpected response');
  return data as Row[];
}

const pestWhere = (column: string) => '(' + PEST_LIKE.map((w) => `upper(${column}) like '%${w}%'`).join(' OR ') + ')';

async function hpdViolations(f: FetchJson, bbl: string, since: string) {
  const data = await rows(f, SOURCES['hpd-violation'].dataset, {
    $where: `bbl='${bbl}' AND inspectiondate >= '${since}' AND ${pestWhere('novdescription')}`,
    $order: 'inspectiondate DESC',
    $limit: '500',
  });
  let buildingId: string | undefined;
  const records: PestRecord[] = [];
  for (const r of data) {
    buildingId ??= str(r.buildingid) || undefined;
    const text = str(r.novdescription);
    const kinds = classify(text);
    if (!kinds.length) continue;
    const status = str(r.violationstatus) || str(r.currentstatus);
    records.push({
      source: 'hpd-violation',
      date: day(r.inspectiondate) || day(r.novissueddate),
      kinds,
      text: tidyViolation(text),
      ...(str(r.apartment) ? { apartment: str(r.apartment) } : {}),
      ...(status ? { status: titleCase(status) } : {}),
    });
  }
  return { records, buildingId };
}

async function hpdComplaints(f: FetchJson, bbl: string, since: string) {
  const dataset = SOURCES['hpd-complaint'].dataset;
  let data: Row[];
  try {
    data = await rows(f, dataset, {
      $where: `bbl='${bbl}' AND received_date >= '${since}' AND (minor_category='PESTS' OR ${pestWhere('problem_code')})`,
      $order: 'received_date DESC',
      $limit: '500',
    });
  } catch {
    // Column names changed? Take the building's recent rows and sort them out here.
    data = await rows(f, dataset, { bbl, $limit: '2000', $order: ':id DESC' });
  }
  const records: PestRecord[] = [];
  for (const r of data) {
    const date = day(field(r, /^received_date$/, /received/, /date/));
    if (!date || date < since) continue;
    const what = [field(r, /^problem_code$/), field(r, /^minor_category$/), field(r, /^major_category$/)]
      .filter(Boolean)
      .join(' ');
    const kinds = classify(what || Object.values(r).map(str).join(' '));
    if (!kinds.length) continue;
    const code = field(r, /^problem_code$/);
    const status = field(r, /^problem_status$/, /^complaint_status$/, /status/);
    const apartment = field(r, /^apartment$/);
    records.push({
      source: 'hpd-complaint',
      date,
      kinds,
      text: `Complaint: ${code ? titleCase(code) : 'pests'}`,
      ...(apartment && !/^bldg$/i.test(apartment) ? { apartment } : {}),
      ...(status ? { status: titleCase(status) } : {}),
    });
  }
  return records;
}

async function bedbugReports(f: FetchJson, bbl: string, since: string) {
  const dataset = SOURCES.bedbugs.dataset;
  let data: Row[];
  try {
    data = await rows(f, dataset, { bbl, $order: 'filing_date DESC', $limit: '20' });
  } catch {
    data = await rows(f, dataset, { bbl, $limit: '50' });
  }
  const records: PestRecord[] = [];
  for (const r of data) {
    const date = day(field(r, /^filing_date$/, /filing_date/, /date/));
    if (!date || date < since) continue;
    const infested = Number(field(r, /^infested_dwelling_unit_count$/, /^(?!re).*infested/i)) || 0;
    const reinfested = Number(field(r, /re_?infested/i)) || 0;
    const units = Number(field(r, /dwelling_units$/, /units$/)) || 0;
    if (infested + reinfested <= 0) continue;
    const of = units ? ` of ${units}` : '';
    records.push({
      source: 'bedbugs',
      date,
      kinds: ['bedbugs'],
      text: `Landlord reported bedbugs in ${infested + reinfested}${of} apartments that year`,
    });
  }
  return records;
}

async function ratInspections(f: FetchJson, bbl: string, since: string) {
  const data = await rows(f, SOURCES['rat-inspection'].dataset, {
    bbl,
    $where: `inspection_date >= '${since}'`,
    $order: 'inspection_date DESC',
    $limit: '200',
  });
  return data
    .filter((r) => /rat activity/i.test(str(r.result)))
    .map((r): PestRecord => ({
      source: 'rat-inspection',
      date: day(r.inspection_date),
      kinds: ['rodents'],
      text: 'Health Department inspector found rat activity on the property',
    }));
}

async function rodentCalls(f: FetchJson, bbl: string, since: string) {
  const data = await rows(f, SOURCES['311'].dataset, {
    $where: `bbl='${bbl}' AND created_date >= '${since}' AND complaint_type='Rodent'`,
    $order: 'created_date DESC',
    $limit: '200',
  });
  return data.map((r): PestRecord => ({
    source: '311',
    date: day(r.created_date),
    kinds: ['rodents'],
    text: `311: ${str(r.descriptor) || 'rodent'}`,
    ...(str(r.status) ? { status: titleCase(str(r.status)) } : {}),
  }));
}

/** Everything on file about pests at one building, going back `years`. */
export async function fetchPestRecords(
  bbl: string,
  fetchJson: FetchJson,
  { years = 5, now = new Date() }: { years?: number; now?: Date } = {},
): Promise<BuildingRecords> {
  const since = new Date(now);
  since.setFullYear(since.getFullYear() - years);
  const sinceDay = since.toISOString().slice(0, 10);
  const result: BuildingRecords = { checkedAt: now.toISOString(), since: sinceDay, records: [], errors: {} };
  if (!/^\d{10}$/.test(bbl)) {
    for (const s of Object.keys(SOURCES) as RecordSource[]) result.errors[s] = 'no BBL for this address';
    return result;
  }
  const jobs: [RecordSource, Promise<PestRecord[]>][] = [
    [
      'hpd-violation',
      hpdViolations(fetchJson, bbl, sinceDay).then((v) => {
        if (v.buildingId) result.hpdBuildingId = v.buildingId;
        return v.records;
      }),
    ],
    ['hpd-complaint', hpdComplaints(fetchJson, bbl, sinceDay)],
    ['bedbugs', bedbugReports(fetchJson, bbl, sinceDay)],
    ['rat-inspection', ratInspections(fetchJson, bbl, sinceDay)],
    ['311', rodentCalls(fetchJson, bbl, sinceDay)],
  ];
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  settled.forEach((s, i) => {
    const source = jobs[i]![0];
    if (s.status === 'fulfilled') result.records.push(...s.value.filter((r) => r.date));
    else result.errors[source] = String((s.reason as Error)?.message ?? s.reason).slice(0, 200);
  });
  result.records.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

// --- Judging -----------------------------------------------------------------

export interface PestRules {
  /** Only count records from the last N years. */
  years: number;
  /** A building fails with more than this many counted records. */
  allowed: number;
  /** Which pests count. */
  kinds: Record<PestKind, boolean>;
}

export const DEFAULT_PEST_RULES: PestRules = {
  years: 2,
  allowed: 0,
  kinds: { rodents: true, roaches: true, bedbugs: true, other: true },
};

export interface PestVerdict {
  status: 'clear' | 'pests' | 'unknown';
  /** The records that count under the rules, newest first. */
  counted: PestRecord[];
  byKind: Partial<Record<PestKind, number>>;
  /** Sources that couldn't be checked. */
  missing: RecordSource[];
}

export function judgePests(records: BuildingRecords | undefined, rules: PestRules, now = new Date()): PestVerdict {
  if (!records) return { status: 'unknown', counted: [], byKind: {}, missing: Object.keys(SOURCES) as RecordSource[] };
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - rules.years);
  const cut = cutoff.toISOString().slice(0, 10);
  const counted = records.records.filter((r) => r.date >= cut && r.kinds.some((k) => rules.kinds[k]));
  const byKind: PestVerdict['byKind'] = {};
  for (const r of counted) for (const k of r.kinds) if (rules.kinds[k]) byKind[k] = (byKind[k] ?? 0) + 1;
  const missing = Object.keys(records.errors) as RecordSource[];
  // The two HPD sources are the ones that matter; without them we can't say it's clear.
  const blind = missing.includes('hpd-violation') && missing.includes('hpd-complaint');
  const status = counted.length > rules.allowed ? 'pests' : blind ? 'unknown' : 'clear';
  return { status, counted, byKind, missing };
}
