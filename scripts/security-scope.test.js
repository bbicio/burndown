import { describe, it, expect, afterEach } from 'vitest';
import { classifySecurityScope } from './security-scope.mjs';
import { classifyNameStatus } from './classify-cycle.mjs';

// This file is the list of security surfaces: PROCESS.md 6.4e and
// finish-cycle.md point here instead of repeating it. Every surface has a
// `review` case and a nearby `skip` case.
// Same shape as `git diff --name-status --find-renames -z` stdout (see
// classify-cycle.test.js): NUL-separated fields, trailing NUL.
const Z = (...fields) => fields.join('\0') + '\0';
const M = (...paths) => Z(...paths.flatMap((p) => ['M', p]));

const reviews = (z) => expect(classifySecurityScope(z).kind).toBe('review');
const skips = (z) => expect(classifySecurityScope(z).kind).toBe('skip');

describe('classifySecurityScope: surfaces', () => {
  it('api/src code is a surface, its tests are not', () => {
    reviews(M('api/src/routes/x.js'));
    skips(M('api/src/routes/x.test.js'));
  });

  it('every part of api/src counts, not only routes', () => {
    reviews(M('api/src/services/email.js'));
    reviews(M('api/src/lib/a.js'));
    reviews(M('api/src/index.js'));
  });

  it('a migration is a surface', () => {
    reviews(M('api/src/db/migrations/040_x.sql'));
  });

  it('a deleted route is a surface (Review Focus 1)', () => {
    reviews(Z('D', 'api/src/routes/x.js'));
  });

  it('root pages are a surface, an .html elsewhere is not (Review Focus 3)', () => {
    reviews(M('admin.html'));
    skips(M('docs/x.html'));
    skips(M('handbook/x.html'));
  });

  it('frontend runtime js is a surface, its tests and css are not', () => {
    reviews(M('js/pages/a.js'));
    reviews(M('js/lib/a.js'));
    reviews(M('js/nav.js'));
    skips(M('js/lib/a.test.js'));
    skips(M('css/a.css'));
  });

  it('nginx.conf is a surface, a document about it is not', () => {
    reviews(M('nginx.conf'));
    skips(M('docs/nginx.conf.md'));
  });

  it('the api image and the compose files are a surface, another Dockerfile is not (Review Focus 5)', () => {
    reviews(M('api/Dockerfile'));
    reviews(M('docker-compose.yml'));
    reviews(M('docker-compose.test.yml'));
    skips(M('scripts/Dockerfile'));
  });

  it('handbook/manifest.json is a surface, handbook documents are not', () => {
    reviews(M('handbook/manifest.json'));
    skips(M('handbook/public/a.md'));
    skips(Z('A', 'handbook/public/img/a.png'));
  });

  it('moving a handbook document to another audience is a surface', () => {
    reviews(Z('R100', 'handbook/public/a.md', 'handbook/restricted/a.md'));
    reviews(Z('D', 'handbook/public/a.md', 'A', 'handbook/restricted/a.md'));
  });

  it('tests, scripts, process files and documents are not a surface', () => {
    for (const p of ['test-api.js', 'scripts/run-tests.sh', 'scripts/x.mjs',
      '.claude/commands/finish-cycle.md', 'docs/a.md', 'CLAUDE.md']) skips(M(p));
  });

  it('matches from the start of the path, never inside it', () => {
    skips(M('docs/api/src/x.md'));
  });

  it('judges a rename on both of its paths', () => {
    const r = classifySecurityScope(Z('R100', 'js/a.js', 'docs/a.md'));
    expect(r.kind).toBe('review');
    expect(r.paths).toContain('js/a.js');
  });

  it('an empty diff is a skip', () => {
    expect(classifySecurityScope('')).toEqual({ kind: 'skip', audit: [], paths: [] });
  });

  it('a truncated stream is a review with both audits', () => {
    const r = classifySecurityScope(Z('M'));
    expect(r.kind).toBe('review');
    expect(r.audit).toEqual(['api', '.']);
  });

  it('lists only the paths that triggered the review', () => {
    expect(classifySecurityScope(M('docs/a.md', 'api/src/a.js')).paths).toEqual(['api/src/a.js']);
  });
});

describe('classifySecurityScope: audit', () => {
  it('api manifests audit api', () => {
    expect(classifySecurityScope(M('api/package.json'))).toMatchObject({ kind: 'review', audit: ['api'] });
  });

  it('the api lockfile alone audits api (Review Focus 2)', () => {
    expect(classifySecurityScope(M('api/package-lock.json'))).toMatchObject({ kind: 'review', audit: ['api'] });
  });

  it('root manifests audit the root', () => {
    expect(classifySecurityScope(M('package.json'))).toMatchObject({ kind: 'review', audit: ['.'] });
    expect(classifySecurityScope(M('package-lock.json'))).toMatchObject({ kind: 'review', audit: ['.'] });
  });

  it('both packages, in a fixed order', () => {
    expect(classifySecurityScope(M('package-lock.json', 'api/package.json')).audit).toEqual(['api', '.']);
  });

  it('no manifest, no audit', () => {
    expect(classifySecurityScope(M('api/src/a.js')).audit).toEqual([]);
  });
});

describe('classifySecurityScope: the no-code branch needs no rule of its own', () => {
  it('every no-code diff is a skip', () => {
    const noCode = [
      M('.claude/commands/finish-cycle.md', 'docs/superpowers/PROCESS.md'),
      Z('D', 'CLAUDE.md', 'A', 'docs/architecture/x.md'),
      Z('R087', 'docs/a.md', 'docs/b.md'),
      M('TEST_CASES.md'),
      M('handbook/public/manual.md'),
      Z('A', 'handbook/public/img/x.png'),
      M('handbook/restricted/TEST_CASES.md'),
    ];
    for (const z of noCode) {
      expect(classifyNameStatus(z).kind).toBe('no-code');
      expect(classifySecurityScope(z).kind).toBe('skip');
    }
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// Resolved from the project root, as in classify-cycle.test.js.
const SCRIPT = join(process.cwd(), 'scripts', 'security-scope.mjs');
const made = [];

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ss-'));
  made.push(dir);
  git(dir, 'init', '-q', '-b', 'main', '.');
  return dir;
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(dir, rel, body) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

function run(cwd, ...args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const E2E_TIMEOUT = 120000;

afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true, maxRetries: 3 });
});

describe('security-scope.mjs end to end', () => {
  function base() {
    const d = repo();
    write(d, 'README.md', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'base');
    return d;
  }

  it('prints review, the audit line and the triggering paths', () => {
    const d = base();
    write(d, 'api/src/a.js', 'x\n');
    write(d, 'api/package-lock.json', '{}\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'code');

    const r = run(d, 'HEAD~1...HEAD');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('review\naudit: api\napi/package-lock.json\napi/src/a.js\n');
  }, E2E_TIMEOUT);

  it('prints skip and no audit for a documents-only diff', () => {
    const d = base();
    write(d, 'docs/a.md', 'x\n');
    git(d, 'add', '-A');
    git(d, 'commit', '-qm', 'docs');

    expect(run(d, 'HEAD~1...HEAD').stdout).toBe('skip\naudit: none\n');
  }, E2E_TIMEOUT);

  it('an empty range is a skip, not an error (Review Focus 4)', () => {
    const d = base();
    const r = run(d, 'HEAD...HEAD');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('skip\naudit: none\n');
  }, E2E_TIMEOUT);

  it('outside a repository it fails with nothing on stdout', () => {
    const d = mkdtempSync(join(tmpdir(), 'ss-norepo-'));
    made.push(d);

    const r = run(d);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr.startsWith('security-scope:')).toBe(true);
  }, E2E_TIMEOUT);
});
