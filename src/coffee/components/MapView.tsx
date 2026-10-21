import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Shop } from '../../../lib/dataset.ts';
import { prefersReducedMotion } from '../hooks.ts';
import { MarkerLayer } from '../map/markers.ts';
import { buildMapStyle } from '../map/style.ts';
import type { Bounds } from '../model.ts';
import { SCORE_COLORS, SCORE_THRESHOLDS } from '../score.ts';

setWorkerUrl(workerUrl);

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  shops: Shop[];
  selectedId: string | null;
  hoveredId: string | null;
  /** Changes whenever the filters change; the map then frames the results. */
  fitKey: string;
  padding: Padding;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  /** Called after the user moves the map, with the visible area. */
  onAreaChange: (bounds: Bounds) => void;
}

const SELECT_ZOOM = 14.5;

/**
 * Bounds around the cafés. Longitudes wrap, so when going the other way round
 * the globe is much tighter (California + Japan, say) the bounds cross the
 * antimeridian instead of spanning Europe and the Atlantic.
 */
export function boundsOf(shops: Shop[]): LngLatBounds | null {
  const located = shops.filter((s) => s.lat !== undefined && s.lng !== undefined);
  if (!located.length) return null;
  const lngs = located.map((s) => s.lng!).sort((a, b) => a - b);
  const lats = located.map((s) => s.lat!);
  let west = lngs[0]!;
  let east = lngs[lngs.length - 1]!;
  let widestGap = 0;
  let gapEnd = -1;
  for (let i = 1; i < lngs.length; i++) {
    const gap = lngs[i]! - lngs[i - 1]!;
    if (gap > widestGap) {
      widestGap = gap;
      gapEnd = i;
    }
  }
  const naiveSpan = east - west;
  if (gapEnd > 0 && 360 - widestGap < naiveSpan * 0.75) {
    west = lngs[gapEnd]!;
    east = lngs[gapEnd - 1]! + 360;
  }
  return new LngLatBounds([west, Math.min(...lats)], [east, Math.max(...lats)]);
}

function frame(map: MapLibreMap, shops: Shop[], padding: Padding, animate: boolean) {
  const bounds = boundsOf(shops);
  if (!bounds) return;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const animation = { animate: animate && !prefersReducedMotion(), duration: 1400, essential: false };
  if (Math.abs(ne.lat - sw.lat) < 1e-4 && Math.abs(ne.lng - sw.lng) < 1e-4) {
    map.flyTo({ center: bounds.getCenter(), zoom: SELECT_ZOOM, padding, ...animation });
  } else {
    const extra = map.getCanvas().clientWidth < 600 ? 28 : 56;
    map.fitBounds(bounds, {
      padding: {
        top: padding.top + extra,
        bottom: padding.bottom + extra,
        left: padding.left + extra,
        right: padding.right + extra,
      },
      maxZoom: 13.5,
      ...animation,
    });
  }
}

export function MapView({ shops, selectedId, hoveredId, fitKey, padding, onSelect, onHover, onAreaChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layerRef = useRef<MarkerLayer | null>(null);
  const meRef = useRef<Marker | null>(null);
  /** Once the user (or a search) has moved the map, stop auto-framing it. */
  const settled = useRef(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Keep the latest props reachable from long-lived map listeners.
  const latest = useRef({ shops, padding, onSelect, onHover, onAreaChange });
  useEffect(() => {
    latest.current = { shops, padding, onSelect, onHover, onAreaChange };
  });

  useEffect(() => {
    const container = containerRef.current!;
    const initial = boundsOf(latest.current.shops);
    const map = new MapLibreMap({
      container,
      style: buildMapStyle(),
      ...(initial
        ? { bounds: initial, fitBoundsOptions: { padding: 56, maxZoom: 12 } }
        : { center: [-30, 30], zoom: 1.4 }),
      minZoom: 0,
      maxZoom: 18.5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    mapRef.current = map;

    const layer = new MarkerLayer(map, {
      onSelect: (id) => latest.current.onSelect(id),
      onHover: (id) => latest.current.onHover(id),
    });
    layer.setShops(latest.current.shops);
    layerRef.current = layer;

    map.on('click', () => latest.current.onSelect(null));
    map.on('moveend', (e) => {
      const userMoved = Boolean(
        (e as { originalEvent?: Event }).originalEvent || (e as { userAction?: boolean }).userAction,
      );
      if (!userMoved) return;
      settled.current = true;
      const b = map.getBounds();
      latest.current.onAreaChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    });

    // The world outline is a separate chunk; draw it as soon as it arrives.
    let cancelled = false;
    void import('virtual:world-land').then(({ default: land }) => {
      const apply = () => {
        if (cancelled) return;
        const source = map.getSource<GeoJSONSource>('world-land');
        if (source) source.setData(land);
        else map.once('styledata', apply);
      };
      apply();
    });

    return () => {
      cancelled = true;
      layer.destroy();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    layerRef.current?.setShops(shops);
  }, [shops]);

  useEffect(() => {
    layerRef.current?.setHovered(hoveredId);
  }, [hoveredId]);

  // Frame the results whenever the filters change (not on first render: the
  // map already starts framed).
  const framedKey = useRef(fitKey);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || framedKey.current === fitKey) return;
    framedKey.current = fitKey;
    settled.current = true;
    frame(map, latest.current.shops, latest.current.padding, true);
  }, [fitKey]);

  useEffect(() => {
    layerRef.current?.setSelected(selectedId);
    if (selectedId) settled.current = true;
  }, [selectedId]);

  // Keep the selected café in the visible part of the map — also when the
  // panels around the map change size — and keep framing everything until the
  // user takes over.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    if (!selectedId) {
      if (!settled.current) frame(map, latest.current.shops, padding, false);
      return;
    }
    const position = layer.position(selectedId);
    if (!position) return;
    const point = map.project(position);
    const canvas = map.getCanvas();
    const margin = 40;
    const visible =
      point.x > padding.left + margin &&
      point.x < canvas.clientWidth - padding.right - margin &&
      point.y > padding.top + margin &&
      point.y < canvas.clientHeight - padding.bottom - margin;
    if (visible && map.getZoom() >= 12) return;
    map.flyTo({
      center: position,
      zoom: Math.max(map.getZoom(), SELECT_ZOOM),
      padding,
      animate: !prefersReducedMotion(),
      duration: 1600,
      essential: false,
    });
  }, [selectedId, padding]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, animate: !prefersReducedMotion() }, { userAction: true });
  };

  const showAll = () => {
    const map = mapRef.current;
    if (map) frame(map, latest.current.shops, latest.current.padding, true);
  };

  const locate = () => {
    const map = mapRef.current;
    if (!map || !('geolocation' in navigator)) {
      setLocateError('Location isn’t available in this browser.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const lngLat: [number, number] = [coords.longitude, coords.latitude];
        if (!meRef.current) {
          const el = document.createElement('div');
          el.className = 'me-dot';
          el.setAttribute('aria-hidden', 'true');
          meRef.current = new Marker({ element: el });
        }
        meRef.current.setLngLat(lngLat).addTo(map);
        map.flyTo(
          { center: lngLat, zoom: 13, padding: latest.current.padding, animate: !prefersReducedMotion() },
          { userAction: true },
        );
      },
      () => {
        setLocating(false);
        setLocateError('Couldn’t get your location.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    if (!locateError) return;
    const timer = window.setTimeout(() => setLocateError(null), 3500);
    return () => window.clearTimeout(timer);
  }, [locateError]);

  return (
    <div className="map">
      <div ref={containerRef} className="map__canvas" aria-label="Map of rated coffee shops" role="region" />
      <div className="map__controls">
        <div className="control-group">
          <button type="button" className="control" onClick={() => zoomBy(1)} aria-label="Zoom in" title="Zoom in">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          <button type="button" className="control" onClick={() => zoomBy(-1)} aria-label="Zoom out" title="Zoom out">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10" />
            </svg>
          </button>
        </div>
        <div className="control-group">
          <button
            type="button"
            className="control"
            onClick={showAll}
            aria-label="Show all results"
            title="Show all results"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
            </svg>
          </button>
          <button
            type="button"
            className="control"
            onClick={locate}
            aria-label="Show cafés near me"
            title="Near me"
            aria-busy={locating}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className={locating ? 'spin' : undefined}>
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
            </svg>
          </button>
        </div>
      </div>
      <div className="legend" aria-hidden="true">
        <span>Score</span>
        <div className="legend__ramp">
          {SCORE_COLORS.map((color, i) => (
            <span key={color} className="legend__step">
              <i style={{ background: color }} />
              {i === 0
                ? `<${SCORE_THRESHOLDS[0]}`
                : i === SCORE_COLORS.length - 1
                  ? `${SCORE_THRESHOLDS[i - 1]}+`
                  : SCORE_THRESHOLDS[i - 1]}
            </span>
          ))}
        </div>
      </div>
      {locateError && (
        <p className="map__toast" role="status">
          {locateError}
        </p>
      )}
    </div>
  );
}
