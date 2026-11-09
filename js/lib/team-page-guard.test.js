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
  it('has no hex colour', () => expect(html).not.toMatch(HEX_COLOUR));
  it('has no native dialogs', () => {
    expect(html).not.toMatch(/\b(confirm|alert)\(/);
  });
  it('does not use showConfirm(', () => expect(html).not.toContain('showConfirm('));
  it('has no page tabs (nav-tabs)', () => {
    expect(html).not.toContain('nav-tabs');
  });
  it('has no Undo and no minute count', () => {
    expect(html).not.toContain('Undo');
    expect(html).not.toContain('minutes');
  });
});

describe('team.html list (Task 3)', () => {
  it('drops the Show inactive checkbox', () => expect(html).not.toContain('showInactive'));
  it('subtitle counts resources, active and inactive', () => expect(html).toMatch(/class="ph-sub">.*'resources' \}\} · \{\{ counts\.active \}\} active · \{\{ counts\.inactive \}\} inactive/));
  it('has a three-button status segmented control', () => {
    expect(html).toContain('class="md-seg"');
    expect(html).toMatch(/v-for="f in statusFilters"[^>]*class="md-seg-btn"/);
    expect(html).toContain("statusFilters: [");
  });
  it('has the Role and PDash user selects', () => {
    expect(html).toContain('aria-label="Role"');
    expect(html).toContain('aria-label="PDash user"');
  });
  it('sortable headers expose aria-sort', () => expect(html).toContain(':aria-sort='));
});

describe('team.html row menu and delete (Task 4)', () => {
  it.each(['aria-haspopup="menu"', 'role="menu"', 'LEFT THE COMPANY', 'IRREVERSIBLE',
    "I understand this can't be undone.", 'Updating…', 'id="deleteModal"'])('contains %s', s => expect(html).toContain(s));
  it('has no local confirm modal', () => expect(html).not.toContain('id="confirmModal"'));
});

describe('team.html resource drawer (Task 5)', () => {
  it('drops the old modal', () => expect(html).not.toContain('id="resourceModal"'));
  it('the drawer is a pd-drawer', () => expect(html).toMatch(/class="[^"]*pd-drawer[^"]*" [^>]*id="resourceDrawer"|id="resourceDrawer"[^>]*class="[^"]*pd-drawer/));
  it.each(['Create another', 'Open resource', 'Missing a role? Add it first in', 'master-roles.html',
    'First name is required.', 'Last name is required.', 'Email is required.', 'Role is required.'])('contains %s', s => expect(html).toContain(s));
  it('the panel Esc listener skips an open offcanvas', () => expect(html).toContain(".modal.show, .offcanvas.show"));
});

describe('team.html unmatched drawer (Task 6)', () => {
  const start = html.indexOf('id="unmatchedDrawer"');
  const drawer = html.slice(start, html.indexOf('RESOURCE DETAIL PANEL', start));
  it('is a wide pd-drawer', () => expect(html).toMatch(/class="[^"]*pd-drawer--wide[^"]*" id="unmatchedDrawer"/));
  it.each(['resolved this session', 'AMBIGUOUS', 'Resolves to', 'Removing an alias sends the name back to the queue',
    "Not a person (e.g. TBD). Stored as an ignored alias.", 'Assigning…', 'Ignoring…', 'Rescanning…', 'No unmatched names.'])('drawer contains %s', s => expect(drawer).toContain(s));
  it.each(['Same name · candidates', 'Active resources'])('combo groups contain %s', s => expect(html).toContain(s));
  it('drawer has no <details>', () => expect(drawer).not.toContain('<details'));
  it('busy state is keyed by name, not stored on the row', () => {
    expect(drawer).toContain('busyUnmatched[u.name_normalized]');
    expect(html).not.toContain('u._loading');
  });
  it('the ambiguous sentence does not assume active candidates', () => expect(html).not.toContain('active resources share this name'));
});

describe('team.html resource panel (Task 7)', () => {
  const start = html.indexOf('id="resourceDetailPanel"');
  const panel = html.slice(start, html.indexOf('NEW / EDIT RESOURCE DRAWER', start));
  it.each(['Profile processing', 'profile-jobs.html', 'Direct experience', 'Project context', 'Try again',
    'Open Unmatched names', 'aria-expanded', 'tm-panel-card tm-mgmt', 'Not linked', 'Loading profile…', 'Not calculated yet',
    'No actuals matched to this person yet', "Couldn't load the profile."])('panel contains %s', t => expect(panel).toContain(t));
  it('panel has no inline style attribute with a colour', () => expect(panel).not.toMatch(/style="[^"]*(#|rgba?\(|background|color)/));
  it('page has no <details>', () => expect(html).not.toContain('<details'));
});

describe('team.html board decisions (Task 9)', () => {
  it('role error box uses the 13ag sentence', () => expect(html).toContain('Role is required. Pick one from the list, or add it in Master Data first.'));
  it('the Management card has no heading', () => expect(html).not.toContain('tm-mgmt-head'));
  it('Last calculated is formatted by profileCalcText', () => expect(html).toContain('profileCalcText(profileData.profile_computed_at)'));
  it('Ignore uses the ban icon below 1280px', () => expect(html).toMatch(/tm-icon class="tm-um-ignore-icon" name="ban"/));
});

describe('team.html uses the shared combo-select', () => {
  it('no longer defines it inline', () => expect(html).not.toContain("app.component('combo-select', {"));
  it('loads js/combo-select.js', () => expect(html).toMatch(/js\/combo-select\.js\?v=\d+/));
  it('registers window.ComboSelect', () => expect(html).toContain('window.ComboSelect'));
});
