# Smoke Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fixed dataset of fantasy data that a script creates through the API on an empty `ithwg-check` stack, and a **Seed** button in PDash To Prod that runs the whole sequence (migrate, admin, trusted device, seed).

**Architecture:** Two projects. In `burndown`: a pure data module (constants, dates, expected totals, URL check; `node:test`) and a thin API-driving script that uses it and verifies the result. In `PDash_To_Prod` (own git repository, `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod`): a `seed` stack action beside `prepare`/`start`/`stop`, with fake-`exec` tests and a button.

**Tech Stack:** Node ≥ 20 (global `fetch`, `FormData`), `node:test`; the panel's own `node --test` suite; Docker Compose project `ithwg-check`.

**Spec:** `docs/superpowers/specs/2026-11-13-smoke-seed-design.md`
**Branch:** `main` (no branch, no worktree: direct commits, the user's instruction of 2026-11-13; the panel commits go to its own repository)
**Risk class:** high-risk — the panel gains Docker commands (§6.1b "script Docker"); the review effort therefore stays high. Nothing touches the main PDash stack, the schema or the app code.

**Task independence:** Task 1 → Task 2 in order (same script). Task 3 (panel) needs only the CLI contract below and can run before or after Tasks 1-2; Task 4 needs all three; Task 5 is last. Run them in the order 1, 2, 3, 4, 5 natively.

**CLI contract of `seed-smoke.js` (the interface between the two projects):**
`node api/src/scripts/seed-smoke.js --url <url> --email <email> --password <password> --device <hex>`; exit 0 = all checks `OK`; 1 = a call failed or a check is `MISMATCH`; 2 = usage or refused target (not `localhost`/`127.0.0.1`, or no explicit port, or port 80); 3 = the database already holds an offer or a client. Fixed test credentials, defined once in the panel's `docker.mjs`: email `smoke.admin@example.com`, password `Smoke-Test-123`, first name `Smoke`, last name `Admin`.

## Global Constraints

- All user-facing text (the page, messages) is English; spec and plan prose may stay Italian only where the spec is.
- Edit repo files with Edit/Write, never PowerShell `Set-Content` (BOM); no backslashes through `node -e` or shell quoting — put scripts in files.
- The panel runs only constant-argument commands; the only variable values are the `burndown` folder (from `config.json`) and the device value (validated hexadecimal). Never `-v`/`--volumes`, never a container without the `ithwg-check-` prefix, never `docker compose` against `pdash-*`.
- No change to `scripts/site-export.rules`, `api/src/trust-device.js`, app code or migrations; `seed-planning-golden.js` is untouched.
- Where an endpoint refuses a value (currency, dates, roles on tasks, project rules), fix the script's value, not the rule. Request shapes are read from the routes named in each task, then confirmed by the run in Task 4.
- Commits in `burndown`: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` trailer. Commits in the panel repository: plain message, same trailer.

## Review Focus

1. **Seed run twice / on existing data:** the script refuses with exit 3 and writes nothing; the panel refuses before running `migrate`. Pinned by Task 1 (`isEmptyDatabase`) and Task 3 tests.
2. **Dates across a month or year end:** every date is derived with `offsetDate` from a `today` argument; a run on 2026-12-31 and on 2027-01-01 yields valid ISO dates and the same shape. Pinned by Task 1 tests.
3. **Actuals the upload would reject:** every row's task and role must exist on its project, and its date must lie inside that task's period; a mismatch rejects the whole file. Pinned by a Task 1 test over all three projects.
4. **Unexpected `trust-device.js` output:** the panel must fail with that output, not pass garbage as the device value. Pinned by a Task 3 test.
5. **A failing step in the middle:** the sequence stops, reports the failing command's output, and leaves the stack as it is (no `down`). Pinned by a Task 3 test per step.

---

## Dataset (constants for Task 1)

| Item | Value |
|---|---|
| Group | *Northern Alliance* with clients *Aurora Pharma*, *Borealis Foods*; third client *Cobalt Retail* (no group) |
| Roles (code → label, EUR rate) | `NOVA - DEV` → Nova Developer, 90 · `NOVA - QA` → Nova Tester, 70 · `ORBIT - PM` → Orbit Project Lead, 120 · `ORBIT - DES` → Orbit Designer, 85 (team = the part before ` - `) |
| USD | activated at 1.10; the USD offer's role rates are sent explicitly: DEV 99, QA 77, PM 132, DES 93.5 |
| POT | *Aurora Pharma*, current year, 500000 (EUR) |
| Team | Lena Vask (DEV), Marco Tell (DEV), Iris Doon (QA), Teo Brandt (PM), Yara Quill (DES), Otto Ferro (DES, inactive); emails `<first>.<last>@smoke.test`, lower case; the actuals also name *Zed Unlisted*, who is not in the Team |
| Tags | Market list, two new items *Northland* and *Southland* (assignment below the offers table) |
| Task layout (same in every offer) | Phase *Discovery*: *Kick-off* (DEV 40, PM 16), *Analysis* (DEV 80, QA 24); phase *Delivery*: *Build* (DEV 200, DES 60), *Acceptance* (QA 60, PM 24). Hours are multiplied per offer by the factor below; task periods are the offer period cut in 4 equal consecutive slices in this order |

| # | Offer name | Client | Stage | Currency | Hours × | Period (days from today) | Project |
|---|---|---|---|---|---|---|---|
| 1 | Project Lighthouse | Aurora Pharma | SIP | EUR | 1 | +10 … +200 | — |
| 2 | Project Meridian | Borealis Foods | Expected | EUR | 1 | −10 … +190 | — |
| 3 | Project Nimbus | Cobalt Retail | Anticipated | USD | 1.5 | −30 … +170 | `SMK-NIM` |
| 4 | Project Orchid | Aurora Pharma | Committed | EUR | 2 | −90 … +120 | `SMK-ORC` in *Programme Helios* |
| 5 | Project Quasar | Borealis Foods | Committed | EUR | 1.25 | −60 … +150 | `SMK-QSR` in *Programme Helios* |

Tags: *Northland* on offers 4 and 5 and on `SMK-ORC` and `SMK-QSR`; *Southland* on offer 3 and `SMK-NIM`.
Actuals: for each project, one row every 3 days from the day after the project start to yesterday, columns `projectId,date,task,role,owner,hours`; the (task, role) pair cycles over the pairs of the tasks whose period contains that date; owners cycle over the six Team people then *Zed Unlisted*; hours cycle `[2, 3.5, 4, 6, 1.5]`.

---

### Task 1: The data module

**Files:**
- Create: `api/src/scripts/seed-smoke-data.js`
- Test: `api/src/scripts/seed-smoke-data.test.js` (run by `cd api && node --test src/scripts/seed-smoke-data.test.js`; `api/package.json`'s glob already picks it up)

**Interfaces:**
- Produces (CommonJS, `module.exports`): constants `GROUP`, `CLIENTS`, `ROLES`, `TEAM`, `OFFERS`, `PROGRAM`, `POT`, `TAGS` shaped as in the Dataset section; and the functions
  - `offsetDate(today: Date, days: number): Date` — UTC midnight, `today` plus `days`;
  - `offerPeriod(offer, today: Date): { start: Date, end: Date }` and `taskPeriods(offer, today): Array<{ phase: string, task: string, start: Date, end: Date, roles: Array<{ role: string, hours: number }> }>` (4 equal slices, hours already multiplied);
  - `buildActualsCsv(projectCode: string, today: Date): string`;
  - `expected(today: Date): { clients: 3, roles: 4, resources: 6, offers: 5, projects: 3, programs: 1, pots: 1, actualsRows: { [code: string]: number }, offerBudget: { [offerName: string]: number } }` — `offerBudget` is Σ hours × rate of the offer's currency;
  - `checkTarget(url: string): { ok: true } | { ok: false, error: string }`;
  - `isEmptyDatabase(counts: { offers: number, clients: number }): boolean`.

- [ ] **Step 1: Write the failing tests** in `seed-smoke-data.test.js` (`node:test`, `assert`):
  `expected` returns the counts above and `offerBudget['Project Orchid']` equal to 2 × (40·90 + 16·120 + 80·90 + 24·70 + 200·90 + 60·85 + 60·70 + 24·120); `offsetDate(new Date(Date.UTC(2026,11,31)), 1)` is 2027-01-01; `taskPeriods` for each offer gives 4 consecutive slices covering exactly `offerPeriod`; for each of the 3 project codes every row of `buildActualsCsv` parses to a date inside the period of its (task, role) on that project and a role that exists on that task (Review Focus 3), and the row count equals `expected(today).actualsRows[code]` for `today` = 2026-12-31, 2027-01-01 and 2026-03-15; `checkTarget('http://localhost:8190')` ok, `'http://localhost'` refused (no port), `'http://localhost:80'` refused, `'http://example.com:8190'` refused, `'not a url'` refused; `isEmptyDatabase({offers:0,clients:0})` true, `{offers:1,clients:0}` false, `{offers:0,clients:2}` false.
- [ ] **Step 2: Run** `cd api && node --test src/scripts/seed-smoke-data.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the module with the signatures above, from the Dataset section. Task slices: the offer period in whole days divided by 4, the last slice ends on the period end. Actual rows: `d` from project start + 1 to yesterday step 3 days.
- [ ] **Step 4: Run** the same command. Expected: PASS, all tests.
- [ ] **Step 5: Commit** `feat(seed): fixed smoke dataset module and its tests`.

### Task 2: The seed script

**Files:**
- Create: `api/src/scripts/seed-smoke.js`

**Interfaces:**
- Consumes: Task 1's module; the CLI contract above.
- Produces: the script run by the panel; stdout is the log, one line per check (`OK <what>` or `MISMATCH <what>: expected X, got Y`); the exit codes of the contract.

- [ ] **Step 1: Read the routes** the script will call, and note the request shape of each in a comment at the top of the script: `api/src/routes/auth.js` (login with a device cookie, as `api/src/scripts/seed-planning-golden.js` does), `config.js` (`/api/clients`, client groups, `/api/roles`, programs), `currencies.js` (`POST /api/currencies/:code/activate`), `pipeline-years.js`, `pots.js`, `resources.js`, `cost-grids.js` (create grid, version, `PUT …/structure`, `…/publish`, tags), `projects.js` (`POST /api/projects` with `cgVersionId`, `PUT …/tasks`, `PUT …/tags`), `timesheets.js` (upload, same call as the golden seed), `attribute-lists.js` (Market items). Copy the small helpers (`api`, `upload`, cookie handling) from the golden seed rather than importing it.
- [ ] **Step 2: Implement** `main()`: parse the CLI (`--url --email --password --device`), `checkTarget` (exit 2), login with the device cookie, read counts of offers and clients and refuse with exit 3 if `isEmptyDatabase` is false, then create in this order: group and clients, roles, USD activation, pipeline year (current year, active), POT, Team (Otto Ferro set inactive), Market tag items, the 5 offers (grid, version with stage/currency/client/period, structure, tags, publish for every non-Draft stage — the stage is set on the version), the program, the 3 projects from their offers (`cgVersionId`, program, tasks copied from the offer's tasks with their periods, tags), then `buildActualsCsv` uploads. Any non-2xx exits 1 with the status and body.
- [ ] **Step 3: Implement the verification** after the creates: read each collection back and compare with `expected(today)` (counts, per-project actuals rows, each offer's total budget); print one line per check; exit 1 if any is `MISMATCH`.
- [ ] **Step 4: Commit** `feat(seed): smoke seed script` (it is exercised against a real stack in Task 4; a unit test cannot cover it).

### Task 3: The Seed action in PDash To Prod

**Files** (all under `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod\dashboard`):
- Modify: `docker.mjs`, `services.mjs`, `server.mjs`, `index.html`
- Test: `test/docker.test.mjs`, `test/services.test.mjs`, `test/server.test.mjs`, `test/ui.test.mjs`

**Interfaces:**
- Consumes: the CLI contract and credentials above; the existing `exec({file,args,cwd,timeoutMs}) → {code, stdout, stderr}` and `stackStatus`.
- Produces: `export const SEED = Object.freeze({ email, password, firstName, lastName })` in `docker.mjs`; `export async function seedStack({ cloneDir, overridePath, burndownDir, exec, fsApi }): Promise<{ ok: true, summary: string } | { ok: false, error: string, step: string }>`; the stack action `seed` (`POST /api/stack/seed`, no confirmation needed); `'stack-seed'` in the page's history operation list; the button `#stk-seed`.

- [ ] **Step 1: Write the failing tests** in `test/docker.test.mjs` with a fake `exec` recording commands: (a) the happy path runs, in order, `docker exec ithwg-check-db psql … to_regclass('public.users')` (empty result), `npm run migrate`, `create-admin.js <email> <password> Smoke Admin`, `promote-sysadmin.js <email>`, `docker cp <burndownDir>/api/src/trust-device.js ithwg-check-api:/app/src/trust-device.js`, `trust-device.js <email>`, then `node <burndownDir>/api/src/scripts/seed-smoke.js --url http://localhost:8190 --email … --password … --device <hex>` with `cwd` the `burndownDir`, and returns `ok: true`; (b) a non-empty result of the `to_regclass` query returns `ok: false`, `step: 'database'`, a message naming **Stop and remove**, and runs no later command (Review Focus 1); (c) for each step a non-zero exit stops the sequence with that step's name and the command's output, and no `down` is ever issued (Review Focus 5); (d) `trust-device.js` printing something that does not end in a hexadecimal value of at least 32 characters fails with `step: 'device'` and that output (Review Focus 4); (e) no recorded command mentions a container without the `ithwg-check-` prefix, uses `-v`/`--volumes`, or is `down` (spec criterion 5); (f) the stack not healthy (`stackStatus().healthy === false`) fails with `step: 'stack'` before any command that changes anything.
  In `test/services.test.mjs`: `createStackService.run('seed')` writes a `stack-seed` history record with `ok` and, on failure, the `error`; an unknown action still throws 400. In `test/server.test.mjs`: `POST /api/stack/seed` with the token calls the service and answers 200; without the token 403. In `test/ui.test.mjs`: the page has `#stk-seed`, lists `stack-seed` among its operations and mentions the test credentials.
- [ ] **Step 2: Run** `npm test` in `PDash_To_Prod`. Expected: the new tests FAIL, the existing ones pass.
- [ ] **Step 3: Implement** `seedStack` in `docker.mjs`, the `seed` entry in `createStackService`'s `actions` (`services.mjs`, passing `config.burndownDir`), `'seed'` in the allowed stack actions of `server.mjs`, and in `index.html` the `#stk-seed` button after Start (same handler as the other stack buttons), `'stack-seed'` in `OPS`, and an updated "How to use the stack" section: step 2 now says **Seed** does migrations, admin and data (credentials shown), the manual commands stay as the fallback, and step 3 (the sign-in code) is unchanged.
- [ ] **Step 4: Run** `npm test` in `PDash_To_Prod`. Expected: PASS, all.
- [ ] **Step 5: Commit** in the panel repository: `feat: Seed button for the verification stack`.

### Task 4: End-to-end run on a fresh `ithwg-check` stack

**Files:** none (verification); fixes go to the file they belong to, with a commit in the matching repository.

- [ ] **Step 1: Bring the stack up** through the panel: start `node dashboard/server.mjs --no-open`, take the token from `GET /`, `POST /api/stack/prepare`, `POST /api/stack/start`, wait until `GET /api/stack` reports `healthy: true`. (Ports 5440, 8190, 8191 must be free; if the panel or a stack is already running, stop and tell the user.)
- [ ] **Step 2: Run Seed:** `POST /api/stack/seed`. Expected: `ok: true`; the seed log shows only `OK` lines. A failure is diagnosed (systematic-debugging) and fixed in the script, then the stack is removed (`POST /api/stack/stop` with `confirmed: true`) and Steps 1-2 repeated from a fresh database.
- [ ] **Step 3: Check the spec's criteria 2-4** against the running stack with API reads (`GET /api/cost-grids`, `/api/projects`, `/api/resources/unmatched`, logging in with the seed's device cookie) — pipeline offers per stage, 3 projects with two in *Programme Helios* and `Zed Unlisted` among the unmatched names; then `POST /api/stack/seed` a second time and confirm it refuses with the **Stop and remove** message and the data is unchanged.
- [ ] **Step 4: Remove the stack** (`POST /api/stack/stop` with `confirmed: true`), confirm `docker ps` lists no `ithwg-check-*` container, stop the panel server.

### Task 5: Documentation and closing checks

**Files:**
- Modify: `PDash_To_Prod\README.md` (the "Verification stack" paragraph: Seed does migrations, admin, device and data; the test credentials; what it refuses)
- Modify: header comment of `api/src/scripts/seed-smoke.js` (usage, exit codes, what it creates, "DEV TOOL — isolated stacks only")

- [ ] **Step 1: Edit** both files as above.
- [ ] **Step 2: Run** `npx vitest run scripts/` in `burndown` and `npm test` in `PDash_To_Prod`, and `cd api && node --test src/scripts/seed-smoke-data.test.js`. Expected: all PASS.
- [ ] **Step 3: Check** `git diff --stat <spec commit>..HEAD` in `burndown`: only `api/src/scripts/seed-smoke.js`, `api/src/scripts/seed-smoke-data.js`, its test, this spec and plan (spec criterion 6).
- [ ] **Step 4: Commit** `docs(seed): usage of the smoke seed` in each repository where a file changed. Do not push.

---

## Decisioni aperte

1. **Il dataset è una tabella di costanti nel piano, non di nuovo deciso in esecuzione.** Alternativa scartata: lasciare all'implementatore la scelta di nomi, ore e importi. Perché: "sempre uguale" è il requisito, e le cifre attese della verifica ne dipendono.
2. **Un modulo di dati puro e testato con `node:test`, più uno script sottile provato solo su uno stack vero.** Alternativa scartata: un test che avvia Docker. Perché: i test automatici non devono avviare stack (Decisioni aperte 8 della spec).
3. **Un piano in cinque task invece di uno per area del dataset.** Alternativa scartata: un task per cliente/offerta/progetto. Perché: sono chiamate API sequenziali dello stesso file, che si provano solo insieme sullo stack.
4. **Le forme delle richieste si leggono dalle route durante l'esecuzione.** Alternativa scartata: ricopiarle nel piano. Perché: il piano sarebbe più lungo del codice e invecchierebbe con le route.
5. **Classe `high-risk` e modalità nativa.** Alternativa scartata: `standard`. Perché: il pannello gestisce comandi Docker (categoria di §6.1b); i task sono sequenziali e piccoli, quindi nativa (§6.1).
