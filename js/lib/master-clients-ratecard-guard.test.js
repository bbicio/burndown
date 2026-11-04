import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The rate card loads and saves asynchronously: a response must land in the state it was
// started for, never in the one a later openClientRatecard() put in this.rc (another client's card).
const html = readFileSync(join(__dirname, '..', '..', 'master-clients.html'), 'utf8');
const method = name => {
  const start = html.indexOf(`    async ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('\n    },', start);
  return html.slice(start, end);
};

describe('master-clients rate card sub-view', () => {
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
  it('has no hand-written zero rule and keeps zero through keepZero', () => {
    expect(html).not.toMatch(/===\s*0\s*\?\s*'0'/);
    expect(html).toContain('keepZero: true');
  });
  it('passes the stored amount to readMoneyInput in save, focus and blur', () => {
    for (const name of ['saveClientRatecard', 'onRcFocus', 'onRcBlur']) {
      const start = html.indexOf(`    ${name === 'saveClientRatecard' ? 'async ' : ''}${name}(`);
      expect(start).toBeGreaterThan(-1);
      expect(html.slice(start, html.indexOf('\n    },', start))).toContain('stored: row.stored[code]');
    }
  });
  it('loadAll no longer loads the unused role list', () => {
    const from = html.indexOf('async loadAll()');
    expect(html.slice(from, html.indexOf('\n    },', from))).not.toContain('Api.roles.list()');
    expect(html).not.toMatch(/this\.roles\b/);
  });
  it('the success message timer clears only the message it was started for', () => {
    const save = method('saveClientRatecard');
    expect(save).toMatch(/const seq = \+\+state\.msgSeq/);
    expect(save).toContain('state.msgSeq === seq');
  });
  it('saves through the pure payload builder and the full-replacement endpoint', () => {
    const body = method('saveClientRatecard');
    expect(body).toContain('buildRatecardEntries(');
    expect(body).toContain('Api.ratecards.updateEntries(');
  });
  it('is a routed sub-view, not a modal', () => {
    expect(html).not.toContain('clientRcModal');
    expect(html).not.toContain('bootstrap.Modal');
    expect(html).toContain('window.updateBreadcrumbs(');
    expect(html).toContain("addEventListener('popstate'");
    expect(html).toContain('beforeunload');
  });
  it('asks before leaving with unsaved changes', () => {
    expect(html).toContain('You have unsaved rate changes. Leave without saving?');
    expect(html).toMatch(/leaveRateCard\(/);
    expect(html).toMatch(/#breadcrumb-bar a\[href\^="\/master-clients\.html"\]/);
  });
  it('sends an unknown ?client= back to the list with a notice', () => {
    expect(html).toContain('Client not found.');
  });
  it('builds each cell from the pure source resolver', () => {
    expect(html).toContain('cellSource(');
    expect(html).toContain('roleFamily(');
    expect(html).toContain('sortFamilies(');
  });
});
