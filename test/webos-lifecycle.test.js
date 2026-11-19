import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GridService } from '../js/grid-service.js';
import { Lifetime, requestSignal } from '../js/lifetime.js';

test('closing one data service cancels its pending work without touching another window', async (t) => {
  const oldWorker = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); this.messages = []; this.terminated = false; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
  };
  t.after(() => { if (oldWorker === undefined) delete globalThis.Worker; else globalThis.Worker = oldWorker; });
  const first = new GridService();
  const second = new GridService();
  t.after(() => { first.dispose(); second.dispose(); });
  const one = first.load('t2m', 'gfs', 0);
  assert.equal(first.load('t2m', 'gfs', 0), one, 'same request shares the worker job');
  const two = second.load('t2m', 'gfs', 0);
  const rejected = assert.rejects(one, { name: 'AbortError' });
  first.dispose();
  first.dispose();
  await rejected;
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, false);
  assert.equal(first.waiting.size, 0);
  assert.equal(first.cache.size, 0);
  await assert.rejects(first.load('wind', 'gfs', 0), { name: 'AbortError' });
  assert.equal(workers.length, 2, 'disposed service cannot recreate a worker');
  const data = { id: workers[1].messages[0].id, ok: true, grid: { values: [] } };
  workers[1].onmessage({ data });
  assert.equal(await two, data);
});

test('worker construction failure does not leave a waiting job or a timeout', async (t) => {
  const oldWorker = globalThis.Worker;
  globalThis.Worker = class { constructor() { throw new Error('Blocked by CSP'); } };
  t.after(() => { if (oldWorker === undefined) delete globalThis.Worker; else globalThis.Worker = oldWorker; });
  const service = new GridService();
  await assert.rejects(service.load('wind', 'gfs', 0), /Blocked by CSP/);
  assert.equal(service.waiting.size, 0);
  assert.equal(service.inFlight.size, 0);
  service.dispose();
});

test('lifetime aborts pending requests and releases owned resources once in reverse order', () => {
  const lifetime = new Lifetime();
  const calls = [];
  const signal = requestSignal({ isobarSignal: lifetime.signal }, 1000);
  lifetime.add(() => calls.push('map'));
  lifetime.add(() => calls.push('layers'));
  lifetime.dispose();
  lifetime.dispose();
  assert.equal(signal.aborted, true);
  assert.deepEqual(calls, ['layers', 'map']);
  lifetime.add(() => calls.push('late resource'));
  assert.deepEqual(calls, ['layers', 'map', 'late resource']);
});
