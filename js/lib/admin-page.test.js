// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as rules from './user-admin-rules.js';

function loadPage() {
  let opts;
  window.UserAdminRules = rules;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const src = readFileSync('js/pages/admin.js', 'utf8');
  const app = { component() { return app; }, mount() {} };
  new Function('Vue', src)({ createApp: o => { opts = o; return app; } });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  for (const [k, g] of Object.entries(opts.computed)) Object.defineProperty(vm, k, { get: g });
  vm.loadUsers = vi.fn(async () => {});
  vm.users = [];
  return { vm };
}

const row = () => ({ id: 'u1', email: 'old@x.it', first_name: 'Old', last_name: 'Name', role: 'user', status: 'active' });

describe('admin page writes through apiSave', () => {
  beforeEach(() => { window.apiSave = vi.fn(); });

  it('patchUser adopts the whole row the server returns', async () => {
    const { vm } = loadPage();
    const user = row();
    const data = { id: 'u1', email: 'e', first_name: 'F', last_name: 'L', role: 'admin', status: 'active' };
    window.apiSave.mockResolvedValue({ kind: 'ok', data });
    await vm.patchUser(user, { role: 'admin' }, 'role');
    expect(window.apiSave).toHaveBeenCalledWith('PATCH', '/users/u1', { role: 'admin' });
    expect(user).toMatchObject(data);
    expect(user._loading).toBe(false);
    expect(vm.banner).toBeNull();
  });

  it('patchUser leaves the row unchanged and shows the message on error', async () => {
    const { vm } = loadPage();
    const user = row();
    window.apiSave.mockResolvedValue({ kind: 'error', status: 403, message: 'Last sysadmin', data: null });
    await vm.patchUser(user, { role: 'admin' }, 'role');
    expect(user.role).toBe('user');
    expect(vm.banner.kind).toBe('error');
    expect(vm.banner.text).toBe('Last sysadmin');
    expect(user._loading).toBe(false);
  });

  it('patchUser shows UNKNOWN message and reloads the list on unknown', async () => {
    const { vm } = loadPage();
    const user = row();
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'lost' });
    await vm.patchUser(user, { status: 'disabled' }, 'status');
    expect(vm.banner.text).toBe('lost');
    expect(vm.loadUsers).toHaveBeenCalled();
    expect(user.status).toBe('active');
  });

  it('submitDetails puts the server field on errorField', async () => {
    const { vm } = loadPage();
    vm.users = [row()];
    vm.details = { userId: 'u1', firstName: 'Old', lastName: 'Name', email: 'new@x.it', orig: { firstName: 'Old', lastName: 'Name', email: 'old@x.it' }, loading: false, error: null, errorField: null };
    window.apiSave.mockResolvedValue({ kind: 'error', status: 409, message: 'Email taken', data: { error: 'Email taken', field: 'email' } });
    await vm.submitDetails();
    expect(window.apiSave).toHaveBeenCalledWith('PATCH', '/users/u1', { email: 'new@x.it' });
    expect(vm.details.error).toBe('Email taken');
    expect(vm.details.errorField).toBe('email');
    expect(vm.details.loading).toBe(false);
  });

  it('submitInvite with a 409 puts the error on the email field', async () => {
    const { vm } = loadPage();
    vm.invite = { firstName: 'A', lastName: 'B', email: 'a@b.it', role: 'user', loading: false, error: null, errorField: null, sentTo: null, sentName: null, emailSent: null };
    window.apiSave.mockResolvedValue({ kind: 'error', status: 409, message: 'Exists', data: null });
    const inv = vm.invite;
    await vm.submitInvite();
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/auth/invite', { email: 'a@b.it', firstName: 'A', lastName: 'B', role: 'user' });
    expect(inv.error).toBe('Exists');
    expect(inv.errorField).toBe('email');
    expect(inv.loading).toBe(false);
  });

  it('resendInvite and anonymizeUser use apiSave and show the message on error', async () => {
    const { vm } = loadPage();
    const user = row();
    window.apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'Nope', data: null });
    await vm.resendInvite(user);
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/auth/u1/resend-invite');
    expect(vm.banner.text).toBe('Nope');
    await vm.anonymizeUser(user);
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/users/u1/anonymize');
    expect(vm.banner.text).toBe('Nope');
    expect(user._sending).toBe(false);
    expect(user._loading).toBe(false);
  });
});
