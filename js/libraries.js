// Load bundled code once, without placing either library on the host window.
export let L;
export let maplibregl;
let loading;
export function loadLibraries() {
  return loading ??= Promise.all([
    import('../vendor/leaflet/leaflet.js'),
    import('../vendor/maplibre-gl/maplibre-gl.js'),
  ]).then(async ([leaflet, maplibre]) => {
    L = leaflet.default;
    maplibregl = maplibre.default;
    await Promise.all([
      import('../vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js'),
      import('../vendor/leaflet-velocity/leaflet-velocity.min.js'),
    ]);
  }).catch((error) => { loading = null; throw error; });
}
