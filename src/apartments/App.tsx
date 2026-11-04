import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  evaluate,
  type Building,
  type CommuteFn,
  type Evaluation,
  type Listing,
  type Place,
  type Settings,
} from '../../lib/apartments/model.ts';
import { SubwayRouter, type Destination, type SubwayGraph } from '../../lib/apartments/transit.ts';
import { useMediaQuery } from '../coffee/hooks.ts';
import { AddListing } from './components/AddListing.tsx';
import { ListingCard } from './components/ListingCard.tsx';
import { placeCoords, SettingsPanel } from './components/Settings.tsx';
import { SetupGuide } from './components/SetupGuide.tsx';
import { fetchScan, latestAlert, type ScanResult } from './data.ts';
import { ago, plural } from './format.ts';
import { applySetup, readSetupHash, useSaved, type Mark } from './state.ts';
import subway from './subway.json';

const MapView = lazy(() => import('./components/MapView.tsx').then((m) => ({ default: m.MapView })));

type Tab = 'shortlist' | 'out' | 'passed';

interface Item {
  ev: Evaluation;
  manual: boolean;
}

const graph = subway as unknown as SubwayGraph;
const newestFirst = (a: Item, b: Item) => b.ev.listing.firstSeen.localeCompare(a.ev.listing.firstSeen);
const placeKey = (p: Place) => `${p.id}|${p.lat}|${p.lng}|${p.profile}`;

export function App() {
  const [saved, update] = useSaved();
  const { settings } = saved;
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('shortlist');
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsAtSource, setSettingsAtSource] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mapOnPhone, setMapOnPhone] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 980px)');
  const theme = useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  // What counts as "new": anything since the previous visit.
  const [lastVisit] = useState(() => saved.lastVisit);

  useEffect(() => {
    const t = setTimeout(() => update((s) => ({ ...s, lastVisit: new Date().toISOString() })), 4000);
    return () => clearTimeout(t);
  }, [update]);

  // The scan: on load, then every few minutes while the page is open.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchScan()
        .then((r) => {
          if (!alive) return;
          setScan(r);
          setScanError(null);
        })
        .catch((e: Error) => alive && setScanError(e.message));
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Arrived through a setup link: take its settings, then tidy the address bar.
  useEffect(() => {
    const incoming = readSetupHash();
    if (!incoming) return;
    update((s) => applySetup(s, incoming));
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [update]);

  // Places with an address but no coordinates yet (e.g. from a setup link).
  const unlocated = settings.places.filter((p) => p.address && p.lat === undefined).map((p) => `${p.id}|${p.address}`);
  const unlocatedKey = unlocated.join('\n');
  useEffect(() => {
    if (!unlocatedKey) return;
    for (const entry of unlocatedKey.split('\n')) {
      const [id, address] = [entry.slice(0, entry.indexOf('|')), entry.slice(entry.indexOf('|') + 1)];
      void placeCoords(address).then((hit) => {
        if (!hit) return;
        update((s) => ({
          ...s,
          settings: {
            ...s.settings,
            places: s.settings.places.map((p) =>
              p.id === id && p.address === address ? { ...p, lat: hit.lat, lng: hit.lng } : p,
            ),
          },
        }));
      });
    }
  }, [unlocatedKey, update]);

  const router = useMemo(() => new SubwayRouter(graph), []);
  const placesKey = settings.places.map(placeKey).join(',');
  const destinations = useMemo(() => {
    const out = new Map<string, Destination>();
    for (const p of settings.places) {
      if (p.lat === undefined || p.lng === undefined) continue;
      out.set(p.id, router.towards({ lat: p.lat, lng: p.lng }, p.profile));
    }
    return out;
    // Re-solve only when a place moves or changes when you travel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, placesKey]);
  const commute = useCallback<CommuteFn>((place, from) => destinations.get(place.id)?.trip(from), [destinations]);

  const items = useMemo<Item[]>(() => {
    const manualIds = new Set(saved.manual.listings.map((l) => l.id));
    const buildings = scan?.data.buildings ?? {};
    const rows: { listing: Listing; building: Building | undefined; manual: boolean }[] = [
      ...saved.manual.listings.map((l) => ({ listing: l, building: saved.manual.buildings[l.building], manual: true })),
      ...(scan?.data.listings ?? [])
        .filter((l) => !manualIds.has(l.id))
        .map((l) => ({ listing: l, building: buildings[l.building], manual: false })),
    ];
    return rows.map(({ listing, building, manual }) => ({
      ev: evaluate(listing, building, settings, commute, saved.igloo[listing.building]),
      manual,
    }));
  }, [scan, saved.manual, saved.igloo, settings, commute]);

  const groups = useMemo(() => {
    const live = items.filter((i) => saved.marks[i.ev.listing.id] !== 'passed');
    const by = (s: Evaluation['status']) => live.filter((i) => i.ev.status === s).sort(newestFirst);
    return {
      ready: by('ready'),
      check: by('check'),
      pending: by('pending'),
      out: by('out'),
      passed: items.filter((i) => saved.marks[i.ev.listing.id] === 'passed').sort(newestFirst),
    };
  }, [items, saved.marks]);

  const setSettings = useCallback((next: Settings) => update((s) => ({ ...s, settings: next })), [update]);
  const setIgloo = (building: string, v: Evaluation['igloo'] | undefined) =>
    update((s) => {
      const igloo = { ...s.igloo };
      if (v === 'clean' || v === 'pests') igloo[building] = v;
      else delete igloo[building];
      return { ...s, igloo };
    });
  const setMark = (id: string, m: Mark | undefined) =>
    update((s) => {
      const marks = { ...s.marks };
      if (m) marks[id] = m;
      else delete marks[id];
      return { ...s, marks };
    });
  const removeManual = (id: string) =>
    update((s) => ({ ...s, manual: { ...s.manual, listings: s.manual.listings.filter((l) => l.id !== id) } }));
  const addManual = (listing: Listing, building: Building) =>
    update((s) => ({
      ...s,
      manual: {
        listings: [listing, ...s.manual.listings.filter((l) => l.id !== listing.id)],
        buildings: { ...s.manual.buildings, [listing.building]: building },
      },
    }));

  const select = useCallback(
    (id: string) => {
      setOpenId(id);
      const item = items.find((i) => i.ev.listing.id === id);
      if (item) {
        const passed = saved.marks[id] === 'passed';
        setTab(passed ? 'passed' : item.ev.status === 'out' ? 'out' : 'shortlist');
      }
      setMapOnPhone(false);
      requestAnimationFrame(() =>
        document
          .getElementById(`listing-${id.replace(/[^\w-]/g, '-')}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      );
    },
    [items, saved.marks],
  );

  const hasPlaces = settings.places.some((p) => p.lat !== undefined);
  const shortlistCount = groups.ready.length + groups.check.length;
  const nothingYet = !items.length;
  const latest = latestAlert(scan);
  // First time this browser has opened the page (incognito, a new laptop…).
  const firstVisit = !lastVisit;

  /** Where listings come from: the guide on the page, or in Settings once there are listings. */
  const showSource = () => {
    if (nothingYet) {
      document.getElementById('listings-guide')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSettingsAtSource(true);
    setSettingsOpen(true);
  };

  const card = (i: Item) => (
    <ListingCard
      key={i.ev.listing.id}
      ev={i.ev}
      routes={graph.routes}
      isNew={!!lastVisit && !i.manual && i.ev.listing.firstSeen > lastVisit}
      mark={saved.marks[i.ev.listing.id]}
      open={openId === i.ev.listing.id}
      hasPlaces={hasPlaces}
      pestYears={settings.pests.years}
      manual={i.manual}
      onToggle={() => setOpenId((o) => (o === i.ev.listing.id ? null : i.ev.listing.id))}
      onIgloo={(v) => setIgloo(i.ev.listing.building, v)}
      onMark={(m) => setMark(i.ev.listing.id, m)}
      onRemove={() => removeManual(i.ev.listing.id)}
      onHover={setHoveredId}
    />
  );

  const mapItems =
    tab === 'shortlist' ? [...groups.ready, ...groups.check] : tab === 'out' ? groups.out : groups.passed;
  const showMap = isDesktop || mapOnPhone;

  return (
    <div className={`apt${showMap ? ' apt--map' : ''}`}>
      <div className="apt__panel">
        <header className="masthead">
          <a className="masthead__byline" href="../">
            Rohit Mehta
          </a>
          <h1 className="wordmark">Shortlist</h1>
          <p className="masthead__dek">
            New York apartments that clear every bar: rent, a subway-or-walk commute, and no pests on the city’s record.
          </p>
          <dl className="stats">
            <div>
              <dt>ready to tour</dt>
              <dd>{groups.ready.length}</dd>
            </div>
            <div>
              <dt>need an Openigloo look</dt>
              <dd>{groups.check.length}</dd>
            </div>
            <div>
              <dt>filtered out</dt>
              <dd>{groups.out.length}</dd>
            </div>
          </dl>
          <div className="toolbar">
            <span className="toolbar__note">
              {scanError ? (
                scanError
              ) : !scan ? (
                'Loading…'
              ) : !scan.exists ? (
                'Waiting for the first scan'
              ) : (
                <button type="button" className="link-button" onClick={showSource}>
                  {latest ? `StreetEasy alerts connected · last one ${ago(latest)}` : 'No StreetEasy alerts yet'}
                </button>
              )}
            </span>
            <span className="toolbar__actions">
              <button type="button" className="button" onClick={() => setAdding((a) => !a)}>
                Check a listing
              </button>
              <button type="button" className="button" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            </span>
          </div>
        </header>

        {adding && <AddListing onAdd={addManual} onClose={() => setAdding(false)} />}

        {!hasPlaces && !nothingYet && (
          <div className="notice">
            {firstVisit && latest ? (
              <p>
                <strong>New browser? There’s nothing to connect.</strong> Listings come in on their own, the same
                everywhere. Only your places, filters and notes are kept per browser: add the places you commute to, or
                bring them over with the setup link from a device that has them.
              </p>
            ) : (
              <p>
                <strong>Add the places you commute to</strong> — your office, your partner’s — and every listing gets
                door-to-door subway and walking times.
              </p>
            )}
            <button type="button" className="button button--primary" onClick={() => setSettingsOpen(true)}>
              Add places
            </button>
          </div>
        )}

        {nothingYet ? (
          <section className="empty-card">
            <h2>No listings yet</h2>
            <SetupGuide scan={scan} searches={settings.searches} id="listings-guide" />
          </section>
        ) : (
          <>
            <nav className="tabs" aria-label="Listings">
              {(
                [
                  ['shortlist', 'Shortlist', shortlistCount],
                  ['out', 'Filtered out', groups.out.length],
                  ['passed', 'Passed', groups.passed.length],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  className={`tabs__tab${tab === id ? ' is-on' : ''}`}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label} <span className="tabs__n">{n}</span>
                </button>
              ))}
              {!isDesktop && (
                <button type="button" className="tabs__map" onClick={() => setMapOnPhone(true)}>
                  Map
                </button>
              )}
            </nav>

            <main className="list">
              {tab === 'shortlist' && (
                <>
                  {groups.ready.length > 0 && (
                    <section>
                      <h2 className="list__heading">Ready to tour</h2>
                      {groups.ready.map(card)}
                    </section>
                  )}
                  {groups.check.length > 0 && (
                    <section>
                      <h2 className="list__heading">
                        Passes everything else — read the Openigloo reviews, then mark it
                      </h2>
                      {groups.check.map(card)}
                    </section>
                  )}
                  {shortlistCount === 0 && (
                    <p className="list__empty">
                      Nothing clears every check right now.{' '}
                      {groups.out.length > 0 && (
                        <button type="button" className="link-button" onClick={() => setTab('out')}>
                          See the {plural(groups.out.length, 'listing')} that didn’t, and why
                        </button>
                      )}
                    </p>
                  )}
                  {groups.pending.length > 0 && (
                    <section>
                      <h2 className="list__heading">Still being checked</h2>
                      {groups.pending.map(card)}
                    </section>
                  )}
                </>
              )}
              {tab === 'out' &&
                (groups.out.length ? groups.out.map(card) : <p className="list__empty">Nothing filtered out.</p>)}
              {tab === 'passed' &&
                (groups.passed.length ? (
                  groups.passed.map(card)
                ) : (
                  <p className="list__empty">Listings you pass on go here.</p>
                ))}
            </main>
          </>
        )}

        <footer className="colophon">
          Listings from your StreetEasy alerts · pest records from{' '}
          <a href="https://opendata.cityofnewyork.us/">NYC Open Data</a> · subway times from the MTA’s timetable (feed{' '}
          {graph.feed.slice(0, 8)}) · map © <a href="https://openfreemap.org">OpenFreeMap</a>{' '}
          <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>
        </footer>
      </div>

      {showMap && (
        <div className="apt__stage">
          <Suspense fallback={<div className="apt-map apt-map--loading" />}>
            <MapView
              items={mapItems.map((i) => i.ev)}
              places={settings.places}
              theme={theme}
              selectedId={openId}
              hoveredId={hoveredId}
              onSelect={select}
            />
          </Suspense>
          {!isDesktop && (
            <button type="button" className="button apt__back" onClick={() => setMapOnPhone(false)}>
              ← List
            </button>
          )}
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          saved={saved}
          scan={scan}
          showSource={settingsAtSource}
          onChange={setSettings}
          onClose={() => {
            setSettingsOpen(false);
            setSettingsAtSource(false);
          }}
        />
      )}
    </div>
  );
}
