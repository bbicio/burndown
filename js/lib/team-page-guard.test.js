// Guard for the Team redesign (2026-11-08): what team.html, css/team.css and the shared pd- block of
// css/style.css must (not) contain. Text checks only — the logic is unit-tested in team-ui.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const html = read('team.html');
const PD_HEADER = '/* ── Shared components (pd-) ── */';
// A colour literal: preceded by ':' or whitespace, followed by ';', ',', ')' or whitespace.
const HEX_COLOUR = /[:\s]#[0-9a-fA-F]{3,8}(?=[;,)\s])/;
const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/;

describe('team.css', () => {
  it('exists and team.html loads it with ?v=', () => {
    expect(existsSync('css/team.css')).toBe(true);
    expect(html).toMatch(/href="css\/team\.css\?v=\d+"/);
  });
  it('has no hex colour', () => {
    expect(read('css/team.css')).not.toMatch(HEX_COLOUR);
  });
});

describe('shared pd- block of style.css', () => {
  it('exists and has no hex literal', () => {
    const css = read('css/style.css');
    const at = css.indexOf(PD_HEADER);
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at)).not.toMatch(ANY_HEX);
  });
});

describe('admin-crud.css', () => {
  it('has no hex literal', () => {
    expect(read('css/admin-crud.css')).not.toMatch(ANY_HEX);
  });
});

describe('team.html', () => {
  it.todo('has no hex colour');
  it('has no native dialogs', () => {
    expect(html).not.toMatch(/\b(confirm|alert)\(/);
  });
  it.todo('does not use showConfirm(');
  it.todo('has no page tabs (nav-tabs)');
  it('has no Undo and no minute count', () => {
    expect(html).not.toContain('Undo');
    expect(html).not.toContain('minutes');
  });
});
