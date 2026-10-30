import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The rate card modal loads and saves asynchronously: a response must land in the modal state it was
// started for, never in the one a later openClientRatecard() put in this.rc (another client's card).
const html = readFileSync(join(__dirname, '..', '..', 'master-clients.html'), 'utf8');
const method = name => {
  const start = html.indexOf(`    async ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('\n    },', start);
  return html.slice(start, end);
};

describe('master-clients rate card modal', () => {
  for (const name of ['openClientRatecard', 'saveClientRatecard']) {
    it(`${name} writes no this.rc after its first await`, () => {
      const body = method(name);
      const afterAwait = body.slice(body.indexOf('await '));
      expect(afterAwait).not.toMatch(/this\.rc\./);
    });
  }
  // The entries PATCH replaces the whole set: rows built from a role list loaded at page load would
  // drop the entry of a role created since, so each open reads the roles afresh.
  it('openClientRatecard builds its rows from a fresh role list', () => {
    const body = method('openClientRatecard');
    expect(body).toMatch(/Api\.roles\.list\(\)/);
    expect(body).not.toMatch(/this\.roles\.map/);
  });
});
