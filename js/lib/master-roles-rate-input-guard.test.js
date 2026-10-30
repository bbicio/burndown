// Static guard: master-roles.html's role rates (base + per-currency overrides) are text inputs typed
// and shown in each field's currency (currency cycle 2), read only through readMoneyInput.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'master-roles.html'), 'utf8');

function saveRoleBody() {
  const from = html.indexOf('async saveRole()');
  return html.slice(from, html.indexOf('async deleteRole', from));
}

describe('master-roles rate inputs', () => {
  it('has no number input, fmtRate, toLocaleString or hardcoded euro unit', () => {
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain('fmtRate');
    expect(html).not.toContain('toLocaleString(');
    expect(html).not.toContain('€/h');
  });
  it('binds the typed text in data, not a derived value', () => {
    expect(html).toContain('v-model="rf.rateText"');
    expect(html).toContain('v-model="rf.overrideTexts[cu.code]"');
    expect(html).not.toContain('rf.rateOverrides');
  });
  it('reformats on focus and blur', () => {
    expect(html).toContain('@focus="onMoneyFocus(');
    expect(html).toContain('@blur="onMoneyBlur(');
  });
  it('reads the rates only through readMoneyInput, with the agreed copy', () => {
    const body = saveRoleBody();
    expect(body).toContain('readMoneyInput(');
    expect(body).not.toContain('parseFloat');
    expect(body).toContain("'Default rate is required.'");
    expect(body).toContain('Enter a valid amount in ${');
    expect(body).toContain('moneyFormatExample(');
  });
  it('opens a stored 0 as "0", not blank', () => {
    expect(html).toContain("=== 0 ? '0'");
  });
  it('shows the table rate through formatMoney', () => {
    expect(html).toContain("formatMoney(r.rate, 'EUR', currencies)");
  });
});
