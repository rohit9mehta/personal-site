import { useMemo, useState } from 'react';
import type { Shop } from '../../../lib/dataset.ts';
import { histogram } from '../model.ts';
import { formatScore, scoreColor } from '../score.ts';

interface Props {
  shops: Shop[];
  minScore: number | null;
  onMinScore: (min: number | null) => void;
}

const STEP = 0.5;

/** Score distribution that doubles as a "this good or better" filter. */
export function Histogram({ shops, minScore, onMinScore }: Props) {
  const buckets = useMemo(() => histogram(shops, STEP), [shops]);
  const [hover, setHover] = useState<number | null>(null);
  if (buckets.length < 2) return null;
  const peak = Math.max(...buckets.map((b) => b.count));
  const hovered = hover === null ? null : buckets[hover];
  const first = buckets[0]!.from;
  const last = buckets[buckets.length - 1]!.from;

  let caption: string;
  if (hovered) {
    caption = `${formatScore(hovered.from)}–${formatScore(hovered.from + STEP)}: ${hovered.count} ${hovered.count === 1 ? 'café' : 'cafés'}`;
  } else if (minScore !== null) {
    const n = shops.filter((s) => s.score >= minScore).length;
    caption = `${n} rated ${formatScore(minScore)} or higher`;
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
          const pressed = minScore === b.from;
          return (
            <button
              key={b.from}
              type="button"
              className={`histo__bar${active ? '' : ' is-muted'}`}
              aria-pressed={pressed}
              aria-label={`${formatScore(b.from)} and up (${b.count} at ${formatScore(b.from)}–${formatScore(b.from + STEP)})`}
              onClick={() => onMinScore(pressed ? null : b.from)}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <span
                className="histo__fill"
                style={{
                  height: b.count ? `${Math.max(6, (b.count / peak) * 100)}%` : '2px',
                  background: b.count ? scoreColor(b.from) : 'var(--rule)',
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="histo__axis" aria-hidden="true">
        <span>{formatScore(first)}</span>
        <span>{formatScore(last + STEP)}</span>
      </div>
    </figure>
  );
}
