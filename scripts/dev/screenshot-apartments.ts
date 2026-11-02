// Screenshots of the apartments page with the sample scan and made-up places.
//   VITE_APARTMENTS_SAMPLE=1 npm run build && npx vite preview --port 4173 &
//   node scripts/dev/screenshot-apartments.ts http://localhost:4173/ .screenshots

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const [base = 'http://localhost:4173/', out = '.screenshots', executablePath] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

// Stand-in places (not anyone's real addresses): Union Square and Bryant Park.
const saved = {
  settings: {
    places: [
      {
        id: 'a',
        label: 'Office',
        address: 'Union Square',
        lat: 40.7359,
        lng: -73.9906,
        maxMinutes: 25,
        profile: 'weekday',
      },
      {
        id: 'b',
        label: 'Friends',
        address: 'Bryant Park',
        lat: 40.7536,
        lng: -73.9832,
        maxMinutes: 25,
        profile: 'weekend',
      },
    ],
  },
  igloo: { '140 e 28 st': 'clean', '245 e 35 st': 'clean' },
  marks: {},
  manual: { listings: [], buildings: {} },
  lastVisit: new Date(Date.now() - 6 * 3600_000).toISOString(),
};

const browser = await chromium.launch({ executablePath: executablePath || process.env.CHROMIUM_PATH || undefined });
const errors: string[] = [];

async function open(viewport: { width: number; height: number }, mobile = false, scheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({
    viewport,
    colorScheme: scheme,
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((s) => localStorage.setItem('apartments:v1', s), JSON.stringify(saved));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|tiles|openfreemap/i.test(m.text())) errors.push(m.text());
  });
  await page.goto(new URL('apartments/', base).href, { waitUntil: 'load' });
  await page.waitForSelector('.card');
  return page;
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
  console.log(`saved ${name}.png`);
}

let page = await open({ width: 1440, height: 900 });
await shot(page, 'apt-desktop');
await page.locator('.card').first().locator('.card__head').click();
await shot(page, 'apt-desktop-open');
await page.getByRole('button', { name: /^Filtered out/ }).click();
await shot(page, 'apt-desktop-out');
await page.getByRole('button', { name: 'Settings' }).click();
await shot(page, 'apt-settings');
await page.context().close();

page = await open({ width: 390, height: 844 }, true);
await shot(page, 'apt-phone', true);
await page.context().close();

page = await open({ width: 1440, height: 900 }, false, 'dark');
await shot(page, 'apt-desktop-dark');
await page.context().close();

await browser.close();
if (errors.length) {
  console.error(`Page errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
