import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// js/roles.js is a classic script: run it against an Api stub. node-postgres returns NUMERIC
// as a string, and the structure PUT refuses a string amount, so the registry must hand out numbers.
const js = readFileSync('js/roles.js', 'utf8');

async function load(rows) {
  const Api = { roles: { list: async () => rows } };
  const run = new Function('Api', `${js}; return { loadRolesFromApi, getRoles };`);
  const m = run(Api);
  await m.loadRolesFromApi();
  return m.getRoles();
}

describe('loadRolesFromApi — rate type', () => {
  it('turns a NUMERIC string into a number', async () => {
    const [r] = await load([{ id: 1, label: 'A', code: 'A', hourly_rate: '150.00' }]);
    expect(r.rate).toBe(150);
  });
  it('keeps null as null', async () => {
    const [r] = await load([{ id: 1, label: 'A', code: 'A', hourly_rate: null }]);
    expect(r.rate).toBeNull();
  });
});
