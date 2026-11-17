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
  // POST /api/ratecards returns the client's existing card (with its entries) when one exists: the
  // create path must not replace those entries with an empty list, or a save would wipe them.
  it('openClientRatecard does not hard-code empty entries for a created card', () => {
    const body = method('openClientRatecard');
    expect(body).not.toMatch(/entries:\s*\[\]\s*\}/);
    // the create answer is the server's card, entries included (an existing card keeps its own)
    expect(body).toContain('rc = res.data;');
  });
  it('has no hand-written zero rule and keeps zero through keepZero', () => {
    expect(html).not.toMatch(/===\s*0\s*\?\s*'0'/);
    expect(html).toContain('keepZero: true');
  });
  it('passes the stored amount to readMoneyInput in save, focus and blur', () => {
    // the save reads the amounts in the pure payload builder; after it the stored values come from the server
    expect(method('saveClientRatecard')).toContain('window.buildRatecardEntries(this.rc.rows, this.currencies)');
    const lib = readFileSync(join(__dirname, 'master-clients.js'), 'utf8');
    const build = lib.slice(lib.indexOf('export function buildRatecardEntries('));
    expect(build.slice(0, build.indexOf('\n}'))).toContain('stored: row.stored[code]');
    for (const name of ['onRcFocus', 'onRcBlur']) {
      const start = html.indexOf(`    ${name}(`);
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
    expect(body).toContain("window.apiSave('PATCH', '/ratecards/' + state.id + '/entries', ");
  });
  // The entries PATCH is refused (409) when the card changed since the modal opened: the version
  // travels with it, and the refresh of the "saved" state must sit after the call so a refusal skips it.
  it('sends the card version with the entries and keeps the one the server returns', () => {
    const body = method('saveClientRatecard');
    expect(body).toContain("'/entries', { version: state.version, entries: built.entries })");
    expect(body).toContain('state.version = res.data.version;');
    expect(method('openClientRatecard')).toMatch(/state\.version\s*=\s*rc\.version/);
  });
  // The saved state (row.initial, row.stored) is rebuilt from the server's card, only after an ok
  // answer: a refusal returns first and leaves the rows dirty.
  it('rebuilds the rows from the server card only after an ok save', () => {
    const body = method('saveClientRatecard');
    const callAt = body.indexOf("await window.apiSave('PATCH'");
    const refusalAt = body.indexOf("if (res.kind !== 'ok') {");
    const returnAt = body.indexOf('return;', refusalAt);
    const rowsAt = body.indexOf('state.rows = this.ratecardRows(res.data, state.roles);');
    expect(callAt).toBeGreaterThan(-1);
    expect(refusalAt).toBeGreaterThan(callAt);
    expect(returnAt).toBeGreaterThan(refusalAt);
    expect(rowsAt).toBeGreaterThan(returnAt);
    expect(body).not.toContain('row.initial =');
    const start = html.indexOf('    ratecardRows(rc, roles) {');
    expect(start).toBeGreaterThan(-1);
    const rows = html.slice(start, html.indexOf('\n    },', start));
    expect(rows).toContain('initial: { ...texts }');
    expect(rows).toContain('const stored = { EUR: eur == null ? null : Number(eur) };');
  });
  it('offers Reload on a conflict or a lost answer', () => {
    expect(method('saveClientRatecard')).toContain("state.reloadable = res.kind === 'conflict' || res.kind === 'unknown';");
    expect(html).toContain('@click="reloadClientRatecard">Reload</button>');
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
