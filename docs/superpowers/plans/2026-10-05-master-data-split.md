# Master Data split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `config.html` into five working Master Data pages (Clients, Client Groups, Pipelines & POTs, Roles & rates, Currencies) linked by a second lateral menu, and drop Programs from the Config UI.

**Architecture:** A one-off Node generator (`split-config.mjs`, verified against the current `config.html`) cuts the file into five Vue 3 CDN pages, each keeping only its own panel, data, computed and methods, so moved code is byte-identical to the original. A hand-written `<nav class="md-subnav">` (same markup in every page) is styled by new rules in `css/style.css`. `config.html` becomes a tiny redirect to the Clients page. Vitest guard tests pin structure, names, versions and per-page data access.

**Tech Stack:** Vue 3 (CDN, no build step), Bootstrap 5.3.2, vitest + jsdom (`npm test`), Node 24 for the generator.

**Spec:** `docs/superpowers/specs/2026-10-05-master-data-split-design.md`

**Process note:** execute in a worktree (`superpowers:using-git-worktrees` / `EnterWorktree`); the terminal step is `/finish-cycle` (it runs the test gate, code review, merge, `/sync-docs` and the manual verification on an isolated Docker stack). Never run `docker compose` against the main stack from this plan.

## Global Constraints

- No bundler, no build step for the runtime; every page is a Vue 3 CDN page with `v-cloak` on its root mount element.
- All user-facing text in **English**.
- Page shell on every authenticated page: `<div id="app-shell"><div id="nav-container"></div><div id="app-main">…</div></div>`, scripts after the shell, the `PDash_sidebarCollapsed` head snippet unchanged; `#app-shell`/`#app-main` get no `overflow`, `transform`, `filter`, `contain`, `will-change` or `position`.
- Cache-busting: any change to `css/style.css` or `js/nav.js` bumps their `?v=N` in **every** HTML page that references them (`css/style.css?v=20` → `21`, `js/nav.js?v=16` → `17`), all to the same N.
- Never edit HTML with PowerShell `Get-Content`/`Set-Content` (adds a BOM). Use the Edit/Write tools or `sed -i` in Git Bash; the generated pages inherit `config.html`'s CRLF line endings, which is fine (git normalises).
- Menu entry = `<title>` = breadcrumb: all five pages use `initNav('config', …)`, `<title>PDash — Master Data</title>` and breadcrumb Home > Master Data.
- Access: admin or sysadmin only, same access-denied block as today. No API change.
- Programs stays untouched everywhere else (DB, `/programs*` API, `js/programs.js`, `Api.programs`, portfolio, costgrid, project-config).
- No shared helper, no refactor, no redesign: duplication across the five pages is accepted (a UI redesign follows in the next days).

## Review Focus

- A rate-card modal on the Clients page keeps working: `#clientRcModal` and `window.__cfgApp` must exist there (`saveClientRatecard` is called from an inline `onclick`). Pinned in Task 2's guard test.
- The Pipelines page keeps the POT details modal (`#potDetailsModal`) and loads clients + groups for the POT target pickers. Pinned in Task 2.
- The Roles page must still receive the currency list (its per-currency rate fields filter `currencies` on `active`); an earlier draft of the generator dropped that assignment. Pinned in Task 2.
- The Currencies page keeps both modals (`#crHistoryModal`, `#crRateConfirmModal`) and builds `crEdit` from the loaded list. Pinned in Task 2.
- An old bookmark of `/config.html` must land on the Clients page, with no shell or Vue running. Pinned in Task 3.
- A non-admin opening any new page sees "Admin access required." while the sub-menu stays visible (it lives outside the Vue root); accepted, covered by the manual pass.

---

### Task 1: Sub-menu styles and the `style.css` version bump

**Files:**
- Modify: `css/style.css` (append a block after the existing breadcrumb rules, line ~40)
- Modify: every `*.html` that contains `css/style.css?v=20` (14 pages: `_db-reset`, `_terms-editor`, `admin`, `attribute-lists`, `config`, `costgrid`, `pipeline`, `planning`, `portfolio`, `profile-jobs`, `project-config`, `settings`, `team`, `timesheets`)
- Modify: `js/lib/nav-shell-guard.test.js` (the "uses the bumped versions" test)
- Create: `js/lib/master-data-guard.test.js` (CSS part only in this task)

**Interfaces:**
- Produces: CSS classes `.md-layout`, `.md-subnav` (with `a`, `a.active`), `.md-content`, used by the markup the generator emits in Task 2.

- [ ] **Step 1: Write the failing tests**

In `js/lib/nav-shell-guard.test.js` change the expectation `expect(p).toContain('css/style.css?v=20');` to `expect(p).toContain('css/style.css?v=21');`.

Create `js/lib/master-data-guard.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = f => readFileSync(join(process.cwd(), f), 'utf8');

describe('Master Data sub-menu styles (css/style.css)', () => {
  const css = read('css/style.css');
  it('defines the layout, the menu and the content wrapper', () => {
    expect(css).toMatch(/\.md-layout\s*\{/);
    expect(css).toMatch(/\.md-subnav\s*\{/);
    expect(css).toMatch(/\.md-subnav a\.active\s*\{/);
    expect(css).toMatch(/\.md-content\s*\{/);
  });
  it('is a column beside the sidebar from 1024px up and a row below', () => {
    const wide = css.slice(css.indexOf('/* ── Master Data sub-navigation'));
    expect(wide).toMatch(/@media \(min-width: 1024px\)\s*\{[\s\S]*\.md-subnav[\s\S]*flex-direction:\s*column/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- js/lib/master-data-guard.test.js js/lib/nav-shell-guard.test.js`
Expected: FAIL (no `.md-layout` rule; pipeline.html still has `style.css?v=20`).

- [ ] **Step 3: Add the CSS**

In `css/style.css`, directly after the `.breadcrumb-bar .breadcrumb-item + .breadcrumb-item::before { … }` rule, add:

```css
/* ── Master Data sub-navigation (2026-10, config.html split) ──
   Row of links above the content on small screens, a column beside the
   main sidebar from 1024px up. The markup is hand-written in each page. */
.md-layout { display: block; }
.md-subnav {
  display: flex; gap: var(--space-1); overflow-x: auto;
  padding: var(--space-2) var(--space-6);
  background: var(--surface-white); border-bottom: 1px solid var(--border-light);
}
.md-subnav a {
  white-space: nowrap; padding: .4rem .8rem; border-radius: 6px;
  font-size: var(--text-sm); font-weight: 600;
  color: var(--text-muted); text-decoration: none;
}
.md-subnav a:hover { color: var(--brand-navy); background: var(--surface-subtle); }
.md-subnav a.active { color: var(--brand-magenta); background: var(--brand-magenta-tint); }
.md-content { min-width: 0; }
@media (min-width: 1024px) {
  .md-layout { display: flex; align-items: flex-start; }
  .md-subnav {
    flex: 0 0 200px; flex-direction: column; overflow: visible;
    position: sticky; top: 0; align-self: stretch;
    padding: var(--space-4) .75rem;
    border-bottom: 0; border-right: 1px solid var(--border-light);
  }
  .md-content { flex: 1 1 0; }
}
```

(`--space-1`, `--space-2`, `--space-4`, `--space-6`, `--brand-magenta-tint`, `--surface-subtle`, `--border-light`, `--text-muted`, `--text-sm` all exist in `css/tokens.css`.)

- [ ] **Step 4: Bump `style.css` to v21 everywhere**

Run (Git Bash, repo root):

```bash
sed -i 's#css/style.css?v=20#css/style.css?v=21#g' *.html
grep -L "css/style.css?v=21" $(grep -l "css/style.css" *.html)   # must print nothing
grep -l "css/style.css?v=20" *.html                               # must print nothing
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS (whole suite; the `?v=` agreement guards see one version).

- [ ] **Step 6: Commit**

```bash
git add css/style.css js/lib/nav-shell-guard.test.js js/lib/master-data-guard.test.js *.html
git commit -m "feat(master-data): sub-menu styles; bump style.css to v21

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Generate the five pages and pin them with tests

**Files:**
- Create: `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` (generated)
- Use (already committed with this plan): `docs/superpowers/plans/2026-10-05-master-data-split/split-config.mjs`, `docs/superpowers/plans/2026-10-05-master-data-split/check-split.mjs`
- Modify: `js/lib/master-data-guard.test.js` (add the page tests)
- Modify: `js/lib/page-names.test.js` (`PAGES` map)
- Modify: `js/lib/nav-shell-guard.test.js` (`PAGES` list)

**Interfaces:**
- Consumes: `.md-layout`/`.md-subnav`/`.md-content` from Task 1; `config.html` still in its original form (the generator reads it).
- Produces: five pages at `/master-clients.html`, `/master-client-groups.html`, `/master-pipelines.html`, `/master-roles.html`, `/master-currencies.html`, each calling `initNav('config', …)`; `window.__cfgApp` is the Vue app name on every page.

The generator: reads `config.html` (not modified), writes the five pages into the current directory, keeping the original line endings. Per page it keeps only that page's panel, `data()` keys, computed, methods, a page-specific `loadAll()` and `created()` (the `Api.currencies.active()` / `window.__currencies` preload only on Pipelines and Currencies). It never copies the Programs tab, state or methods. `check-split.mjs` verifies syntax of each Vue script, balanced divs inside the shell, that every `this.x`/template identifier that `config.html` defines is also defined on the page, that no Programs/`activeTab` text remains, and the sub-menu/title/`initNav` markers.

- [ ] **Step 1: Write the failing tests**

Replace the `PAGES` map in `js/lib/page-names.test.js` with (the `config.html` key goes away, the five pages map to the same nav id):

```js
const PAGES = {
  'pipeline.html': 'pipeline', 'portfolio.html': 'portfolio', 'planning.html': 'planning',
  'master-clients.html': 'config', 'master-client-groups.html': 'config', 'master-pipelines.html': 'config',
  'master-roles.html': 'config', 'master-currencies.html': 'config',
  'timesheets.html': 'timesheets', 'admin.html': 'admin', 'team.html': 'team',
  'attribute-lists.html': 'attributelists', '_db-reset.html': 'dbreset', '_terms-editor.html': 'termseditor',
};
```

In `js/lib/nav-shell-guard.test.js` replace `'config'` in the `PAGES` array with the five names `'master-clients','master-client-groups','master-pipelines','master-roles','master-currencies'` (the array stays names without `.html`).

Append to `js/lib/master-data-guard.test.js`:

```js
const PAGES = [
  { file: 'master-clients.html',       href: '/master-clients.html',
    api: ['clients', 'ratecards', 'roles'],
    must: ['id="clientRcModal"', 'window.__cfgApp'] },
  { file: 'master-client-groups.html', href: '/master-client-groups.html',
    api: ['clientGroups', 'clients'],
    must: ['this.clients  = clients;', 'this.groups   = groups.map('] },
  { file: 'master-pipelines.html',     href: '/master-pipelines.html',
    api: ['clientGroups', 'clients', 'currencies', 'pipelineYears', 'pots', 'reporting'],
    must: ['id="potDetailsModal"', 'this.yearTotals    = yearTotals;'] },
  { file: 'master-roles.html',         href: '/master-roles.html',
    api: ['currencies', 'roles'],
    must: ['this.currencies    = currencies;', 'groupedRoles'] },
  { file: 'master-currencies.html',    href: '/master-currencies.html',
    api: ['currencies'],
    must: ['id="crHistoryModal"', 'id="crRateConfirmModal"', 'this.crEdit'] },
];
const LINKS = PAGES.map(p => p.href);

describe.each(PAGES)('Master Data page: $file', ({ file, href, api, must }) => {
  const html = read(file);

  it('has the same five sub-menu links in order, only its own marked active', () => {
    const nav = html.match(/<nav class="md-subnav"[\s\S]*?<\/nav>/)[0];
    expect([...nav.matchAll(/href="([^"]+)"/g)].map(m => m[1])).toEqual(LINKS);
    expect([...nav.matchAll(/<a href="([^"]+)"[^>]*aria-current="page"/g)].map(m => m[1])).toEqual([href]);
  });

  it('wraps the Vue root in .md-layout > .md-content inside #app-main', () => {
    expect(html).toMatch(/<div id="app-main">\s*<div class="md-layout">\s*<nav class="md-subnav"/);
    expect(html).toMatch(/<div class="md-content">\s*<div id="app" v-cloak>/);
  });

  it('is a Master Data page for the nav (id config, title, breadcrumb)', () => {
    expect(html).toContain('<title>PDash — Master Data</title>');
    expect(html).toContain("initNav('config'");
    expect(html).toContain("{ label: 'Master Data' }");
  });

  it('keeps the admin-or-sysadmin check and the access-denied block', () => {
    expect(html).toContain("['admin', 'sysadmin'].includes(user.role)");
    expect(html).toContain('Admin access required.');
  });

  it('has no Programs UI/API and no leftover tab switching', () => {
    expect(html).not.toMatch(/program/i);
    expect(html).not.toContain('activeTab');
  });

  it('calls only the API namespaces of its own panel', () => {
    const used = new Set([...html.matchAll(/Api\.([A-Za-z]+)\./g)].map(m => m[1]));
    for (const ns of used) expect(api, `unexpected Api.${ns}`).toContain(ns);
  });

  it('keeps the pieces its panel depends on', () => {
    for (const s of must) expect(html, s).toContain(s);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- js/lib/master-data-guard.test.js js/lib/page-names.test.js js/lib/nav-shell-guard.test.js`
Expected: FAIL (the five files do not exist yet: `ENOENT`).

- [ ] **Step 3: Generate and check the pages**

Run (repo root, Git Bash):

```bash
node docs/superpowers/plans/2026-10-05-master-data-split/split-config.mjs
node docs/superpowers/plans/2026-10-05-master-data-split/check-split.mjs
```

Expected: `written: master-clients.html, …` then `all checks passed`. If `check-split.mjs` reports a problem, **stop and report it** (do not hand-patch the generated pages): it means `config.html` differs from what the generator was verified against.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS (whole suite, including the new guard tests, the `PAGES` shell/page-name checks for the five pages, and the `?v=` agreement guards — the generated pages carry `style.css?v=21` and the other versions from `config.html`).

- [ ] **Step 5: Quick structural sanity check**

Run: `wc -l master-*.html` — expected five files between ~350 and ~1100 lines (Pipelines is the largest). Open one in an editor and confirm the file has no BOM: `head -c 3 master-clients.html | xxd` must start with `3c21 44` (`<!D`).

- [ ] **Step 6: Commit**

```bash
git add master-*.html js/lib/master-data-guard.test.js js/lib/page-names.test.js js/lib/nav-shell-guard.test.js
git commit -m "feat(master-data): split config.html into five Master Data pages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Redirect `config.html`, point the nav at the Clients page

**Files:**
- Modify (replace whole content): `config.html`
- Modify: `js/nav.js:17` (`href`), `?v=16` → `?v=17` in every HTML page
- Modify: `js/lib/nav-shell-guard.test.js` (versions test: `nav.js?v=17`)
- Modify: `js/lib/master-data-guard.test.js` (redirect + nav href tests)

**Interfaces:**
- Consumes: the five pages from Task 2.
- Produces: `/config.html` → `/master-clients.html`; Admin menu "Master Data" → `/master-clients.html`.

- [ ] **Step 1: Write the failing tests**

In `js/lib/nav-shell-guard.test.js` change `expect(p).toContain('js/nav.js?v=16');` to `expect(p).toContain('js/nav.js?v=17');`.

Append to `js/lib/master-data-guard.test.js`:

```js
describe('config.html is only a redirect to the Clients page', () => {
  const html = read('config.html');
  it('redirects (meta refresh + script) to /master-clients.html', () => {
    expect(html).toContain('http-equiv="refresh" content="0; url=/master-clients.html"');
    expect(html).toContain("location.replace('/master-clients.html')");
  });
  it('runs no Vue and has no shell', () => {
    expect(html).not.toMatch(/vue/i);
    expect(html).not.toContain('app-shell');
  });
});

describe('Admin menu entry', () => {
  it('Master Data leads to the Clients page', () => {
    const nav = new Function(read('js/nav.js') + '\nreturn { NAV_GROUPS };')();
    const item = nav.NAV_GROUPS.flatMap(g => g.items).find(i => i.id === 'config');
    expect(item.label).toBe('Master Data');
    expect(item.href).toBe('/master-clients.html');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- js/lib/master-data-guard.test.js js/lib/nav-shell-guard.test.js`
Expected: FAIL (`config.html` is still the old page; nav href is `/config.html`; `nav.js?v=16`).

- [ ] **Step 3: Replace `config.html`**

Overwrite `config.html` (Write tool) with exactly:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PDash — Master Data</title>
  <meta http-equiv="refresh" content="0; url=/master-clients.html">
  <script>location.replace('/master-clients.html');</script>
</head>
<body>
  <p><a href="/master-clients.html">Go to Master Data</a></p>
</body>
</html>
```

- [ ] **Step 4: Point the nav entry at the Clients page and bump `nav.js`**

In `js/nav.js` line 17 change `href: '/config.html'` to `href: '/master-clients.html'` (leave label, id and icon). Then:

```bash
sed -i 's#js/nav.js?v=16#js/nav.js?v=17#g' *.html
grep -l "js/nav.js?v=16" *.html            # must print nothing
grep -L "js/nav.js?v=17" $(grep -l "js/nav.js" *.html)   # must print nothing
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS (whole suite).

- [ ] **Step 6: Commit**

```bash
git add config.html js/nav.js js/lib/nav-shell-guard.test.js js/lib/master-data-guard.test.js *.html
git commit -m "feat(master-data): config.html redirects to the Clients page; nav points to it; bump nav.js to v17

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Manual test cases and handoff to `/finish-cycle`

**Files:**
- Modify: `test-cases.html` (rewrite `N-04`; add a Master Data block `MD-01`…`MD-07`)
- Modify: `TEST_CASES.md` only if it lists `config.html` access cases (`grep -n "config.html" TEST_CASES.md` first; update the same way)

**Interfaces:**
- Consumes: the final URLs from Tasks 2–3.

- [ ] **Step 1: Update `N-04` in `test-cases.html`**

Change its `scenario`/`steps` to refer to the new pages: scenario `Non-admin access to Master Data pages`; steps `Log in as a user with role=user; navigate directly to /master-clients.html (repeat for /master-client-groups.html, /master-pipelines.html, /master-roles.html, /master-currencies.html)`; expected `"Admin access required" message shown on each page — no panel content is accessible` (the sub-menu stays visible).

- [ ] **Step 2: Add the Master Data manual cases** next to the other config cases (same object style as the neighbouring entries, e.g. `CN-04`):

```js
    {id:'MD-01',scenario:'Master Data — open /config.html',
     steps:'As admin, open /config.html (e.g. an old bookmark)',
     expected:'Lands on /master-clients.html; the Admin group of the sidebar shows "Master Data" highlighted'},
    {id:'MD-02',scenario:'Master Data — sub-menu on all five pages',
     steps:'On each of the five pages look at the lateral menu next to the sidebar, then click each link',
     expected:'Five links (Clients, Client Groups, Pipelines & POTs, Roles & rates, Currencies) on every page, the current one highlighted; each link opens its page; no "Programs" entry anywhere'},
    {id:'MD-03',scenario:'Master Data — Clients and Client Groups',
     steps:'Create, rename and delete a client; open 💲 Costgrid on a client and save rates; on Client Groups create a group, assign and remove a client, delete the group',
     expected:'Every action behaves as on the old Config page'},
    {id:'MD-04',scenario:'Master Data — Pipelines & POTs',
     steps:'Create a pipeline year, open it, add/edit/delete a POT, open View Details, open the Phasing and Project Phasing views',
     expected:'Same behavior and totals as on the old Config page'},
    {id:'MD-05',scenario:'Master Data — Roles & rates',
     steps:'Create a role with a rate in each active currency, edit it, delete one that is unused and try to delete one assigned to a team resource',
     expected:'Rate fields appear for every active non-EUR currency; the blocked delete shows its error banner and scrolls to the top'},
    {id:'MD-06',scenario:'Master Data — Currencies',
     steps:'Activate a currency, change a rate (Cancel then Confirm in the confirmation modal), open a currency history',
     expected:'Same behavior as CN-03…CN-05'},
    {id:'MD-07',scenario:'Master Data — layouts',
     steps:'On each page check three layouts: sidebar open, sidebar collapsed to the rail, and a window narrower than 1024px',
     expected:'The lateral menu is a column beside the sidebar at ≥1024px (also with the rail), a scrollable row above the content below 1024px; no horizontal page scroll, no overlap with the sidebar or the breadcrumb'},
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add test-cases.html TEST_CASES.md
git commit -m "docs(tests): manual cases for the Master Data pages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off to `/finish-cycle`**

Do **not** merge or push by hand. Run `/finish-cycle`: it runs `npm test`, the isolated-stack manual verification (`MD-01`…`MD-07`, plus `N-04`), `/code-review`, the `--no-ff` merge, and `/sync-docs`. `/sync-docs` is where the narrative docs get updated: `docs/pages/config.md` (describe the five pages and the redirect), the CLAUDE.md pages table and file-structure entries, the `style.css?v=21` / `nav.js?v=17` mentions, and `ARCHITECTURE.md`'s `config.html` line. The generator and checker scripts in `docs/superpowers/plans/2026-10-05-master-data-split/` stay in the repo as the record of how the split was produced; they are not part of the runtime.
