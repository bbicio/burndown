// Guard: every response of nginx carries the security headers, and the
// Content-Security-Policy admits every origin the pages load from.
//
// WHY THIS FILE EXISTS. The 2026-11-15 security review (S-06, cycle 5) found
// no security header at all: no CSP, no clickjacking protection, no nosniff,
// and nginx and Express announcing their versions. The headers now live once,
// at `server` level of nginx.conf; this test keeps them there.
//
// THE RULES. In nginx.conf:
//   * the `server` level carries each header of HEADERS below with `always`
//     (so 302, 403 and 404 carry it too) and its exact value, the CSP under
//     CSP_HEADER, plus `server_tokens off;` and `proxy_hide_header
//     X-Powered-By;`;
//   * no `location` block, named and `internal` ones included, contains
//     `add_header` or `proxy_hide_header`: in nginx one such directive inside
//     a `location` replaces every one inherited from `server`;
//   * the CSP closes object-src, base-uri, form-action and frame-ancestors,
//     keeps default-src and connect-src to 'self', has no source containing
//     `*` nor `https:`/`http:` in script-src or style-src, no
//     `data:`/`blob:`/`filesystem:` in script-src, and no
//     script-src-elem/-attr or style-src-elem/-attr directive (a browser would
//     apply it instead of the directive this test reads) --
//     cspSourceProblems in scripts/lib/nginx-headers.mjs;
//   * script-src has no 'unsafe-inline' and no external source without a path
//     (or with path `/`): each CDN file is named by its exact URL, so a script
//     injected from another package of the same CDN is refused (cycle 8,
//     B-497) -- also cspSourceProblems;
//   * every script-src source with a path admits a script the pages load: a
//     file dropped from the pages is dropped from the CSP too.
//     The rest of the CSP string is not pinned: a new file for a new page is
//     added without rewriting this test.
// In the root *.html pages and js/**/*.js (tests excluded), every external
// <script src> is admitted by a source of script-src, every <link
// rel="stylesheet"> by style-src, every <link rel="icon"> and <img src> by
// img-src (cspSourceMatches: a path source admits its own file, a `/`-ended
// one what is below it, a host the whole origin); any other <link> to an
// external origin fails until it is classified here. "External" is read as a
// browser reads it (spaces trimmed, `\` as `/`, `https:host`), and a plain
// `http:` or protocol-relative `//` URL always fails: a `https://` CSP source
// does not admit it from an http page. A CDN URL outside a tag (a lazy loader)
// must be admitted by script-src. In handbook/**/*.md (rendered by help.html),
// every external inline, reference-style or <img> image has its origin in
// img-src.
// The root *.html pages as they are on disk (rawReadFileSync, not the
// rebuilt text of scripts/lib/page-source.setup.mjs) contain no inline
// JavaScript <script> and no `on<name>=` attribute (handlerAttributes in
// scripts/lib/js-code.mjs): their code lives in js/pages/*.js, served from
// 'self'.
//
// WHAT IS DELIBERATELY NOT CHECKED -- named limits, not gaps:
//   * `if` and `include` in nginx.conf: neither exists today, and the readers
//     in scripts/lib/nginx-locations.mjs throw on a nested block.
//   * Resources loaded from CSS (`url()`, `@import`), by `fetch`, bound at
//     runtime (a Vue `:src`) or built from pieces: scripts/lib/cdn-urls.mjs
//     does not see them.
//   * Lazy loaders are seen only on a host in CDN_HOSTS
//     (scripts/lib/cdn-urls.mjs), and are assumed to load scripts; the only one
//     today (Mermaid in js/pages/help.js) is a <script>.
//   * Handler attributes inside HTML strings of js/*.js (a template literal, an
//     innerHTML) are not read: handlerAttributes reads the pages only. The CSP
//     refuses them at runtime anyway.
//   * Whether the browser actually accepts the policy: the branch-stack
//     measure of the cycle that changes it covers that.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { externalOrigin, externalResources, markdownImages, scanCdnUrls, scopeFiles } from './lib/cdn-urls.mjs';
import { locationBlocks, serverLevel } from './lib/nginx-locations.mjs';
import { addHeaders, cspSourceMatches, cspSourceProblems, parseCsp } from './lib/nginx-headers.mjs';
import { handlerAttributes, inlineScripts } from './lib/js-code.mjs';
import { rawReadFileSync } from './lib/page-source.setup.mjs';

const ROOT = process.cwd();
const CSP_HEADER = 'Content-Security-Policy';
const CSP_NAMES = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only'];
const HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=15552000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

describe('externalResources', () => {
  it('reads a CDN script', () => {
    const v = 'https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js';
    expect(externalResources(`<script defer src="${v}" integrity="sha384-x" crossorigin="anonymous"></script>`))
      .toEqual([{ kind: 'script', url: v }]);
  });
  it('reads a stylesheet', () => {
    const u = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
    expect(externalResources(`<link rel="stylesheet" href="${u}">`)).toEqual([{ kind: 'stylesheet', url: u }]);
  });
  it('reads an icon over several lines with href before rel', () => {
    const u = 'https://ik.imagekit.io/x/letter-f.png';
    expect(externalResources(`<link\n  href="${u}"\n  rel="icon">`)).toEqual([{ kind: 'icon', url: u }]);
  });
  it('classifies any other rel as other', () => {
    expect(externalResources('<link rel="preconnect" href="https://fonts.example">'))
      .toEqual([{ kind: 'other', url: 'https://fonts.example' }]);
  });
  it('ignores local scripts and anchors', () => {
    expect(externalResources('<script src="js/core.js?v=3"></script>\n<a href="https://example.com">x</a>')).toEqual([]);
  });
  it('reads protocol-relative and plain-http URLs too', () => {
    expect(externalResources('<script src="//evil.example/x.js"></script>'))
      .toEqual([{ kind: 'script', url: '//evil.example/x.js' }]);
    expect(externalResources('<link rel="stylesheet" href="http://evil.example/x.css">'))
      .toEqual([{ kind: 'stylesheet', url: 'http://evil.example/x.css' }]);
  });
  it('reads an external <img>, not a local or data: one', () => {
    expect(externalResources('<img alt="" src="https://i.example/x.png"><img src="img/a.png"><img src="data:image/png;base64,AA">'))
      .toEqual([{ kind: 'image', url: 'https://i.example/x.png' }]);
  });
});

describe('externalResources (forms a browser normalises)', () => {
  it('reads a URL with leading spaces, backslashes or a scheme without slashes', () => {
    for (const u of [' https://x.example/a.js', '\\\\x.example/a.js', '/\\x.example/a.js', 'https:x.example/a.js']) {
      expect(externalResources(`<script src="${u}"></script>`), u).toEqual([{ kind: 'script', url: u }]);
    }
  });
});

describe('externalOrigin', () => {
  it('gives the https origin of an external URL', () => {
    expect(externalOrigin('https://cdn.example/a.js')).toEqual({ origin: 'https://cdn.example' });
    expect(externalOrigin(' https:x.example/a.js')).toEqual({ origin: 'https://x.example' });
  });
  it('refuses plain http and protocol-relative URLs, backslash forms included', () => {
    for (const u of ['http://x.example/a.js', '//x.example/a.js', '\\\\x.example/a.js', '/\\x.example/a.js']) {
      expect(externalOrigin(u).error, u).toBeTruthy();
    }
  });
});

describe('markdownImages', () => {
  it('reads external markdown and HTML images, not local ones', () => {
    expect(markdownImages('![a](https://i.example/a.png "t")\n![b](img/b.png)\n<img src="https://i.example/c.png">'))
      .toEqual(['https://i.example/a.png', 'https://i.example/c.png']);
  });
  it('reads an alt with brackets and reference-style images', () => {
    expect(markdownImages('![a [b]](https://i.example/a.png)')).toEqual(['https://i.example/a.png']);
    const refs = '![x][R1] ![r2][] ![R3]\n\n[r1]: https://i.example/1.png\n[R2]: <https://i.example/2.png> "t"\n[r3]: https://i.example/3.png\n[link]: https://other.example/';
    expect(markdownImages(refs).sort()).toEqual(['https://i.example/1.png', 'https://i.example/2.png', 'https://i.example/3.png']);
  });
  it('resolves references as marked does: colon after a shortcut, first definition, inner spaces, label before (', () => {
    const E = 'https://evil.example/x.png';
    expect(markdownImages(`![logo]: the logo\n\n[logo]: ${E}`)).toEqual([E]);
    expect(markdownImages(`![x]\n\n[x]: ${E}\n[x]: img/a.png`)).toEqual([E]);
    expect(markdownImages(`![my  logo]\n\n[My Logo]: ${E}`)).toEqual([E]);
    expect(markdownImages(`![a][b](x)\n\n[b]: ${E}\n[a]: img/a.png`)).toEqual([E]);
  });
});

describe('externalOrigin (malformed)', () => {
  it('refuses a URL with no host instead of throwing', () => {
    for (const u of ['https:', 'https:/', 'https://']) expect(externalOrigin(u).error, u).toBe('invalid URL');
  });
});

describe('cspSourceMatches', () => {
  const M = 'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js';
  it('a file source accepts that exact file, query and fragment ignored', () => {
    expect(cspSourceMatches(M, `${M}?v=1`)).toBe(true);
    expect(cspSourceMatches(M, `${M}#x`)).toBe(true);
  });
  it('a file source refuses another file of the same host', () => {
    expect(cspSourceMatches(M, 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js')).toBe(false);
    expect(cspSourceMatches(M, 'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js/x')).toBe(false);
  });
  it('a source ending with / accepts the files below it', () => {
    expect(cspSourceMatches('https://cdn.jsdelivr.net/npm/x@1.0.0/', 'https://cdn.jsdelivr.net/npm/x@1.0.0/a.js')).toBe(true);
    expect(cspSourceMatches('https://cdn.jsdelivr.net/npm/x@1.0.0/', 'https://cdn.jsdelivr.net/npm/x@1.0.1/a.js')).toBe(false);
  });
  it('a source without a path, or with path /, accepts the whole origin', () => {
    expect(cspSourceMatches('https://cdn.jsdelivr.net', 'https://cdn.jsdelivr.net/npm/anything@1.0.0/a.js')).toBe(true);
    expect(cspSourceMatches('https://cdn.jsdelivr.net/', 'https://cdn.jsdelivr.net/a.js')).toBe(true);
  });
  it('another origin never matches', () => {
    expect(cspSourceMatches(M, M.replace('cdn.jsdelivr.net', 'evil.example'))).toBe(false);
    expect(cspSourceMatches('https://cdn.jsdelivr.net', 'https://cdn.jsdelivr.net.evil.example/a.js')).toBe(false);
  });
  it("keywords do not accept an external URL", () => {
    for (const k of ["'self'", "'unsafe-eval'", "'unsafe-inline'", "'none'"]) expect(cspSourceMatches(k, M), k).toBe(false);
  });
});

describe('handlerAttributes', () => {
  it('reads an inline handler attribute', () => {
    expect(handlerAttributes('<button onclick="x()">a</button>')).toEqual(['onclick']);
    expect(handlerAttributes('<body\n  class="a" OnLoad=\'f()\'>')).toEqual(['onload']);
  });
  it('ignores Vue bindings, script bodies, comments and look-alike attributes', () => {
    expect(handlerAttributes('<button @click="x">a</button>')).toEqual([]);
    expect(handlerAttributes('<button v-on:click="x">a</button>')).toEqual([]);
    expect(handlerAttributes('<script>a.onclick=f; b = "<p onclick=x>"</script>')).toEqual([]);
    expect(handlerAttributes('<!-- <button onclick="x()"> -->')).toEqual([]);
    expect(handlerAttributes('<div data-onclick="x" title="a onclick=b">')).toEqual([]);
  });
});

describe('cspSourceProblems', () => {
  const problems = (v) => cspSourceProblems(parseCsp(v));
  it('accepts the shape of the real policy', () => {
    expect(problems("script-src 'self' 'unsafe-eval' https://cdn.example/npm/a@1.0.0/a.min.js; style-src 'self' https://cdn.example")).toEqual([]);
  });
  it("rejects 'unsafe-inline' in script-src", () => {
    expect(problems("script-src 'self' 'unsafe-inline'; style-src 'self'")).toHaveLength(1);
  });
  it('rejects an external script-src source without a path, or with path /', () => {
    for (const s of ['https://cdn.example', 'https://cdn.example/']) {
      expect(problems(`script-src 'self' ${s}; style-src 'self'`), s).toHaveLength(1);
    }
  });
  it('rejects any wildcard in script-src or style-src', () => {
    for (const s of ['*', 'https:', 'http:', 'https://*', '*.example.com', 'https://*.example.com']) {
      expect(problems(`script-src 'self' ${s}; style-src 'self'`), s).toHaveLength(1);
      expect(problems(`script-src 'self'; style-src 'self' ${s}`), s).toHaveLength(1);
    }
  });
  it('rejects data:, blob: and filesystem: in script-src', () => {
    for (const s of ['data:', 'blob:', 'filesystem:']) expect(problems(`script-src 'self' ${s}; style-src 'self'`), s).toHaveLength(1);
  });
  it('rejects the -elem and -attr directives the guard does not read', () => {
    for (const d of ['script-src-elem', 'script-src-attr', 'style-src-elem', 'style-src-attr']) {
      expect(problems(`script-src 'self'; style-src 'self'; ${d} 'self'`), d).toHaveLength(1);
    }
  });
});

describe('nginx readers', () => {
  it('reads add_header with and without always, quoted or not', () => {
    expect(addHeaders('add_header X-Frame-Options "DENY" always;'))
      .toEqual([{ name: 'X-Frame-Options', value: 'DENY', always: true }]);
    expect(addHeaders("add_header X-Frame-Options 'DENY';"))
      .toEqual([{ name: 'X-Frame-Options', value: 'DENY', always: false }]);
    expect(addHeaders('add_header X-Frame-Options DENY always;'))
      .toEqual([{ name: 'X-Frame-Options', value: 'DENY', always: true }]);
  });
  it('parses a CSP into directives and sources', () => {
    const csp = parseCsp("default-src 'self'; script-src 'self' https://a.example ;");
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'", 'https://a.example']);
    expect([...csp.keys()]).toEqual(['default-src', 'script-src']);
  });
  it('returns named and internal locations too', () => {
    const conf = 'server {\n location @to_login { return 302 /login.html; }\n location = /x { internal; }\n}';
    expect(locationBlocks(conf).map((l) => l.pattern)).toEqual(['@to_login', '/x']);
  });
  it('reads the server level without its locations', () => {
    const lvl = serverLevel('server { add_header A "1" always; location / { add_header B "2"; } }');
    expect(lvl).toContain('add_header A');
    expect(lvl).not.toContain('add_header B');
  });
  it('drops comments from the server level', () => {
    expect(serverLevel('server {\n # add_header A "1" always;\n listen 80;\n}')).not.toContain('add_header');
  });
  it('does not read a location named /server as a second server block', () => {
    expect(serverLevel('server { listen 80; location /server { root /x; } location /api/server { root /y; } }')).toContain('listen 80');
  });
  it('keeps a # inside a quoted value', () => {
    expect(addHeaders(serverLevel('server { add_header A "x#y" always; # a comment\n}')))
      .toEqual([{ name: 'A', value: 'x#y', always: true }]);
    expect(locationBlocks("server { location / { add_header B 'p#q'; } }")[0].body).toContain("'p#q'");
  });
  it('starts a comment or a quote only at the start of a token, as nginx does', () => {
    const conf = 'server {\n location = /x { return 301 /m.html#by-group; }\n location = /y { return 302 /b#c; add_header X y; }\n location ~ o\'b { root /z; }\n # add_header Z "1";\n}';
    expect(locationBlocks(conf).map((l) => l.pattern)).toEqual(['/x', '/y', "o'b"]);
    expect(locationBlocks(conf)[1].body).toContain('add_header X y');
    expect(serverLevel(conf)).not.toContain('add_header Z');
  });
  it('throws on a brace in a location pattern, like parseLocations', () => {
    expect(() => locationBlocks('server { location ~ ^/a{2}$ { root /x; } }')).toThrow();
  });
  it('throws on a config it cannot read', () => {
    expect(() => serverLevel('http { }')).toThrow();
    expect(() => locationBlocks('server { location / { if ($x) { return 404; } } }')).toThrow();
  });
});

describe('nginx.conf security headers', () => {
  const conf = readFileSync(join(ROOT, 'nginx.conf'), 'utf8');
  const level = serverLevel(conf);
  const headers = addHeaders(level);
  const one = (name) => headers.filter((h) => h.name.toLowerCase() === name.toLowerCase());

  it('carries each header once, with always and its exact value', () => {
    for (const [name, value] of Object.entries(HEADERS)) {
      expect(one(name), name).toEqual([{ name, value, always: true }]);
    }
  });
  it('carries the CSP under CSP_HEADER only, with always', () => {
    expect(one(CSP_HEADER).map((h) => h.always), CSP_HEADER).toEqual([true]);
    for (const other of CSP_NAMES.filter((n) => n !== CSP_HEADER)) expect(one(other), other).toEqual([]);
  });
  it('hides the versions of nginx and Express', () => {
    expect(level).toMatch(/\bserver_tokens\s+off\s*;/);
    expect(level).toMatch(/\bproxy_hide_header\s+X-Powered-By\s*;/);
  });
  it('no location carries add_header or proxy_hide_header', () => {
    expect(locationBlocks(conf).filter((l) => /\b(add_header|proxy_hide_header)\b/.test(l.body))
      .map((l) => ['location', l.modifier, l.pattern].filter(Boolean).join(' '))).toEqual([]);
  });

  describe('the CSP', () => {
    const csp = parseCsp(one(CSP_HEADER)[0]?.value ?? '');
    it('closes the directives that need no source', () => {
      expect(csp.get('default-src')).toEqual(["'self'"]);
      expect(csp.get('connect-src')).toEqual(["'self'"]);
      expect(csp.get('object-src')).toEqual(["'none'"]);
      expect(csp.get('base-uri')).toEqual(["'self'"]);
      expect(csp.get('form-action')).toEqual(["'self'"]);
      expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    });
    it('has no source or directive that empties or overrides the script/style allowlist', () => {
      for (const d of ['script-src', 'style-src']) expect(csp.get(d), d).toBeDefined();
      expect(cspSourceProblems(csp)).toEqual([]);
    });
    it('admits every origin the pages, js/ and handbook/ load from', () => {
      const DIRECTIVE = { script: 'script-src', stylesheet: 'style-src', icon: 'img-src', image: 'img-src' };
      const missing = [];
      const check = (file, url, d) => {
        const { error } = externalOrigin(url);
        if (error) missing.push(`${file}: ${url} -- ${error}`);
        else if (!(csp.get(d) ?? []).some((s) => cspSourceMatches(s, url))) missing.push(`${file}: ${url} -- not admitted by ${d}`);
      };
      for (const file of scopeFiles(ROOT)) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        for (const { kind, url } of externalResources(src)) {
          if (!DIRECTIVE[kind]) missing.push(`${file}: ${url} -- <link> of an unclassified kind`);
          else check(file, url, DIRECTIVE[kind]);
        }
        for (const { url } of scanCdnUrls(src, { html: file.endsWith('.html') }).filter((f) => !f.inTag)) check(file, url, 'script-src');
      }
      const handbook = readdirSync(join(ROOT, 'handbook'), { recursive: true })
        .map((n) => `handbook/${String(n).replace(/\\/g, '/')}`).filter((n) => n.endsWith('.md'));
      expect(handbook.length).toBeGreaterThan(0);
      for (const file of handbook) {
        for (const url of markdownImages(readFileSync(join(ROOT, file), 'utf8'))) check(file, url, 'img-src');
      }
      expect(missing).toEqual([]);
    });
    it('every script-src source with a path admits a script the pages load', () => {
      const urls = scopeFiles(ROOT).flatMap((file) => {
        const src = readFileSync(join(ROOT, file), 'utf8');
        return [
          ...externalResources(src).filter((r) => r.kind === 'script').map((r) => r.url),
          ...scanCdnUrls(src, { html: file.endsWith('.html') }).filter((f) => !f.inTag).map((f) => f.url),
        ];
      });
      const unused = (csp.get('script-src') ?? [])
        .filter((s) => /^https?:\/\/[^/]+\/./i.test(s))
        .filter((s) => !urls.some((u) => cspSourceMatches(s, u)));
      expect(unused).toEqual([]);
    });
  });
});

describe('root pages as served (no inline script, no handler attribute)', () => {
  const pages = readdirSync(ROOT).filter((n) => n.endsWith('.html'));
  it('reads the pages from disk', () => {
    expect(pages.length).toBeGreaterThan(0);
  });
  it.each(pages)('%s', (page) => {
    const raw = rawReadFileSync(join(ROOT, page), 'utf8');
    expect(inlineScripts(raw), 'inline <script>').toEqual([]);
    expect(handlerAttributes(raw), 'on* attribute').toEqual([]);
  });
});
