// Filters and the selected café live in the URL, so any view can be shared.

import { SORT_LABELS, type SortKey } from './model.ts';

export type View = 'map' | 'list';

export interface UrlState {
  q: string;
  min: number | null;
  sort: SortKey;
  shop: string | null;
  view: View;
}

export const DEFAULT_SORT: SortKey = 'best';

export function readUrlState(search = window.location.search): UrlState {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  const min = Number(params.get('min'));
  return {
    q: params.get('q') ?? '',
    min: params.has('min') && min >= 0 && min <= 10 ? min : null,
    sort: sort && sort in SORT_LABELS ? (sort as SortKey) : DEFAULT_SORT,
    shop: params.get('shop'),
    view: params.get('view') === 'list' ? 'list' : 'map',
  };
}

export function urlFor(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.shop) params.set('shop', state.shop);
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.min !== null) params.set('min', String(state.min));
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.view === 'list') params.set('view', 'list');
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}
