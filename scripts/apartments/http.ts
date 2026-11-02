// fetch → JSON for the scan, with a polite user agent and a couple of retries.

import type { FetchJson } from '../../lib/apartments/records.ts';

const USER_AGENT = 'personal-site apartment scan (https://github.com/rohit9mehta/personal-site)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fetchJson: FetchJson = async (url) => {
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json' };
  // Optional: a free NYC Open Data app token raises the rate limit.
  if (process.env.SOCRATA_APP_TOKEN && url.includes('data.cityofnewyork.us')) {
    headers['x-app-token'] = process.env.SOCRATA_APP_TOKEN;
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
    if (res.ok) return res.json();
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    throw new Error(`HTTP ${res.status} ${body}`);
  }
};
