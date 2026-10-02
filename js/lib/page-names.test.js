import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const nav = new Function(read('js/nav.js') + '\nreturn { NAV_MAIN, NAV_GROUPS };')();

// page file -> activeTab id passed to initNav
const PAGES = {
  'pipeline.html': 'pipeline', 'portfolio.html': 'portfolio', 'planning.html': 'planning',
  'config.html': 'config', 'timesheets.html': 'timesheets', 'admin.html': 'admin', 'team.html': 'team',
  'attribute-lists.html': 'attributelists', '_db-reset.html': 'dbreset', '_terms-editor.html': 'termseditor',
};
const labelOf = id => [...nav.NAV_MAIN, ...nav.NAV_GROUPS.flatMap(g => g.items)].find(i => i.id === id).label;

describe('menu entry = <title> = breadcrumb', () => {
  for (const [file, id] of Object.entries(PAGES)) {
    const label = labelOf(id);
    const html = read(file);
    it(`${file}: "${label}"`, () => {
      expect(html).toContain(`<title>PDash — ${label}</title>`);
      const start = html.indexOf(`initNav('${id}'`);
      const call = html.slice(start, html.indexOf(']});', start));
      expect(call).toContain(`{ label: '${label}' }`);
    });
  }
  it('labels match the agreed list', () => {
    expect([...nav.NAV_MAIN, ...nav.NAV_GROUPS.flatMap(g => g.items)].map(i => i.label)).toEqual([
      'Pipeline', 'Portfolio', 'Planning', 'Master Data', 'Timesheets', 'User Admin', 'Team', 'Attribute Lists',
      'DB Reset', 'Terms & Conditions']);
  });
});

describe('no breadcrumb or in-page text keeps an old page name', () => {
  const files = [...readdirSync(process.cwd()).filter(f => /\.html$/.test(f) && f !== 'test-cases.html'),
    ...readdirSync(join(process.cwd(), 'js')).filter(f => /\.js$/.test(f)).map(f => 'js/' + f)];
  const OLD = [/label:\s*'Project Portfolio'/, /label:\s*'Resource Planning'/, /label:\s*'Configuration'/,
    /label:\s*'Administration'/, /label:\s*'Database Reset'/, /label:\s*'Project Reporting'/,
    /<title>PDash — (Project Reporting|Resource Planning|Configuration|Admin)<\/title>/];
  it('has no old crumb label or old <title> in any page or js file', () => {
    const hits = [];
    for (const f of files) for (const re of OLD) if (re.test(read(f))) hits.push(`${f}: ${re}`);
    expect(hits).toEqual([]);
  });
  it('timesheets.html refers to the Portfolio page by its new name', () => {
    expect(read('timesheets.html')).not.toContain('in Project Reporting');
    expect(read('timesheets.html')).not.toContain('in the Project Reporting view');
  });
});
