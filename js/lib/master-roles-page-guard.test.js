// Static guard: master-roles.html ("Roles & rates") panel, delete dialog and responsive layout.
// The rate inputs themselves are pinned by master-roles-rate-input-guard.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'master-roles.html'), 'utf8');
const between = (from, to) => {
  const a = html.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = html.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(-1);
  return html.slice(a, b);
};

describe('master-roles panel', () => {
  it('opens with every stored override, inactive currencies included', () => {
    const open = between('openRoleForm(role) {', 'closePanel()');
    expect(open).toContain('Object.entries(role?.rateOverrides || {})');
    expect(open).toContain('window.splitCode(');
  });
  it('saves the composed code and every override, never the team field', () => {
    const save = between('async saveRole()', 'async deleteRole');
    expect(save).toContain('Object.entries(this.rf.overrideTexts)');
    expect(save).toContain('const code  = window.joinCode(this.rf.team, this.rf.roleCode);');
    expect(save).toContain('r.code.toLowerCase() === code.toLowerCase()');
    expect(save).not.toMatch(/team\s*:/);
  });
  it('starts a new role in the last team used, else the first team', () => {
    const open = between('openRoleForm(role) {', 'closePanel()');
    expect(open).toContain("role ? split.team : (this.lastTeam || window.teamOptions(this.roles)[0] || '')");
  });
  it('is a modal dialog: Esc closes it, Tab stays inside, and it closes before the delete dialog opens', () => {
    expect(html).toContain('class="mdr-drawer" role="dialog" aria-modal="true"');
    const keys = between('onPanelKeydown(e) {', 'onTeamKey(e)');
    expect(keys).toContain("e.key === 'Escape'");
    expect(keys).toContain("e.key !== 'Tab'");
    const fromPanel = between('deleteFromPanel() {', 'async confirmDelete()');
    expect(fromPanel.indexOf('this.closePanel(')).toBeLessThan(fromPanel.indexOf('this.deleteRole('));
  });
  it('refuses an empty role code also on Enter, and saves against the form it started from', () => {
    const save = between('async saveRole()', 'async deleteRole');
    expect(save).toContain("if (!this.rf.roleCode.trim()) { this.rf.error = 'Role code is required.'; return; }");
    const after = save.slice(save.indexOf('const form = this.rf;'));
    expect(after).not.toMatch(/this.rf.(id|show|error|loading)/);
    expect(save).toContain('const saved = code.toUpperCase();');
  });
  it('does not close or open the delete dialog while a save runs', () => {
    expect(between('closePanel({', 'focusBack(el, roleId)')).toContain('if (this.rf.loading) return;');
    expect(between('deleteFromPanel() {', 'async confirmDelete()')).toContain('if (this.rf.loading) return;');
    for (const cls of ['mdr-dr-close', 'mdr-del-link', 'mdr-cancel']) {
      expect(html, cls).toMatch(new RegExp('class="' + cls + '"[^>]*:disabled="rf\\.loading"'));
    }
  });
  it('returns focus to the opener, else the role row, else + Add', () => {
    const back = between('focusBack(el, roleId) {', 'onPanelKeydown(e)');
    expect(back).toContain('isConnected');
    expect(back).toContain('[data-role-id=');
    expect(back).toContain('.mdr-add');
    expect(html).toContain(':data-role-id="r.id"');
  });
  it('opens a role and toggles a team from the keyboard', () => {
    expect(html).toContain('class="mdr-grp-btn" :aria-expanded="isGroupOpen(g.team)"');
    expect(html).toContain('class="mdr-role-btn" :data-role-id="r.id" @click.stop="openRoleForm(r)"');
  });
  it('disables the primary while saving or without label and role code', () => {
    expect(html).toContain(':disabled="rf.loading || !rf.label.trim() || !rf.roleCode.trim()"');
  });
});

describe('master-roles delete dialog', () => {
  it('lives inside the Vue root and states the server rule', () => {
    expect(html.indexOf('id="roleDeleteModal"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="roleDeleteModal"')).toBeLessThan(html.indexOf('</div><!-- #app -->'));
    expect(html).toContain("A role used in a cost grid or assigned to a team resource can't be deleted.");
  });
  it('sends one request and keeps a refusal inside the dialog', () => {
    const body = between('async confirmDelete()', '\n    },\n  },\n})');
    expect(body).toMatch(/^async confirmDelete\(\) \{\s*if \(this\.del\.loading/);
    expect(body).toContain('del.error = e.message');
    expect(body).not.toContain('globalError');
    expect(body).toContain('const del = this.del, role = del.role;');
    expect(body).toContain('this.roles.filter(r => r.id !== role.id)');
    // only the rule refusal blocks a retry
    expect(body).toContain("del.blocked = /^Cannot delete role /.test(");
    expect(html).toContain(':disabled="del.loading || del.blocked"');
  });
  it('cannot be dismissed while its delete runs', () => {
    expect(html).toContain('data-bs-dismiss="modal" :disabled="del.loading"');
    expect(html).toContain("this._onDelHide = e => { if (this.del.loading) e.preventDefault(); };");
    expect(html).toContain("addEventListener('hide.bs.modal', this._onDelHide)");
  });
});

describe('master-roles responsive layout', () => {
  it('has the tablet and phone breakpoints', () => {
    expect(html).toContain('@media (max-width: 1279.98px)');
    expect(html).toContain('@media (max-width: 767.98px)');
  });
  it('shows one currency at a time on the phone and keeps Missing rates reachable', () => {
    expect(html).toMatch(/<div class="md-seg"[^>]*>\s*<button v-for="cu in columns"/);
    expect(html).toContain(':aria-pressed="missingOnly"');
  });
});
