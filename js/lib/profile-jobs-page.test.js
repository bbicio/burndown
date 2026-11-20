// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  let opts;
  const src = readFileSync('js/pages/profile-jobs.js', 'utf8');
  const app = { component() { return app; }, mount() {} };
  new Function('Vue', src)({ createApp: o => { opts = o; return app; } });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  vm.refresh = vi.fn(async () => {});
  return { vm };
}

describe('profile-jobs runAction', () => {
  beforeEach(() => { window.apiSave = vi.fn(); });

  it('writes in the background, adopts the data on ok and refreshes', async () => {
    const { vm } = loadPage();
    const onSuccess = vi.fn();
    window.apiSave.mockResolvedValue({ kind: 'ok', data: { projects: 1 } });
    await vm.runAction('run', 'POST', '/profile-jobs/run', null, { onSuccess });
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/profile-jobs/run', null, { background: true });
    expect(onSuccess).toHaveBeenCalledWith({ projects: 1 });
    expect(vm.busyAction).toBeNull();
    expect(vm.refresh).toHaveBeenCalledTimes(1);
  });

  it('unknown keeps the "may still be running" text and refreshes', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'lost' });
    await vm.runAction('run', 'POST', '/profile-jobs/run', null);
    expect(vm.actionError).toBe('No response from the server — the action may still be running; the list refreshes automatically.');
    expect(vm.refresh).toHaveBeenCalledTimes(1);
  });

  it('error 409 shows the busy text (with the note)', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'error', status: 409, message: 'busy', data: null });
    await vm.runAction('run', 'POST', '/profile-jobs/run', null);
    expect(vm.actionError).toBe('A profile job is already running — try again in a moment.');
    await vm.runAction('rebuild', 'POST', '/profile-jobs/rebuild', null, { busyNote: 'Queued.' });
    expect(vm.actionError).toBe('A profile job is already running — try again in a moment. Queued.');
    expect(vm.refresh).toHaveBeenCalledTimes(2);
  });

  it('other errors show the message and refresh', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'Bad interval', data: { error: 'Bad interval' } });
    await vm.runAction('save', 'PUT', '/profile-jobs/settings', { enabled: true });
    expect(vm.actionError).toBe('Bad interval');
    expect(vm.refresh).toHaveBeenCalledTimes(1);
  });

  it('conflict and rule outcomes show their message', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'rule', code: 'X_RULE', message: 'rule broken' });
    await vm.runAction('save', 'PUT', '/profile-jobs/settings', {});
    expect(vm.actionError).toBe('rule broken');
  });
});
