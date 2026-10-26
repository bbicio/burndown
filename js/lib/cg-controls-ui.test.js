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
    // isReadOnly() == isLocked || myPermission === 'viewer' (costgrid.html), the single
    // predicate every editable field now shares.
    expect(cur).toMatch(/:disabled="isReadOnly"/);
  });
});

// Round 2 code review: the viewer guard was only on the controls this cycle swapped, so
// hours, PTC, task name/description and rate inputs stayed editable for a viewer.
describe('one read-only predicate for every editable field', () => {
  it('no editable field is guarded by isLocked alone', () => {
    expect(region).not.toMatch(/:disabled="isLocked"/);
  });

  it('isReadOnly combines the lock state with the viewer permission', () => {
    expect(html).toMatch(/isReadOnly\(\)\s*\{\s*return this\.isLocked \|\| this\.cg\?\.myPermission === 'viewer'/);
  });

  it('filtering the role list recounts the surviving checkboxes', () => {
    expect(html).toMatch(/roleSearch\(\) \{ this\.\$nextTick/);
    expect(html).toMatch(/roleActiveTeam\(\) \{ this\.\$nextTick/);
  });
});

// Dates C1, Task 5 (B-030 part 3): a typed value and the month shortcuts honour min/max,
// and a refusal is shown inline instead of silently reverting.
describe('cg-date-picker honours min/max for typed values and shortcuts', () => {
  const picker = js.slice(js.indexOf('window.CgDatePicker'), js.indexOf('window.CgSelect'));
  const commit = picker.slice(picker.indexOf('commitTyped()'), picker.indexOf('onEsc()'));

  it('commitTyped delegates to parseDateInput and no longer calls the old parsers', () => {
    expect(commit).toContain('parseDateInput(');
    expect(commit).not.toContain('parseItDate(');
    expect(commit).not.toContain('parseMonthInput(');
  });

  it('leaving the field unedited checks nothing, and Esc/Clear reset the error', () => {
    // The early return must not clear a reason shown by a previous commit (Enter, then blur).
    expect(commit).toMatch(/if \(this\.text === this\.display\) return;/);
    for (const name of ['onEsc()', 'clear()']) {
      const body = picker.slice(picker.indexOf(name), picker.indexOf('},', picker.indexOf(name)));
      expect(body).toContain("this.error = ''");
    }
  });

  it('shows the error inline with role="alert"', () => {
    expect(picker).toMatch(/class="cg-ctl-error"[^>]*role="alert"|role="alert"[^>]*class="cg-ctl-error"/);
  });

  it('both shortcut buttons are disabled outside min/max', () => {
    const btns = picker.match(/<button[^>]*pickRelativeMonth\([01]\)[^>]*>/g) || [];
    expect(btns.length).toBe(2);
    btns.forEach(b => expect(b).toMatch(/:disabled="[^"]*isWithin\(/));
  });

  it('css/controls.css defines .cg-ctl-error with tokens only', () => {
    const css = read('css/controls.css');
    const m = css.match(/\.cg-ctl-error\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).not.toContain('#');
  });
});

describe('cg-date-picker: unambiguous format and inline popover (dates C2)', () => {
  const picker = js.slice(js.indexOf('window.CgDatePicker'), js.indexOf('window.CgSelect'));
  const tpl = picker.slice(picker.indexOf('template:'));

  it('the date picker placeholders are the unambiguous format', () => {
    expect(picker).toContain("'Dec 1, 2025'");
    expect(picker).toContain("'Dec 2025'");
    expect(picker).not.toContain('dd/mm/yyyy');
    expect(picker).not.toContain('mm/yyyy');
  });

  it('the date input is not numeric-only', () => {
    expect(tpl).not.toContain('inputmode="numeric"');
    expect(tpl).toContain('maxlength="20"');
  });

  it('the popover can render inline', () => {
    expect(tpl).toContain('<Teleport to="body" :disabled="inlinePopover">');
    expect(picker).toMatch(/inlinePopover:\s*\{\s*type:\s*Boolean/);
  });

  it('an inline popover is absolutely positioned, not by viewport coordinates', () => {
    const css = read('css/controls.css');
    const m = css.match(/\.cg-pop\.cg-pop--inline\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/position:\s*absolute/);
    expect(tpl).toContain('cg-pop--inline');
    expect(tpl).toMatch(/inlinePopover \? undefined : cgPopStyle/);
  });

  it('.cg-ctl is a positioning context (the inline popover is absolute inside it)', () => {
    const m = read('css/controls.css').match(/\.cg-ctl\s*\{[^}]*\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/position:\s*relative/);
  });

  it('inline popover keys are taken by a window capture listener (Bootstrap dropdown runs first)', () => {
    expect(picker).toMatch(/window\.addEventListener\('keydown', this\._cgInlineKeys, true\)/);
    expect(picker).toMatch(/window\.removeEventListener\('keydown', this\._cgInlineKeys, true\)/);
    const h = picker.slice(picker.indexOf('this._cgInlineKeys = '), picker.indexOf("window.addEventListener('keydown', this._cgInlineKeys"));
    expect(h).toContain('!this.inlinePopover || !this.cgOpen');
    // Esc from inside the popover and from the input/button of the picker
    expect(h).toContain('this.$refs.pop.contains(e.target)');
    expect(h).toContain('this.$el.contains(e.target)');
    expect(h).toContain('this.text = this.display');
    expect(h).toContain('e.stopPropagation()');
    // vertical arrows in the grid are handled directly
    expect(h).toMatch(/ArrowUp[\s\S]*ArrowDown[\s\S]*this\.\$refs\.grid\.contains\(e\.target\)/);
    expect(h).toContain('this.onGridKey(e)');
    const m = picker.slice(picker.indexOf('onPopEsc() {'), picker.indexOf('onEsc() {'));
    expect(m).toContain('this.cgClosePopover(true)');
  });

  it('the modelValue watcher also clears the error (B-137)', () => {
    const w = picker.slice(picker.indexOf('modelValue: { immediate'), picker.indexOf('cgOpen(v)'));
    expect(w).toContain("this.error = ''");
  });
});
