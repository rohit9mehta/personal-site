// The hero is an artboard, like a frame in a design tool: rulers along the
// top and left, a grid, guides and a coordinate readout that follow the
// cursor, and the frame's size above it. Clicking anywhere sets a coffee cup
// down on it and leaves a ring.

const NS = 'http://www.w3.org/2000/svg';

// Wobbles a ring's outline and lets the paper show through in places, the
// way a coffee stain soaks in unevenly.
const STAIN = `
  <filter id="stain" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="warp"/>
    <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="shape"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="9" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.1 0 0 0 1.45" result="soak"/>
    <feComposite in="shape" in2="soak" operator="in" result="stain"/>
    <feGaussianBlur in="stain" stdDeviation="0.45"/>
  </filter>`;

const f = (n: number) => n.toFixed(1);

/**
 * One coffee ring of radius r, centred on 0,0, drawn the way coffee dries: a
 * pale wash, a band soaked darker just inside the edge, a thin dark rim that
 * rarely closes all the way, sometimes the ghost of the cup set down a second
 * time nearby, and a drip or two.
 */
export function ringMarkup(r: number, random: () => number): string {
  const around = 2 * Math.PI * r;
  const dash = (min: number, max: number) => `${f(around * (min + random() * (max - min)))} ${f(around)}`;
  const turn = () => Math.round(random() * 360);

  let markup =
    `<circle r="${f(r)}" class="ring__wash"/>` +
    `<circle r="${f(r - 3.5)}" class="ring__band" stroke-width="${f(5 + random() * 3)}"/>` +
    `<circle r="${f(r)}" class="ring__rim" stroke-width="${f(1.6 + random() * 1.4)}"` +
    ` stroke-dasharray="${dash(0.8, 1)}" transform="rotate(${turn()})"/>` +
    `<circle r="${f(r - 8)}" class="ring__inner" stroke-dasharray="${dash(0.3, 0.8)}" transform="rotate(${turn()})"/>`;

  if (random() < 0.35) {
    const dx = (random() - 0.5) * 22;
    const dy = (random() - 0.5) * 22;
    markup +=
      `<circle cx="${f(dx)}" cy="${f(dy)}" r="${f(r)}" class="ring__ghost"` +
      ` stroke-dasharray="${dash(0.25, 0.6)}" transform="rotate(${turn()} ${f(dx)} ${f(dy)})"/>`;
  }

  if (random() < 0.5) {
    const drips = 1 + Math.floor(random() * 3);
    const angle = random() * Math.PI * 2;
    for (let i = 0; i < drips; i++) {
      const a = angle + (random() - 0.5) * 0.5;
      const d = r + 5 + random() * 10;
      markup += `<circle cx="${f(Math.cos(a) * d)}" cy="${f(Math.sin(a) * d)}" r="${f(1.2 + random() * 2.6)}" class="ring__drip"/>`;
    }
  }
  return markup;
}

const MAX_RINGS = 40;

export function setupArtboard(hero: HTMLElement): void {
  const board = hero.querySelector<HTMLElement>('#board');
  const rings = hero.querySelector<SVGSVGElement>('#rings');
  const rulerX = hero.querySelector<HTMLElement>('#ruler-x');
  const rulerY = hero.querySelector<HTMLElement>('#ruler-y');
  const readout = hero.querySelector<HTMLElement>('#readout');
  const size = hero.querySelector<HTMLElement>('#size');
  const hint = hero.querySelector<HTMLElement>('#hint');
  const clean = hero.querySelector<HTMLButtonElement>('#clean');
  if (!board || !rings) return;

  rings.innerHTML = `<defs>${STAIN}</defs>`;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const placed: SVGGElement[] = [];

  const setDown = (x: number, y: number, r: number, delay = 0) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
    const ring = document.createElementNS(NS, 'g');
    ring.setAttribute('class', still ? 'ring ring--still' : 'ring');
    ring.setAttribute('filter', 'url(#stain)');
    if (delay) ring.style.animationDelay = `${delay}ms`;
    ring.innerHTML = ringMarkup(r, Math.random);
    g.append(ring);
    rings.append(g);
    return g;
  };

  board.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    const box = board.getBoundingClientRect();
    placed.push(setDown(event.clientX - box.left, event.clientY - box.top, 34 + Math.random() * 20));
    if (placed.length > MAX_RINGS) placed.shift()?.remove();
    hint?.classList.add('is-gone');
    if (clean && placed.length >= 3) clean.hidden = false;
  });

  clean?.addEventListener('click', () => {
    const wiped = placed.splice(0);
    for (const g of wiped) g.classList.add('is-wiped');
    setTimeout(() => wiped.forEach((g) => g.remove()), still ? 0 : 600);
    clean.hidden = true;
  });

  // Rulers: a number every 100px, ticks drawn in CSS.
  const label = (ruler: HTMLElement | null, length: number) => {
    if (!ruler) return;
    ruler.querySelectorAll('.ruler__num').forEach((n) => n.remove());
    for (let at = 0; at < length; at += 100) {
      const num = document.createElement('span');
      num.className = 'ruler__num';
      num.style.setProperty('--at', `${at}px`);
      num.textContent = String(at);
      ruler.append(num);
    }
  };

  let laidOut = false;
  new ResizeObserver(() => {
    const { width, height } = board.getBoundingClientRect();
    label(rulerX, width);
    label(rulerY, height);
    if (size) size.textContent = `${Math.round(width)} × ${Math.round(height)}`;
    if (!laidOut && width > 0) {
      laidOut = true;
      // Somebody's already been here.
      const wide = width > 720;
      setDown(width * (wide ? 0.7 : 0.72), height * (wide ? 0.3 : 0.32), wide ? 54 : 40, still ? 0 : 500);
      if (wide) setDown(width * 0.86, height * 0.52, 42, still ? 0 : 900);
    }
  }).observe(board);

  // Guides and readout follow a mouse (not a finger) around the board.
  board.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const box = board.getBoundingClientRect();
    const x = Math.round(event.clientX - box.left);
    const y = Math.round(event.clientY - box.top);
    hero.style.setProperty('--cx', `${x}px`);
    hero.style.setProperty('--cy', `${y}px`);
    if (readout) readout.textContent = `${x}, ${y}`;
    hero.classList.add('is-tracking');
  });
  board.addEventListener('pointerleave', () => hero.classList.remove('is-tracking'));
}
