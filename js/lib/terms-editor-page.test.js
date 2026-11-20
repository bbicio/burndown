// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  let opts;
  const src = readFileSync('js/pages/_terms-editor.js', 'utf8');
  new Function('Vue', src)({ createApp: o => { opts = o; return { mount() {} }; } });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  vm.loadVersions = vi.fn(async () => {});
  vm.loadDraft = vi.fn(async () => {});
  vm.me = { first_name: 'Local', last_name: 'Guess' };
  return vm;
}

describe('terms editor saveTerms()', () => {
  beforeEach(() => { window.apiSave = vi.fn(); });

  it('adopts the server draft metadata on ok', async () => {
    const vm = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'ok', data: { ok: true, newVersion: null, version: 4, updatedAt: 'X', updatedBy: 'Ada Admin' } });
    await vm.saveTerms(false);
    expect(window.apiSave).toHaveBeenCalledWith('PUT', '/app-settings/terms', { content: '', publishNewVersion: false });
    expect(vm.terms.updatedAt).toBe('X');
    expect(vm.terms.updatedBy).toBe('Ada Admin');
    expect(vm.terms.version).toBe(4);
    expect(vm.terms.msgOk).toBe(true);
    expect(vm.terms.reloadable).toBe(false);
    expect(vm.loadVersions).toHaveBeenCalled();
    expect(vm.terms.saving).toBe(false);
  });

  it('conflict shows the message and offers Reload', async () => {
    const vm = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'conflict', message: 'Another version was published.', version: 5 });
    await vm.saveTerms(true);
    expect(vm.terms.msgOk).toBe(false);
    expect(vm.terms.msg).toBe('Another version was published.');
    expect(vm.terms.reloadable).toBe(true);
    expect(vm.terms.saving).toBe(false);
  });

  it('reload re-reads draft and versions and clears the banner', async () => {
    const vm = loadPage();
    vm.terms.reloadable = true; vm.terms.msg = 'x';
    await vm.reloadTerms();
    expect(vm.loadDraft).toHaveBeenCalled();
    expect(vm.loadVersions).toHaveBeenCalled();
    expect(vm.terms.reloadable).toBe(false);
    expect(vm.terms.msg).toBeNull();
  });

  it('error and unknown show the message without Reload', async () => {
    const vm = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'lost' });
    await vm.saveTerms(false);
    expect(vm.terms.msg).toBe('lost'); expect(vm.terms.msgOk).toBe(false);
  });
});
