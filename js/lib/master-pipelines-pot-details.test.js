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

describe('POT details drawer', () => {
  const start = page.indexOf('class="mdp-drawer"');
  const drawer = page.slice(page.lastIndexOf('<', start), page.indexOf('<!-- /drawer -->'));

  it('is a Vue template, not a Bootstrap modal filled with innerHTML', () => {
    expect(start).toBeGreaterThan(-1);
    expect(page).not.toContain('id="potDetailsModal"');
    expect(page).not.toContain('openPotDetails');
    expect(page).not.toContain('innerHTML');
    expect(page).toContain('Api.pots.details(');
  });

  it('renders only for a POT of the open year (a stale deep link opens no drawer)', () => {
    expect(page).toContain('<div v-if="drawerPot" class="mdp-drawer-wrap">');
    expect(page).toContain('resolvePot(this.pots, this.potId)');
  });

  it('closes on the scrim, the close button and Escape', () => {
    expect(drawer).toContain('@click="closeDrawer"');
    expect(page).toMatch(/keydown[\s\S]{0,200}Escape[\s\S]{0,120}closeDrawer/);
  });

  it('writes no literal hex colour and takes stage colours from the tokens', () => {
    expect(drawer).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(drawer).not.toContain('stageBg(');
    expect(drawer).not.toContain('stageColor(');
    expect(drawer).toContain('var(--pipeline-');
  });

  it('shows the original currency only for a non-EUR proposal', () => {
    expect(drawer).toContain("p.currency && p.currency !== 'EUR'");
    expect(drawer).toContain('p.value_original');
  });

  it('opens a proposal in a new tab and lists E and SIP as not counted', () => {
    expect(drawer).toContain('/costgrid.html?cgId=');
    expect(drawer).toContain('target="_blank"');
    expect(drawer).toContain('not counted in the gap');
    expect(drawer).toContain('Only Committed and Anticipated count towards the target.');
    expect(drawer).toContain('No proposals for this target in this year.');
    expect(drawer).toContain('No history yet.');
  });

  it('edits through the row editor', () => {
    expect(drawer).toContain('Edit target');
    expect(page).toContain('editFromDrawer(');
  });
});
