import test from 'node:test';
import assert from 'node:assert/strict';
import {activeAlerts, forecastFromSnapshot} from '../js/webos-forecast.js';

const now = Date.parse('2026-06-07T12:00:00Z');
const time = offset => new Date(now + offset).toISOString();
function snapshot() {
  return {provider: 'nws', place: {name: 'Kent'}, timezone: 'America/New_York',
    fetchedAt: time(0), hourly: [{time: time(0), temperature: 12, windSpeed: 36, summary: 'Light rain'}],
    daily: [{source: 'forecast', date: '2026-06-08', max: 20, min: 12},
      {source: 'climate', date: '2026-06-09', max: 28, min: 10}],
    alertStatus: 'current', alertsValidUntil: time(60_000), freshness: {stale: false},
    alerts: [{headline: 'Expired warning', expires: time(-1000)}, {headline: 'Active warning', expires: time(15_000)}]};
}

test('shared forecast converts wind units, keeps missing probability and excludes climate averages', () => {
  const data = forecastFromSnapshot(snapshot(), 41, -81, now);
  assert.equal(data.hours[0].windMs, 10);
  assert.equal(data.hours[0].tempC, 12);
  assert.equal(data.hours[0].rainPercent, null);
  assert.equal(data.days.length, 1);
  assert.equal(data.hours[0].summary, 'Light rain');
  assert.deepEqual(data.alerts.alerts.map(alert => alert.event), ['Active warning']);
});

test('stale or expired alert feeds and snapshots never supply active warnings', () => {
  for (const overrides of [{freshness: {stale: true}}, {alertsValidUntil: time(-1)}, {alertsValidUntil: null}, {alertStatus: 'unavailable'}]) {
    assert.deepEqual(activeAlerts({...snapshot(), ...overrides}, now), {state: 'failed', alerts: []});
  }
  assert.deepEqual(activeAlerts({...snapshot(), provider: 'met-no', alertStatus: 'outside-coverage'}, now), {state: 'notCovered', alerts: []});
});
