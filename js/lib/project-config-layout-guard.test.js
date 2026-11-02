// Guard over the project-config.html redesign (2026-11-02): the page head, the section index, the task table,
// the merged phasing card, the Tags section shared with costgrid.html, page hygiene and the responsive layout.
// Spec: docs/superpowers/specs/2026-11-02-project-config-redesign-design.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spreadEvenly, splitState } from './config-form-calc.js';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('shared tag rules', () => {
  const style = read('css/style.css');
  const cg = read('css/costgrid.css');
  const SELECTORS = [
    '.cg-section-header', '.cg-section-header:focus-visible', '.cg-section-chevron', '.cg-section-chevron--collapsed',
    '.cg-section-title', '.cg-section-toggle-label', '.cg-tag-groups', '.cg-tag-summary', '.cg-tag-summary-pill',
  ];
  it.each(SELECTORS)('%s lives in style.css, not in costgrid.css', (sel) => {
    expect(style).toContain(sel + ' {');
    expect(cg).not.toMatch(new RegExp('^' + esc(sel) + '\\s*\\{', 'm'));
  });
  it('keeps the cost-grid-only chevron rule in costgrid.css', () => {
    expect(cg).toContain('.cg-summary-bar .cg-section-chevron');
  });
});

const html = read('project-config.html');
// Source of a page method indented at 6 spaces (same idiom as the other project-config guards).
function method(name) {
  const m = html.match(new RegExp(String.raw`\n      (?:async )?` + name + String.raw`\(([^)]*)\) \{([\s\S]*?)\n      \},`));
  if (!m) throw new Error('method not found: ' + name);
  return { args: m[1].split(',').map(s => s.trim()).filter(Boolean), body: m[2] };
}
function run(name, vm, ...args) {
  const { args: names, body } = method(name);
  return new Function(...names, body).apply(vm, args);
}
// Text of the first element opened by `openTag` (exact string), depth-aware for nested same-name tags.
function elementAt(openTag, from = 0) {
  const at = html.indexOf(openTag, from);
  if (at < 0) return '';
  const tag = openTag.match(/^<(\w+)/)[1];
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
  re.lastIndex = at + openTag.length;
  let depth = 1, t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(at, t.index + t[0].length);
  }
  return '';
}
const tagWith = (snippet, text) => {
  const at = text.indexOf(snippet);
  if (at < 0) return '';
  const from = text.lastIndexOf('<', at);
  return text.slice(from, text.indexOf('>', at) + 1);
};

describe('page head and save', () => {
  const actions = elementAt('<div class="ph-actions">');
  it('puts Project Dashboard, Discard and Save in .ph-actions', () => {
    expect(actions).toContain('@click="onSave"');
    expect(actions).toContain('ph-btn-primary');
    expect(actions).toContain('@click="onDiscard"');
    expect(actions).toContain('goProjectDashboard');
  });
  it('hides Save and Discard from the viewer and disables Discard when clean', () => {
    const save = tagWith('@click="onSave"', actions);
    const discard = tagWith('@click="onDiscard"', actions);
    expect(save).toContain('v-if="!isViewer"');
    expect(discard).toContain('v-if="!isViewer"');
    expect(discard).toMatch(/:disabled="[^"]*(isDirty|isProjectDirty)/);
  });
  it('has no bottom button row and no save emoji', () => {
    expect(html).not.toContain('Back to Portfolio');
    expect(html).not.toContain('💾');
  });
  it('backs to the portfolio under a Project configuration eyebrow', () => {
    const back = html.match(/<a[^>]*class="ph-back"[^>]*>[\s\S]*?<\/a>/g) || [];
    expect(back.length).toBe(1);
    expect(back[0]).toContain('href="/portfolio.html"');
    expect(back[0]).toContain('<span>Portfolio</span>');
    expect(html).toMatch(/class="ph-eyebrow"[^>]*>Project configuration</);
  });
  it('loads css/project-config.css on this page only, without hex', () => {
    expect(html).toMatch(/css\/project-config\.css\?v=\d+/);
    for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'project-config.html')) {
      expect(read(f), f).not.toContain('css/project-config.css');
    }
    expect(read('css/project-config.css')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('onSave returns at once while a save is in flight', () => {
    expect(method('onSave').body.trimStart().startsWith('if (this.saving) return;')).toBe(true);
  });
  it('normalizeProject round-trips a null monthlyDistribution to {}', () => {
    const vm = {};
    const p = run('normalizeProject', vm, { tasks: [{ monthlyDistribution: null }], groups: [] });
    expect(p.tasks[0].monthlyDistribution).toEqual({});
    const again = run('normalizeProject', vm, JSON.parse(JSON.stringify(p)));
    expect(JSON.stringify(again)).toBe(JSON.stringify(p));
  });
  it('onDiscard restores the snapshot through normalizeProject and clears the invalid fields', () => {
    const body = method('onDiscard').body;
    expect(body).toContain("this.showConfirm('Discard all unsaved changes?')");
    expect(body).toContain('this.normalizeProject(JSON.parse(this.savedSnapshot))');
    for (const k of ['phasingInvalid', 'ptcInvalid', 'rateInvalid']) expect(body).toContain(`this.${k} = {}`);
    expect(body).toContain('this.openTaskIndex = null');
  });
});

const SECTION_KEYS = ['client', 'info', 'actuals', 'tasks', 'phasing', 'ptc', 'groups', 'tags'];

describe('section index', () => {
  it('renders the index from sections and scrolls with window.scrollTo', () => {
    expect(html).toContain('class="pc-index"');
    expect(html).toContain('v-for="s in sections"');
    expect(html).toContain('@click.prevent="scrollToSection(s.key)"');
    expect(html).toContain('IntersectionObserver');
    expect(html).toContain('window.scrollTo(');
    expect(html).not.toContain('scrollIntoView');
  });
  it('gives every card its id and data-section', () => {
    for (const k of SECTION_KEYS) {
      expect(html).toContain(`id="pc-sec-${k}"`);
      expect(html).toContain(`data-section="${k}"`);
    }
  });
  it('has no numbered section titles', () => {
    for (const m of html.matchAll(/class="[^"]*cfg-section-title[^"]*"[^>]*>([\s\S]*?)<\//g)) {
      expect(m[1], m[1]).not.toMatch(/^\s*(<span>)?\s*\d\.\s/);
    }
  });
  it('labels the empty program option', () => {
    expect(html).toContain('No program · standalone project');
  });
  it('has no emoji from Client to Actuals and no status emoji anywhere', () => {
    const slice = html.slice(html.indexOf('id="pc-sec-client"'), html.indexOf('id="pc-sec-tasks"'));
    expect(slice.length).toBeGreaterThan(0);
    expect(slice).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const e of ['✅', '❌', '⏳']) expect(html).not.toContain(e);
  });
  it('sectionIssues flags tasks, phasing and PTC', () => {
    const src = html.match(/\n      sectionIssues\(\) \{([\s\S]*?)\n      \},/)?.[1];
    expect(src).toBeTruthy();
    const base = {
      project: { tasks: [], startDate: '202601', endDate: '202602', phasing: {}, planning: {} },
      outOfPeriod: [], rateInvalid: {}, phasingInvalid: {}, ptcInvalid: {},
      projectMonths: ['202601', '202602'], grandTotalBudget: 0, grandTotalHours: 0,
      phasingSum: 0, planningSum: 0, currencyDigits: 2,
      taskMonthRange: () => ['202601', '202602'],
    };
    const calc = extra => {
      const prev = globalThis.window;
      globalThis.window = { splitState: (d, ms) => { const sum = ms.reduce((s, m) => s + (d?.[m] || 0), 0); return { valid: Math.abs(sum - 100) <= 0.5 }; },
        phasingBalance: (s, t) => ({ balanced: Math.abs(s - t) < 0.005 }) };
      try { return new Function(src).call({ ...base, ...extra }); } finally { globalThis.window = prev; }
    };
    expect(calc({})).toEqual({ tasks: null, phasing: null, ptc: null });
    expect(calc({ project: { ...base.project, tasks: [{ monthlyDistribution: {} }] } }).tasks).toBeTruthy();
    expect(calc({ ptcInvalid: { 0: 'x' } }).ptc).toBeTruthy();
    expect(calc({ phasingInvalid: { '202601': 'x' } }).phasing).toBeTruthy();
    expect(calc({ grandTotalBudget: 100, phasingSum: 90 }).phasing).toBeTruthy();
    expect(calc({ grandTotalBudget: 100, phasingSum: 100, grandTotalHours: 10, planningSum: 10 }).phasing).toBeNull();
  });
});

// Every <button> whose text is exactly `label`.
const buttonsLabelled = label => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
  .filter(m => m[1].replace(/<[^>]+>/g, '').trim() === label).map(m => m[0].slice(0, m[0].indexOf('>') + 1));

describe('task table', () => {
  it('opens one task at a time from its row', () => {
    expect(html).toContain('v-if="openTaskIndex === ti"');
    const row = tagWith('@click="toggleTask(ti)"', html);
    expect(row).toContain(':aria-expanded="openTaskIndex === ti"');
    expect(row).toContain('role="button"');
  });
  it('shows the split months in English', () => {
    expect(html).not.toContain("monthLabel(ym, 'it-IT')");
  });
  it.each(['Spread all evenly', 'Spread evenly', 'Clear', '+ Add role', 'Remove task'])('"%s" is hidden from the viewer', label => {
    const btns = buttonsLabelled(label);
    expect(btns.length, label).toBeGreaterThan(0);
    for (const b of btns) expect(b, b).toMatch(/v-if="[^"]*!isViewer/);
  });
  const months = t => t.months;
  const mkVm = tasks => {
    const vm = { isViewer: false, project: { tasks }, taskMonthRange: months };
    vm.isSplitReadonly = task => run('isSplitReadonly', vm, task);
    return vm;
  };
  it('Spread all evenly changes only multi-month, open, unsplit tasks', () => {
    const tasks = [
      { months: ['202601', '202602'], completed: false, monthlyDistribution: { '202601': 50, '202602': 50 } },
      { months: ['202601'], completed: false, monthlyDistribution: {} },
      { months: ['202601', '202602', '202603'], completed: true, monthlyDistribution: {} },
      { months: ['202601', '202602', '202603'], completed: false, monthlyDistribution: {} },
    ];
    const before = JSON.parse(JSON.stringify(tasks));
    run('spreadAllTasks', mkVm(tasks));
    expect(tasks.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(tasks[3].monthlyDistribution).toEqual(spreadEvenly(tasks[3].months));
    expect(splitState(tasks[3].monthlyDistribution, tasks[3].months).valid).toBe(true);
  });
  it('Spread evenly and Clear do nothing on a read-only split', () => {
    const tasks = [{ months: ['202601'], completed: false, monthlyDistribution: { '202601': 100 } },
      { months: ['202601', '202602'], completed: true, monthlyDistribution: { '202601': 10 } }];
    const vm = mkVm(tasks);
    for (const ti of [0, 1]) { run('spreadTask', vm, ti); run('clearTaskSplit', vm, ti); }
    expect(tasks[0].monthlyDistribution).toEqual({ '202601': 100 });
    expect(tasks[1].monthlyDistribution).toEqual({ '202601': 10 });
    const open = mkVm([{ months: ['202601', '202602'], completed: false, monthlyDistribution: {} }]);
    run('spreadTask', open, 0);
    expect(open.project.tasks[0].monthlyDistribution).toEqual({ '202601': 50, '202602': 50 });
    run('clearTaskSplit', open, 0);
    expect(open.project.tasks[0].monthlyDistribution).toEqual({});
  });
  it('the split badge methods delegate to splitState right after rebuildTaskDist', () => {
    const after = html.slice(html.indexOf('rebuildTaskDist(ti) {'));
    expect(after.indexOf('distBadgeClass(task) {')).toBe(after.indexOf('\n      },\n') + 16);
    expect(method('distBadgeClass').body).toContain('window.splitState(');
    expect(method('distBadgeText').body).toContain('window.splitState(');
  });
});

describe('monthly phasing', () => {
  const clicks = name => (html.match(new RegExp('@click="' + name + '"', 'g')) || []).length;
  it('has one Derive and one Reforecast button', () => {
    expect(clicks('derivePhasing')).toBe(1);
    expect(clicks('runReforecast')).toBe(1);
  });
  it('switches the two series with v-show', () => {
    expect(html).toContain(`v-show="phasingMode === 'budget'"`);
    expect(html).toContain(`v-show="phasingMode === 'hours'"`);
  });
  it('is one card under one title', () => {
    expect(html).not.toContain('Monthly Budget Phasing');
    expect(html).not.toContain('Monthly Hour Planning');
    expect(html).toContain('Set Start and End month first.');
  });
  it('actualMonths collects the YYYYMM of the loaded actuals (ISO dates, as the upload stores them)', () => {
    const src = html.match(/\n      actualMonths\(\) \{([\s\S]*?)\n      \},/)?.[1];
    expect(src).toBeTruthy();
    const set = new Function(src).call({ actuals: { exportRows: [{ date: '2026-01-15' }, { date: '2026-02-03' }, { date: '2026-02-28' }, { date: null }] } });
    expect([...set].sort()).toEqual(['202601', '202602']);
    expect([...new Function(src).call({ actuals: { exportRows: null } })]).toEqual([]);
  });
});

describe('optional sections and page hygiene', () => {
  it('has no emoji anywhere in the page', () => {
    const hits = [...html.matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]);
    expect(hits).toEqual([]);
  });
  it('has no hex colour in the page', () => {
    // href="#" is a link, not a colour; element ids in selectors (#confirmModal…) never form a 3-8 hex word.
    const text = html.replace(/href="#"/g, '');
    expect(text.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
  it('builds Tags with the cost grid markup', () => {
    const tags = elementAt('<div id="pc-sec-tags"');
    for (const c of ['cg-section-header', 'cg-section-chevron', 'cg-tag-summary', 'cg-tag-groups', 'tag-group', 'toggleTagsCollapsed']) {
      expect(tags, c).toContain(c);
    }
    expect(tags).not.toContain('Manage lists');
  });
  it('words the groups and PTC states', () => {
    expect(html).toContain('Any task');
    expect(html).not.toContain('— any task —');
    expect(html).toContain('No pass-through costs');
    expect(html).not.toContain('fff3cd');
  });
  it.each(['+ Add PTC', '+ Add group'])('"%s" is hidden from the viewer', label => {
    const btns = buttonsLabelled(label);
    expect(btns.length, label).toBeGreaterThan(0);
    for (const b of btns) expect(b, b).toMatch(/v-if="[^"]*!isViewer/);
  });
});
