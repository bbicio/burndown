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
