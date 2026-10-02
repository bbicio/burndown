import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = {};
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();

// Resolve `var(--x)` chains to a final value.
function value(name) {
  let v = tokens[name];
  for (let i = 0; i < 5 && v && v.startsWith('var('); i++) v = tokens[v.match(/var\(--([a-z0-9-]+)\)/)[1]];
  return v;
}
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Names that existed before this cycle: none may disappear.
const PREVIOUS = `brand-navy brand-mid brand-dark brand-magenta brand-gold text-primary text-secondary text-body
text-muted text-faint text-disabled text-placeholder text-inverse surface-white surface-light surface-subtle
surface-medium border-light border-medium border-dark indigo-50 indigo-100 indigo-200 indigo-300 indigo-400
indigo-500 indigo-600 indigo-border violet-50 violet-100 violet-200 violet-400 violet-500 violet-600 violet-border
sand-50 sand-100 sand-200 sand-300 sand-400 sand-border color-success color-success-bg color-danger color-danger-bg
color-warning color-warning-bg color-warning-text color-info color-info-bg portfolio-totals-bg
portfolio-indigo-totals-bg portfolio-violet-tint-bg kpi-blue kpi-green kpi-orange kpi-purple kpi-teal kpi-red
pipeline-sip-bg pipeline-sip-color pipeline-expected-bg pipeline-expected-color pipeline-anticipated-bg
pipeline-anticipated-color pipeline-committed-bg pipeline-committed-color pipeline-canceled-bg
pipeline-canceled-color text-2xs text-xs text-sm text-base text-md text-lg text-xl text-2xl radius-xs radius-sm
radius-md radius-lg radius-xl radius-full shadow-xs shadow-sm shadow-md shadow-lg shadow-xl space-1 space-2 space-3
space-4 space-5 space-6 duration-fast duration-base ease-out ease-in-out z-dropdown z-sticky z-fixed z-modal
z-notification`.split(/\s+/);

const NEW = `brand-magenta-hover brand-magenta-active color-success-text color-danger-text color-info-text
color-danger-hover color-danger-active focus-ring font-family-base weight-regular weight-medium weight-semibold
weight-bold leading-tight leading-base leading-relaxed z-tooltip status-not-started-bg status-started-bg
status-at-risk-bg status-on-hold-bg status-completed-bg status-text chart-actual chart-committed chart-phasing`.split(/\s+/);

const NAV = `brand-magenta-tint brand-magenta-tint-hover icon-size-sm icon-size-md nav-text-muted
nav-item-hover-bg nav-item-active-bg nav-sep`.split(/\s+/);

describe('tokens.css', () => {
  it('keeps every previously defined token', () => {
    expect(PREVIOUS.filter(n => !(n in tokens))).toEqual([]);
  });

  it('defines every new token', () => {
    expect(NEW.filter(n => !(n in tokens))).toEqual([]);
  });

  it('has the consolidated neutral values', () => {
    expect(tokens['text-muted']).toBe('#6b7280');
    expect(tokens['border-light']).toBe('#e5e7eb');
  });

  it('every var() reference resolves to a defined token', () => {
    const missing = [];
    for (const [name, v] of Object.entries(tokens)) {
      const m = v.match(/var\(--([a-z0-9-]+)\)/);
      if (m && !(m[1] in tokens)) missing.push(`${name} -> ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('pipeline stage text meets WCAG AA (4.5:1) on its background', () => {
    const low = ['sip', 'expected', 'anticipated', 'committed', 'canceled']
      .map(s => [s, ratio(value(`pipeline-${s}-color`), value(`pipeline-${s}-bg`))])
      .filter(([, r]) => r < 4.5);
    expect(low).toEqual([]);
  });

  it('project status badges meet WCAG AA with the shared status text colour', () => {
    const low = ['not-started', 'started', 'at-risk', 'on-hold', 'completed']
      .map(s => [s, ratio(value('status-text'), value(`status-${s}-bg`))])
      .filter(([, r]) => r < 4.5);
    expect(low).toEqual([]);
  });

  it('semantic text-on-tint pairs and danger hover/active meet WCAG AA', () => {
    const pairs = [
      ['success', value('color-success-text'), value('color-success-bg')],
      ['danger', value('color-danger-text'), value('color-danger-bg')],
      ['info', value('color-info-text'), value('color-info-bg')],
      ['warning', value('color-warning-text'), value('color-warning-bg')],
      ['danger-hover', '#ffffff', value('color-danger-hover')],
      ['danger-active', '#ffffff', value('color-danger-active')],
    ];
    expect(pairs.filter(([, a, b]) => ratio(a, b) < 4.5).map(p => p[0])).toEqual([]);
  });

  it('defines the navigation tokens (cycle B2)', () => {
    expect(NAV.filter(n => !(n in tokens))).toEqual([]);
    expect(tokens['brand-magenta-tint']).toBe('#fdf0f5');
    expect(tokens['icon-size-sm']).toBe('14px');
    expect(tokens['icon-size-md']).toBe('16px');
  });

  it('navigation text meets AA on navy; the unread bell red meets 3:1 on white (non-text)', () => {
    // nav-text-muted is rgba(255,255,255,.65) over navy: blend it by hand
    const navy = value('brand-navy');
    const a = Number(tokens['nav-text-muted'].match(/,\s*([0-9.]+)\)/)[1]);
    const ch = i => Math.round(255 * a + parseInt(navy.slice(i, i + 2), 16) * (1 - a));
    const blended = '#' + [1, 3, 5].map(i => ch(i).toString(16).padStart(2, '0')).join('');
    expect(ratio(blended, navy)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(value('color-danger'), value('surface-white'))).toBeGreaterThanOrEqual(3);
  });
});
