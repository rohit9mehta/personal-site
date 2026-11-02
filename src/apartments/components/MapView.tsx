import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Evaluation, Place } from '../../../lib/apartments/model.ts';
import { buildMapStyle, type MapTheme } from '../../coffee/map/style.ts';

setWorkerUrl(workerUrl);

interface Props {
  items: Evaluation[];
  places: Place[];
  theme: MapTheme;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
}

const MANHATTAN: [[number, number], [number, number]] = [
  [-74.02, 40.7],
  [-73.94, 40.79],
];

const shortPrice = (n: number) => (n >= 10_000 ? `$${Math.round(n / 1000)}k` : `$${(n / 1000).toFixed(1)}k`);

export function MapView({ items, places, theme, selectedId, hoveredId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const placeMarkers = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const m = new MapLibreMap({
      container: box.current!,
      style: buildMapStyle(theme),
      bounds: MANHATTAN,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 18,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // The style is swapped below when the theme changes; the map itself is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.setStyle(buildMapStyle(theme));
  }, [theme]);

  // Listing pins: price pills colored by status.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const live = pins.current;
    const keep = new Set<string>();
    for (const ev of items) {
      const geo = ev.building?.geo;
      if (!geo) continue;
      const id = ev.listing.id;
      keep.add(id);
      let pin = live.get(id);
      if (!pin) {
        const el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(id);
        });
        const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([geo.lng, geo.lat]).addTo(m);
        pin = { marker, el };
        live.set(id, pin);
      }
      pin.marker.setLngLat([geo.lng, geo.lat]);
      pin.el.className = `apt-pin apt-pin--${ev.status}`;
      pin.el.textContent = shortPrice(ev.listing.price);
      pin.el.setAttribute('aria-label', `${ev.listing.address}, ${shortPrice(ev.listing.price)}`);
    }
    for (const [id, pin] of live) {
      if (!keep.has(id)) {
        pin.marker.remove();
        live.delete(id);
      }
    }
  }, [items]);

  // Places you commute to.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const marker of placeMarkers.current) marker.remove();
    placeMarkers.current = places
      .filter((p) => p.lat !== undefined && p.lng !== undefined)
      .map((p) => {
        const el = document.createElement('div');
        el.className = 'apt-place';
        el.textContent = p.label;
        return new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng!, p.lat!]).addTo(m);
      });
  }, [places]);

  // Frame everything once there is something to frame.
  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || framed.current) return;
    const bounds = new LngLatBounds();
    for (const ev of items) if (ev.building?.geo) bounds.extend([ev.building.geo.lng, ev.building.geo.lat]);
    for (const p of places) if (p.lat !== undefined && p.lng !== undefined) bounds.extend([p.lng, p.lat]);
    if (bounds.isEmpty()) return;
    framed.current = true;
    m.fitBounds(bounds, { padding: 64, maxZoom: 14.5, animate: false });
  }, [items, places]);

  // Highlight the selected / hovered pin, and bring the selection into view.
  useEffect(() => {
    for (const [id, pin] of pins.current) {
      pin.el.classList.toggle('is-selected', id === selectedId);
      pin.el.classList.toggle('is-hovered', id === hoveredId);
    }
    const sel = selectedId ? pins.current.get(selectedId) : undefined;
    const m = map.current;
    if (sel && m && !m.getBounds().contains(sel.marker.getLngLat())) {
      m.easeTo({ center: sel.marker.getLngLat(), duration: 600 });
    }
  }, [selectedId, hoveredId, items]);

  return <div ref={box} className="apt-map" aria-label="Map of listings" role="region" />;
}
