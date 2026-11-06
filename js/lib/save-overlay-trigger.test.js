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
  // A save is a chain of requests: it stays open for GRACE ms after the last pending request settles.
  const GRACE = 250;
  const get = () => api.apiFetch('/r');

  it('does not show before 400 ms and shows at 400 ms while a POST is pending', async () => {
    const p = post();
    await vi.advanceTimersByTimeAsync(399);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p;
  });
  it('never shows (nor hides) for a lone write that settles in under 400 ms', async () => {
    const p = post();
    await vi.advanceTimersByTimeAsync(300);
    pending[0].resolve(okRes()); await p;
    await vi.advanceTimersByTimeAsync(2000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
  });
  it('two overlapping writes → one show, hide GRACE ms after the second settles', async () => {
    const p1 = post(), p2 = post({ method: 'PUT' });
    await vi.advanceTimersByTimeAsync(400);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[0].resolve(okRes()); await p1;
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    pending[1].resolve(okRes()); await p2;
    await vi.advanceTimersByTimeAsync(GRACE - 1);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  for (const [name, settle] of [
    ['rejects', d => d.reject(new Error('net'))],
    ['returns 401', d => d.resolve(okRes('', 401))],
    ['returns an HTTP error', d => d.resolve(okRes('{"error":"no"}', 400))],
    ['returns a body that is not JSON', d => d.resolve(okRes('<html>502</html>'))],
  ]) {
    it(`hides GRACE ms after a visible write that ${name}`, async () => {
      const p = post().catch(e => e);
      await vi.advanceTimersByTimeAsync(400);
      settle(pending[0]); expect(await p).toBeInstanceOf(Error);
      await vi.advanceTimersByTimeAsync(GRACE);
      expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
    });
  }
  it('hides after a write that times out (30 s abort)', async () => {
    fetchMock.mockImplementation((u, o) => new Promise((_, rej) => {
      o.signal.addEventListener('abort', () => { const e = new Error('a'); e.name = 'AbortError'; rej(e); });
    }));
    const p = post().catch(e => e);
    await vi.advanceTimersByTimeAsync(30000);
    expect((await p).message).toBe('Request timed out');
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('a failed step does not drop the overlay while the save goes on', async () => {
    const p1 = post().catch(e => e);
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes('{"error":"MONEY_RULE"}', 400)); await p1;
    const p2 = post();
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[1].resolve(okRes()); await p2;
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('a write chained right after a visible one keeps the overlay up: no hide, no second show', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes()); await p1;
    const p2 = post();
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[1].resolve(okRes()); await p2;
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('a slow read between two writes keeps the overlay up', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes()); await p1;
    await vi.advanceTimersByTimeAsync(10);
    const g = get();
    await vi.advanceTimersByTimeAsync(1000);
    pending[1].resolve(okRes()); await g;
    const p2 = post();
    await vi.advanceTimersByTimeAsync(500);
    pending[2].resolve(okRes()); await p2;
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(GRACE);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
  });
  it('the delay counts from the start of the save, not of each write', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(300);
    pending[0].resolve(okRes()); await p1;
    const p2 = post();
    await vi.advanceTimersByTimeAsync(99);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[1].resolve(okRes()); await p2;
  });
  it('a step that starts after the delay elapsed in an idle gap shows at once', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(300);
    pending[0].resolve(okRes()); await p1;
    await vi.advanceTimersByTimeAsync(150); // 450 ms into the save, nothing pending
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    const p2 = post();
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    pending[1].resolve(okRes()); await p2;
  });
  it('a write started after the save closed waits the full 400 ms again', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(400);
    pending[0].resolve(okRes()); await p1;
    await vi.advanceTimersByTimeAsync(GRACE + 10);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(1);
    const p2 = post();
    await vi.advanceTimersByTimeAsync(399);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(2);
    pending[1].resolve(okRes()); await p2;
  });
  it('a read outside a save is not counted', async () => {
    const g = get();
    await vi.advanceTimersByTimeAsync(2000);
    pending[0].resolve(okRes()); await g;
    await vi.advanceTimersByTimeAsync(2000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    expect(win.PdOverlay.hide).toHaveBeenCalledTimes(0);
  });
  it('a background write inside a save neither extends nor shows it', async () => {
    const p1 = post();
    await vi.advanceTimersByTimeAsync(100);
    pending[0].resolve(okRes()); await p1;
    const b = post({ background: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    pending[1].resolve(okRes()); await b;
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
    await vi.advanceTimersByTimeAsync(1000);
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
  it('projects.tags.replace forwards background, and the project-config tag toggle passes it', async () => {
    const p = api.Api.projects.tags.replace('p', [], { background: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    pending[0].resolve(okRes()); await p;
    const html = readFileSync(join(process.cwd(), 'project-config.html'), 'utf8');
    expect(html).toContain('Api.projects.tags.replace(this.project.id, newIds, { background: true })');
  });
  it('versions.tags.replace forwards background, and the costgrid tag toggle passes it', async () => {
    const p = api.Api.costGrids.versions.tags.replace('c', 'v', [], { background: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(win.PdOverlay.show).toHaveBeenCalledTimes(0);
    pending[0].resolve(okRes()); await p;
    const html = readFileSync(join(process.cwd(), 'costgrid.html'), 'utf8');
    expect(html).toContain('Api.costGrids.versions.tags.replace(this.cgId, this.verId, this.versionTagItemIds, { background: true })');
  });
  it('does nothing when window.PdOverlay is missing', async () => {
    delete win.PdOverlay;
    const p = post();
    await vi.advanceTimersByTimeAsync(500);
    pending[0].resolve(okRes()); await expect(p).resolves.toEqual({ ok: true });
  });
});
