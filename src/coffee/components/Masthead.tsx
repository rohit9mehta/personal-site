import type { Stats } from '../model.ts';
import { formatScore } from '../score.ts';

export function Masthead({ stats }: { stats: Stats }) {
  return (
    <header className="masthead">
      <a className="masthead__byline" href={import.meta.env.BASE_URL}>
        Rohit Mehta
      </a>
      <h1 className="wordmark">One Sip</h1>
      <p className="masthead__dek">Coffee shops around the world, rated out of ten.</p>
      <dl className="stats">
        <div>
          <dt>cafés</dt>
          <dd>{stats.count}</dd>
        </div>
        <div>
          <dt>{stats.cities === 1 ? 'city' : 'cities'}</dt>
          <dd>{stats.cities}</dd>
        </div>
        {stats.countries > 0 && (
          <div>
            <dt>{stats.countries === 1 ? 'country' : 'countries'}</dt>
            <dd>{stats.countries}</dd>
          </div>
        )}
        {stats.median !== null && (
          <div>
            <dt>median</dt>
            <dd>{formatScore(stats.median)}</dd>
          </div>
        )}
      </dl>
    </header>
  );
}
