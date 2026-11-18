# scripts/cycle-report.mjs — the mechanical lines of a finish-cycle report

## Use

- `node scripts/cycle-report.mjs mark <event> [--branch <name>]` appends the current time of one event to the branch's log. `/finish-cycle` runs it at pre-flight, on entering each gate, at the merge, and when the report is written.
- `node scripts/cycle-report.mjs render [--branch <name>]` prints the report's `**Execution started:**`, `**Merged at:**` and `**Gate durations:**` lines, then one line per commit of the branch for "What was done". `/finish-cycle` Gate 5 starts the report from it.

The branch defaults to the current one.

## Events

`preflight`, `gate1`, `gate2`, `gate3`, `gate4`, `merged`, `gate5`, `report`. Another word is refused with a non-zero exit. A second `mark` of the same event is ignored: a re-entry into a gate is not a new entry.

## The log

`<main checkout>/.superpowers/cycle-log/<branch, with / as ->.log`, one `<ISO time> <event>` per line. A linked worktree writes into its main checkout's log, so the log outlives the worktree that `/finish-cycle` Gate 4 removes. `.superpowers/` is gitignored; the log is never committed. The Gate 2 draft of the report's judgement sections sits next to it, as `<branch>.draft.md`.

## What it prints and what it does not

- Each gate lasts from its entry to the next gate's entry; Gate 5 lasts until `report`; the total runs from `preflight` to `report`.
- A missing event prints `unknown`, never an estimate.
- The commits come from the merge whose subject is git's default, `Merge branch '<branch>'`; without one it prints `unknown (merge not found)`.
- The cycle counters, the Gate 5 tests line and every judgement stay hand-written.

Tests: `scripts/cycle-report.test.js`. `scripts/cycle-times.mjs` is a different tool: it reads the timeline of closed cycles from git.
