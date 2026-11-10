// Fixed-window in-memory limiter. One process, no dependencies; counters are lost on restart.
function createLimiter({ windowMs, max }) {
  const entries = new Map();

  function purge(now) {
    for (const [key, e] of entries) {
      if (now - e.start >= windowMs) entries.delete(key);
    }
  }

  function state(key, now) {
    const e = entries.get(key);
    if (!e || now - e.start >= windowMs) return null;
    return e;
  }

  // `window` identifies the window a verdict was taken in, so a refund can tell whether it is still open.
  function verdict(e, now) {
    if (!e || e.count < max) return { allowed: true, retryInMs: 0, window: e ? e.start : null };
    return { allowed: false, retryInMs: Math.max(1, e.start + windowMs - now), window: e.start };
  }

  return {
    hit(key, now = Date.now()) {
      purge(now);
      let e = state(key, now);
      if (!e) {
        e = { start: now, count: 0 };
        entries.set(key, e);
      }
      const v = verdict(e, now);
      if (v.allowed) e.count += 1;
      return v;
    },
    peek(key, now = Date.now()) {
      return verdict(state(key, now), now);
    },
    // Gives back one slot taken by hit(): the caller reserves first and refunds what turned out not to count.
    // With `window` (the hit's own), a refund arriving after that window closed changes nothing.
    refund(key, now = Date.now(), window) {
      const e = state(key, now);
      if (!e || e.count <= 0) return;
      if (window !== undefined && e.start !== window) return;
      e.count -= 1;
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

module.exports = { createLimiter };
