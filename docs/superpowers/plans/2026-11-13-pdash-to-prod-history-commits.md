# PDash To Prod History Commits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Under every pushed export in the History view, and in the "Pending" block, the list of the burndown commits that export carries (short hash and subject).

**Architecture:** A read-only `gitLogRange` command in `steps.mjs`, a pure parser in `history.mjs`, the service attaches `commits` to each export, to the matching `push` record and to `pending`, and the page prints them.

**Tech Stack:** Node ≥ 20, `node:test` (`npm test` in `PDash_To_Prod`), plain HTML/JS page.

**Spec:** `docs/superpowers/specs/2026-11-13-pdash-to-prod-history-commits-design.md`
**Branch:** `main` (no branch, no worktree: direct commits, the user's instruction of 2026-11-13; all code lives in the panel repository `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod`)
**Risk class:** low-risk — no high-risk category applies (no migration, auth, money, shared page file, destructive operation or Docker command); the only new command is a read-only `git log` with a validated range.

**Task independence:** Tasks 1 → 2 → 3 in order (each consumes the previous interface); Task 4 last. Native execution.

## Global Constraints

- All text on the page is English. No new dependency; `docker.mjs` untouched; `history.jsonl` never rewritten.
- Edit files with Edit/Write; never put backslashes through `node -e` or shell heredocs (they were lost twice in this project): scripts with regexes or paths go in files, or are written with the Edit tool.
- Commits in the panel repository with a `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` trailer. Push only after the final review, and only because the user authorised it for this cycle's predecessors: ask once at the end.

## Review Focus

1. **A rewritten history:** a `sourceSha` that no longer exists in `burndown` makes `git log` fail; the export shows "Commits unavailable" and the rest of the history still loads. Pinned by a Task 2 test.
2. **Many exports:** the log is read once per export on every load; with a failing or slow git the history must still answer. Each call has the standard timeout, and a failure of one export does not affect the others. Pinned by a Task 2 test.
3. **A merge commit as the only commit:** the list shows it (it is the cycle's name), not nothing; `git log` default shows merges. Pinned by the Task 1 parser test with a merge subject.
4. **A subject with a tab or a very long text:** the parser splits on the first tab only and the page prints text, never HTML. Pinned by a Task 1 test and the existing `textContent` rendering.

---

### Task 1: The read-only command and the parser

**Files:**
- Modify: `dashboard/steps.mjs`, `dashboard/history.mjs`
- Test: `dashboard/test/steps.test.mjs`, `dashboard/test/history.test.mjs`

**Interfaces:**
- Produces: `export const COMMIT_LIMIT = 20`; `export function gitLogRange(cwd: string, fromSha: string, toSha: string): { file: 'git', args: string[], cwd: string, timeoutMs: number }` in `steps.mjs` — runs `git log --format=%h%x09%s -n 21 <from>..<to>` (21 = limit + 1, to know whether there are more); both SHAs validated with the existing `assertSha` (throws `/sha/i`). `export function parseCommitLog(stdout: string, limit?: number): { commits: { sha: string, subject: string }[], more: boolean }` in `history.mjs`: splits lines, each at its first tab, keeps at most `limit` (default 20), `more` true when there were more lines than `limit`.

- [ ] **Step 1: Write the failing tests.** In `steps.test.mjs`: `gitLogRange(BD, A, B)` equals `{ file: 'git', args: ['log', '--format=%h%x09%s', '-n', '21', `${A}..${B}`], cwd: BD, timeoutMs: 300000 }` for two valid 40-hex SHAs, and throws `/sha/i` for an invalid first or second SHA, for `'HEAD'` and for a SHA followed by `..other`. In `history.test.mjs`: `parseCommitLog('abc1234\tMerge branch \'user-manual\'\nbcd2345\tdocs(manual): pipeline and offers\n')` returns two commits with `sha`/`subject` and `more: false`; a subject containing a tab keeps everything after the first tab; 21 lines with the default limit give 20 commits and `more: true`; 20 lines give `more: false`; empty output gives `{ commits: [], more: false }`; blank lines are ignored.
- [ ] **Step 2: Run** `node --test dashboard/test/steps.test.mjs dashboard/test/history.test.mjs`. Expected: the new tests FAIL (exports missing).
- [ ] **Step 3: Implement** both functions as specified.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: read-only git log command and parser for the commits of an export`.

### Task 2: The service attaches the commits

**Files:**
- Modify: `dashboard/history.mjs`, `dashboard/services.mjs`
- Test: `dashboard/test/history.test.mjs`, `dashboard/test/services.test.mjs`

**Interfaces:**
- Consumes: `gitLogRange`, `parseCommitLog` (Task 1).
- Produces: `buildExports` entries gain `id` (the push record's id); `createHistoryService(...).summary()` returns, for each export in `exports`, `commits: { commits, more } | { unavailable: true } | null`; the push record of the same `id`, in `records` and in `sessions[*].records`, carries the same `commits`; `pending` carries `commits` computed from `lastPublished.sourceSha` to `pending.sourceSha` (`null` when there is no published export).

- [ ] **Step 1: Write the failing tests.** `history.test.mjs`: `buildExports` entries have `id`. `services.test.mjs` with a fake `exec` that answers `git log … A..B` from a table and `git rev-parse main` / the clone log as the existing summary tests do: (a) two pushed exports (sourceShas A then B, in that order): the newer export's `commits` is what `A..B` returned and the older export's is `null`; the newer push record in `records` and in `sessions` carries it (Review Focus: first export); (b) an exec that fails for `A..B` gives `{ unavailable: true }` for that export and the other exports and the rest of the summary are intact (Review Focus 1, 2); (c) a pending dry run on the current main with a published export gives `pending.commits` from `lastPublished.sourceSha..pending.sourceSha`, and `null` when nothing was published; (d) a merge-commit-only range is returned as one commit (Review Focus 3).
- [ ] **Step 2: Run** `node --test dashboard/test/history.test.mjs dashboard/test/services.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** in `services.mjs`: a helper `readCommits(from, to)` that runs `gitLogRange(config.burndownDir, from, to)` through `exec`, returns `parseCommitLog(stdout)` or `{ unavailable: true }` on a non-zero exit or a thrown error (including an invalid SHA); build `commits` per export from the next older export's `sourceSha`; attach by `id`; compute `pending.commits`. Add `id` to `buildExports` entries.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: the history service lists the burndown commits of each export and of the pending one`.

### Task 3: The view

**Files:**
- Modify: `dashboard/index.html`
- Test: `dashboard/test/ui.test.mjs`

**Interfaces:**
- Consumes: `r.commits` on push records and `d.pending.commits` from `GET /api/history` (Task 2).

- [ ] **Step 1: Write the failing page tests** (string markers like the existing ones): the page source has a function that draws a commit list and the strings `Commits`, `Commits unavailable` and `… and more`; the detail row builder uses it for `r.commits`, and the Pending block uses it for `d.pending.commits`.
- [ ] **Step 2: Run** `node --test dashboard/test/ui.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `commitList(c)` in `index.html` returning `null` for `null`/`undefined`, a muted "Commits unavailable" paragraph for `unavailable`, otherwise a heading "Commits" and one line per commit (`<code>sha</code> subject`, via `textContent`), plus a muted "… and more" line when `more`. Call it in the `historyRows` detail row (push records) and in the Pending block.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Look at it.** With the jsdom script used for the previous cycle (`JSDOM.fromURL` against a panel instance started with `--config` on a scratch folder holding a copy of `history.jsonl`, port 4178), confirm that the detail of the last push lists burndown commits and that the Pending block lists commits after a dry run (a `repo-check`/dry-run may be refused on a dirty or ahead repository: then check the export lists only and say so). Stop the instance afterwards.
- [ ] **Step 6: Commit** `feat: History view shows the commits of each export`.

### Task 4: README and closing checks

**Files:**
- Modify: `README.md` (the "History" paragraph: the commits under each pushed export and in Pending, limit of 20)

- [ ] **Step 1: Edit** the README paragraph.
- [ ] **Step 2: Run** `npm test` in `PDash_To_Prod`, and `npx vitest run scripts/decision-ledger-guard.test.js scripts/doc-paths-guard.test.js` in `burndown`. Expected: all PASS.
- [ ] **Step 3: Check** `git diff --stat` in `burndown` shows only this spec and plan for the cycle (spec criterion 5).
- [ ] **Step 4: Commit** `docs: README for the commits in the history`.

---

## Decisioni aperte

1. **Il controllo dell'intervallo illeggibile sta nel servizio, non nel comando.** Alternativa scartata: controllare l'esistenza dello SHA prima. Perché: un `git log` che fallisce dice già tutto e non aggiunge una chiamata.
2. **Un test di pagina a marcatori più la prova in jsdom, come nel ciclo precedente.** Alternativa scartata: un harness del DOM nel pannello. Perché: il pannello non ha dipendenze e la logica sta nelle funzioni pure e nel servizio, già provati.
3. **Classe `low-risk` e modalità nativa.** Alternativa scartata: `standard`. Perché: nessuna categoria di §6.1b, nessuna route dell'app, nessun file di processo; quattro task sequenziali (§6.1).
