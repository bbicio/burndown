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

  function verdict(e, now) {
    if (!e || e.count < max) return { allowed: true, retryInMs: 0 };
    return { allowed: false, retryInMs: Math.max(1, e.start + windowMs - now) };
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
    refund(key, now = Date.now()) {
      const e = state(key, now);
      if (e && e.count > 0) e.count -= 1;
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
