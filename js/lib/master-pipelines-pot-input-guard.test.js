import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'master-pipelines.html'), 'utf8');
const save = page.slice(page.indexOf('async savePot()'), page.indexOf('async deletePot('));
const open = page.slice(page.indexOf('openPotForm(pot) {'), page.indexOf('async savePot()'));

describe('master-pipelines POT amount input', () => {
  it('is a text input bound to potf.amountText, no number input on the amount', () => {
    expect(page).toMatch(/<input type="text"[^>]*inputmode="decimal"[^>]*v-model="potf\.amountText"/s);
    expect(page).not.toMatch(/type="number"[^>]*v-model="potf\.amount/s);
    expect(page).not.toMatch(/v-model="potf\.amount"/);
  });
  it('reformats on focus and blur and keeps Enter saving', () => {
    expect(page).toMatch(/v-model="potf\.amountText"[^>]*@focus="onPotAmountFocus"[^>]*@blur="onPotAmountBlur"[^>]*@keydown\.enter="savePot"/s);
  });
  it('savePot reads the text with readMoneyInput and shows the example error', () => {
    expect(save).toContain('readMoneyInput(');
    expect(save).not.toContain('parseFloat(this.potf.amount');
    expect(save).toContain("'Enter a valid amount in EUR, e.g. ' + window.moneyFormatExample('EUR', window.__currencies) + '.'");
  });
  it('every potf initialiser sets amountText, and a stored 0 reopens as 0', () => {
    expect(page).toMatch(/potf: \{[^}]*amountText: ''/);
    expect(open).toContain('amountText');
    expect(page).not.toMatch(/===s*0s*?s*'0'/);
    expect(page).toContain('keepZero: true');
    expect(open).not.toMatch(/\bamount:/);
  });
  it('passes the stored amount to readMoneyInput in save, focus and blur', () => {
    const handlers = page.slice(page.indexOf('onPotAmountFocus() {'), page.indexOf('async savePot()'));
    expect(save).toContain('stored: this.potf.stored');
    expect(handlers.match(/stored: this.potf.stored/g).length).toBe(2);
  });
  it('provides currencyInfo to the template as a method', () => {
    expect(page).toContain('currencyInfo: (...a) => window.currencyInfo(...a)');
  });
  it('has no hardcoded Target (€) label', () => {
    expect(page).not.toContain('Target (€)');
  });
});
