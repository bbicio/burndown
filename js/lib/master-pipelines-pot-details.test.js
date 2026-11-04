import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'master-pipelines.html'), 'utf8');

describe('master-pipelines POT table and year row', () => {
  it('folds E and SIP into the achievement bar, not into columns', () => {
    expect(page).not.toContain('>Expected</th>');
    expect(page).not.toContain('>SIP</th>');
    expect(page).toContain('in SIP / Expected');
    expect(page).toContain('+pot.expected_total');
    expect(page).toContain('+pot.sip_total');
  });

  it('keeps achievement on achieved_total', () => {
    expect(page).toContain('achievement(+pot.achieved_total');
    expect(page).toContain("formatMoney(+pot.committed_total || 0, 'EUR', activeCurrencies)");
    expect(page).toContain("formatMoney(+pot.anticipated_total || 0, 'EUR', activeCurrencies)");
  });

  it('Update target needs a reason', () => {
    const i = page.indexOf('Update target');
    const btn = page.slice(page.lastIndexOf('<button', i), i);
    expect(btn).toContain('potf.note.trim()');
  });

  it('keeps the server error under the row and the row open', () => {
    const fn = page.slice(page.indexOf('async savePot('), page.indexOf('async deletePot('));
    const c = fn.slice(fn.indexOf('catch (e)'));
    expect(c).toContain('this.potf.error = e.message');
    expect(c).not.toContain('this.potf.show = false');
  });

  it('hides the outside-POT note when there is nothing outside', () => {
    expect(page).toContain('v-if="outsideCommitted != null"');
    expect(page).toContain('outsidePotCommitted(');
  });

  it('creates a pipeline hidden', () => {
    const fn = page.slice(page.indexOf('async createPipelineYear('), page.indexOf('async togglePipelineYear('));
    expect(fn).toContain('Api.pipelineYears.create(year, false)');
  });

  it('disables delete when the year has offers', () => {
    expect(page).toContain(':disabled="py.offers > 0');
    expect(page).toContain('Hide it instead.');
  });

  it('toggles with the switch disabled while saving', () => {
    expect(page).toContain('class="md-switch"');
    expect(page).toContain(':disabled="py._toggling"');
  });

  it('has no native dialogs', () => {
    expect(page).not.toMatch(/(^|[^.\w])(confirm|alert)\(/);
  });

  it('keeps the year row achievement on achieved_total', () => {
    expect(page).toContain('achievement(yearTotals[py.year].achieved_total, yearTotals[py.year].pot_total)');
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
