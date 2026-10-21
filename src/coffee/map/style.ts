// A quiet, paper-toned basemap so the coffee is the only thing in color.
// Vector tiles: OpenFreeMap (OpenMapTiles schema, free, no key).
// A bundled Natural Earth outline sits underneath so the world still draws
// instantly — and if the tile server is ever unreachable.

import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

export const MAP_COLORS = {
  water: '#cdd9dc',
  waterLabel: '#6f8891',
  land: '#f2eee6',
  park: '#e4e7d5',
  wood: '#e7e8d8',
  building: '#e8e1d5',
  buildingLine: '#ddd4c6',
  roadMajor: '#fffdf8',
  roadMajorCasing: '#e2d8c9',
  roadMinor: '#fffdf8',
  roadMinorCasing: '#ebe4d8',
  motorway: '#f6ead6',
  motorwayCasing: '#e3cfae',
  rail: '#d6cdc0',
  border: '#b9ae9e',
  borderState: '#d2c9bb',
  labelStrong: '#3f3933',
  label: '#6e665e',
  labelFaint: '#9b9187',
  halo: '#f2eee6',
} as const;

const C = MAP_COLORS;
const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

const NAME: ExpressionSpecification = [
  'coalesce',
  ['get', 'name:en'],
  ['get', 'name_en'],
  ['get', 'name:latin'],
  ['get', 'name'],
];

/** Road width that doubles each zoom level, like the roads themselves. */
function roadWidth(stops: [number, number][]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()] as ExpressionSpecification;
}

const MAJOR = ['primary', 'secondary'];
const MINOR = ['tertiary', 'minor'];

export function buildMapStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'One Sip Paper',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      'world-land': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, maxzoom: 6 },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': ['interpolate', ['linear'], ['zoom'], 5, C.water, 6, C.land],
        },
      },
      {
        id: 'world-land',
        type: 'fill',
        source: 'world-land',
        maxzoom: 7,
        paint: { 'fill-color': C.land, 'fill-antialias': true },
      },
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]],
        paint: {
          'fill-color': C.wood,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10, 0.7],
        },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        minzoom: 9,
        paint: {
          'fill-color': C.park,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 11, 0.85],
        },
      },
      {
        id: 'landuse-green',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'pitch', 'grass', 'stadium']]],
        paint: { 'fill-color': C.park, 'fill-opacity': 0.6 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': C.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        minzoom: 9,
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: {
          'line-color': C.water,
          'line-width': roadWidth([
            [9, 0.4],
            [14, 1.5],
            [18, 4],
          ]),
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-color': C.building,
          'fill-outline-color': C.buildingLine,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1],
        },
      },
      {
        id: 'road-path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['==', ['get', 'class'], 'path'],
        paint: { 'line-color': C.roadMinorCasing, 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      {
        id: 'road-rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: [
          'all',
          ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
          ['!=', ['get', 'brunnel'], 'tunnel'],
        ],
        paint: {
          'line-color': C.rail,
          'line-width': roadWidth([
            [11, 0.5],
            [16, 1.4],
          ]),
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'road-service',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['in', ['get', 'class'], ['literal', ['service', 'track']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.roadMinor,
          'line-width': roadWidth([
            [14, 0.6],
            [18, 7],
          ]),
        },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', MINOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.roadMinorCasing,
          'line-width': roadWidth([
            [12, 0.8],
            [14, 3],
            [18, 18],
          ]),
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13, 1],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', MINOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.roadMinor,
          'line-width': roadWidth([
            [11, 0.4],
            [14, 2],
            [18, 15],
          ]),
        },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', MAJOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.roadMajorCasing,
          'line-width': roadWidth([
            [8, 0.6],
            [12, 2.4],
            [14, 5],
            [18, 26],
          ]),
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', MAJOR]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.roadMajor,
          'line-width': roadWidth([
            [8, 0.3],
            [12, 1.6],
            [14, 3.6],
            [18, 22],
          ]),
        },
      },
      {
        id: 'road-motorway-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.motorwayCasing,
          'line-width': roadWidth([
            [5, 0.4],
            [10, 1.6],
            [14, 6],
            [18, 30],
          ]),
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1],
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.motorway,
          'line-width': roadWidth([
            [7, 0.4],
            [10, 1],
            [14, 4.4],
            [18, 26],
          ]),
        },
      },
      {
        id: 'boundary-state',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        minzoom: 3,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': C.borderState,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 10, 1.2],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: [
          'all',
          ['==', ['get', 'admin_level'], 2],
          ['!=', ['get', 'maritime'], 1],
          ['!=', ['get', 'disputed'], 1],
        ],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': C.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1, 12, 1.6],
        },
      },
      {
        id: 'label-water',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        filter: ['all', ['has', 'name'], ['!=', ['get', 'class'], 'lake']],
        layout: {
          'text-field': NAME,
          'text-font': FONT_ITALIC,
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 8, 13],
          'text-letter-spacing': 0.1,
          'text-max-width': 6,
          'symbol-placement': ['step', ['zoom'], 'point', 10, 'line'],
        },
        paint: { 'text-color': C.waterLabel, 'text-halo-color': C.water, 'text-halo-width': 1 },
      },
      {
        id: 'label-lake',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'water_name',
        minzoom: 9,
        filter: ['all', ['has', 'name'], ['==', ['get', 'class'], 'lake']],
        layout: { 'text-field': NAME, 'text-font': FONT_ITALIC, 'text-size': 11, 'text-max-width': 6 },
        paint: { 'text-color': C.waterLabel, 'text-halo-color': C.water, 'text-halo-width': 1 },
      },
      {
        id: 'label-street',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 14,
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']],
        ],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 13],
          'text-max-angle': 30,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': C.labelFaint, 'text-halo-color': C.roadMinor, 'text-halo-width': 1.4 },
      },
      {
        id: 'label-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'quarter', 'neighbourhood']]],
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 12],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.14,
          'text-max-width': 8,
        },
        paint: { 'text-color': C.labelFaint, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'label-town',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 9,
        maxzoom: 15,
        filter: ['in', ['get', 'class'], ['literal', ['town', 'village']]],
        layout: {
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
          'text-max-width': 8,
        },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'label-state',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['state', 'province']]],
        layout: {
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': 10,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.16,
          'text-max-width': 8,
        },
        paint: { 'text-color': C.labelFaint, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'label-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 14,
        filter: ['==', ['get', 'class'], 'city'],
        layout: {
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4,
            ['case', ['<=', ['get', 'rank'], 3], 12, 10.5],
            10,
            ['case', ['<=', ['get', 'rank'], 3], 17, 14],
          ],
          'text-max-width': 8,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: { 'text-color': C.labelStrong, 'text-halo-color': C.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'label-country',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 1,
        maxzoom: 7,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 6, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.2,
          'text-max-width': 7,
        },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
      },
    ],
  };
}
