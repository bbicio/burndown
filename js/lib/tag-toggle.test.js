import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tagToggle } from './tag-toggle.js';
import { UNKNOWN_MESSAGE } from './save.js';

const BASE = '/projects/p/tags';

beforeEach(() => { window.apiSave = vi.fn(); });

describe('tagToggle', () => {
  it('DELETEs an item that is on, in the background', async () => {
    window.apiSave.mockResolvedValue({ kind: 'ok', data: [] });
    await tagToggle({ basePath: BASE, rows: [{ item_id: 'a' }], itemId: 'a' });
    expect(window.apiSave).toHaveBeenCalledWith('DELETE', '/projects/p/tags/a', null, { background: true });
  });
  it('PUTs an item that is off, in the background', async () => {
    window.apiSave.mockResolvedValue({ kind: 'ok', data: [] });
    await tagToggle({ basePath: BASE, rows: [{ item_id: 'a' }], itemId: 'b' });
    expect(window.apiSave).toHaveBeenCalledWith('PUT', '/projects/p/tags/b', null, { background: true });
  });
  it('answers the server list on ok', async () => {
    const r = { item_id: 'b' };
    window.apiSave.mockResolvedValue({ kind: 'ok', data: [r] });
    expect(await tagToggle({ basePath: BASE, rows: [], itemId: 'b' })).toEqual({ rows: [r] });
  });
  it('answers the message on error', async () => {
    window.apiSave.mockResolvedValue({ kind: 'error', status: 403, message: 'Access denied' });
    expect(await tagToggle({ basePath: BASE, rows: [], itemId: 'b' })).toEqual({ message: 'Access denied' });
  });
  it('answers the message on unknown', async () => {
    window.apiSave.mockResolvedValue({ kind: 'unknown', message: UNKNOWN_MESSAGE });
    expect(await tagToggle({ basePath: BASE, rows: [], itemId: 'b' })).toEqual({ message: UNKNOWN_MESSAGE });
  });
});
