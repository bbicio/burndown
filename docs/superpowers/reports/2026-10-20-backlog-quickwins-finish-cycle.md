# Finish-cycle report — backlog-quickwins

**Date:** 2026-10-20
**Branch:** backlog-quickwins → main
**Execution started:** 2026-10-19 17:48  (pre-flight step 6)
**Merged at:** 2026-10-20 00:09  (Gate 4's merge commit)
**Gate durations:** Gate 1 2m · Gate 2 3m · Gate 3 375m · Gate 4 1m · Gate 5 4m — total 385m
**Cycle counters:** subagent dispatches 4 · review rounds 4 · full test-suite runs 4
**Risk class:** high-risk (`docs/superpowers/plans/2026-10-19-backlog-quickwins.md`, re-declared from low-risk during execution once B-106 touched `css/style.css`) · review effort high
**Claims pre-check:** Gate 1 cost about one minute and caught two false predicates (the `PRD.md` Index still cited the two citations B-019 removed; `finish-cycle.md`'s new wording left out `PRD.md`). Round 1 had seven findings, and six of them fell in the mechanical classes: false predicates, a stale label left in several files, and an incomplete enumeration in a verification cell. The re-check of the round-1 fixes cost about two minutes and caught one more false predicate (`docs/js/nav.md` still said the headings kept their old wording). Rounds 2 and 3 were themselves all mechanical, and most of them were born from the previous round's own `docs/BACKLOG.md` cell rewrites.
<!-- Gate 3's figure spans the night: the round-3 cap question was answered the next day, so most of it is human wait. -->

## What was done

16 commits (before the merge):

- `ded5b7b` TEST_CASES.md no longer names Config or a page count (B-017)
- `1d46f0d` PRD pipeline 4.9 — the cost-grid editor is a full page (B-018)
- `3f6457e` drop the dangling PRD citations (B-019)
- `6221502` finish-cycle names the split PRD (B-020)
- `eb10432` M1 plan — Step 4 and ledger (B-066, B-067)
- `b32e223` content-surface guard reads the phone block only (B-114)
- `a579481` page-head guard checks computed `.ph-title` methods for emoji (B-097)
- `b5c1dfc` planning heading reads Planning (B-016)
- `a5a5a84` portfolio heading/back link read Portfolio (B-016); `kpiLeftColor` reads `--kpi-orange` (B-070)
- `d081b35` planning toolbar wraps at 375px (B-106); phone gutter comment (B-115); `style.css?v=25`
- `d265ffd` close the quick-wins rows in BACKLOG; plan risk class high-risk
- `47f9056` escape the pipes in two BACKLOG cells
- `16d665f` claims pre-check fixes
- `b4c8264` round 1: program back link reads Portfolio; docs follow the rename; BACKLOG cells
- `bc15a2d` round 2: B-016 cell, PRD legend citation, M1 Step 2
- `8df4737` round 3: pipe-free greps for B-017/B-067; B-113 exceptions

## Gate outcomes

- Gate 1: passed (frontend only). The claims pre-check fixed two predicates in `16d665f`.
- Gate 2: ordinary cycle. Reused the branch stack (started earlier to measure B-106), the user verified in the browser, and the stack was torn down after that "yes".
- Gate 3: four rounds at high effort.
  - Round 1: 7 findings. Six were fixed and one was accepted as follow-up; the user's rule was to fix mechanical/label findings and to follow up coverage gaps.
  - Round 2: 4 findings, all fixed.
  - Round 3: 2 findings, all fixed.
  - Cap question: the user chose (a), another round.
  - Round 4: no findings.
- Gate 4: `--no-ff` merge `b4a6133` (main had not diverged), pushed. Nothing under `api/`, so there was no backup, migration or restart. `git worktree remove` failed with "Permission denied", and the leftover directory was removed with `rm -rf`. Branch deleted.
- Gate 5: sync-docs touched `docs/pages/planning.md`, `docs/pages/portfolio.md`, `docs/pages/program.md`, `TEST_CASES.md` (PL-29) and `js/lib/test-cases-parse.test.js` (case count). It added B-117 to `docs/BACKLOG.md`.

## Code review follow-ups

- Round 1: the computed-title emoji check in `js/lib/page-head-guard.test.js` reads only a bare `{{ name }}`. Dotted paths, expressions and `data()` fields are not checked. Logged as B-117.

## Roadmap notes

- `docs/OPERATIONAL_MANUAL.html` still shows "Project Portfolio" / "Resource Planning". It is generated and is refreshed only on request.
- The defect source across rounds 2 and 3 was the `Verified how` cells this cycle wrote in `docs/BACKLOG.md`: unescaped `|` inside table cells, and `\|` alternation that a rendered table strips. Verification commands written with `grep -e … -e …` avoid both.
- Pre-existing bare pipes in BACKLOG rows B-057, B-080 and B-098 were noted by the round-2 reviewer and left as they are.
- B-113 stays open: `--kpi-green`/`-purple`/`-teal`/`-red` are only defined in `css/tokens.css` and listed in `js/lib/tokens.test.js`.

## Sync-docs outcome

- **ARCHITECTURE.md:** no change. No module, endpoint, schema or data flow changed.
- **CLAUDE.md:** no change. No file was added or removed, and no page's purpose changed.
- **docs/pages/:** `planning.md`, `portfolio.md` and `program.md` each gained a dated "Backlog quick wins" section (headings, toolbar wrap, `kpiLeftColor`, back link).
- **TEST_CASES.md:** PL-29 added (toolbar fits a phone). The case count in `js/lib/test-cases-parse.test.js` was raised in the same change.
- **test-api.js:** not applicable.
- **PRD:** evaluated, and no further change was needed. The user-visible label changes were already written on the branch (`docs/prd/reporting.md`), and `.claude/skills/operational-manual/SKILL.md` was updated with them (triggered by `docs/prd/reporting.md`).
- **PROCESS.md gate:** none of the three conditions applies. The `finish-cycle.md` edit is wording about the PRD's location, not a change to a gate.

## Memory outcome

- `project_header_unification_cycle.md`: the description gained "(B-106/B-114/B-115 closed 2026-10-20 by backlog-quickwins `b4a6133`)". The cycle 2 bullet gained a sentence on what this cycle closed, and on B-105/B-107/B-109 as the next candidates.
- `MEMORY.md`: the header-unification line gained the same parenthetical, plus "next: B-105/B-107/B-109".
