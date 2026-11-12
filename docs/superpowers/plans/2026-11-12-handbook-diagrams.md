# Handbook architecture diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `handbook/restricted/ARCHITECTURE.md` gets Mermaid diagrams (context, seven auth sequences, one ER per §5 area, stage → status), drawn by `help.html` and checked by name against the code.

**Architecture:** A pure module `scripts/lib/mermaid-facts.mjs` extracts names from Mermaid blocks and turns them into a list of problems given the live facts; `scripts/architecture-guard.test.js` feeds it the migrations, the routes and `getStatusRule()` and expects no problem. The viewer keeps diagrams at natural width and lets them scroll.

**Tech Stack:** Markdown + Mermaid 11.4.1 (CDN), vitest + jsdom, plain CSS.

**Spec:** `docs/superpowers/specs/2026-11-12-handbook-diagrams-design.md`
**Branch:** `handbook-diagrams`
**Risk class:** standard — touches `scripts/` and a `js/lib/` module; no migration, auth, money, shared multi-page file or destructive operation.

## Global Constraints

- Every Edit/Write uses the absolute path of the worktree `C:\Users\Fabrizio.Fortini\Progetti\burndown\.claude\worktrees\handbook-diagrams\…`, never the main checkout.
- Mermaid blocks: no YAML front matter, no `%%{init}%%`, no `flowchart-elk` (B-452, B-462 stay open), default theme.
- ER entity names are the exact lowercase table names; no columns in any `erDiagram`.
- Every API call written in a diagram is `METHOD /api/...` with METHOD uppercase.
- Flowcharts use only `-->` arrows, optionally labelled `-->|text|`; no `&`.
- All prose in English; CLAUDE.md "Writing documentation" rules (no counts in prose).
- During tasks run only the touched test files (`npx vitest run <file>`); `npm test` runs in `/finish-cycle`.
- Tasks are **sequential**, not independent: Task 4 needs Task 1 and Tasks 2-3.

## Review Focus

1. An entity written `Users` or `"users"` instead of `users` — reported as unknown, not silently matched (test in Task 1).
2. An API call with a query string or trailing punctuation (`GET /api/auth/me?x=1`, `POST /api/auth/login)`) — normalised to the route, not reported (tests in Task 1).
3. A flowchart chain `a --> b --> c` — two edges; a line using `&` — reported as unsupported, never silently skipped (tests in Task 1).
4. A table present only in a diagram and missing from §5's `sql` blocks — the existing presence check still fails (Task 4, step 3).
5. A diagram wider than a 390px viewport — scrolls at natural size instead of shrinking (Task 5, verified in Task 6).

---

### Task 1: `mermaid-facts.mjs` — extractors and `diagramProblems`

**Files:**
- Modify: `js/lib/handbook.js:43` (export `fenceBlocks`), `help.html:156` (`handbook.js?v=4` → `?v=5`; grep the repo for every other `handbook.js?v=` and bump it too)
- Create: `scripts/lib/mermaid-facts.mjs`
- Test: `scripts/lib/mermaid-facts.test.js`

**Interfaces:**
- Consumes: `fenceBlocks(text) → [{ info, line /*1-based*/, lines: string[], closed }]` from `js/lib/handbook.js`.
- Produces:
  - `erEntities(body: string) → string[]` (unique, first-seen order)
  - `apiCalls(body: string) → { method: string, path: string }[]`
  - `flowEdges(body: string) → { edges: { from: string, to: string }[], unsupported: string[] }`
  - `withoutMermaid(text: string) → string` — same line count, every line of a `mermaid` block blanked
  - `diagramProblems(markdown: string, facts: { tables: Set<string>, endpoints: Set<string>, keyOf: (r) => string, stages: string[], statusRule: (stage) => { options: string[]|null, disabled: boolean } }) → string[]`

- [ ] **Step 1: Write the failing tests** in `scripts/lib/mermaid-facts.test.js` (vitest). One `it` each:
  - `erEntities('erDiagram\n  users ||--o{ trusted_devices : "has"')` → `['users','trusted_devices']`
  - isolated declaration `erDiagram\n  topics {\n  }` → `['topics']`; alias `pots["POT targets"] {` → `['pots']`
  - repeated entity across two relations counted once
  - `erEntities('erDiagram')` → `[]`
  - `erEntities('erDiagram\n  Users ||--o{ x : "a"')` → `['Users','x']` (kept verbatim, so `diagramProblems` reports it)
  - `apiCalls('A->>B: POST /api/auth/login')` → `[{ method:'POST', path:'/api/auth/login' }]`
  - path with `:id`, query string and trailing `)`/`,`/`;`: `GET /api/users/:id?x=1)` → path `/api/users/:id?x=1` (query kept; `keyOf` strips it)
  - lowercase `post /api/x` → `[]`; `Note: see /api/x` without method → `[]`
  - `flowEdges('flowchart LR\n  sip["SIP"] -->|label| dis["status disabled"]')` → `[{from:'SIP', to:'status disabled'}]`
  - node declared after its edge (`a --> b` then `b["Started"]`) → `to:'Started'`
  - chain `a --> b --> c` → two edges; `a --> b & c` → `unsupported` contains that line
  - `withoutMermaid` keeps line count and blanks only mermaid block lines (a `sql` block untouched)
  - `diagramProblems`, on small fixtures, reports exactly one problem each for: unknown ER entity; a table in `facts.tables` minus a dropped one (fixture passes `tables` without it); an unknown API call; a missing stage → status edge; an extra edge (stage → stage); a `### 4.x` heading with no `sequenceDiagram`; a `### 5.1`-`### 5.8` heading with no `erDiagram`; a `### 5.9` heading with no `flowchart`; a `flowEdges` `unsupported` line. A fixture with all of them correct → `[]`.

- [ ] **Step 2: Run** `npx vitest run scripts/lib/mermaid-facts.test.js` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `scripts/lib/mermaid-facts.mjs` and export `fenceBlocks` (no `window` bridge for it).
  - ER relation line: `/^\s*([A-Za-z_][\w-]*)\s+[|}o]{1,2}(?:--|\.\.)[|{o]{1,2}\s+([A-Za-z_][\w-]*)/`; declaration: `/^\s*([A-Za-z_][\w-]*)\s*(?:\[[^\]]*\])?\s*\{/`.
  - API call: `/\b(GET|POST|PATCH|PUT|DELETE)\s+(\/api\/[^\s,;)]*)/g`.
  - Flowchart: node labels from `id["Label"]` / `id(Label)` anywhere in the block; edges from `-->` / `-->|…|` split left to right; a label falls back to the id.
  - `diagramProblems`: attribute each mermaid block to the last `##`/`###` heading above `block.line`; required types: `### 4.` → `sequenceDiagram`, `### 5.[1-8] ` → `erDiagram`, `### 5.9 ` → `flowchart`. Entities of every `erDiagram` ∈ `facts.tables`; every `apiCalls` of every block → `facts.keyOf(call)` ∈ `facts.endpoints`; §5.9 edges as `from→to` strings equal exactly the expected set: for each stage, `disabled` → `stage→status disabled`, else one per option. Messages name the line and the offending name.

- [ ] **Step 4: Run** `npx vitest run scripts/lib/mermaid-facts.test.js js/lib/handbook.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(handbook): mermaid-facts module for diagram name checks`

### Task 2: §1 context, §5 ER diagrams, §5.9 stage → status

**Files:**
- Modify: `handbook/restricted/ARCHITECTURE.md` (§1, §5.1-§5.8 heads, new `### 5.9 Pipeline stage and project status` before `## 6.`)

**Interfaces:**
- Consumes: the checks of Task 1 (run them by hand with a scratch script or wait for Task 4).
- Produces: §1 `flowchart`, eight `erDiagram`, one §5.9 `flowchart` with nodes labelled exactly `SIP`, `Expected`, `Anticipated`, `Committed`, `Canceled`, the five status strings of `js/lib/status-rules.js`, and `status disabled`.

- [ ] **Step 1: §1 context flowchart** after the existing Overview text, nodes as spec §2: Browser; CDN (Vue, Bootstrap, Mermaid); `pdash-nginx`; `/auth-check` (→ `api/auth/me`, pages and `handbook/`), `/admin-check` (→ `api/auth/admin-check`, `handbook/restricted/`); `pdash-api`; `pdash-db` (PostgreSQL 16); SMTP; Anthropic API; `pdash-adminer` (dev tool) → `pdash-db`. Check each against `nginx.conf:18-40`, `docker-compose.yml`.
- [ ] **Step 2: one `erDiagram` at the head of each §5.x**, edges = these FKs (from `REFERENCES` in `api/src/db/migrations/*.sql`, at `4ae1553`; re-verify each with `grep -n "REFERENCES <table>"`). A table of another area appears as an entity.
  - 5.1 Auth: `users→users`, `rectification_requests→users`, `login_challenges→users`, `trusted_devices→users`, `app_settings→users`, `terms_versions→users`
  - 5.2 Configuration: `clients→client_groups`, `ratecards→clients`, `ratecard_entries→ratecards`, `ratecard_entries→roles`, `currency_rates→currencies`, `currency_rates→users`, `resources→roles`, `resources→users`, `resource_aliases→resources`, `resource_aliases→users`, `resource_project_contributions→resources`, `topics→topics`, `topics→users`, `description_topic_state→projects`, `description_topic_links→projects`, `description_topic_links→topics`, `attribute_list_items→attribute_lists`; entities without FK in the area still declared: `programs`, `profile_unmatched`, `profile_project_state`, `profile_job_runs`
  - 5.3 Cost Grid: `cost_grids→users`, `cost_grid_versions→cost_grids`, `cost_grid_versions→ratecards`, `cost_grid_versions→clients`, `cost_grid_versions→currencies`, `phases→cost_grid_versions`, `tasks→phases`, `task_roles→tasks`, `task_roles→roles`, `cg_version_projects→cost_grid_versions`, `cg_version_projects→projects`, `cost_grid_version_tags→cost_grid_versions`, `cost_grid_version_tags→attribute_list_items`
  - 5.4 Projects: `projects→clients`, `projects→programs`, `projects→cost_grid_versions`, `projects→currencies`, `projects→users`, `project_tasks→projects`, `project_tags→projects`, `project_tags→attribute_list_items`
  - 5.5 Client Groups and POT: `pots→client_groups`, `pots→clients`, `pot_history→pots`, `pot_history→users`; `pipeline_years` declared
  - 5.6 Sharing: `resource_shares→users`
  - 5.7 Notifications: `notifications→users`, `notifications→rectification_requests`
  - 5.8 Timesheets: `timesheets→users`
  Cardinality: child `}o--||` parent (`|o` when the FK column is nullable, per the `sql` block). Relation label: the FK column name.
- [ ] **Step 3: §5.9** — one line: stage on `cost_grid_versions.pipeline`, propagated to `projects.pipeline`; status on `projects.status`, allowed values per stage from `getStatusRule()` (`js/lib/status-rules.js`). Then a `flowchart LR` with no stage → stage edge and edges equal to `getStatusRule()`.
- [ ] **Step 4: Run** `npx vitest run scripts/handbook-guard.test.js scripts/architecture-guard.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `docs(architecture): context, ER and stage/status diagrams`

### Task 3: §4 auth flows as sequence diagrams

**Files:**
- Modify: `handbook/restricted/ARCHITECTURE.md` §4.1-§4.7

**Interfaces:**
- Consumes: routes in `api/src/routes/auth.js` (`/invite`, `/invite/:token`, `/activate`, `/login`, `/two-step/verify`, `/two-step/resend`, `DELETE /two-step`, `/forgot-password`, `/reset-password/:token`, `/reset-password`, `/change-password`, `/logout`, `/rectification-request`, `/accept-terms`, `/me`), `PATCH /api/users/:id`, `GET /api/app-settings/terms`.
- Produces: seven `sequenceDiagram` blocks.

- [ ] **Step 1:** for each §4.x replace the text block with 2-4 lines of prose (what the flow is for, who starts it) and a `sequenceDiagram`; participants among User/Admin, Browser, API, DB, Email. Keep every fact of the old text as a message or `Note` (401 generic, 429 `RATE_LIMITED`, 403 disabled, `pdash_device`/`pdash_challenge`, 48h/2h expiries, `alt` trusted device / email code, `{ twoStep: … }` answer). Verify each against the handler in `auth.js` before writing it; a fact the code contradicts is corrected, and noted in the commit message.
- [ ] **Step 2: Run** `npx vitest run scripts/handbook-guard.test.js scripts/architecture-guard.test.js` — Expected: PASS.
- [ ] **Step 3: Commit** — `docs(architecture): auth flows as sequence diagrams`

### Task 4: wire the guard

**Files:**
- Modify: `scripts/architecture-guard.test.js` (header limits, `s5` presence checks, new `describe`)

**Interfaces:**
- Consumes: `diagramProblems`, `withoutMermaid` (Task 1); local `codeEndpoints()`, `key`, `norm`; `getStatusRule` from `js/lib/status-rules.js`.

- [ ] **Step 1:** add `describe('ARCHITECTURE.md diagrams vs the code')` with one `it('names only live tables, routes and stage/status rules')`: `tables` = every `CREATE TABLE` name minus any later `DROP TABLE` name in migration order; `endpoints` = `new Set(codeEndpoints().map(key))` plus the three `builtInALoop` keys; `keyOf = key`; `stages = ['SIP','Expected','Anticipated','Committed','Canceled']`; expect `diagramProblems(markdown, facts)` toEqual `[]`.
- [ ] **Step 2:** the two `§5` presence `it`s test against `withoutMermaid(s5)`.
- [ ] **Step 3: Prove it** — temporarily delete one table's `sql` block from §5 while its name stays in the ER diagram, run the guard, see "mentions every table" FAIL, revert. Temporarily rename one ER entity, see the new `it` FAIL, revert. Record both outputs in the task's commit message.
- [ ] **Step 4:** header "WHAT IS DELIBERATELY NOT CHECKED": add that ER relationships, message order, prose and the §1 context diagram are not checked; name `scripts/lib/mermaid-facts.mjs`.
- [ ] **Step 5: Run** `npx vitest run scripts/architecture-guard.test.js scripts/lib/mermaid-facts.test.js` — Expected: PASS.
- [ ] **Step 6: Commit** — `test(architecture-guard): check names in ARCHITECTURE.md diagrams`

### Task 5: viewer — natural width and horizontal scroll

**Files:**
- Modify: `help.html:190` (`mermaid.initialize`), `help.html:11` (`help.css?v=1` → `?v=2`, every other reference too), `css/help.css:89`, `docs/pages/help.md`

- [ ] **Step 1:** `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false }, er: { useMaxWidth: false } })`.
- [ ] **Step 2:** `css/help.css`: `.hb-body pre.mermaid svg { max-width: none; }` after the `pre.mermaid` rule.
- [ ] **Step 3:** `docs/pages/help.md`: diagrams keep natural width and scroll horizontally (`useMaxWidth: false`).
- [ ] **Step 4: Run** `npx vitest run js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js scripts/handbook-guard.test.js scripts/nginx-serve.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(help): Mermaid diagrams scroll at natural width`

### Task 6: rendering verification (coordinator, branch stack)

**Files:** none committed; PNGs under the scratchpad.

- [ ] **Step 1:** `scripts/test-branch.sh up` from the worktree (copy `.env` first); check `scripts/test-branch.sh status` → `up`. If shoot reports `login needs a trusted device`, mint one with `docker exec <branch api container> node src/trust-device.js <SHOOT_EMAIL>` and pass `--device`.
- [ ] **Step 2: Measure** — `node scripts/shoot.mjs --base http://localhost:8081 --url "/help.html?doc=architecture" --widths 1440,390 --settle 4000 --eval-file <scratch>/count.js --out <scratch>/count`, where `count.js` sets `document.body.innerHTML` to a `<pre>` with `blocks` (mermaid code blocks in the source, expected 17), `svgs` (`document.querySelectorAll('pre.mermaid svg').length`), `errors` (`svg[aria-roledescription="error"]`) and, at 390, `scrollWidth > clientWidth` of the widest `pre.mermaid`. Read both PNGs. Expected: `svgs` = 17, `errors` = 0, at least one scrolling `pre.mermaid` at 390.
- [ ] **Step 3: Look** — `--full` capture at 1440 and 390 without `--eval`; read the PNGs; every diagram legible.
- [ ] **Step 4:** fix any syntax error in place (Task 2/3 files), re-run steps 2-3. Leave the branch stack up for Gate 2.

## Decisioni aperte

1. **`diagramProblems` lives in the module and takes the live facts as a parameter.** Alternativa scartata: the checks written inside `architecture-guard.test.js`. Perché: every failure case of acceptance criterion 3 becomes a unit test on a fixture instead of a manual mutation of the real document.
2. **Entity names must match table names verbatim (lowercase).** Alternativa scartata: case-insensitive matching. Perché: a diagram that writes `Users` is not naming the table, and a lenient match hides it.
3. **Flowchart parsing supports `-->`/`-->|…|` and chains, and reports `&` as unsupported.** Alternativa scartata: a fuller Mermaid flowchart parser. Perché: the §5.9 diagram needs only these, and a silently skipped line would pass the edge check.
4. **ER edges come from `REFERENCES` in the migrations, cardinality from nullability in §5.** Alternativa scartata: hand-picked "principal" relations. Perché: a mechanical source the plan can list and the reviewer can re-run.
5. **Task 6 is run by the coordinator, Gate 2's user check stays.** Alternativa scartata: user-only verification. Perché: the spec decided an automated shoot run; §6.6.3 assigns it to whoever has the tool.
