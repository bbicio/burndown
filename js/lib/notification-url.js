// The single browser rule for a notification url: a path on the app, or an absolute http(s) URL on
// `origin` (location.origin); anything else is refused. Server twin: api/src/lib/notification-url.js
// (the two notificationUrl functions must return identical results, pinned by
// js/lib/notification-url-guard.test.js).

const MAX_LENGTH = 2048;
const FORBIDDEN = /[\x00-\x20\x7f\\]/;

// `value` when it is a valid notification url for `origin`, otherwise null (absent included).
export function notificationUrl(value, origin) {
  if (value === null || value === undefined || value === '' || typeof value !== 'string') return null;
  if (value.length > MAX_LENGTH || FORBIDDEN.test(value)) return null;
  if (value[0] === '/') return value[1] === '/' ? null : value;
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return origin && u.origin === origin ? value : null;
  } catch {
    return null;
  }
}

window.notificationUrl = notificationUrl;
