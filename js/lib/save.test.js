import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiSave, saveAndReload, SAVED_NOT_RELOADED } from './save.js';

const src = readFileSync(join(process.cwd(), 'js/api.js'), 'utf8');
const UNKNOWN = "The server's answer was lost — the change may have been saved. Reload to check.";

let win, fetchMock, api;
const res = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

// js/api.js runs against a fake window (location, overlay); apiSave finds it as window.apiFetch.
function load(answer) {
  win = { PdOverlay: { show: vi.fn(), hide: vi.fn() }, location: {} };
  fetchMock = vi.fn(answer);
  api = new Function('fetch', 'window', src + 'return { apiFetch, Api };')(fetchMock, win);
  window.apiFetch = api.apiFetch;
}

const CASES = [
  ['200 JSON → ok', () => res('{"id":1}'), { kind: 'ok', data: { id: 1 } }],
  ['200 empty body → ok with null data', () => res(''), { kind: 'ok', data: null }],
  ['409 STALE → conflict', () => res('{"error":"E","code":"STALE","version":4}', 409), { kind: 'conflict', message: 'E', version: 4 }],
  ['409 without STALE → error', () => res('{"error":"Role code already exists"}', 409), { kind: 'error', status: 409, message: 'Role code already exists' }],
  ['400 MONEY_RULE → rule', () => res('{"error":"M","code":"MONEY_RULE"}', 400), { kind: 'rule', code: 'MONEY_RULE', message: 'M' }],
  ['404 JSON → error', () => res('{"error":"Role not found"}', 404), { kind: 'error', status: 404, message: 'Role not found' }],
  ['413 HTML → error', () => res('<html>too large</html>', 413), { kind: 'error', status: 413, message: 'HTTP 413' }],
  ['500 JSON → unknown (the write may have committed)', () => res('{"error":"Internal server error"}', 500), { kind: 'unknown', message: UNKNOWN }],
  ['502 HTML → unknown', () => res('<html>bad gateway</html>', 502), { kind: 'unknown', message: UNKNOWN }],
  ['200 HTML → unknown', () => res('<html>proxy</html>'), { kind: 'unknown', message: UNKNOWN }],
  ['timeout → unknown', () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { kind: 'unknown', message: UNKNOWN }],
  ['network TypeError → unknown', () => Promise.reject(new TypeError('Failed to fetch')), { kind: 'unknown', message: UNKNOWN }],
];

describe('apiSave', () => {
  for (const [name, answer, expected] of CASES) {
    it(name, async () => {
      load(answer);
      expect(await apiSave('PATCH', '/roles/r1', { version: 1 })).toMatchObject(expected);
    });
  }

  it('401 → error, with the redirect to the login page', async () => {
    load(() => res('', 401));
    const out = await apiSave('PATCH', '/roles/r1', { version: 1 });
    expect(out.kind).toBe('error');
    expect(win.location.href).toBe('/login.html');
  });

  it('never rejects', async () => {
    for (const [, answer] of [...CASES, ['401', () => res('', 401)]]) {
      load(answer);
      await expect(apiSave('DELETE', '/roles/r1', { version: 1 })).resolves.toBeTypeOf('object');
    }
  });

  it('sends the method and the body as JSON', async () => {
    load(() => res('{}'));
    await apiSave('POST', '/roles', { label: 'A' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/roles');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe('{"label":"A"}');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('background: true keeps the overlay off', async () => {
    vi.useFakeTimers();
    try {
      load(() => new Promise(() => {}));
      apiSave('PUT', '/x', null, { background: true });
      await vi.advanceTimersByTimeAsync(1000);
      expect(win.PdOverlay.show).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('without opts the overlay shows as before', async () => {
    vi.useFakeTimers();
    try {
      load(() => new Promise(() => {}));
      apiSave('PUT', '/x', null);
      await vi.advanceTimersByTimeAsync(1000);
      expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

});

describe('saveAndReload', () => {
  it('200 JSON + a reload that resolves true → ok, reloaded', async () => {
    load(() => res('{"id":1}'));
    const reload = vi.fn(async () => true);
    expect(await saveAndReload('PATCH', '/roles/r1', { version: 1 }, reload)).toEqual({ kind: 'ok', data: { id: 1 }, reloaded: true });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('200 + a reload that throws → ok, not reloaded', async () => {
    load(() => res('{"id":1}'));
    const reload = vi.fn(async () => { throw new Error('boom'); });
    expect(await saveAndReload('PATCH', '/roles/r1', {}, reload)).toMatchObject({ kind: 'ok', reloaded: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('200 + a reload that resolves false → not reloaded', async () => {
    load(() => res('{"id":1}'));
    expect(await saveAndReload('PATCH', '/roles/r1', {}, async () => false)).toMatchObject({ kind: 'ok', reloaded: false });
  });

  it('502 HTML → unknown, the reload runs', async () => {
    load(() => res('<html>bad gateway</html>', 502));
    const reload = vi.fn(async () => true);
    expect(await saveAndReload('PATCH', '/roles/r1', {}, reload)).toMatchObject({ kind: 'unknown', reloaded: true });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  for (const [name, answer, kind] of [
    ['409 STALE', () => res('{"error":"E","code":"STALE","version":4}', 409), 'conflict'],
    ['400 MONEY_RULE', () => res('{"error":"M","code":"MONEY_RULE"}', 400), 'rule'],
    ['404 JSON', () => res('{"error":"Role not found"}', 404), 'error'],
  ]) {
    it(`${name} → ${kind}, the reload never runs`, async () => {
      load(answer);
      const reload = vi.fn(async () => true);
      expect(await saveAndReload('PATCH', '/roles/r1', {}, reload)).toMatchObject({ kind, reloaded: false });
      expect(reload).not.toHaveBeenCalled();
    });
  }

  it('SAVED_NOT_RELOADED is the shared text', () => {
    expect(SAVED_NOT_RELOADED).toBe("Saved, but the list couldn't be reloaded. Reload the page to see the latest.");
  });
});

describe('apiFetch', () => {
  beforeEach(() => load(() => res('[{"id":1}]')));

  it('a GET answering JSON returns the data as before', async () => {
    expect(await api.apiFetch('/roles')).toEqual([{ id: 1 }]);
  });

  it('tags its errors: status, data, nonJson, timeout, network', async () => {
    load(() => res('{"error":"no"}', 400));
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ status: 400, data: { error: 'no' } });
    load(() => res('<html>', 502));
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ status: 502, data: null, nonJson: true, message: 'HTTP 502' });
    load(() => res('<html>', 200));
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ status: 200, nonJson: true });
    load(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ message: 'Request timed out', timeout: true });
    load(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api.apiFetch('/x')).rejects.toMatchObject({ network: true });
  });
});
