import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiSave } from './save.js';

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
