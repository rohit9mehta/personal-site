// Café pins as HTML markers, clustered with supercluster. HTML (not WebGL
// symbols) so pins use the site's typography, animate with CSS, and stay crisp.

import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import Supercluster, { type ClusterFeature, type PointFeature } from 'supercluster';
import type { Shop } from '../../../lib/dataset.ts';
import { formatScore, scoreColor, scoreInk } from '../score.ts';

/** From this zoom up, pins show their score instead of being plain dots. */
export const PILL_ZOOM = 10;
const CLUSTER_RADIUS = 46;
const CLUSTER_MAX_ZOOM = 15;

interface PointProps {
  id: string;
}
type Cluster = ClusterFeature<Record<string, never>>;
type Point = PointFeature<PointProps>;

export interface MarkerHandlers {
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

interface Entry {
  marker: Marker;
  el: HTMLButtonElement;
  /** Shop ids inside this marker (one for a pin, several for a cluster). */
  ids: string[];
}

/**
 * Café locations whose position is only known to the city get spread around
 * the city center on a small golden-angle spiral, so they don't stack.
 */
export function spreadApproximate(shops: Shop[]): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  const seen = new Map<string, number>();
  for (const shop of shops) {
    if (shop.lat === undefined || shop.lng === undefined) continue;
    if (shop.precision !== 'city') {
      positions.set(shop.id, [shop.lng, shop.lat]);
      continue;
    }
    const key = `${shop.lat.toFixed(4)},${shop.lng.toFixed(4)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const r = 0.004 * Math.sqrt(n + 1);
    const a = (n + 1) * 2.399963;
    const lngScale = 1 / Math.max(0.2, Math.cos((shop.lat * Math.PI) / 180));
    positions.set(shop.id, [shop.lng + r * Math.cos(a) * lngScale, shop.lat + r * Math.sin(a)]);
  }
  return positions;
}

export class MarkerLayer {
  private readonly map: MapLibreMap;
  private readonly handlers: MarkerHandlers;
  private readonly entries = new Map<string, Entry>();
  private shops = new Map<string, Shop>();
  private positions = new Map<string, [number, number]>();
  private index: Supercluster<PointProps, Record<string, never>> | null = null;
  private selected: string | null = null;
  private hovered: string | null = null;
  private renderedZoom = -1;
  private pills = false;
  private readonly onZoom = () => {
    const zoom = Math.floor(this.map.getZoom());
    if (zoom !== this.renderedZoom) this.render();
  };

  constructor(map: MapLibreMap, handlers: MarkerHandlers) {
    this.map = map;
    this.handlers = handlers;
    map.on('zoom', this.onZoom);
  }

  setShops(shops: Shop[]): void {
    this.shops = new Map(shops.map((s) => [s.id, s]));
    this.positions = spreadApproximate(shops);
    this.rebuildIndex();
  }

  setSelected(id: string | null): void {
    if (id === this.selected) return;
    this.selected = id;
    // The selected café is pulled out of clustering so it is always visible.
    this.rebuildIndex();
  }

  setHovered(id: string | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    for (const entry of this.entries.values()) this.decorate(entry);
  }

  position(id: string): [number, number] | undefined {
    return this.positions.get(id);
  }

  destroy(): void {
    this.map.off('zoom', this.onZoom);
    for (const entry of this.entries.values()) entry.marker.remove();
    this.entries.clear();
  }

  private rebuildIndex(): void {
    const points: Point[] = [];
    for (const [id, coordinates] of this.positions) {
      if (id === this.selected || !this.shops.has(id)) continue;
      points.push({ type: 'Feature', properties: { id }, geometry: { type: 'Point', coordinates } });
    }
    this.index = new Supercluster<PointProps, Record<string, never>>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minPoints: 2,
    }).load(points);
    this.render();
  }

  private render(): void {
    if (!this.index) return;
    const zoom = Math.floor(this.map.getZoom());
    this.renderedZoom = zoom;
    this.pills = zoom >= PILL_ZOOM;
    const features = this.index.getClusters([-180, -85, 180, 85], zoom);
    const next = new Map<string, { coords: [number, number]; ids: string[]; cluster?: Cluster }>();
    for (const f of features) {
      const coords = f.geometry.coordinates as [number, number];
      if ('cluster' in f.properties && f.properties.cluster) {
        const cluster = f as Cluster;
        const ids = this.index
          .getLeaves(cluster.properties.cluster_id, Infinity)
          .map((leaf) => (leaf.properties as PointProps).id);
        next.set(`c:${cluster.properties.cluster_id}`, { coords, ids, cluster });
      } else {
        const id = (f as Point).properties.id;
        next.set(`p:${id}`, { coords, ids: [id] });
      }
    }
    if (this.selected) {
      const coords = this.positions.get(this.selected);
      if (coords && this.shops.has(this.selected)) next.set(`p:${this.selected}`, { coords, ids: [this.selected] });
    }

    for (const [key, entry] of this.entries) {
      if (!next.has(key)) {
        entry.marker.remove();
        this.entries.delete(key);
      }
    }
    for (const [key, item] of next) {
      let entry = this.entries.get(key);
      if (!entry) {
        const el = item.cluster ? this.clusterElement(item.cluster, item.ids) : this.pinElement(item.ids[0]!);
        const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(item.coords).addTo(this.map);
        entry = { marker, el, ids: item.ids };
        this.entries.set(key, entry);
      } else {
        entry.ids = item.ids;
        entry.marker.setLngLat(item.coords);
      }
      this.decorate(entry);
    }
  }

  private pinElement(id: string): HTMLButtonElement {
    const shop = this.shops.get(id)!;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin';
    el.tabIndex = -1;
    el.setAttribute('aria-label', `${shop.name}, ${formatScore(shop.score)} out of 10`);
    el.style.setProperty('--pin-color', scoreColor(shop.score));
    el.style.setProperty('--pin-ink', scoreInk(shop.score));
    if (shop.precision === 'city') el.classList.add('pin--approx');
    const score = document.createElement('span');
    score.className = 'pin__score';
    score.textContent = formatScore(shop.score);
    const label = document.createElement('span');
    label.className = 'pin__label';
    label.textContent = shop.name;
    el.append(score, label);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onSelect(id);
    });
    el.addEventListener('mouseenter', () => this.handlers.onHover(id));
    el.addEventListener('mouseleave', () => this.handlers.onHover(null));
    return el;
  }

  private clusterElement(cluster: Cluster, ids: string[]): HTMLButtonElement {
    const count = cluster.properties.point_count;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cluster';
    el.tabIndex = -1;
    el.setAttribute('aria-label', `${count} cafés — zoom in`);
    const size = Math.round(Math.min(56, 26 + Math.sqrt(count) * 4.5));
    el.style.setProperty('--size', `${size}px`);
    const best = Math.max(...ids.map((id) => this.shops.get(id)?.score ?? 0));
    el.style.setProperty('--best', scoreColor(best));
    el.textContent = String(count);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = this.index;
      if (!index) return;
      const zoom = Math.min(index.getClusterExpansionZoom(cluster.properties.cluster_id), CLUSTER_MAX_ZOOM + 1);
      this.map.easeTo({ center: cluster.geometry.coordinates as [number, number], zoom }, { userAction: true });
    });
    return el;
  }

  private decorate(entry: Entry): void {
    const { el, ids } = entry;
    const isCluster = el.classList.contains('cluster');
    const selected = this.selected !== null && ids.includes(this.selected);
    const hovered = this.hovered !== null && ids.includes(this.hovered);
    if (!isCluster) el.classList.toggle('pin--pill', this.pills);
    el.classList.toggle('is-selected', selected);
    el.classList.toggle('is-hovered', hovered && !selected);
    el.setAttribute('aria-pressed', String(selected));
    // Keep the interesting marker on top of its neighbours.
    entry.marker.getElement().style.zIndex = selected ? '3' : hovered ? '2' : isCluster ? '1' : '';
  }
}
