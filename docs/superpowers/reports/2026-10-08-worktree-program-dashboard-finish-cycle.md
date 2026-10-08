# Finish-cycle report — worktree-program-dashboard

**Date:** 2026-10-08
**Branch:** worktree-program-dashboard → main (merge `f7f5019`)

## What was done

9 commits (8 from the plan's tasks plus one review fix commit from this cycle):

- `a1d7f08` feat(program): modulo di calcolo delle metriche di programma
- `e0aab41` feat(program): burndown aggregato, barre timeline e posizione di Today
- `2cbd998` feat(program): pagina, shell, testata e KPI
- `878177c` feat(program): vista List con tacca tempo, vs time e riga Total
- `4ed9d51` feat(program): vista Timeline con barre di consumo e linea Today
- `05f16ae` feat(program): card Program burndown con serie attuale e prevista
- `7b56315` feat(program): attiva gli ingressi dal Portfolio e documenta il ciclo
- `ab9f947` fix(program): final review — burndown crash, attention ranking, cache-bust import, notice, sibling menu
- `0c9c185` fix(program): finish-cycle review — burndown drop, NaN comparator, notice text

Delivered: new `program.html` (Program Dashboard: 4 KPI tiles, aggregated burndown, List and Timeline
views), `js/lib/program-calc.js` + tests, `css/portfolio.css` shared with `portfolio.html` (`?v=2` on
both), five entry points wired in `portfolio.html`, dead-code comments on the two unused
`GET /api/reporting/*` endpoints, and full documentation (`docs/pages/program.md` new,
`docs/pages/portfolio.md`, `docs/js/lib.md`, `CLAUDE.md`, `ARCHITECTURE.md`).

15 files, +1590/−21. No new migration. `pdash-api` **not** restarted, by explicit decision: the only
change under `api/` is two comment blocks on dead endpoints, so no backend behaviour differs from what
the running process already serves.

### Scope note (user instruction + plan D14)

At the user's explicit request, and consistently with the plan's own D14 perimeter, Gate 1 and Gate 3
were limited to the files this cycle objectively changed:

- **Gate 1:** the 6 relevant vitest files (`program-calc`, `program-guard`, `portfolio-guard`,
  `nav-shell-guard`, `page-names`, `foundations-guard`) — 182 passing before the fixes, 185 after —
  instead of the whole 846-case branch suite.
- **`scripts/run-tests.sh` skipped**, not by exception but because the `api/` diff was verified to be
  comments only, so the backend integration suite could not have exercised anything new.
- **Gate 3** scoped to the commits not already covered by the previous session's whole-branch Opus
  review (see below).

## Code review follow-ups

**Round 1** (scope `ab9f947`, the previous session's unreviewed fix commit — that session's whole-branch
review happened in another session, so Gate 3's skip did not apply): 3 findings, **all fixed** in
`0c9c185`, none carried forward.

**Round 2** (scope `0c9c185`): 3 findings, **all accepted as follow-ups by the user**. Every one of them
is a consequence of round 1's own fix, which is the signal that the root cause is structural rather than
an isolated defect: `computeBurndownPoints()`'s no-dates fallback was built for a single project's chart,
not for aggregation onto a programme axis, so *any* placement of an undated project on a shared time
axis is partly fabricated. Both available behaviours are wrong in opposite directions — excluding such a
project drops real remaining hours from the chart while `programTotals()` still counts them; including
it fabricates a position. This cycle ships the including variant.

1. **[round 2, medium] `js/lib/program-calc.js:183` — phantom tail.** The no-dates fallback axis is
   `first actual's month + 14 months`, a fixed cap rather than the actuals' real extent, so for an
   undated project whose actuals span more than 14 months `programBurndown` holds its stale `lastBurn`
   for every later programme month, overstating remaining hours. Fixing it properly means deriving
   `axisEnd` from the actuals' max date in `portfolio-calc.js`, which `portfolio.html`'s own burndown
   shares.
2. **[round 2, low] `js/lib/program-calc.js:183` — synthetic `planned` ramp.** `computeBurndownPoints()`
   returns `idealValues` whenever a budget exists, so an undated project without phasing contributes a
   linear budget→0 ramp across that arbitrary 14-month window, positioned purely by when its first
   timesheet row happens to fall.
3. **[round 2, low] `js/lib/program-calc.js:136` — `vsTime` sentinel collision.** `needsAttention()` now
   maps a missing percentage to `-1` so the comparator cannot return `NaN` (the previous `-Infinity`
   made `-Infinity - -Infinity` `NaN`, leaving `Array#sort` order implementation-defined and the "Needs
   attention" tile's pick arbitrary). `-1` is outside `consumptionPct`'s range but is a legitimate
   `vsTime`, so in the third-level tie-break an unknown pace outranks a genuinely behind-pace project.

All three are documented in `docs/pages/program.md` under "Undated projects in the burndown".

## Roadmap notes

- **`timelineBars()` and the burndown disagree on undated projects.** `timelineBars()` skips them
  outright while the burndown now includes them. Resolving that inconsistency together with the three
  follow-ups above is the natural shape of the follow-up cycle, rather than three separate patches.
- **"Showing N of M projects" (spec D5) was never implemented.** Found while syncing `PRD.md`: the
  header has no such indicator — the only `Showing` string in `program.html` belongs to the
  attention-filter clear link. It was omitted from the documentation rather than documented as present.
  Since D5's rule only shows it when `N < M`, its absence is invisible in the normal case.
- **`TEST_CASES.md` / `test-cases.html` case `R-44` asserted the opposite of current behaviour** —
  "Program Dashboard — coming soon" and "neither navigates" — a leftover from the Portfolio cycle 1
  which shipped before this page existed. Rewritten in both files during Gate 5. Same class of staleness
  was found and fixed in `PRD.md` §6.1 and in `.claude/skills/operational-manual/SKILL.md`, both of which
  still claimed the program `Dashboard` button was deliberately inactive.
- **The Needs-attention tile is a clickable filter**, which the brief did not mention; now documented in
  `PRD.md` §6.1a.
- **The two `GET /api/reporting/*` endpoints are confirmed dead on the frontend** and are now commented
  as such rather than removed; removal stays deferred to the end-of-restyling Portfolio review (D14),
  together with the `Sold` semantics divergence between this page and Portfolio's own Card/List.
- **Worktree lock was stale, not live.** `git worktree remove` failed with `cannot remove a locked
  working tree, lock reason: claude session program-dashboard (pid 9420)`; the pid belonged to the
  already-terminated implementation session. Confirming the process was dead made `git worktree unlock`
  + `remove` succeed without `--force`. Check for a stale lock before reaching for a forced removal.

## Sync-docs outcome

- **`ARCHITECTURE.md`** — not changed: already accurate from the implementation cycle (`css/portfolio.css`
  as shared, the `program.html` Directory Structure entry pointing at `docs/pages/program.md`).
- **`CLAUDE.md`** — not changed: the Pages table row for `program.html` and the `portfolio.html` row's
  shared-stylesheet note were already correct, and the routing rule keeps the narrative out of this file.
- **`docs/pages/program.md`** — updated: the `programBurndown` row now states the real inclusion rule
  (dates **or** at least one actual row, and why), the redirect paragraph records the exact
  `Program not found.` wording and why it deliberately omits a visibility clause, and a new
  "Undated projects in the burndown" section carries the three accepted follow-ups.
- **`TEST_CASES.md`** — updated: new section 30, cases `PG-01`…`PG-17` (17 cases, `Auto` blank
  throughout since the cycle added no API endpoint), plus the `R-44` correction above.
- **`test-cases.html`** — updated: the same 17 cases mirrored as its section 31 (the HTML file's own
  section numbering differs from the Markdown's), following the file's convention of omitting `auto`
  rather than writing `auto:false`, plus the `R-44` correction. Its UTF-8 BOM is pre-existing in `HEAD`
  (verified byte-wise against `git show HEAD:test-cases.html`), not introduced here.
- **`test-api.js`** — not changed: the cycle added no API endpoint and changed no auth rule.
- **`PRD.md`** — **updated** (evaluated, and unambiguously necessary: a whole new user-visible page with
  zero prior mentions). New §6.1a Program Dashboard at §6.1's depth; §6.1's stale "inactive — does not
  exist yet" claim about the program `Dashboard` button fixed; one sentence added to §3 noting
  menu-less pages, since that section's table lists menu entries only.
- **`.claude/skills/operational-manual/SKILL.md`** — updated, as §6b requires once `PRD.md` is touched:
  the mirrored reference carried the same stale "deliberately inactive" claim, now fixed, and a Program
  Dashboard bullet was added to the mirrored §6.
- **`docs/superpowers/PROCESS.md`** — **not changed. PROCESS.md gate answer: none of the three
  conditions applies.** The cycle introduced no process skill change, no exception expected to recur
  (the scoped Gate 1/Gate 3 perimeter is a per-cycle scoping decision already captured in this cycle's
  own plan as D14, not a change to the process), and no modification of the 7-phase skeleton or the
  scenario guardrails.

## Memory outcome

**Memory: 3 files updated, 0 items unverified.**

- `project_ui_redesign_cycles.md` — appended a Program Dashboard section: *(absent)* → merged
  2026-10-08 `f7f5019`, 9 commits, no migration, no API restart with the comments-only reason, spec/plan/
  brief/report paths, plus the three lessons worth carrying (the user-requested scoped perimeter and what
  it meant concretely; the round-2-caused-by-round-1 structural signal and the Timeline/burndown
  disagreement; the stale worktree lock and how to tell it apart from a live one).
- `project_portfolio_redesign_cycles.md` — fixed a now-false justification: "`Notify by email` e
  `Copy link` **omessi** (il backend notifica sempre, e la Program Dashboard non esiste)" → same line with
  "non esisteva", followed by an explicit **Da riconsiderare** note that the Program Dashboard now exists
  at `/program.html?programId=`, so the reason `Copy link` was dropped no longer holds and the decision
  must be retaken with the user when cycle 2 starts. The cycle-2 scope itself is unchanged and still
  not started.
- `MEMORY.md` — two index hooks refreshed: the UI-redesign line gained "Program Dashboard MERGED
  2026-10-08 (`f7f5019`, scoped tests/review at the user's request; undated-project burndown follow-ups
  open)", and the Portfolio-redesign line gained "— its \"no Copy link\" rationale is now stale".

Checked and left unchanged: `project_claudemd_doc_split.md` (phase 3 still not started, untouched by
this cycle), `feedback_boards_in_every_dispatch.md`, `feedback_worktree_removal.md` (its guidance still
holds; the stale-lock detail is recorded in the cycle file that references it),
`frontend-tests-node-docker.md` (native vitest still correct).
