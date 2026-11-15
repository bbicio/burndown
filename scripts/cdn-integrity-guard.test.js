// Guard: every library loaded from a CDN is pinned to an exact version and
// carries Subresource Integrity.
//
// WHY THIS FILE EXISTS. The 2026-11-15 security review (S-09, cycle 4) found
// Vue loaded as `vue@3` -- whatever 3.x the CDN served that day -- and no CDN
// tag with `integrity`, so a compromised or swapped CDN file would run inside
// the app with the user's session. Same shape as the other guards: the rule
// lives in a test, not in prose nobody re-reads.
//
// THE RULES. In the root *.html pages and js/**/*.js (tests excluded):
//   * every <script> or <link> tag pointing at a CDN host carries
//     integrity="sha384-..." and crossorigin="anonymous" -- any <link>, not
//     only rel="stylesheet": stricter than the spec on purpose, no other kind
//     exists today;
//   * every CDN URL pins an exact x.y.z version (`vue@3/`, `@latest`, ranges
//     are red);
//   * a CDN URL outside a tag (help.html's lazy Mermaid loader) must sit on a
//     line that also holds `integrity: 'sha384-` -- one form,
//     `const X = { src: '...', integrity: 'sha384-...' };`, no heuristics;
//   * the same URL has the same hash everywhere.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why -- named limits, not gaps:
//   * WHETHER A HASH IS CORRECT. The guard downloads nothing; a wrong hash
//     shows only in the browser (resource blocked, integrity error in the
//     console). The manual check of the cycle that changes a URL covers it.
//   * Hosts outside CDN_HOSTS. A library from a new CDN is invisible here
//     until its host is added to the list.
//   * Whether the CDN sends CORS headers, without which `crossorigin` +
//     `integrity` block the file. Verified by hand for the four in use.
//   * Files outside the scope above (handbook/, css/, docs/). CSS has no CDN
//     @import today.
//   * Commented-out tags are checked like live ones: fail-closed.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdn.sheetjs.com'];
const HOSTS = CDN_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|');
const URL_RE = new RegExp(`https://(?:${HOSTS})/[^\\s'"\`<>)]+`, 'g');
const TAG_RE = /<(?:script|link)\b[^>]*>/gi;
const EXACT_RE = /^https:\/\/[^/]+\/(?:npm\/)?(?:@[^/]+\/)?[^/@]+[@-]\d+\.\d+\.\d+\//;
const SRI_RE = /^sha384-[A-Za-z0-9+/]+={0,2}$/;

// One finding per CDN URL: { url, inTag, integrity, errors[] }.
function scan(src) {
  const tags = [...src.matchAll(TAG_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  const lines = src.split('\n');
  const out = [];
  for (const m of src.matchAll(URL_RE)) {
    const url = m[0];
    const errors = [];
    if (!EXACT_RE.test(url)) errors.push('no exact x.y.z version');
    const tag = tags.find((t) => m.index >= t.start && m.index < t.end);
    let integrity = null;
    if (tag) {
      integrity = /\bintegrity="([^"]*)"/i.exec(tag.text)?.[1] ?? null;
      if (!integrity || !SRI_RE.test(integrity)) errors.push('tag without sha384 integrity');
      if (!/\bcrossorigin="anonymous"/i.test(tag.text)) errors.push('tag without crossorigin="anonymous"');
    } else {
      const line = lines[src.slice(0, m.index).split('\n').length - 1];
      integrity = /integrity:\s*'([^']*)'/.exec(line)?.[1] ?? null;
      if (!integrity || !SRI_RE.test(integrity)) errors.push("URL outside a tag without integrity: 'sha384-...' on its line");
    }
    out.push({ url, inTag: !!tag, integrity, errors });
  }
  return out;
}

function scopeFiles() {
  const html = readdirSync(ROOT).filter((n) => n.endsWith('.html'));
  const js = readdirSync(join(ROOT, 'js'), { recursive: true })
    .map((n) => String(n).replace(/\\/g, '/'))
    .filter((n) => n.endsWith('.js') && !n.endsWith('.test.js'))
    .map((n) => `js/${n}`);
  return [...html, ...js];
}

const H = 'sha384-' + 'A'.repeat(64);
const V = 'https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js';

describe('scan (synthetic cases)', () => {
  const errs = (s) => scan(s).flatMap((f) => f.errors);

  it('accepts a complete tag', () => {
    expect(errs(`<script defer src="${V}" integrity="${H}" crossorigin="anonymous"></script>`)).toEqual([]);
  });
  it('accepts a tag over several lines with attributes in any order', () => {
    expect(errs(`<link\n  crossorigin="anonymous"\n  href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"\n  integrity="${H}"\n  rel="stylesheet">`)).toEqual([]);
  });
  it('rejects a tag without integrity or crossorigin', () => {
    expect(errs(`<script src="${V}" crossorigin="anonymous"></script>`)).toEqual(['tag without sha384 integrity']);
    expect(errs(`<script src="${V}" integrity="${H}"></script>`)).toEqual(['tag without crossorigin="anonymous"']);
  });
  it('rejects a non-sha384 integrity', () => {
    expect(errs(`<script src="${V}" integrity="sha512-${'A'.repeat(86)}" crossorigin="anonymous"></script>`)).toEqual(['tag without sha384 integrity']);
  });
  it('rejects a URL without an exact version', () => {
    for (const v of ['vue@3', 'vue@latest', 'vue@^3.5.0', 'vue']) {
      expect(errs(`<script src="https://unpkg.com/${v}/dist/vue.global.prod.js" integrity="${H}" crossorigin="anonymous"></script>`), v)
        .toEqual(['no exact x.y.z version']);
    }
  });
  it('accepts the SheetJS and scoped-package version forms', () => {
    expect(scan('<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js">')[0].errors).not.toContain('no exact x.y.z version');
    expect(scan('<script src="https://cdn.jsdelivr.net/npm/@scope/pkg@1.2.3/x.js">')[0].errors).not.toContain('no exact x.y.z version');
  });
  it('accepts a URL outside a tag only with its integrity on the same line', () => {
    const url = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    expect(errs(`const MERMAID = { src: '${url}', integrity: '${H}' };`)).toEqual([]);
    expect(errs(`const MERMAID_URL = '${url}';\nconst SRI = '${H}';`)).toEqual(["URL outside a tag without integrity: 'sha384-...' on its line"]);
  });
  it('ignores hosts outside the list', () => {
    expect(scan('<link rel="icon" href="https://ik.imagekit.io/x/letter-f.png">')).toEqual([]);
  });
});

describe('CDN libraries in the repo', () => {
  const findings = scopeFiles().flatMap((file) => scan(readFileSync(join(ROOT, file), 'utf8')).map((f) => ({ file, ...f })));
  const broken = (kinds) => findings.filter((f) => f.errors.some((e) => kinds.some((k) => e.startsWith(k))))
    .map((f) => `${f.file}: ${f.url} -- ${f.errors.join(', ')}`);

  it('finds the CDN libraries at all', () => {
    expect(findings.length).toBeGreaterThan(0);
  });
  it('every CDN tag carries sha384 integrity and crossorigin anonymous', () => {
    expect(broken(['tag without'])).toEqual([]);
  });
  it('every CDN URL pins an exact x.y.z version', () => {
    expect(broken(['no exact'])).toEqual([]);
  });
  it('a CDN URL outside a tag sits on a line with its integrity', () => {
    expect(broken(['URL outside a tag'])).toEqual([]);
  });
  it('the same URL has the same hash everywhere', () => {
    const byUrl = new Map();
    for (const f of findings.filter((x) => x.integrity)) {
      if (!byUrl.has(f.url)) byUrl.set(f.url, new Set());
      byUrl.get(f.url).add(f.integrity);
    }
    expect([...byUrl].filter(([, s]) => s.size > 1).map(([u, s]) => `${u}: ${[...s].join(' | ')}`)).toEqual([]);
  });
});
