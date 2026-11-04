// StreetEasy: its neighborhoods, building a saved-search link from a filter, and
// reading the "Updates to Your Saved Search" alert emails it sends.
//
// Listings come in through those emails — StreetEasy's own alerts — rather than
// by scraping the site. See apps-script/README.md for how they get here.

export interface Area {
  /** StreetEasy's area id, used in search links (`area:115,158`). */
  id: number;
  name: string;
  /** Broader area that includes this one. */
  parent?: number;
  /** Other names the same blocks go by in listings. */
  aliases?: string[];
}

/** The Manhattan neighborhoods the filters can pick from, roughly south to north. */
export const AREAS: Area[] = [
  { id: 105, name: 'Tribeca' },
  { id: 166, name: 'Hudson Square' },
  { id: 107, name: 'SoHo', aliases: ['Soho'] },
  { id: 162, name: 'Nolita' },
  { id: 108, name: 'Little Italy' },
  { id: 109, name: 'Lower East Side' },
  { id: 118, name: 'NoHo', aliases: ['Noho'] },
  { id: 116, name: 'Greenwich Village' },
  { id: 157, name: 'West Village' },
  { id: 117, name: 'East Village' },
  { id: 106, name: 'Stuyvesant Town/PCV', aliases: ['Stuyvesant Town', 'Peter Cooper Village'] },
  { id: 113, name: 'Gramercy Park', aliases: ['Gramercy'] },
  { id: 158, name: 'Flatiron', aliases: ['Union Square'] },
  { id: 115, name: 'Chelsea', aliases: ['West Chelsea'] },
  { id: 159, name: 'NoMad', aliases: ['Nomad'] },
  { id: 122, name: 'Midtown South', aliases: ['Koreatown', 'Garment District'] },
  { id: 123, name: 'Midtown East', aliases: ['Turtle Bay', 'Tudor City'] },
  { id: 133, name: 'Kips Bay', parent: 123 },
  { id: 130, name: 'Murray Hill', parent: 123 },
  { id: 131, name: 'Sutton Place', parent: 123 },
  { id: 134, name: 'Beekman', parent: 123 },
  { id: 120, name: 'Midtown', aliases: ['Central Park South'] },
  { id: 124, name: 'Midtown West', aliases: ["Hell's Kitchen", 'Clinton'] },
  { id: 146, name: 'Hudson Yards' },
];

const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Every neighborhood name a listing could carry and still be inside these areas. */
export function areaNames(ids: number[]): Set<string> {
  const names = new Set<string>();
  const add = (a: Area) => {
    names.add(norm(a.name));
    for (const alias of a.aliases ?? []) names.add(norm(alias));
  };
  for (const id of ids) {
    const area = AREA_BY_ID.get(id);
    if (!area) continue;
    add(area);
    for (const child of AREAS) if (child.parent === id) add(child);
  }
  return names;
}

export function inAreas(neighborhood: string | undefined, ids: number[]): boolean {
  return !!neighborhood && areaNames(ids).has(norm(neighborhood));
}

export function areaName(id: number): string {
  return AREA_BY_ID.get(id)?.name ?? `Area ${id}`;
}

// --- Search links ------------------------------------------------------------

export interface SearchCriteria {
  areas: number[];
  /** Bedroom counts wanted; 0 is a studio, 4 means 4+. */
  beds: number[];
  maxPrice?: number;
  minPrice?: number;
  noFee?: boolean;
}

function bedsParam(beds: number[]): string | null {
  const sorted = [...new Set(beds)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const lo = sorted[0]!;
  const hi = sorted.at(-1)!;
  const contiguous = hi - lo + 1 === sorted.length;
  if (!contiguous) return `${lo}-${hi}`;
  if (hi >= 4) return lo === 0 ? null : `>=${lo}`;
  if (lo === hi) return lo === 0 ? '<1' : String(lo);
  if (lo === 0) return `<=${hi}`;
  return `${lo}-${hi}`;
}

/** The StreetEasy search page for these criteria — save it there to get alerts. */
export function searchUrl(c: SearchCriteria): string {
  const parts = ['status:open'];
  if (c.minPrice || c.maxPrice) parts.push(`price:${c.minPrice ?? ''}-${c.maxPrice ?? ''}`);
  if (c.areas.length) parts.push(`area:${c.areas.join(',')}`);
  const beds = bedsParam(c.beds);
  if (beds) parts.push(`beds:${beds}`);
  if (c.noFee) parts.push('no_fee:1');
  return `https://streeteasy.com/for-rent/nyc/${parts.map(encodeURIComponent).join('%7C')}`;
}

/** Reads the criteria back out of a StreetEasy search link (as found in alert emails). */
export function parseSearchUrl(url: string): SearchCriteria | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  if (!/for-rent/.test(path)) return null;
  const c: SearchCriteria = { areas: [], beds: [] };
  const lead = path.match(/\/(studio|(\d)-bedroom)-apartments-for-rent\//);
  if (lead) c.beds = [lead[1] === 'studio' ? 0 : Number(lead[2])];
  const params = path.replace(/\/+$/, '').split('/').pop()!.split('|');
  for (const p of params) {
    const m = p.match(/^([a-z_]+)(:|<=|>=|<|>)(.*)$/s);
    if (!m) continue;
    const [, key, op, raw] = m as unknown as [string, string, string, string];
    // Newer links compare instead of using a colon: "price<=7000" is "price:-7000", "beds>=1" is "beds:>=1".
    const value = op === ':' ? raw : key === 'price' ? (op.startsWith('<') ? `-${raw}` : `${raw}-`) : op + raw;
    if (key === 'area') c.areas = value.split(',').map(Number).filter(Number.isFinite);
    if (key === 'price') {
      const [lo, hi] = value.split('-');
      if (lo) c.minPrice = Number(lo);
      if (hi) c.maxPrice = Number(hi);
    }
    if (key === 'no_fee') c.noFee = value === '1';
    if (key === 'beds') {
      const m = value.match(/^(<=|<|>=|>)?(\d+)(?:-(\d+))?$/);
      if (m) {
        const n = Number(m[2]);
        const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
        if (m[3]) c.beds = range(n, Number(m[3]));
        else if (m[1] === '<') c.beds = range(0, n - 1);
        else if (m[1] === '<=') c.beds = range(0, n);
        else if (m[1] === '>=') c.beds = range(n, 4);
        else if (m[1] === '>') c.beds = range(n + 1, 4);
        else c.beds = [n];
      }
    }
  }
  return c;
}

// --- Alert emails -------------------------------------------------------------

export interface EmailListing {
  /** StreetEasy's listing id, or the building/unit path when there is none. */
  id: string;
  url: string;
  address?: string;
  unit?: string;
  neighborhood?: string;
  /** "Rental Unit", "Condo", "Co-op"… */
  kind?: string;
  price?: number;
  noFee?: boolean;
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Who's renting it: an agency, or "Owner". */
  broker?: string;
  /** "Open House", "Price Increase: $195"… */
  updates: string[];
  /** StreetEasy says it's rented (in the saved-listings email). */
  offMarket?: boolean;
  section: 'new' | 'updated' | 'suggested' | 'other';
  /** The saved search it was sent for. */
  search?: string;
}

export interface ParsedEmail {
  listings: EmailListing[];
  /** Saved-search links in the email, with their plain-English description. */
  searches: { url: string; label?: string }[];
}

const LISTING_URL =
  /https?:\/\/(?:www\.)?streeteasy\.com\/(rental\/(\d+)|building\/[a-z0-9-]+(?:_[a-z_]+)?\/[a-z0-9-]+)[^\s>)"]*/i;
/** Since 2026 the search part of the link comes percent-encoded: "area%3A107%2C113%7Cbeds%3A2…". */
const SEARCH_URL = /https?:\/\/(?:www\.)?streeteasy\.com\/[a-z0-9-]*for-rent\/[^\s>)"]*area(?::|%3A)[^\s>)"]*/i;

/**
 * The invisible padding after an email's preview line ("515 2nd Avenue and 9 more
 * updates" + figure spaces and combining grapheme joiners), so it can't pass for text.
 */
const INVISIBLE = /\u034f|[\u00ad\u200b-\u200d\u2060\ufeff]/g;

/** The email's preview line ("…and 9 more updates"), cut from an address an older parser kept. */
export function tidyAddress(address: string): string {
  return address
    .replace(INVISIBLE, '')
    .replace(/\s+and \d+ more updates?\b.*$/is, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The sections a listing can come in. */
function sectionOf(line: string): EmailListing['section'] | null {
  if (/^new$/i.test(line) || /new to market/i.test(line)) return 'new';
  if (/^updated$/i.test(line) || /homes? with changes/i.test(line)) return 'updated';
  if (/^because you (searched|viewed|saved)|^these homes match your/i.test(line)) return 'suggested';
  return null;
}

function cleanUrl(raw: string): string {
  const u = new URL(raw);
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

function listingId(match: RegExpMatchArray): string {
  return match[2] ?? match[1]!.replace(/^building\//, '');
}

const money = (s: string) => Number(s.replace(/[$,]/g, ''));

/** "Rental Unit in East Village": the first line of each listing. */
const KIND_IN_AREA = /^([A-Z][A-Za-z/ -]{1,30}?) in ([A-Z].{1,60})$/;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * For a layout without plain listing links (say, every link wrapped for click
 * tracking): start a listing at each "Rental Unit in …" line instead.
 */
function parseWithoutLinks(lines: string[], searches: ParsedEmail['searches']): EmailListing[] {
  const out: EmailListing[] = [];
  let section: EmailListing['section'] = 'other';
  let block: string[] | null = null;
  const search = (searches.find((s) => s.label) ?? searches[0])?.url;
  const flush = () => {
    if (!block) return;
    const facts = readBlock(block, '');
    block = null;
    if (!facts.address || facts.price === undefined) return;
    const id = `${slug(facts.address)}${facts.unit ? `/${slug(facts.unit)}` : ''}`;
    if (out.some((l) => l.id === id)) return;
    const q = `streeteasy ${facts.address}${facts.unit ? ` #${facts.unit}` : ''}`;
    out.push({
      id,
      url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      ...facts,
      section,
      ...(search ? { search } : {}),
    });
  };
  for (const raw of lines) {
    const line = raw.trim();
    const next = sectionOf(line);
    if (next) {
      flush();
      section = next;
      continue;
    }
    if (KIND_IN_AREA.test(line) && !line.includes('$')) {
      flush();
      block = [line];
      continue;
    }
    if (/^see all homes|you get this saved search email/i.test(line)) {
      flush();
      continue;
    }
    if (block && line && !/^<?https?:\/\//.test(line)) block.push(line.replace(/<https?:\/\/\S*>/g, '').trim());
  }
  flush();
  return out;
}

/** Pulls the facts for one listing out of the lines that came before its link. */
function readBlock(lines: string[], tail: string): Omit<EmailListing, 'id' | 'url' | 'section' | 'search'> {
  const out: Omit<EmailListing, 'id' | 'url' | 'section' | 'search'> = { updates: [] };
  let inUpdates = false;
  const leftovers: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if (/^updates?:$/i.test(line)) {
      inUpdates = true;
      continue;
    }
    if (!out.neighborhood && (m = line.match(KIND_IN_AREA)) && !line.includes('$')) {
      out.kind = m[1]!.trim();
      out.neighborhood = m[2]!.trim();
      inUpdates = false;
      continue;
    }
    if (/^(rented|off[- ]market|no longer available)$/i.test(line)) {
      out.offMarket = true;
      continue;
    }
    if (/^no fee$/i.test(line)) {
      out.noFee = true;
      continue;
    }
    if (
      !out.address &&
      (m = line.match(/^(\d[\dA-Za-z-]*\s+[^$#]+?)(?:\s*#\s*(\S+))?$/)) &&
      !/\b(beds?|baths?|ft²|sq\.?\s*ft|open houses?|homes?)\b|\band \d+ more\b/i.test(line)
    ) {
      out.address = m[1]!.trim();
      if (m[2]) out.unit = m[2].toUpperCase();
      continue;
    }
    if (out.price === undefined && (m = line.match(/^\$([\d,]+)(.*)$/))) {
      out.price = money(m[1]!);
      if (/no fee/i.test(m[2]!)) out.noFee = true;
      continue;
    }
    if ((m = line.match(/^↓\s*(\$[\d,]+)$/))) {
      out.updates.push(`Price Drop: ${m[1]}`);
      continue;
    }
    let matched = false;
    // "2 Beds", or "3 bd|2 Baths" in the saved-listings email.
    if ((m = line.match(/^(\d+(?:\.\d+)?)\s*(?:beds?|bd)\b/i))) {
      out.beds = Number(m[1]);
      matched = true;
    } else if (/^studio\b/i.test(line)) {
      out.beds = 0;
      matched = true;
    }
    if ((m = line.match(/(\d+(?:\.\d+)?)\s+baths?\b/i))) {
      out.baths = Number(m[1]);
      matched = true;
    }
    if ((m = line.match(/([\d,]+)\s*(?:ft²|sq\.?\s*ft)/i))) {
      out.sqft = money(m[1]!);
      matched = true;
    }
    if (matched) {
      inUpdates = false;
      continue;
    }
    if (inUpdates) {
      out.updates.push(line);
      continue;
    }
    if (/^(video|open house|\d+ open houses|virtual tour|3d tour|floor ?plan)s?(\s|$)/i.test(line)) continue;
    if (sectionOf(line)) continue;
    if (out.address) leftovers.push(line);
  }
  const broker = (tail.trim() || leftovers.at(-1) || '')
    .replace(/^listed by\s+/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .trim();
  if (broker && broker !== out.address) out.broker = broker;
  return out;
}

/**
 * Reads a saved-search alert email (its plain-text body). Robust to the layout
 * moving around: each listing is the text between one listing link and the next.
 */
export function parseAlertEmail(text: string): ParsedEmail {
  const lines = text.replace(/\r\n?/g, '\n').replace(INVISIBLE, '').split('\n');
  const listings = new Map<string, EmailListing>();
  const searches: ParsedEmail['searches'] = [];
  let section: EmailListing['section'] = 'other';
  let search: string | undefined;
  let block: string[] = [];
  /** The "For Rent: listings under $3,500 in …" sentence above a search link. */
  let label: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const searchMatch = trimmed.match(SEARCH_URL);
    if (searchMatch) {
      // The same search shows up again as "See all homes", with a trailing slash and tracking.
      const url = searchMatch[0].replace(/[?#].*$/, '').replace(/\/+$/, '');
      const text = label?.join(' ').replace(/\s+/g, ' ').trim();
      const known = searches.find((s) => s.url === url);
      if (!known) searches.push({ url, ...(text ? { label: text } : {}) });
      else if (text && !known.label) known.label = text;
      // Newer emails have no "For Rent: …" sentence; the link alone says which search it is.
      search = url;
      label = null;
      block = [];
      continue;
    }
    if (/^for rent:/i.test(trimmed)) {
      label = [trimmed];
      continue;
    }
    if (label) {
      if (trimmed && !trimmed.startsWith('<')) label.push(trimmed);
      continue;
    }

    const next = sectionOf(trimmed);
    if (next) section = next;
    else if (/^see all homes/i.test(trimmed) || /you get this saved search email/i.test(trimmed)) section = 'other';

    const m = trimmed.match(LISTING_URL);
    if (m) {
      const id = listingId(m);
      const tail = trimmed.slice(0, m.index).replace(/<\s*$/, '');
      const facts = readBlock(block, tail);
      block = [];
      if (!listings.has(id) && (facts.address || facts.price !== undefined)) {
        listings.set(id, { id, url: cleanUrl(m[0]), ...facts, section, ...(search ? { search } : {}) });
      }
      continue;
    }
    if (/^<?https?:\/\//.test(trimmed)) continue;
    block.push(trimmed);
  }
  if (!listings.size) return { listings: parseWithoutLinks(lines, searches), searches };
  return { listings: [...listings.values()], searches };
}

/** "441 East 12th Street", "Manhattan" → a line a geocoder understands. */
export function geocodeQuery(address: string, borough = 'Manhattan'): string {
  return `${address}, ${borough}, NY`;
}
