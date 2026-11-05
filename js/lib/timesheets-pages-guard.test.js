// Static guard for the Timesheets redesign (spec docs/superpowers/specs/2026-11-05-timesheets-redesign-design.md):
// the shared header and sub-nav, and what neither page may contain any more. The interactive behaviour
// (one delete call, the drawer discarding edits, one action at a time) has no runtime harness here and is
// checked by hand at /finish-cycle Gate 2.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = p => readFileSync(join(process.cwd(), p), 'utf8');
const styles = html => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const EMOJI = /[\p{Extended_Pictographic}↺▴▾▲▼]/u;
const SUBTITLE = 'Uploaded actuals and the experience profiles built from them.';

const shared = (file, active) => {
  const html = read(file);
  const app = html.indexOf('<div id="app"');

  it('mounts the Timesheets sub-nav outside the Vue root with the right active item', () => {
    const nav = html.indexOf(`<nav class="md-subnav" data-subnav-set="timesheets" data-md-active="${active}"`);
    expect(nav).toBeGreaterThan(-1);
    expect(app).toBeGreaterThan(nav);
  });

  it('has the shared page head and no header button', () => {
    expect(html).toMatch(/<h1 class="ph-title">Timesheets<\/h1>/);
    expect(html).toContain(`<div class="ph-sub">${SUBTITLE}</div>`);
    expect(html.indexOf('class="ph"')).toBeLessThan(app);
    expect(html).not.toContain('ph-btn');
    expect(html).not.toContain('Profile processing →');
  });

  it('uses no native dialog, no emoji and no hex colour', () => {
    expect(html).not.toMatch(/\b(confirm|alert)\(/);
    expect(html).not.toMatch(EMOJI);
    expect(styles(html)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).toContain('id="confirmModal"');
  });

  it('loads the sub-nav module before the app script', () => {
    const sub = html.indexOf('<script type="module" src="js/lib/md-subnav.js?v=');
    expect(sub).toBeGreaterThan(-1);
    expect(html.lastIndexOf('<script type="module">')).toBeGreaterThan(sub);
  });

  return html;
};

describe('timesheets.html (Actuals)', () => {
  const html = shared('timesheets.html', 'actuals');

  it('says Load Actuals, not Load XLS', () => {
    expect(html).toContain('Load Actuals');
    expect(html).not.toContain('Load XLS');
  });

  it('confirms Delete actuals with showConfirm and loads the list module', () => {
    expect(html).toMatch(/showConfirm\(/);
    expect(html).toContain('Delete actuals');
    expect(html).toMatch(/<script type="module" src="js\/lib\/timesheets-list\.js\?v=\d+"><\/script>/);
    expect(html).toContain('groupTimesheetRows(');
    expect(html).toContain("setSubnavBadge('profileJobs'");
  });
});

describe('profile-jobs.html (Profile processing)', () => {
  const html = shared('profile-jobs.html', 'profileJobs');

  it('replaces the <details> run history with a segmented view switch', () => {
    expect(html).not.toContain('<details');
    expect(html).toMatch(/class="md-seg pj-seg"[\s\S]*Project codes[\s\S]*Run history/);
    expect(html).toContain("view === 'history'");
  });

  it('confirms Rebuild all and Remove from queue with showConfirm', () => {
    expect(html).toMatch(/showConfirm\(\s*'Rebuild every profile\?/);
    expect(html).toMatch(/showConfirm\(\s*`Remove "\$\{code\}" from the queue\?/);
  });

  it('drives Save schedule from settingsState and the badge from refresh()', () => {
    expect(html).toContain('window.settingsState(this.form, this.settings)');
    const refresh = html.slice(html.indexOf('async refresh() {'), html.indexOf('startAutoRefresh() {'));
    expect(refresh).toContain("setSubnavBadge('profileJobs', this.queuedCount");
    expect(refresh).toContain("setSubnavBadge('profileJobs', 0)");
  });

  it('closing the drawer restores the saved schedule', () => {
    const close = html.slice(html.indexOf('closeDrawer() {'), html.indexOf('onKeydown(e) {'));
    expect(close).toContain('this.form = { ...this.settings }');
  });

  it('keys the error band by project code', () => {
    expect(html).toContain('expanded[p.project_code]');
    expect(html).toContain('Last run failed');
  });
});

describe('tablet and smartphone layouts (11.3)', () => {
  const PHONE = '@media (max-width: 767.98px)';
  const TABLET = '@media (min-width: 768px) and (max-width: 1399.98px)'; // compact table: the boards' desktop layout needs 1400px
  const block = (css, media) => {
    const i = css.indexOf(media);
    if (i < 0) return '';
    let depth = 0, j = css.indexOf('{', i);
    for (let k = j; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}' && --depth === 0) return css.slice(j, k);
    }
    return '';
  };

  it.each(['timesheets.html', 'profile-jobs.html'])('%s has a tablet and a phone block with 44px touch targets', file => {
    const css = styles(read(file));
    expect(block(css, TABLET)).not.toBe('');
    expect(block(css, PHONE)).toMatch(/min-height:\s*44px/);
  });

  it('timesheets.html moves Client, Project and year into a Filters sheet on phone', () => {
    const html = read('timesheets.html');
    expect(html).toContain("'Filters' + (sheetCount ? ' (' + sheetCount + ')' : '')");
    expect(html).toContain('class="ts-filter-set"');
  });

  it('profile-jobs.html offers Remove from queue in a More menu on tablet', () => {
    const html = read('profile-jobs.html');
    expect(html).toMatch(/class="dropdown pj-more"[\s\S]*Remove from queue/);
  });
});

describe('Gate 3 round 1 fixes', () => {
  it.each(['timesheets.html', 'profile-jobs.html'])('%s styles icons by .pd-icon, never by the ph-icon tag (it renders an svg)', file => {
    expect(styles(read(file))).not.toMatch(/ph-icon/);
  });

  it.each(['timesheets.html', 'profile-jobs.html'])('%s never binds a class on a Bootstrap dropdown toggle (Vue would wipe .show)', file => {
    const toggles = [...read(file).matchAll(/<button\b[^>]*data-bs-toggle="dropdown"[^>]*>/g)].map(m => m[0]);
    expect(toggles.length).toBeGreaterThan(0);
    for (const t of toggles) expect(t).not.toMatch(/\s:class=/);
  });

  it('timesheets.html returns focus from the View modal and traps Tab in it', () => {
    const html = read('timesheets.html');
    const close = html.slice(html.indexOf('closeView() {'), html.indexOf('async loadRows()'));
    expect(close).toContain('_returnFocus');
    expect(html).toMatch(/onKeydown\(e\) \{[\s\S]*'Tab'[\s\S]*\.ts-view/);
  });

  it('timesheets.html drops a deleted row even when the reload fails', () => {
    const html = read('timesheets.html');
    const del = html.slice(html.indexOf('deleteCode(row) {'), html.indexOf('async viewRows('));
    expect(del).toMatch(/await Api\.timesheets\.delete\(code\);\s*this\.rows = this\.rows\.filter\(/);
  });
});

describe('Gate 3 round 2 fixes', () => {
  const html = read('timesheets.html');
  const method = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));

  it('viewRows renders the modal before moving focus into it', () => {
    const v = method('async viewRows(r) {', 'async downloadXlsx(');
    expect(v.indexOf('this.modal = {')).toBeGreaterThan(-1);
    expect(v.indexOf('this.modal = {')).toBeLessThan(v.indexOf('$nextTick'));
  });

  it('the Filters sheet is a dialog only while open, takes focus and traps Tab', () => {
    expect(html).toMatch(/class="ts-filter-set"[^>]*:role="sheetOpen \? 'dialog' : null"[^>]*:aria-modal="sheetOpen \? 'true' : null"/);
    expect(html).not.toMatch(/class="ts-filter-set"[^>]*\srole="dialog"/);
    expect(method('openSheet() {', 'closeSheet() {')).toContain('$nextTick');
    expect(method('closeSheet() {', 'onKeydown(e) {')).toContain('_sheetReturn');
    expect(method('onKeydown(e) {', 'closeView() {')).toContain('.ts-filter-set');
  });
});

describe('Gate 3 round 3 fixes', () => {
  const ts = read('timesheets.html');
  const pj = read('profile-jobs.html');
  const between = (h, a, b) => h.slice(h.indexOf(a), h.indexOf(b));

  it('Esc yields only when a dropdown menu was really open, read in the capture phase before Bootstrap hides it', () => {
    expect(ts).toMatch(/addEventListener\('keydown', [^\n]*_escForDropdown[^\n]*, true\)/);
    const kd = between(ts, 'onKeydown(e) {', 'closeView() {');
    expect(kd).toContain('this._escForDropdown');
    expect(kd).not.toContain('e.defaultPrevented');
  });

  it('the phone Filters sheet closes when the viewport leaves the phone breakpoint', () => {
    expect(ts).toMatch(/matchMedia\('\(max-width: 767\.98px\)'\)[\s\S]*closeSheet\(\)/);
  });

  it('the settings drawer shows the outcome of its own actions', () => {
    const drawer = between(pj, '<aside class="pj-drawer"', '</aside>');
    expect(drawer).toContain('actionError');
    expect(drawer).toContain('actionInfo');
  });
});

describe('Gate 3 round 4 fixes', () => {
  it('Esc yields only to a dropdown the event is inside, as Bootstrap does', () => {
    const ts = read('timesheets.html');
    const kd = ts.slice(ts.indexOf('onKeydown(e) {'), ts.indexOf('closeView() {'));
    expect(kd).toMatch(/this\._escForDropdown && [^\n]*e\.target\.closest\('\.dropdown-menu, \[data-bs-toggle="dropdown"\]'\)/);
  });

  it('opening the settings drawer clears page-action alerts', () => {
    const pj = read('profile-jobs.html');
    const open = pj.slice(pj.indexOf('openDrawer() {'), pj.indexOf('closeDrawer() {'));
    expect(open).toContain('this.actionError = null');
    expect(open).toContain('this.actionInfo = null');
  });
});

describe('Gate 3 round 5 fix', () => {
  it('Settings cannot open the drawer while a page action runs', () => {
    expect(read('profile-jobs.html')).toMatch(/<button[^>]*class="pj-btn pj-settings-btn"[^>]*:disabled="!!busyAction"/);
  });
});
