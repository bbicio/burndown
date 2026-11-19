// Static guard: master-currencies.html ("Currencies") list, inline rate edit, confirm dialog, activation row,
// history drawer and responsive sheets. The pure helpers are pinned by master-currencies.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Read as LF: the repo stores LF, a Windows checkout may hand back CRLF.
const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'master-currencies.html'), 'utf8').replace(/\r\n/g, '\n');
const between = (from, to) => {
  const a = html.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = html.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(-1);
  return html.slice(a, b);
};

describe('master-currencies page', () => {
  it('has no Bootstrap modal, native dialog, legacy form card, parseFloat or emoji', () => {
    for (const s of ['bootstrap.Modal', 'class="modal', 'confirm(', 'alert(', 'form-card', 'parseFloat(',
      'crHistoryModal', 'crRateConfirmModal', 'globalError(msg)']) {
      expect(html, s).not.toContain(s);
    }
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('has no hex colour in its inline styles', () => {
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('saves the rate once, from the Confirm method, and keeps a refusal in the dialog', () => {
    expect(html.split("saveAndReload('PATCH'").length - 1).toBe(1);
    expect(html).not.toContain('updateRate(');
    const confirm = between('async confirmRate()', 'closeConfirm()');
    expect(confirm).toContain("saveAndReload('PATCH'");
    expect(confirm).toContain('this.loadAll({ quiet: true })');
    expect(confirm).toContain('if (this.confirm.saving) return;');
    expect(confirm).toContain('this.confirm.error = res.message');
    expect(confirm).not.toContain('Network error');
  });

  it('checks the typed rate with the shared parser before the dialog opens', () => {
    const save = between('saveEdit() {', 'async confirmRate()');
    expect(save).toContain('window.parseRateText(');
    expect(save).toContain('window.isValidRate(');
    expect(save).toContain("'Rate must be a positive number'");
  });

  it('survives a failed history of one currency without a banner', () => {
    const load = between('async loadHistories(', 'startEdit(');
    expect(load).toContain('catch');
    expect(load).toContain('error: true');
    expect(load).not.toContain('globalError');
  });

  it('closes only the topmost layer on Escape', () => {
    const keys = between('onKeydown(e) {', 'symbolOf(');
    expect(keys).toContain("'Escape'");
    const order = ['act.pickerOpen', 'confirm.show', 'sheet', 'hist.code', 'edit.code'].map(s => keys.indexOf(s));
    order.forEach(i => expect(i).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('rate save on the save contract', () => {
  const confirm = () => between('async confirmRate()', 'closeConfirm()');
  it('shows the new rate from the answer before the reload outcome is checked', () => {
    const c = confirm();
    const a = c.indexOf('current_rate: res.data.rate');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(c.indexOf('res.reloaded'));
  });
  it('puts SAVED_NOT_RELOADED, not a load failure, in globalError when the reload fails', () => {
    const c = confirm();
    expect(c).toContain('globalError = window.SAVED_NOT_RELOADED');
    expect(c).toContain('globalError = res.message');
    expect(c).not.toContain('Failed to load');
  });
  it('loadAll answers true/false and sets globalError only when not quiet', () => {
    const load = between('async loadAll(', 'async loadHistories(');
    expect(load).toContain('quiet');
    expect(load).toContain('return true');
    expect(load).toContain('return false');
  });
  it('the activation adopts the answer row and refuses into act.error, never globalError', () => {
    const act = between('async activateCurrency()', 'cancelActivate()');
    expect(act).toContain('res.data');
    expect(act).toContain('this.act.error = res.message');
    expect(act).toContain('globalError = window.SAVED_NOT_RELOADED');
  });
});

describe('master-currencies activation row', () => {
  it('disables Activate until currency and rate are valid, and guards a double click', () => {
    expect(html).toContain(':disabled="!actValid || act.saving"');
    const activate = between('async activateCurrency()', 'cancelActivate()');
    expect(activate).toContain('if (!this.actValid || this.act.saving) return;');
    expect(html).not.toContain('Api.currencies.activate(');
    expect(activate).toContain("saveAndReload('POST', '/currencies/'");
    expect(activate).toContain('this.loadAll({ quiet: true })');
    expect(activate).toContain('this.act.error = res.message');
    expect(activate).toContain('res.data');
    expect(activate).not.toContain('Network error');
  });
  it('starts with an empty rate and offers the row only when something can be activated', () => {
    expect(html).toMatch(/const freshAct = \(\) => \(\{[^}]*text: ''/);
    expect(html).toContain('act:     freshAct(),');
    expect(html).toMatch(/v-if="[^"]*canActivate[^"]*!act\.show[^"]*"/);
  });
});

describe('master-currencies history drawer', () => {
  it('loads the history on open and shows its states and chart', () => {
    const open = between('async openHistory(', 'closeHistory()');
    expect(open).toContain('Api.currencies.history(');
    for (const s of ["Couldn't load the rate history.", 'No rate history yet.',
      'Every change is logged with date, time and user.', '<polyline']) {
      expect(html, s).toContain(s);
    }
  });
  it('closes from the scrim and the close button', () => {
    expect(html).toContain('class="mdc-scrim" @click="closeHistory"');
    expect(html).toContain('aria-label="Close" @click="closeHistory"');
  });
});

describe('master-currencies responsive layouts', () => {
  it('offers the phone edit sheet, saved through the same confirmed path', () => {
    for (const s of ['Edit rate · ', 'Save rate', 'applies to new proposal versions']) expect(html, s).toContain(s);
    expect(html.split("saveAndReload('PATCH'").length - 1).toBe(1);
    const sheet = between('class="mdc-sheet"', 'Save rate');
    expect(sheet).toContain('saveEdit');
  });
  it('has tablet and phone breakpoints', () => {
    expect(html).toContain('@media (max-width: 767.98px)');
    expect(html).toContain('@media (min-width: 768px) and (max-width: 1023.98px)');
  });
});

describe('master-currencies review fixes', () => {
  it('ignores a repeated or too-early Enter on Confirm (double or held Enter), never a click', () => {
    expect(html).toContain('@keydown.enter.prevent="onConfirmKey"');
    const key = between('onConfirmKey(e) {', 'async confirmRate()');
    expect(key).toContain('e.repeat');
    expect(key).toContain('window.confirmReady(this.confirm.openedAt, Date.now())');
    expect(between('async confirmRate()', 'closeConfirm()')).not.toContain('confirmReady');
    expect(between('saveEdit() {', 'onConfirmKey(e) {')).toContain('openedAt: Date.now()');
  });
  it('gives the focus back to the rate input when the dialog is cancelled', () => {
    const close = between('closeConfirm() {', 'openActivate()');
    expect(close).toContain('this.focusEditInput()');
  });
  it('refuses an unchanged rate and an out-of-range one before the dialog opens', () => {
    const save = between('saveEdit() {', 'async confirmRate()');
    expect(save).toContain('window.sameRate(');
    expect(save).toContain('window.rateError(');
  });
  it('moves an open inline row into a sheet when the width crosses the phone breakpoint', () => {
    expect(html).toContain('window.sheetOnResize(');
  });
  it('keeps the shared primary button styles, disabled state included', () => {
    expect(html).not.toMatch(/\.btn-primary:disabled/);
    expect(html).not.toMatch(/\.btn-primary\s*\{[^}]*brand-navy/);
  });
});

describe('master-currencies review round 3', () => {
  it('ignores a tap on Confirm right after the dialog opened (a double tap on Save rate)', () => {
    expect(html).toContain('@click="onConfirmClick"');
    const click = between('onConfirmClick() {', 'async confirmRate()');
    expect(click).toContain('window.confirmReady(this.confirm.openedAt, Date.now())');
  });
  it('keeps one inline row open at a time and lets Esc close the activation row', () => {
    expect(between('startEdit(cur) {', 'focusEditInput() {')).toContain('this.cancelActivate()');
    expect(between('openEditSheet(cur) {', 'openActivateSheet() {')).toContain('this.cancelActivate()');
    expect(between('onKeydown(e) {', 'symbolOf(')).toContain('this.cancelActivate()');
  });
  it('gives the focus back to Confirm after a server error', () => {
    const confirm = between('async confirmRate()', 'closeConfirm()');
    expect(confirm.slice(confirm.indexOf('this.confirm.error = res.message'))).toContain('this.$refs.confirmBtn?.focus()');
  });
});
