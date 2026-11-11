import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICON_PATHS, iconSvg, PhIcon } from './icons.js';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const GUARANTEED = [
  'pipeline', 'portfolio', 'planning', 'config', 'timesheets', 'user', 'team', 'tag', 'dbreset', 'terms',
  'notify', 'key', 'signout', 'bell', 'lock', 'chevronLeft', 'chevronRight',
  'search', 'chevron-right', 'chevron-down', 'grid', 'list', 'gear', 'arrow-right', 'close', 'chevron-left',
  'check', 'upload', 'calendar', 'share', 'download',
  'save', 'clone', 'configure', 'plus', 'chevronDown', 'maximize', 'minimize',
  'info', 'filter',
];

describe('iconSvg', () => {
  it('emits a 16x16 decorative svg', () => {
    const s = iconSvg('pipeline');
    expect(s).toContain('viewBox="0 0 16 16"');
    expect(s).toContain('width="16"');
    expect(s).toContain('aria-hidden="true"');
    expect(s).toContain('class="pd-icon"');
  });
  it('honours size and extra class', () => {
    const s = iconSvg('share', 14, 'x');
    expect(s).toContain('width="14"');
    expect(s).toContain('class="pd-icon x"');
  });
  it('returns an empty string for an unknown name', () => {
    expect(iconSvg('nope')).toBe('');
  });
});

describe('ICON_PATHS', () => {
  it('has the project-config icons', () => { for (const n of ['trash','eye','refresh','trend-up']) { expect(ICON_PATHS[n]).toMatch(/stroke="currentColor"/); expect(ICON_PATHS[n]).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); } });
  it('has the Breakdown v2 icons', () => { for (const n of ['filter','arrow-up','arrow-down']) { expect(ICON_PATHS[n]).toMatch(/stroke="currentColor"/); expect(ICON_PATHS[n]).not.toMatch(/#[0-9a-fA-F]{3,8}/); } });
  it.each(GUARANTEED)('has %s', (n) => { expect(ICON_PATHS).toHaveProperty(n); });
  it('covers every icon named in js/nav.js', () => {
    const src = read('js/nav.js');
    const names = new Set();
    for (const m of src.matchAll(/navIcon\(\s*'([^']+)'/g)) names.add(m[1]);
    for (const m of src.matchAll(/icon:\s*'([^']+)'/g)) names.add(m[1]);
    expect(names.size).toBeGreaterThan(5);
    for (const n of names) expect(ICON_PATHS).toHaveProperty(n);
  });
});

describe('PhIcon', () => {
  it('declares name and size props', () => {
    expect(PhIcon.props.name.required).toBe(true);
    expect(PhIcon.props.size.default).toBe(16);
  });
});

describe('page wiring', () => {
  const pages = readdirSync(root).filter((f) => f.endsWith('.html')).filter((f) => read(f).includes('initNav('));
  it('finds the 20 initNav pages', () => { expect(pages.length).toBe(20); });
  it.each(pages)('%s loads icons.js before nav.js', (p) => {
    const html = read(p);
    const i = html.indexOf('js/lib/icons.js');
    const n = html.indexOf('src="js/nav.js');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(n);
  });
});

describe('Timesheets redesign icons', () => {
  it.each(['folder', 'sliders', 'sparkle', 'warning'])('%s is a currentColor stroke icon without hex', (n) => {
    const s = iconSvg(n);
    expect(s).toContain('class="pd-icon"');
    expect(s).toMatch(/<(path|rect|circle)\b/);
    expect(ICON_PATHS[n]).toMatch(/stroke="currentColor"/);
    expect(s).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
