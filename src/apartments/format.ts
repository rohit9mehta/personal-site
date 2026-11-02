export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function bedsLabel(beds: number | undefined): string {
  if (beds === undefined) return '';
  if (beds === 0) return 'Studio';
  return `${beds} bed${beds === 1 ? '' : 's'}`;
}

export function bathsLabel(baths: number | undefined): string {
  if (baths === undefined) return '';
  return `${baths} bath${baths === 1 ? '' : 's'}`;
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "12 minutes ago", "yesterday", "3 days ago". */
export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  // A clock a little ahead of ours shouldn't make things sound like the future.
  const s = Math.min(0, (Date.parse(iso) - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return RTF.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return RTF.format(Math.round(s / 86400), 'day');
  return RTF.format(Math.round(s / (86400 * 30)), 'month');
}

const DAY_FMT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "Mar 4, 2026" from "2026-03-04". */
export const shortDate = (day: string) => DAY_FMT.format(new Date(`${day}T12:00:00Z`));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
