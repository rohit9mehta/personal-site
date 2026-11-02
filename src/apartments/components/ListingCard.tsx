import {
  directionsUrl,
  hpdOnlineUrl,
  openiglooSearchUrl,
  openiglooUrl,
  whoOwnsWhatUrl,
} from '../../../lib/apartments/geo.ts';
import type { Evaluation, IglooVerdict } from '../../../lib/apartments/model.ts';
import { PEST_KINDS, SOURCES, type PestKind } from '../../../lib/apartments/records.ts';
import { PROFILES, type SubwayGraph } from '../../../lib/apartments/transit.ts';
import { ago, bathsLabel, bedsLabel, plural, shortDate, usd } from '../format.ts';
import type { Mark } from '../state.ts';
import { TripLines, TripSteps } from './Trip.tsx';

interface Props {
  ev: Evaluation;
  routes: SubwayGraph['routes'];
  isNew: boolean;
  mark: Mark | undefined;
  open: boolean;
  hasPlaces: boolean;
  pestYears: number;
  manual: boolean;
  onToggle: () => void;
  onIgloo: (verdict: IglooVerdict | undefined) => void;
  onMark: (mark: Mark | undefined) => void;
  onRemove: () => void;
  onHover: (id: string | null) => void;
}

const STATUS: Record<Evaluation['status'], string> = {
  ready: 'Ready to tour',
  check: 'Check Openigloo',
  pending: 'Still checking',
  out: 'Filtered out',
};

function kindsSummary(byKind: Partial<Record<PestKind, number>>): string {
  return (Object.entries(byKind) as [PestKind, number][])
    .map(([k, n]) => `${PEST_KINDS[k].toLowerCase()} ×${n}`)
    .join(', ');
}

function fullAddress(ev: Evaluation): string {
  const borough = ev.building?.geo?.borough ?? 'Manhattan';
  return `${ev.listing.address}, ${borough}, NY`;
}

export function ListingCard({
  ev,
  routes,
  isNew,
  mark,
  open,
  hasPlaces,
  pestYears,
  manual,
  onToggle,
  onIgloo,
  onMark,
  onRemove,
  onHover,
}: Props) {
  const { listing, building, pests } = ev;
  const geo = building?.geo;
  const records = building?.records;
  const facts = [
    listing.neighborhood,
    bedsLabel(listing.beds),
    bathsLabel(listing.baths),
    listing.sqft ? `${listing.sqft.toLocaleString('en-US')} ft²` : '',
    listing.noFee ? 'No fee' : '',
  ].filter(Boolean);
  const first = listing.prices[0]?.price;
  const drop = first !== undefined && first > listing.price ? first - listing.price : 0;
  const iglooHref = openiglooUrl(geo, listing.address);
  const domId = `listing-${listing.id.replace(/[^\w-]/g, '-')}`;

  let pestText: string;
  let pestState: 'ok' | 'bad' | 'todo';
  if (pests.status === 'pests') {
    pestText = kindsSummary(pests.byKind);
    pestText = pestText.charAt(0).toUpperCase() + pestText.slice(1);
    pestState = 'bad';
  } else if (pests.status === 'clear') {
    const older = (records?.records.length ?? 0) - pests.counted.length;
    pestText = `None in ${plural(pestYears, 'year')}` + (older > 0 ? ` (${older} older or not counted)` : '');
    if (pests.counted.length) pestText = `${pests.counted.length} — within your allowance`;
    pestState = 'ok';
  } else if (!geo && building?.geoError) {
    pestText = 'Couldn’t find this address in the city’s records';
    pestState = 'todo';
  } else if (records) {
    pestText = 'City data didn’t answer; will retry';
    pestState = 'todo';
  } else {
    pestText = 'Checking on the next scan';
    pestState = 'todo';
  }

  return (
    <article
      className={`card card--${ev.status}${open ? ' is-open' : ''}`}
      id={domId}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button type="button" className="card__head" onClick={onToggle} aria-expanded={open}>
        <span className="card__meta">
          <span className={`status status--${ev.status}`}>{STATUS[ev.status]}</span>
          <span className="card__when">
            {isNew && <span className="new-dot">New</span>}
            {manual ? 'Added by you' : `Listed ${ago(listing.firstSeen)}`}
            {mark === 'contacted' && <span className="card__mark"> · Contacted</span>}
          </span>
        </span>
        <span className="card__title">
          <span className="card__address">
            {listing.address}
            {listing.unit && <span className="card__unit"> #{listing.unit}</span>}
          </span>
          <span className="card__price">
            {usd(listing.price)}
            {ev.stretch && <span className="tag tag--stretch">stretch</span>}
          </span>
        </span>
        <span className="card__facts">
          {facts.join(' · ')}
          {drop > 0 && <span className="tag tag--drop">↓ {usd(drop)}</span>}
          {listing.suggested && <span className="tag">suggested</span>}
        </span>
      </button>

      {ev.status === 'out' && ev.reasons.length > 0 && (
        <ul className="reasons" aria-label="Why it's filtered out">
          {ev.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <dl className="checks">
        {ev.commutes.map((c) => (
          <div key={c.place.id} className={`check check--${c.ok ? 'ok' : 'bad'}`}>
            <dt>{c.place.label}</dt>
            <dd>
              <strong>{c.trip.minutes} min</strong>
              <TripLines trip={c.trip} routes={routes} />
              {c.trip.mode === 'subway' && <span className="check__aside">{c.trip.walkMinutes} min on foot</span>}
            </dd>
          </div>
        ))}
        {!hasPlaces && (
          <div className="check check--todo">
            <dt>Commute</dt>
            <dd>Add the places you commute to in Settings</dd>
          </div>
        )}
        {hasPlaces && !geo && (
          <div className="check check--todo">
            <dt>Commute</dt>
            <dd>Waiting for the building’s location</dd>
          </div>
        )}
        <div className={`check check--${pestState}`}>
          <dt>City records</dt>
          <dd>{pestText}</dd>
        </div>
        <div className={`check check--${ev.igloo === 'clean' ? 'ok' : ev.igloo === 'pests' ? 'bad' : 'todo'}`}>
          <dt>Openigloo</dt>
          <dd className="igloo">
            <a href={iglooHref} target="_blank" rel="noreferrer" className="igloo__link">
              {ev.igloo === 'unchecked' ? 'Read the reviews' : 'Reviews'} ↗
            </a>
            <span className="segmented" role="group" aria-label="What the Openigloo reviews say">
              <button
                type="button"
                className={ev.igloo === 'clean' ? 'is-on' : ''}
                aria-pressed={ev.igloo === 'clean'}
                onClick={() => onIgloo(ev.igloo === 'clean' ? undefined : 'clean')}
              >
                No pests
              </button>
              <button
                type="button"
                className={ev.igloo === 'pests' ? 'is-on is-bad' : ''}
                aria-pressed={ev.igloo === 'pests'}
                onClick={() => onIgloo(ev.igloo === 'pests' ? undefined : 'pests')}
              >
                Pests
              </button>
            </span>
          </dd>
        </div>
      </dl>

      {open && (
        <div className="details">
          {ev.commutes.map((c) => (
            <section key={c.place.id} className="details__block">
              <h4>
                To {c.place.label} · {c.trip.minutes} min{' '}
                <span className="details__quiet">({PROFILES[c.place.profile].toLowerCase()})</span>
              </h4>
              <TripSteps trip={c.trip} routes={routes} />
              <a href={directionsUrl(fullAddress(ev), c.place.address)} target="_blank" rel="noreferrer">
                Check on Google Maps ↗
              </a>
            </section>
          ))}

          <section className="details__block">
            <h4>City pest records, last 5 years</h4>
            {records && records.records.length > 0 ? (
              <ul className="records">
                {records.records.map((r, i) => {
                  const counts = pests.counted.includes(r);
                  return (
                    <li key={i} className={counts ? 'is-counted' : ''}>
                      <span className="records__date">{shortDate(r.date)}</span>
                      <span className="records__what">
                        <span className="records__source">{SOURCES[r.source].label}</span> {r.text}
                        {r.apartment && <> · apt {r.apartment}</>}
                        {r.status && <> · {r.status}</>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : records ? (
              <p className="details__quiet">
                Nothing about mice, rats, roaches or bedbugs on file since {shortDate(records.since)}.
              </p>
            ) : (
              <p className="details__quiet">Not checked yet.</p>
            )}
            {records && Object.keys(records.errors).length > 0 && (
              <p className="details__quiet">
                Couldn’t read:{' '}
                {(Object.keys(records.errors) as (keyof typeof SOURCES)[]).map((s) => SOURCES[s].label).join(', ')}.
              </p>
            )}
            <p className="details__links">
              {geo?.bbl && (
                <a href={whoOwnsWhatUrl(geo.bbl)} target="_blank" rel="noreferrer">
                  Who Owns What ↗
                </a>
              )}
              {records?.hpdBuildingId && (
                <a href={hpdOnlineUrl(records.hpdBuildingId)} target="_blank" rel="noreferrer">
                  HPD Online ↗
                </a>
              )}
              <a href={openiglooSearchUrl(listing.address)} target="_blank" rel="noreferrer">
                Search Openigloo ↗
              </a>
            </p>
          </section>

          {(listing.prices.length > 1 || listing.updates.length > 0 || listing.broker) && (
            <section className="details__block">
              <h4>From StreetEasy</h4>
              {listing.prices.length > 1 && (
                <p>
                  Price:{' '}
                  {listing.prices.map((p, i) => (
                    <span key={i}>
                      {i > 0 && ' → '}
                      {usd(p.price)} <span className="details__quiet">({shortDate(p.date)})</span>
                    </span>
                  ))}
                </p>
              )}
              {listing.updates.length > 0 && <p>Latest: {listing.updates.join(' · ')}</p>}
              {listing.broker && <p>Listed by {listing.broker}</p>}
            </section>
          )}
        </div>
      )}

      <footer className="card__actions">
        <a className="button button--quiet" href={listing.url} target="_blank" rel="noreferrer">
          StreetEasy ↗
        </a>
        <button type="button" className="button button--quiet" onClick={onToggle}>
          {open ? 'Less' : 'Details'}
        </button>
        <span className="card__spacer" />
        <button
          type="button"
          className={`button button--quiet${mark === 'contacted' ? ' is-on' : ''}`}
          aria-pressed={mark === 'contacted'}
          onClick={() => onMark(mark === 'contacted' ? undefined : 'contacted')}
        >
          {mark === 'contacted' ? 'Contacted ✓' : 'Contacted'}
        </button>
        {manual ? (
          <button type="button" className="button button--quiet" onClick={onRemove}>
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="button button--quiet"
            onClick={() => onMark(mark === 'passed' ? undefined : 'passed')}
          >
            {mark === 'passed' ? 'Bring back' : 'Pass'}
          </button>
        )}
      </footer>
    </article>
  );
}
