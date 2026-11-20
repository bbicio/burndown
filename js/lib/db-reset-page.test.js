// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const LOST = "The server's answer was lost — the deletion may have happened. Check before retrying.";

function loadPage() {
  let opts;
  const src = readFileSync('js/pages/_db-reset.js', 'utf8');
  const app = { mount() {} };
  new Function('Vue', src)({ createApp: o => { opts = o; return app; } });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  return { vm };
}

describe('_db-reset writes through apiSave', () => {
  beforeEach(() => {
    window.apiSave = vi.fn();
    window.bootstrap = { Modal: { getInstance: () => ({ hide() {} }) } };
  });

  it('scope delete with unknown says the deletion may have happened', async () => {
    const { vm } = loadPage();
    vm.pendingScope = 'actuals';
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'x' });
    await vm._doScopeDelete();
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/admin/reset/actuals');
    expect(vm.scopeErrorMsg).toContain(LOST);
    expect(vm.scopeDoneFlag).toBeNull();
    expect(vm.confirmBusy).toBe(false);
  });

  it('scope delete with ok flags the scope done; with error shows the message', async () => {
    const { vm } = loadPage();
    vm.pendingScope = 'clients';
    window.apiSave.mockResolvedValue({ kind: 'ok', data: {} });
    await vm._doScopeDelete();
    expect(vm.scopeDoneFlag).toEqual({ scope: 'clients' });
    window.apiSave.mockResolvedValue({ kind: 'error', status: 403, message: 'Forbidden', data: null });
    await vm._doScopeDelete();
    expect(vm.scopeErrorMsg).toBe('Error: Forbidden');
  });

  it('cost grid delete: ok, error and unknown', async () => {
    const { vm } = loadPage();
    vm.pendingCgId = 'a/b';
    window.apiSave.mockResolvedValue({ kind: 'ok', data: { cgName: 'N', projectsDeleted: 2 } });
    await vm._doCgDelete();
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/admin/reset/cost-grid/a%2Fb');
    expect(vm.cgDeleteMsg).toEqual({ text: '✓ Deleted "N" and 2 linked project(s).', isError: false });
    window.apiSave.mockResolvedValue({ kind: 'error', status: 404, message: 'Not found', data: null });
    await vm._doCgDelete();
    expect(vm.cgDeleteMsg).toEqual({ text: 'Error: Not found', isError: true });
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'x' });
    await vm._doCgDelete();
    expect(vm.cgDeleteMsg).toEqual({ text: LOST, isError: true });
  });

  it('change owner: ok, error and unknown', async () => {
    const { vm } = loadPage();
    vm.cgOwnerIdInput = 'cg1';
    vm.ownerSelected = 'u9';
    window.apiSave.mockResolvedValue({ kind: 'ok', data: { cgName: 'N', newOwner: 'Ann' } });
    await vm.changeOwner();
    expect(window.apiSave).toHaveBeenCalledWith('PATCH', '/admin/reset/cost-grid/cg1/owner', { ownerId: 'u9' });
    expect(vm.cgOwnerMsg).toEqual({ text: '✓ "N" is now owned by Ann.', isError: false });
    expect(vm.ownerSelected).toBe('');
    vm.cgOwnerIdInput = 'cg1'; vm.ownerSelected = 'u9';
    window.apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'Bad owner', data: null });
    await vm.changeOwner();
    expect(vm.cgOwnerMsg).toEqual({ text: 'Error: Bad owner', isError: true });
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'lost' });
    await vm.changeOwner();
    expect(vm.cgOwnerMsg.isError).toBe(true);
    expect(vm.ownerChangeBusy).toBe(false);
  });
});
