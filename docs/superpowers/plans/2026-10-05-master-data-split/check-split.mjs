// Validates the generated master-*.html pages against config.html.
// Run from the repo root (or a dir holding config.html + master-*.html):  node check-split.mjs
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILES = ['master-clients.html', 'master-client-groups.html', 'master-pipelines.html', 'master-roles.html', 'master-currencies.html'];
const rd = f => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// Every member name that config.html defines (data keys, computed, methods).
function memberNames(html) {
  const names = new Set();
  const L = html.split('\n');
  const iData = L.findIndex(l => /^  data\(\) \{$/.test(l));
  const iComputed = L.findIndex(l => /^  computed: \{$/.test(l));
  const iCreated = L.findIndex(l => /^  async created\(\) \{$/.test(l));
  for (let i = iData; i < (iComputed < 0 ? iCreated : iComputed); i++) {
    const m = /^      ([A-Za-z_]\w*):/.exec(L[i]); if (m) names.add(m[1]);
  }
  for (let i = Math.max(iComputed, 0); i < L.length; i++) {
    const m = /^    (?:async )?([A-Za-z_]\w*)\(.*\) *\{ *$/.exec(L[i]); if (m) names.add(m[1]);
  }
  return names;
}
const ALL = memberNames(rd('config.html'));
let failures = 0;
const fail = (f, msg) => { failures++; console.log(`FAIL ${f}: ${msg}`); };

for (const f of FILES) {
  if (!existsSync(f)) { fail(f, 'missing'); continue; }
  const html = rd(f);
  const iModule = html.lastIndexOf('<script type="module">');
  const template = html.slice(0, iModule);
  const script = html.slice(iModule + '<script type="module">'.length, html.lastIndexOf('</script>'));

  // 1. the Vue script parses
  const tmp = f.replace('.html', '.check.mjs');
  writeFileSync(tmp, script);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { fail(f, 'script syntax: ' + String(e.stderr).split('\n').slice(0, 4).join(' | ')); }
  finally { unlinkSync(tmp); }

  // 2. divs balanced inside the shell
  const a = template.indexOf('<div id="app-shell">'), b = template.indexOf('<!-- /#app-shell -->');
  const inner = template.slice(a, b);
  const open = (inner.match(/<div[\s>]/g) || []).length, close = (inner.match(/<\/div>/g) || []).length;
  if (open !== close) fail(f, `divs unbalanced in shell: ${open} open / ${close} close`);

  // 3. members defined by the page
  const defined = memberNames(html);
  const refs = new Set();
  for (const m of script.matchAll(/this\.([A-Za-z_]\w*)/g)) refs.add(m[1]);
  const bodyTemplate = template.slice(template.indexOf('<div id="app"'));
  const exprs = [...bodyTemplate.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(m => m[1])
    .concat([...bodyTemplate.matchAll(/\s(?:v-[\w:.-]+|:[\w-]+|@[\w.-]+)="([^"]*)"/g)].map(m => m[1]));
  for (const e of exprs) for (const m of e.replace(/'[^']*'/g, '').matchAll(/(?<![.\w$])([A-Za-z_]\w*)/g)) refs.add(m[1]);
  for (const r of refs) if (ALL.has(r) && !defined.has(r)) fail(f, `uses "${r}" but the page does not define it`);

  // 4. things that must be gone / present
  for (const bad of ['activeTab', 'programs', 'Api.programs', 'sortedPrograms', 'saveProgram', 'deleteProgram', 'openProgramForm', 'pf:'])
    if (html.includes(bad)) fail(f, `still contains "${bad}"`);
  if (!/initNav\('config'/.test(html)) fail(f, "initNav('config') missing");
  if (!/<title>PDash — Master Data<\/title>/.test(html)) fail(f, 'title');
  if ((html.match(/class="active" aria-current="page"/g) || []).length !== 1) fail(f, 'sub-menu active marker count');
}
console.log(failures ? `${failures} problem(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
