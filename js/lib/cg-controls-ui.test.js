// Static-source guard over costgrid.html's custom form controls, in the style of
// js/lib/pipeline-guard.test.js: the components are runtime-compiled templates, so this
// pins the wiring, not the rendering.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf8');
const html = read('costgrid.html');
const js = read('js/cg-controls.js');
const region = html.slice(html.indexOf('id="costGridEditorSection"'), html.indexOf('<div class="modal'));

describe('cost grid custom controls', () => {
  it('registers the three components and loads the script versioned', () => {
    expect(html).toMatch(/js\/cg-controls\.js\?v=\d+/);
    ['cg-date-picker', 'cg-select', 'cg-people-picker'].forEach(n => expect(html).toContain(`'${n}'`));
    ['CgDatePicker', 'CgSelect', 'CgPeoplePicker'].forEach(n => expect(js).toContain(`window.${n}`));
  });

  it('no native select or month input is left in the editor region', () => {
    expect(region).not.toMatch(/type="month"/);
    expect(region).not.toMatch(/<select/);
    expect(region).not.toMatch(/gg\/mm\/aaaa/);
  });

  // Review Focus #2
  it('every swapped control is disabled when the version is locked or read-only', () => {
    const controls = region.match(/<cg-(date-picker|select|people-picker)[\s\S]*?>/g) || [];
    expect(controls.length).toBeGreaterThanOrEqual(8);
    controls.forEach(c => expect(c, c.slice(0, 80)).toMatch(/:disabled=|:locked=/));
  });
});

// 2026-10-07, Gate 2 finding: only the To/End picker carried :min, so a Start could be
// picked after the End ("the picker prevents choosing an invalid value", spec §1.2).
describe('date pickers bound both ways', () => {
  it('CgDatePicker declares a max prop and honours it', () => {
    expect(js).toMatch(/max:\s*\{\s*type:\s*String/);
    expect(js).toMatch(/:max="max"|max:\s*this\.max|max:\s*this\.max\s*\|\|/);
  });

  it('each start picker is capped by its end value and each end picker floored by its start', () => {
    const pickers = region.match(/<cg-date-picker[\s\S]*?><\/cg-date-picker>/g) || [];
    const starts = pickers.filter(p => /startDate|taskStartDate/.test(p.match(/:model-value="[^"]*"/)[0]));
    const ends = pickers.filter(p => /endDate|taskEndDate/.test(p.match(/:model-value="[^"]*"/)[0]));
    expect(starts.length).toBe(2);
    expect(ends.length).toBe(2);
    starts.forEach(p => expect(p, p.slice(0, 70)).toMatch(/:max=/));
    ends.forEach(p => expect(p, p.slice(0, 70)).toMatch(/:min=/));
  });
});

// Round 1 code review: the popovers are teleported to <body>, so Tab order never reaches
// them and every keydown handler written for them was unreachable.
describe('popovers are keyboard reachable', () => {
  it('the listbox is focusable and takes focus when there is no search box', () => {
    expect(js).toMatch(/role="listbox" tabindex="-1"/);
    expect(js).toMatch(/else if \(this\.\$refs\.pop\) this\.\$refs\.pop\.focus\(\)/);
  });

  it('the calendar button is in the tab order and focuses a grid cell', () => {
    expect(js).not.toMatch(/cg-ctl-iconbtn[^>]*tabindex="-1"/);
    expect(js).toMatch(/@click="openFromButton"/);
    expect(js).toMatch(/focusGridCell\(\)\s*\{/);
  });

  it('a changing search query re-anchors the active row', () => {
    expect(js).toMatch(/query\(\)\s*\{\s*this\.activeIndex = this\.visibleOptions\.findIndex/);
  });
});

// Round 1 code review: the role-modal checkboxes are plain DOM inputs Vue does not own.
describe('role select modal selection state', () => {
  it('clears the checkboxes on open and counts the same set that is added', () => {
    expect(html).toMatch(/cg-role-checkbox'\)\.forEach\(cb => \{ cb\.checked = false; \}\)/);
    expect(html).toMatch(/cg-role-checkbox:checked:not\(:disabled\)/);
  });
});

// Round 1 code review: Currency was the only Offer-details control without the viewer guard.
describe('viewer guard covers every Offer-details control', () => {
  it('the currency select is disabled for a viewer', () => {
    const cur = region.match(/<cg-select[^>]*aria-label="Currency"[\s\S]*?><\/cg-select>/)[0];
    expect(cur).toMatch(/myPermission === 'viewer'/);
  });
});
