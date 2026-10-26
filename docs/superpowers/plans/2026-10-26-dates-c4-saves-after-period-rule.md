# Dates C4 — saves and notices after the period rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a single Save that changes the period and the task dates together passes when the final state respects the C3 period rule, and every notice says exactly what was not saved.

**Architecture:** the period travels in the same request as the tasks (`PUT …/structure`, `PUT /api/projects/:id/tasks`), checked and written in one transaction; the `PATCH` drops the period whenever the tasks are sent. Notices are keyed by version + code + message and forgotten after a successful structure save or reload. Small client fixes for Generate, Add tasks and the monthly distribution.

**Tech Stack:** Node/Express + PostgreSQL (`api/`), classic scripts + ES modules in `js/`, Vue 3 pages, vitest + jsdom, `test-api.js`, `scripts/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-26-dates-c4-saves-after-period-rule-design.md`
**Branch:** `dates-c4-saves-period`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/api-sync.js`, `js/costgrid.js`) e regole server sulle scritture (§6.1b)

## Global Constraints

- All user-facing text in English; the exact strings are those of Spec §3.1, §3.2, §3.3, copied verbatim.
- Refusals are `400 { error, code: 'DATE_RULE' }`; a `DATE_RULE` or `PROJECT_RULE` refusal is never retried as a `POST`.
- Date rules come only from `api/src/lib/dates.js` / `js/lib/dates.js`; no date validation outside them (`js/lib/dates-guard.test.js`).
- New `js/lib/` exports used by a page get a `window.<name>` bridge.
- `?v=N` bumped in every reference of every versioned file touched: `js/api-sync.js` 27→28, `js/costgrid.js` 50→51, `js/lib/project-push-result.js` 2→3, `js/lib/config-form-calc.js` 3→4. `js/api.js` is **not** touched (`saveTasks` already sends its second argument as-is). Find the guards that pin a file by name, not by `?v=`: `grep -rln "<basename-without-ext>" js/lib/*guard*.test.js scripts/*.test.js` and read the matches.
- A task touching `costgrid.html` runs every `js/lib/costgrid*guard*.test.js`; one touching `project-config.html` runs `js/lib/project-config*.test.js`.
- Data on the main stack is never corrected; the two handoff queries must still give `12 44` and `9 28`.
- Docker on the main stack: none in this plan. Server tests run through `scripts/run-tests.sh`; browser checks through `scripts/test-branch.sh up` (copy `.env` into the worktree first, `npm ci` once).
- No new finding is fixed in this cycle: it goes to `docs/BACKLOG.md`.

## Review Focus

1. **Stored out-of-period tasks (the existing data), header-only edit with the structure loaded** — the `PATCH` (no period) succeeds, the structure is refused once with the §3.1 notice, the autosave resolves `false`. Test in Task 3.
2. **Blank period sent with the structure/tasks** (`startDate: ''`, `endDate: ''`) — clears the period like today's `PATCH` with `null`, and every task date is accepted. Test in Tasks 1 and 2 (`PS-09`, `PS-10`).
3. **A page cached with the old scripts** (the `.html` pages are not versioned) — it sends the period in the `PATCH` and the structure/tasks without `period`, and keeps today's behaviour. Pinned by `PS-03` and `PS-06`.
4. **Generate of a brand-new project** — the `PATCH` 404s, the `POST` carries the full period, then the tasks go with the same period and pass. Test in Task 4.
5. **`period` with only one side** — the missing side keeps the stored value, like the `PATCH`. Test in Task 1 (`PS-12`).

Task independence: Tasks 1 and 2 (server) are independent of each other and of the client tasks except through the body contract below. Tasks 3 and 4 both edit `js/api-sync.js` and must run in order. Tasks 5 and 6 are independent of each other; 5 needs 4's `_pushProjectToApiDetailed` contract.

---

### Task 1: `PUT …/structure` accepts `period` (server)

**Files:**
- Modify: `api/src/routes/cost-grids.js` (the `router.put('/:id/versions/:vId/structure'` handler)
- Test: `test-api.js` (new `async function testPeriodWithTasks()` registered after `await testTaskPeriod();`)

**Interfaces:**
- Produces: body `{ phases, roles, period?: { startDate?: 'YYYYMM'|'', endDate?: 'YYYYMM'|'' } }`. Absent `period` → today's behaviour. A side that is `undefined` keeps the stored value; `''` writes `NULL`.

- [ ] **Step 1: Write the failing tests** in `testPeriodWithTasks()`, setup copied from `testTaskPeriod()` (own names `__test_ps_cg__`, `__test_ps_proj__`, period `202604`–`202612`, cleanup via `later`). Check the prefix is still free first: `grep -noE "\bPS-[0-9]" test-api.js TEST_CASES.md` → no match.
  - `PS-01` structure `{ phases: [task 2026-11-02..2026-11-06], period: { startDate: '202606', endDate: '202701' } }` → `200`; version period `202606|202701`; task saved.
  - `PS-02` from the PS-01 state, structure with task `2026-05-04..2026-05-08` and period `202606`–`202612` → `400 DATE_RULE`; period still `202606|202701`, task titles unchanged.
  - `PS-03` structure without `period` and a task outside the stored period → `400 DATE_RULE` (today's behaviour).
  - `PS-07` task `2026-12-10..2026-03-02` (inverted, end before the period start) with period `202606`–`202612` → `400 DATE_RULE`, `error` contains `before` and the period wording of `taskPeriodError` (not the order message of `periodError`).
  - `PS-09` period `{ startDate: '', endDate: '' }` with a task `2025-01-06..2025-01-10` → `200`, version period `|`.
  - `PS-12` `period: { endDate: '202703' }` only → `200`, start unchanged, end `202703`.
- [ ] **Step 2: Run to verify they fail**: `scripts/run-tests.sh` → PS-01, PS-07, PS-09, PS-12 FAIL (period ignored / order message first).
- [ ] **Step 3: Implement.** In the handler: read `period` from the body; inside the existing transaction after `lockVersion`, when `period` is present, read the stored `start_date`/`end_date`, compute next = body side or stored, run `periodChangeError(next, stored, { kind: 'month', label: 'version' })` (refuse → `ROLLBACK`, `400 DATE_RULE`), check each task with `taskPeriodError` against **next**, then `UPDATE cost_grid_versions SET start_date = $1, end_date = $2` (empty → `NULL`) before the `DELETE FROM phases`. Move the per-task order check (`periodError` with `kind: 'day'`, today before the transaction) to after the `taskPeriodError` loop, inside the transaction, with `ROLLBACK` on refusal; the hours check stays first.
- [ ] **Step 4: Run** `scripts/run-tests.sh` → all `PS-*` above and the existing `TD-*`/`DT-*` PASS.
- [ ] **Step 5: Commit** `feat(dates-c4): structure PUT carries the version period`.

### Task 2: `PUT /api/projects/:id/tasks` accepts `{ tasks, period }` (server)

**Files:**
- Modify: `api/src/routes/projects.js` (the `router.put('/:id/tasks'` handler)
- Test: `test-api.js` (`testPeriodWithTasks()`)

**Interfaces:**
- Produces: body `Task[]` **or** `{ tasks: Task[], period?: { startDate?, endDate? } }`, same side semantics as Task 1.

- [ ] **Step 1: Write the failing tests**:
  - `PS-04` `{ tasks: [task 2026-11-02..2026-11-06], period: { startDate: '202606', endDate: '202701' } }` → `200`; `GET /api/projects/:id` period `202606|202701`.
  - `PS-05` final state invalid (task `2026-05-04..2026-05-08`, period `202606`–`202612`) → `400 DATE_RULE`; period and tasks unchanged.
  - `PS-06` array body with one in-period task → `200` (today's behaviour).
  - `PS-08` inverted task outside the period → `400 DATE_RULE` with the period message, as `PS-07`.
  - `PS-10` blank period with a task in 2025 → `200`, project period blank.
- [ ] **Step 2: Run** `scripts/run-tests.sh` → PS-04, PS-08, PS-10 FAIL.
- [ ] **Step 3: Implement.** Normalise `const { tasks, period } = Array.isArray(req.body) ? { tasks: req.body } : req.body`. Run the whole write on a dedicated `pool.connect()` client with `BEGIN`/`COMMIT`/`ROLLBACK` (with or without `period`). Order: sold hours → (with `period`) `periodChangeError(…, { kind: 'month', label: 'project' })` → `taskPeriodError` against next (or stored without `period`) → per-task `periodError` (`kind: 'day'`) → `UPDATE projects SET start_date, end_date` (with `period`) → delete + insert. `enqueueProjectCode` after `COMMIT`.
- [ ] **Step 4: Run** `scripts/run-tests.sh` → `PS-*`, `TD-*`, `DT-*`, `PR-*` PASS.
- [ ] **Step 5: Commit** `feat(dates-c4): project tasks PUT carries the project period, in one transaction`.

### Task 3: `_cgUpsertVersionToApi` sends the period with the structure; notice keys

**Files:**
- Modify: `js/api-sync.js` (`_cgRuleNotified`, `_cgUpsertVersionToApi`, `cgLoadStructureFromApi`); every `api-sync.js?v=27` → `?v=28`
- Test: `js/lib/api-sync-upsert.test.js`

**Interfaces:**
- Consumes: Task 1's body.
- Produces: `function _cgForgetRuleNotices(versionId)` in `js/api-sync.js` (deletes every `_cgRuleNotified` key starting with `` `${versionId}|` ``); keys are `` `${versionId}|${code}|${message}` ``.

- [ ] **Step 1: Rewrite the tests.** Remove the four C3 retry tests (`…still saves the structure, then retries the PATCH once`, `…not retried and is shown once`, `…followed by a refused structure save does not retry…`, `…that the retry repeats…`) and `a non-DATE_RULE PATCH failure still skips the structure save`. Pass `_cgForgetRuleNotices` (extracted with `extractBlock`) as a stub too. Add, with a draft `startDate: '202606', endDate: '202701'`:
  - `with the structure loaded, the PATCH carries no period and the structure carries it` — `versions.update` body has neither `startDate` nor `endDate`; `saveStructure` body `period` equals `{ startDate: '202606', endDate: '202701' }`; call order name → PATCH → structure.
  - one `it.each` over `shrink`/`widen`/`shift` drafts: same three calls, resolves `true`.
  - `without the structure loaded, the PATCH carries the period and nothing else is sent` — `phases: []`, `startDate`/`endDate` in the PATCH body, no `saveStructure`.
  - `a DATE_RULE refusal of the structure resolves false and shows the §3.1 text once` — `showInfo` called once with `why. Task dates and the period of this version are not saved until this is fixed; other changes are saved.`; a second identical call shows nothing.
  - `a different code or message for the same version shows a new notice` — DATE_RULE then STRUCTURE_RULE → two notices.
  - `a successful structure save forgets the version's notices` — refused, then ok, then the same refusal → two notices.
  - `a refused PATCH no longer skips the structure save` (any code) — structure called, resolves `false`.
  - `strict: a refused structure throws before anything else` and `strict: the structure with the new period is sent` (criterion 5).
  - Review Focus 1: stored out-of-period → PATCH ok, structure refused, one notice, `false`.
- [ ] **Step 2: Run** `npx vitest run js/lib/api-sync-upsert.test.js` → new tests FAIL.
- [ ] **Step 3: Implement.** Build `serverMeta` as today; when `phases && phases.length > 0`, send the `PATCH` with `serverMeta` minus `startDate`/`endDate`, then `saveStructure(cgId, versionId, { phases, roles: roles || [], period: { startDate: meta.startDate || '', endDate: meta.endDate || '' } })`; otherwise the `PATCH` with the period and no structure. Delete `metaRefusal`, `structureSaved` and the retry. A failed `PATCH` sets `allOk = false` (throws in strict) and continues. After a successful `saveStructure` call `_cgForgetRuleNotices(versionId)`. `notifyRefusal` keys by version|code|message; the `DATE_RULE` sentence is §3.1's. `cgLoadStructureFromApi` calls `_cgForgetRuleNotices(verId)` after a successful load. Update the comment block above the function.
- [ ] **Step 4: Run** `npx vitest run js/lib/api-sync-upsert.test.js js/lib/costgrid-autosave-toast.test.js js/lib/costgrid-new-version.test.js js/lib/costgrid-clone.test.js js/api-sync.test.js` → PASS; then the guards found by `grep -rln "api-sync" js/lib/*guard*.test.js scripts/*.test.js`.
- [ ] **Step 5: Commit** `feat(dates-c4): version period travels with the structure; notices per code and message`.

### Task 4: `_pushProjectToApiDetailed`, `summarizePushResult`, project-config banner

**Files:**
- Modify: `js/api-sync.js` (`_pushProjectToApiDetailed`; `?v=28` already set by Task 3), `js/lib/project-push-result.js` (`?v=2` → `?v=3`), `project-config.html` (banner text)
- Test: `js/lib/api-sync-push-project.test.js`, `js/lib/project-push-result.test.js`, `js/lib/project-config-task-period-guard.test.js`

**Interfaces:**
- Consumes: Task 2's body.
- Produces: a tasks failure carried with the period is `{ part: 'tasks', withPeriod: true, error, code, reason }`.

- [ ] **Step 1: Write the failing tests.**
  - push: `with tasks to send, the PATCH carries no period and saveTasks gets { tasks, period }`; `without tasks (skipEmpty and []), the PATCH carries the period and saveTasks is not called`; `a PATCH 404 falls back to a POST with the full period, then saveTasks with the same period` (Review Focus 4); `a refused saveTasks is reported with withPeriod: true`; call order PATCH → tasks → phasing → ptc → planning → groups.
  - summary: `[{ part: 'project', code: 'PROJECT_RULE', reason: 'why' }]` → `Save failed: project details were not saved, so tasks, phasing, PTC, monthly planning and role groups were not attempted. Fix the issue and press Save again. Reason: why`; `[{ part: 'tasks', withPeriod: true }]` → message contains `tasks and the project period were not saved`.
  - guard: replace `'Changes to this project are not saved'` with `'Task dates and the period are not saved until the tasks are moved inside it or the period is widened; other changes are saved.'`.
- [ ] **Step 2: Run** the three files with `npx vitest run` → FAIL.
- [ ] **Step 3: Implement.** In `_pushProjectToApiDetailed`: `const sendTasks = wanted(tasks)` computed before the `PATCH`; `PATCH` body = `meta` minus `startDate`/`endDate` when `sendTasks`; the `POST` fallback keeps the full `meta`; the tasks step calls `Api.projects.saveTasks(project.id, { tasks, period: { startDate: meta.startDate || '', endDate: meta.endDate || '' } })` and marks its failure `withPeriod: true`. In `summarizePushResult`: the §3.3 sentence for a lone `project` failure; label `tasks and the project period` for `withPeriod`. In `project-config.html`'s out-of-period banner, the §3.2 sentence with `project period`.
- [ ] **Step 4: Run** the three files plus `js/lib/project-config*.test.js` and the guards from `grep -rln "project-push-result" js/lib/*guard*.test.js scripts/*.test.js` → PASS.
- [ ] **Step 5: Browser check.** `scripts/test-branch.sh up`; with `scripts/shoot.mjs --eval-file` on the branch-stack project whose id starts with `f6541ba7` (full id from `GET /api/projects`; period Sep–Dec 2026, tasks Jan–Mar 2026): Save 1 widens the period to `202601`–`202612` (tasks now inside); Save 2, in one Save, shrinks it to `202604`–`202612` and moves every task into Apr–Jun 2026 → redirect to the portfolio, `GET /api/projects/:id` period `202604|202612` and the moved task dates (B-150). Record the project id touched in the task report.
- [ ] **Step 6: Commit** `feat(dates-c4): project period travels with the tasks; save message names untried sections`.

### Task 5: costgrid — banner text, Generate and Add tasks

**Files:**
- Modify: `js/costgrid.js` (`cgGenerationPlan`, `cgDoAddTasksToProject`, `cgDoGenerateProject`; `?v=50` → `?v=51`), `costgrid.html` (banner text)
- Test: `js/lib/costgrid-generate-preflight.test.js` (extend), new `js/lib/costgrid-add-tasks.test.js`, `js/lib/costgrid-task-period-guard.test.js`

**Interfaces:**
- Consumes: Task 4's `_pushProjectToApiDetailed(project, { skipEmpty: true }) → { ok, failed }`.

- [ ] **Step 1: Write the failing tests.**
  - preflight: draft `startDate: '202612', endDate: '202604'`, a selected task without dates → `showInfo` once with the `periodError` message, no `create`, no `gen`, `config.projects` empty, `linkedProjects` empty (criterion 12). Add `periodError` to the stubbed `window`.
  - add-tasks (extract `cgDoAddTasksToProject` with stubs for `_cgDraft`, `config`, `showInfo`, `showConfirm`, `cgOutOfPeriodNotice`, `toYmd`, `_pushProjectToApiDetailed`, `Api`): when `failed` has `part: 'tasks'` with `reason: 'why'`, `proj.tasks` is back to its original length, `lp.taskIds`/`lp.taskNames` unchanged, no `linkedProjects.add`, `showInfo` contains `why`; on success the tasks and the link are recorded as today.
  - guard: `costgrid.html` contains `Task dates and the period are not saved until the tasks are moved inside it or the period is widened; other changes are saved.` and no longer `Changes to this version are not saved`.
- [ ] **Step 2: Run** the three files → FAIL.
- [ ] **Step 3: Implement.** `cgGenerationPlan`: before `cgOutOfPeriodNotice`, `const periodErr = window.periodError(v.startDate || '', v.endDate || '', { kind: 'month', label: 'proposal' })`; `refusal = periodErr || cgOutOfPeriodNotice(…)`. `cgDoAddTasksToProject`: call `_pushProjectToApiDetailed`; on any `failed` (project or tasks) splice the new tasks back out, show `Tasks were not added to "<project name>": <reason or error>`, return before the `linkedProjects` update. `cgDoGenerateProject`: call `_pushProjectToApiDetailed`; `pushedOk` = no `project` failure; when `tasks` failed, `linkedProjects.add` and the local `linkedProjects` entry get `taskIds: []`, `taskNames: []`, and the final notice says `Project "<name>" was created, but its tasks were not saved: <reason>`. Banner sentence of §3.2 with `proposal period`.
- [ ] **Step 4: Run** the three files plus every `js/lib/costgrid*guard*.test.js` and `js/lib/costgrid-*.test.js` → PASS.
- [ ] **Step 5: Browser check.** On the branch stack, proposal `ddf602ac-97d5-4180-8903-5b1334b59f14` version `fdf9b203-1ea7-4088-ac80-556bca2e09e2` (period Sep–Dec 2026, tasks Jan–Mar 2026) with `scripts/shoot.mjs --eval-file`: first widen the period to `202601`–`202612` and wait for the toast (tasks now inside); then, within one debounce, shift it to `202604`–`202701` (start shrunk, end widened) and move every task into Apr–Jun 2026 → no notice, the toast, and after reload the period and the tasks as set (B-150). Record the version touched.
- [ ] **Step 6: Commit** `feat(dates-c4): costgrid banner, Generate refuses an invalid period, Add tasks reports a refused task save`.

### Task 6: `keepDistribution` (B-158)

**Files:**
- Modify: `js/lib/config-form-calc.js` (`?v=3` → `?v=4`), `project-config.html` (`rebuildTaskDist`)
- Test: `js/lib/config-form-calc.test.js`

**Interfaces:**
- Produces: `export function keepDistribution(dist: object|undefined, months: string[]): object` + `window.keepDistribution = keepDistribution`.

- [ ] **Step 1: Write the failing tests**: `keepDistribution({ 202601: 40, 202602: 60 }, [])` returns the same object contents; `(…, ['202602'])` → `{ 202602: 100 }`; `(…, ['202601', '202602', '202603'])` → `{ 202601: 40, 202602: 60 }`; `(undefined, ['202601', '202602'])` → `{}`.
- [ ] **Step 2: Run** `npx vitest run js/lib/config-form-calc.test.js` → FAIL.
- [ ] **Step 3: Implement** `keepDistribution` (the body of today's `rebuildTaskDist` plus the empty-`months` early return) and make `rebuildTaskDist(ti)` assign `task.monthlyDistribution = window.keepDistribution(task.monthlyDistribution, this.taskMonthRange(task))`.
- [ ] **Step 4: Run** `npx vitest run js/lib/config-form-calc.test.js js/lib/project-config*.test.js` plus the guards from `grep -rln "config-form-calc" js/lib/*guard*.test.js scripts/*.test.js` → PASS.
- [ ] **Step 5: Commit** `fix(dates-c4): an inverted task range keeps the monthly distribution`.

## Decisioni aperte

1. **Due task server separati (versione, progetto) invece di uno.** Alternativa scartata: un solo task per i due `PUT`. Perché: un reviewer può respingere uno dei due approvando l'altro, e i test `PS-*` si dividono di conseguenza.
2. **I test C3 del ritentativo vengono cancellati, non adattati.** Alternativa scartata: tenerli invertiti. Perché: descrivono un meccanismo che la Spec toglie; le nuove combinazioni li sostituiscono.
3. **`js/api.js` non cambia.** Alternativa scartata: un `saveTasks` con firma nuova. Perché: manda già il secondo argomento così com'è.
4. **Add tasks tratta come rifiuto anche il fallimento della sola `PATCH`.** Alternativa scartata: registrare comunque i task. Perché: con la `PATCH` fallita i task non vengono tentati, quindi non sono salvati.
