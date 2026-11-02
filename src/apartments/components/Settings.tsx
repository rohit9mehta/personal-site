import { useEffect, useRef, useState } from 'react';
import { locate } from '../../../lib/apartments/geo.ts';
import { DEFAULT_AREAS, type Place, type Search, type Settings } from '../../../lib/apartments/model.ts';
import { PEST_KINDS, type PestKind } from '../../../lib/apartments/records.ts';
import { AREAS, searchUrl } from '../../../lib/apartments/streeteasy.ts';
import { PROFILES, type ProfileId } from '../../../lib/apartments/transit.ts';
import { fetchJson } from '../data.ts';
import { usd } from '../format.ts';
import { setupLink, type Saved } from '../state.ts';
import { SetupGuide } from './SetupGuide.tsx';
import type { ScanResult } from '../data.ts';

const uid = () => Math.random().toString(36).slice(2, 9);
const BEDS = [0, 1, 2, 3, 4];
const bedChip = (b: number) => (b === 0 ? 'Studio' : b === 4 ? '4+' : String(b));

/** Turns an address into coordinates, for a place you commute to. */
export async function placeCoords(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = /\b(ny|new york|manhattan|brooklyn|queens|bronx|staten island)\b/i.test(address)
    ? address
    : `${address}, New York, NY`;
  const geo = await locate(q, fetchJson).catch(() => null);
  return geo ? { lat: geo.lat, lng: geo.lng, label: geo.label } : null;
}

function PlaceRow({ place, onChange, onRemove }: { place: Place; onChange: (p: Place) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(place.address);
  const [state, setState] = useState<'idle' | 'finding' | 'missing'>('idle');
  const latest = useRef(place);
  useEffect(() => {
    latest.current = place;
  });

  const find = async () => {
    const address = draft.trim();
    if (!address || (address === place.address && place.lat !== undefined)) return;
    setState('finding');
    const hit = await placeCoords(address);
    if (!hit) {
      setState('missing');
      onChange({ ...latest.current, address, lat: undefined, lng: undefined });
      return;
    }
    setState('idle');
    onChange({ ...latest.current, address, lat: hit.lat, lng: hit.lng });
  };

  return (
    <div className="place">
      <div className="place__row">
        <label className="field field--grow">
          <span className="field__label">Name</span>
          <input
            value={place.label}
            onChange={(e) => onChange({ ...place, label: e.target.value })}
            placeholder="Office"
          />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Max min</span>
          <input
            type="number"
            min={5}
            max={120}
            inputMode="numeric"
            value={place.maxMinutes}
            onChange={(e) => onChange({ ...place, maxMinutes: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Address</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={find}
          onKeyDown={(e) => e.key === 'Enter' && find()}
          placeholder="e.g. 7 Cooper Square"
          autoComplete="street-address"
        />
      </label>
      <div className="place__row place__row--end">
        <span className={`place__status${state === 'missing' ? ' is-bad' : ''}`}>
          {state === 'finding'
            ? 'Finding…'
            : state === 'missing'
              ? 'Couldn’t find that address'
              : place.lat !== undefined
                ? '✓ Found'
                : place.address
                  ? 'Not located yet'
                  : ''}
        </span>
        <label className="field field--inline">
          <span className="visually-hidden">When</span>
          <select value={place.profile} onChange={(e) => onChange({ ...place, profile: e.target.value as ProfileId })}>
            {(Object.keys(PROFILES) as ProfileId[]).map((p) => (
              <option key={p} value={p}>
                {PROFILES[p]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button button--quiet" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function SearchEditor({
  search,
  onChange,
  onRemove,
}: {
  search: Search;
  onChange: (s: Search) => void;
  onRemove: () => void;
}) {
  const toggleArea = (id: number) =>
    onChange({
      ...search,
      areas: search.areas.includes(id) ? search.areas.filter((a) => a !== id) : [...search.areas, id],
    });
  const toggleBeds = (b: number) =>
    onChange({
      ...search,
      beds: search.beds.includes(b) ? search.beds.filter((x) => x !== b) : [...search.beds, b].sort(),
    });
  const link = searchUrl({
    areas: search.areas,
    beds: search.beds,
    maxPrice: search.maxPrice + search.stretch,
    noFee: search.noFeeOnly,
  });
  return (
    <div className="search-ed">
      <div className="place__row">
        <label className="field field--grow">
          <span className="field__label">Name</span>
          <input value={search.name} onChange={(e) => onChange({ ...search, name: e.target.value })} />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Max rent</span>
          <input
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            value={search.maxPrice}
            onChange={(e) => onChange({ ...search, maxPrice: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="field field--narrow">
          <span className="field__label">Stretch +</span>
          <input
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            value={search.stretch}
            onChange={(e) => onChange({ ...search, stretch: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <fieldset className="chips">
        <legend className="field__label">Bedrooms</legend>
        {BEDS.map((b) => (
          <button
            key={b}
            type="button"
            className={`chip${search.beds.includes(b) ? ' is-on' : ''}`}
            aria-pressed={search.beds.includes(b)}
            onClick={() => toggleBeds(b)}
          >
            {bedChip(b)}
          </button>
        ))}
      </fieldset>
      <fieldset className="chips">
        <legend className="field__label">Neighborhoods</legend>
        {AREAS.map((a) => {
          const viaParent = a.parent !== undefined && search.areas.includes(a.parent);
          const on = search.areas.includes(a.id) || viaParent;
          return (
            <button
              key={a.id}
              type="button"
              className={`chip${on ? ' is-on' : ''}${viaParent ? ' is-implied' : ''}${a.parent ? ' chip--sub' : ''}`}
              aria-pressed={on}
              disabled={viaParent}
              title={viaParent ? `Included in ${AREAS.find((p) => p.id === a.parent)?.name}` : undefined}
              onClick={() => toggleArea(a.id)}
            >
              {a.name}
            </button>
          );
        })}
      </fieldset>
      <div className="place__row place__row--end">
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!search.noFeeOnly}
            onChange={(e) => onChange({ ...search, noFeeOnly: e.target.checked })}
          />{' '}
          No-fee only
        </label>
        <span className="card__spacer" />
        <a className="button button--quiet" href={link} target="_blank" rel="noreferrer">
          Open on StreetEasy ↗
        </a>
        <button type="button" className="button button--quiet" onClick={onRemove}>
          Remove
        </button>
      </div>
      <p className="hint">
        Shows up to {usd(search.maxPrice + search.stretch)}; anything over {usd(search.maxPrice)} is marked as a
        stretch. Save this search on StreetEasy with email alerts on, so new listings reach this page.
      </p>
    </div>
  );
}

interface Props {
  saved: Saved;
  scan: ScanResult | null;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ saved, scan, onChange, onClose }: Props) {
  const { settings } = saved;
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setPlaces = (places: Place[]) => onChange({ ...settings, places });
  const setSearches = (searches: Search[]) => onChange({ ...settings, searches });
  const rules = settings.pests;

  const copy = async () => {
    const link = setupLink(saved);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button type="button" className="drawer__scrim" aria-label="Close settings" onClick={onClose} />
      <div className="drawer__panel" ref={panel} tabIndex={-1}>
        <header className="drawer__head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        </header>

        <section className="drawer__section">
          <h3>Places you commute to</h3>
          <p className="hint">
            Door to door by subway or on foot — never the bus. Times assume you leave in time for the train, like Google
            Maps. Saved only in this browser.
          </p>
          {settings.places.map((p, i) => (
            <PlaceRow
              key={p.id}
              place={p}
              onChange={(np) => setPlaces(settings.places.map((x, j) => (j === i ? np : x)))}
              onRemove={() => setPlaces(settings.places.filter((_, j) => j !== i))}
            />
          ))}
          <button
            type="button"
            className="button"
            onClick={() =>
              setPlaces([
                ...settings.places,
                {
                  id: uid(),
                  label: settings.places.length ? 'Place' : 'Office',
                  address: '',
                  maxMinutes: 25,
                  profile: 'weekday',
                },
              ])
            }
          >
            Add a place
          </button>
        </section>

        <section className="drawer__section">
          <h3>Filters</h3>
          <p className="hint">A listing makes the shortlist if it fits any one of these.</p>
          {settings.searches.map((s, i) => (
            <SearchEditor
              key={s.id}
              search={s}
              onChange={(ns) => setSearches(settings.searches.map((x, j) => (j === i ? ns : x)))}
              onRemove={() => setSearches(settings.searches.filter((_, j) => j !== i))}
            />
          ))}
          <button
            type="button"
            className="button"
            onClick={() =>
              setSearches([
                ...settings.searches,
                { id: uid(), name: 'New filter', areas: DEFAULT_AREAS, beds: [1], maxPrice: 4000, stretch: 0 },
              ])
            }
          >
            Add a filter
          </button>
        </section>

        <section className="drawer__section">
          <h3>Pests in city records</h3>
          <p className="hint">
            HPD violations and tenant complaints, landlords’ bedbug reports, Health Department rat inspections and 311
            rodent calls for the building.
          </p>
          <div className="place__row">
            <label className="field">
              <span className="field__label">Look back</span>
              <select
                value={rules.years}
                onChange={(e) => onChange({ ...settings, pests: { ...rules, years: Number(e.target.value) } })}
              >
                {[1, 2, 3, 5].map((y) => (
                  <option key={y} value={y}>
                    {y} year{y === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Rule out a building with</span>
              <select
                value={rules.allowed}
                onChange={(e) => onChange({ ...settings, pests: { ...rules, allowed: Number(e.target.value) } })}
              >
                {[0, 1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'any record' : `more than ${n}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="chips">
            <legend className="field__label">Counting</legend>
            {(Object.keys(PEST_KINDS) as PestKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`chip${rules.kinds[k] ? ' is-on' : ''}`}
                aria-pressed={rules.kinds[k]}
                onClick={() =>
                  onChange({ ...settings, pests: { ...rules, kinds: { ...rules.kinds, [k]: !rules.kinds[k] } } })
                }
              >
                {PEST_KINDS[k]}
              </button>
            ))}
          </fieldset>
        </section>

        <section className="drawer__section">
          <h3>Use it on another device</h3>
          <p className="hint">
            Your places, filters and Openigloo notes live in this browser. Open this link on your phone (or anywhere) to
            bring them along. Keep it to yourself: it includes your addresses.
          </p>
          <button type="button" className="button" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy setup link'}
          </button>
        </section>

        <section className="drawer__section">
          <h3>Getting listings here</h3>
          <SetupGuide scan={scan} searches={settings.searches} />
        </section>
      </div>
    </div>
  );
}
