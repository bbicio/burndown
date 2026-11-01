import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'costgrid.html'), 'utf8');

const body = (name) => html.match(new RegExp(name + '\\((?:[a-z, ]*)\\) \\{[\\s\\S]*?\\n    \\},'))?.[0] || '';
const fnOf = (name, args) => {
  const src = body(name);
  const inner = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  return new Function('window', 'cgScheduleAutoSave', ...args, inner);
};

function makeVm() {
  const calls = { save: 0 };
  const vm = {
    ptcFocusedTask: null, ptcRaw: '', ptcInvalid: false, ptcSnapshot: null,
    draft: { currency: 'EUR' }, currencies: [],
    moneyInput(v) { return String(v); },
  };
  const win = {
    readMoneyInput: (t) => {
      const s = String(t).trim();
      if (s === '') return null;
      return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
    },
  };
  const run = (name, ...args) => {
    const f = fnOf(name, name === 'onPtcFocus' ? ['task'] : name === 'onPtcInput' ? ['task', 'event'] : ['task']);
    return f.call(vm, win, () => { calls.save++; }, ...args);
  };
  return { vm, calls, run };
}

describe('costgrid.html task PTC input', () => {
  const input = html.match(/<input type="text" class="cg-cell-box cg-cell-box--money"[\s\S]*?@blur="[^"]*">/)?.[0] || '';

  it('no longer uses parseMoney', () => {
    expect(html).not.toContain('parseMoneyInput(');
    expect(html).not.toContain('window.parseMoney(');
  });

  it('is wired to the focus/input/blur handlers with an invalid state and a format hint', () => {
    expect(input).toContain('@focus="onPtcFocus(task)"');
    expect(input).toContain('@input="onPtcInput(task, $event)"');
    expect(input).toContain('@blur="onPtcBlur(task)"');
    expect(input).toContain("'is-invalid': ptcInvalid && ptcFocusedTask === task.taskId");
    expect(input).toContain("moneyFormatExample(draft.currency || 'EUR', currencies)");
  });

  it('declares its state', () => {
    expect(html).toMatch(/ptcInvalid: false/);
    expect(html).toMatch(/ptcSnapshot: null/);
  });

  it('invalid text flags and leaves the value; blur restores the snapshot', () => {
    const { vm, calls, run } = makeVm();
    const task = { taskId: 't1', ptc: 5 };
    run('onPtcFocus', task);
    expect(vm.ptcSnapshot).toBe(5);
    expect(vm.ptcFocusedTask).toBe('t1');
    run('onPtcInput', task, { target: { value: '12a' } });
    expect(vm.ptcInvalid).toBe(true);
    expect(task.ptc).toBe(5);
    expect(calls.save).toBe(0);
    run('onPtcBlur', task);
    expect(task.ptc).toBe(5);
    expect(calls.save).toBe(1);
    expect(vm.ptcInvalid).toBe(false);
    expect(vm.ptcSnapshot).toBe(null);
    expect(vm.ptcFocusedTask).toBe(null);
    expect(vm.ptcRaw).toBe('');
  });

  it('blur after a valid write then an invalid keystroke restores the focus snapshot', () => {
    const { vm, run } = makeVm();
    const task = { taskId: 't1', ptc: 5 };
    run('onPtcFocus', task);
    run('onPtcInput', task, { target: { value: '7' } });
    expect(task.ptc).toBe(7);
    run('onPtcInput', task, { target: { value: '7x' } });
    run('onPtcBlur', task);
    expect(task.ptc).toBe(5);
  });

  it('blank writes 0 and a number writes the number, each autosaving', () => {
    const { vm, calls, run } = makeVm();
    const task = { taskId: 't1', ptc: 5 };
    run('onPtcFocus', task);
    run('onPtcInput', task, { target: { value: '' } });
    expect(task.ptc).toBe(0);
    run('onPtcInput', task, { target: { value: '12.5' } });
    expect(task.ptc).toBe(12.5);
    expect(vm.ptcInvalid).toBe(false);
    expect(calls.save).toBe(2);
  });
});
