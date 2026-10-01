import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ALLOWED = new Set(['js/lib/money.js', 'api/src/lib/money-format.js']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.superpowers', 'docs', 'backups', 'coverage']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = p => p.slice(ROOT.length + 1).replace(/\\/g, '/');
const files = walk(ROOT).map(rel);
const sources = files.filter(f => /\.(js|html)$/.test(f) && !/\.test\.js$/.test(f));
const read = f => readFileSync(join(ROOT, f), 'utf8');

describe('money guard', () => {
  it('Intl.NumberFormat is used only inside the two money modules', () => {
    const offenders = sources.filter(f => !ALLOWED.has(f) && /Intl\.NumberFormat/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('every page that loads core.js and uses a money function also loads js/lib/money.js', () => {
    const uses = /\b(fmtMoney|cgFmtCurrency|pbFmtMoney|formatMoney|formatMoneyInput|parseMoney|fmtAmtC)\(|js\/costgrid\.js|js\/lib\/pipeline-calc\.js|js\/portfolio\.js/;
    const offenders = files
      .filter(f => /^[^/]+\.html$/.test(f))
      .filter(f => { const t = read(f); return /js\/core\.js/.test(t) && uses.test(t) && !/js\/lib\/money\.js/.test(t); });
    expect(offenders).toEqual([]);
  });

  it('every reference to js/lib/money.js carries the same ?v=N', () => {
    const versions = new Set();
    for (const f of sources) for (const m of read(f).matchAll(/money\.js\?v=(\d+)/g)) versions.add(m[1]);
    expect([...versions].length).toBeLessThanOrEqual(1);
  });
});
