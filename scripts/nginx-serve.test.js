// nginx.conf serves only the site — the root *.html pages, handbook/ (the manifest
// and the .md/.png under public/ and restricted/, the latter admin-only) and the
// .css/.js files under css/ and js/ (tests excluded). docker-compose.yml mounts the whole
// repo root into nginx, so anything else a location serves is downloadable:
// .env, backups/, .git/, docs. Every tracked file is checked, plus a fixed list
// of untracked paths that exist on a developer machine.
//
// A product guard, not a process one: its name deliberately does not end in
// -guard.test.js, which PROCESS.md §4b reserves for the documentation guards.
//
// The location selection is modelled by scripts/lib/nginx-locations.mjs, not run
// in a real nginx: see that file's header for what the model leaves out.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLocations, selectLocation } from './lib/nginx-locations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONF = readFileSync(resolve(ROOT, 'nginx.conf'), 'utf8');
const TRACKED = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(Boolean);

const ALWAYS_404 = [
  '/.env', '/backups/pdash.dump', '/.claude/worktrees/x/.env', '/.git/HEAD', '/shots/x.png',
  '/.superpowers_up.log', '/node_modules/vue/package.json', '/favicon.ico', '/.well-known/x.json',
  '/css/', '/js/lib/', '/docs', '/assets/chart.umd.min.js',
  // handbook/: only the two audience folders and the manifest; case variants and
  // 8.3 names must not reach restricted/.
  '/handbook/', '/handbook/RESTRICTED/TEST_CASES.md', '/handbook/RESTRI~1/TEST_CASES.md',
  '/handbook/public/x.txt', '/handbook/x.md',
  // The repo can sit on a case-insensitive filesystem with Windows short (8.3) names:
  // a case variant or a short name reaches the real test file.
  '/js/lib/money.Test.js', '/js/lib/money.test.JS', '/js/lib/MONEYT~1.js', '/js/MONEY-~1.js',
];

// Root pages answered by a redirect, not served.
const REDIRECTS = ['test-cases.html'];

function isSite(path) {
  if (!path.includes('/')) return path.endsWith('.html');
  if (path.startsWith('css/')) return path.endsWith('.css');
  if (path.startsWith('js/')) return path.endsWith('.js') && !/\.(test|spec)\.js$/.test(path);
  if (path === 'handbook/manifest.json') return true;
  return /^handbook\/(public|restricted)\/.+\.(md|png)$/.test(path);
}

function expected(path) {
  if (REDIRECTS.includes(path)) return 'redirect';
  if (isSite(path)) return 'serve';
  return path.startsWith('api/') ? 'proxy' : '404';
}

function violations(confText, trackedPaths) {
  const locations = parseLocations(confText);
  const checks = [
    ...trackedPaths.map((p) => ['/' + p, expected(p)]),
    ...ALWAYS_404.map((uri) => [uri, '404']),
  ];
  return checks
    .map(([uri, want]) => [uri, want, selectLocation(locations, uri)?.action ?? 'none'])
    .filter(([, want, got]) => got !== want)
    .map(([uri, want, got]) => `${uri} → ${got}, attesa ${want}`);
}

function handbookAuthViolations(confText, trackedPaths) {
  const locations = parseLocations(confText);
  return trackedPaths
    .filter((p) => p.startsWith('handbook/restricted/'))
    .filter((p) => {
      const loc = selectLocation(locations, '/' + p);
      return !(loc && loc.action === 'serve' && loc.authBy === '/admin-check');
    });
}

const pick = (uri) => selectLocation(parseLocations(CONF), uri);

describe('nginx.conf serves only site files', () => {
  it('every tracked file and every sensitive untracked path gets the expected location', () => {
    expect(violations(CONF, TRACKED)).toEqual([]);
  });

  it('/ is the exact location serving index.html behind auth', () => {
    expect(pick('/')).toMatchObject({ modifier: '=', action: 'serve', auth: true });
  });

  it('the public pages and assets have no auth_request', () => {
    for (const uri of ['/login.html', '/activate.html', '/reset-password.html', '/css/style.css', '/js/core.js']) {
      expect(pick(uri), uri).toMatchObject({ action: 'serve', auth: false });
    }
  });

  it('the other root pages require auth', () => {
    for (const uri of ['/pipeline.html', '/_db-reset.html']) {
      expect(pick(uri), uri).toMatchObject({ action: 'serve', auth: true });
    }
  });

  it('reports the auth_request target of each location', () => {
    expect(pick('/pipeline.html').authBy).toBe('/auth-check');
    expect(pick('/login.html').authBy).toBeNull();
    const [redirect] = parseLocations('location = /x { return 301 /y; }');
    expect(redirect.action).toBe('redirect');
  });

  it('every tracked handbook/restricted/ file is behind /admin-check', () => {
    const files = TRACKED.filter((p) => p.startsWith('handbook/restricted/'));
    expect(files.length).toBeGreaterThan(0);
    expect(handbookAuthViolations(CONF, TRACKED)).toEqual([]);
  });

  it('the rest of handbook/ is behind /auth-check', () => {
    const files = TRACKED.filter((p) => p.startsWith('handbook/') && !p.startsWith('handbook/restricted/'));
    expect(files.length).toBeGreaterThan(0);
    for (const p of files) {
      expect(pick('/' + p), p).toMatchObject({ action: 'serve', authBy: '/auth-check' });
    }
  });

  it('/test-cases.html redirects', () => {
    expect(pick('/test-cases.html')).toMatchObject({ modifier: '=', action: 'redirect' });
  });

  it('is red when restricted uses /auth-check', () => {
    const weakened = CONF.replace(/(handbook\/restricted[^{]*\{\s*)auth_request\s+\/admin-check;/,
      '$1auth_request /auth-check;');
    expect(weakened).not.toBe(CONF);
    const loc = selectLocation(parseLocations(weakened), '/handbook/restricted/TEST_CASES.md');
    expect(loc.authBy).toBe('/auth-check');
    expect(loc.authBy).not.toBe('/admin-check');
    expect(handbookAuthViolations(weakened, TRACKED)).not.toEqual([]);
  });

  it('is red without the final catch-all 404', () => {
    const withoutCatchAll = CONF.replace(/location\s+\/\s*\{\s*return\s+404;\s*\}/, '');
    expect(withoutCatchAll).not.toBe(CONF);
    expect(violations(withoutCatchAll, TRACKED)).not.toEqual([]);
  });

  it('is red when a location serves docs/', () => {
    const withDocs = CONF.replace(/(location\s+\/\s*\{\s*return\s+404;)/,
      'location /docs/ { root /usr/share/nginx/html; }\n    $1');
    expect(withDocs).not.toBe(CONF);
    expect(violations(withDocs, TRACKED).some((v) => v.startsWith('/docs/BACKLOG.md '))).toBe(true);
  });
});
