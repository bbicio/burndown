// Guard: nginx.conf serves only the site — the root *.html pages and the .css/.js
// files under css/ and js/ (tests excluded). docker-compose.yml mounts the whole
// repo root into nginx, so anything else a location serves is downloadable:
// .env, backups/, .git/, docs. Every tracked file is checked, plus a fixed list
// of untracked paths that exist on a developer machine.
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
  // The repo sits on a case-insensitive filesystem: a case variant reaches the real test file.
  '/js/lib/money.Test.js', '/js/lib/money.test.JS',
];

// Root files a page fetches at runtime: test-cases.html renders TEST_CASES.md.
const RUNTIME_FETCHED = ['TEST_CASES.md'];

function isSite(path) {
  if (!path.includes('/')) return path.endsWith('.html') || RUNTIME_FETCHED.includes(path);
  if (path.startsWith('css/')) return path.endsWith('.css');
  if (path.startsWith('js/')) return path.endsWith('.js') && !/\.(test|spec)\.js$/.test(path);
  return false;
}

function expected(path) {
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
    for (const uri of ['/pipeline.html', '/_db-reset.html', '/TEST_CASES.md']) {
      expect(pick(uri), uri).toMatchObject({ action: 'serve', auth: true });
    }
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
