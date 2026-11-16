// Readers of the response headers an nginx.conf sets, for
// scripts/security-headers-guard.test.js.
//
// What it reads: `add_header NAME VALUE [always];` with the value in double
// quotes, single quotes or bare, and a CSP value split into its directives.
// What it does not: variables inside a value (read as text), `more_set_headers`
// or any module other than ngx_http_headers_module. Pass it text without
// comments (scripts/lib/nginx-locations.mjs's serverLevel/locationBlocks).

const ADD_HEADER = /\badd_header\s+(\S+)\s+(?:"([^"]*)"|'([^']*)'|([^\s;"']+))(\s+always)?\s*;/g;

/**
 * @param {string} text nginx config text, comments already removed
 * @returns {{ name: string, value: string, always: boolean }[]} in file order
 */
export function addHeaders(text) {
  return [...String(text).matchAll(ADD_HEADER)].map((m) => ({
    name: m[1],
    value: m[2] ?? m[3] ?? m[4],
    always: !!m[5],
  }));
}

/**
 * @param {string} value a Content-Security-Policy header value
 * @returns {Map<string, string[]>} directive (lower case) → sources in the order written
 */
export function parseCsp(value) {
  const csp = new Map();
  for (const part of String(value).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) csp.set(name.toLowerCase(), sources);
  }
  return csp;
}

// Directives a browser applies before script-src/style-src; the guard reads only those two.
const SHADOWING = ['script-src-elem', 'script-src-attr', 'style-src-elem', 'style-src-attr'];

/**
 * @param {Map<string, string[]>} csp from parseCsp
 * @returns {string[]} one message per source that empties the script/style allowlist, and per
 *   directive that would override it unseen; empty when there is none
 */
export function cspSourceProblems(csp) {
  const out = [];
  for (const d of ['script-src', 'style-src']) {
    for (const s of csp.get(d) ?? []) {
      if (s.includes('*') || ['https:', 'http:'].includes(s.toLowerCase())) out.push(`${d}: wildcard source ${s}`);
    }
  }
  for (const s of csp.get('script-src') ?? []) {
    if (['data:', 'blob:', 'filesystem:'].includes(s.toLowerCase())) out.push(`script-src: scheme source ${s}`);
  }
  for (const d of SHADOWING) if (csp.has(d)) out.push(`${d}: not read by the guard, would override its parent directive`);
  return out;
}
