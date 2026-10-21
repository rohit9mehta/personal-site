// Renders the site in headless Chromium and saves screenshots.
//   node scripts/dev/screenshot.ts <base-url> <out-dir> [chromium-path]
// Used locally and by the CI screenshot job (which can reach the tile server).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const [base = 'http://localhost:4173/', out = '.screenshots', executablePath] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: executablePath || process.env.CHROMIUM_PATH || undefined });
const errors: string[] = [];

async function shot(page: Page, name: string, settle = 1500) {
  await page.waitForTimeout(settle);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`saved ${name}.png`);
}

async function open(viewport: { width: number; height: number }, path: string, mobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${path}: console: ${m.text()}`);
  });
  await page.goto(new URL(path, base).href, { waitUntil: 'load' });
  return page;
}

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

let page = await open(desktop, 'coffee/');
await shot(page, 'desktop-world', 3000);
await page.locator('.row').first().click();
await shot(page, 'desktop-selected', 2500);
await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
await shot(page, 'desktop-street', 1500);
await page.getByRole('button', { name: 'Close', exact: true }).click();
for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
await shot(page, 'desktop-region', 1500);
await page.goto(new URL('coffee/?q=san+francisco', base).href);
await shot(page, 'desktop-search-sf', 3000);
await page.goto(new URL('coffee/?sort=city&min=8', base).href);
await shot(page, 'desktop-grouped-min8', 2500);
await page.context().close();

page = await open(phone, 'coffee/', true);
await shot(page, 'phone-map', 3000);
await page.getByRole('button', { name: /^List/ }).click();
await shot(page, 'phone-list', 800);
await page.locator('.row').nth(2).click();
await shot(page, 'phone-detail', 2500);
await page.context().close();

page = await open(desktop, '');
await shot(page, 'home-desktop', 1500);
await page.context().close();
page = await open(phone, '', true);
await shot(page, 'home-phone', 1500);
await page.context().close();

await browser.close();
if (errors.length) {
  console.log(`\n${errors.length} browser error(s):`);
  for (const e of [...new Set(errors)].slice(0, 30)) console.log(`  ${e}`);
}
