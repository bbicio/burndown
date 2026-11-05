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

  it('calls updateRate once, from the Confirm method, and keeps a server error in the dialog', () => {
    expect(html.split('updateRate(').length - 1).toBe(1);
    const confirm = between('async confirmRate()', 'closeConfirm()');
    expect(confirm).toContain('updateRate(');
    expect(confirm).toContain('if (this.confirm.saving) return;');
    const catchPart = confirm.slice(confirm.indexOf('catch'));
    expect(catchPart).toContain('this.confirm.error');
    expect(catchPart).not.toContain('globalError');
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

describe('master-currencies activation row', () => {
  it('disables Activate until currency and rate are valid, and guards a double click', () => {
    expect(html).toContain(':disabled="!actValid || act.saving"');
    const activate = between('async activateCurrency()', 'cancelActivate()');
    expect(activate).toContain('if (!this.actValid || this.act.saving) return;');
    expect(activate).toContain('Api.currencies.activate(');
    const catchPart = activate.slice(activate.indexOf('catch'));
    expect(catchPart).toContain('this.act.error');
    expect(catchPart).not.toContain('globalError');
  });
  it('starts with an empty rate and offers the row only when something can be activated', () => {
    expect(html).toMatch(/act:\s*\{[^}]*text: ''/);
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
    expect(html.split('updateRate(').length - 1).toBe(1);
    const sheet = between('class="mdc-sheet"', 'Save rate');
    expect(sheet).toContain('saveEdit');
  });
  it('has tablet and phone breakpoints', () => {
    expect(html).toContain('@media (max-width: 767.98px)');
    expect(html).toContain('@media (min-width: 768px) and (max-width: 1023.98px)');
  });
});
