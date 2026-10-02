import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = f => readFileSync(join(ROOT, f), 'utf8');
const pages = readdirSync(ROOT).filter(f => /^[^/]+\.html$/.test(f));

// Text of a top-level function, from "function name(" to the first "\n}" line.
function fnText(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  return src.slice(start, src.indexOf('\n}', start) + 2);
}

describe('status badges (js/core.js)', () => {
  const core = read('js/core.js');
  for (const name of ['statusBadge', 'statusBadgeLarge']) {
    const body = fnText(core, name);
    it(`${name} exists and uses no hex colour`, () => {
      expect(body).not.toBe('');
      expect(body.match(/#[0-9a-fA-F]{3,6}\b/g) || []).toEqual([]);
    });
    it(`${name} maps all five statuses to --status-* tokens`, () => {
      for (const s of ['not-started', 'started', 'at-risk', 'on-hold', 'completed']) {
        expect(body).toContain(`var(--status-${s}-bg)`);
      }
      expect(body).toContain('var(--status-text)');
    });
    it(`${name} falls back to the not-started colours for an unknown status`, () => {
      expect(body).toMatch(/\|\|\s*'background:var\(--status-not-started-bg\);color:var\(--status-text\)'/);
    });
  }
});
