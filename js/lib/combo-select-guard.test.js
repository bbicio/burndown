// Guard for the shared combo-select (extracted from team.html, 2026-11-09): where the component and its CSS live.
// Text checks only — its filter is unit-tested as filterComboOptions in team-ui.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/;

describe('js/combo-select.js', () => {
  it('exists and defines window.ComboSelect', () => {
    expect(existsSync('js/combo-select.js')).toBe(true);
    expect(read('js/combo-select.js')).toContain('window.ComboSelect');
  });
  it('uses the shared pd-combo classes only', () => {
    expect(read('js/combo-select.js')).not.toContain('tm-combo');
  });
  it('has no hex literal', () => {
    expect(read('js/combo-select.js')).not.toMatch(ANY_HEX);
  });
});

describe('combo-select CSS', () => {
  it('lives in style.css', () => expect(read('css/style.css')).toContain('.pd-combo-menu'));
  it('is gone from team.css', () => expect(read('css/team.css')).not.toContain('tm-combo'));
});
