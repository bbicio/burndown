// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

function loadPage() {
  let opts;
  const src = readFileSync('js/pages/terms.js', 'utf8');
  new Function('Vue', src)({ createApp: o => { opts = o; return { mount() {} }; } });
  const vm = { ...opts.data() };
  for (const [k, f] of Object.entries(opts.methods)) vm[k] = f.bind(vm);
  vm.loadTerms = vi.fn(async () => {});
  return { vm, opts };
}

describe('terms page accept()', () => {
  beforeEach(() => { window.apiSave = vi.fn(); });

  it('sends the version it shows', async () => {
    const { vm } = loadPage();
    vm.version = 7;
    window.apiSave.mockResolvedValue({ kind: 'error', message: 'x' });
    await vm.accept();
    expect(window.apiSave).toHaveBeenCalledWith('POST', '/auth/accept-terms', { version: 7 });
  });

  it('conflict reloads the text, clears the tick and shows the message', async () => {
    const { vm } = loadPage();
    vm.version = 7; vm.checked = true;
    window.apiSave.mockResolvedValue({ kind: 'conflict', message: 'New terms published.', version: 8 });
    await vm.accept();
    expect(vm.loadTerms).toHaveBeenCalled();
    expect(vm.checked).toBe(false);
    expect(vm.errorMsg).toBe('New terms published.');
    expect(vm.saving).toBe(false);
  });

  it('error re-enables the button with the message', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'error', status: 400, message: 'version is required' });
    await vm.accept();
    expect(vm.saving).toBe(false);
    expect(vm.errorMsg).toBe('version is required');
  });

  it('unknown re-enables the button with the message', async () => {
    const { vm } = loadPage();
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: 'lost' });
    await vm.accept();
    expect(vm.saving).toBe(false);
    expect(vm.errorMsg).toBe('lost');
  });
});
