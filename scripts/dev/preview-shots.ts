// Screenshots of the real data for the preview job.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';

const [base = 'http://localhost:4173/', out = 'shots', executablePath] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath });

async function shot(page: Page, name: string, settle = 2500) {
  await page.waitForTimeout(settle);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}.png`) });
}

async function open(path: string, opts: { phone?: boolean; dark?: boolean } = {}) {
  const context = await browser.newContext({
    viewport: opts.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: opts.phone,
    hasTouch: opts.phone,
    colorScheme: opts.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(new URL(path, base).href);
  return page;
}

let page = await open('coffee/');
await shot(page, 'world', 4000);
await page.context().close();
page = await open('coffee/?q=san+francisco');
await shot(page, 'san-francisco', 4000);
await page.context().close();
page = await open('coffee/?q=berkeley');
await shot(page, 'berkeley', 4000);
await page.context().close();
page = await open('coffee/?shop=cafe-du-clown--paris-france');
await shot(page, 'cafe-du-clown', 4000);
await page.context().close();
page = await open('coffee/?q=barcelona', { dark: true });
await shot(page, 'barcelona-dark', 4000);
await page.context().close();
page = await open('coffee/', { phone: true });
await shot(page, 'phone-map', 4000);
await page.context().close();
page = await open('coffee/?shop=caffe-trieste--san-francisco-ca', { phone: true });
await shot(page, 'phone-detail', 4000);
await page.context().close();
page = await open('coffee/?view=list', { phone: true, dark: true });
await shot(page, 'phone-list-dark', 1500);
await page.context().close();
page = await open('');
await shot(page, 'home', 2000);
await browser.close();
