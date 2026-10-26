// Static guard: costgrid.html bounds the task and period pickers by the proposal period
// (dates C3) and shows the out-of-period warnings.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'costgrid.html'), 'utf8');

// The <cg-date-picker ...> opening tag that carries the given aria-label.
function picker(label) {
  const at = html.indexOf(`aria-label="${label}"`);
  expect(at, label).toBeGreaterThan(-1);
  const from = html.lastIndexOf('<cg-date-picker', at);
  return html.slice(from, html.indexOf('</cg-date-picker>', at));
}

describe('costgrid task period bindings', () => {
  it.each(['Task start date', 'Task end date'])('%s picker binds :min/:max to taskDateBounds(', label => {
    const tag = picker(label);
    expect(tag).toMatch(/:min="taskDateBounds\(/);
    expect(tag).toMatch(/:max="taskDateBounds\(/);
  });

  it('period month pickers bind their limits through periodBounds(', () => {
    expect(html).toMatch(/periodStartBounds\(\) \{ return window\.periodBounds\(/);
    expect(html).toMatch(/periodEndBounds\(\) \{ return window\.periodBounds\(/);
    expect(picker('Start month')).toContain(':max="periodStartBounds.max"');
    expect(picker('End month')).toContain(':min="periodEndBounds.min"');
  });

  it('shows the per-task warning and the phasing line', () => {
    expect(html).toContain('Outside the proposal period');
    expect(html).toContain('fall outside the proposal period and are not phased');
  });

  it('adds no listener or watcher for it (B-144)', () => {
    expect(html).not.toMatch(/outOfPeriod[^\n]*\.\$watch|watch:\s*\{[^}]*outOfPeriod/);
  });
});
