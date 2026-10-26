import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import * as web from './dates.js';

const server = createRequire(import.meta.url)('../../api/src/lib/dates.js');

const VERSION = { kind: 'month', label: 'version' };
const TP = { label: 'T', parent: 'version' };
const TASK = { kind: 'day', label: 'task "T1"' };

// Every case of js/lib/dates.test.js for the nine functions the two twins share.
const CASES = [
  ['isDay', ['20260431']], ['isDay', ['20260229']], ['isDay', ['20240229']],
  ['isDay', ['2026-04-30']], ['isDay', ['15/03/20']], ['isDay', [null]],
  ['isMonth', ['202613']], ['isMonth', ['202600']], ['isMonth', ['2026-05']],
  ['isMonth', [' 202605']], ['isMonth', ['202605']],
  ['toYmd', ['2026-04-30']], ['toYmd', ['2026-04-31']],
  ['toIso', ['20260430']], ['toIso', ['x']],
  ['monthFirstDay', ['202602']], ['monthLastDay', ['202602']],
  ['monthLastDay', ['202402']], ['monthLastDay', ['202613']],
  ['isOrdered', ['202609', '202607']], ['isOrdered', ['202607', '202607']],
  ['isOrdered', ['', '202607']], ['isOrdered', [null, undefined]],
  ['isOrdered', ['202613', '']], ['isOrdered', ['2026-03-02', '20260301']],
  ['isOrdered', ['2026-03-01', '20260302']],
  ['periodError', ['202609', '202607', VERSION]],
  ['periodError', ['2026-05', '', VERSION]],
  ['periodError', ['2026-04-31', '', TASK]],
  ['periodError', ['', '202613', VERSION]],
  ['periodError', ['202607', '202609', VERSION]],
  ['periodError', ['', '', VERSION]],
  ['periodError', ['2026-07-01', '', { kind: 'day', label: 'task' }]],
  ['taskPeriodError', ['2026-05-01', '2026-06-01', '202604', '202612', TP]],
  ['taskPeriodError', ['2026-03-01', '', '202604', '202612', TP]],
  ['taskPeriodError', ['', '2027-01-01', '202604', '202612', TP]],
  ['taskPeriodError', ['2026-08-01', '', '202609', '202607', TP]],
  ['taskPeriodError', ['', '', '202604', '202612', TP]]
];

describe('twins agree', () => {
  it.each(CASES)('%s(%j) is identical in the browser and server modules', (fn, args) => {
    expect(server[fn](...args)).toEqual(web[fn](...args));
  });
  it('the server twin does not export the browser-only text functions', () => {
    ['parseDayText', 'formatDayText', 'parseMonthText', 'formatMonthText', 'parseDateInput', 'isWithin',
      'taskDateBounds', 'periodBounds', 'outOfPeriodTasks']
      .forEach(n => expect(server[n]).toBeUndefined());
  });
});

// ---- Static checks (Spec 2026-10-24 §2.4) ----
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DATES_MODULES = new Set(['js/lib/dates.js', 'api/src/lib/dates.js']);
const EXEMPT_PREFIXES = ['api/src/scripts/', 'api/src/db/'];
const EXEMPT_FILES = new Set(['api/src/restore-backup.js']);
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

describe('dates guard', () => {
  it('date validation and normalisation live only in the two dates modules', () => {
    const offenders = sources.filter(f =>
      !DATES_MODULES.has(f) && !EXEMPT_FILES.has(f) && !EXEMPT_PREFIXES.some(p => f.startsWith(p)) &&
      /isNaN\(new Date\(|\.replace\(\/-\/g/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('every route that writes versions, projects or tasks requires lib/dates', () => {
    const writes = /INSERT INTO (cost_grid_versions|projects|tasks|project_tasks)\b|UPDATE (cost_grid_versions|projects|tasks|project_tasks) SET/;
    const offenders = files
      .filter(f => /^api\/src\/routes\/[^/]+\.js$/.test(f) && !/\.test\.js$/.test(f))
      .filter(f => { const t = read(f); return writes.test(t) && !t.includes("require('../lib/dates')"); });
    expect(offenders).toEqual([]);
  });

  it('every page that uses a date control or date function loads js/lib/dates.js', () => {
    const uses = /js\/cg-controls\.js|js\/costgrid\.js|\b(parseDayText|formatDayText|parseMonthText|formatMonthText|parseDateInput|isWithin|toYmd|toIso|isOrdered)\(/;
    const offenders = files
      .filter(f => /^[^/]+\.html$/.test(f))
      .filter(f => { const t = read(f); return uses.test(t) && !/js\/lib\/dates\.js/.test(t); });
    expect(offenders).toEqual([]);
  });

  it('every reference to js/lib/dates.js carries the same ?v=N', () => {
    const versions = new Set();
    for (const f of sources) for (const m of read(f).matchAll(/dates\.js\?v=(\d+)/g)) versions.add(m[1]);
    expect([...versions].length).toBeLessThanOrEqual(1);
  });
});

describe('project-config date fields', () => {
  const html = read('project-config.html');
  const pickers = html.match(/<cg-date-picker\b[^>]*>/g) || [];

  it('no native month input, Italian text input or old date helpers remain', () => {
    for (const s of ['type="month"', 'gg/mm', 'ymdToIt', 'itToYmd', 'month2ym', 'ym2month', 'onDateChange']) {
      expect(html.includes(s), s).toBe(false);
    }
  });

  it('uses four registered cg-date-picker, each disabled for the viewer', () => {
    expect(pickers.length).toBe(4);
    expect(html).toContain(".component('cg-date-picker', window.CgDatePicker)");
    for (const p of pickers) expect(p).toContain(':disabled="isViewer"');
  });

  it('an emptied task date is saved as an empty string', () => {
    expect(html).toContain('toIso(task.startDate) || \'\'');
    expect(html).toContain('toIso(task.endDate) || \'\'');
    expect(html).toContain("task.startDate = v ? toYmd(v) : ''");
    expect(html).toContain("task.endDate = v ? toYmd(v) : ''");
  });
});

describe('portfolio custom range', () => {
  const html = read('portfolio.html');
  const pickers = html.match(/<cg-date-picker\b[^>]*>/g) || [];

  it('uses two inline-popover day pickers bounded by each other, no native date input', () => {
    expect(html.includes('type="date"')).toBe(false);
    expect(pickers.length).toBe(2);
    for (const p of pickers) {
      expect(p).toContain('mode="day"');
      expect(p).toContain('inline-popover');
    }
    expect(pickers[0]).toContain(':max="filterEnd"');
    expect(pickers[1]).toContain(':min="filterStart"');
    expect(html).toContain(".component('cg-date-picker', window.CgDatePicker)");
  });

  it('loads the picker assets', () => {
    for (const s of ['css/controls.css?v=1', 'js/lib/dates.js?v=4', 'js/lib/cg-controls-calc.js?v=2', 'js/cg-controls.js?v=5']) {
      expect(html, s).toContain(s);
    }
  });

  it('portfolio.css is at the same version on both pages that load it', () => {
    for (const f of ['portfolio.html', 'program.html']) expect(read(f), f).toContain('css/portfolio.css?v=8');
  });
});

describe('closing guards (Spec 2026-10-24 §2.7)', () => {
  const pages = files.filter(f => /^[^/]+\.html$/.test(f));
  const NUMERIC = /\b(dd|mm|gg)\/(mm|dd|yy|aa)|yyyy|aaaa/i;

  it('no page uses a native date or month input', () => {
    const offenders = pages.filter(f => /type=["'](date|month)["']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('no date placeholder is numeric', () => {
    const offenders = [];
    for (const f of pages) {
      for (const m of read(f).matchAll(/placeholder=(["'])(.*?)\1/g)) {
        if (NUMERIC.test(m[2])) offenders.push(`${f}: ${m[2]}`);
      }
    }
    if (NUMERIC.test(read('js/cg-controls.js'))) offenders.push('js/cg-controls.js');
    expect(offenders).toEqual([]);
  });

  it('every page that loads js/cg-controls.js loads css/controls.css', () => {
    const offenders = pages.filter(f => { const t = read(f); return /js\/cg-controls\.js/.test(t) && !/css\/controls\.css/.test(t); });
    expect(offenders).toEqual([]);
  });

  it.each(['js/cg-controls.js', 'js/lib/cg-controls-calc.js', 'css/controls.css'])(
    'every reference to %s carries the same ?v=N', target => {
      const esc = target.split('.').join('[.]');
      const re = new RegExp(esc + '[?]v=([0-9]+)', 'g');
      const versions = new Set();
      let refs = 0;
      for (const f of files.filter(x => /\.(js|html|css)$/.test(x) && !/\.test\.js$/.test(x))) {
        for (const m of read(f).matchAll(re)) { versions.add(m[1]); refs++; }
      }
      expect(refs).toBeGreaterThan(0);
      expect(versions.size).toBe(1);
    });
});
