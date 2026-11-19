// Finding a place: search by name, type coordinates, or use saved and recent places.
import { el } from './dom.js';
import { formatCoordinates } from './format.js';
import { load, save } from './store.js';

const GEOCODER = '/services/weather/places';
const WAIT_MS = 280;
const MAX_RECENT = 6;

const KIND_NAMES = {
  AIRP: 'Airport', AIRF: 'Airfield', RSTN: 'Railway station', RSTP: 'Railway stop', PRT: 'Port', HBR: 'Harbor',
  PPLC: 'Capital', PPLA: 'City', PPLA2: 'City', PPL: 'Town', ADM1: 'Region', ADM2: 'District', PCLI: 'Country',
  ISL: 'Island', MT: 'Mountain', PK: 'Peak', LK: 'Lake', PRK: 'Park', DAM: 'Dam',
};

// "19.07, 72.87" or "19.07 72.87". Only values that could be real coordinates count.
export function parseCoordinates(text) {
  const match = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, name: formatCoordinates(lat, lng), detail: 'Coordinates' };
}

export function geocoderResults(results = []) {
  return results.map((place) => ({
    lat: place.latitude,
    lng: place.longitude,
    name: place.name,
    detail: [KIND_NAMES[place.feature_code], place.admin1, place.country].filter(Boolean).join(', '),
  }));
}

export class PlaceSearch {
  constructor({ input, list, onPick, placeKey, root = input.getRootNode() }) {
    Object.assign(this, { input, list, onPick });
    this.placeKey = placeKey;
    this.saved = placeKey ? load(placeKey, []) : [];
    this.recent = [];
    this.request = null;
    this.events = new AbortController();
    if (!Array.isArray(this.saved)) this.saved = [];
    if (!Array.isArray(this.recent)) this.recent = [];

    input.addEventListener('input', () => this.onInput());
    input.addEventListener('focus', () => this.onInput());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        input.value = '';
        this.close();
        input.blur();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.list.querySelector('button')?.click();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.list.querySelector('button')?.focus();
      }
    });
    root.addEventListener('click', (event) => {
      if (!event.composedPath().some((node) => node.classList?.contains('place-search'))) this.close();
    }, { signal: this.events.signal });
  }

  dispose() {
    clearTimeout(this.timer);
    this.events.abort();
    this.request?.abort();
    this.request = null;
  }

  isSaved(place) {
    return this.saved.some((item) => Math.abs(item.lat - place.lat) < 0.01 && Math.abs(item.lng - place.lng) < 0.01);
  }

  toggleSaved(place) {
    if (this.isSaved(place)) {
      this.saved = this.saved.filter((item) => !(Math.abs(item.lat - place.lat) < 0.01 && Math.abs(item.lng - place.lng) < 0.01));
    } else {
      this.saved = [...this.saved, { lat: place.lat, lng: place.lng, name: place.name, detail: place.detail ?? '' }];
    }
    if (this.placeKey) save(this.placeKey, this.saved);
  }

  remember(place) {
    this.recent = [place, ...this.recent.filter((item) => item.name !== place.name)].slice(0, MAX_RECENT);

  }

  close() {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
  }

  onInput() {
    clearTimeout(this.timer);
    this.request?.abort();
    const text = this.input.value.trim();
    if (!text) {
      this.showSuggestions();
      return;
    }
    const coordinates = parseCoordinates(text);
    if (coordinates) {
      this.render([{ title: null, places: [coordinates] }]);
      return;
    }
    if (text.length < 2) {
      this.close();
      return;
    }
    this.timer = setTimeout(() => this.search(text), WAIT_MS);
  }

  showSuggestions() {
    const sections = [];
    if (this.saved.length) sections.push({ title: 'Saved', places: this.saved });
    if (this.recent.length) sections.push({ title: 'Recent', places: this.recent });
    if (sections.length) this.render(sections);
    else this.close();
  }

  async search(text) {
    const request = new AbortController();
    this.request = request;
    try {
      const params = new URLSearchParams({ q: text, count: '8' });
      const response = await fetch(`${GEOCODER}?${params}`, { signal: AbortSignal.any ? AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]) : request.signal });
      if (!response.ok) throw new Error(`Search returned ${response.status}`);
      const { results } = await response.json();
      if (this.request !== request) return;
      const places = (results || []).map(p => ({lat: p.lat, lng: p.lon, name: p.name, detail: [p.admin1, p.country].filter(Boolean).join(', ')}));
      this.render([{ title: null, places, empty: `No places found for "${text}".` }]);
    } catch {
      if (this.request === request && !request.signal.aborted) {
        this.render([{ title: null, places: [], empty: "Search isn't responding. You can type coordinates instead, like 19.07, 72.87." }]);
      }
    }
  }

  render(sections) {
    const nodes = sections.flatMap(({ title, places, empty }) => [
      title ? el('li', { class: 'place-title', text: title }) : null,
      ...(places.length === 0 && empty ? [el('li', { class: 'place-empty', text: empty })] : []),
      ...places.map((place) => el('li', {},
        el('button', {
          type: 'button',
          class: 'place-option',
          onClick: () => this.pick(place),
        }, el('span', { class: 'place-name', text: place.name }), place.detail ? el('span', { class: 'place-detail', text: place.detail }) : null),
      )),
    ].filter(Boolean));
    this.list.replaceChildren(...nodes);
    this.list.hidden = nodes.length === 0;
    this.input.setAttribute('aria-expanded', String(nodes.length > 0));
  }

  pick(place) {
    this.input.value = '';
    this.close();
    this.remember(place);
    this.onPick(place);
  }
}
