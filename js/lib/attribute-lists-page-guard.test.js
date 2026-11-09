// Guard for the Attribute Lists redesign (2026-11-09): what attribute-lists.html and css/attribute-lists.css must
// (not) contain. Text checks only — the logic is unit-tested in attribute-lists-ui.test.js and slugify.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const html = read('attribute-lists.html');
const ANY_HEX = /#[0-9a-fA-F]{3,8}\b/;
// A colour literal: preceded by ':' or whitespace, followed by ';', ',', ')' or whitespace.
const HEX_COLOUR = /[:\s]#[0-9a-fA-F]{3,8}(?=[;,)\s])/;
const RE_NATIVE = /\bconfirm\(|\balert\(/;

describe('css/attribute-lists.css', () => {
  it('exists and the page loads it with ?v=', () => {
    expect(existsSync('css/attribute-lists.css')).toBe(true);
    expect(html).toMatch(/href="css\/attribute-lists\.css\?v=\d+"/);
  });
  it('has no hex literal', () => expect(read('css/attribute-lists.css')).not.toMatch(ANY_HEX));
});

describe('css/admin-crud.css', () => {
  it('no longer has the badge-st pills', () => expect(read('css/admin-crud.css')).not.toContain('badge-st-'));
});

describe('attribute-lists.html — removed', () => {
  it.each(['nav-tabs', '<details', 'ph-back', 'badge-st-', 'slug-code', 'showConfirm(', '🔒'])(
    'has no %s', s => expect(html).not.toContain(s));
  it('uses no native confirm()/alert()', () => expect(html).not.toMatch(RE_NATIVE));
  it('has no hex colour', () => expect(html).not.toMatch(HEX_COLOUR));
  it('has one page head', () => expect(html.match(/class="ph"/g) || []).toHaveLength(1));
});

describe('attribute-lists.html — structure and states', () => {
  it.each([
    'class="md-layout"', 'class="md-subnav"', 'aria-label="Attribute lists and topics"', 'aria-current',
    'md-subnav-select', 'pd-state', 'Loading attribute lists…', 'Admin access required', 'Try again',
    "Couldn't load attribute lists.", "The server didn't respond. Your data is safe.",
    'Values to tag proposals and projects, and topics for experience profiles',
    'No attribute lists yet.', 'Create the first list',
  ])('contains %s', s => expect(html).toContain(s));
});

describe('attribute-lists.html — list content', () => {
  it.each([
    'ATTRIBUTE LIST', 'set at creation, never changes', 'href="team.html"', 'Search values…', 'pd-row-menu',
    'aria-haspopup="menu"', 'INSTEAD OF DELETE', 'pd-status-pill--busy', 'Updating…', 'Undo',
    "Items can't be deleted", 'Show all items', 'Tags already applied show the new label.',
    'No longer offered when tagging. Existing tags and profiles keep it.', 'Offered again when tagging.',
  ])('contains %s', s => expect(html).toContain(s));
  it('has a segmented status radiogroup', () => expect(html).toMatch(/class="md-seg"[^>]*role="radiogroup"/));
  it('has no Show inactive checkbox', () => expect(html).not.toContain('Show inactive'));
});

describe('attribute-lists.html — list and item drawers', () => {
  it.each([
    'id="listDrawer"', 'id="itemDrawer"', 'pd-drawer', 'Create list', 'Add item',
    'Generated from the name when you create the list', 'Stays the same after renaming.',
    'regardless of upper or lower case',
    'Create a set of values to tag proposals and projects. It also becomes a dimension of experience profiles.',
    "Tags already applied keep working: they refer to the slug, not the name.",
    'Offered as a tag in Cost Grid and Project config as soon as you add it.',
    'Proposals and projects already tagged with this value show the new label.',
  ])('contains %s', s => expect(html).toContain(s));
  it.each(['id="listModal"', 'id="itemModal"'])('has no %s', s => expect(html).not.toContain(s));
});

describe('attribute-lists.html — topics', () => {
  it.each([
    'Proposed topics', 'Search topics…', 'to review', 'reviewed this session', 'None reviewed yet this session',
    'role="progressbar"', 'REVERSIBLE', 'IRREVERSIBLE', 'pd-row-menu-item--danger', 'Approving…', 'View rejected',
    'Not linked to any description yet', 'href="profile-jobs.html"', 'No topics to review.', 'No approved topics yet.',
    'No rejected topics.', 'Clear search', 'It starts empty', 'Naming rules', 'id="topicDrawer"',
    'Profiles show the new name at once.', 'Hidden from profiles and never proposed again. You can restore it.',
    'Its descriptions move to another topic; this one disappears.',
    "Approve keeps the agent's name. Rename first if the wording needs fixing; merge if the same competence already exists.",
    'Approved topics appear in experience profiles in Team. Renames, rejections and merges show there immediately, without recalculation.',
    'Rejected topics are hidden from profiles and the agent never proposes them again. Restore makes a topic approved.',
    "Couldn't ", 'The list was reloaded. Server: ',
  ])('contains %s', s => expect(html).toContain(s));
  it('has no topic modal', () => expect(html).not.toContain('id="topicModal"'));
});

describe('attribute-lists.html — merge', () => {
  // The phone section picker is the one native <select> the page may have (md-subnav pattern).
  const subnavSelect = html.indexOf('<div class="md-subnav-select">');
  const subnavEnd = html.indexOf('</nav>', subnavSelect);
  const outsideSubnav = html.slice(0, subnavSelect) + html.slice(subnavEnd);

  it.each([
    'id="mergeDrawer"', '<combo-select', 'Choose the topic to keep…', 'TOPIC TO MERGE', 'What happens', "Can't be undone.",
    'btn-danger', 'id="mergeConfirmModal"', 'pd-confirm', 'Just want it gone?', 'Reject instead',
    "I understand this can't be undone.", 'Merge topics', 'Back', 'Use this when two topics describe the same competence.',
    "An approved topic can only merge into another approved topic, so the approval isn't lost.",
    'You can merge into an approved or a proposed topic.', "This can't be undone. Profiles in Team update immediately.",
    'js/combo-select.js?v=', ".component('combo-select', window.ComboSelect)",
  ])('contains %s', s => expect(html).toContain(s));
  it('has no merge modal', () => expect(html).not.toContain('id="mergeModal"'));
  it('uses pd-drawer for every form', () => {
    for (const id of ['listDrawer', 'itemDrawer', 'topicDrawer', 'mergeDrawer']) {
      expect(html).toMatch(new RegExp('class="offcanvas offcanvas-end pd-drawer"[^>]*id="' + id + '"'));
    }
  });
  it('has no Bootstrap modal other than #mergeConfirmModal', () => {
    const modals = html.match(/class="modal fade[^"]*"[^>]*>/g) || [];
    expect(modals).toHaveLength(1);
    expect(modals[0]).toContain('id="mergeConfirmModal"');
    expect(modals[0]).toContain('pd-confirm-modal');
  });
  it('has no <select> or <option> outside the phone section picker', () => {
    expect(subnavSelect).toBeGreaterThan(-1);
    expect(outsideSubnav).not.toContain('<select');
    expect(outsideSubnav).not.toContain('<option');
  });
  it('documents that Esc in the confirmation leaves the drawer open', () => {
    expect(html).toContain('Esc in the confirmation closes only the confirmation');
  });
  it('a failed merge stays in the confirmation and does not count as reviewed', () => {
    const at = html.indexOf('async submitMerge(');
    const body = html.slice(at, html.indexOf('\n        },', at));
    const fail = body.indexOf('if (!r.ok)');
    expect(fail).toBeGreaterThan(-1);
    expect(body.indexOf('markReviewed()')).toBeGreaterThan(fail);
    expect(body.slice(fail, body.indexOf('\n', fail))).toMatch(/form\.error = .*return;/);
  });
});

describe('css/attribute-lists.css — responsive', () => {
  const css = read('css/attribute-lists.css');
  const phoneAt = css.indexOf('@media (max-width: 767.98px)');
  it('has a tablet block', () => expect(css).toContain('@media (max-width: 1023.98px)'));
  it('has a phone block with 44px targets', () => {
    expect(phoneAt).toBeGreaterThan(-1);
    const phone = css.slice(phoneAt);
    expect(phone).toContain('44px');
    for (const sel of ['.md-seg-btn', '.al-search input', '.al-btn-navy', '.pd-row-menu-trigger']) expect(phone).toContain(sel);
  });
  it('the tablet chips show the short group labels', () => expect(html).toContain('al-group-short'));
});

describe('css/attribute-lists.css — focus', () => {
  it('a title focused by script (tabindex -1) draws no outline', () => {
    expect(read('css/attribute-lists.css')).toContain('.pd-confirm-title[tabindex="-1"]:focus');
  });
});
