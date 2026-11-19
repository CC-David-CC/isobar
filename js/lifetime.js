// One app instance owns its resources. Disposing is idempotent, including during startup.
export class Lifetime {
  controller = new AbortController();
  cleanups = [];
  get signal() { return this.controller.signal; }
  get disposed() { return this.signal.aborted; }
  add(cleanup) {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
    return cleanup;
  }
  dispose() {
    if (this.disposed) return;
    this.controller.abort();
    const errors = [];
    for (const cleanup of this.cleanups.reverse()) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    this.cleanups.length = 0;
    // Finish every cleanup even if a third-party layer's teardown fails.
    if (errors.length) console.error('Isobar cleanup failed', new AggregateError(errors));
  }
}

export function requestSignal(map, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return map?.isobarSignal ? AbortSignal.any([map.isobarSignal, timeout]) : timeout;
}
