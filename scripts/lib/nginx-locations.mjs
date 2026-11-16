// A model of how nginx picks the `location` block that handles a request URI,
// so scripts/nginx-serve.test.js can check what nginx.conf serves without
// running nginx.
//
// What it models: the `=`, `^~`, `~`, `~*` and plain-prefix modifiers and their
// precedence (an `=` match beats every regex; among regexes the first in file
// order wins); what a block does (serves files, proxies, answers 404, redirects
// with `return 301|302|303|307|308`), whether it carries an `auth_request` directive
// (`auth`, true exactly when `authBy` is not null; `auth_request_set` does not
// count and `auth_request off;` is no auth) and that subrequest's target (`authBy`, or null). What it does not: nested `location` blocks, `if`,
// `alias`, `try_files` resolution, named and `internal` locations (skipped, a
// client cannot select them). A config it cannot read makes it throw rather
// than return a wrong answer.
//
// For scripts/security-headers-guard.test.js it also returns the raw blocks:
// `locationBlocks` (every location, named and `internal` ones included) and
// `serverLevel` (the server block's own directives, which locations inherit).

const HEADER = /\blocation\s+(=|\^~|~\*|~)?\s*(\S+)\s*\{/g;

/**
 * @param {string} confText the text of an nginx.conf
 * @returns {{ modifier: string, pattern: string, action: 'serve'|'404'|'redirect'|'proxy'|'other', auth: boolean, authBy: string|null }[]}
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
      : /\breturn\s+30[12378]\b/.test(body) ? 'redirect'
      : /\bproxy_pass\b/.test(body) ? 'proxy'
      : /\broot\b/.test(body) ? 'serve'
      : 'other';
    // `auth_request off;` switches the subrequest off: that is no auth at all.
    const rawAuth = body.match(/\bauth_request\s+(\S+?)\s*;/)?.[1] ?? null;
    const authBy = rawAuth === 'off' ? null : rawAuth;
    locations.push({ modifier, pattern, action, auth: authBy !== null, authBy });
  }
  return locations;
}

// Every location block, named and `internal` ones included, with its span in the comment-free text.
function blocks(text) {
  const out = [];
  const re = new RegExp(HEADER.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const pattern = m[2];
    const bodyStart = re.lastIndex;
    const bodyEnd = text.indexOf('}', bodyStart);
    if (bodyEnd === -1) throw new Error(`nginx-locations: unterminated location ${pattern}`);
    const body = text.slice(bodyStart, bodyEnd);
    if (body.includes('{')) throw new Error(`nginx-locations: nested block inside location ${pattern}`);
    out.push({ modifier: m[1] ?? '', pattern, body, start: m.index, end: bodyEnd + 1 });
    re.lastIndex = bodyEnd + 1;
  }
  return out;
}

/**
 * @param {string} confText the text of an nginx.conf
 * @returns {{ modifier: string, pattern: string, body: string }[]} every location block, named and `internal` ones
 *   included, in file order; comments removed
 */
export function locationBlocks(confText) {
  return blocks(String(confText).replace(/#[^\n]*/g, '')).map(({ modifier, pattern, body }) => ({ modifier, pattern, body }));
}

/**
 * @param {string} confText the text of an nginx.conf
 * @returns {string} the text of its (only) server block, without comments and without its location
 *   blocks: the directives every location inherits
 */
export function serverLevel(confText) {
  const text = String(confText).replace(/#[^\n]*/g, '');
  const head = /\bserver\s*\{/g;
  const m = head.exec(text);
  if (!m) throw new Error('nginx-locations: no server block');
  if (head.exec(text)) throw new Error('nginx-locations: more than one server block');
  let depth = 1;
  let i = m.index + m[0].length;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
  }
  if (depth > 0) throw new Error('nginx-locations: unterminated server block');
  const inner = text.slice(m.index + m[0].length, i - 1);
  let level = '';
  let last = 0;
  for (const b of blocks(inner)) {
    level += inner.slice(last, b.start);
    last = b.end;
  }
  level += inner.slice(last);
  if (level.includes('{')) throw new Error('nginx-locations: unsupported block at server level');
  return level;
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
