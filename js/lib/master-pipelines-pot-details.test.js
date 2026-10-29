import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'master-pipelines.html'), 'utf8');

describe('master-pipelines POT table and year row', () => {
  it('has Expected and SIP columns after Anticipated', () => {
    const a = page.indexOf('>Anticipated</th>');
    const e = page.indexOf('>Expected</th>');
    const s = page.indexOf('>SIP</th>');
    expect(a).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(a);
    expect(s).toBeGreaterThan(e);
  });

  it('renders the Expected and SIP totals of each POT in EUR', () => {
    expect(page).toContain("formatMoney(+pot.expected_total || 0, 'EUR', activeCurrencies)");
    expect(page).toContain("formatMoney(+pot.sip_total || 0, 'EUR', activeCurrencies)");
  });

  it('shows E and S in the year row', () => {
    expect(page).toContain('yearTotals[py.year].expected_total');
    expect(page).toContain('yearTotals[py.year].sip_total');
  });

  it('keeps Total (C+A) on achieved_total', () => {
    expect(page).toContain("formatMoney(+pot.achieved_total || 0, 'EUR', activeCurrencies)");
    expect(page).toContain('yearTotals[py.year].achieved_total / yearTotals[py.year].pot_total');
  });
});
