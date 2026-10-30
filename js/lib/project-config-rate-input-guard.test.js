// Static guard: project-config.html's resource hourly rate is a text input typed and shown in the
// project's currency (currency cycle 2), read only through window.readMoneyInput.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'project-config.html'), 'utf8');

function rateTag() {
  const at = html.indexOf('res.hourlyRate', html.indexOf('<td><input'));
  const from = html.lastIndexOf('<input', at);
  return html.slice(from, html.indexOf('>', html.indexOf('@blur', from)) + 1);
}

describe('project-config resource hourly rate input', () => {
  it('is a text input without v-model.number', () => {
    const tag = rateTag();
    expect(tag).toContain('type="text"');
    expect(tag).not.toContain('v-model.number="res.hourlyRate"');
  });
  it('shows the unformatted amount on focus and reads on blur', () => {
    const tag = rateTag();
    expect(tag).toContain('moneyInput(res.hourlyRate)');
    expect(tag).toContain('@blur="onResRateBlur(ti, ri, $event)"');
    expect(tag).toContain(':disabled="isViewer"');
  });
  it('keeps the typed text bound while the rate is invalid', () => {
    const tag = rateTag();
    expect(tag).toContain("rateInvalid[ti + '-' + ri] !== undefined ? rateInvalid[ti + '-' + ri] :");
    expect(tag).toContain("'is-invalid': rateInvalid[ti + '-' + ri] !== undefined");
    expect(tag).toContain("@focus=\"e => { if (rateInvalid[ti + '-' + ri] === undefined)");
    expect(html).toContain('this.rateInvalid[key] = e.target.value');
  });
  it('reads the text only through window.readMoneyInput', () => {
    expect(html).toContain('window.readMoneyInput(');
  });
  it('refuses to save while a rate field holds invalid text', () => {
    const save = html.slice(html.indexOf('async onSave()'), html.indexOf('this.saving = true', html.indexOf('async onSave()')));
    expect(save).toContain('if (Object.keys(this.rateInvalid).length)');
    expect(save).toContain('Fix the highlighted hourly rates before saving');
  });
  it('keeps the invalid flag out of the resource object', () => {
    expect(html).not.toContain('_rateInvalid');
  });
});
