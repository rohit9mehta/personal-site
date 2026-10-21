import { Fragment, memo, useEffect, useRef, type KeyboardEvent } from 'react';
import type { Shop } from '../../../lib/dataset.ts';
import { cityKey, median } from '../model.ts';
import { formatScore, scoreColor } from '../score.ts';

interface Props {
  shops: Shop[];
  groupByCity: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** "Mission · San Francisco, CA" — skipping a neighborhood the city already names. */
export function placeLine(shop: Shop): string {
  if (shop.multiLocation) return 'Multiple locations';
  const town = shop.city.split(',')[0]!.trim().toLowerCase();
  const hood = shop.neighborhood && shop.neighborhood.toLowerCase() !== town ? shop.neighborhood : undefined;
  return [hood, shop.city].filter(Boolean).join(' · ');
}

const Row = memo(function Row({
  shop,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  shop: Shop;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={`row${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(shop.id)}
        onMouseEnter={() => onHover(shop.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(shop.id)}
        onBlur={() => onHover(null)}
      >
        <span className="row__rank" aria-label={`Rank ${shop.rank}`}>
          {shop.rank}
        </span>
        <span className="row__main">
          <span className="row__name">{shop.name}</span>
          <span className="row__meta">
            {placeLine(shop)}
            {shop.lat === undefined && !shop.multiLocation && <span className="row__flag"> · not on map yet</span>}
          </span>
        </span>
        <span className="row__score">
          <span className="swatch" style={{ background: scoreColor(shop.score) }} aria-hidden="true" />
          <span className="row__value">{formatScore(shop.score)}</span>
        </span>
      </button>
    </li>
  );
});

/** Up/down arrows move between rows. */
function onArrowKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.row')];
  const index = rows.indexOf(document.activeElement as HTMLButtonElement);
  if (index === -1) return;
  e.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
}

export function ShopList({ shops, groupByCity, selectedId, hoveredId, onSelect, onHover }: Props) {
  if (!groupByCity) {
    return (
      <ol className="list" onKeyDown={onArrowKeys}>
        {shops.map((shop) => (
          <Row
            key={shop.id}
            shop={shop}
            selected={shop.id === selectedId}
            hovered={shop.id === hoveredId}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </ol>
    );
  }

  const groups: { key: string; city: string; country?: string; shops: Shop[] }[] = [];
  for (const shop of shops) {
    const key = cityKey(shop);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.shops.push(shop);
    else groups.push({ key, city: shop.city, country: shop.country, shops: [shop] });
  }
  return (
    <div className="list list--grouped" onKeyDown={onArrowKeys}>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <h3 className="group">
            <span className="group__city">{group.city}</span>
            <span className="group__meta">
              {group.shops.length} {group.shops.length === 1 ? 'café' : 'cafés'} · median{' '}
              {formatScore(median(group.shops.map((s) => s.score))!)}
            </span>
          </h3>
          <ol className="list">
            {group.shops.map((shop) => (
              <Row
                key={shop.id}
                shop={shop}
                selected={shop.id === selectedId}
                hovered={shop.id === hoveredId}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </ol>
        </Fragment>
      ))}
    </div>
  );
}
