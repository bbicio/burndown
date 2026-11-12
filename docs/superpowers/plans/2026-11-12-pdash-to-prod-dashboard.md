# PDash To Prod Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `export:copy` learns `--yes --sha`, and a local, PDash-branded dashboard in `PDash_To_Prod/` drives the whole burndown → Bitbucket export, the verification Docker stack and the history of operations.

**Architecture:** Part A (Task 1) is a normal cycle in `burndown`: worktree, `/finish-cycle`. Part B (Tasks 2-9) is built after the merge, outside any repo, in `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod\` (own local `git init`, no remote): pure modules (`parse`, `history`, `steps`, `sequence`, `handlers`, `docker`), a process runner, an HTTP server with SSE, and a vanilla HTML page. Every module takes its collaborators (`exec`, `fs`, clock) as arguments so tests need neither git remotes nor Docker.

**Tech Stack:** Node ≥ 20 with built-in modules only (`node:test`, `node:http`, `node:child_process`); vitest for Task 1 (the repo's runner).

**Spec:** `docs/superpowers/specs/2026-11-12-pdash-to-prod-dashboard-design.md`
**Branch:** `pdash-to-prod`
**Risk class:** high-risk — operazioni distruttive (`docker compose down -v` e `git push` lanciati dalla dashboard)

**Task independence:** Tasks 2, 3, 4 and 6 are independent pure modules; Tasks 5, 7, 8 and 9 depend on earlier ones and run in order. Task 1 is independent of all of Part B.

## Global Constraints

- Part B: Node ≥ 20, **no dependencies**, everything under `PDash_To_Prod/`; paths of the two repos only in `config.json` (`burndownDir`, `cloneDir`, `port`).
- Server listens on `127.0.0.1` only; rejects `Origin`/`Host` other than its own; a per-session random token on every request that executes something; one step at a time.
- Only step ids declared in `steps.mjs` are executable; command, args and cwd are constants; the only variable value is the commit SHA, validated by `^[0-9a-f]{40}$`.
- Commit message exactly `export from GitHub burndown <sha of 40 chars>`. Never `git switch`. Never `git push` other than `git push origin main`.
- `npm` runs as `cmd.exe /d /s /c npm.cmd …`, never `shell: true`.
- Timeouts: 5 minutes per step, 15 for `stack-start`; on expiry kill the whole process tree.
- Docker: project `ithwg-check`; containers `ithwg-check-db|api|nginx|adminer`; ports 5440, 8190, 8191; frozen in code. `down -v` only after `ps` lists only `ithwg-check-*`. Never `pdash-*`, never the `burndown` project. **No automated test runs Docker.**
- All dashboard text is English; no native `alert`/`confirm` (use `<dialog>`).
- Visual identity: header `#0B1840`, 3px bottom line `#F0287A`, logo `P` magenta + `Dash` white, weight 700, `letter-spacing: -.02em`, plus the `To Prod` tag; `<title>` "PDash To Prod"; primary buttons navy with white text.
- History record `op` values: `repo-check`, `export-list`, `dry-run`, `copy`, `commit`, `push`, `stack-prepare`, `stack-start`, `stack-stop`. Steps `count`, `process-check` and `clone-status` write no record.
- Edit repo files with Edit/Write, never PowerShell `Set-Content` (BOM). Files the dashboard writes are UTF-8 without BOM; parsers must still accept a BOM (the real sample files have one).

## Review Focus

1. Captured output with a UTF-8 BOM or CRLF: every parser still finds `commit <sha>` and the path lines.
2. Paths with spaces or non-ASCII characters in the lists and in `git status`: not split, not quoted (`core.quotepath=off`, `-uall`).
3. A second step request while one runs: refused with 409, nothing started.
4. Page closed or reloaded mid-step: the result is still recorded and `GET /api/state` returns it.
5. `history.jsonl` missing, empty, or ending in a truncated line: the history view still renders and says how many lines were skipped.
6. A dry run with 0 added / 0 modified / 0 deleted: the sequence ends as "nothing to publish" and steps 6-7c stay disabled.
7. `main` moves between two cards (the list's `commit` differs from step 1's): the sequence resets to step 1.

---

## Part A — in `burndown` (worktree `pdash-to-prod`, then `/finish-cycle`)

### Task 1: `--yes --sha` for `export:copy`

**Files:**
- Modify: `scripts/site-export.mjs` (`parseArgs`, `runCopy`, `main`, the header comment and the usage line)
- Test: `scripts/site-export.test.js`
- Modify: `docs/scripts/site-export.md` (replace the «There is no `--yes`» sentence and the Use block)

**Interfaces:**
- Produces: `parseArgs(args, allowed: { dest?, dryRun?, yes? })` — `allowed.yes` enables both `--yes` and `--sha <hex40>`; the result gets `yes: true` and `sha: string` **only when given** (the existing `toEqual` assertions on `{ref, dryRun}` must keep passing).
- Produces: `runCopy({ …, expectedSha?: string })`.

- [ ] **Step 1: Write the failing tests** in `scripts/site-export.test.js`, in the `parseArgs` and `runCopy` blocks, reusing their repo/destination fixtures:
  - `parseArgs(['--yes','--sha',S], {yes:true,dest:true})` → `{ ref:'main', dryRun:false, yes:true, sha:S }` where `S = 'a'.repeat(40)`.
  - `parseArgs(['--yes'], {yes:true})` throws `--yes needs --sha`; `parseArgs(['--sha',S], {yes:true})` throws `--sha needs --yes`; `parseArgs(['--yes','--sha','ABC'], {yes:true})` throws `--sha must be 40 lowercase hex characters`; `parseArgs(['--yes','--sha',S], {})` throws `unknown option: --yes`.
  - `runCopy` with `expectedSha` ≠ resolved sha returns 1, writes nothing, and `out` contains both SHAs (`Refusing to copy: --sha <x> does not match main (<y>)`).
  - `runCopy` with `expectedSha` = resolved sha and `confirm: async () => true` copies.
  - CLI, via `execFileSync(process.execPath, [<abs path of site-export.mjs>, 'copy', …], { cwd: <temp repo>, stdio: ['ignore','pipe','pipe'] })` (no TTY): `--yes --sha <right>` exits 0 and writes the file; `--yes --sha <wrong>` exits 1 and writes nothing; without `--yes` exits 1 with `Refusing to write without an interactive confirmation.`.
- [ ] **Step 2: Run to verify they fail** — `npx vitest run scripts/site-export.test.js`; expected: the new tests fail.
- [ ] **Step 3: Implement.** `parseArgs`: handle `--yes` and `--sha` when `allowed.yes`, validate after the loop in the order above. `runCopy`: first thing after `classifyCommit`, refuse on an `expectedSha` mismatch. `main`: pass `expectedSha: sha`; when `yes`, `confirm` is `async () => true` and `askInTerminal` is not called; `--yes` with `--dry-run` is accepted and still checks the SHA. Update the header comment and the usage line to `copy [ref] [--dest <dir>] [--dry-run] [--yes --sha <sha>]`.
- [ ] **Step 4: Update `docs/scripts/site-export.md`**: Use block gets `npm run export:copy -- --yes --sha <sha>`; step 6 of «What `copy` does» states the rule (`--yes` needs `--sha`, mismatch refuses before writing, nothing else is bypassed).
- [ ] **Step 5: Run to verify they pass** — `npx vitest run scripts/site-export.test.js scripts/site-export-guard.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js`; expected: all pass.
- [ ] **Step 6: Commit** `feat(site-export): --yes --sha for non-interactive copy`.

After Task 1: `/finish-cycle` (merge, push). Tasks 2-9 start only after it.

---

## Part B — `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod\` (no worktree, no `/finish-cycle`)

### Task 2: Scaffold and `parse.mjs`

**Files:**
- Create: `PDash_To_Prod/package.json` (`"type": "module"`, script `"test": "node --test dashboard/test/"`), `dashboard/parse.mjs`, `dashboard/test/parse.test.mjs`, `dashboard/test/fixtures/elenco-2026-11-12-1741.txt` and `prova-2026-11-12-1744.txt` (copies of the real files in `export-liste/`)
- Run `git init` in `PDash_To_Prod` and add a `.gitignore` with `history.jsonl`, `lists/`, `config.json`.

**Interfaces — Produces** (`dashboard/parse.mjs`):
- `stripBom(text: string): string`
- `parseList(text: string): { sha: string|null, include: string[], exclude: string[], unclassified: string[] }` — lines `include|exclude <path>  [<rule> (line N)]`, `commit <sha>`; for `unclassified` read the line format from `runList` in `scripts/site-export.mjs`.
- `processViolations(include: string[]): string[]` — the paths matching any of `^(docs/|\.claude/|scripts/)`, `\.test\.js`, or exactly `CLAUDE.md|PRD.md|test-api.js|vitest.config.js|package.json|package-lock.json|.gitattributes`.
- `parseDryRun(text: string): { sha, destination, added: string[], modified: string[], deleted: string[], warnings: string[], refused: boolean, nothingToDo: boolean }` — `deleted` entries lose the `  (untracked in the destination)` suffix; `refused` when a line starts `Refusing to copy`; `nothingToDo` on `Nothing to do.`.

- [ ] **Step 1: Write the failing tests**: against the fixtures, `parseList` gives sha `ac84f267b1b099bb0b4449f64623f3eb08814c5e`, 224 includes, `unclassified` empty, `processViolations(include)` empty; `parseDryRun` gives `added.length === 224`, `modified`/`deleted` empty, `warnings` empty, `refused` false. Synthetic cases: CRLF input; a path with a space; `warning: …` line; `Refusing to copy: …`; `Nothing to do.`; an include `docs/x.md`, `a.test.js` and `package.json` flagged while `api/package.json` is not.
- [ ] **Step 2: Run** `npm test` in `PDash_To_Prod`; expected FAIL (module missing).
- [ ] **Step 3: Implement** `parse.mjs` per the interfaces (strip BOM, split on `\r?\n`).
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** (local) `feat: parsers for the export outputs`.

### Task 3: `history.mjs`

**Files:** Create `dashboard/history.mjs`, `dashboard/test/history.test.mjs`.

**Interfaces — Produces:**
- `type Rec = { id, runId, ts, durationMs, op, ok, error?, sourceSha?, destSha?, counts?: {added,modified,deleted,include?,exclude?,unclassified?}, files?: {status:'A'|'M'|'D', path}[], artifact? }`
- `appendRecord(file: string, rec: Rec): void` — one JSON line, `appendFileSync`.
- `readHistory(file: string): { records: Rec[], skipped: number }` — missing file or empty → `{records:[],skipped:0}`; an unparsable line counts as skipped.
- `buildExports(records): {runId, ts, sourceSha, destSha, counts, files}[]` — one per `push` with `ok`, joined to the `copy` and `commit` records of the same `runId`; newest first.
- `lastPublished(records): Export|null`; `pending(records, mainSha): {sourceSha, files}|null` — the newest ok `dry-run`, only when its `sourceSha === mainSha`.
- `searchFile(records, query: string): {ts, status, sourceSha, path}[]` — over ok `copy` records, case-insensitive substring.
- `readCloneLog(cloneDir, exec): Promise<{sha, subject}[]>` — `git log origin/main --format=%H%x09%s` in the clone.
- `crossCheck(records, cloneLog): { manualCommits: {sha, subject}[], missingInLog: Rec[] }` — `manualCommits`: subjects matching `^export from GitHub burndown ([0-9a-f]{40})$` whose commit sha is not the `destSha` of any ok `push`; `missingInLog`: ok pushes whose `destSha` is absent.

- [ ] **Step 1: Write the failing tests**: append then read round-trips; truncated last line → `skipped: 1`, records intact; missing file; `buildExports` joins by `runId`; `pending` null when the SHA differs; `searchFile`; `crossCheck` with a fake log; `readCloneLog` against a temporary git repo with two commits.
- [ ] **Step 2: Run** `npm test`; expected FAIL.
- [ ] **Step 3: Implement** per the interfaces.
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** `feat: history store and cross-check`.

### Task 4: `runner.mjs` and `steps.mjs`

**Files:** Create `dashboard/runner.mjs`, `dashboard/steps.mjs`, `dashboard/test/runner.test.mjs`, `dashboard/test/steps.test.mjs`.

**Interfaces — Produces:**
- `runner.mjs`: `wrapCommand(file: string, args: string[]): {file, args}` — for `*.cmd` on win32 returns `{ file: 'cmd.exe', args: ['/d','/s','/c', file, ...args] }`, otherwise unchanged. `run({ file, args, cwd, timeoutMs }, onLine?: (stream:'out'|'err', line:string) => void): Promise<{ code: number|null, stdout: string, stderr: string, timedOut: boolean }>` — `spawn` without shell; on timeout kills the tree (`taskkill /pid <pid> /t /f` on win32, `SIGKILL` otherwise) and resolves `timedOut: true`.
- `steps.mjs`: `STEP_IDS = ['repo-check','export-list','count','process-check','dry-run','copy','clone-status','commit','push']`; `NEEDS_CONFIRM = new Set(['copy','commit','push'])`; `commitMessage(sha: string): string` — throws unless `^[0-9a-f]{40}$`; `cmd` builders returning `{file,args,cwd,timeoutMs}`: `gitStatus(cwd)`, `gitPull(cwd)`, `gitHead(cwd)`, `exportList(burndownDir)`, `exportCopy(burndownDir, cloneDir, { dryRun: true } | { sha })`, `cloneStatus(cloneDir)` (`git -c core.quotepath=off status --porcelain -uall`), `cloneBranch(cloneDir)`, `gitAddAll(cloneDir)`, `gitCommit(cloneDir, sha)`, `gitPush(cloneDir)` (exactly `['push','origin','main']`).

- [ ] **Step 1: Write the failing tests**: `wrapCommand('npm.cmd',['run','-s','export:list'])` on win32; `run` of `node -e` printing to both streams returns both; timeout case with `node -e "setTimeout(()=>{},60000)"` and `timeoutMs: 300` returns `timedOut: true` within 3 s and leaves no child alive; `commitMessage` accepts 40 hex, rejects 39 chars, uppercase, `abc; rm`; `gitPush` args are exactly the constant array; `exportCopy(…, {sha})` contains `--yes`, `--sha <sha>` and `--dest <cloneDir>`; no builder accepts a free-form string except the validated SHA.
- [ ] **Step 2: Run** `npm test`; expected FAIL.
- [ ] **Step 3: Implement** per the interfaces; `exportList` is `npm.cmd run -s export:list` with `cwd: burndownDir`.
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** `feat: runner and step commands`.

### Task 5: `sequence.mjs`, `handlers.mjs`, `controller.mjs`

**Files:** Create `dashboard/sequence.mjs`, `dashboard/handlers.mjs`, `dashboard/controller.mjs`, and `dashboard/test/controller.test.mjs`.

**Interfaces — Consumes:** Task 2 (`parseList`, `processViolations`, `parseDryRun`), Task 3 (`appendRecord`), Task 4 (`STEP_IDS`, `NEEDS_CONFIRM`, builders, `commitMessage`, `run`).

**Interfaces — Produces:**
- `sequence.mjs`: `createSequence(): { runId: string, canRun(id): boolean, complete(id, data), get(id), done(): string[], reset(): void, markNothingToPublish(): void, nothingToPublish: boolean }` — a step can run only when the previous id in `STEP_IDS` completed in this run (`repo-check` always); `reset()` starts a new `runId`.
- `handlers.mjs`: `createHandlers({ config, exec, fsApi, now }): Record<StepId, (seq) => Promise<{ ok: boolean, summary: string, error?: string, data?: object, record?: Partial<Rec> }>>`.
  - `repo-check`: `git status -sb` must be `## main...origin/main` (a `[behind N]` suffix allowed) with no other lines; else stop. `git pull`; then `status -sb` must be exactly `## main...origin/main`; data `{ sha: <git rev-parse HEAD>, subject }`.
  - `export-list`: write stdout to `lists/elenco-<yyyy-MM-dd-HHmm>.txt` (no BOM); ok iff code 0; if the parsed `sha` ≠ `repo-check`'s, the sequence resets and the result says "main changed".
  - `count` and `process-check`: read the parsed list from `export-list`'s data; ok iff `unclassified` is empty / `processViolations` is empty.
  - `dry-run`: `lists/prova-<…>.txt`; ok iff code 0, not `refused`, no `warnings`, and `sha` equals the list's; data `{ sha, added, modified, deleted }`; when all three are empty, `seq.markNothingToPublish()`.
  - `copy`: ok iff code 0 and stdout contains `Copied. Nothing was committed or pushed.`.
  - `clone-status`: `cloneBranch` must be `main`; the set of paths in `status --porcelain` must equal added ∪ modified ∪ deleted of the dry run; data = the A/M/D list (`??`→A).
  - `commit`: if the porcelain is empty, stop ("nothing to commit"); else `git add -A`, `git commit -m commitMessage(sha)`, `rev-parse HEAD` → `destSha`.
  - `push`: ok iff code 0; the full git output is kept in `summary`.
- `controller.mjs`: `createController({ config, exec, fsApi, historyFile, now, newId }): { state(): { runId, steps: Record<StepId, {status:'pending'|'ready'|'running'|'ok'|'failed', summary?, error?}>, running: string|null, nothingToPublish: boolean }, runStep(id, { confirmed?: boolean }): Promise<StepResult> }`. `runStep` throws `{status:409}` if a step is running, `{status:400}` for an unknown id, `{status:409}` if `!seq.canRun(id)` or `nothingToPublish` for `copy|clone-status|commit|push`, `{status:428}` when `NEEDS_CONFIRM.has(id) && !confirmed`; appends one history record for `repo-check|export-list|dry-run|copy|commit|push` (success or failure), carrying `runId`, `sourceSha`, `counts`/`files`, `artifact`, `destSha`, `error`.

- [ ] **Step 1: Write the failing tests** with a fake `exec` keyed by `file+args` and a temp `fsApi` dir: the full happy path 1→7c writes six history records with one shared `runId` and the exact commit message; `repo-check` stops on branch `feature`, on a dirty tree, and on `ahead 1` after the pull; `export-list` with exit 1 stops; `main` changing (list `commit` ≠ step 1) resets the sequence; `process-check` stops with the offending paths; `dry-run` stops on `warning:` and on a different SHA; zero changes → `nothingToPublish` and `copy` refused with 409; `clone-status` stops when the clone has an extra path; `commit` with empty porcelain makes no commit and no record claiming success; a second `runStep` while one is pending rejects with 409; an unconfirmed `copy` rejects with 428 and runs nothing; a failing `push` records `ok: false` with `error`.
- [ ] **Step 2: Run** `npm test`; expected FAIL.
- [ ] **Step 3: Implement** `sequence.mjs`, `handlers.mjs`, `controller.mjs` per the interfaces; `controller` serialises with a `running` flag cleared in `finally`.
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** `feat: sequence, handlers and controller`.

### Task 6: `docker.mjs`

**Files:** Create `dashboard/docker.mjs`, `dashboard/test/docker.test.mjs`.

**Interfaces — Produces:** `DOCKER = Object.freeze({ project: 'ithwg-check', prefix: 'ithwg-check-', ports: [5440, 8190, 8191], url: 'http://localhost:8190/login.html' })`; `overrideYml(): string` (the YAML of `PDASH_SCRIPT_BITBUCKET.txt`, container names `ithwg-check-db|api|nginx|adminer`, ports `5440:5432`, `8190:80`, `8191:8080`); `composeArgs(cloneDir, overridePath, tail: string[]): string[]` (`compose -p ithwg-check --project-directory <cloneDir> -f <cloneDir>\docker-compose.yml -f <overridePath> …tail`); `prepareStack({ cloneDir, overridePath, fsApi, randomHex }): { envCreated: boolean }` (writes `.env` from `.env.example` with `POSTGRES_PASSWORD=prova123` and `JWT_SECRET=<random>` only if `.env` is absent; always rewrites the override file); `startStack({ cloneDir, overridePath, exec, isPortFree }): Promise<Result>` (refuses with the busy port named; then `up -d --build`, 15-minute timeout); `stackStatus({ cloneDir, overridePath, exec }): Promise<{ containers: {name, state, health}[], healthy: boolean }>`; `stopStack({ …, exec }): Promise<Result>` (runs `ps` first; refuses unless every container name starts with `ithwg-check-` and at least one exists or the list is empty; then `down -v`).

- [ ] **Step 1: Write the failing tests** with a fake `exec`: `DOCKER` is frozen; `composeArgs` begins `compose -p ithwg-check`; `startStack` refuses on a busy port 8190 and runs nothing; `stopStack` refuses when `ps` reports `pdash-db`, and accepts only `ithwg-check-*`; no argument anywhere contains `pdash-` or the `burndown` project name; `prepareStack` does not overwrite an existing `.env`.
- [ ] **Step 2: Run** `npm test`; expected FAIL.
- [ ] **Step 3: Implement** per the interfaces; the override file is written to `PDash_To_Prod/override-check.yml`.
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** `feat: verification stack module`.

### Task 7: `server.mjs`, config, launcher

**Files:** Create `dashboard/server.mjs`, `dashboard/test/server.test.mjs`, `start-dashboard.cmd`, `config.example.json` (and the real `config.json`, ignored by git, with `burndownDir`, `cloneDir`, `port`).

**Interfaces — Consumes:** `controller` (Task 5), `docker` (Task 6), `history` (Task 3).

**Interfaces — Produces:** `loadConfig(path): Config` (throws a message naming the missing key); `checkStartup(config, { exec, isPortFree }): Promise<string[]>` (list of problems: Node < 20, either dir not a git repo, port busy); `createServer({ config, controller, docker, history, token, publicDir }): http.Server`. Routes: `GET /` (serves `index.html` with `__TOKEN__` replaced), `GET /api/state` (controller state, stack status, history summary, cross-check, pending, last published), `GET /api/history?file=<q>`, `GET /api/events` (SSE log lines), `POST /api/step/:id` body `{confirmed}`, `POST /api/stack/:action` (`prepare|start|stop`) body `{confirmed}` (`stop` needs it). Every request: `Host` must be `127.0.0.1:<port>` or `localhost:<port>`, an `Origin` header if present must equal the same; every `POST` needs header `x-pdash-token`. Errors map `controller` statuses (400/409/428) to HTTP; unknown paths 404. `start-dashboard.cmd` runs `node dashboard\server.mjs` and opens the browser.

- [ ] **Step 1: Write the failing tests** against a real `http` server on port 0 with a fake controller: foreign `Origin` → 403; foreign `Host` → 403; POST without token → 403; unknown step id → 400; a second POST while the fake controller reports a running step → 409; unconfirmed copy → 428; `GET /` carries the token and not the placeholder; `GET /api/state` still answers while a step is running; `checkStartup` returns a problem for a busy port and for a non-git directory.
- [ ] **Step 2: Run** `npm test`; expected FAIL.
- [ ] **Step 3: Implement** per the interfaces; SSE writes `data: {"stream","line"}` per output line; on `checkStartup` problems the process prints them and exits 1.
- [ ] **Step 4: Run** `npm test`; expected PASS.
- [ ] **Step 5: Commit** `feat: server, startup checks and launcher`.

### Task 8: `index.html` and `brand.css`

**Files:** Create `dashboard/index.html`, `dashboard/brand.css`.

Page structure: header per the Global Constraints (logo `P`+`Dash`, `To Prod` tag, SVG favicon with the `P`); three views switched in-page — **Export** (the nine cards in `STEP_IDS` order, each with status chip, summary, a Run button disabled unless the card is `ready` and nothing runs, a live log from SSE, A/M/D tables for the dry run and the clone status), **History** (Last published banner, Pending panel, cross-check box, chronological table with operation/outcome filters, expandable rows with the file list and a link to `lists/<file>` or "file missing", file search), **Verification stack** (Prepare, Start, Stop and remove, container states, link to `http://localhost:8190/login.html`). Copy, Commit, Push and Stop open a `<dialog>` that shows the summary (the A/M/D counts, the destination, the commit message) with Confirm/Cancel. The page polls `GET /api/state` every 2 s and on SSE events, and sends the token from `<meta name="pdash-token">`. A fixed footer note: "From 2026-11-30 Bitbucket blocks the old Git Credential Manager." `brand.css` holds the token subset (navy, magenta, steel-blue scale, greys, borders, system font stack, type scale), buttons, chips (green/red/amber), tables, dialog.

- [ ] **Step 1: Write the page and stylesheet** per the structure above.
- [ ] **Step 2: Add `dashboard/test/ui.test.mjs`**: reads `index.html` and asserts the title "PDash To Prod", the `__TOKEN__` placeholder, the `To Prod` tag, all nine step ids, no `alert(`/`confirm(`, and that `brand.css` defines `#0B1840` and `#F0287A`. Run `npm test`; expected PASS.
- [ ] **Step 3: Visual check.** Start the server against the real repos, render the Export, History and Verification views with Chrome headless at widths 1280 and 820 (`--headless --screenshot --window-size`), read the PNGs back and compare the header, logo, `To Prod` tag, buttons and chips with `.pd-logo`/`.pd-nav-brand` in `burndown/css/style.css` (and with `login.html` on the main stack if it answers). Fix differences in `brand.css`.
- [ ] **Step 4: Commit** `feat: dashboard page and brand`.

### Task 9: Folder move, README, manual end-to-end

**Files:** Move `export-liste/` contents into `PDash_To_Prod/lists/` and remove the empty folder; create `PDash_To_Prod/README.md`; modify `C:\Users\Fabrizio.Fortini\OneDrive - EVERSANA\Desktop\PDASH_SCRIPT_BITBUCKET.txt` (paths `export-liste` → `PDash_To_Prod\lists`).

- [ ] **Step 1:** Rename `export-liste` → `PDash_To_Prod` if the folder holds nothing else, otherwise move its two files into `PDash_To_Prod\lists\`; confirm `override-check.yml` is regenerated, not copied.
- [ ] **Step 2:** `README.md`: start (`start-dashboard.cmd`), `config.json` keys, the nine steps with their stop conditions, history files, the verification stack, "push local `main` before exporting: step 1 requires exactly `## main...origin/main`", the 2026-11-30 credential note.
- [ ] **Step 3:** Update `PDASH_SCRIPT_BITBUCKET.txt` with Edit; keep every instruction, change only the paths.
- [ ] **Step 4: Manual verification by the user, one item at a time:** start the dashboard; run steps 1-5 (`lists/` gets the two files, Pending shows the dry-run list); run Copy only after the user confirms; run Clone status, Commit and Push only with the user's go for each; start and then stop the verification stack and check `docker ps` shows no `pdash-*` change; add a commit by hand in the clone and check the cross-check box flags it.
- [ ] **Step 5: Commit** (local, in `PDash_To_Prod`) `docs: README and migration of the export folder`.

---

## Decisioni aperte

1. **Un solo piano per le due consegne.** Alternativa scartata: due piani, uno per il flag e uno per la dashboard. Perché: la spec è una sola e la Parte B dipende dal flag; la Parte B però non passa da `/finish-cycle`, lo dichiara l'intestazione.
2. **`count`, `process-check` e `clone-status` non scrivono record nello storico.** Alternativa scartata: un record per ogni scheda. Perché: sono letture derivate dai file già registrati e la spec elenca un insieme chiuso di operazioni.
3. **Una prova a secco con 0/0/0 chiude la sequenza come «nothing to publish» e disabilita i passi 6-7c.** Alternativa scartata: lasciarli eseguire (copia vuota, commit rifiutato). Perché: evita un commit e un push senza contenuto e rende lo stato leggibile.
4. **La verifica visiva usa Chrome headless direttamente, non `scripts/shoot.mjs`.** Alternativa scartata: estendere `shoot.mjs`. Perché: lo strumento è pensato per le pagine dell'app e la dashboard sta fuori dal repo.
5. **Il token e i controlli `Origin`/`Host` valgono per le `POST` e per l'`Host` di ogni richiesta; le `GET` non richiedono il token.** Alternativa scartata: token anche sulle `GET`. Perché: le `GET` non eseguono nulla e restano protette dal controllo `Host` contro il DNS rebinding.
6. **Il passo 5 si ferma su qualunque `warning:`, anche quello su `origin/main` non aggiornato.** Alternativa scartata: ignorare i warning noti. Perché: il file di istruzioni dell'utente dice di fermarsi a ogni avviso.
