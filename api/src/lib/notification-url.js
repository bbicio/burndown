// Server twin of js/lib/notification-url.js (the two notificationUrl functions must return identical
// results, pinned by js/lib/notification-url-guard.test.js). A notification url is either a path on
// the app or an absolute http(s) URL on the app's own origin; anything else is refused.

const URL_RULE = 'URL_RULE';
const URL_RULE_MESSAGE = 'url must be an app path or an absolute URL on the app origin';
const MAX_LENGTH = 2048;
const FORBIDDEN = /[\u0000- \u007f\\]/;

function isAbsent(value) {
  return value === null || value === undefined || value === '';
}

// `value` when it is a valid notification url for `origin`, otherwise null (absent included).
function notificationUrl(value, origin) {
  if (isAbsent(value) || typeof value !== 'string') return null;
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

function appOrigin(appUrl) {
  try {
    return new URL(appUrl || 'http://localhost').origin;
  } catch {
    return null;
  }
}

// The 400 message for a refused url, null when the url is absent or valid.
function notificationUrlError(value, appUrl) {
  if (isAbsent(value)) return null;
  return notificationUrl(value, appOrigin(appUrl)) === null ? URL_RULE_MESSAGE : null;
}

// The absolute link a notification email carries, or null when there is none to give.
function notificationLink(value, appUrl) {
  const origin = appOrigin(appUrl);
  const valid = notificationUrl(value, origin);
  if (valid === null || origin === null) return null;
  return valid[0] === '/' ? origin + valid : valid;
}

module.exports = { URL_RULE, URL_RULE_MESSAGE, notificationUrl, notificationUrlError, notificationLink };
