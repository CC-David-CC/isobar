import { loadLibraries } from './js/libraries.js';
import { markup } from './js/template.js';

const styles = ['vendor/leaflet/leaflet.css', 'vendor/maplibre-gl/maplibre-gl.css', 'css/style.css'];
let fonts;
function loadFonts() {
  if (typeof FontFace !== 'function') return Promise.resolve();
  return fonts ??= Promise.all([400, 700].map(async (weight) => {
    const url = new URL(`./vendor/fonts/b612-latin-${weight}-normal.woff2`, import.meta.url);
    const font = new FontFace('Isobar B612', `url("${url}")`, { weight: String(weight), display: 'swap' });
    await font.load();
    document.fonts.add(font);
  })).catch(() => {});
}

function loadStyle(root, path, signal) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(`./${path}`, import.meta.url).href;
    const finish = (error) => {
      link.onload = link.onerror = null;
      signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const aborted = () => finish(new DOMException('App closed', 'AbortError'));
    link.onload = () => finish();
    link.onerror = () => finish(new Error(`Could not load ${path}`));
    signal.addEventListener('abort', aborted, { once: true });
    root.append(link);
  });
}

/**
 * Native, synchronous WebOS app entry. host is an Element or ShadowRoot in this document.
 * Give host a non-zero width and height. Always call dispose before discarding a window.
 */
export function mount(host) {
  if (!host || typeof host.appendChild !== 'function' || host.ownerDocument !== document) {
    throw new TypeError('Isobar mount(host) expects an Element or ShadowRoot in the current document.');
  }
  const element = document.createElement('section');
  element.setAttribute('aria-label', 'Isobar Weather Maps');
  element.setAttribute('aria-busy', 'true');
  element.dataset.state = 'loading';
  Object.assign(element.style, { display: 'block', position: 'relative', width: '100%', height: '100%', minWidth: '0', minHeight: '0', overflow: 'hidden' });
  const root = element.attachShadow({ mode: 'open' });
  const surface = document.createElement('div');
  surface.className = 'isobar-root';
  surface.innerHTML = markup;
  root.append(surface);
  host.appendChild(element);
  const lifetime = new AbortController();
  let stop = null;
  let disposed = false;

  // All imports and assets resolve relative to this module, including when served in a subdirectory.
  Promise.all([loadLibraries(), ...styles.map((path) => loadStyle(root, path, lifetime.signal)), loadFonts()])
    .then(() => import('./js/main.js'))
    .then(({ startIsobar }) => {
      if (disposed) return;
      stop = startIsobar(root, surface);
      element.dataset.state = 'ready';
      element.removeAttribute('aria-busy');
    }).catch((error) => {
      if (disposed) return;
      element.dataset.state = 'error';
      element.removeAttribute('aria-busy');
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = `Isobar could not start: ${error.message}`;
      surface.replaceChildren(message);
      console.error('Isobar startup failed', error);
    });

  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    stop?.();
    stop = null;
    element.remove();
    root.replaceChildren();
  }
  return { element, dispose };
}

export default mount;
