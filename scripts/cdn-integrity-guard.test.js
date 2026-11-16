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
//     `X = { src: '...', integrity: 'sha384-...' }` (with or without
//     const/let/var), each URL tied to its own object -- and the file's code
//     must assign `.integrity = X.integrity` (or
//     `setAttribute('integrity', X.integrity)`) and crossOrigin `anonymous`.
//     "Code" is what scripts/lib/js-code.mjs keeps: comments dropped, long
//     strings blanked, and in a page only its inline scripts; its own header
//     names where that tokeniser can be wrong. That both assignments reach the
//     element loading X.src is not checked, and crossOrigin is checked once
//     per file, not per URL;
//   * the same URL has the same hash everywhere.
//
// WHAT IS DELIBERATELY NOT CHECKED, and why -- named limits, not gaps:
//   * WHETHER A HASH IS CORRECT. The guard downloads nothing; a wrong hash
//     shows only in the browser (resource blocked, integrity error in the
//     console). The manual check of the cycle that changes a URL covers it.
//   * Hosts outside CDN_HOSTS (in scripts/lib/cdn-urls.mjs). A library from a
//     new CDN is invisible here until its host is added to that list.
//   * Whether the CDN sends CORS headers, without which `crossorigin` +
//     `integrity` block the file. Verified by hand for every host in
//     CDN_HOSTS when this guard was written.
//   * Files outside the scope above (handbook/, css/, docs/). CSS has no CDN
//     @import today.
//   * Commented-out tags are checked like live ones: fail-closed.
//
// The reading (tags, lazy loaders, the files in scope) lives in
// scripts/lib/cdn-urls.mjs, shared with scripts/security-headers-guard.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanCdnUrls as scan, scopeFiles as scopeOf } from './lib/cdn-urls.mjs';

const ROOT = process.cwd();
const scopeFiles = () => scopeOf(ROOT);

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
  it('does not read data-integrity or data-crossorigin as the real attributes', () => {
    expect(errs(`<script src="${V}" data-integrity="${H}" data-crossorigin="anonymous"></script>`))
      .toEqual(['tag without sha384 integrity', 'tag without crossorigin="anonymous"']);
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
  const LOADER = "\ns.integrity = MERMAID.integrity;\ns.crossOrigin = 'anonymous';";
  it('accepts a URL outside a tag only with its integrity on the same line', () => {
    const url = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    expect(errs(`const MERMAID = { src: '${url}', integrity: '${H}' };${LOADER}`)).toEqual([]);
    expect(errs(`const MERMAID_URL = '${url}';\nconst SRI = '${H}';${LOADER}`)).toEqual([
      "URL outside a tag without integrity: 'sha384-...' on its line",
      "URL outside a tag whose loader does not set .integrity = <NAME>.integrity and crossOrigin 'anonymous'",
    ]);
  });
  it('rejects a URL outside a tag whose file never applies integrity and crossOrigin', () => {
    const url = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    const decl = `const MERMAID = { src: '${url}', integrity: '${H}' };`;
    const MISSING = "URL outside a tag whose loader does not set .integrity = <NAME>.integrity and crossOrigin 'anonymous'";
    expect(errs(decl)).toEqual([MISSING]);
    expect(errs(`${decl}\ns.integrity = MERMAID.integrity;`)).toEqual([MISSING]);
    expect(errs(`${decl}\ns.crossOrigin = 'anonymous';`)).toEqual([MISSING]);
    // a comparison is not an assignment
    expect(errs(`${decl}\nif (s.integrity === MERMAID.integrity) {}\ns.crossOrigin = 'anonymous';`)).toEqual([MISSING]);
    // a commented-out loader does not count
    expect(errs(`${decl}\n// s.integrity = MERMAID.integrity;\n/* s.crossOrigin = 'anonymous'; */`)).toEqual([MISSING]);
    // the integrity applied must be this URL's own
    const other = `const OTHER = { src: 'https://cdn.jsdelivr.net/npm/foo@1.2.3/foo.js', integrity: '${H}' };`;
    expect(scan(`${decl}\n${other}${LOADER}`).map((f) => f.errors)).toEqual([[], [MISSING]]);
  });
  it('ties each URL to its own object when two share a line', () => {
    const u1 = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    const u2 = 'https://cdn.jsdelivr.net/npm/foo@1.2.3/foo.js';
    const H2 = 'sha384-' + 'B'.repeat(64);
    const found = scan(`const MERMAID = { src: '${u1}', integrity: '${H}' }; const OTHER = { src: '${u2}', integrity: '${H2}' };${LOADER}`);
    expect(found.map((f) => f.integrity)).toEqual([H, H2]);
    expect(found.map((f) => f.errors.length)).toEqual([0, 1]);
  });
  it('does not count a loader commented out after any character, or quoted in a string', () => {
    const decl = `const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: '${H}' };`;
    expect(errs(`${decl}\nload(s)// s.integrity = MERMAID.integrity;\nload(s)// s.crossOrigin = 'anonymous';`)).toHaveLength(1);
    expect(errs(`${decl}\nconst help = "s.integrity = MERMAID.integrity; s.crossOrigin = 'anonymous'";`)).toHaveLength(1);
  });
  it('keeps code after a /* inside a string', () => {
    const decl = `const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: '${H}' };`;
    expect(errs(`${decl}\nconst g = 'src/*';${LOADER}\nconst e = '*/';`)).toEqual([]);
  });
  it('accepts $ names, a plain assignment, and any case in setAttribute names', () => {
    const u = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    expect(errs(`$m = { src: '${u}', integrity: '${H}' };\ns.integrity = $m.integrity;\ns.crossOrigin = 'anonymous';`)).toEqual([]);
    expect(errs(`const M = { src: '${u}', integrity: '${H}' };\ns.setAttribute('Integrity', M.integrity);\ns.setAttribute('crossOrigin', 'anonymous');`)).toEqual([]);
  });
  it('matches the object name exactly, case included, and not as a property', () => {
    const u = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    const decl = `const MERMAID = { src: '${u}', integrity: '${H}' };`;
    expect(errs(`${decl}\ns.setAttribute('integrity', mermaid.integrity);\ns.crossOrigin = 'anonymous';`)).toHaveLength(1);
    expect(errs(`cfg.MERMAID = { src: '${u}', integrity: '${H}' };${LOADER}`)).toHaveLength(1);
  });
  it('reads an HTML page only inside its inline scripts', () => {
    const decl = `const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: '${H}' };`;
    expect(scan(`<p>Don't</p>\n<script type="module">\n${decl}${LOADER}\n</script>`, { html: true })[0].errors).toEqual([]);
    expect(scan(`<p>${LOADER}</p>\n<script type="module">\n${decl}\n</script>`, { html: true })[0].errors).toHaveLength(1);
  });
  it('accepts the other spellings of the loader', () => {
    const decl = `const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: '${H}' };`;
    expect(errs(`${decl}\ns.integrity = MERMAID.integrity;\ns.crossOrigin = "anonymous";`)).toEqual([]);
    expect(errs(`${decl}\ns.setAttribute('integrity', MERMAID.integrity);\ns.setAttribute("crossorigin", 'anonymous');`)).toEqual([]);
  });
  it('ignores hosts outside the list', () => {
    expect(scan('<link rel="icon" href="https://ik.imagekit.io/x/letter-f.png">')).toEqual([]);
  });
});

describe('CDN libraries in the repo', () => {
  const findings = scopeFiles().flatMap((file) => scan(readFileSync(join(ROOT, file), 'utf8'), { html: file.endsWith('.html') }).map((f) => ({ file, ...f })));
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
  it('a CDN URL outside a tag sits on a line with its integrity, which its file applies', () => {
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
