// Guard for the Attribute Lists redesign (2026-11-09): what attribute-lists.html and css/attribute-lists.css must
// (not) contain. Text checks only — the logic is unit-tested in attribute-lists-ui.test.js and slugify.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const html = read('attribute-lists.html');
const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/;
// A colour literal: preceded by ':' or whitespace, followed by ';', ',', ')' or whitespace.
const HEX_COLOUR = /[:\s]#[0-9a-fA-F]{3,8}(?=[;,)\s])/;
const RE_NATIVE = /\bconfirm\(|\balert\(/;

describe('css/attribute-lists.css', () => {
  it('exists and the page loads it with ?v=', () => {
    expect(existsSync('css/attribute-lists.css')).toBe(true);
    expect(html).toMatch(/href="css\/attribute-lists\.css\?v=\d+"/);
  });
  it('has no hex literal', () => expect(read('css/attribute-lists.css')).not.toMatch(ANY_HEX));
});

describe('css/admin-crud.css', () => {
  it('no longer has the badge-st pills', () => expect(read('css/admin-crud.css')).not.toContain('badge-st-'));
});

describe('attribute-lists.html — removed', () => {
  it.each(['nav-tabs', '<details', 'ph-back', 'badge-st-', 'slug-code', 'showConfirm(', '🔒'])(
    'has no %s', s => expect(html).not.toContain(s));
  it('uses no native confirm()/alert()', () => expect(html).not.toMatch(RE_NATIVE));
  it('has no hex colour', () => expect(html).not.toMatch(HEX_COLOUR));
  it('has one page head', () => expect(html.match(/class="ph"/g) || []).toHaveLength(1));
});

describe('attribute-lists.html — structure and states', () => {
  it.each([
    'class="md-layout"', 'class="md-subnav"', 'aria-label="Attribute lists and topics"', 'aria-current',
    'md-subnav-select', 'pd-state', 'Loading attribute lists…', 'Admin access required', 'Try again',
    "Couldn't load attribute lists.", "The server didn't respond. Your data is safe.",
    'Values to tag proposals and projects, and topics for experience profiles',
    'No attribute lists yet.', 'Create the first list',
  ])('contains %s', s => expect(html).toContain(s));
});

describe('attribute-lists.html — later tasks', () => {
  it.todo('uses pd-drawer for every form');
  it.todo('uses pd-confirm for the merge confirmation');
  it.todo('uses combo-select for the merge target');
  it.todo('has no Bootstrap modal other than #mergeConfirmModal');
  it.todo('has no <select> outside md-subnav-select');
});
