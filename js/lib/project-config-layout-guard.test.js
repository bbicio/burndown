// Guard over the project-config.html redesign (2026-11-02): the page head, the section index, the task table,
// the merged phasing card, the Tags section shared with costgrid.html, page hygiene and the responsive layout.
// Spec: docs/superpowers/specs/2026-11-02-project-config-redesign-design.md.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
