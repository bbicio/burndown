// A model of how nginx picks the `location` block that handles a request URI,
// so scripts/nginx-serve.test.js can check what nginx.conf serves without
// running nginx.
//
// What it models: the `=`, `^~`, `~`, `~*` and plain-prefix modifiers and their
// precedence; what a block does (serves files, proxies, answers 404) and whether
// it carries `auth_request`. What it does not: nested `location` blocks, `if`,
// `alias`, `try_files` resolution, named and `internal` locations (skipped, a
// client cannot select them). A config it cannot read makes it throw rather
// than return a wrong answer.

const HEADER = /\blocation\s+(=|\^~|~\*|~)?\s*(\S+)\s*\{/g;

/**
 * @param {string} confText the text of an nginx.conf
 * @returns {{ modifier: string, pattern: string, action: 'serve'|'404'|'proxy'|'other', auth: boolean }[]}
 *   the client-selectable location blocks, in file order
 */
export function parseLocations(confText) {
  const text = String(confText).replace(/#[^\n]*/g, '');
  const locations = [];
  HEADER.lastIndex = 0;
  let m;
  while ((m = HEADER.exec(text)) !== null) {
    const modifier = m[1] ?? '';
    const pattern = m[2];
    if (/[{}]/.test(pattern)) throw new Error(`nginx-locations: unsupported brace in location pattern ${pattern}`);
    const bodyStart = HEADER.lastIndex;
    const bodyEnd = text.indexOf('}', bodyStart);
    if (bodyEnd === -1) throw new Error(`nginx-locations: unterminated location ${pattern}`);
    const body = text.slice(bodyStart, bodyEnd);
    if (body.includes('{')) throw new Error(`nginx-locations: nested block inside location ${pattern}`);
    HEADER.lastIndex = bodyEnd + 1;

    if (pattern.startsWith('@') || /\binternal\s*;/.test(body)) continue;
    const action = /\breturn\s+404\b/.test(body) ? '404'
      : /\bproxy_pass\b/.test(body) ? 'proxy'
      : /\broot\b/.test(body) ? 'serve'
      : 'other';
    locations.push({ modifier, pattern, action, auth: /\bauth_request\b/.test(body) });
  }
  return locations;
}

/**
 * @param {ReturnType<typeof parseLocations>} locations
 * @param {string} uri a decoded request path, without query string
 * @returns the location nginx would use, or null
 */
export function selectLocation(locations, uri) {
  const exact = locations.find((l) => l.modifier === '=' && l.pattern === uri);
  if (exact) return exact;

  let longest = null;
  for (const l of locations) {
    if ((l.modifier === '' || l.modifier === '^~') && uri.startsWith(l.pattern)
        && (!longest || l.pattern.length > longest.pattern.length)) {
      longest = l;
    }
  }
  if (longest?.modifier === '^~') return longest;

  const regex = locations.find((l) => (l.modifier === '~' || l.modifier === '~*')
    && new RegExp(l.pattern, l.modifier === '~*' ? 'i' : '').test(uri));
  return regex ?? longest;
}
