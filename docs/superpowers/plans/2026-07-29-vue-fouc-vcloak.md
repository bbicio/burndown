# Fix Repo-Wide FOUC via `v-cloak` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the brief flash of raw, uncompiled Vue template markup that occurs on every page load/reload, across all 13 Vue-mounted pages in the repo, via Vue's standard `v-cloak` pattern.

**Architecture:** One new CSS rule added once to the shared `css/tokens.css` (loaded by every Vue page), plus one `v-cloak` HTML attribute added to each page's actual Vue root mount element. No JS logic changes anywhere. All 13 pages' `css/tokens.css` cache-bust query string moves to a shared new version number so browsers pick up the new rule.

**Tech Stack:** Plain CSS, Vue 3's built-in `v-cloak` directive (CDN, no build step) — no new dependency.

## Global Constraints

- No build step, bundler, or new tooling introduced (Brief, Constraints).
- Do not touch any other CSS in `tokens.css` beyond the one new rule (Brief, Constraints).
- Do not change any page's Vue logic, data, computed properties, or template structure beyond adding the single `v-cloak` attribute to its root mount element (Brief, Constraints).
- `index.html` (the 9-line redirect) is out of scope — not a Vue page (Brief, Constraints).
- **Critical distinction confirmed during plan-writing**: `costgrid.html` and `planning.html` each contain a *second*, unrelated, already-hidden (`style="display:none"`) placeholder `<div>` sharing an ID with another page's real root element (`costgrid.html:416` has a dead `#pipelineBoardSection` stub; `planning.html:173-174` has dead `#pipelineBoardSection`/`#costGridEditorSection` stubs). These are **not** Vue roots and must **not** receive `v-cloak` — only the one real, actually-mounted root element per page (identified exactly, by line, in Task 1 below) gets the attribute.

---

### Task 1: Add the CSS rule, add `v-cloak` to all 13 real roots, bump all cache-bust versions

This is a single task — all three changes must land together for the fix to have any effect (the CSS rule alone does nothing without the attribute; the attribute alone would make the page permanently invisible without the CSS rule), so there's no meaningful boundary to split at.

**Files:**
- Modify: `css/tokens.css` (add one rule at the end)
- Modify: `_db-reset.html:8` (cache-bust), `:38` (root)
- Modify: `activate.html:8` (cache-bust), `:40` (root)
- Modify: `admin.html:8` (cache-bust), `:59` (root)
- Modify: `config.html:8` (cache-bust), `:62` (root)
- Modify: `costgrid.html:9` (cache-bust), `:17` (root)
- Modify: `login.html:8` (cache-bust), `:41` (root)
- Modify: `pipeline.html:9` (cache-bust), `:18` (root)
- Modify: `planning.html:9` (cache-bust), `:17` (root)
- Modify: `portfolio.html:10` (cache-bust), `:23` (root)
- Modify: `project-config.html:9` (cache-bust), `:16` (root)
- Modify: `reset-password.html:8` (cache-bust), `:39` (root)
- Modify: `terms.html:8` (cache-bust), `:59` (root)
- Modify: `timesheets.html:8` (cache-bust), `:41` (root)

**Interfaces:** None — this is the only task in this plan.

- [ ] **Step 1: Add the `[v-cloak]` rule to `css/tokens.css`**

Append this to the end of the file (after the existing closing `}` of the `:root` block — the file ends with a `/* ── Z-index ── */` section and a closing `}`; add the new rule as its own block immediately after that closing brace):

```css
[v-cloak] {
  display: none;
}
```

- [ ] **Step 2: Bump the cache-bust version on all 13 pages**

Every page below has a line of the exact form `<link rel="stylesheet" href="css/tokens.css?v=N">` (indentation varies slightly per page — some have 2 leading spaces, some none — preserve each page's own existing indentation, only change the `v=N` number). Change every one of them to `?v=7`:

- `_db-reset.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=6">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `activate.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `admin.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `config.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `costgrid.html:9`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `login.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `pipeline.html:9`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `planning.html:9`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `portfolio.html:10`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `project-config.html:9`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `reset-password.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `terms.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`
- `timesheets.html:8`: currently `  <link rel="stylesheet" href="css/tokens.css?v=5">` → `  <link rel="stylesheet" href="css/tokens.css?v=7">`

Run this to confirm the change landed everywhere and no `?v=5` or `?v=6` reference to `tokens.css` remains:

```bash
grep -n 'css/tokens.css?v=' *.html
```

Expected: all 13 lines show `?v=7`.

- [ ] **Step 3: Add `v-cloak` to each page's real root element**

For the 10 pages whose root is `<div id="app">` (or `<div id="app" class="app-container">`), add ` v-cloak` right after the `id="app"` attribute, preserving each page's own existing indentation and any `class` attribute exactly as it is today:

- `_db-reset.html:38`: currently `<div id="app">` → `<div id="app" v-cloak>`
- `activate.html:40`: currently `  <div id="app">` → `  <div id="app" v-cloak>`
- `admin.html:59`: currently `  <div id="app">` → `  <div id="app" v-cloak>`
- `config.html:62`: currently `<div id="app">` → `<div id="app" v-cloak>`
- `login.html:41`: currently `  <div id="app">` → `  <div id="app" v-cloak>`
- `portfolio.html:23`: currently `<div id="app" class="app-container">` → `<div id="app" v-cloak class="app-container">`
- `project-config.html:16`: currently `<div id="app" class="app-container">` → `<div id="app" v-cloak class="app-container">`
- `reset-password.html:39`: currently `  <div id="app">` → `  <div id="app" v-cloak>`
- `terms.html:59`: currently `  <div id="app">` → `  <div id="app" v-cloak>`
- `timesheets.html:41`: currently `<div id="app">` → `<div id="app" v-cloak>`

For the 3 pages with custom root IDs, add ` v-cloak` to the exact line shown — **do not** touch any other element sharing part of the same ID name on the same page (see the Global Constraints note above about dead placeholder stubs):

- `costgrid.html:17`: currently `<div id="costGridEditorSection" class="app-container">` → `<div id="costGridEditorSection" v-cloak class="app-container">`. Do **not** touch `costgrid.html:416` (`<div id="pipelineBoardSection" style="display:none"></div>`) — that is a dead, already-hidden, unrelated placeholder, not this page's Vue root.
- `pipeline.html:18`: currently `<div id="pipelineBoardSection" style="height:calc(100vh - 206px);display:flex;flex-direction:column;overflow:hidden;position:relative">` → `<div id="pipelineBoardSection" v-cloak style="height:calc(100vh - 206px);display:flex;flex-direction:column;overflow:hidden;position:relative">`.
- `planning.html:17`: currently `<div id="planningApp">` → `<div id="planningApp" v-cloak>`. Do **not** touch `planning.html:173` (`<div id="pipelineBoardSection"  style="display:none"></div>`) or `planning.html:174` (`<div id="costGridEditorSection" style="display:none"></div>`) — both are dead, already-hidden, unrelated placeholders, not this page's Vue root.

Run this to double-check exactly 13 `v-cloak` attributes were added, in total, across the whole repo:

```bash
grep -c 'v-cloak' *.html | grep -v ':0'
```

Expected: 13 files listed, each with count `1` (except possibly a file that already had an unrelated `v-cloak` mention — there should be none, since the Brief confirmed zero prior occurrences repo-wide).

- [ ] **Step 4: Run the test suite**

```bash
npm test
```

Expected: same pass count as before this task (136 tests — no existing test covers markup/CSS rendering, so no pass-count change is expected).

- [ ] **Step 5: Manual verification**

With the app running (`docker compose up`), open browser devtools, enable network throttling (e.g. "Slow 3G" or similar, to widen the window where a flash would be visible), and reload each of these pages in turn: `admin.html` (representative simple `#app` page), `costgrid.html`, `pipeline.html`, `planning.html` (the three custom-root-ID pages). Expected: no flash of raw/uncompiled markup (no visible `{{ }}` text, no simultaneously-visible conditional branches) before each page's normal loading state (spinner or content) appears.

Then, specifically on `costgrid.html`: publish a Draft version to SIP (triggering `cgPublishDraft()`'s `window.location.reload()`) and confirm the previously-reported flash no longer occurs on that reload.

- [ ] **Step 6: Commit**

```bash
git add css/tokens.css _db-reset.html activate.html admin.html config.html costgrid.html login.html pipeline.html planning.html portfolio.html project-config.html reset-password.html terms.html timesheets.html
git commit -m "fix: eliminate repo-wide FOUC via v-cloak on all 13 Vue pages"
```
