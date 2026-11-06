import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'js/api.js'), 'utf8');

let win, fetchMock, pending, api;
const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const okRes = (body = '{"ok":true}', status = 200) => ({ status, ok: status < 400, text: async () => body });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function load() {
  win = { PdOverlay: { show: vi.fn(), hide: vi.fn() }, location: {} };
  pending = [];
  fetchMock = vi.fn(() => { const d = deferred(); pending.push(d); return d.p; });
  api = new Function('fetch', 'window', src + 'return { apiFetch, Api };')(fetchMock, win);
}
beforeEach(() => { vi.useFakeTimers(); load(); });
afterEach(() => { vi.useRealTimers(); });

const post = (o = {}) => api.apiFetch('/x', { method: 'POST', body: '{}', ...o });

describe('save overlay trigger', () => {
  it('does not show before 400 ms and shows at 400 ms while a POST is pending', async () => {
    const p = post();
    await vi.advanceTimersByTimeAsync(399);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p;
  });
  it('never shows for a write that settles in under 400 ms', async () => {
    const p = post();
    await vi.advanceTimersByTimeAsync(100);
    pending[0].resolve(okRes()); await p;
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('two overlapping writes → one show, hide only after the second settles', async () => {
    const p1 = post(), p2 = post({ method: 'PUT' });
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p1;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    pending[1].resolve(okRes()); await p2;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('hides when the write rejects', async () => {
    const p = post().catch(e => e);
    await vi.advanceTimersByTimeAsync(400);
    pending[0].reject(new Error('net')); await p;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('hides when the write times out (30 s abort)', async () => {
    fetchMock.mockImplementation((u, o) => new Promise((_, rej) => {
      o.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); });
    }));
    const p = post().catch(e => e);
    await vi.advanceTimersByTimeAsync(30000);
    expect((await p).message).toBe('Request timed out');
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('hides on a 401', async () => {
    const p = post().catch(e => e);
    pending[0].resolve(okRes('', 401)); await p;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('hides when the response body is not JSON', async () => {
    const p = post().catch(e => e);
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes('<html>502</html>')); const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('has hidden the overlay before the caller sees the rejection', async () => {
    let hiddenAtCatch = false;
    const p = post().catch(() => { hiddenAtCatch = win.PdOverlay.hide.mock.calls.length > 0; });
    pending[0].resolve(okRes('{"error":"no"}', 400)); await p;
    expect(hiddenAtCatch).toBe(true);
  });
  it('re-arms the delay for a write that starts right after another ended', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(300);
    pending[0].resolve(okRes()); await p1;
    const p2 = post();
    await vi.advanceTimersByTimeAsync(399);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[1].resolve(okRes()); await p2;
  });
  it('a write chained right after a visible one re-shows at once, with no 400 ms gap', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p1;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
    const p2 = post();
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(2);
    pending[1].resolve(okRes()); await p2;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(2);
  });
  it('a write started well after a visible one waits the full 400 ms again', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes()); await p1;
    await vi.advanceTimersByTimeAsync(200);
    const p2 = post();
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(399);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(2);
    pending[1].resolve(okRes()); await p2;
  });
  it('counts a FormData POST', async () => {
    const p = api.apiFetch('/up', { method: 'POST', body: new FormData() });
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p;
  });
  it('ignores GET and { background: true } writes', async () => {
    const g = api.apiFetch('/x');
    const b = post({ background: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    pending.forEach(d => d.resolve(okRes())); await g; await b;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
  });
  it('accepts a lower-case method', async () => {
    const p = api.apiFetch('/x', { method: 'patch', body: '{}' });
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p;
  });
  it('does not pass background to fetch', async () => {
    const p = post({ background: true });
    expect(fetchMock.mock.calls[0][1].background).toBeUndefined();
    pending[0].resolve(okRes()); await p;
  });
  it('Api.costGrids.versions.update(..., { background: true }) does not show the overlay', async () => {
    const p = api.Api.costGrids.versions.update('c', 'v', {}, { background: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    expect(fetchMock.mock.calls[0][1].background).toBeUndefined();
    pending[0].resolve(okRes()); await p;
  });
  it('the same wrapper without opts does show it', async () => {
    const p = api.Api.costGrids.update('c', {});
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p;
  });
  it('the notifications mark-read PATCHes pass background: true', () => {
    const n = readFileSync(join(process.cwd(), 'js/notifications.js'), 'utf8');
    expect(n).toContain("/notifications/${id}/read`, { method: 'PATCH', background: true }");
    expect(n).toContain("'/notifications/read-all', { method: 'PATCH', background: true }");
  });
  it('does nothing when window.PdOverlay is missing', async () => {
    delete win.PdOverlay;
    const p = post();
    await vi.advanceTimersByTimeAsync(500);
    pending[0].resolve(okRes()); await expect(p).resolves.toEqual({ ok: true });
  });
});
