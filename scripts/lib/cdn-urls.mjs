// The readers of the resources a page loads from another origin, shared by
// scripts/cdn-integrity-guard.test.js (version and SRI of every CDN library)
// and scripts/security-headers-guard.test.js (every origin is in the CSP).
//
// What it reads: <script>, <link> and <img> tags anywhere in the text (a tag
// over several lines, attributes in any order), markdown images, and CDN URLs
// outside a tag -- the lazy loaders -- with the { src, integrity } object they
// sit in and the code that applies it (scripts/lib/js-code.mjs). What it does
// not: resources loaded from CSS (`url()`, `@import`), from
// `fetch`/`XMLHttpRequest`, bound at runtime (a Vue `:src`) or built from
// pieces; a `>` inside an attribute value ends the tag (a false failure, never
// a false pass). Outside a tag, only hosts in CDN_HOSTS are seen.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { jsCode, inlineScripts } from './js-code.mjs';

const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdn.sheetjs.com'];
const HOSTS = CDN_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|');
const URL_RE = new RegExp(`https://(?:${HOSTS})/[^\\s'"\`<>)]+`, 'g');
const TAG_RE = /<(?:script|link)\b[^>]*>/gi;
const EXACT_RE = /^https:\/\/[^/]+\/(?:npm\/)?(?:@[^/]+\/)?[^/@]+[@-]\d+\.\d+\.\d+\//;
const SRI_RE = /^sha384-[A-Za-z0-9+/]+={0,2}$/;
const RESOURCE_TAG_RE = /<(?:script|link|img)\b[^>]*>/gi;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `name` holds the URL's { src, integrity } object: in the code (comments dropped, long strings
// blanked -- scripts/lib/js-code.mjs) its own integrity must be assigned, not compared, or set as an
// attribute, and crossOrigin must be set to anonymous.
function loaderApplies(code, name) {
  if (!name) return false;
  const n = escapeRe(name);
  // attribute names are case-insensitive in HTML; the object name and the property are not
  const anyCase = (s) => [...s].map((ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`).join('');
  const assigned = new RegExp(`\\.integrity\\s*=(?!=)\\s*${n}\\.integrity\\b`).test(code)
    || new RegExp(`setAttribute\\(\\s*['"]${anyCase('integrity')}['"]\\s*,\\s*${n}\\.integrity\\b`).test(code);
  const cross = /\.crossOrigin\s*=(?!=)\s*['"]anonymous['"]/.test(code)
    || new RegExp(`setAttribute\\(\\s*['"]${anyCase('crossorigin')}['"]\\s*,\\s*['"]anonymous['"]`).test(code);
  return assigned && cross;
}

// One finding per CDN URL: { url, inTag, integrity, errors[] }. `html`: read the code of the page's
// inline scripts only, so markup text never reads as code.
export function scanCdnUrls(src, { html = false } = {}) {
  let code = null;
  const codeOf = () => (code ??= (html ? inlineScripts(src) : [src]).map(jsCode).join('\n'));
  const tags = [...src.matchAll(TAG_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  const out = [];
  for (const m of src.matchAll(URL_RE)) {
    const url = m[0];
    const errors = [];
    if (!EXACT_RE.test(url)) errors.push('no exact x.y.z version');
    const tag = tags.find((t) => m.index >= t.start && m.index < t.end);
    let integrity = null;
    if (tag) {
      integrity = attr(tag.text, 'integrity');
      if (!integrity || !SRI_RE.test(integrity)) errors.push('tag without sha384 integrity');
      if ((attr(tag.text, 'crossorigin') ?? '').toLowerCase() !== 'anonymous') errors.push('tag without crossorigin="anonymous"');
    } else {
      // The URL's own object: its name ends the line before the URL, its integrity follows the URL.
      const before = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
      const lineEnd = src.indexOf('\n', m.index);
      const after = src.slice(m.index, lineEnd < 0 ? src.length : lineEnd);
      const name = /(?:^|[^\w$.])([\w$]+)\s*=\s*\{[^{}]*$/.exec(before)?.[1]; // not `cfg.NAME = {`
      integrity = /^[^{}]*?\bintegrity:\s*'([^']*)'/.exec(after)?.[1] ?? null;
      if (!integrity || !SRI_RE.test(integrity)) errors.push("URL outside a tag without integrity: 'sha384-...' on its line");
      if (!loaderApplies(codeOf(), name)) {
        errors.push("URL outside a tag whose loader does not set .integrity = <NAME>.integrity and crossOrigin 'anonymous'");
      }
    }
    out.push({ url, inTag: !!tag, integrity, errors });
  }
  return out;
}

// The value of one attribute of a tag, or null. `(?<![\w-])` so `src` does not match `data-src`.
function attr(tag, name) {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

// A URL as a browser reads it in an http(s) page: leading and trailing spaces dropped, `\` read as `/`.
const normalise = (url) => url.trim().replace(/\\/g, '/');
// A URL on another origin: an `http:`/`https:` scheme (with or without slashes) or protocol-relative `//`.
const EXTERNAL_RE = /^(?:https?:|\/\/)/i;
const isExternal = (url) => EXTERNAL_RE.test(normalise(url));

/**
 * @param {string} url an external URL as written in a page
 * @returns {{ origin: string } | { error: string }} its https origin; plain `http:` and protocol-relative
 *   URLs are refused, since a `https://` CSP source does not admit them from an http page
 */
export function externalOrigin(url) {
  const u = normalise(url);
  if (/^http:/i.test(u)) return { error: 'plain http' };
  if (u.startsWith('//')) return { error: 'protocol-relative URL' };
  try {
    return { origin: new URL(u).origin };
  } catch {
    return { error: 'invalid URL' };
  }
}

// Every <script src>, <link href> and <img src> of the text pointing at another origin, any host:
// { kind: 'script'|'stylesheet'|'icon'|'image'|'other', url } with the URL as written. A <link>'s
// kind comes from its rel tokens.
export function externalResources(src) {
  const out = [];
  for (const m of src.matchAll(RESOURCE_TAG_RE)) {
    const tag = m[0];
    const name = /^<(\w+)/.exec(tag)[1].toLowerCase();
    const url = attr(tag, name === 'link' ? 'href' : 'src');
    if (!url || !isExternal(url)) continue;
    let kind = name === 'img' ? 'image' : 'script';
    if (name === 'link') {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
      kind = rel.includes('stylesheet') ? 'stylesheet' : rel.includes('icon') ? 'icon' : 'other';
    }
    out.push({ kind, url });
  }
  return out;
}

// An image's alt text: brackets nested one level deep are allowed, as in `![a [b]](url)`.
const ALT = String.raw`!\[((?:[^\[\]]|\[[^\[\]]*\])*)\]`;

// The external images of a markdown document, URLs as written: inline `![alt](url)`, reference
// images (`![alt][label]`, `![label][]`, `![label]`) resolved through their `[label]: url`
// definitions, and HTML <img> tags. Images inside code fences are read too (a false failure only).
export function markdownImages(src) {
  const inline = [...src.matchAll(new RegExp(`${ALT}\\(\\s*<?([^\\s)>]+)`, 'g'))].map((m) => m[2]);
  // Labels compare as marked compares them: case-insensitive, inner whitespace collapsed; the first
  // definition of a label wins.
  const norm = (l) => l.trim().toLowerCase().replace(/\s+/g, ' ');
  const defs = new Map();
  for (const m of src.matchAll(/^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/gm)) {
    if (!defs.has(norm(m[1]))) defs.set(norm(m[1]), m[2]);
  }
  // `![alt][label]`, `![label][]`, or `![label]` not followed by `(` (that one is inline).
  const labels = [...src.matchAll(new RegExp(`${ALT}(?:\\[([^\\]]*)\\]|(?!\\())`, 'g'))]
    .map((m) => norm(m[2] || m[1]));
  const refs = labels.filter((l) => defs.has(l)).map((l) => defs.get(l));
  const html = externalResources(src).filter((r) => r.kind === 'image').map((r) => r.url);
  return [...inline, ...refs, ...html].filter(isExternal);
}

// The root *.html pages and js/**/*.js (tests excluded), as paths relative to `root`.
export function scopeFiles(root) {
  const html = readdirSync(root).filter((n) => n.endsWith('.html'));
  const js = readdirSync(join(root, 'js'), { recursive: true })
    .map((n) => String(n).replace(/\\/g, '/'))
    .filter((n) => n.endsWith('.js') && !n.endsWith('.test.js'))
    .map((n) => `js/${n}`);
  return [...html, ...js];
}
