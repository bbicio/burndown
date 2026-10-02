# Navigation Cycle B1 — Page Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Closing the branch is `/finish-cycle`, never `superpowers:finishing-a-development-branch` (CLAUDE.md process override). **No task in this plan runs `docker compose` against the main stack.**

**Goal:** Wrap navigation, breadcrumb and content of the 14 authenticated pages in a common shell (`#app-shell > #nav-container + #app-main`) with an inert sidebar-state `<head>` script, with no visible change.

**Architecture:** A hand-written wrapper sits outside every Vue mount point; `nav.js` inserts the breadcrumb bar as the first child of `#app-main`; `#app-main` carries `margin-left: var(--sidebar-w)` with `--sidebar-w: 0px`. An identical inline `<head>` snippet reads `localStorage['PDash_sidebarCollapsed']` and sets `data-sidebar="collapsed"` on `<html>`. A vitest guard test pins the structure of all 14 pages.

**Tech Stack:** static HTML + Vue 3 CDN pages (no build), classic scripts, vitest + jsdom (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-02-navigation-b1-page-shell-design.md` (Brief: `docs/superpowers/briefs/2026-10-02-navigation-b1-page-shell-brief.md`).

## Global Constraints

- No visible change on any page, for any role (user, admin, sysadmin).
- The 14 pages: `pipeline`, `portfolio`, `planning`, `costgrid`, `project-config`, `team`, `config`, `timesheets`, `admin`, `attribute-lists`, `profile-jobs`, `settings`, `_db-reset`, `_terms-editor` (each `<name>.html` at repo root).
- Wrapper outside every Vue root; roots, `v-cloak` and inner markup unchanged; all `<script>` tags stay outside the shell.
- `#app-shell` / `#app-main`: no `overflow`, `transform`, `filter`, `contain`, `will-change`, `position`.
- localStorage key `PDash_sidebarCollapsed`, value `'1'` = collapsed; attribute `data-sidebar="collapsed"` on `<html>`; snippet identical in all 14 `<head>`s, inline, wrapped in try/catch.
- `PDash_sidebarCollapsed` must be in `core.js`'s `keep` Set.
- Cache-busting: bump `css/style.css?v=15`→`16`, `js/core.js?v=10`→`11`, `js/nav.js?v=11`→`12` on every page that references them (all 14 today); no other file references change.
- Footer, `.pb-board-root`, `costgrid.html:213`, sidebar, icons, names: untouched (B2).
- All user-facing text in English. No bundler, no new dependency.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `localStorage` blocked or `getItem` throwing → snippet must not throw or change anything (Task 2 test).
2. Stored value other than `'1'` (`'true'`, `''`, garbage) → no attribute set (Task 2 test).
3. `updateBreadcrumbs` called twice, or on a page with no `#app-main` → exactly one bar, no crash (Task 1 tests).
4. A script left inside the shell (`admin.html`, `team.html`, `attribute-lists.html` indent their scripts) or unbalanced `<div>`s → guard fails (Task 3 test).
5. Wrapper given `overflow`/`transform`/etc., or the new key wiped by `cleanLegacyStorage()` on the next page → guard fails / survival test (Tasks 1 and 3).

---

### Task 0: Workspace and baseline (before any change)

**Files:**
- Create (not committed): `<scratchpad>/b1-baseline.json`

- [ ] **Step 1: Make the spec and plan visible to the worktree**

`EnterWorktree` bases on `origin/main` and the spec (`9a65ab7`) and this plan are committed only locally. Ask the user to confirm pushing `main` (`git push origin main`), then push. Do not push any other way.

- [ ] **Step 2: Create the worktree**

Use `EnterWorktree` with name `navigation-b1-page-shell` (skill `superpowers:using-git-worktrees`). Verify `git log --oneline -3` shows the spec commit.

- [ ] **Step 3: Capture the baseline on the unchanged pages**

With the main stack already running at `http://localhost` (read-only use; do not run any docker command), open each of pipeline, portfolio, planning, costgrid (open a proposal), project-config (open a project), team, config as **user**, then **admin**, then **sysadmin**, and paste this in the console. Save the output of every run in `<scratchpad>/b1-baseline.json`.

```js
(() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect();
    return [Math.round(b.top + scrollY), Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
  const roots = ['pipelineBoardSection','planningApp','costGridEditorSection','app'];
  const out = { page: location.pathname, vw: innerWidth,
    nav: r(document.getElementById('nav-container')),
    crumb: r(document.getElementById('breadcrumb-bar')),
    root: r(roots.map(id => document.getElementById(id)).find(Boolean)),
    bodyH: document.body.scrollHeight };
  const fixed = [...document.querySelectorAll('body *')].filter(e => ['fixed','sticky'].includes(getComputedStyle(e).position))
    .map(e => (e.id || e.className.toString().slice(0, 30) || e.tagName) + ':' + getComputedStyle(e).position + ':' + r(e));
  out.fixed = fixed;
  copy(JSON.stringify(out)); return out;
})()
```

Also note by eye: an open Bootstrap modal (e.g. Change password) and an open dropdown (account menu) on each page.

---

### Task 1: nav.js breadcrumb placement, `--sidebar-w` rule, `keep` key

**Files:**
- Create: `js/lib/nav-shell.test.js`
- Modify: `js/nav.js:135-147` (`window.updateBreadcrumbs`)
- Modify: `css/style.css:18-19`
- Modify: `js/core.js:5`

**Interfaces:**
- Produces: DOM contract `#app-main` first child = `#breadcrumb-bar` (created by `window.updateBreadcrumbs(items)`); CSS custom property `--sidebar-w`; `keep` Set contains `'PDash_sidebarCollapsed'`.

- [ ] **Step 1: Write the failing tests**

Create `js/lib/nav-shell.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');
const { initNav } = new Function(read('js/nav.js') + '\nreturn { initNav };')();

const SHELL = '<div id="app-shell"><div id="nav-container"></div><div id="app-main"><div id="app">content</div></div></div>';

beforeEach(() => {
  document.body.className = '';
  document.body.innerHTML = SHELL;
  globalThis.esc = s => String(s);
  globalThis.Api = { auth: { me: async () => ({
    role: 'user', email: 'u@x.it', firstName: 'U', lastName: 'X', terms_version: 1, current_terms_version: 1 }) } };
});

describe('breadcrumb bar placement (js/nav.js)', () => {
  it('is created as the first child of #app-main, before the page content', async () => {
    await initNav('pipeline', { breadcrumbs: [{ label: 'A', href: '/a' }, { label: 'B' }] });
    const main = document.getElementById('app-main');
    expect(main.firstElementChild.id).toBe('breadcrumb-bar');
    expect(main.children[1].id).toBe('app');
    expect(document.getElementById('nav-container').nextElementSibling.id).toBe('app-main');
    expect(document.body.classList.contains('has-breadcrumbs')).toBe(true);
  });

  it('is updated in place by a second call (exactly one bar)', async () => {
    await initNav('pipeline', { breadcrumbs: [{ label: 'A' }] });
    window.updateBreadcrumbs([{ label: 'C' }]);
    const bars = document.querySelectorAll('#breadcrumb-bar');
    expect(bars.length).toBe(1);
    expect(bars[0].textContent).toBe('C');
  });

  it('falls back to the old position (right after #nav-container) on a page without #app-main', async () => {
    document.body.innerHTML = '<div id="nav-container"></div><div id="app"></div>';
    await initNav('pipeline', { breadcrumbs: [{ label: 'A' }] });
    expect(document.getElementById('nav-container').nextElementSibling.id).toBe('breadcrumb-bar');
  });
});

describe('sidebar state key survives cleanLegacyStorage (js/core.js)', () => {
  const core = read('js/core.js');
  const iife = core.slice(0, core.indexOf('// ── STATE'));

  it('lists PDash_sidebarCollapsed in the keep Set', () => {
    expect(iife).toMatch(/new Set\(\[[^\]]*'PDash_sidebarCollapsed'[^\]]*\]\)/);
  });

  it('keeps the key and still removes unknown PDash_* keys', () => {
    localStorage.clear();
    localStorage.setItem('PDash_sidebarCollapsed', '1');
    localStorage.setItem('PDash_stray', 'x');
    new Function(iife)();
    expect(localStorage.getItem('PDash_sidebarCollapsed')).toBe('1');
    expect(localStorage.getItem('PDash_stray')).toBeNull();
  });
});

describe('--sidebar-w rule (css/style.css)', () => {
  const css = read('css/style.css');
  it('defines --sidebar-w as 0px and offsets #app-main by it', () => {
    expect(css).toMatch(/:root\s*\{\s*--sidebar-w:\s*0px;\s*\}/);
    expect(css).toMatch(/#app-main\s*\{\s*margin-left:\s*var\(--sidebar-w\);\s*\}/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run js/lib/nav-shell.test.js`
Expected: FAIL (breadcrumb is still inserted after `#nav-container`; key not in Set; no CSS rule). If `initNav` throws on something other than the breadcrumb (it only needs `Api.auth.me`, `esc`, `document`), stub that global in `beforeEach` and re-run.

- [ ] **Step 3: Implement**

`js/nav.js`, replace the insertion lines inside `window.updateBreadcrumbs` (current lines 142-144):

```js
      const main = document.getElementById('app-main');
      if (main) {
        main.insertBefore(bar, main.firstChild);
      } else {
        const navCont = document.getElementById('nav-container');
        navCont.parentNode.insertBefore(bar, navCont.nextSibling);
      }
      document.body.classList.add('has-breadcrumbs');
```

`css/style.css`, directly after line 19 (`body.has-breadcrumbs { --breadcrumb-h: 33px; }`):

```css
:root { --sidebar-w: 0px; }
#app-main { margin-left: var(--sidebar-w); }
```

`js/core.js:5`:

```js
  const keep = new Set(['PDash_summary', 'PDash_browserNotifDisabled', 'PDash_sidebarCollapsed']);
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run js/lib/nav-shell.test.js` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/nav-shell.test.js js/nav.js css/style.css js/core.js
git commit -m "feat(nav): breadcrumb inside #app-main, --sidebar-w offset rule, keep sidebar-state key

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Head snippet — canonical text and behavior tests

**Files:**
- Create: `js/lib/nav-shell-guard.test.js` (snippet part now; page structure part in Task 3)

**Interfaces:**
- Produces: exported-by-convention constant `SNIPPET` (string, the exact `<script>…</script>` line) used by Task 3's page rewrite and guard.

- [ ] **Step 1: Write the failing test**

Create `js/lib/nav-shell-guard.test.js`:

```js
import { describe, it, expect, afterEach, vi } from 'vitest';

export const SNIPPET =
  "<script>try{if(localStorage.getItem('PDash_sidebarCollapsed')==='1')document.documentElement.setAttribute('data-sidebar','collapsed')}catch(e){}</script>";

const code = SNIPPET.replace(/^<script>/, '').replace(/<\/script>$/, '');
const run = () => new Function(code)();

afterEach(() => {
  document.documentElement.removeAttribute('data-sidebar');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('sidebar-state head snippet', () => {
  it("sets data-sidebar=collapsed when the key is '1'", () => {
    localStorage.setItem('PDash_sidebarCollapsed', '1');
    run();
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('collapsed');
  });

  it('sets nothing when the key is absent', () => {
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it.each(['0', 'true', '', ' 1', 'collapsed'])("sets nothing for the value %j", v => {
    localStorage.setItem('PDash_sidebarCollapsed', v);
    run();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });

  it('does not throw and sets nothing when localStorage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false);
  });
});
```

Note: a vitest test file may export a constant; Task 3 will import `SNIPPET` from here.

- [ ] **Step 2: Run to verify** — `npx vitest run js/lib/nav-shell-guard.test.js`. These tests exercise the snippet itself, so they pass immediately; if any fails, fix the `SNIPPET` string (not the test).

- [ ] **Step 3: Commit**

```bash
git add js/lib/nav-shell-guard.test.js
git commit -m "test(nav): canonical sidebar-state head snippet and its failure modes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wrap the 14 pages and pin them with a guard

**Files:**
- Modify: the 14 pages listed in Global Constraints (`<name>.html`)
- Modify: `js/lib/nav-shell-guard.test.js` (add page + CSS guards)
- Create (not committed): `<scratchpad>/wrap-pages.cjs`

**Interfaces:**
- Consumes: `SNIPPET` from Task 2.
- Produces: in every page: SNIPPET as the line right after `<head>`; `<div id="app-shell">` immediately before `<div id="nav-container"></div>`; `<div id="app-main">` immediately after it; `</div><!-- /#app-main -->` and `</div><!-- /#app-shell -->` immediately before the first `<script` (or the `<!-- ── SCRIPTS ── -->` comment right above it) that follows the nav container.

- [ ] **Step 1: Write the failing guard tests**

Append to `js/lib/nav-shell-guard.test.js` (add the imports `readFileSync` from `node:fs` and `join` from `node:path` at the top of the file):

```js
const PAGES = ['pipeline','portfolio','planning','costgrid','project-config','team','config',
  'timesheets','admin','attribute-lists','profile-jobs','settings','_db-reset','_terms-editor'];
const readPage = n => readFileSync(join(process.cwd(), n + '.html'), 'utf8');
const OPEN = '<div id="app-shell">';
const CLOSE = '<!-- /#app-shell -->';

describe.each(PAGES)('page shell: %s.html', name => {
  const html = readPage(name);

  it('has the sidebar-state snippet once, inside <head>', () => {
    expect(html.split(SNIPPET).length - 1).toBe(1);
    expect(html.indexOf(SNIPPET)).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf(SNIPPET)).toBeGreaterThan(html.indexOf('<head>'));
  });

  it('has #app-shell > #nav-container + #app-main in that order', () => {
    expect(html).toMatch(/<div id="app-shell">\s*<div id="nav-container"><\/div>\s*<div id="app-main">/);
  });

  it('closes the shell before the first script and keeps its divs balanced', () => {
    const start = html.indexOf(OPEN);
    const end = html.indexOf(CLOSE);
    expect(end).toBeGreaterThan(start);
    expect(html.slice(start, end)).not.toMatch(/<script/i);
    expect(html.slice(end)).toMatch(/<script/i);
    const inner = html.slice(start, end);
    expect((inner.match(/<div[\s>]/g) || []).length).toBe((inner.match(/<\/div>/g) || []).length);
  });
});

describe('shell containers carry no layout-breaking CSS (css/style.css)', () => {
  const css = readFileSync(join(process.cwd(), 'css/style.css'), 'utf8');
  const blocks = [...css.matchAll(/(^|\})\s*([^{}]*#app-(?:shell|main)[^{}]*)\{([^}]*)\}/g)].map(m => m[3]);
  it('has a rule for #app-main', () => expect(blocks.length).toBeGreaterThan(0));
  it('uses none of overflow/transform/filter/contain/will-change/position on them', () => {
    for (const b of blocks) expect(b).not.toMatch(/\b(overflow|transform|filter|contain|will-change|position)\s*:/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run js/lib/nav-shell-guard.test.js`
Expected: FAIL for every page (no snippet / no shell); the CSS tests PASS.

- [ ] **Step 3: Write and run the one-off rewrite script**

Create `<scratchpad>/wrap-pages.cjs` and run `node <scratchpad>/wrap-pages.cjs` from the repo root (worktree):

```js
const fs = require('fs');
const SNIPPET = "<script>try{if(localStorage.getItem('PDash_sidebarCollapsed')==='1')document.documentElement.setAttribute('data-sidebar','collapsed')}catch(e){}</script>";
const PAGES = ['pipeline','portfolio','planning','costgrid','project-config','team','config',
  'timesheets','admin','attribute-lists','profile-jobs','settings','_db-reset','_terms-editor'];
const NAV = '<div id="nav-container"></div>';
for (const n of PAGES) {
  const f = n + '.html';
  const raw = fs.readFileSync(f, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  if (raw.includes('id="app-shell"')) throw new Error(f + ': already wrapped');
  const L = raw.split(/\r?\n/);
  const h = L.findIndex(l => /^\s*<head>\s*$/.test(l));
  const nv = L.findIndex(l => l.includes(NAV));
  if (h < 0 || nv < 0) throw new Error(f + ': head/nav not found');
  let s = -1;
  for (let i = nv + 1; i < L.length; i++) if (/<script/i.test(L[i])) { s = i; break; }
  if (s < 0) throw new Error(f + ': no script after nav');
  let j = s - 1;
  while (j > nv && L[j].trim() === '') j--;
  if (/<!--\s*──\s*SCRIPTS\s*──\s*-->/.test(L[j])) s = j;
  // edit from the bottom up so indexes stay valid
  L.splice(s, 0, '</div><!-- /#app-main -->', '</div><!-- /#app-shell -->', '');
  L.splice(nv + 1, 0, '<div id="app-main">');
  L.splice(nv, 0, '<div id="app-shell">');
  L.splice(h + 1, 0, SNIPPET);
  fs.writeFileSync(f, L.join(eol));
  console.log('wrapped', f, '(script boundary at original line', s + 1 + ')');
}
```

- [ ] **Step 4: Inspect the diffs**

Run `git diff --stat` (expect exactly the 14 pages, each +6 lines, 0 deletions) and `git diff pipeline.html admin.html team.html portfolio.html` to check by eye: snippet right after `<head>`; shell open around `#nav-container`; closes sit before the SCRIPTS comment / first script; scripts outside; page-specific markup between nav and root (portfolio/planning hidden inputs) is inside `#app-main`. If any page deviates, fix it by hand before the test.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run js/lib/nav-shell-guard.test.js` — Expected: all PASS (14 pages × 3 + CSS + snippet tests). If the div-balance check fails on a page, the naive count may be thrown by `<div` inside a JS string/comment within the content block: inspect that page; if it is a genuine imbalance, fix the page; if it is a false positive from non-markup text, narrow the count in the test to HTML outside `<script>` and `<!-- -->`, and say so in the commit message.

- [ ] **Step 6: Commit**

```bash
git add *.html js/lib/nav-shell-guard.test.js
git commit -m "feat(nav): page shell (#app-shell/#app-main) and sidebar-state head snippet on the 14 authenticated pages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cache-busting bump

**Files:**
- Modify: every `*.html` referencing `css/style.css?v=15`, `js/core.js?v=10`, `js/nav.js?v=11`
- Modify: `js/lib/nav-shell-guard.test.js` (nav.js agreement test)

- [ ] **Step 1: Write the failing test**

Append to `js/lib/nav-shell-guard.test.js`:

```js
describe('?v= references of the files edited in B1', () => {
  const all = readdirSync(process.cwd()).filter(f => /^[^/]+\.html$/.test(f));
  for (const file of ['css/style.css', 'js/core.js', 'js/nav.js']) {
    it(`${file} is referenced with one version on every page`, () => {
      const re = new RegExp(file.replace(/[./]/g, '\\$&') + '\\?v=(\\d+)', 'g');
      const versions = new Set();
      for (const p of all) for (const m of readFileSync(join(process.cwd(), p), 'utf8').matchAll(re)) versions.add(m[1]);
      expect([...versions]).toHaveLength(1);
    });
  }
  it('uses the bumped versions', () => {
    const p = readFileSync(join(process.cwd(), 'pipeline.html'), 'utf8');
    expect(p).toContain('css/style.css?v=16');
    expect(p).toContain('js/core.js?v=11');
    expect(p).toContain('js/nav.js?v=12');
  });
});
```

(Change the first import line of the file to also import `readdirSync` from `node:fs`.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run js/lib/nav-shell-guard.test.js`; Expected: "uses the bumped versions" FAILS.

- [ ] **Step 3: Bump everywhere**

```bash
grep -l "css/style.css?v=15\|js/core.js?v=10\|js/nav.js?v=11" *.html | xargs sed -i 's#css/style\.css?v=15#css/style.css?v=16#g; s#js/core\.js?v=10#js/core.js?v=11#g; s#js/nav\.js?v=11#js/nav.js?v=12#g'
grep -ohE "(css/style\.css|js/core\.js|js/nav\.js)\?v=[0-9]+" *.html | sort | uniq -c
```

Expected: `14 css/style.css?v=16`, `14 js/core.js?v=11`, `14 js/nav.js?v=12`, nothing else. Also grep the rest of the repo (`grep -rn "style.css?v=15\|core.js?v=10\|nav.js?v=11" --include=*.js --include=*.html .` excluding `node_modules`/`docs`) and bump any non-doc reference found; doc references are handled by `/sync-docs`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test` — Expected: all PASS, including `foundations-guard.test.js` (style/core agreement) and `tokens.test.js`.

- [ ] **Step 5: Commit**

```bash
git add -A -- '*.html' js/lib/nav-shell-guard.test.js
git commit -m "chore(nav): bump style.css v16, core.js v11, nav.js v12 on every page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Manual verification (acceptance 1, 3, 5)

**Files:** none changed unless a regression is found (then fix, re-run `npm test`, commit).

- [ ] **Step 1: Serve the branch in isolation**

Run `scripts/test-branch.sh up` from the worktree (isolated stack, separate ports; this is the project's sanctioned way; it does not touch the main stack). Copy the gitignored `.env` from the main checkout first if missing (never commit it). Hard-reload each page (the `.html` files are not versioned).

- [ ] **Step 2: Compare against the baseline**

On the same pages and roles as Task 0, run the same console snippet and diff against `b1-baseline.json`. Expected: `nav`, `crumb`, `root`, `bodyH` and every `fixed` entry identical (same numbers), same set of fixed/sticky elements. The only difference allowed is the extra `#app-shell`/`#app-main` DOM (not measured). Also confirm by eye on each page: an open modal (Change password) and the account dropdown look and position as before; the team detail panel, Team assistant panel (planning, admin/sysadmin), project-config viewer banner and the costgrid selection bar still stick/fix correctly.

- [ ] **Step 3: Sidebar-state key**

In the console: `localStorage.setItem('PDash_sidebarCollapsed','1')`, navigate to another page, confirm `document.documentElement.dataset.sidebar === 'collapsed'` and `localStorage.getItem('PDash_sidebarCollapsed') === '1'` (survived `cleanLegacyStorage`), and nothing looks different. Then `localStorage.removeItem(...)`. With site data blocked (Chrome setting) confirm pages load with no console errors from the snippet.

- [ ] **Step 4: Report**

Write the outcome (pages × roles checked, any measured difference) into the cycle report at `/finish-cycle`. If a difference appears, stop and fix before continuing; do not proceed to merge on a "close enough".

- [ ] **Step 5: Hand off**

Run `/finish-cycle` (the terminal step: test gate, code review, `--no-ff` merge, push, worktree cleanup). Tear down the branch environment only after the user's own "yes" at its Gate 2. Documentation (`CLAUDE.md` file-structure/Routing notes, `docs/js/nav.md`, memory `project_ui_redesign_cycles`) is updated by `/sync-docs` as part of `/finish-cycle`.
