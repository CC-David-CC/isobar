// Convert the shared WebOS point forecast to Isobar's chart units and intervals.
import { formatCoordinates, formatWeekday } from './format.js';

const HOUR = 3_600_000;
const SUMMARY = { partly: 'Partly cloudy', 'heavy-rain': 'Heavy rain', thunder: 'Thunderstorms' };

export function forecastFromSnapshot(snapshot, lat, lng, now = Date.now()) {
  if (!['nws', 'met-no'].includes(snapshot.provider)) throw new Error('Unknown forecast source');
  const timeZone = snapshot.timezone || 'UTC';
  const hours = snapshot.hourly.map(hour => {
    const start = Date.parse(hour.time);
    return {
      start, end: start + HOUR, tempC: hour.temperature,
      rainPercent: hour.precipitationProbability ?? null,
      windMs: Number.isFinite(hour.windSpeed) ? hour.windSpeed / 3.6 : null,
      windFromDegrees: hour.windDirection ?? null, isDay: hour.isDay,
      summary: hour.summary || SUMMARY[hour.kind] || hour.kind || 'Conditions unavailable',
    };
  }).filter(hour => Number.isFinite(hour.tempC) && hour.end > now && hour.start < now + 48 * HOUR);
  const days = snapshot.daily.filter(day => day.source !== 'climate').slice(0,7).map(day => ({
    label: formatWeekday(Date.parse(day.date + 'T12:00:00Z'), {timeZone: 'UTC'}),
    summary: day.summary || SUMMARY[day.kind] || day.kind || 'Conditions unavailable',
    highC: day.max ?? null, lowC: day.min ?? null,
  }));
  return {source: snapshot.provider, place: snapshot.place?.name || formatCoordinates(lat, lng),
    hours, days, timeZone, stale: snapshot.freshness?.stale === true,
    issuedAt: Date.parse(snapshot.forecastIssuedAt) || null, fetchedAt: Date.parse(snapshot.fetchedAt) || null,
    alerts: activeAlerts(snapshot, now)};
}

export function activeAlerts(snapshot, now) {
  if (snapshot.alertStatus === 'outside-coverage') return {state: 'notCovered', alerts: []};
  const validUntil = Date.parse(snapshot.alertsValidUntil);
  if (snapshot.alertStatus !== 'current' || !Array.isArray(snapshot.alerts) || snapshot.freshness?.stale ||
      !Number.isFinite(validUntil) || validUntil <= now) {
    return {state: 'failed', alerts: []};
  }
  const alerts = snapshot.alerts.map(a => ({...a, event: a.event || a.headline,
    severity: a.severity || 'Unknown', until: Date.parse(a.expires)})).filter(a => a.until > now);
  return {state: 'ready', alerts, validUntil};
}

export async function loadForecast(lat, lng, {signal, fetchImpl = fetch} = {}) {
  const query = new URLSearchParams({lat: lat.toFixed(2), lon: lng.toFixed(2)});
  const timeout = AbortSignal.timeout(25_000);
  const response = await fetchImpl('/services/weather/weather?' + query, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: {Accept: 'application/json'},
  });
  if (!response.ok) throw new Error('Weather service returned ' + response.status);
  return forecastFromSnapshot(await response.json(), lat, lng);
}
