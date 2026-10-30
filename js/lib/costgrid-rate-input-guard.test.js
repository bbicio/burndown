import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'costgrid.html'), 'utf8');

describe('costgrid.html role rate input', () => {
  const input = html.match(/<input\b[^>]*class="cg-rate-input"[^>]*>/s)?.[0] || '';

  it('is a text input wired to the focus/input/blur handlers', () => {
    expect(input).toContain('type="text"');
    expect(input).toContain('@focus="onRateFocus(r)"');
    expect(input).toContain('@input="onRateInput(r, $event)"');
    expect(input).toContain('@blur="onRateBlur(r)"');
  });

  it('no longer uses onRateChange', () => {
    expect(html).not.toContain('onRateChange');
  });

  it('reads the typed text only through readMoneyInput', () => {
    expect(html).toContain('window.readMoneyInput(');
  });

  it('decides "missing" only through cgRateIsMissing', () => {
    const lines = html.split('\n').filter(l => /cg-rate-cell"|cg-role-col-header/.test(l) && l.includes('is-zero'));
    expect(lines.length).toBe(2);
    lines.forEach(l => expect(l).toMatch(/'is-zero':\s*cgRateIsMissing\(/));
    expect(html).not.toContain('!r.rate || r.rate === 0');
    expect(html).toContain('cgRateIsMissing(r)');
  });

  it('role-picker badge does not print the raw effective rate', () => {
    expect(html).not.toContain('{{ row.effectiveRate }}');
  });

  it('blur resets only after an edit, and input marks the edit', () => {
    const blur = html.match(/onRateBlur\(role\) \{[\s\S]*?\n    \},/)?.[0] || '';
    const inp = html.match(/onRateInput\(role, event\) \{[\s\S]*?\n    \},/)?.[0] || '';
    expect(blur).toMatch(/if \(this\.rateEdited && this\.rateRaw\.trim\(\) === ''\) this\.resetRoleRate\(role\)/);
    expect(blur).toContain('this.rateEdited = false');
    expect(inp).toContain('this.rateEdited = true');
  });

  it('blur restores the rate snapshotted on focus when the text is invalid', () => {
    const foc = html.match(/onRateFocus\(role\) \{[\s\S]*?\n    \},/)?.[0] || '';
    const blur = html.match(/onRateBlur\(role\) \{[\s\S]*?\n    \},/)?.[0] || '';
    expect(foc).toContain('this.rateSnapshot = { rate: role.rate, rateIsCustom: role.rateIsCustom }');
    expect(blur).toContain('if (this.rateInvalid && this.rateSnapshot)');
    expect(blur).toContain('role.rate = this.rateSnapshot.rate');
    expect(blur).toContain('role.rateIsCustom = this.rateSnapshot.rateIsCustom');
    expect(blur).toContain('cgScheduleAutoSave()');
    expect(blur).toContain('this.rateSnapshot = null');
    expect(blur.indexOf('this.rateInvalid && this.rateSnapshot')).toBeLessThan(blur.indexOf('resetRoleRate'));
  });

  it('focus on a custom 0 keeps the text 0', () => {
    expect(html).toMatch(/role\.rateIsCustom && role\.rate === 0/);
  });
});
