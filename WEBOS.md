# Weather Maps for WebOS

This is the independent Isobar application. The desktop imports the named export `mount` from `app.mjs`, calls it with the window host, appends the returned `element`, and calls `dispose()` on close. The function returns synchronously. It also accepts a DOM container for a standalone harness, in which case it appends the element itself. The element’s `data-state` changes from `loading` to `ready` or `error`. Closing during startup is supported.

No build or external JS CDN is required. Serve `app.mjs`, `js/`, `css/`, `vendor/` and `favicon.svg` together with their names and relative paths intact. Ship LICENSE and the component notices in vendor. To run standalone, serve this directory with `python3 -m http.server 8000` and open the root URL. The desktop and standalone launchers use the same renderer.

## Data and storage

Map clicks fetch the WebOS service at `/services/weather/weather?lat=…&lon=…`; place-name searches use `/services/weather/places?q=…`. The standalone server needs those routes served at its origin for shared point forecasts and place-name searches. Without them, the map, coordinate search and model fields operate independently; the forecast strip offers a retry. NWS supplies covered US points and MET Norway supplies points outside coverage. The strip identifies the provider and forecast issue or retrieval time, flags stale responses and suppresses expired or unverified point warnings. It only plots the provider’s actual forecast periods.

GRIB2 indexes, the selected field’s HTTP 206 range, and imagery tiles travel directly between public infrastructure and the browser. Each window owns its GRIB worker and bounded decoded field cache. Selecting a detailed weather, land, air or ocean reading samples the available forecast grids. The model comparison samples surface temperature separately from NOAA GFS, ECMWF IFS and AIFS. A source with no matching field displays “Unavailable.”

The map uses NOAA MRMS, nowCOAST, GFS, GEFS and CFS, NASA GIBS and EONET, NOAA/NWS map services, GDACS and Iowa Environmental Mesonet. OpenFreeMap supplies the basemap; OpenMapTiles and OpenStreetMap receive attribution in the map and About dialog. OpenFreeMap permits commercial use. ECMWF open data and MET Norway require CC BY attribution. The deployed map does not contact RainViewer or Open-Meteo. The upstream comparison tool referencing Open-Meteo is an optional developer utility. See [OpenFreeMap](https://openfreemap.org/), [ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data), [MET Norway terms](https://api.met.no/doc/TermsOfService), [RainViewer terms](https://www.rainviewer.com/api.html), and [Open-Meteo terms](https://open-meteo.com/en/terms).

Each window has an independent ShadowRoot, map, selection, timeline, polling, observers and GRIB worker. A window requests browser geolocation only after the user activates the location control. Recent selections live in memory; explicit saved places use an account-specific browser key, or a separate standalone key. Anonymous desktop hosts keep saved places in memory. Other map presentation preferences are browser-wide.

## Hosting and tests

The shell CSP needs same-origin ES modules and fonts, inline styles and same-origin or blob workers. The standalone policy in index.html lists the precise upstream connect and image origins. The Leaflet image requests explicitly opt into CORS. A browser without WebGL cannot draw the vector basemap or 3D globe. Data and imagery coverage vary by place, time and product. MRMS radar is regional, while satellite imagery provides wider coverage.

Run `node --test test/*.test.js` for the local decoder, map behavior, mount lifecycle and shared-weather adapter tests. Verify interactive rendering in the target desktop and CSP after updating the vendored renderer.
