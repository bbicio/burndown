# Finish-cycle report — backlog-b110-b112

**Date:** 2026-10-23
**Branch:** backlog-b110-b112 → main
**Execution started:** 2026-10-23 10:18  (pre-flight step 6, second run; the first run started 10:13 and stopped at Gate 1)
**Merged at:** 2026-10-23 11:03  (Gate 4's merge commit `315728b`)
**Gate durations:** Gate 1 3m · Gate 2 12m · Gate 3 25m · Gate 4 6m · Gate 5 2m (report written at 11:06, before step 3) — total 48m
**Cycle counters:** subagent dispatches 4 · review rounds 4 · full test-suite runs 3 before Gate 5 step 3
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-23-backlog-b110-b112.md`) · review effort high
**Claims pre-check:** At Gate 1 (first run) it took about 1 minute and caught 1 false predicate: the B-110/B-112 closures said "`scripts/shoot.mjs` at …", while the measurements were taken on the main stack with the rule injected; fixed in `e871061`. The second run had no new `*.md` to check. The Gate 3 re-checks took about 1 minute per round and caught nothing new; round 3's re-check grepped the live repo for every `.pr-kpis` mention to end the selector series. Round 1 had 3 findings, 1 of them mechanical (the self-contradicting upload-button sentence in `SKILL.md`, a false predicate).

## What was done

10 commits:
- `c3e2757` docs: the api container does not hot-reload — CLAUDE.md, compose comment, ARCHITECTURE.md
- `00611b7` fix(program): 'of <amount>' in a KPI tile wraps as a unit (B-110)
- `c4bbe0e` fix(planning): toolbar's right-hand buttons align with the first row (B-112)
- `76b78d3` docs(operational-manual): planning and reporting button labels without emoji (B-112)
- `0e0ce61` docs(backlog): close B-110 (layout half) and B-112; plan: nodemon exists as a dev script
- `e871061` docs: claims pre-check — B-110/B-112 measurements were on the main stack with the rule injected
- `72e1031` test(portfolio): guard pins portfolio.css ?v=7 (B-110 bump)
- `5b36b5a` fix: Gate 3 round 1 — SKILL.md upload-button sentence, B-110 closure scope
- `09f4c67` fix: Gate 3 round 2 — name the nowrap selector .pr-kpis .pg-tile-value
- `fdfbe1e` fix: Gate 3 round 3 — the remaining two .pr-kpis selector mentions

## Gate outcomes

- Gate 1: the first run failed — `js/lib/portfolio-guard.test.js` pins `portfolio.css?v=6` and T2 had bumped it to 7 without the pin. Fixed on the branch (`72e1031`), `/finish-cycle` re-run from the top: `npm test` passed, 58 files, 1495 tests. The diff does not touch `api/`.
- Gate 2: ordinary cycle. The branch stack was spun up, the user verified it in the browser against a listed set of cases, then it was torn down.
- Gate 3: 4 rounds at high, 3 → 1 → 2 → 0 findings. Round 1: 2 fixed, 1 no action (the Team assistant panel title keeps its emoji; `SKILL.md` names the button). Rounds 2-3: the same `.pr-kpis` vs `.pr-kpis .pg-tile-value` shorthand in three places, fixed. Past the cap the user chose option (a): round 4, scoped to `fdfbe1e`, was clean.
- Gate 4: merged `--no-ff` as `315728b` and pushed. `main` had not diverged. No backup, migration or restart. `git worktree remove` failed with "Permission denied"; git had already deregistered it and `rm -rf` cleared the directory. The local branch was deleted.
- Gate 5: `/sync-docs` added a dated section to `docs/pages/program.md` and `docs/pages/planning.md`, and updated two memory files. Step 3 was red twice (2, then 1 test) on `scripts/classify-cycle.test.js` end-to-end timeouts, then green on the third run with nothing changed.

## Code review follow-ups

None.

## Roadmap notes

- **Out-of-scope check:** the Plan names its files in the tasks rather than in a File Structure section. Outside them: `ARCHITECTURE.md` (it quotes the compose comment T1 changed), `js/lib/portfolio-guard.test.js` (the pin that failed Gate 1) and `js/lib/nav-shell-guard.test.js` (the `style.css` pin, covered by T5's run).
- **Plan defect, found during execution:** the Plan said "Nessun nodemon nel repo"; `api/package.json` has a `dev` nodemon script the container does not use. Corrected in the Plan in `0e0ce61`. The Plan also missed the `portfolio.css` version pin, which is what failed Gate 1.
- **Measurements:** B-110 and B-112 were measured with a copy of `scripts/shoot.mjs` that prints the `--eval` result (the repo script discards it), run against the main stack with the CSS rule injected. If that is wanted again, a `--print` flag on `scripts/shoot.mjs` would make it repeatable.
- **Kept by decision, not done:** B-110's token half (`--tile-value-size` outside the `--text-*` scale) and the Bootstrap/`.ph-btn` mix in the planning toolbar, both declared in the Plan's decisions 3 and 4.
- **Flaky test (task):** `scripts/classify-cycle.test.js`'s end-to-end cases run close to their 30 s timeout — the file alone took 64 s for 21 tests — and timed out twice under the full suite at Gate 5 step 3. Needs its own look (faster fixture or per-case budget), not a raised timeout by default.
- **Still open from the header cycles:** B-113, B-116, B-117.

## Sync-docs outcome

`docs/pages/program.md` and `docs/pages/planning.md`: a dated "Backlog B-110, B-112" section each (routing rule for per-page narrative); `docs/pages/planning.md`'s 2026-10-19 snapshot ("both are open") was left as history. `ARCHITECTURE.md`, `CLAUDE.md`: already updated on the branch; the other `?v=` mentions in `docs/` are dated history. `TEST_CASES.md`, `test-api.js`: no change (CSS-only fixes, no endpoint). PRD (`PRD.md` + `docs/prd/`): evaluated, not necessary — a wrap and a 2px alignment change no user flow, control or page. PROCESS.md gate: none of the three conditions.

## Memory outcome

- `project_header_unification_cycle.md`: "Still open from the header cycles: B-110, B-112, B-113, B-116, B-117 — B-110/B-112 are the next candidates (visual)." → "The backlog-b110-b112 cycle (merge `315728b`, 2026-10-23, this report) closed B-110 (layout half only …) and B-112 (…). Still open from the header cycles: B-113, B-116, B-117."
- `MEMORY.md`: "…; next: B-110/B-112)" → "…; B-110/B-112 closed 2026-10-23 by backlog-b110-b112 `315728b`; still open B-113/B-116/B-117)".
