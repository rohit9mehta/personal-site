import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/newsreader/opsz.css';
import '../shared/base.css';
import './home.css';
import dataset from 'virtual:coffee-data';
import { scoreColor } from '../coffee/score.ts';

const { shops } = dataset;
const cities = new Set(shops.map((s) => `${s.city.toLowerCase()}|${s.countryCode ?? ''}`)).size;
const best = shops[0];

const summary = document.getElementById('summary');
if (summary && shops.length) {
  summary.textContent =
    `${shops.length} coffee shops in ${cities} ${cities === 1 ? 'city' : 'cities'}, rated out of ten.` +
    (best ? ` Top of the list: ${best.name}, ${best.city}.` : '');
}

// A tiny equirectangular world with every café on it.
const W = 360;
const H = 150;
const TOP = 80;
const x = (lng: number) => lng + 180;
const y = (lat: number) => TOP - lat;

const preview = document.getElementById('preview');
if (preview) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const landGroup = document.createElementNS(svgNS, 'g');
  landGroup.setAttribute('class', 'feature__land');
  svg.append(landGroup);
  const dots = document.createElementNS(svgNS, 'g');
  for (const shop of [...shops].reverse()) {
    if (shop.lat === undefined || shop.lng === undefined) continue;
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('cx', x(shop.lng).toFixed(2));
    c.setAttribute('cy', y(shop.lat).toFixed(2));
    c.setAttribute('r', '1.7');
    c.style.fill = scoreColor(shop.score);
    dots.append(c);
  }
  svg.append(dots);
  preview.append(svg);

  void import('virtual:world-land').then(({ default: land }) => {
    let d = '';
    for (const f of land.features) {
      const g = f.geometry;
      const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const polygon of polygons) {
        for (const ring of polygon) {
          d +=
            ring.map(([lng, lat], i) => `${i ? 'L' : 'M'}${x(lng!).toFixed(1)} ${y(lat!).toFixed(1)}`).join('') + 'Z';
        }
      }
    }
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    landGroup.append(path);
  });
}
