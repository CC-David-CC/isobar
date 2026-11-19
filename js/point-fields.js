// Point-detail tabs share the window's existing GRIB range reader and bounded field cache.
import { fieldById } from './catalog/fields.js';
import { PRODUCTS } from './sources.js';
import { sampleGrid } from './grid-math.js';
import { formatValue } from './units.js';
import { el } from './dom.js';

const sections = {
  weather: ['feels', 'dew', 'rh', 'cloudtop'],
  soil: ['soilt0-10', 'soil0-10', 'soilt10-40', 'soil10-40'],
  air: ['pm25', 'aod', 'dustpm', 'saltpm'],
  sea: ['waveheight', 'waveperiod', 'sst', 'seatemp'],
};

export async function pointFields(tab, lat, lng, {service, model, time, signal}) {
  const inputs = tab === 'models' ? ['gfs','ecmwf','aifs'].map(m => ['t2m', m])
    : sections[tab].map(id => [id, model]);
  const rows = [];
  for (const [id, selected] of inputs) {
    signal.throwIfAborted();
    const entry = fieldById(id);
    const label = tab === 'models' ? PRODUCTS[selected].label : entry.name;
    try {
      const {grid, validTime, product} = await service.load(id, selected, time);
      const value = sampleGrid(grid, grid.values, lat, lng);
      rows.push({label, value, unit: entry.unit, validTime, source: PRODUCTS[product].label});
    } catch (error) {
      signal.throwIfAborted();
      rows.push({label, value: null});
    }
  }
  return rows;
}

export function renderPointFields(box, rows, system) {
  const body = rows.map(row => el('tr', {}, el('th', {scope: 'row', text: row.label}),
    el('td', {text: Number.isFinite(row.value) ? formatValue(row.value, row.unit, system) : 'Unavailable'}),
    el('td', {text: row.validTime ? row.source + ' · ' + new Date(row.validTime).toISOString().slice(0,16).replace('T',' ') + ' UTC' : ''})));
  box.replaceChildren(el('table', {class: 'reading-table'}, el('tbody', {}, ...body)));
}
