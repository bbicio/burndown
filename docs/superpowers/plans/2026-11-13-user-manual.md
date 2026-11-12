# User Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `handbook/public/manual.md` becomes the complete English user manual, migrated from `docs/OPERATIONAL_MANUAL.html` and rechecked against the PRD and the pages; the HTML is retired and the skill and `/sync-docs` follow the Markdown.

**Architecture:** One Markdown file written chapter by chapter, each chapter a small migrate-and-verify loop (extract the old chapter, read the PRD area file and the page, write, check every UI label against the page's own strings). Then the HTML and its references are removed, and the process files that named it are retargeted. No code changes; `help.html`, the guards and nginx stay as they are.

**Tech Stack:** Markdown (rendered by `marked@15` in `help.html`), vitest guards, Node one-off scripts kept in the scratchpad.

**Spec:** `docs/superpowers/specs/2026-11-13-user-manual-design.md`
**Branch:** `user-manual`
**Risk class:** standard — no `high-risk` category applies (no migration, auth, money, shared loaded file or destructive script); not `low-risk` because it edits process files (`.claude/skills/`, `docs/superpowers/PROCESS.md`)

**Task independence:** Tasks 1-6 write different chapters of the same file, so they run in order, not in parallel. Task 7 and Task 8 are independent of each other but come after the chapters; Task 9 is last.

## Global Constraints

- All text in the manual is English (`CLAUDE.md`, "Language constraint"). Admin-only features carry "(admin)" in their heading.
- No images (`.png`, `![`), no `<img`, no in-page links to a heading (`](#`): `marked@15` generates no heading ids.
- A point's depth goes in a raw `<details>` block in exactly this shape, blank lines included, so `marked` renders the Markdown inside:

  ```
  <details>
  <summary>Details</summary>

  Markdown text, lists and tables.

  </details>
  ```
- A claim in the manual is true of the app today. When the old HTML and the PRD disagree, the PRD area file wins, and where the PRD is unclear the page (`<page>.html`, `docs/pages/<page>.md`) decides. Nothing is written that none of them supports.
- Chapter headings, in this order: `## Getting started`, `## Pipeline and offers`, `## Resource planning`, `## Project reporting`, `## Project configuration`, `## Timesheet upload`, `## Master data (admin)`, `## Team and attribute lists (admin)`, `## User administration (admin)`, `## Account, privacy and sharing`.
- Removed for good: the chapters Settings, AI Sidebar, Changelog; any mention of an "AI Chat" button, of a settings modal, of backup, restore or export UI that no longer exists.
- No edit under `docs/superpowers/specs/` or `docs/superpowers/plans/`; no change to `help.html`, `js/lib/handbook.js`, `scripts/handbook-guard.test.js`, `nginx.conf`.
- Edit repo files with Edit/Write, never PowerShell `Set-Content` (BOM). Do not write backslashes through `node -e` or shell quoting: put scripts in files.
- The Backlog is not edited here: `/finish-cycle` Gate 5 step 2b closes B-361.

## Review Focus

1. A button, menu entry or column named in the manual that the page no longer has (the old HTML predates the redesign): every quoted or bold UI label is searched in the page and in `js/*.js`.
2. An admin-only function described as if every user had it, or an admin chapter that does not say who can use it: each such heading carries "(admin)" and the first sentence names the role.
3. A table cell with an unescaped `|` or a `<details>` without the blank line after `<summary>` (it renders as plain text): checked by command and by looking at the page.
4. A stale fact carried over from the old HTML (the manual was last regenerated before the Team assistant, My profile, the two-step sign-in, the split Master Data pages): each chapter is read against its PRD file before it is kept.
5. A page with no chapter or a chapter with no page: the map of the spec §2.2 against the Pages table of `CLAUDE.md`.

---

## Chapter procedure (Tasks 1-6)

Each chapter task runs these steps; the task lists only what differs.

1. **Extract the old chapter.** `node <scratchpad>/extract-chapter.mjs <chapter-id>` (created in Task 1) prints the chapter of the old HTML as plain Markdown-like text.
2. **Read the sources named in the task:** the PRD area file(s), the page(s), `docs/pages/<page>.md`. List, in a scratch note, what is wrong, missing or gone in the old text.
3. **Write the chapter** into `handbook/public/manual.md` under its exact heading, in the place the Global Constraints order gives (insert immediately before `## Account, privacy and sharing`, except where the task says otherwise). A short description per point, `<details>` for depth, tables for controls and columns.
4. **Check the labels.** `node <scratchpad>/check-labels.mjs <files…>` lists every `**bold**` or `"quoted"` phrase of the manual that appears in none of the given files; for each one, either fix the phrase to the page's own wording or confirm it is not a UI label. Expected: no unexplained miss.
5. **Check the rules.** `grep -n -i "AI Sidebar\|AI Chat\|settings modal\|](#\|!\[\|<img\|\.png" handbook/public/manual.md` prints nothing; every `<summary>` line is followed by an empty line: `grep -n -A1 "<summary>" handbook/public/manual.md | grep -v "summary\|^--$\|-$" ` prints nothing.
6. **Guards.** `npx vitest run scripts/handbook-guard.test.js scripts/doc-paths-guard.test.js` passes.
7. **Commit** `docs(manual): <chapter names>`.

---

### Task 1: Skeleton, helper scripts, Getting started, Account chapter

**Files:**
- Modify: `handbook/public/manual.md` (replace the placeholder)
- Create (scratchpad, not committed): `extract-chapter.mjs`, `check-labels.mjs`

**Interfaces — Produces:** the file skeleton every later task inserts into: the title `# User manual`, the introduction, `## Getting started` and, last, `## Account, privacy and sharing`; the two helper scripts.

- [ ] **Step 1: Create `extract-chapter.mjs`.** Usage `node extract-chapter.mjs <id>` run from the repo root. It reads `docs/OPERATIONAL_MANUAL.html`, drops the base64 images, takes the `<section class="chapter" id="<id>">…</section>` block and prints it as text: `chapter-head` h2 as `## `, each `.item .lead` as `### `, `.body` as a paragraph, `<tr>` as a `| cell | cell |` row, `<details>` as `<details>`/`<summary>` lines, `.callout` as a `>` quote, list items as `- `, tags otherwise stripped, HTML entities decoded. Exit 1 with the list of ids when the id is unknown. Run it on `getting-started` and read the output: it is the self-test.
- [ ] **Step 2: Create `check-labels.mjs`.** Usage `node check-labels.mjs <file…>` from the repo root. It reads `handbook/public/manual.md`, collects every `**…**` and `"…"` phrase of 3 to 60 characters, and prints each phrase found in none of the given files (case-sensitive, emoji included). Self-test: run it against `help.html` on a text with one phrase from `help.html` and one invented phrase; only the invented one is printed.
- [ ] **Step 3: Write the skeleton and the Getting started chapter.** Title `# User manual`, then two or three sentences: what PDash is, that the manual follows the menu, that "(admin)" marks what only admins use. Then `## Getting started`: signing in with the email and password, the six-digit email code and the trusted device, accepting the terms the first time, the sidebar and what each entry opens, the notification bell, the account menu entries (read them in `js/nav.js`), the activation and password-reset links received by email, where Help is. Sources: `PRD.md` §1-§3, `docs/prd/access.md`, `js/nav.js`, `login.html`, `terms.html`, `activate.html`, `reset-password.html`, `help.html`; old chapters `getting-started`, `navigation`, `auth`. Drop everything about the old Settings entry.
- [ ] **Step 4: Write `## Account, privacy and sharing`** (last chapter): My profile (details, password change, two-step verification, trusted devices, privacy and data requests), the Privacy Notice, GDPR rights as the PRD states them, sharing a proposal or a project and the permission levels, the notification panel and what triggers a notification, sending a notification to another user. Sources: `docs/prd/access.md`, `docs/prd/notifications.md`, `profile.html`, `privacy-notice.html`, `js/shares.js`, `js/notifications.js`; old chapters `gdpr`, `sharing`, `notifications`.
- [ ] **Step 5:** run steps 4-6 of the chapter procedure with `node check-labels.mjs js/nav.js login.html terms.html profile.html privacy-notice.html help.html js/shares.js js/notifications.js js/core.js`. Expected: guards pass; the rules grep is empty.
- [ ] **Step 6: Commit** `docs(manual): skeleton, getting started and account chapters`.

### Task 2: Pipeline and offers

**Files:** Modify `handbook/public/manual.md`.

- [ ] Follow the chapter procedure for `## Pipeline and offers`. Old chapter id: `pipeline`. Sources: `docs/prd/pipeline.md`, `pipeline.html`, `costgrid.html`, `docs/pages/pipeline.md`, `docs/pages/costgrid.md`. It covers the stages, the board and the list, the offer cards and the detail panel, filtering, the toolbar, POT progress, the year selector, the offer editor (cost grid: phases, tasks, roles, rates, currency, tags, versions) and generating a project from an offer. Label check files: `pipeline.html costgrid.html js/costgrid.js js/core.js`.
- [ ] Commit `docs(manual): pipeline and offers`.

### Task 3: Resource planning and the Team assistant

**Files:** Modify `handbook/public/manual.md`.

- [ ] Follow the chapter procedure for `## Resource planning`. Old chapter id: `planning`. Sources: `docs/prd/planning.md`, `docs/prd/notifications.md` (the Team assistant), `planning.html`, `docs/pages/planning.md`. It covers what a row means in each of the three views, the columns, the Gantt view, the filters and how they collapse on narrower screens, Export XLS, and the **Team assistant** (what it ranks and who can open it), which replaces the old "AI Sidebar" chapter. Label check files: `planning.html js/lib/planning-rows.js js/core.js`.
- [ ] Commit `docs(manual): resource planning and the team assistant`.

### Task 4: Project reporting and project configuration

**Files:** Modify `handbook/public/manual.md`.

- [ ] Follow the chapter procedure for `## Project reporting` and `## Project configuration`, in that order. Old chapter ids: `reporting` and `configuration`. Sources: `docs/prd/reporting.md`, `docs/prd/project-config.md`, `portfolio.html`, `program.html`, `project-config.html`, `docs/pages/portfolio.md`, `docs/pages/program.md`, `docs/pages/project-config.md`. Reporting covers the portfolio overview (card and list), the single-project view, the burndown and its figures, the Program Dashboard and how to reach it; configuration covers the project form (tasks, phasing, planning, groups, viewer mode) and the rule that a project is created from an offer. Label check files: `portfolio.html program.html project-config.html js/portfolio.js js/core.js`.
- [ ] Commit `docs(manual): project reporting and configuration`.

### Task 5: Timesheet upload and master data

**Files:** Modify `handbook/public/manual.md`.

- [ ] Follow the chapter procedure for `## Timesheet upload` and `## Master data (admin)`, in that order. Old chapter id: `timesheets`; master data is new text from the PRD (the old manual has no chapter for it). Sources: `docs/prd/timesheets.md`, `docs/prd/master-data.md`, `timesheets.html`, `master-clients.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html`, `docs/pages/timesheets.md`, `docs/pages/config.md`. Timesheets: the two entry points, the expected columns table, replace-not-append, the rate snapshot, role and task validation, the admin review. Master data: one section per page (clients and groups, pipelines and POT targets, roles and rates, currencies) and who can open it. Label check files: `timesheets.html master-clients.html master-pipelines.html master-roles.html master-currencies.html js/upload.js js/core.js`.
- [ ] Commit `docs(manual): timesheet upload and master data`.

### Task 6: Team, attribute lists and user administration

**Files:** Modify `handbook/public/manual.md`.

- [ ] Follow the chapter procedure for `## Team and attribute lists (admin)` and `## User administration (admin)`, in that order. Old chapter id: `admin` (users only); the team and attribute-list text is new, from the PRD. Sources: `docs/prd/administration.md`, `team.html`, `attribute-lists.html`, `admin.html`, `docs/pages/team.md`, `docs/pages/attribute-lists.md`, `docs/pages/admin.md`. Team: the resource registry, linking a resource to a user, the unmatched names drawer, the experience profile tab. Attribute lists: lists and items, and where the tags appear. Users: invite, role change, disable, anonymize, sysadmin rules. Name `profile-jobs.html` nowhere (hidden page). Label check files: `team.html attribute-lists.html admin.html js/tags.js js/core.js`.
- [ ] Commit `docs(manual): team, attribute lists and user administration`.

### Task 7: Retire the HTML

**Files:**
- Delete: `docs/OPERATIONAL_MANUAL.html`
- Modify: `scripts/classify-cycle.mjs` (header comment, line 23), `scripts/classify-cycle.test.js` (lines 124-128), `scripts/doc-paths-guard.test.js` (lines 56-58, only if the guard asks), `docs/handoff-ciclo4.md` (line 55, only if `doc-paths-guard` asks)

- [ ] **Step 1: Baseline.** `git grep -n OPERATIONAL_MANUAL -- ':!docs/superpowers'` lists the references to settle; keep the output.
- [ ] **Step 2: Remove the file and fix the references.** `git rm docs/OPERATIONAL_MANUAL.html`. In `scripts/classify-cycle.mjs` and its test, replace the example path with a neutral one that need not exist (`docs/anything.html`) and reword the comment to «an `.html` under `docs/`»; the assertion (`ordinary`) is unchanged. Run `npx vitest run scripts/classify-cycle.test.js scripts/doc-paths-guard.test.js`; where the guard names `docs/handoff-ciclo4.md` or its own list, change the citation as the message says (the guard's `GONE` allowlist is the fallback, not the first choice).
- [ ] **Step 3: Verify.** `git ls-files docs/OPERATIONAL_MANUAL.html` prints nothing; `git grep -l OPERATIONAL_MANUAL -- ':!docs/superpowers'` lists only files that do not cite it as an existing path (expected: the skills, retargeted in Task 8, and `docs/BACKLOG.md` rows); `npx vitest run scripts/` passes except for what Task 8 still has to settle (say so in the commit message if it fails on the skill files).
- [ ] **Step 4: Commit** `docs(manual): retire OPERATIONAL_MANUAL.html`.

### Task 8: Retarget the skill, `/sync-docs` and PROCESS.md

**Files:**
- Modify: `.claude/skills/operational-manual/SKILL.md`, `.claude/skills/sync-docs/SKILL.md`, `docs/superpowers/PROCESS.md` (the `operational-manual` bullet of §5)

- [ ] **Step 1: Baseline.** `git grep -n "5b\|detail-content\|OPERATIONAL_MANUAL\|screenshot" -- .claude docs/superpowers/PROCESS.md CLAUDE.md` lists everything to settle; keep it.
- [ ] **Step 2: `operational-manual` skill.** Output becomes `handbook/public/manual.md` (Markdown, English, the Global Constraints of this plan as its format rules: chapter headings, `<details>` shape, "(admin)" marker, no images, no in-page anchors). Delete the screenshot steps, the single-HTML requirements and the whole «PDash detail-content reference» section, with the sentence that points to it; the content source is stated as `PRD.md`, `docs/prd/` and the code, verified label by label against the pages. Keep the skill's own rules that still hold (only live features, English, concise points). Its «When to regenerate» section says: on request, and by `/sync-docs` §5c when user-visible behaviour changed.
- [ ] **Step 3: `/sync-docs`.** Remove §5b entirely and every sentence elsewhere in the file that points to it; rewrite the «User manual» bullet of §5c: when the cycle changes behaviour visible to the user, update the matching chapter of `handbook/public/manual.md` following the `operational-manual` skill; drop «active from handbook cycle 2». Renumber nothing: the headings §5c and §6 stay as they are; the gap at 5b is written as «5b — removed 2026-11-13» in one line if another file cites it.
- [ ] **Step 4: `PROCESS.md` §5.** Rewrite the `operational-manual` bullet: it produces `handbook/public/manual.md`, on explicit request or through `/sync-docs` §5c; it no longer carries a content reference that `/sync-docs` reconciles.
- [ ] **Step 5: Verify.** `git grep -n "detail-content\|5b\b" -- .claude docs/superpowers/PROCESS.md CLAUDE.md` prints nothing that still points to the removed section; `git grep -n "OPERATIONAL_MANUAL" -- .claude docs/superpowers/PROCESS.md CLAUDE.md` prints nothing; `npx vitest run scripts/` passes (the `claude-md-guard` and `doc-paths-guard` check the pointers).
- [ ] **Step 6: Commit** `docs(process): operational-manual and sync-docs follow the markdown manual`.

### Task 9: Whole-manual verification

**Files:** Modify `handbook/public/manual.md` only if a check fails.

- [ ] **Step 1: Structure.** `grep -n "^## " handbook/public/manual.md` lists exactly the ten headings of the Global Constraints, in order; `grep -c "will be moved here" handbook/public/manual.md` prints 0; each page of the spec §2.2 map is named in its chapter (`grep -c -F "<page>.html"` is not required: the chapter names the page by its menu label — read the chapter and confirm).
- [ ] **Step 2: Rules.** The grep of chapter-procedure step 5 prints nothing; `grep -c "\.png" handbook/public/manual.md` prints 0; `grep -n -i "settings" handbook/public/manual.md` prints nothing or only lines that name a real current setting, each checked against the PRD.
- [ ] **Step 3: Render.** Start the app on a branch stack is the user's Gate 2; here, render the file locally to catch broken tables and `<details>`: save a one-off HTML page in the scratchpad that loads `marked@15.0.12` from the CDN and renders `handbook/public/manual.md`, screenshot it with Chrome headless at 1280 and 820 px (see `docs/superpowers/PROCESS.md` §6.3, headless Chrome works), read the PNGs and confirm that tables are tables and each `<details>` opens.
- [ ] **Step 4: Guards and suite.** `npx vitest run scripts/` then `npm test`; both pass.
- [ ] **Step 5: Commit** any fix as `docs(manual): final checks`; with no fix, no commit.

---

## Decisioni aperte

1. **Un capitolo, o due strettamente legati, per task, nell'ordine della mappa e non in parallelo.** Alternativa scartata: un subagente per capitolo in parallelo. Perché: tutti scrivono lo stesso file e inserire in parallelo produce conflitti di merge senza guadagno.
2. **Controllo meccanico delle etichette con uno script usa-e-getta nello scratchpad.** Alternativa scartata: un test permanente in `scripts/`. Perché: il Brief e la spec escludono modifiche ai guard, e l'etichetta può legittimamente non essere un'etichetta dell'interfaccia.
3. **Render di prova in Chrome headless dentro il piano (Task 9), oltre alla lettura dell'utente al Gate 2.** Alternativa scartata: solo la verifica dell'utente. Perché: tabelle rotte e `<details>` senza riga vuota si vedono subito e costano un minuto.
4. **B-361 non si modifica nel piano.** Alternativa scartata: chiuderlo nel Task 7. Perché: `/finish-cycle` Gate 5 step 2b scrive le righe chiuse con il comando di verifica.
5. **La numerazione di `/sync-docs` non cambia dopo la rimozione di §5b.** Alternativa scartata: rinumerare §5c e §6. Perché: altri documenti citano quei numeri e la regola di stabilità del file lo sconsiglia.
