import { useState } from 'react';
import type { Shop } from '../../../lib/dataset.ts';
import { placeLine } from './ShopList.tsx';
import { SCORE_STEPS, SCORE_THRESHOLDS, formatScore, scoreColor, stepColor } from '../score.ts';

interface Props {
  shop: Shop;
  total: number;
  tiedWith: number;
  onClose: () => void;
}

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatVisitDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const when = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return d ? DAY.format(when) : MONTH.format(when);
}

function mapsLinks(shop: Shop): { google: string; apple: string } {
  // A chain has no one address: search for the nearest instead.
  const query = shop.multiLocation ? shop.name : [shop.name, shop.address, shop.city].filter(Boolean).join(', ');
  const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const apple =
    shop.lat !== undefined && shop.lng !== undefined && shop.precision !== 'city'
      ? `https://maps.apple.com/?q=${encodeURIComponent(shop.name)}&ll=${shop.lat},${shop.lng}`
      : `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
  return { google, apple };
}

/** A 0–10 rule with the score marked on it, banded in the score colors. */
function Gauge({ score }: { score: number }) {
  const edges = [0, ...SCORE_THRESHOLDS, 10];
  return (
    <div className="gauge" aria-hidden="true">
      <div className="gauge__track">
        {SCORE_STEPS.map((i) => (
          <span
            key={i}
            className="gauge__band"
            style={{
              left: `${edges[i]! * 10}%`,
              width: `${(edges[i + 1]! - edges[i]!) * 10}%`,
              background: stepColor(i),
            }}
          />
        ))}
        <span className="gauge__mark" style={{ left: `${score * 10}%`, borderColor: scoreColor(score) }} />
      </div>
      <div className="gauge__ticks">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

export function ShopDetail({ shop, total, tiedWith, onClose }: Props) {
  const [shared, setShared] = useState(false);
  const { google, apple } = mapsLinks(shop);
  const country = shop.country && !shop.city.toLowerCase().includes(shop.country.toLowerCase()) ? shop.country : null;
  const place = shop.multiLocation
    ? 'Rated across its locations'
    : [placeLine(shop), country].filter(Boolean).join(' · ');

  const share = async () => {
    const url = window.location.href;
    const text = `${shop.name} — ${formatScore(shop.score)}/10`;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
    } catch {
      // Dismissed share sheet or blocked clipboard: nothing to do.
    }
  };

  return (
    <article className="detail" aria-labelledby="detail-name">
      <header className="detail__top">
        <p className="detail__rank">
          No. {shop.rank}
          <span className="detail__of"> of {total}</span>
          {tiedWith > 0 && <span className="detail__of"> · tied</span>}
        </p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <h2 id="detail-name" className="detail__name">
        {shop.name}
      </h2>
      <p className="detail__place">{place}</p>

      <div className="detail__score">
        <p className="detail__numeral">
          <span>{formatScore(shop.score)}</span>
          <span className="detail__outof">/10</span>
        </p>
        <Gauge score={shop.score} />
      </div>

      {shop.note && <blockquote className="detail__note">{shop.note}</blockquote>}

      <dl className="facts">
        {shop.address && (
          <div>
            <dt>Address</dt>
            <dd>{shop.address}</dd>
          </div>
        )}
        {shop.precision === 'city' && (
          <div>
            <dt>Location</dt>
            <dd>Somewhere in {shop.city} — pin is approximate</dd>
          </div>
        )}
        {shop.visits.length > 1 ? (
          <div>
            <dt>Visits</dt>
            <dd>
              <ol className="visits">
                {shop.visits.map((visit, i) => (
                  <li key={i}>
                    <span className="visits__score">{formatScore(visit.score)}</span>
                    {visit.date && <span className="visits__date">{formatVisitDate(visit.date)}</span>}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        ) : (
          shop.date && (
            <div>
              <dt>Visited</dt>
              <dd>{formatVisitDate(shop.date)}</dd>
            </div>
          )
        )}
      </dl>

      <div className="detail__actions">
        <a className="button button--primary" href={google} target="_blank" rel="noreferrer">
          Google Maps
        </a>
        <a className="button" href={apple} target="_blank" rel="noreferrer">
          Apple Maps
        </a>
        <button type="button" className="button button--quiet" onClick={share}>
          {shared ? 'Link copied' : 'Share'}
        </button>
      </div>
    </article>
  );
}
