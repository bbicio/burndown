// Static guard: project-config.html bounds the task and period pickers by the project period
// (dates C3) and shows the out-of-period warnings.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'project-config.html'), 'utf8');

// The <cg-date-picker ...> opening tag that carries the given aria-label.
function picker(label) {
  const at = html.indexOf(`aria-label="${label}"`);
  expect(at, label).toBeGreaterThan(-1);
  const from = html.lastIndexOf('<cg-date-picker', at);
  return html.slice(from, html.indexOf('</cg-date-picker>', at));
}

describe('project-config task period bindings', () => {
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

  it('shows the per-task warning, the notice near Save and the derive line', () => {
    expect(html).toContain('>Outside the project period</');
    expect(html).toContain("' outside the project period (' +");
    expect(html).toContain('Task dates and the period are not saved until the tasks are moved inside it or the period is widened; other changes are saved.');
    expect(html).toMatch(/v-if="outOfPeriod\.length && !isViewer"/);
    expect(html).toContain('Outside the project period, not distributed');
    // hours alone count: zero-rate resources past the period have outsideBudget 0 but outsideHours > 0
    expect(html).toContain('result.outsideBudget > 0 || result.outsideHours > 0');
  });

  it('adds no listener or watcher for it (B-144)', () => {
    expect(html).not.toMatch(/outOfPeriod[^\n]*\.\$watch|watch:\s*\{[^}]*outOfPeriod/);
  });
});
