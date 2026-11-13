# PDash To Prod History Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The History view of the PDash To Prod panel groups its records by session (one run of `start-dashboard.cmd`), with a one-line summary per block; records written before sessions existed are grouped by calendar day.

**Architecture:** A pure `groupSessions(records)` in `dashboard/history.mjs` builds the groups; `createHistoryService.summary` returns them as `sessions`; the controller and the stack service stamp every new record with a `sessionId` given by `server.mjs` at start-up; `index.html` renders each group as a `<details>` block.

**Tech Stack:** Node ≥ 20, `node:test` (`npm test` in `PDash_To_Prod`), plain HTML/JS page.

**Spec:** `docs/superpowers/specs/2026-11-13-pdash-to-prod-history-sessions-design.md`
**Branch:** `main` (no branch, no worktree: direct commits, the user's instruction of 2026-11-13; all code lives in the panel repository `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod`, its own git, no remote)
**Risk class:** low-risk — no high-risk category applies (no migration, auth, money, shared file loaded by several pages, destructive operation or new Docker command), no API route of the app, no `js/lib` module, no process file; the change is a pure function and a page render in a local tool.

**Task independence:** Task 1 → Task 2 → Task 3 in order (each uses the previous one's interface); Task 4 last. Native execution.

## Global Constraints

- All text on the page is English. No new dependency, no change to `steps.mjs` or `docker.mjs`.
- Edit files with Edit/Write; never put backslashes through `node -e` or shell heredocs (the scripts of this project lost them twice): scripts go in files, regexes with `\` are written with the Edit tool.
- `history.jsonl` is never rewritten; the only format change is the extra `sessionId` field on new records.
- Commits in the panel repository, with a `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` trailer; no push (the repository has no remote).

## Review Focus

1. **Records with no usable `ts`:** a record whose `ts` does not parse must not drop out of every group or crash the grouping; it goes in a `day` group titled "Unknown date". Pinned by a Task 1 test.
2. **Two sessions starting in the same second:** `sessionId` collides and two runs merge into one block; accepted (the `.cmd` cannot start twice in one second on one port), but two ids that differ only by their time zone offset stay distinct as strings. Not tested; noted here so the reviewer does not look for it.
3. **The filter hides every block:** the page shows a "No operation matches" line rather than an empty history. Pinned by a Task 3 page test (string marker) and the manual check.
4. **A very long history:** the page renders only the newest block open and the others as closed `<details>` with their rows built lazily (rows are created when a block is first opened), so a long file does not build thousands of rows at load. Pinned by a Task 3 marker test.

---

### Task 1: The grouping function

**Files:**
- Modify: `dashboard/history.mjs`
- Test: `dashboard/test/history.test.mjs`

**Interfaces:**
- Produces: `export function groupSessions(records: object[]): Array<{ key: string, kind: 'session' | 'day', title: string, start: string, records: object[], summary: string }>` and `export function summarize(records: object[]): string`, per spec §"Comportamento atteso" 2 and 3. `start` is the `sessionId` for a session and the local day `YYYY-MM-DD` for a day group. Titles: for a session the function returns the raw `sessionId` in `title` (the page formats it); a day group's title is `<YYYY-MM-DD> (before sessions were recorded)`; an unparsable `ts` goes to a day group with `key: 'day:unknown'` and title `Unknown date (before sessions were recorded)`.

- [ ] **Step 1: Write the failing tests** in `history.test.mjs`: (a) records with two different `sessionId`s and some with none give 2 session groups and day groups, newest group first, each group's records newest first, and the total number of records across groups equals the input length (spec criterion 2); (b) two legacy records on different local days give two `day` groups; (c) a record with `ts: 'garbage'` and no `sessionId` lands in `day:unknown`, and the total still equals the input length (Review Focus 1); (d) `summarize` for records `[push ok, stack-start ok, stack-seed ok, stack-stop ok, a failed dry-run]` (any order of input) returns exactly `1 export pushed · stack: start, seed, stop · 1 failed`; for two export steps and no push it returns `2 export steps`; for one export step `1 export step`; for only successful stack records `stack: start`; a group with no failures has no `failed` part; (e) an empty input gives `[]`.
- [ ] **Step 2: Run** `node --test dashboard/test/history.test.mjs` in `PDash_To_Prod`. Expected: the new tests FAIL (export missing).
- [ ] **Step 3: Implement** `groupSessions` and `summarize` in `history.mjs`. Export ops are the six of `HISTORY_OPS` in `controller.mjs` (`repo-check`, `export-list`, `dry-run`, `copy`, `commit`, `push`); stack ops are those starting with `stack-`. Local day = the local date of `new Date(ts)`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: group history records by session`.

### Task 2: The session id on every new record, and the grouped summary

**Files:**
- Modify: `dashboard/controller.mjs`, `dashboard/services.mjs`, `dashboard/server.mjs`
- Test: `dashboard/test/controller.test.mjs`, `dashboard/test/services.test.mjs`

**Interfaces:**
- Consumes: `groupSessions` from Task 1.
- Produces: option `sessionId: string` on `createController({…})` and on `createStackService({…})`, copied into every record those append; `createHistoryService(...).summary()` additionally returns `sessions: ReturnType<typeof groupSessions>`; `server.mjs` `main()` creates `const sessionId = isoLocal(new Date())` once and passes it to both.

- [ ] **Step 1: Write the failing tests:** in `controller.test.mjs`, a controller built with `sessionId: 'S1'` writes `sessionId: 'S1'` in the record of an export step; in `services.test.mjs`, a stack service built with `sessionId: 'S1'` writes it in a `stack-prepare` record, and `createHistoryService(...).summary()` on a file holding records of two session ids and one without returns `sessions` with 2 session groups and 1 day group; a controller or service built without `sessionId` still works and writes no `sessionId` field.
- [ ] **Step 2: Run** `node --test dashboard/test/controller.test.mjs dashboard/test/services.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the option in both factories (spread `...(sessionId ? { sessionId } : {})` into the appended record), `sessions: groupSessions(records)` in `summary()`, and the `main()` wiring in `server.mjs`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: stamp every new history record with the session id`.

### Task 3: The grouped view

**Files:**
- Modify: `dashboard/index.html`
- Test: `dashboard/test/ui.test.mjs`

**Interfaces:**
- Consumes: `data.sessions` from `GET /api/history` (Task 2).

- [ ] **Step 1: Write the failing page tests** in `ui.test.mjs` (string markers on the page source, as the existing tests do): the history script reads `sessions`, builds `<details>` blocks (`'details'`), sets the first block open only, builds a block's rows when it is first opened (lazy: a marker such as `'toggle'` handler that fills rows), shows the text `No operation matches` when every block is filtered out, and the table keeps its six column headers; the old flat `h-rows` body is replaced by a container `id="h-sessions"`.
- [ ] **Step 2: Run** `node --test dashboard/test/ui.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** in `index.html`: replace the flat table of `renderHistory` with one `<details class="session">` per group (title formatted with `when()` for sessions, the given title for days; the summary line; `N records`); the rows and detail rows are the existing ones, built per block; Operation/Outcome filters apply per block and hide blocks without rows; first block `open`. Keep the banner, Pending, cross-check and file search code as they are.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Look at it.** Start a second panel instance on a scratch config (`--config` with port 4178 and a copy of `history.jsonl`), start and stop it twice running `repo-check` in each, open `http://127.0.0.1:4178/#history` with headless Chrome (`--screenshot`, as PROCESS.md §6.3), read the PNG, and confirm: two session blocks, the newest open, the 13 old records in day blocks, summaries as in the spec. Stop the instance.
- [ ] **Step 6: Commit** `feat: History view grouped by session`.

### Task 4: README and closing checks

**Files:**
- Modify: `README.md` (the "History" paragraph: sessions, day blocks for older records, the summary line)

- [ ] **Step 1: Edit** the README paragraph.
- [ ] **Step 2: Run** `npm test` in `PDash_To_Prod`, and `npx vitest run scripts/decision-ledger-guard.test.js scripts/doc-paths-guard.test.js` in `burndown`. Expected: all PASS.
- [ ] **Step 3: Check** `git -C <burndown> diff --stat` shows nothing from this cycle beyond spec and plan (spec criterion 6).
- [ ] **Step 4: Commit** `docs: README for the session history`.

---

## Decisioni aperte

1. **Un solo test di pagina a marcatori più la verifica a vista, non un test del DOM.** Alternativa scartata: un harness jsdom per il pannello. Perché: il pannello non ha dipendenze e il raggruppamento, che è la logica, è già provato come funzione pura.
2. **Le righe di un blocco si costruiscono alla prima apertura.** Alternativa scartata: costruirle tutte al caricamento. Perché: la cronologia cresce a ogni avvio e il caricamento deve restare istantaneo.
3. **Il titolo di una sessione lo formatta la pagina, la funzione restituisce l'ora grezza.** Alternativa scartata: formattare nel server. Perché: la pagina ha già `when()` e il fuso del browser.
4. **Classe `low-risk` e modalità nativa.** Alternativa scartata: `standard`. Perché: nessuna categoria di §6.1b, nessuna route dell'app, nessun file di processo; quattro task sequenziali (§6.1).
