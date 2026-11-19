// The chart-paper strip that opens when someone picks a spot on the map.
import { el } from './dom.js';
import { loadForecast } from './webos-forecast.js';
import { formatClock, formatCoordinates } from './format.js';
import { drawMeteogram } from './meteogram.js';
import { pointFields, renderPointFields } from './point-fields.js';
import { describeWind, fullTemp, shortTemp } from './units.js';


export class ForecastStrip {
  constructor(root, { surface, getSystem, getMapValue, fieldContext, onOpened, onClosed, isSaved, onToggleSaved }) {
    const scope = root.getRootNode();
    const byId = (id) => scope.getElementById(id);
    this.surface = surface;
    Object.assign(this, { root, getSystem, getMapValue, fieldContext, onOpened, onClosed, isSaved, onToggleSaved });
    this.tab = 'forecast';
    this.tabData = new Map();
    this.mapValue = byId('strip-map-value');
    this.saveButton = byId('strip-save');
    this.copyButton = byId('strip-copy');
    this.tabPanel = byId('strip-tab-panel');
    this.forecastPanel = byId('strip-forecast');
    this.tabButtons = [...root.querySelectorAll('[data-tab]')];
    for (const button of this.tabButtons) button.addEventListener('click', () => this.setTab(button.dataset.tab));
    this.saveButton.addEventListener('click', () => {
      this.onToggleSaved(this.placeInfo());
      this.renderTools();
    });
    this.copyButton.addEventListener('click', () => this.copyCoordinates());
    this.point = null;
    this.forecast = { state: 'idle' };
    this.alerts = { state: 'idle' };
    this.place = byId('strip-place');
    this.now = byId('strip-now');
    this.alertsBox = byId('strip-alerts');
    this.chart = byId('strip-chart');
    this.key = byId('chart-key');
    this.readout = byId('chart-readout');
    this.days = byId('strip-days');
    this.source = byId('strip-source');
    byId('strip-close').addEventListener('click', () => this.close());

    this.observer = new ResizeObserver(() => {
      if (this.disposed) return;
      this.publishHeight();
      this.drawChart();
    });
    this.observer.observe(this.root);
  }

  // The map's own controls sit above the strip, so the page needs to know how tall it is.
  publishHeight() {
    const height = this.root.hidden ? 0 : this.root.offsetHeight;
    this.surface.style.setProperty('--strip-height', `${height}px`);
    this.surface.classList.toggle('strip-open', height > 0);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  placeInfo() {
    const { lat, lng, name } = this.point;
    const { state, data } = this.forecast;
    return { lat, lng, name: name ?? (state === 'ready' ? data.place : formatCoordinates(lat, lng)) };
  }

  renderTools() {
    const saved = this.isSaved(this.point);
    this.saveButton.textContent = saved ? 'Remove from saved' : 'Save place';
    const value = this.getMapValue(this.point.lat, this.point.lng);
    this.mapValue.textContent = value ?? '';
    this.mapValue.hidden = !value;
  }

  async copyCoordinates() {
    const { lat, lng } = this.point;
    const text = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
      await navigator.clipboard.writeText(text);
      if (this.disposed) return;
      this.copyButton.textContent = 'Copied';
    } catch {
      this.copyButton.textContent = text;
    }
    if (this.disposed) return;
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => { this.copyButton.textContent = 'Copy coordinates'; }, 2500);
  }

  setTab(tab) {
    this.tab = tab;
    for (const button of this.tabButtons) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    this.forecastPanel.hidden = tab !== 'forecast';
    this.tabPanel.hidden = tab === 'forecast';
    if (tab === 'forecast') {
      this.drawChart();
      return;
    }
    this.loadTab(tab);
  }

  async loadTab(tab) {
    const point = this.point;
    const signal = this.request.signal;
    const fields = this.fieldContext();
    const key = [tab, fields.model, Math.round(fields.time / 3600000)].join('|');
    const cached = this.tabData.get(key);
    if (cached) {
      this.renderTab(tab, cached);
      return;
    }
    this.tabPanel.replaceChildren(el('p', { class: 'alerts-note', text: 'Loading' }));
    try {
      const data = await pointFields(tab, point.lat, point.lng, {...fields, signal});
      if (this.point !== point) return;
      if (this.tabData.size > 12) this.tabData.clear();
      this.tabData.set(key, data);
      if (this.tab === tab) this.renderTab(tab, data);
    } catch {
      if (this.point !== point || signal.aborted || this.tab !== tab) return;
      this.tabPanel.replaceChildren(
        el('p', { class: 'alerts-note alerts-failed' }, "This data didn't load. ",
          el('button', { type: 'button', class: 'text-button', text: 'Try again', onClick: () => this.loadTab(tab) })),
      );
    }
  }

  renderTab(tab, data) {
    renderPointFields(this.tabPanel, data, this.getSystem());
  }

  async open({ lat, lng, name }) {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.point = { lat, lng, name };
    this.tabData.clear();
    this.forecast = { state: 'loading' };
    this.alerts = { state: 'loading' };
    const wasOpen = this.isOpen;
    this.root.hidden = false;
    if (!wasOpen) this.root.classList.add('rising');
    this.setTab(this.tab);
    this.render();
    this.root.focus({ preventScroll: true });
    this.root.scrollTop = 0;
    this.onOpened?.();

    // Picking another spot cancels this request, and its late answers must not overwrite the new one.
    const { signal } = request;
    const whenCurrent = (apply) => (value) => {
      if (this.request !== request) return;
      apply(value);
      this.render();
      this.onOpened?.();
    };
    await loadForecast(lat, lng, {signal}).then(
      whenCurrent(data => {
        this.forecast = {state: 'ready', data};
        this.alerts = data.alerts;
      }),
      whenCurrent(() => {
        this.forecast = {state: 'failed'};
        this.alerts = {state: 'failed', alerts: []};
      }),
    );
  }

  close() {
    this.request?.abort();
    this.request = null;
    this.root.hidden = true;
    this.root.classList.remove('rising');
    this.publishHeight();
    this.onClosed?.();
  }

  dispose() {
    this.disposed = true;
    this.request?.abort();
    this.request = null;
    this.point = null;
    this.observer.disconnect();
    clearTimeout(this.copyTimer);
    this.tabData.clear();
  }

  // Called when the temperature and speed units change.
  refresh() {
    if (!this.isOpen) return;
    this.render();
    if (this.tab !== 'forecast') this.loadTab(this.tab);
  }

  render() {
    this.renderHead();
    this.renderTools();
    this.renderAlerts();
    this.renderDays();
    this.renderSource();
    this.drawChart();
  }

  renderHead() {
    const { lat, lng } = this.point;
    const { state, data } = this.forecast;
    const system = this.getSystem();
    this.place.textContent = this.point.name ?? (data && state === 'ready' ? data.place : formatCoordinates(lat, lng));
    if (state === 'loading') {
      this.now.replaceChildren('Loading forecast');
    } else if (state === 'failed') {
      this.now.replaceChildren(
        "This forecast didn't load. ",
        el('button', { type: 'button', class: 'text-button', text: 'Try again', onClick: () => this.open(this.point) }),
      );
    } else if (data.hours.length > 0) {
      const hour = data.hours[0];
      this.now.replaceChildren(`This hour: ${fullTemp(hour.tempC, system)}, ${hour.summary.toLowerCase()}. ${describeWind(hour.windMs, hour.windFromDegrees, system)}.`);
    } else {
      this.now.replaceChildren('No hourly forecast is available for this spot.');
    }
  }

  renderAlerts() {
    const {state} = this.alerts;
    const alerts = this.alerts.alerts?.filter(a => a.until > Date.now());
    const box = this.alertsBox;
    const timeZone = this.forecast.data?.timeZone;
    const quiet = (text) => box.replaceChildren(el('p', { class: 'alerts-note', text }));
    if (state === 'loading') {
      quiet('Checking alerts');
    } else if (state === 'failed' || this.alerts.validUntil <= Date.now()) {
      box.replaceChildren(el('p', { class: 'alerts-note alerts-failed' },
        "Couldn't check alerts for this spot. ",
        el('a', { href: 'https://www.weather.gov/', target: '_blank', rel: 'noopener', text: 'See weather.gov' }),
        ' for official warnings.',
      ));
    } else if (state === 'notCovered') {
      quiet('Official alerts cover the US and nearby waters only.');
    } else if (alerts.length === 0) {
      quiet('No active warnings in the last NWS update.');
    } else {
      box.replaceChildren(el('ul', { class: 'alert-list' }, ...alerts.map((alert) => el('li', {},
        el('details', { class: `alert alert-${alert.severity.toLowerCase()}` },
          el('summary', {},
            el('strong', { text: alert.event }),
            alert.until ? ` until ${formatClock(alert.until, { timeZone })}` : null,
          ),
          alert.description ? el('p', { class: 'alert-text', text: alert.description }) : null,
          alert.instruction ? el('p', { class: 'alert-text', text: alert.instruction }) : null,
          alert.area ? el('p', { class: 'alert-area', text: `Area: ${alert.area}` }) : null,
        ),
      ))));
    }
  }

  renderDays() {
    const { state, data } = this.forecast;
    const system = this.getSystem();
    if (state !== 'ready') {
      this.days.replaceChildren();
      return;
    }
    const temps = (day) => [
      day.highC === null ? '' : shortTemp(day.highC, system),
      day.lowC === null ? '' : shortTemp(day.lowC, system),
    ].filter(Boolean).join(' / ');
    this.days.replaceChildren(...data.days.map((day) => el('li', { class: 'day' },
      el('span', { class: 'day-name', text: day.label }),
      el('span', { class: 'day-summary', text: day.summary }),
      el('span', { class: 'day-temps', text: temps(day) }),
    )));
  }

  renderSource() {
    const { state, data } = this.forecast;
    if (state !== 'ready') {
      this.source.replaceChildren();
      return;
    }
    const nws = data.source === 'nws';
    const date = data.issuedAt || data.fetchedAt;
    const time = date ? new Date(date).toLocaleString(undefined, {timeZone: data.timeZone, timeZoneName: 'short'}) : null;
    this.source.replaceChildren(
      data.stale ? 'Last-known forecast · ' : '',
      el('a', {href: nws ? 'https://www.weather.gov/' : 'https://api.met.no/', target: '_blank',
        rel: 'noopener', text: nws ? 'National Weather Service' : 'MET Norway · CC BY 4.0'}),
      time ? (data.issuedAt ? ' · Issued ' : ' · Retrieved ') + time : '',
    );
  }

  drawChart() {
    if (!this.isOpen || this.tab !== 'forecast') return;
    const { state, data } = this.forecast;
    this.showReadout(null);
    if (state !== 'ready' || data.hours.length === 0) {
      this.chart.replaceChildren();
      this.key.hidden = true;
      return;
    }
    this.key.hidden = false;
    drawMeteogram(this.chart, data.hours, {
      system: this.getSystem(),
      timeZone: data.timeZone,
      onHover: (hour) => this.showReadout(hour),
    });
  }

  showReadout(hour) {
    if (!hour) {
      this.readout.hidden = true;
      this.key.classList.remove('is-covered');
      return;
    }
    const system = this.getSystem();
    const { timeZone } = this.forecast.data;
    this.readout.hidden = false;
    this.key.classList.add('is-covered');
    const rain = hour.rainPercent == null ? 'Precipitation probability unavailable' : hour.rainPercent + '% chance of rain or snow';
    this.readout.textContent = `${formatClock(hour.start, { timeZone })}: ${fullTemp(hour.tempC, system)}, ${rain}. ${describeWind(hour.windMs, hour.windFromDegrees, system)}. ${hour.summary}.`;
  }
}
