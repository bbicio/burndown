// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  let opts;
  const src = readFileSync('js/pages/profile.js', 'utf8');
  const fakeVue = { createApp: o => { opts = o; const app = { component() { return app; }, mount() {} }; return app; } };
  new Function('Vue', 'sectionFromHash', 'formatDayText', 'maskInitials', 'passwordStrength', 'passwordFormState',
    'PASSWORD_HINT', 'PASSWORD_PLACEHOLDER', 'deviceExpiry', 'setSubnavChip', 'mountMdSubnav', 'window',
    src)(fakeVue, () => 'details', () => '', () => '', () => ({}), () => ({}), '', '', () => '', () => {}, () => {},
    { PhIcon: {} });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  vm.pwState = { canSubmit: true };
  vm.user = { password_changed_at: 'old' };
  vm.loadDevices = vi.fn();
  vm.applyChips = vi.fn();
  return vm;
}

describe('profile page writes', () => {
  beforeEach(() => { globalThis.apiSave = vi.fn(); globalThis.showConfirm = (m, ok) => ok(); });
  const dev = () => ({ id: 'd1' });

  for (const out of [{ kind: 'ok', data: {} }, { kind: 'error', status: 404, message: 'Device not found' }]) {
    it(`removeDevice with ${out.kind} ${out.status || ''} drops the row, no error`, async () => {
      const vm = loadPage(); vm.devices.list = [dev(), { id: 'd2' }];
      apiSave.mockResolvedValue(out);
      await vm.removeDevice(vm.devices.list[0]);
      expect(apiSave.mock.calls[0].slice(0, 2)).toEqual(['DELETE', '/auth/trusted-devices/d1']);
      expect(vm.devices.list.map(d => d.id)).toEqual(['d2']);
      expect(vm.devices.error).toBe('');
      expect(vm.devices.busy).toBe('');
    });
  }
  for (const out of [{ kind: 'error', status: 500, message: 'boom' }, { kind: 'unknown', message: 'lost' }]) {
    it(`removeDevice with ${out.kind} keeps the row and shows the message`, async () => {
      const vm = loadPage(); vm.devices.list = [dev()];
      apiSave.mockResolvedValue(out);
      await vm.removeDevice(vm.devices.list[0]);
      expect(vm.devices.list).toHaveLength(1);
      expect(vm.devices.error).toBe(out.message);
    });
  }

  it('removeAll writes with apiSave and empties the list', async () => {
    const vm = loadPage(); vm.devices.list = [dev()];
    apiSave.mockResolvedValue({ kind: 'ok', data: {} });
    vm.removeAll(); await Promise.resolve(); await Promise.resolve();
    expect(apiSave.mock.calls[0].slice(0, 2)).toEqual(['DELETE', '/auth/trusted-devices']);
    expect(vm.devices.list).toEqual([]);
  });

  it('sendRequest writes with apiSave; an error shows the message', async () => {
    const vm = loadPage(); vm.req.message = 'fix my name';
    apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'too long' });
    await vm.sendRequest();
    expect(apiSave.mock.calls[0].slice(0, 3)).toEqual(['POST', '/auth/rectification-request', { message: 'fix my name' }]);
    expect(vm.req.error).toBe('too long');
    expect(vm.req.sending).toBe(false);
  });

  it('submitPassword adopts the server password_changed_at', async () => {
    const vm = loadPage();
    apiSave.mockResolvedValue({ kind: 'ok', data: { ok: true, password_changed_at: 'T' } });
    await vm.submitPassword();
    expect(apiSave.mock.calls[0][1]).toBe('/auth/change-password');
    expect(vm.user.password_changed_at).toBe('T');
    expect(vm.pw.done).toBe(true);
  });
  it('a refused current password goes under the field', async () => {
    const vm = loadPage();
    apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'Wrong', data: { field: 'currentPassword' } });
    await vm.submitPassword();
    expect(vm.pw.currentError).toBe('Wrong');
    expect(vm.pw.error).toBe('');
    expect(vm.pw.saving).toBe(false);
  });
  it('a rule refusal goes in the general message', async () => {
    const vm = loadPage();
    apiSave.mockResolvedValue({ kind: 'rule', code: 'PASSWORD_RULE', message: 'Too common' });
    await vm.submitPassword();
    expect(vm.pw.error).toBe('Too common');
    expect(vm.pw.currentError).toBe('');
  });
});
