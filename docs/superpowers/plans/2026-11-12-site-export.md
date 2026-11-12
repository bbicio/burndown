# Site export (classification + copy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A versioned path-rule list classifies every tracked file as site or process; `npm run export:list` shows the verdicts for a commit, `npm run export:copy` copies the site files of a commit into the local Bitbucket clone after confirmation; a guard test keeps the list complete.

**Architecture:** A pure module `scripts/lib/site-export.mjs` parses `scripts/site-export.rules` and classifies paths and plans a copy; a CLI `scripts/site-export.mjs` does the git and filesystem work (read blobs from a commit, validate and read the destination, write after confirmation). `scripts/site-export-guard.test.js` feeds the real tracked files to the same module.

**Tech Stack:** Node ≥ 24 ESM (`.mjs`), `git` via `execFileSync`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-site-export-classification-design.md`
**Branch:** `site-export`
**Risk class:** high-risk — destructive operations: the copy command deletes files in a folder outside the repo (§6.1b); it also touches `scripts/`.

**Task independence:** the four tasks are sequential (each uses the previous one's exports); none is independent. By §6.1: 7 files, no migration, no API, strongly sequential tasks → **native**.

## Global Constraints

- Classification by path only, never by content.
- One definition of the list: `scripts/site-export.rules`, read by the CLI and the guard.
- The command never runs `git commit` or `git push`, never writes into the destination's `.git`, never writes into the source repo.
- A destination must be the root of a git clone separate from the source repo (not its worktree, not inside it); path comparisons after `realpath`.
- No `--yes` flag; the copy asks `y/N` and refuses without an interactive terminal.
- Contents are the blob bytes of the commit; no line-ending conversion on write.
- No credential, no personal path in the repo; the destination comes from `--dest` or `PDASH_EXPORT_DEST`.
- No bundling, no change to any existing file of the site (the only modified existing file is the root `package.json`).
- User-visible text is English.

## Review Focus

1. A destination whose text files are CRLF (the clone has `core.autocrlf=true`): a second copy must report nothing, not every file as modified. Pinned in Task 1.
2. A ref that does not exist, or a destination that is an empty folder without `.git`: a clear error and nothing written. Pinned in Task 3.
3. A new tracked file no rule covers: `list` shows it as `unclassified` and exits 1; `copy` refuses. Pinned in Task 3.
4. A stray untracked file and a gitignored file in the destination: the first is listed under deleted and removed, the second is left alone. Pinned in Task 4.
5. A file name with spaces or non-ASCII characters in the source commit: copied intact (`-z` and `cat-file --batch` everywhere, no line parsing of quoted paths). Pinned in Task 3.

---

### Task 1: Pure module — rules, classification, copy plan

**Files:**
- Create: `scripts/lib/site-export.mjs`
- Test: `scripts/lib/site-export.test.js`

**Interfaces:**
- Produces:
  - `parseRules(text: string): Rule[]`, `Rule = { action: 'include' | 'exclude', pattern: string, line: number, re: RegExp }`. Blank lines and `#` lines skipped; any other directive, or a missing pattern, throws `Error('site-export.rules:<line>: <reason>')`.
  - `classify(paths: string[], rules: Rule[]): { path: string, verdict: 'include' | 'exclude' | 'unclassified', rule: Rule | null }[]` — same order as `paths`, first matching rule wins.
  - `planCopy(wanted: Map<string, Buffer>, existing: Map<string, Buffer>): { added: string[], modified: string[], deleted: string[] }` — each list sorted.
  - `describeRule(rule: Rule | null): string` → `'include js/ (line 12)'`, or `'no rule'` for `null`.

Glob semantics (anchored on the whole path): `**/` matches zero or more directories, `**` any characters including `/`, `*` any characters but `/`, `?` one character but `/`, every other character literal; a pattern ending in `/` means that directory and everything below it.

- [ ] **Step 1: Write the failing tests** in `scripts/lib/site-export.test.js`, with these cases (assertions as written):
  - `parseRules('# c\n\ninclude js/\nexclude **/*.test.js\n')` has two rules, lines 3 and 4; `parseRules('keep js/')` throws a message containing `site-export.rules:1`; `parseRules('include')` throws.
  - Glob: `include js/` matches `js/core.js` and `js/lib/a.js`, not `jsx/a.js`; `exclude **/*.test.js` matches `a.test.js` and `js/lib/a.test.js`; `include *.html` matches `login.html`, not `js/x.html`; `include package.json` matches `package.json`, not `api/package.json`.
  - `classify(['js/lib/a.test.js', 'js/lib/a.js', 'docs/x.md'], parseRules('exclude **/*.test.js\ninclude js/\n'))` → `exclude` (rule line 1), `include` (line 2), `unclassified` (rule `null`).
  - `planCopy` with `wanted = {a: 'x', b: 'y'}` and `existing = {b: 'z', c: 'w'}` → `{ added: ['a'], modified: ['b'], deleted: ['c'] }`.
  - **Review Focus 1:** `planCopy` with `wanted = {a: 'l1\nl2\n'}` and `existing = {a: 'l1\r\nl2\r\n'}` → all three lists empty; the same with a buffer containing a NUL byte differing only in `\r\n` → `modified: ['a']`.
  - `describeRule(null)` is `'no rule'`.

- [ ] **Step 2: Run to verify failure:** `npx vitest run scripts/lib/site-export.test.js` — FAIL, module not found.

- [ ] **Step 3: Implement the four exports in `scripts/lib/site-export.mjs`.** Glob → one `RegExp` per rule at parse time. `planCopy` compares buffers with `Buffer.equals`; when unequal and neither buffer contains a NUL byte, retry the comparison after replacing `\r\n` by `\n` in both.

- [ ] **Step 4: Run to verify pass:** same command — PASS.

- [ ] **Step 5: Commit** — `git add scripts/lib/site-export.mjs scripts/lib/site-export.test.js && git commit -m "feat(site-export): rule parser, classifier and copy planner"`.

---

### Task 2: The rule list and its guard test

**Files:**
- Create: `scripts/site-export.rules`
- Create: `scripts/site-export-guard.test.js`

**Interfaces:**
- Consumes: `parseRules`, `classify`, `describeRule` (Task 1).
- Produces: `scripts/site-export.rules`, read by Task 3's CLI.

- [ ] **Step 1: Write the failing guard test** `scripts/site-export-guard.test.js`. Header comment states the limit of Spec §2.5 (a new file under a block-included path such as `js/` enters without a decision unless it matches a never-included path; the guard checks an invariant, not the correctness of the classification) and names the spec. Cases:
  - `live list covers every tracked file`: `git ls-files -z` of the repo → `classify` → no `unclassified`; the failure message lists the paths and says "classify it in scripts/site-export.rules".
  - `no process file is included`: the constant `NEVER_INCLUDED` (a list of globs, built through `parseRules` as `exclude` lines so it uses the same matcher): `docs/`, `.claude/`, `scripts/`, `**/*.test.js`, `**/*.spec.js`, `test-api.js`, `vitest.config.js`, `CLAUDE.md`, `PRD.md`, `.gitattributes`, `package.json`, `package-lock.json`, `api/nodemon.json`, `api/src/scripts/`, `api/src/trust-device.js`, `api/src/db/reset-dev.sql`. No tracked file matching one of them may have verdict `include`.
  - `synthetic: a file outside every rule is unclassified` — `classify(['brand-new-dir/x.js'], <live rules>)` → `unclassified`; `classify(['css/new.css'], <live rules>)` → `include`.
  - `synthetic: a process file wrongly included is caught` — the never-included check, run over `['docs/x.md']` with the rules `include docs/`, reports a violation (the check is a function `neverIncludedViolations(paths, rules)` inside the test file, used by both the live case and this one).

- [ ] **Step 2: Run to verify failure:** `npx vitest run scripts/site-export-guard.test.js` — FAIL, rules file missing.

- [ ] **Step 3: Create `scripts/site-export.rules`.** Header comment: first match wins; no catch-all, a tracked path no rule covers is unclassified and fails the guard. Section "never part of the site", in this order: `exclude docs/`, `.claude/`, `scripts/`, `**/*.test.js`, `**/*.spec.js`, `CLAUDE.md`, `PRD.md`, `test-api.js`, `vitest.config.js`, `package.json`, `package-lock.json`, `.gitattributes`, `api/nodemon.json`, `api/src/scripts/`, `api/src/trust-device.js`, `api/src/db/reset-dev.sql` (one-line comments for the non-obvious ones: reset-dev wipes dev data and carries a personal email; trust-device is used only by excluded scripts; `.gitattributes` only carries the `.sh` rule). Section "the site": `include *.html`, `css/`, `js/`, `handbook/`, `api/Dockerfile`, `api/package.json`, `api/package-lock.json`, `api/src/`, `nginx.conf`, `docker-compose.yml`, `.env.example`, `.gitignore` (comment: `two-step-code.js`/`cli-env.js` are under `api/src/` on purpose; compose, nginx, `api/package.json`, `.env.example` are included as they are, cleaning is a later cycle).

- [ ] **Step 4: Run to verify pass:** same command — PASS. If the live case reports an unclassified file, add the rule that classifies it (and tell the user); do not widen a rule to hide it.

- [ ] **Step 5: Commit** — `git add scripts/site-export.rules scripts/site-export-guard.test.js && git commit -m "feat(site-export): classification rules and guard test"`.

---

### Task 3: CLI — source side and `list`

**Files:**
- Create: `scripts/site-export.mjs`
- Test: `scripts/site-export.test.js`

**Interfaces:**
- Consumes: Task 1 exports; `scripts/site-export.rules`.
- Produces (named exports of `scripts/site-export.mjs`, used by Task 4):
  - `resolveCommit(repo: string, ref: string): string` — full SHA; throws `Error('unknown ref: <ref>')`.
  - `listCommitPaths(repo: string, sha: string): string[]` — `git ls-tree -r -z --name-only`.
  - `readBlobs(repo: string, sha: string, paths: string[]): Map<string, Buffer>` — one `git cat-file --batch` process.
  - `loadRules(): Rule[]` — parses `site-export.rules` from the folder of this module (`import.meta.url`), not from the commit being exported: the list is the tool's own configuration (see ledger 5).
  - `runList({ repo, ref, out }): number` — writes to `out(line: string)`; returns the exit code (0, or 1 when anything is unclassified).
  - `main(argv: string[]): Promise<number>` — dispatches `list` / `copy` (copy arrives in Task 4); `if (import.meta.url === pathToFileURL(process.argv[1]).href)` runs it and sets `process.exitCode`.
- Output format of `list`: first line `commit <sha>`; then one line per file `include|exclude|unclassified <path>  [<describeRule>]`, includes first, then excludes, then unclassified, each sorted.

- [ ] **Step 1: Write the failing tests** in `scripts/site-export.test.js`. A helper `makeRepo(files: Record<string, string | Buffer>): string` creates a temp dir (`os.tmpdir()`), `git init -b main`, sets `user.name`/`user.email` locally, writes the files, commits, and returns the path; temp dirs are removed in `afterAll`. The rules come from the real list (the CLI reads them from this repo's `scripts/`), so the fixtures use real paths. Cases:
  - `list prints the sha and a rule for every file`: repo with `login.html`, `js/core.js`, `js/core.test.js`, `docs/a.md`; the output's first line is `commit <40-hex sha>`; `login.html` and `js/core.js` are `include`, the other two `exclude`, each line ends with `[include *.html (line N)]`-style text; exit code 0.
  - **Review Focus 3:** add `mystery/file.txt` → a line `unclassified mystery/file.txt  [no rule]` and exit code 1.
  - `list reads the commit, not the working tree`: after the commit, write an untracked `js/untracked.js` and modify `js/core.js` without committing → `untracked.js` absent from the output.
  - **Review Focus 2 (ref):** `resolveCommit(repo, 'nope')` throws `unknown ref: nope`.
  - **Review Focus 5:** a repo with `js/my file é.js`; `readBlobs` returns a map whose key is exactly that path and whose bytes equal the written ones.

- [ ] **Step 2: Run to verify failure:** `npx vitest run scripts/site-export.test.js` — FAIL.

- [ ] **Step 3: Implement the exports above.** `git` calls through `execFileSync('git', ['-C', repo, …])` with `maxBuffer` raised; `readBlobs` writes `<sha>:<path>\n` lines to the `cat-file --batch` stdin and parses `<oid> blob <size>\n<bytes>\n` records.

- [ ] **Step 4: Run to verify pass:** same command — PASS.

- [ ] **Step 5: Commit** — `git add scripts/site-export.mjs scripts/site-export.test.js && git commit -m "feat(site-export): list command and commit reader"`.

---

### Task 4: CLI — destination, `copy`, npm scripts, manual stack check

**Files:**
- Modify: `scripts/site-export.mjs`
- Modify: `scripts/site-export.test.js`
- Modify: `package.json` (root; scripts only)

**Interfaces:**
- Consumes: Task 1 and Task 3 exports.
- Produces (named exports of `scripts/site-export.mjs`):
  - `resolveDest(repo: string, dest: string | undefined, env: NodeJS.ProcessEnv): string` — the `realpath` of `dest ?? env.PDASH_EXPORT_DEST`; throws, with a message naming the reason, when neither is given, when it is not the root of a git clone (`git rev-parse --show-toplevel` ≠ itself), when it equals the source repo's top level, is inside it, or shares its `git rev-parse --git-common-dir`.
  - `readDestFiles(dest: string): Map<string, Buffer>` — files from `git ls-files -co --exclude-standard -z` in `dest` (so ignored files are never listed).
  - `applyPlan(dest: string, wanted: Map<string, Buffer>, plan): void` — writes added and modified files (creating folders), deletes the deleted files and then any folder the deletion left empty (never above `dest`, never `.git`).
  - `runCopy({ repo, ref, dest, env, dryRun, confirm, out }): Promise<number>` — `confirm(summary: { sha, added, modified, deleted }): Promise<boolean>`; order: resolve commit, classify (a nonzero `unclassified` count → print them, return 1, write nothing), read blobs of the included files, resolve and read the destination, `planCopy`, print the summary (sha, a warning line when the sha is not an ancestor of `origin/main` or `origin/main` is missing, then the three lists), return 0 if `dryRun` or if nothing differs, else call `confirm`; on `false` return 0 without writing; on `true` `applyPlan`.
  - `main` handles `copy [ref] [--dest <dir>] [--dry-run]`; its `confirm` reads one line from stdin only when `process.stdin.isTTY && process.stdout.isTTY` and accepts `y`/`yes`; otherwise it prints `Refusing to write without an interactive confirmation.` and returns 1 (the dry-run needs no terminal).

- [ ] **Step 1: Write the failing integration tests** (source repo from `makeRepo`; destination = a second `makeRepo({ '.keep': '' })` cleared of tracked content as needed, or an empty clone; `confirm` injected as `async () => true`):
  - `copy into an empty destination makes its file list equal the included set` (Spec criterion 2): the destination's `git ls-files -co --exclude-standard` equals the sorted included paths of `list` for that commit.
  - `a second copy of the same commit changes nothing`: second `runCopy` reports empty lists and `confirm` is never called.
  - `a file deleted in the source is deleted in the destination` (and its emptied folder is gone).
  - **Review Focus 4:** a stray untracked `stray.txt` in the destination appears in `deleted` and is removed; a gitignored `node_modules/x.js` (with a destination `.gitignore` of `node_modules/`) is left in place.
  - `dry run writes nothing`: with `dryRun: true` the destination is byte-identical before and after and `confirm` is not called; with `confirm` returning `false` also nothing is written.
  - `uncommitted and gitignored source files never reach the copy` (Spec criterion 5): an untracked `js/untracked.js`, a modified-but-uncommitted `js/core.js`, and an ignored file in the source working tree; the destination holds the committed `core.js` bytes and no other.
  - `the destination's .git and history are untouched`: `git rev-parse HEAD` and the content of `.git/HEAD` equal before and after; no new commit.
  - **Review Focus 2 (dest):** `resolveDest` throws for: no dest and no env; an empty folder without `.git`; the source repo itself; a folder inside the source repo; a linked worktree of the source (`git worktree add`); it accepts `env.PDASH_EXPORT_DEST` when `dest` is undefined.
  - `an unclassified file makes copy refuse`: source with `mystery/file.txt` → return code 1, destination untouched.
  - **Review Focus 1:** the destination holds a CRLF version of a text file → reported nothing to do.

- [ ] **Step 2: Run to verify failure:** `npx vitest run scripts/site-export.test.js` — FAIL.

- [ ] **Step 3: Implement the exports above and add to `package.json` scripts:** `"export:list": "node scripts/site-export.mjs list"`, `"export:copy": "node scripts/site-export.mjs copy"`. Nothing else in `package.json` changes (the guard treats root `package.json` as process; it is never copied).

- [ ] **Step 4: Run the new tests, then the whole suite:** `npx vitest run scripts/site-export.test.js scripts/site-export-guard.test.js scripts/lib/site-export.test.js` — PASS; then `npm test` — PASS (the existing guards `doc-paths-guard`, `claude-md-guard`, `decision-ledger-guard` included; if one fails because of the new files or this plan's paths, fix the cause or report it).

- [ ] **Step 5: Real-data dry run (no write):** `PDASH_EXPORT_DEST=C:\Users\Fabrizio.Fortini\Progetti\it_hwg_pdash npm run export:copy -- --dry-run` (the path is typed in the shell, never in a file). Expected: the sha of `main`, no `unclassified`, every included file under `added`, nothing under `deleted`. Also `npm run export:list` and check by eye that no file of `docs/`, `.claude/`, `scripts/` or any test appears under `include`.

- [ ] **Step 6: Manual stack check (Spec §2.6, criterion 7) — only after the user confirms the real copy.** Ask the user whether to run the real `export:copy` into `it_hwg_pdash`; it is a confirm-first write outside the repo. For the stack check use a **temporary** folder (`export:copy --dest <tmp clone>` of an empty `git init`), not `it_hwg_pdash`: write an override file in the temp folder with distinct container names, project name `site-export-check`, and ports that collide with neither the main stack nor `scripts/test-branch.sh`'s (5433/3001/8081/8082/8083); fill `.env` from `.env.example`; `docker compose -p site-export-check -f docker-compose.yml -f override.yml up -d --build`; expect the login page to answer on the override port; then tear it down with `docker compose -p site-export-check … down -v`; the `-v` is allowed only here because the project and its volumes are the throwaway ones (the rule against `-v` is for project `burndown`). Never run `docker compose` against project `burndown`.

- [ ] **Step 7: Commit** — `git add scripts/site-export.mjs scripts/site-export.test.js package.json && git commit -m "feat(site-export): copy command, destination checks, npm scripts"`.

Documentation (`docs/scripts/site-export.md`, the `CLAUDE.md` file-structure line) is written by `/sync-docs` inside `/finish-cycle`, not by a task here.

## Decisioni aperte

1. **Un'esecuzione, quattro task sequenziali, modalità nativa.** Alternativa scartata: subagent-driven. Perché: i task non sono indipendenti (ognuno usa le esportazioni del precedente) e i file sono pochi (§6.1).
2. **Classe di rischio `high-risk`, per operazioni distruttive fuori dal repo (§6.1b).** Alternativa scartata: `standard`. Perché: il comando cancella file in una cartella esterna; nel dubbio la classe più alta.
3. **`copy` rifiuta quando un file tracciato è `unclassified`.** Alternativa scartata: copiare gli altri e avvisare. Perché: un file nuovo non classificato resterebbe fuori in silenzio, cosa che il brief vieta; il guard lo cattura in `npm test`, ma il comando non deve dipendere da quando lo si lancia.
4. **Il confronto con la destinazione ignora CRLF/LF nei file di testo.** Alternativa scartata: confronto byte a byte. Perché: i due cloni di questa macchina hanno `core.autocrlf=true`, e un confronto byte a byte darebbe "modificati" tutti i file dopo ogni checkout nella destinazione, rompendo l'idempotenza del criterio 3. Un file è binario se contiene un byte NUL.
5. **Le regole si leggono dalla cartella `scripts/` del checkout che contiene il comando, non dal commit scelto.** Alternativa scartata: leggere `scripts/site-export.rules` dal commit di partenza. Perché: l'elenco è la configurazione dello strumento; esportare un commit vecchio con le regole vecchie riprodurrebbe classificazioni superate. Il costo: le regole non viaggiano con l'hash esportato.
6. **La verifica dello stack usa una cartella temporanea e non `it_hwg_pdash`.** Alternativa scartata: provare dal clone vero. Perché: la prova avvia container e scrive un `.env` e un override, che non devono finire nel clone destinato a Bitbucket.
7. **La copia vera in `it_hwg_pdash` si lancia solo dopo il sì dell'utente nella sessione di esecuzione.** Alternativa scartata: lanciarla come ultimo passo del piano. Perché: è una scrittura fuori dal repo e il brief non ne autorizza l'esecuzione.
8. **La documentazione (`docs/scripts/site-export.md`, riga in `CLAUDE.md`) la scrive `/sync-docs`.** Alternativa scartata: un task di documentazione nel piano. Perché: è il passo previsto da `/finish-cycle`.

## Criteri di accettazione

1. **Elenco per commit** — `npm run export:list` stampa per un commit i file inclusi ed esclusi con la regola di ciascuno; nessun file di `docs/`, `.claude/`, `scripts/`, nessun `*.test.js` e nessun file escluso dal brief risulta incluso (`scripts/site-export-guard.test.js`).
2. **Copia in cartella vuota** — dopo `export:copy` in una cartella senza file, `git ls-files` più i non tracciati (escluso `.git`) coincide con le regole di inclusione (`scripts/site-export.test.js`, "copy into an empty destination").
3. **Copia idempotente** — una seconda copia dello stesso commit non cambia nulla (`scripts/site-export.test.js`, "a second copy").
4. **Eliminazioni** — dopo l'eliminazione di un file del sito, la copia successiva lo elimina nella destinazione (`scripts/site-export.test.js`).
5. **Solo dal commit** — un file non committato o gitignored nel working tree non compare nella copia (`scripts/site-export.test.js`).
6. **Guard** — il guard è rosso su un file tracciato fuori da ogni regola, verde quando l'elenco lo classifica, ed è eseguito da `npm test` (`scripts/site-export-guard.test.js`, casi sintetici).
7. **Stack** — lo stack avviato dal solo contenuto copiato (`.env` da `.env.example`), su un progetto Compose isolato, si avvia e la pagina di login risponde. **Manuale**: Task 4, passo 6.
8. **Nessuna scrittura non autorizzata** — il comando non scrive senza il sì dell'utente e non esegue mai `git commit` né `git push` (`scripts/site-export.test.js`, "dry run writes nothing" e "the destination's .git and history are untouched").
