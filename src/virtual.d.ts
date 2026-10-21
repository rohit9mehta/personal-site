declare module 'virtual:coffee-data' {
  const dataset: import('../lib/dataset.ts').Dataset;
  export default dataset;
}

declare module 'virtual:world-land' {
  const land: import('geojson').FeatureCollection;
  export default land;
}
