// Guard for scripts/site-export.rules (spec: docs/superpowers/specs/2026-11-12-site-export-classification-design.md).
//
// Fails when a tracked file is covered by no rule (a new file must be classified
// as site or process, never left out or let in silently), and when a process
// file is classified `include`.
//
// Limit: a new file under a path included in blocks (`js/`, `css/`, `handbook/`,
// `api/src/`) enters the export without an explicit decision unless it matches
// NEVER_INCLUDED below. The guard checks an invariant, not whether the
// classification is right.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRules, classify } from './lib/site-export.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const NEVER_INCLUDED = parseRules(
  [
    'docs/', '.claude/', 'scripts/', '**/*.test.js', '**/*.spec.js', 'test-api.js',
    'vitest.config.js', 'CLAUDE.md', 'PRD.md', '.gitattributes', 'package.json',
    'package-lock.json', 'api/nodemon.json', 'api/src/scripts/', 'api/src/trust-device.js',
    'api/src/db/reset-dev.sql',
  ].map((g) => `exclude ${g}`).join('\n'),
);

/** Paths that match a never-included glob yet are classified `include`. */
function neverIncludedViolations(paths, rules) {
  return classify(paths, rules)
    .filter((c) => c.verdict === 'include' && NEVER_INCLUDED.some((n) => n.re.test(c.path)))
    .map((c) => c.path);
}

const liveRules = parseRules(readFileSync(join(ROOT, 'scripts', 'site-export.rules'), 'utf8'));
const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean);

describe('site-export rules (live)', () => {
  it('cover every tracked file', () => {
    const missing = classify(tracked, liveRules).filter((c) => c.verdict === 'unclassified').map((c) => c.path);
    expect(missing, `classify these in scripts/site-export.rules:\n${missing.join('\n')}`).toEqual([]);
  });

  it('include no process file', () => {
    expect(neverIncludedViolations(tracked, liveRules)).toEqual([]);
  });
});

describe('site-export rules (synthetic)', () => {
  it('a file outside every rule is unclassified, a site file is included', () => {
    expect(classify(['brand-new-dir/x.js'], liveRules)[0].verdict).toBe('unclassified');
    expect(classify(['css/new.css'], liveRules)[0].verdict).toBe('include');
  });

  it('a process file wrongly included is caught', () => {
    expect(neverIncludedViolations(['docs/x.md'], parseRules('include docs/'))).toEqual(['docs/x.md']);
  });
});
