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

describe('openPotDetails', () => {
  const body = page.slice(page.indexOf('async openPotDetails('), page.indexOf('stageColor(pipeline) {'));

  it('is found in the page', () => {
    expect(body.length).toBeGreaterThan(0);
  });

  it('writes no literal hex colour', () => {
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('takes the stage badge colours from the tokens, not from stageBg()/stageColor()', () => {
    expect(body).not.toContain('this.stageBg(');
    expect(body).not.toContain('this.stageColor(');
  });

  it('shows the original currency only for a non-EUR proposal', () => {
    expect(body).toContain("p.currency && p.currency !== 'EUR'");
    expect(body).toContain('p.value_original');
  });

  it('lists Expected and SIP as not in total', () => {
    expect(body).toContain('Not in total');
    expect(body).toContain('d.expected_total');
    expect(body).toContain('d.sip_total');
  });

  it('colours Committed and Anticipated with the stage tokens', () => {
    expect(body).toContain('var(--pipeline-committed-color)');
    expect(body).toContain('var(--pipeline-anticipated-color)');
  });
});
