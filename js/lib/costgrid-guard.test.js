// Guard over costgrid.html's editor region AND its modals (the region runs from the Vue
// root to the end of the file), plus css/costgrid.css. Modelled on pipeline-guard.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('costgrid.html');
const css = read('css/costgrid.css');
const start = html.indexOf('id="costGridEditorSection"');
const region = html.slice(start);

describe('cost grid guard', () => {
  it('locates the editor template', () => {
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain('id="cgGridTable"');
    expect(region).toContain('id="cgRoleSelectModal"');
  });

  it('has no hex colour literals in costgrid.css or the editor region', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(region).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('has no emoji in the editor region or its modals', () => {
    expect(region).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('costgrid.css and cg-controls.js are loaded, versioned, by costgrid.html only', () => {
    expect(html).toMatch(/css\/costgrid\.css\?v=\d+/);
    expect(html).toMatch(/js\/cg-controls\.js\?v=\d+/);
    expect(html).toMatch(/js\/lib\/cg-controls-calc\.js\?v=\d+/);
    const others = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'costgrid.html');
    others.forEach(f => {
      expect(read(f), f).not.toContain('costgrid.css');
      expect(read(f), f).not.toContain('cg-controls.js');
    });
  });

  it('the Bootstrap table class is gone from the grid (G-14)', () => {
    expect(region).toContain('<table class="cg-grid mb-0" id="cgGridTable"');
  });
});
