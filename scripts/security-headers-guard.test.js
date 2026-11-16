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
//     keeps default-src and connect-src to 'self', and has no wildcard source
//     (`*`, `https:`, `http:`) in script-src or style-src, nor `data:` in
//     script-src. The rest of the CSP string is not pinned: a new origin for a
//     new page is added without rewriting this test.
// In the root *.html pages and js/**/*.js (tests excluded), every external
// <script src> has its origin in script-src, every <link rel="stylesheet"> in
// style-src, every <link rel="icon"> in img-src; any other <link> to an
// external origin fails until it is classified here. A CDN URL outside a tag
// (a lazy loader) must have its origin in script-src.
//
// WHAT IS DELIBERATELY NOT CHECKED -- named limits, not gaps:
//   * `if` and `include` in nginx.conf: neither exists today, and the readers
//     in scripts/lib/nginx-locations.mjs throw on a nested block.
//   * Resources loaded from CSS (`url()`, `@import`), by `fetch`, or built at
//     runtime: scripts/lib/cdn-urls.mjs does not see them.
//   * Lazy loaders are assumed to load scripts; the only one today (Mermaid in
//     help.html) is a <script>.
//   * Whether the browser actually accepts the policy: the branch-stack
//     measure of the cycle that changes it covers that.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { externalResources, scanCdnUrls, scopeFiles } from './lib/cdn-urls.mjs';
import { locationBlocks, serverLevel } from './lib/nginx-locations.mjs';
import { addHeaders, parseCsp } from './lib/nginx-headers.mjs';

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
    it('has no wildcard source in script-src or style-src, nor data: in script-src', () => {
      for (const d of ['script-src', 'style-src']) {
        expect(csp.get(d), d).toBeDefined();
        expect((csp.get(d) ?? []).filter((s) => ['*', 'https:', 'http:'].includes(s.toLowerCase())), d).toEqual([]);
      }
      expect((csp.get('script-src') ?? []).filter((s) => s.toLowerCase() === 'data:')).toEqual([]);
    });
    it('admits every origin the pages and js/ load from', () => {
      const DIRECTIVE = { script: 'script-src', stylesheet: 'style-src', icon: 'img-src' };
      const missing = [];
      for (const file of scopeFiles(ROOT)) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        for (const { kind, url } of externalResources(src)) {
          const d = DIRECTIVE[kind];
          if (!d) missing.push(`${file}: ${url} -- <link> of an unclassified kind`);
          else if (!(csp.get(d) ?? []).includes(new URL(url).origin)) missing.push(`${file}: ${url} -- origin not in ${d}`);
        }
        for (const { url } of scanCdnUrls(src, { html: file.endsWith('.html') }).filter((f) => !f.inTag)) {
          if (!(csp.get('script-src') ?? []).includes(new URL(url).origin)) missing.push(`${file}: ${url} -- origin not in script-src`);
        }
      }
      expect(missing).toEqual([]);
    });
  });
});
