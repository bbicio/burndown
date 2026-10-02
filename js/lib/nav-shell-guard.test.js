import { describe, it, expect, afterEach, vi } from 'vitest';

export const SNIPPET =
  "<script>try{if(localStorage.getItem('PDash_sidebarCollapsed')==='1')document.documentElement.setAttribute('data-sidebar','collapsed')}catch(e){}</script>";

const code = SNIPPET.replace(/^<script>/, '').replace(/<\/script>$/, '');
const run = () => new Function(code)();

afterEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('sidebar-state head snippet', () => {
  it("sets data-sidebar=collapsed when the key is '1'", () => {
    localStorage.setItem('PDash_sidebarCollapsed', '1');
    run();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
  });

  it('sets nothing when the key is absent', () => {
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it.each(['0', 'true', '', ' 1', 'collapsed'])('sets nothing for the value %j', v => {
    localStorage.setItem('PDash_sidebarCollapsed', v);
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it('does not throw and sets nothing when localStorage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});
