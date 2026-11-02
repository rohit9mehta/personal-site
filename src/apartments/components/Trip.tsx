import type { SubwayGraph, Trip } from '../../../lib/apartments/transit.ts';

export function Bullet({ route, routes }: { route: string; routes: SubwayGraph['routes'] }) {
  const [label, bg, fg] = routes[route] ?? [route, '#808183', '#ffffff'];
  return (
    <span className="bullet" style={{ background: bg, color: fg }} title={`${label} train`}>
      {label}
    </span>
  );
}

const m = (s: number) => Math.max(1, Math.round(s / 60));

/** The train part of a trip as bullets: (6), or (L) → (6). */
export function TripLines({ trip, routes }: { trip: Trip; routes: SubwayGraph['routes'] }) {
  if (trip.mode === 'walk') return <span className="trip-lines trip-lines--walk">walk</span>;
  const rides = trip.legs.filter((l) => l.kind === 'ride');
  return (
    <span className="trip-lines">
      {rides.map((r, i) => (
        <span key={i} className="trip-lines__hop">
          {i > 0 && (
            <span className="trip-lines__arrow" aria-label="then">
              →
            </span>
          )}
          <Bullet route={r.route} routes={routes} />
        </span>
      ))}
    </span>
  );
}

/** Step-by-step: walk, wait, ride, transfer, walk. */
export function TripSteps({ trip, routes }: { trip: Trip; routes: SubwayGraph['routes'] }) {
  if (trip.mode === 'walk') {
    return <p className="steps__walk">Walk the whole way, about {trip.walkMinutes} min.</p>;
  }
  const first = trip.legs.findIndex((l) => l.kind === 'wait');
  return (
    <ol className="steps">
      {trip.legs.map((leg, i) => {
        if (leg.kind === 'walk') {
          return (
            <li key={i}>
              <span className="steps__min">{m(leg.seconds)} min</span>
              {leg.to ? `Walk to ${leg.to}` : 'Walk to the door'}
            </li>
          );
        }
        if (leg.kind === 'wait') {
          if (i === first && trip.waitMinutes > 0) {
            return (
              <li key={i} className="steps__quiet">
                <span className="steps__min">~{trip.waitMinutes} min</span>
                Average wait for the <Bullet route={leg.route} routes={routes} /> if you don’t time it
              </li>
            );
          }
          return (
            <li key={i}>
              <span className="steps__min">{m(leg.seconds)} min</span>
              Change for the <Bullet route={leg.route} routes={routes} /> (average wait)
            </li>
          );
        }
        if (leg.kind === 'ride') {
          return (
            <li key={i}>
              <span className="steps__min">{m(leg.seconds)} min</span>
              <Bullet route={leg.route} routes={routes} /> {leg.from} → {leg.to}{' '}
              <span className="steps__quiet">
                ({leg.stops} stop{leg.stops === 1 ? '' : 's'})
              </span>
            </li>
          );
        }
        return (
          <li key={i}>
            <span className="steps__min">{m(leg.seconds)} min</span>
            Walk through to {leg.to}
          </li>
        );
      })}
    </ol>
  );
}
