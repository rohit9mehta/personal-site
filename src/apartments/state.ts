// Everything personal lives here, in this browser only: your filters, the
// places you commute to, your Openigloo verdicts and what you've passed on.
// Move it to another device with a setup link (the data rides in the URL's #,
// which browsers never send to a server).

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type Building,
  type IglooVerdict,
  type Listing,
  type Settings,
} from '../../lib/apartments/model.ts';
import { DEFAULT_PEST_RULES } from '../../lib/apartments/records.ts';

export type Mark = 'passed' | 'contacted';

export interface Saved {
  settings: Settings;
  /** Your read of each building's Openigloo reviews, by building key. */
  igloo: Record<string, IglooVerdict>;
  /** Listings you've passed on or reached out about. */
  marks: Record<string, Mark>;
  /** Listings you added by hand, checked right here in the browser. */
  manual: { listings: Listing[]; buildings: Record<string, Building> };
  /** When you last looked, to flag what's new since. */
  lastVisit?: string;
}

const KEY = 'apartments:v1';

export const EMPTY_SAVED: Saved = {
  settings: DEFAULT_SETTINGS,
  igloo: {},
  marks: {},
  manual: { listings: [], buildings: {} },
};

function withDefaults(s: Partial<Saved>): Saved {
  const settings = { ...DEFAULT_SETTINGS, ...s.settings };
  settings.pests = {
    ...DEFAULT_PEST_RULES,
    ...settings.pests,
    kinds: { ...DEFAULT_PEST_RULES.kinds, ...settings.pests?.kinds },
  };
  return {
    settings,
    igloo: s.igloo ?? {},
    marks: s.marks ?? {},
    manual: { listings: s.manual?.listings ?? [], buildings: s.manual?.buildings ?? {} },
    ...(s.lastVisit ? { lastVisit: s.lastVisit } : {}),
  };
}

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return withDefaults(JSON.parse(raw) as Partial<Saved>);
  } catch {
    // private mode, blocked storage, or a bad value: start fresh
  }
  return structuredClone(EMPTY_SAVED);
}

function store(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not fatal: it just won't be remembered.
  }
}

export function useSaved(): [Saved, (update: (s: Saved) => Saved) => void] {
  const [saved, setSaved] = useState(load);
  useEffect(() => store(saved), [saved]);
  // Another tab changed it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSaved(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = useCallback((fn: (s: Saved) => Saved) => setSaved((s) => fn(s)), []);
  return [saved, update];
}

// --- Setup links ---------------------------------------------------------------

type Portable = Pick<Saved, 'settings' | 'igloo' | 'marks'>;

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64Url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** A link that carries your filters, places and verdicts to another device. */
export function setupLink(saved: Saved): string {
  const portable: Portable = { settings: saved.settings, igloo: saved.igloo, marks: saved.marks };
  const url = new URL(window.location.href);
  url.hash = `setup=${toBase64Url(JSON.stringify(portable))}`;
  return url.toString();
}

/** Reads a setup link's payload from the current URL, if there is one. */
export function readSetupHash(hash = window.location.hash): Partial<Portable> | null {
  const m = hash.match(/^#setup=([\w-]+)$/);
  if (!m) return null;
  try {
    return JSON.parse(fromBase64Url(m[1]!)) as Partial<Portable>;
  } catch {
    return null;
  }
}

export function applySetup(saved: Saved, incoming: Partial<Portable>): Saved {
  return withDefaults({
    ...saved,
    ...(incoming.settings ? { settings: { ...saved.settings, ...incoming.settings } } : {}),
    igloo: { ...saved.igloo, ...incoming.igloo },
    marks: { ...saved.marks, ...incoming.marks },
  });
}
