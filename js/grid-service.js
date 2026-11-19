// The page's way to ask for forecast data. Owns the data worker, remembers recent results, and
// shares a download when two layers want the same field.
const CACHE_SIZE = 12;
const TIMEOUT_MS = 180_000;
const HOUR = 3_600_000;

export class GridService {
  constructor() {
    this.worker = null;
    this.disposed = false;
    this.waiting = new Map();
    this.cache = new Map();
    this.inFlight = new Map();
    this.nextId = 1;
  }

  ensureWorker() {
    if (this.disposed) throw new DOMException('App closed', 'AbortError');
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./grid-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = this.waiting.get(data.id);
      if (!job) return;
      this.waiting.delete(data.id);
      clearTimeout(job.timer);
      if (data.ok) job.resolve(data);
      else job.reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      this.failAll(new Error(event.message || 'Data worker failed'));
    };
    this.worker = worker;
    return worker;
  }

  failAll(error) {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.waiting.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.waiting.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new DOMException('App closed', 'AbortError'));
    this.cache.clear();
    this.inFlight.clear();
  }

  // time is when the map should show, in ms. Results for the same hour are shared.
  load(fieldId, model, time, thin = 1) {
    if (this.disposed) return Promise.reject(new DOMException('App closed', 'AbortError'));
    const hour = Math.round(time / HOUR) * HOUR;
    const key = `${fieldId}|${model}|${hour}|${thin}`;
    if (this.cache.has(key)) {
      const result = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, result);
      return Promise.resolve(result);
    }
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const promise = new Promise((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error('Data download timed out'));
      }, TIMEOUT_MS);
      this.waiting.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, fieldId, model, time: hour, thin }); }
      catch (error) {
        clearTimeout(timer);
        this.waiting.delete(id);
        reject(error);
      }
    }).then((result) => {
      if (this.disposed) throw new DOMException('App closed', 'AbortError');
      this.cache.set(key, result);
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value);
      return result;
    }).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }
}
