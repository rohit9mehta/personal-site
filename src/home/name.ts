// The name in the hero. Instrument Sans is a variable font, so each letter
// gets heavier as the cursor comes near it and relaxes as it leaves; on a
// touch screen a tap sends a ripple through the letters instead, and one
// ripple runs through once on load. As you scroll, the name shrinks up into
// the mark in the header, which is set in the same type.

/** The heaviest weight Instrument Sans has. The resting weight comes from the CSS (--rest). */
const PEAK = 700;
/** How far the cursor's pull reaches, in em of the name's size. */
const REACH = 0.55;
/** Ripples travel this many em a second, in a band this many em wide. */
const RIPPLE_SPEED = 4;
const RIPPLE_WIDTH = 0.45;
/** How quickly a letter catches up with its target weight, in ms. */
const EASE_MS = 70;

/** A letter's pull toward the peak weight at distance d (px) from the cursor: 1 right on it, near 0 past 2 × reach. */
export function nearness(d: number, reach: number): number {
  return Math.exp(-((d / reach) ** 2));
}

/** A ripple's pull on a letter at distance d from where it started, once the ripple has spread `front` px. */
export function wave(d: number, front: number, width: number): number {
  return Math.exp(-(((d - front) / width) ** 2));
}

export interface ShrinkPath {
  /** Scroll position by which the name's top has reached the mark's (it just scrolls up to get there). */
  end: number;
  /** The name's scale once it's the size of the mark. */
  scale: number;
  /** How far left or right it moves to line up with the mark. */
  dx: number;
  /** Where (0–1) the name starts fading into the mark. */
  fadeFrom: number;
}

/**
 * Where the name is at a scroll position: how far along, its scale and shift, and how visible it and the mark are.
 * It shrinks by the same ratio for every pixel scrolled, so it's nearly the mark's size by the time they cross-fade.
 */
export function shrinkAt(
  scrollY: number,
  path: ShrinkPath,
): { progress: number; scale: number; x: number; nameOpacity: number; markOpacity: number } {
  const progress = path.end > 0 ? Math.min(1, Math.max(0, scrollY / path.end)) : 1;
  const fade = Math.min(1, Math.max(0, (progress - path.fadeFrom) / (1 - path.fadeFrom)));
  return {
    progress,
    scale: path.scale ** progress,
    x: path.dx * progress,
    nameOpacity: progress >= 1 ? 0 : 1 - fade,
    markOpacity: progress >= 1 ? 1 : fade,
  };
}

interface Letter {
  el: HTMLElement;
  /** Extra width at the peak weight, in em, taken back out of its margins so the name never changes length. */
  grow: number;
  /** Centre, in px from the name's top left, unscaled. */
  cx: number;
  cy: number;
  pull: number;
}

interface Ripple {
  x: number;
  y: number;
  start: number;
  /** How far it has spread (px), and whether it has passed every letter, as of the last frame. */
  front: number;
  spent: boolean;
}

/** Wraps each letter of the name in a span; screen readers still get the name whole. */
function split(name: HTMLElement): HTMLElement[] {
  const letters: HTMLElement[] = [];
  name.setAttribute('aria-label', (name.textContent ?? '').replace(/\s+/g, ' ').trim());
  for (const word of name.querySelectorAll<HTMLElement>('.name__word')) {
    for (const node of [...word.childNodes]) {
      if (node instanceof Text) {
        const run = document.createDocumentFragment();
        for (const ch of node.data.trim()) {
          const letter = document.createElement('span');
          letter.className = 'name__l';
          letter.textContent = ch;
          run.append(letter);
          letters.push(letter);
        }
        node.replaceWith(run);
      } else if (node instanceof HTMLElement) {
        node.classList.add('name__l');
        letters.push(node);
      }
    }
    word.setAttribute('aria-hidden', 'true');
  }
  return letters;
}

export function setupName(name: HTMLElement, mark: HTMLElement, top: HTMLElement): void {
  // With reduced motion the name stays as it is and the mark is always shown (home.css).
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const letters: Letter[] = split(name).map((el) => ({ el, grow: 0, cx: 0, cy: 0, pull: 0 }));
  const rest = Number.parseFloat(getComputedStyle(name).fontWeight) || 480;
  const ripples: Ripple[] = [];
  let pointer: { x: number; y: number } | null = null;

  // Layout, measured on load, when the fonts arrive and on resize.
  let size = 1;
  let docTop = 0;
  let left = 0;
  let path: ShrinkPath = { end: 1, scale: 1, dx: 0, fadeFrom: 0.9 };
  let state = shrinkAt(0, path);

  const measure = () => {
    const transform = name.style.transform;
    name.style.transform = 'none';
    for (const l of letters) l.el.style.fontWeight = String(PEAK);
    const peak = new Map(letters.map((l) => [l, l.el.getBoundingClientRect().width]));
    for (const l of letters) {
      l.el.style.fontWeight = '';
      l.el.style.marginInline = '';
    }
    const box = name.getBoundingClientRect();
    size = Number.parseFloat(getComputedStyle(name).fontSize);
    letters.forEach((l) => {
      const r = l.el.getBoundingClientRect();
      l.grow = ((peak.get(l) ?? r.width) - r.width) / size;
      l.cx = r.left + r.width / 2 - box.left;
      l.cy = r.top + r.height / 2 - box.top;
    });
    docTop = box.top + scrollY;
    left = box.left;
    const m = mark.getBoundingClientRect();
    // On phones the name is two lines: "Rohit" lands on the mark's "Rohit" and "Mehta." fades out below it.
    const lines = Math.max(1, Math.round(box.height / (size * 0.8)));
    path = {
      end: docTop - m.top,
      scale: m.height / (box.height / lines),
      dx: m.left - box.left,
      fadeFrom: lines > 1 ? 0.88 : 0.94,
    };
    name.style.transform = transform;
    for (const l of letters) l.pull = 0; // their styles were just cleared
    place();
    kick();
  };

  // --- Scrolling: shrink into the header ---

  const place = () => {
    state = shrinkAt(scrollY, path);
    name.style.transform = state.progress > 0 ? `translateX(${state.x}px) scale(${state.scale})` : '';
    name.style.opacity = state.nameOpacity < 1 ? String(state.nameOpacity) : '';
    name.classList.toggle('is-gone', state.nameOpacity === 0);
    mark.style.opacity = String(state.markOpacity);
    mark.classList.toggle('is-shown', state.markOpacity > 0);
    top.classList.toggle('is-stuck', scrollY > 4);
  };

  // --- Weight: the cursor's pull and ripples ---

  let frame = 0;
  let last = 0;

  const tick = (now: number) => {
    frame = 0;
    const dt = last ? Math.min(now - last, 64) : 16;
    last = now;
    const k = 1 - Math.exp(-dt / EASE_MS);
    const scale = state.scale;
    const originY = docTop - scrollY;
    const originX = left + state.x;
    const reach = REACH * size * scale;
    const width = RIPPLE_WIDTH * size * scale;
    for (const r of ripples) {
      r.front = ((now - r.start) / 1000) * RIPPLE_SPEED * size * scale;
      r.spent = true;
    }
    let moving = false;

    for (const l of letters) {
      const x = originX + l.cx * scale;
      const y = originY + l.cy * scale;
      let target = pointer ? nearness(Math.hypot(pointer.x - x, pointer.y - y), reach) : 0;
      for (const r of ripples) {
        const d = Math.hypot(r.x - x, r.y - y);
        target = Math.max(target, wave(d, r.front, width));
        // Spent once its band has passed every letter.
        if (r.front < d + width * 3) r.spent = false;
      }
      target *= 1 - state.progress;

      const from = l.pull;
      const pull = Math.abs(target - from) < 0.002 ? target : from + (target - from) * k;
      if (pull !== target) moving = true;
      if (Math.abs(pull - from) < 0.0005) continue;
      l.pull = pull;
      if (pull === 0) {
        l.el.style.fontWeight = '';
        l.el.style.marginInline = '';
      } else {
        l.el.style.fontWeight = (rest + (PEAK - rest) * pull).toFixed(1);
        l.el.style.marginInline = `${((-l.grow * pull) / 2).toFixed(4)}em`;
      }
    }

    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i]?.spent) ripples.splice(i, 1);
    if (moving || ripples.length) kick();
    else last = 0;
  };

  function kick() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  const rippleFrom = (x: number, y: number) => {
    ripples.push({ x, y, start: performance.now(), front: 0, spent: false });
    kick();
  };

  addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY };
    kick();
  });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null;
    kick();
  });
  name.closest('section')?.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') rippleFrom(event.clientX, event.clientY);
  });

  addEventListener(
    'scroll',
    () => {
      place();
      kick();
    },
    { passive: true },
  );
  new ResizeObserver(measure).observe(document.documentElement);

  // Once the real font is in: measure again, then one ripple across the name from the left.
  void document.fonts.ready.then(() => {
    measure();
    if (state.progress === 0) {
      const box = name.getBoundingClientRect();
      rippleFrom(box.left - size * 0.3, box.top + box.height / 2);
    }
  });
}
