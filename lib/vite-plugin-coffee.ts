// Exposes the coffee dataset and a world outline to the app as virtual modules,
// built from the files in data/. A broken CSV fails the build with line numbers.

import { createRequire } from 'node:module';
import { geoEquirectangular } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Plugin } from 'vite';
import { buildDataset, formatIssues } from './dataset.ts';
import { CSV_PATH, PLACES_PATH, displayPath, readPlaces, readRatingsText } from './files.ts';

const DATA_ID = 'virtual:coffee-data';
const LAND_ID = 'virtual:world-land';

/** Rounds coordinates to keep the bundled outline small. */
function roundCoords(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 100) / 100;
  if (Array.isArray(value)) return value.map(roundCoords);
  return value;
}

/**
 * Natural Earth land as plain lon/lat GeoJSON. world-atlas stores spherical
 * polygons (some cross the antimeridian or wrap a pole), so run them through an
 * identity-scaled equirectangular projection to cut them where a flat map needs.
 */
export function worldLand(): FeatureCollection {
  const require = createRequire(import.meta.url);
  const topology = require('world-atlas/land-110m.json') as Topology;
  const land = feature(topology, topology.objects.land!) as FeatureCollection;
  const identity = geoEquirectangular()
    .scale(180 / Math.PI)
    .translate([0, 0])
    .reflectY(true)
    .precision(0);
  const flat = geoProject(land, identity);
  return {
    type: 'FeatureCollection',
    features: flat.features.map((f) => ({
      type: 'Feature',
      properties: {},
      geometry: { ...f.geometry, coordinates: roundCoords((f.geometry as { coordinates: unknown }).coordinates) },
    })) as FeatureCollection['features'],
  };
}

export function coffeeData(): Plugin {
  return {
    name: 'coffee-data',
    resolveId(id) {
      if (id === DATA_ID || id === LAND_ID) return `\0${id}`;
      return undefined;
    },
    load(id) {
      if (id === `\0${LAND_ID}`) {
        return `export default ${JSON.stringify(worldLand())};`;
      }
      if (id !== `\0${DATA_ID}`) return undefined;
      this.addWatchFile(CSV_PATH);
      this.addWatchFile(PLACES_PATH);
      const file = displayPath(CSV_PATH);
      const { dataset, issues, unlocated } = buildDataset(readRatingsText(), readPlaces());
      if (issues.length) {
        throw new Error(`${file} has problems:\n${formatIssues(file, issues)}`);
      }
      if (unlocated.length) {
        this.warn(`${unlocated.length} café(s) have no map location yet (run npm run enrich): ${unlocated.join(', ')}`);
      }
      return `export default ${JSON.stringify(dataset)};`;
    },
  };
}
