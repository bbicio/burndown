# PRD.md slim + split, ARCHITECTURE.md tree enforcement — design

**Date:** 2026-10-09
**Cycle:** 4 of the process-optimization program approved 2026-10-08
**Brief:** `docs/handoff-ciclo4.md`
**Scenario:** 2 (evolution of existing documentation), executed as a no-code cycle
**Mode decided with the user:** branch + worktree + `--no-ff` via `/finish-cycle`

---

## 1. Problem

`PRD.md` is 968 lines in 18 sections, in one file. Two consequences the program named:

1. **The reconciliation audit is a bang, not a trickle.** The `domain-audit` of `PRD.md` against the live app (`docs/superpowers/audits/2026-09-16-prd-vs-app-behavior-audit.md`) found **14 gaps**, several of them entire undocumented features. With one 968-line file there is no smaller unit to audit, so the audit is all-or-nothing and therefore rare.
2. **Part of the file duplicates sources that cannot go stale.** Developer-facing material (JSON shapes, a design-token table) sits in a product document, where nothing fails when it drifts.

`ARCHITECTURE.md`'s `### Directory structure` tree (§7 Docker Compose, line 933) has the same disease in a worse form: it is **148 lines inside its fence, of which 93 (63%) are wrapped narrative continuation lines** across 55 entries, duplicating `CLAUDE.md`'s File structure block — which the 2026-10-08 split shrank from 38 KB to ~11 KB precisely to stop this. It is **already in breach of `/sync-docs` §1's own routing rule**, which Tier 0.2 (`1bb1796`) deliberately only re-pointed rather than enforced.

### Measured, not quoted

Every number below was measured on 2026-10-09 against `main` at `4502bec`, not taken from the brief.

| Claim | Measured |
|---|---|
| `PRD.md` | 968 lines, 18 top-level sections |
| §3 Views and Navigation | lines 25–46, 22 lines |
| §12 Data Model | lines 651–725, 75 lines |
| §14 Design System | lines 740–755, 16 lines |
| `ARCHITECTURE.md` tree | fence at lines 935–1084; 148 content lines, 55 entries, 93 wrapped narrative lines |

## 2. A premise of the brief that did not survive verification

The brief groups three deletions as equally redundant. **One is not.**

§12 and §14 are clean deletes: localStorage keys plus `CostGrid`/`Project` JSON shapes, and a design-token group table. Both are developer-facing, both duplicate a source the code enforces (`ARCHITECTURE.md` §5; `css/tokens.css`, pinned by `js/lib/tokens.test.js`).

**§3 Views and Navigation is not redundant — it is stale.** It is the only *user-facing* description of navigation anywhere: the rail tooltips, the account-menu entries, the "© 2026 PDash" line, "Default view on load: Pipeline", which pages have no menu entry at all. `CLAUDE.md`'s Pages table is routes and file paths; `js/nav.js`'s `NAV_MAIN`/`NAV_GROUPS` is a data structure. Neither states the behaviour a user experiences.

Deleting it would also break a live consumer. `.claude/skills/operational-manual/SKILL.md:56` states: **"Source of truth: `PRD.md` only… Do not read `ARCHITECTURE.md` or `CLAUDE.md`"** — both being implementation-detail documents whose use would violate the skill's own no-implementation-detail guard. That skill's reference already restates PRD §3's navigation detail at its line 157. So §3 is consumed, and deleting it would force reversing that ban.

**Decision (user, 2026-10-09): §3 is kept and its stale lines corrected.** The saving is 91 lines rather than 113. All three staleness claims were verified against code before being called stale:

| Claim in §3 | Verification | Verdict |
|---|---|---|
| "A secondary sub-navigation row (`appSubnav`) appears within the Reporting view" | `appSubnav` appears in **no** `.html` file; the sole occurrence is a defensive `document.getElementById('appSubnav')` in `js/core.js:148` whose `if (subnav)` guard never passes | **False**, not merely dated — remove the sentence |
| "three primary views … plus a full-screen editor overlay" | `costgrid.html` is a full page with its own route (`/costgrid.html?cgId=&verId=`) since the 2026-07 Vue migration | "three primary views" is **correct**; "plus a full-screen editor overlay" is **false** — remove that clause only |
| `:85` cites "(§3.3/§18)" | §3 has no subsections at all | **Dangling** pre-existing reference — retarget to `§18`, where offer visibility is actually defined |

## 3. Decisions taken with the user

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | §3's fate | Keep, correct only the stale lines | See §2 above |
| 2 | Split granularity | **10 files, page-aligned** | The program's stated gain is an incremental audit; the audit unit should be a page, so a Pages-table change points at exactly one PRD file |
| 3 | Section numbering | **Keep existing numbers, gaps and all** | Every existing `§N` reference stays correct, so the move is genuinely verbatim. `operational-manual` SKILL.md:25 already states a source's numbers "can have gaps … from historical reorganization" and that the manual never mirrors them — gaps cost nothing downstream |
| 4 | Tree slimming | **Enforce `/sync-docs` §1 on all 55 entries** | The rule is already written; applying it uniformly needs no new per-entry judgment |
| 5 | Cycle mode | **Branch + worktree + `--no-ff`** | A direct commit gets no Gate 3, and prose moves are where Gate 3 pays: a documentation-split cycle produced 10 of its 16 findings on prose, Cycle 3 produced 4 of 7 of the same species |

## 4. Design

### 4.1 PRD.md — delete

Remove §12 (lines 651–725) and §14 (lines 740–755): **91 lines**.

One consequence to handle, not leave dangling: `PRD.md:731` (§13's Persistence row) reads "… seeded from the API on each page load (see §12.1)". With §12 gone the pointer must go; the surrounding clause already states the fact it pointed at ("localStorage holds only client-side settings, not server data"), so the parenthetical is removed and nothing is reworded around it.

### 4.2 PRD.md — correct §3

Exactly the three corrections in the table in §2. No other word of §3 changes.

### 4.3 PRD.md — split into 10 area files

Root `PRD.md` keeps its title block (lines 1–7), §1, §2, §3, §13, and gains an index table. Everything else moves to `docs/prd/`:

| File | PRD sections | Source lines | Lines |
|---|---|---|---|
| `docs/prd/pipeline.md` | §4 Pipeline Board (incl. §4.9 Cost Grid Editor) | 47–186 | 140 |
| `docs/prd/planning.md` | §5 Resource Planning | 187–241 | 55 |
| `docs/prd/reporting.md` | §6 Project Reporting (incl. §6.1a Program Dashboard) | 242–362 | 121 |
| `docs/prd/project-config.md` | §7.1 Project Configuration | 367–443 | 77 |
| `docs/prd/master-data.md` | §7 heading + intro, §7.2–§7.7 | 363–366, 444–531 | 92 |
| `docs/prd/timesheets.md` | §8 Excel Timesheet Upload | 532–577 | 46 |
| `docs/prd/notifications.md` | §9 Settings, §10 Notifications, §11 Team assistant | 578–650 | 73 |
| `docs/prd/administration.md` | §16 User Administration | 786–922 | 137 |
| `docs/prd/access.md` | §15 Authentication, §17 GDPR & Data Rights, §18 Sharing & Permissions | 756–785, 923–968 | 76 |

That is 9 area files; the tenth file is the root `PRD.md` itself, which remains a real document (§1, §2, §3, §13) and not a bare index.

**The §7 split point.** §7's intro paragraph (line 365) is about the Master Data pages explicitly, so it travels with them, verbatim. This is also why the seam is defensible rather than arbitrary: that paragraph opens "All configuration screens described in this section are admin-only", which is **already imprecise for §7.1** — `project-config.html` has a documented viewer mode and is open to editors, not admins only. Splitting leaves the sentence where it is accurate. The sentence itself is **not** reworded in this cycle; the imprecision is recorded in §6 below as a found-and-isolated item.

**Each area file opens with the same two-line header:** an `# <Area>` title and one line reading that it is part of `PRD.md` and naming the sections it carries, with a link back. Nothing else is added.

### 4.4 Verbatim is the contract

Body prose moves **byte-for-byte**. The complete list of content edits in the whole PRD half of this cycle is:

1. the three §3 corrections (§2's table),
2. the `(see §12.1)` removal in §13,
3. the new index table in `PRD.md`,
4. the two-line header of each area file.

Anything else encountered — an awkward sentence, a dated parenthetical, a claim that looks wrong — is **recorded in the cycle report, not rewritten**. This is the single defence against the failure mode the program names: rewriting compressed prose manufactures false universal claims, 10 of 16 findings in one such cycle (`feedback_doc_split_prose_claims`).

### 4.5 ARCHITECTURE.md tree — enforce `/sync-docs` §1

Every one of the 55 entries becomes **one entry-line**: what the file is, what it loads or folds in, plus its `docs/` pointer where one exists. "One line" is a content rule, not a column rule — a single sentence that exceeds the tree's indented width may wrap, but a wrap may never carry a *second* fact, which is how the 93 continuation lines accumulated in the first place. Removed from the tree:

- all dated cycle narrative (the 93 wrapped lines), which `/sync-docs` §1 already routes to `docs/pages/`, `docs/js/`, `docs/api/`, `docs/scripts/`, `docs/css/stylesheets.md`;
- **all `?v=N` claims.** Three are already wrong, verified against the pages on 2026-10-09: the tree says `style.css ?v=20` (pages say 21), `nav.js ?v=16` (pages say 17), and `tokens.css ?v=8` *and* `?v=9` in the same entry (pages say 9). Cache versions stay owned by `CLAUDE.md`'s Cache-busting section and `js/lib/foundations-guard.test.js`, which **fails** on a disagreement instead of rotting silently. A prose copy of a version number has no such property and is the reason these three drifted.

Target ~70 lines from 148.

**No per-entry fact is invented.** Where an entry's surviving line is not already supported by its `docs/` file or `CLAUDE.md`, it is a **truncation** of the text present today, never a new claim. An entry whose narrative is not yet mirrored anywhere gets its text moved to the correct `docs/` file first (per §1's reuse-before-duplicate principle: check for an existing file, merge into it, never fork a duplicate) and only then truncated.

The two entries added by Cycle 3's own `/sync-docs` (`test-cases.html`, `scripts/classify-cycle.mjs`) are **verified against the rule, not assumed compliant** — the brief flags them as written that same evening. `test-cases.html`'s current entry is four lines of dated narrative and does not comply.

### 4.6 `/sync-docs` §5 — invert the trigger

§5 today is three negative/conditional rules plus a 2026-09 "when in doubt, ask" clause. The change adds a **positive clause ahead of them**:

> A change that adds or removes a page in `CLAUDE.md`'s Pages table, or adds or removes a control a user can see or click, **is** user-visible — update the matching `docs/prd/` file. Do not ask.

The existing "ask when in doubt" rule **stays**, as the residual for genuinely ambiguous changes. It was written after the 14-gap audit; making the clear cases automatic does not make the unclear ones clear, and removing it would re-open the silent-omission hole it closed.

§5 also learns that the PRD is now `PRD.md` + `docs/prd/`, and gains a routing line: which area file takes which kind of change (the §4.3 table is the mapping).

### 4.7 `/sync-docs` §5b + `operational-manual` — same cycle, mandatory

This is the brief's non-negotiable item: if the PRD moves and this reference does not, it goes stale exactly as `PRD.md` did before 2026-09-16.

- **`/sync-docs` §5b:** its trigger ("only if PRD.md was updated in this cycle") widens to `PRD.md` **or** any `docs/prd/` file, and it must name which area file's change it is reacting to.
- **`operational-manual` SKILL.md:56:** "Source of truth: `PRD.md` only" becomes `PRD.md` **plus** `docs/prd/`. The ban on reading `ARCHITECTURE.md`/`CLAUDE.md` is **untouched** — §3 surviving (§2 above) is precisely what keeps that ban payable.
- **SKILL.md:37** lists `PRD.md` among candidate sources to locate; it gains `docs/prd/`.
- **The `(as of 2026-09-16)` stamp** on the "PDash detail-content reference" heading is re-dated to this cycle, since the reference was re-verified against the moved PRD.
- **The `§N` content keys stay exactly as they are.** Verified: the reference's headings (`§4 Pipeline`, `§5 Resource Planning`, `§16 Administration`, …) and its in-text citations (`PRD §15.1/§15.3`, `PRD §6.1a`) are **PRD** numbers, and decision 3 keeps those numbers. This is the whole payoff of not renumbering: §5b becomes a path change, not a renumbering pass over 150 lines of reference prose.

## 5. Acceptance criteria

1. `PRD.md` no longer contains §12 or §14; no `§12`/`§14` reference remains anywhere in `PRD.md` or `docs/prd/`.
2. §3 is present in `PRD.md`, contains no `appSubnav` sentence and no "editor overlay" clause, and `:85`'s cross-reference resolves to a section that exists.
3. The nine `docs/prd/*.md` files exist with the section mapping of §4.3; `PRD.md` holds §1, §2, §3, §13 and an index linking all nine.
4. Every moved line is byte-identical to its source, except the four edits enumerated in §4.4. Demonstrated by a diff check, not asserted.
5. `ARCHITECTURE.md`'s tree contains no `?v=` string and no dated cycle narrative; each entry carries one fact per §4.5; the fence is **≤ 80 content lines** (from 148).
6. No narrative is **lost**: any text truncated out of the tree is present in the corresponding `docs/` file first.
7. `/sync-docs` §5 contains the positive by-definition clause **and** still contains the "ask when in doubt" residual.
8. `/sync-docs` §5b and `operational-manual` SKILL.md both name `docs/prd/`; the manual's `§N` keys are unchanged.
9. `node scripts/classify-cycle.mjs` prints `no-code` as its first stdout line.
10. `npm test` passes at Gate 1.
11. No file in the diff is outside `PRD.md`, `docs/prd/*.md`, `ARCHITECTURE.md`, `.claude/skills/sync-docs/SKILL.md`, `.claude/skills/operational-manual/SKILL.md`, `docs/handoff-ciclo4.md`, this spec, the plan, and the cycle report — one path outside flips the classification.

## 6. Out of scope — found, isolated, not fixed

Per PROCESS.md §2's Scenario 3 guard (a finding that emerges during a cycle is isolated, never resolved in passing), these are recorded here and left alone:

1. **`operational-manual` SKILL.md internal contradiction.** Line 158 says Settings is "blank apart from the standard navigation/breadcrumb and the title", line 161 says "Settings now only holds the Data Manager". Both cannot be true; PRD §9 supports line 158. Pre-existing, not created here.
2. **§7's "All configuration screens … are admin-only"** is imprecise for §7.1 (see §4.3). Left verbatim.
3. **The two Cycle 2 follow-ups:** the `:27`-vs-`:49` teardown contradiction in `finish-cycle.md`, and the prose reduction of Gate 2's classification paragraph.
4. **The three Cycle 3 deferred low findings** (parser multi-line comments and `node:test` badge; `formatCell` inside `data-id`).
5. **`docs/OPERATIONAL_MANUAL.html` is NOT regenerated.** It is an `.html` file under `docs/`, which does not qualify under `scripts/classify-cycle.mjs`, so regenerating it would flip the cycle to ordinary and make browser verification mandatory. Regeneration stays on-request per §5b. The standing obligation — a reconciliation audit before any regeneration — is unaffected by this cycle and arguably easier to satisfy afterwards, which is the point.

## 7. Risks and how they are handled

| Risk | Handling |
|---|---|
| Rewriting instead of moving, manufacturing false claims | §4.4's four-edit allowlist; acceptance criterion 4 proves it by diff |
| A cross-reference breaks in the split | Numbering kept (decision 3), so only `§12`/`§14`/`§3.3` can break — all three enumerated and handled |
| Narrative deleted from the tree without a home | Acceptance criterion 6: move to the `docs/` file first, truncate second |
| One non-`.md` path flips the cycle to ordinary | Acceptance criterion 11; `classify-cycle.mjs` run, not assumed (criterion 9) |
| A BOM corrupts an edited file | Edits via the `Edit`/`Write` tools, never PowerShell `Get-Content`/`Set-Content`; verified with `git diff --numstat` plus a first-bytes check (`feedback_powershell_bom_html_edits`) |

### A note on the CRLF warning in the brief

The brief warns that `PRD.md`/`ARCHITECTURE.md` are CRLF and that an edit may produce line-ending noise. **Verified and refined:** `core.autocrlf=true` in this repo and `git ls-files --eol` reports `i/lf w/crlf` for both files — the index is already LF and git normalizes on commit, so a tool writing LF in the worktree produces no spurious diff. The real hazard in that memory is the **BOM**, which git does not normalize and which showed up as 15 modified pages in the B2 cycle. The handling above targets the BOM; the line endings need no special round trip. This is recorded so a future cycle does not re-derive a trap that is not there.

## 8. Gate consequences of the no-code branch

This is expected to be the **first cycle ever to walk Gate 2's no-code branch** (Cycles 1 and 2 could not — `/finish-cycle` loads its text from the main checkout — and Cycle 3 was `ordinary`). Treat it as unverified. Per PROCESS.md §6 4c:

- Gate 2 shows the diff and asks to **confirm the classification**; it does not offer the Docker stack, does not run the spec/plan archaeology, and does not ask the browser question.
- It **tears down nothing**: it runs `scripts/test-branch.sh status` read-only and reports a stack left by an earlier attempt.
- **Gate 4's out-of-scope check does not fire**, because steps 2–5 identify no plan file. This must be annotated in the cycle report.
- Gate 3 is **not** skipped. Step 0's background `/code-review` launch applies on both branches.
- A "no" to the classification question degrades to the ordinary branch; it does not stop the cycle.
