// Milk (the light theme) or espresso (the dark one). Follows the system
// setting until the switch is used; the choice is remembered in this browser
// only. The new one pours in from the switch, where view transitions exist.

export type Brew = 'milk' | 'espresso';

const PAPER: Record<Brew, string> = { milk: '#f6f5f1', espresso: '#0e0d0c' };
const dark = matchMedia('(prefers-color-scheme: dark)');

function current(): Brew {
  const chosen = document.documentElement.dataset.brew;
  if (chosen === 'milk' || chosen === 'espresso') return chosen;
  return dark.matches ? 'espresso' : 'milk';
}

function label(button: HTMLButtonElement) {
  const brew = current();
  button.dataset.brew = brew;
  button.setAttribute(
    'aria-label',
    brew === 'milk' ? 'Switch to espresso (dark theme)' : 'Switch to milk (light theme)',
  );
}

function apply(brew: Brew) {
  document.documentElement.dataset.brew = brew;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = PAPER[brew];
  }
  try {
    localStorage.setItem('brew', brew);
  } catch {
    // Private windows can refuse storage; the switch still works for this visit.
  }
}

export function setupBrew(button: HTMLButtonElement): void {
  label(button);
  dark.addEventListener('change', () => label(button));
  if (document.documentElement.dataset.brew) apply(current());

  button.addEventListener('click', () => {
    const next: Brew = current() === 'milk' ? 'espresso' : 'milk';
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !document.startViewTransition) {
      apply(next);
      label(button);
      return;
    }
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => {
      apply(next);
      label(button);
    });
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 750, easing: 'cubic-bezier(0.6, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  });
}
