import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Dataset } from '../../lib/dataset.ts';
import { Histogram } from './components/Histogram.tsx';
import { Masthead } from './components/Masthead.tsx';
import { SearchBox } from './components/SearchBox.tsx';
import { ShopDetail } from './components/ShopDetail.tsx';
import { ShopList } from './components/ShopList.tsx';
import { useDebounced, useMediaQuery } from './hooks.ts';
import {
  SORT_LABELS,
  computeStats,
  filterShops,
  hasRecency,
  inBounds,
  sortShops,
  type Bounds,
  type SortKey,
} from './model.ts';
import { formatScore } from './score.ts';
import { readUrlState, urlFor, type View } from './url.ts';

// MapLibre is most of the JavaScript; load it alongside, not ahead of, the list.
const MapView = lazy(() => import('./components/MapView.tsx').then((m) => ({ default: m.MapView })));

const UPDATED = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** Tracks an element's rendered height. */
function useHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    if (!el) {
      setHeight(0);
      return;
    }
    observer.current = new ResizeObserver(([entry]) =>
      setHeight(entry?.borderBoxSize[0]?.blockSize ?? el.offsetHeight),
    );
    observer.current.observe(el);
  }, []);
  return [ref, height];
}

export function App({ dataset }: { dataset: Dataset }) {
  const all = dataset.shops;
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const [initial] = useState(readUrlState);

  const [query, setQuery] = useState(initial.q);
  const [minScore, setMinScore] = useState(initial.min);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.shop && byId.has(initial.shop) ? initial.shop : null,
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [view, setView] = useState<View>(initial.view);
  const [area, setArea] = useState<{ key: string; bounds: Bounds } | null>(null);
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const theme = useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light';
  const searchRef = useRef<HTMLInputElement>(null);
  const [topbarRef, topbarHeight] = useHeight<HTMLDivElement>();
  const [sheetRef, sheetHeight] = useHeight<HTMLDivElement>();

  const debouncedQuery = useDebounced(query, 350);
  const fitKey = `${debouncedQuery.trim().toLowerCase()}|${minScore ?? ''}`;
  const filtered = useMemo(() => filterShops(all, { query, minScore }), [all, query, minScore]);
  // On desktop the list follows the map once you move it yourself.
  const movedArea = isDesktop && area?.key === fitKey ? area.bounds : null;
  const inArea = useMemo(
    () => (movedArea ? filtered.filter((s) => inBounds(s, movedArea)) : filtered),
    [filtered, movedArea],
  );
  // Only call it an area filter when it actually hides something.
  const activeArea = movedArea && inArea.length < filtered.length ? movedArea : null;
  const listed = useMemo(() => sortShops(inArea, sort), [inArea, sort]);
  const stats = useMemo(() => computeStats(all), [all]);
  const sortKeys = useMemo(
    () => (Object.keys(SORT_LABELS) as SortKey[]).filter((k) => k !== 'recent' || hasRecency(all)),
    [all],
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const tiedWith = selected ? all.filter((s) => s.rank === selected.rank).length - 1 : 0;

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setView('map');
  }, []);

  const close = useCallback(() => {
    if ((window.history.state as { sip?: boolean } | null)?.sip) window.history.back();
    else setSelectedId(null);
  }, []);

  const onAreaChange = useCallback((bounds: Bounds) => setArea({ key: fitKey, bounds }), [fitKey]);

  // Mirror state into the URL. Opening a café adds a history entry so the
  // back button closes it; everything else replaces the current entry.
  useEffect(() => {
    const url = urlFor({ q: debouncedQuery, min: minScore, sort, shop: selectedId, view: isDesktop ? 'map' : view });
    if (url === window.location.pathname + window.location.search) return;
    const previousShop = new URLSearchParams(window.location.search).get('shop');
    if (selectedId && !previousShop) window.history.pushState({ sip: true }, '', url);
    else window.history.replaceState(window.history.state, '', url);
  }, [debouncedQuery, minScore, sort, selectedId, view, isDesktop]);

  useEffect(() => {
    const onPop = () => {
      const shop = readUrlState().shop;
      setSelectedId(shop && byId.has(shop) ? shop : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [byId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!isDesktop) setView('list');
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && selectedId) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, isDesktop, selectedId]);

  useEffect(() => {
    document.title = selected ? `${selected.name} · One Sip` : 'One Sip — Coffee ratings by Rohit Mehta';
  }, [selected]);

  const padding = useMemo(
    () =>
      isDesktop
        ? { top: 0, right: 0, bottom: 0, left: selected ? 400 : 0 }
        : { top: topbarHeight, right: 0, bottom: selected ? sheetHeight : 72, left: 0 },
    [isDesktop, selected, topbarHeight, sheetHeight],
  );

  const resetFilters = () => {
    setQuery('');
    setMinScore(null);
  };

  return (
    <div
      className="app"
      data-view={view}
      data-detail={selected ? 'open' : 'closed'}
      style={isDesktop ? undefined : ({ '--map-top': `${padding.top}px`, '--map-bottom': '72px' } as CSSProperties)}
    >
      <aside className="panel" aria-label="Coffee shops">
        <div className="topbar" ref={topbarRef}>
          <Masthead stats={stats} />
          <div className="controls">
            <SearchBox ref={searchRef} value={query} onChange={setQuery} />
            <div className="toolbar">
              <p className="toolbar__count" aria-live="polite">
                <strong>{listed.length}</strong> {listed.length === 1 ? 'café' : 'cafés'}
                {activeArea ? ' in this map area' : filtered.length < all.length ? ' match' : ''}
              </p>
              <div className="toolbar__actions">
                {activeArea && (
                  <button type="button" className="chip" onClick={() => setArea(null)}>
                    Show all
                  </button>
                )}
                {minScore !== null && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setMinScore(null)}
                    aria-label={`Remove ${formatScore(minScore)}+ filter`}
                  >
                    {formatScore(minScore)}+ <span aria-hidden="true">×</span>
                  </button>
                )}
                <label className="sort">
                  <span className="visually-hidden">Sort by</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    {sortKeys.map((key) => (
                      <option key={key} value={key}>
                        {SORT_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        <Histogram shops={all} minScore={minScore} onMinScore={setMinScore} />

        {listed.length ? (
          <ShopList
            shops={listed}
            groupByCity={sort === 'city'}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={select}
            onHover={setHoveredId}
          />
        ) : (
          <div className="empty">
            <p>
              {all.length === 0
                ? 'No ratings yet.'
                : activeArea
                  ? 'Nothing rated in this part of the map.'
                  : `No cafés match${query ? ` “${query.trim()}”` : ''}${minScore !== null ? ` at ${formatScore(minScore)} or higher` : ''}.`}
            </p>
            {all.length > 0 && (
              <button type="button" className="button" onClick={activeArea ? () => setArea(null) : resetFilters}>
                {activeArea ? 'Show all' : 'Clear filters'}
              </button>
            )}
          </div>
        )}

        <footer className="colophon">
          <p>Scores are out of ten and entirely personal. Updated {UPDATED.format(new Date(dataset.updated))}.</p>
          <p>
            Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by{' '}
            <a href="https://openfreemap.org">OpenFreeMap</a>.
          </p>
        </footer>
      </aside>

      <main className="stage">
        <Suspense fallback={<div className="map map--loading" aria-hidden="true" />}>
          <MapView
            shops={filtered}
            theme={theme}
            selectedId={selectedId}
            hoveredId={hoveredId}
            fitKey={fitKey}
            padding={padding}
            onSelect={select}
            onHover={setHoveredId}
            onAreaChange={onAreaChange}
          />
        </Suspense>
        {selected && (
          <div className="sheet" ref={sheetRef}>
            <ShopDetail key={selected.id} shop={selected} total={all.length} tiedWith={tiedWith} onClose={close} />
          </div>
        )}
      </main>

      <nav className="switch" aria-label="View">
        <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
          Map
        </button>
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
          List <span className="switch__count">{listed.length}</span>
        </button>
      </nav>
    </div>
  );
}
