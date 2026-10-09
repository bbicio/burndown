# Finish-cycle report — worktree-prd-slim-split

**Date:** 2026-10-10
**Branch:** worktree-prd-slim-split → main
**Execution started:** 2026-10-09 20:55
**Merged at:** 2026-10-10 00:09
**Gate durations:** Gate 1 1m · Gate 2 4m · Gate 3 unknown · Gate 4 1m · Gate 5 unknown — total ~194m
<!-- Wall-clock, human wait time included (pre-flight step 6). Gate 3's boundary timestamp was not
     captured: its first review run died on a rate limit and the gate spanned a relaunch plus a fix
     commit, so the figure is NOT reconstructed — see the Gate 3 note below. Gate 5's was likewise
     not captured. The ~194m total is start-to-merge wall clock and therefore includes Gate 3's span.
     Since 2026-10-08 the code review runs in the background during Gate 2, so Gate 2's figure
     absorbs most of it and Gate 3's covers the findings discussion and any fixes — these two
     gates' numbers are not comparable with cycles closed before that date. -->

## What was done

Cycle 4 of the process-optimization program. 9 commits:

- `3703b37` remove PRD §12 Data Model and §14 Design System (91 lines)
- `20a7900` correct three stale claims in PRD §3
- `994395d` split PRD.md into nine page-aligned area files under docs/prd/
- `a1c0c82` enforce /sync-docs §1 on ARCHITECTURE.md's api/ and css/ tree entries
- `58b42a0` enforce /sync-docs §1 on ARCHITECTURE.md's js/ tree entries
- `2844233` enforce /sync-docs §1 on the tree's page and script entries
- `822e665` invert /sync-docs §5's PRD trigger and widen §5b to docs/prd/
- `61661f8` point operational-manual's inlined reference at docs/prd/
- `1b74864` close eight Gate 3 findings, six of them claims this cycle created

Measured outcomes: `PRD.md` 968 → 77 lines; nine `docs/prd/*.md` totalling 853; `ARCHITECTURE.md` directory tree 148 → 66 content lines across 53 entries; zero `?v=` claims left in `ARCHITECTURE.md`. Line accounting closes exactly (875 baseline + 36 header + 19 Index = 930 = 77 + 853).

**Two decisions that shaped the cycle.** §3 Views and Navigation was **kept**, against the brief, because it is the only user-facing description of navigation and `operational-manual` SKILL.md:56 forbids reading `ARCHITECTURE.md`/`CLAUDE.md` instead — so deleting it would have left that skill with no lawful source. And section numbers were **not renumbered**, which made §5b a path change rather than a renumbering pass over ~150 lines of reference prose; §12 and §14 are now unused numbers and the gap must not be closed.

## Code review follow-ups

Round 1 (whole branch, Sonnet): 10 findings — 8 fixed in `1b74864`, 2 deferred. Round 2 (scoped to `1b74864`): 3 Minor, none fixed, 1 rejected. Outstanding:

- **(round 1) The client-side object shapes are now documented nowhere.** §12.2/§12.3 were deleted as "duplicates" but were in fact **stale**: the shape said `roles: [{ roleId, days, months }]` where the code uses **hours**, and keyed `phases`/`tasks` on `title` where the code uses `phaseName`/`taskName`. The deletion stands; the justification in `3703b37` was wrong. Re-documenting the real `CostGrid`/`Project` in-memory shapes needs a read of `js/api-sync.js` and is its own small piece of work.
- **(round 1) `docs/prd/pipeline.md` §4.9 still reads "Cost Grid Editor (overlay)"** and "opens as a full-page overlay", the same stale idea this cycle corrected in §3. Not fixed deliberately: §4.9 is moved prose and the spec's §4.4 verbatim contract forbids editing it. §3 and §4.9 therefore disagree until a follow-up cycle touches §4.9 under its own mandate.
- **(round 1, partial) Facts orphaned by the tree truncation that were not re-homed.** The one that mattered — `test-cases.html` judging its fetch by payload and never `res.ok` — was re-homed to `docs/js/lib.md`. Still orphaned: `login.html`'s Sign In + Forgot split with email pre-fill and `activate`/`reset-password` sharing `strengthClass`; `auth.css`'s strength-meter colour-by-segment, state icons and `--bs-btn-*` overrides; the Nav-B2 token names, reduced to "`--nav-*` alphas" in `docs/css/stylesheets.md`.
- **(round 1) Pre-existing dangling PRD citations**, now named in `PRD.md`'s Index rather than silently promised away: `§11.3` in `planning.md` (§11 has only 11.1/11.2) and `§16.9a` in `administration.md` (the Profile Processing console is §16.10).
- **(round 1) Other single-file PRD references outside this cycle's scope:** `.claude/commands/finish-cycle.md:143` still says "PRD.md-conditional".
- **(round 2) `1b74864`'s message overstates one claim:** it attributes the `days`/`title` staleness to "§12.2/§12.3"; it was §12.2's alone — §12.3 used `name` and `soldHours`. Corrected here because the message is already written and rewriting history would invalidate the SHAs both review rounds covered.
- **(round 2) `ARCHITECTURE.md`'s `js/lib/` entry says "most with a `window.<name>` bridge"** — true (16 of 17) but less informative than naming the exception, `test-cases-parse.js`. Left as-is: the module index one hop away states it explicitly, which is this cycle's whole design, and fixing it would have triggered a third review round for a wording nicety the reviewer itself called "not a defect".
- **(round 2) Rejected, not deferred:** the reviewer flagged the `Co-Authored-By: Claude Opus 5` trailers as wrong. It was reading its own session's attribution instruction, not this session's, which specifies that name. The trailers are correct.

## Roadmap notes

**Gate 2 took the no-code branch — the first time it has ever been walked.** `node scripts/classify-cycle.mjs` printed `no-code` as its first stdout line and listed 14 paths (15 after the fix commit), all `.md` under `docs/`, `.md` under `.claude/`, or root `*.md`. Consequences, as PROCESS.md §6 4c requires be recorded rather than discovered:

- **The browser-verification question was not asked.** The user confirmed the classification instead.
- **Gate 4's out-of-scope check did not fire.** Steps 2-5 are skipped on this branch, so no plan file was identified and there was nothing to compare the touched files against. Partial substitutes that did hold: the classifier's own path list, and the spec's acceptance criterion 11 (every path in scope, `TEST_CASES.md` untouched).
- **Nothing was created or torn down.** `scripts/test-branch.sh status` ran read-only and reported `down`, so no stack from an earlier attempt existed.
- Cycle 2's no-code branch is therefore **no longer unverified**.

**Gate 3's first review run died and was relaunched.** The background `/code-review` launched at Gate 2's opening terminated on the account session limit (HTTP 429, `claude-opus-5`, reset 23:10). Per PROCESS.md §6.4b a dead or unreadable run counts as **NOT reviewed, never clean**, so it was relaunched rather than treated as passing — on **Sonnet**, at the user's explicit choice, which is a weaker reviewer than this project's norm for a whole-branch review. It nonetheless found all six of the cycle's self-inflicted prose claims. Gate 3's own duration field is `unknown` for this reason and was deliberately not reconstructed.

**The cycle's real finding, and the one worth carrying forward: compression manufactures false claims; moving does not.** The byte-identical half — nine area files, 817 lines, generated from the source rather than retyped — produced **zero** review findings. The compressed half — 53 rewritten tree entries — produced **six**, every one a statement that was tidier than the truth: an absolute "each an ES module with a `window.<name>` bridge" when one module has none; "the rule lives in `classify-cycle.test.js`" when the rule is code in the `.mjs` and the sentence thereby inverted the principle it was stating; a surviving "portfolio.html **only**" left standing in the very sentence this cycle edited, contradicting the new entry that calls the file shared; "keys its own bullets on the PRD's §N" when the manual's heading reads `§13/§16 Administration`; a by-definition clause that routed a page addition to an area file while a page's menu entry lives in `PRD.md` §3; and two commit messages asserting no narrative was orphaned when some was. This is [[feedback-doc-split-prose-claims]] reproducing almost exactly, now with a measurement attached.

**Four omissions found in a tree whose only job is indexing structure:** `costgrid.css` (6 of 7 stylesheets listed), `share-list-component.js`, `shoot.mjs`, and 6 of 21 route files. All added or completed.

**Version-number drift runs both ways.** `ARCHITECTURE.md` asserted three wrong `?v=N` values; `docs/css/stylesheets.md` asserted a wrong one in the opposite direction (`portfolio.css ?v=1` against a real `?v=2`). The tree's claims were removed and the destination's corrected. A prose copy of a version number has no failure mode; `js/lib/foundations-guard.test.js` does. **`docs/css/stylesheets.md` still carries `?v=N` claims** and is a candidate for the same treatment.

**Not regenerated, deliberately:** `docs/OPERATIONAL_MANUAL.html`. It is an `.html` file under `docs/`, which does not qualify under `scripts/classify-cycle.mjs`, so regenerating it would have flipped this cycle to ordinary and made browser verification mandatory. Regeneration stays on request per §5b — and its standing precondition (a reconciliation audit first) is now cheaper to satisfy, since the audit can run one area file at a time.

## Sync-docs outcome

- **ARCHITECTURE.md — evaluated, no change.** No module, endpoint, schema or migration changed. It contains no reference to `PRD.md`, so the split left nothing outdated. Its directory tree was rewritten *by* this cycle and already complies with §1.
- **CLAUDE.md — evaluated, no change.** It contains no reference to `PRD.md` or `docs/prd/`, so nothing in it went stale. Adding a pointer would be new documentation rather than a sync, and the routing a future session needs now lives in `/sync-docs` §5.
- **TEST_CASES.md — not necessary.** No user-visible behaviour, feature or bugfix; nothing to add or amend. Left untouched deliberately: it is runtime code since 2026-10-09 and its characterization test asserts exact counts.
- **test-api.js — not necessary.** No endpoint added, no auth rule changed.
- **PRD (`PRD.md` + `docs/prd/`) — updated, in-cycle rather than at Gate 5.** The cycle *is* the PRD change: §12/§14 deleted, §3's three stale claims corrected, the split, and the Index. No further product change to record — the cycle altered no user-visible behaviour.
- **operational-manual's inlined reference (§5b) — updated in-cycle, and re-checked here.** Triggered by `PRD.md` + all nine `docs/prd/` files. Re-verified at Gate 5 that the changed PRD sections fall outside the reference's claims: it asserts nothing about `appSubnav` and nothing about the editor being an overlay, so the §3 corrections required no further edit. Its `§N` content keys are unchanged, as the no-renumbering decision intended.
- **PROCESS.md — updated. Gate answer: condition 3 applied** ("modified the gates of `/finish-cycle` or the outputs of `/sync-docs`") — this cycle changed `/sync-docs` §5 and §5b. Three targeted edits: the preamble now describes the PRD as a file set; §5's `operational-manual` bullet had a **stale `§6b` pointer** (the section is 5b since Cycle 3's renumbering) which now cites the section by name with an explicit note not to trust a number quoted in prose; and §2's reconciliation-audit cadence gained the incremental-audit gain, which is the whole point of the split.

## Memory outcome

- `project_process_optimization_plan.md` — **updated.** `description:` "Tier 0, Cycle 1, Cycle 2, the classify-cycle script and Cycle 3 DONE … cycles 4-6 next" → "Tier 0, Cycles 1-4 and the classify-cycle script DONE … cycles 5-6 next". The Cycle 4 bullet: "**Cycle 4 — `PRD.md` slim + split.** Remove §12, §14, §3 (~110 lines) … No-code cycle." + its Tier 0.2 input sub-bullet → "**Cycle 4 — DONE, merged and pushed 2026-10-10** (merge `02bec81`…)" plus nine sub-bullets recording the measured outcomes and the decisions that will matter later: that §3 was kept and why, that numbering was deliberately not renumbered and the §12/§14 gap must not be closed, the verbatim-vs-compressed finding contrast, the three files missing from the tree, the `?v=N` removal and two-way drift, that §12.2/§12.3 were stale rather than duplicated (with the open follow-up), the first walk of the no-code branch, and the Gate 3 rate-limit relaunch on Sonnet.
- `MEMORY.md` — **updated.** The "Process optimization plan" line's hook: "Tier 0 + Cycles 1-3 + the classify-cycle script DONE and pushed (Cycle 3, merge `ba4ffc3` …); cycles 4-6 next" → "Tier 0 + Cycles 1-4 + the classify-cycle script DONE and pushed (Cycle 4, merge `02bec81` 2026-10-10: PRD.md 968 → 77 lines + nine `docs/prd/` area files, ARCHITECTURE.md tree 148 → 66, §N numbering deliberately NOT renumbered; first walk of Gate 2's no-code branch); cycles 5-6 next".
- **Evaluated, no change:** `project_claudemd_doc_split.md` (phase 3 is Cycle 6, untouched by this cycle and shares no file with it), `project_ui_redesign_cycles.md`, `project_team_ux_backlog.md` — none mentions the PRD, `ARCHITECTURE.md`'s tree, or this branch.
- **Recommended but NOT applied, because §7 excludes `feedback` files unless the cycle contradicts them:** `feedback_doc_split_prose_claims.md` was *confirmed and sharpened* by this cycle rather than contradicted — the new datum being that the generated, byte-identical half produced 0 findings while the compressed half produced 6, which is the first time the two halves of such a cycle have been measured separately. Worth adding on the user's say-so.
- **Unverified, needs the user:** nothing.
