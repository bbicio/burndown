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
