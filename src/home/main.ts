import '@fontsource/rozha-one';
import '@fontsource/kalam/400.css';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '../shared/base.css';
import './home.css';
import dataset from 'virtual:coffee-data';
import { computeStats } from '../coffee/model.ts';
import { formatScore } from '../coffee/score.ts';
import { setupBrew } from './brew.ts';
import { startClocks } from './clocks.ts';
import { installSprite, setupPress } from './press.ts';
import { cityLabel, cityTally, lastSip } from './sips.ts';
import { fillTicker } from './ticker.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const base = import.meta.env.BASE_URL;
const onesip = (params?: Record<string, string>) =>
  `${base}onesip/${params ? `?${new URLSearchParams(params).toString()}` : ''}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

installSprite();

const ticker = $('ticker');
if (ticker) fillTicker(ticker);

const brew = $<HTMLButtonElement>('brew');
if (brew) setupBrew(brew);

const hero = $('hero');
if (hero) setupPress(hero);

const clocks = $('clocks');
if (clocks) startClocks(clocks);

// --- The coffee numbers ------------------------------------------------------

const { shops } = dataset;
const stats = computeStats(shops);

const sip = lastSip(shops);
const sipLine = $('last-sip');
if (sip && sipLine) {
  const link = document.createElement('a');
  link.href = onesip({ shop: sip.id });
  link.innerHTML = '<span class="top__sip-label">Last sip</span> ';
  link.append(
    `${sip.name}, ${sip.multiLocation ? 'all over' : cityLabel(sip.city)} `,
    Object.assign(document.createElement('b'), { textContent: formatScore(sip.score) }),
  );
  sipLine.append(link);
  sipLine.hidden = false;
}

const desc = $('onesip-desc');
if (desc && shops.length) {
  desc.textContent = `${plural(stats.count, 'café')} in ${plural(stats.cities, 'city', 'cities')}, rated out of ten.`;
}

const cities = cityTally(shops);
const dek = $('cities-dek');
if (dek && cities.length) {
  dek.textContent =
    `${plural(stats.count, 'café')}, ${plural(stats.cities, 'city', 'cities')}` +
    (stats.countries ? `, ${plural(stats.countries, 'country', 'countries')}` : '') +
    '. The more cups, the bigger the name.';
}

const cloud = $('cities-cloud');
if (cloud && cities.length) {
  cloud.replaceChildren();
  cities.forEach((city, i) => {
    const a = document.createElement('a');
    a.className = 'city';
    a.href = onesip({ q: city.label });
    a.style.setProperty('--w', city.weight.toFixed(3));
    a.title = `${plural(city.count, 'café')} · best: ${city.best.name} (${formatScore(city.best.score)})`;
    a.append(city.label);
    if (city.count > 1) {
      const count = document.createElement('sup');
      count.textContent = String(city.count);
      a.append(count);
    }
    if (i) cloud.append(' ');
    cloud.append(a);
  });
}
