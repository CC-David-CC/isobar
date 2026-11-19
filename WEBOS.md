# WebOS integration

## Entry and usage

`app.mjs` exports `mount` both by name and as its default export. The function returns immediately; it never returns a Promise.

```js
import { mount } from './apps/isobar/app.mjs';

// host is the DOM content element of your WebOS window.
const { element, dispose } = mount(host);

// On window close, before discarding host:
dispose();
```

`mount` appends its own element without replacing the host's existing children. Supply an Element or ShadowRoot in the current document with a definite nonzero width and height. The returned element fills that space. The exact WebOS shell, its app manifest format and its assembly repository were not included in the upload, so this package does not guess those registrations or paths.

Initialization loads bundled modules and styles asynchronously. `element.dataset.state` is `loading`, `ready` or `error`; `ready` means that the interface has been initialized, not that remote weather services have finished responding. Startup failure appears inside the app. `dispose()` is safe during startup and may be called more than once. A disposed instance never mounts itself again when an import or network request completes.

Serve the **whole directory** over HTTP(S), preserving its relative paths. No npm installation, bundler, CDN script or separate app server is needed. Assets, fonts, styles and the GRIB worker resolve relative to the app module. Keep `.mjs` and `.js` served with a JavaScript MIME type.

To run the same entry standalone:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/`. The page's `standalone.mjs` calls `mount`; it is not a second application implementation.

## Ownership and isolation

Each mount creates its own ShadowRoot, map/globe, forecast selection, layer controllers, data worker, resize observers and lifecycle signal. It can share a document with another Isobar instance. CSS, dialog markup, element IDs, keyboard shortcuts and layout classes stay inside that instance. Responsive breakpoints use the app container width, rather than the browser viewport. No iframe or global CSS injection is used. The About dialog is window-local rather than a document-modal dialog.

Disposal stops layer polling and playback, aborts application-owned forecast and metadata requests, terminates the GRIB worker, clears its caches, disconnects observers, cancels tracked timers/animation frames, removes map instances and releases their drawing resources. Tile retries and pending WMS/radar swaps are canceled before map removal. Geolocation is requested only when the user presses the location button; browsers do not provide cancellation for `getCurrentPosition`, so late results are ignored after disposal.

The bundled Leaflet and MapLibre libraries are native module exports and do not overwrite `window.L` or `window.maplibregl`. Module code, registered MapLibre protocols and two application-prefixed B612 font faces are shared bounded assets retained for reuse in the document. Per-map forecast field data is removed when its layer stops. ES module and font loads already started may finish after closure; they cannot create a new app instance.

Preferences continue to use upstream's `isobar.*` localStorage keys, so different windows start from the same saved settings. The live controls and forecast selection of one window do not mutate another. This package does not introduce account synchronization.

## Weather and hosting

This task adapts the supplied application lifecycle; it retains upstream weather providers, including NOAA/NWS, ECMWF, NASA, Open-Meteo and RainViewer. It does **not** implement the previously discussed shared server cache. Browser HTTP caching and the upstream in-memory GRIB field cache still operate; they are not a cache shared across users. Provider attribution and license files remain intact.

The standalone page includes its upstream provider allowlist in a CSP. When embedding in WebOS, the **shell's** CSP controls the app. Allow this app's same-origin JS/CSS/fonts, same-origin module workers plus MapLibre blob workers, inline/generated style properties used by the rendering libraries, and the weather/map domains listed in `index.html`. If the shell deliberately blocks a provider, that provider's layer will report failure. A server-side provider/cache integration should be made against the real WebOS backend rather than assumed in this archive.

## Verification

`npm test` runs the supplied upstream Node tests plus focused lifecycle tests. The added cases verify per-window worker isolation, cancellation of pending work, idempotent disposal, refusal to recreate a disposed worker, and cleanup after worker construction is blocked.

The source was syntax checked. Browser rendering, GPU resource release under real WebGL, all live data services and compatibility with the actual WebOS shell require browser integration checks. Those results must not be inferred from the Node tests alone.

Before deployment, open two app windows, resize them independently, select different layers/locations, close one while data is loading, reopen it, and confirm that the remaining window and the shell still work. Verify both globe and flat-map interaction under the deployment's CSP.
