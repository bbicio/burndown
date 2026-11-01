// Static guard: project-config.html's PTC amounts and monthly budget phasing are text inputs read only
// through window.readMoneyInput (currency f1), following the resource hourly rate pattern.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'project-config.html'), 'utf8');

function inputTag(anchor) {
  const at = html.indexOf(anchor);
  const from = html.lastIndexOf('<input', at);
  return html.slice(from, html.indexOf('>', html.indexOf('@blur', from)) + 1);
}
const phasingTag = () => inputTag('onPhasingBlur(ym, $event)');
const ptcTag = () => inputTag('onPtcBlur(pi, $event)');
function method(name) {
  const m = html.match(new RegExp(String.raw`\n      (?:async )?` + name + String.raw`\(([^)]*)\) \{([\s\S]*?)\n      \},`));
  if (!m) throw new Error('method not found: ' + name);
  return { args: m[1].split(',').map(s => s.trim()).filter(Boolean), body: m[2] };
}
function run(name, vm, ...args) {
  const { args: names, body } = method(name);
  return new Function(...names, body).apply(vm, args);
}
const readMoneyInput = (text, code, cur, opts = {}) => {
  const t = String(text).trim();
  if (t === '') return null;
  if (t === '1.120,30' && opts.stored === 1120.304347826087) return opts.stored;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && /^[\d.,]+$/.test(t) ? n : NaN;
};
const mkVm = extra => ({
  project: { currency: 'EUR', phasing: {}, ptc: [] },
  currencies: [],
  phasingInvalid: {}, ptcInvalid: {},
  formatMoney: v => String(v),
  ...extra,
});
const withWindow = fn => {
  globalThis.window = { readMoneyInput, __currencies: [] };
  try { return fn(); } finally { delete globalThis.window; }
};

describe('project-config PTC and phasing money inputs', () => {
  it('no longer has a page parseMoney', () => {
    expect(html).not.toContain('parseMoney(');
  });
  for (const [label, tag, fn, map, key] of [
    ['phasing', phasingTag, 'onPhasingBlur(ym, $event)', 'phasingInvalid', 'ym'],
    ['PTC', ptcTag, 'onPtcBlur(pi, $event)', 'ptcInvalid', 'pi'],
  ]) {
    it(`${label} input reads on blur and shows invalid text`, () => {
      const t = tag();
      expect(t).toContain('type="text"');
      expect(t).toContain(`@blur="${fn}"`);
      expect(t).toContain(`'is-invalid': ${map}[${key}] !== undefined`);
      expect(t).toContain('moneyFormatExample(project.currency, currencies)');
      expect(t).toContain(`${map}[${key}] !== undefined ? ${map}[${key}] :`);
      expect(t).toContain(`if (${map}[${key}] === undefined)`);
      expect(t).toContain(':title=');
    });
  }
  it('onPhasingBlur flags invalid text without writing', () => {
    const vm = mkVm({ project: { currency: 'EUR', phasing: { '2026-01': 5 }, ptc: [] } });
    withWindow(() => run('onPhasingBlur', vm, '2026-01', { target: { value: 'abc' } }));
    expect(vm.phasingInvalid['2026-01']).toBe('abc');
    expect(vm.project.phasing).toEqual({ '2026-01': 5 });
  });
  it('onPhasingBlur deletes the month on blank and keeps the stored noisy value', () => {
    const vm = mkVm({ project: { currency: 'EUR', phasing: { '2026-01': 5, '2026-02': 1120.304347826087 }, ptc: [] }, phasingInvalid: { '2026-01': 'x' } });
    withWindow(() => run('onPhasingBlur', vm, '2026-01', { target: { value: '' } }));
    expect(vm.project.phasing['2026-01']).toBeUndefined();
    expect(vm.phasingInvalid).toEqual({});
    withWindow(() => run('onPhasingBlur', vm, '2026-02', { target: { value: '1.120,30' } }));
    expect(vm.project.phasing['2026-02']).toBe(1120.304347826087);
  });
  it('onPtcBlur flags invalid text, writes 0 on blank', () => {
    const vm = mkVm({ project: { currency: 'EUR', phasing: {}, ptc: [{ amount: 7 }, { amount: 9 }] } });
    withWindow(() => run('onPtcBlur', vm, 0, { target: { value: 'zz' } }));
    expect(vm.ptcInvalid[0]).toBe('zz');
    expect(vm.project.ptc[0].amount).toBe(7);
    withWindow(() => run('onPtcBlur', vm, 0, { target: { value: '' } }));
    expect(vm.project.ptc[0].amount).toBe(0);
    expect(vm.ptcInvalid).toEqual({});
  });
  it('dropPtcInvalid re-keys after a removal', () => {
    const vm = { ptcInvalid: { '0': 'a', '1': 'b', '2': 'c' } };
    run('dropPtcInvalid', vm, 1);
    expect(vm.ptcInvalid).toEqual({ '0': 'a', '1': 'c' });
    const rm = html.match(/async confirmRemovePtc\(pi\) \{[\s\S]*?\n      \},/)?.[0] || '';
    expect(rm).toContain('this.dropPtcInvalid(pi)');
  });
  it('save refuses on invalid PTC/phasing, ignores months outside the period', () => {
    const save = html.slice(html.indexOf('async onSave()'), html.indexOf('this.saving = true', html.indexOf('async onSave()')));
    expect(save).toContain('this.moneyFieldsError()');
    const mk = extra => mkVm({ projectMonths: ['2026-01', '2026-02'], ...extra });
    const msg = vm => withWindow(() => {
      globalThis.window.moneyFormatExample = () => '1.234,50';
      return run('moneyFieldsError', vm);
    });
    expect(msg(mk({ ptcInvalid: { '0': 'x' } }))).toBe('Fix the highlighted PTC and phasing amounts before saving: enter amounts in EUR, e.g. 1.234,50.');
    expect(msg(mk({ phasingInvalid: { '2026-01': 'x' } }))).toContain('Fix the highlighted PTC and phasing');
    const vm = mk({ phasingInvalid: { '2027-05': 'x' } });
    expect(msg(vm)).toBe('');
    expect(vm.phasingInvalid).toEqual({});
  });
  it('derivePhasing and runReforecast reset phasingInvalid', () => {
    for (const name of ['derivePhasing', 'runReforecast']) {
      const body = html.match(new RegExp(String.raw`(?:async )?` + name + String.raw`\([^)]*\) \{[\s\S]*?\n      \},`))?.[0] || '';
      expect(body).toContain('this.project.phasing = result.newPhasing');
      expect(body).toContain('this.phasingInvalid = {}');
    }
  });
});
