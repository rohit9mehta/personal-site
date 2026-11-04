// The hero is a length of cloth: click or tap anywhere on it to press a
// block-print motif into it. A border prints itself along the bottom edge on
// load, and a few prints are already there to show what's possible.

import { MOTIFS, symbolMarkup } from './motifs.ts';

const NS = 'http://www.w3.org/2000/svg';

/** Inks, as the CSS custom properties that hold them (so they follow the theme). */
const INKS = ['--k-neel', '--k-sindoor', '--k-haldi', '--k-neel', '--k-sindoor', '--k-chai'] as const;
type Ink = (typeof INKS)[number];

// Roughens a print's edges, then knocks out speckles where the block didn't
// quite meet the cloth. Noise is in the print's own coordinates, so no two
// prints come out the same.
const INK_FILTER = `
  <filter id="ink" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="3" result="edge"/>
    <feDisplacementMap in="SourceGraphic" in2="edge" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="11" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 2.75" result="speck"/>
    <feComposite in="shape" in2="speck" operator="in"/>
  </filter>
  <filter id="ink-fine" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="5" result="edge"/>
    <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="2" seed="13" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.2 0 0 0 2.25" result="speck"/>
    <feComposite in="shape" in2="speck" operator="in"/>
  </filter>`;

// A sari-style border: stars and butis, alternating indigo and vermilion.
const BAND_PATTERN = `
  <pattern id="band-pattern" width="112" height="56" patternUnits="userSpaceOnUse">
    <use href="#tara" x="10" y="10" width="36" height="36" style="color: var(--k-neel)"/>
    <use href="#buti" x="64" y="8" width="40" height="40" style="color: var(--k-sindoor)"/>
  </pattern>`;

/** Puts every motif, the ink filter and the border pattern in the page once. */
export function installSprite(): void {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sprite');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>${INK_FILTER}${MOTIFS.map(symbolMarkup).join('')}${BAND_PATTERN}</defs>`;
  document.body.prepend(svg);
}

interface Print {
  x: number;
  y: number;
  size: number;
  rotate: number;
  motif: string;
  ink: Ink;
  /** Milliseconds to wait before pressing; null prints without animating. */
  delay: number | null;
  /** Small prints take a finer ink, or their detail disappears. */
  fine?: boolean;
}

function press(layer: SVGSVGElement, p: Print): SVGGElement {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rotate.toFixed(1)})`);
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#${p.motif}`);
  use.setAttribute('x', String(-p.size / 2));
  use.setAttribute('y', String(-p.size / 2));
  use.setAttribute('width', String(p.size));
  use.setAttribute('height', String(p.size));
  use.setAttribute('filter', p.fine ? 'url(#ink-fine)' : 'url(#ink)');
  use.setAttribute('class', p.delay === null ? 'print print--still' : 'print');
  use.style.color = `var(${p.ink})`;
  if (p.delay) use.style.animationDelay = `${p.delay}ms`;
  g.append(use);
  layer.append(g);
  return g;
}

const MAX_PRINTS = 60;
const motifIds = MOTIFS.map((m) => m.id);

/** Picks from a list without repeating the previous pick. */
function picker<T>(items: readonly T[]): () => T {
  let last = -1;
  return () => {
    let i = Math.floor(Math.random() * items.length);
    if (i === last) i = (i + 1) % items.length;
    last = i;
    return items[i]!;
  };
}

export function setupPress(hero: HTMLElement): void {
  const layer = hero.querySelector<SVGSVGElement>('#press');
  const border = hero.querySelector<SVGSVGElement>('#border');
  const hint = hero.querySelector<HTMLElement>('#hint');
  const wash = hero.querySelector<HTMLButtonElement>('#wash');
  if (!layer || !border) return;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nextMotif = picker(motifIds);
  const nextInk = picker(INKS);
  const mine: SVGGElement[] = [];

  hero.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    const box = layer.getBoundingClientRect();
    const print = press(layer, {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      size: 64 + Math.random() * 48,
      rotate: (Math.random() - 0.5) * 50,
      motif: nextMotif(),
      ink: nextInk(),
      delay: still ? null : 0,
    });
    mine.push(print);
    if (mine.length > MAX_PRINTS) mine.shift()?.remove();
    hint?.classList.add('is-gone');
    if (wash && mine.length >= 3) wash.hidden = false;
  });

  wash?.addEventListener('click', () => {
    const washing = mine.splice(0);
    for (const g of washing) g.classList.add('is-washing');
    setTimeout(() => washing.forEach((g) => g.remove()), still ? 0 : 700);
    wash.hidden = true;
  });

  const drawBorder = (animate: boolean) => {
    border.replaceChildren();
    const { width, height } = border.getBoundingClientRect();
    const step = 52;
    const count = Math.floor((width - 8) / step);
    const start = (width - (count - 1) * step) / 2;
    for (let i = 0; i < count; i++) {
      press(border, {
        x: start + i * step,
        y: height / 2,
        size: i % 2 ? 36 : 32,
        rotate: (Math.random() - 0.5) * 6,
        motif: i % 2 ? 'buti' : 'tara',
        ink: i % 2 ? '--k-sindoor' : '--k-neel',
        delay: animate ? 300 + i * 45 : null,
        fine: true,
      });
    }
  };

  // A few prints already on the cloth, placed in the gaps around the name,
  // the seal and the hint (which move about between layouts; see home.css).
  const preprint = () => {
    const { width, height } = layer.getBoundingClientRect();
    const spots: Omit<Print, 'delay'>[] =
      width > 1100
        ? [
            { x: width * 0.6, y: height * 0.3, size: 120, rotate: -12, motif: 'buti', ink: '--k-haldi' },
            { x: width * 0.93, y: height * 0.64, size: 92, rotate: 18, motif: 'ambi', ink: '--k-neel' },
            { x: width * 0.08, y: height * 0.72, size: 70, rotate: 8, motif: 'bean', ink: '--k-sindoor' },
          ]
        : width > 720
          ? [
              { x: width * 0.6, y: height * 0.3, size: 110, rotate: -12, motif: 'buti', ink: '--k-haldi' },
              { x: width * 0.58, y: height * 0.8, size: 80, rotate: 18, motif: 'ambi', ink: '--k-neel' },
              { x: width * 0.08, y: height * 0.64, size: 60, rotate: 8, motif: 'bean', ink: '--k-sindoor' },
            ]
          : [
              { x: width * 0.7, y: height * 0.56, size: 96, rotate: -12, motif: 'buti', ink: '--k-haldi' },
              { x: width * 0.2, y: height * 0.66, size: 64, rotate: 18, motif: 'ambi', ink: '--k-neel' },
              { x: width * 0.45, y: height * 0.75, size: 44, rotate: 30, motif: 'bean', ink: '--k-sindoor' },
            ];
    spots.forEach((s, i) => press(layer, { ...s, delay: still ? null : 900 + i * 220 }));
  };

  const ready = document.fonts?.ready ?? Promise.resolve();
  void Promise.race([ready, new Promise((r) => setTimeout(r, 800))]).then(() => {
    drawBorder(!still);
    preprint();
  });

  let lastWidth = border.getBoundingClientRect().width;
  new ResizeObserver(() => {
    const width = border.getBoundingClientRect().width;
    if (Math.abs(width - lastWidth) < 1) return;
    lastWidth = width;
    drawBorder(false);
  }).observe(border);
}
