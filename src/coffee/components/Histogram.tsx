import { useMemo, useState } from 'react';
import type { Shop } from '../../../lib/dataset.ts';
import { histogram, type Bucket } from '../model.ts';
import { formatScore, scoreColor } from '../score.ts';

interface Props {
  shops: Shop[];
  minScore: number | null;
  onMinScore: (min: number | null) => void;
}

/** Score distribution that doubles as a "this good or better" filter. */
export function Histogram({ shops, minScore, onMinScore }: Props) {
  const buckets = useMemo(() => histogram(shops), [shops]);
  const [hover, setHover] = useState<number | null>(null);
  if (buckets.length < 2) return null;
  const peak = Math.max(...buckets.map((b) => b.count));
  const hovered = hover === null ? null : buckets[hover];
  const first = buckets[0]!;
  const last = buckets[buckets.length - 1]!;
  const cafes = (n: number) => `${n} ${n === 1 ? 'café' : 'cafés'}`;
  const range = (b: Bucket) => (b.below ? `Under ${formatScore(b.to)}` : `${formatScore(b.from)}–${formatScore(b.to)}`);

  let caption: string;
  if (hovered) {
    caption = `${range(hovered)}: ${cafes(hovered.count)}`;
  } else if (minScore !== null) {
    caption = `${cafes(shops.filter((s) => s.score >= minScore).length)} rated ${formatScore(minScore)} or higher`;
  } else {
    caption = 'Pick a bar to see only scores that high or higher';
  }

  return (
    <figure className="histo">
      <figcaption className="histo__caption" aria-live="polite">
        {caption}
      </figcaption>
      <div
        className="histo__bars"
        role="group"
        aria-label="Filter by minimum score"
        onMouseLeave={() => setHover(null)}
      >
        {buckets.map((b, i) => {
          const active = minScore === null || b.from >= minScore;
          const pressed = !b.below && minScore === b.from;
          return (
            <button
              key={b.from}
              type="button"
              className={`histo__bar${active ? '' : ' is-muted'}${b.below ? ' histo__bar--below' : ''}`}
              aria-pressed={pressed}
              aria-label={
                b.below
                  ? `${range(b)}: ${cafes(b.count)}. Show every score`
                  : `${formatScore(b.from)} and up (${cafes(b.count)} at ${range(b)})`
              }
              onClick={() => onMinScore(b.below || pressed ? null : b.from)}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span
                className="histo__fill"
                style={{
                  height: b.count ? `${Math.max(6, (b.count / peak) * 100)}%` : '2px',
                  background: b.count ? scoreColor(b.below ? 0 : b.from) : 'var(--rule)',
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="histo__axis" aria-hidden="true">
        <span>{first.below ? `< ${formatScore(first.to)}` : formatScore(first.from)}</span>
        <span>{formatScore(last.to)}</span>
      </div>
    </figure>
  );
}
