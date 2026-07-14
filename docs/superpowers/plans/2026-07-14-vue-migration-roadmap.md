# Vue 3 Migration Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `migration.html` tool and its stale documentation references, as the one concrete deliverable of this cycle — the roadmap itself (Tier 1: `terms.html` → `_db-reset.html`; Tier 2: the 5-page shared-dependency cluster, order/consolidation deferred) is already recorded in `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md` and needs no code changes.

**Architecture:** Single-file deletion (`migration.html`) plus four documentation edits that remove every reference to it. No application logic changes — `migration.html` is a standalone page with no other file importing or linking to it (confirmed by repo-wide grep in the design spec).

**Tech Stack:** Static HTML page removal; Markdown doc edits; no build step, no test framework changes.

## Global Constraints

- Do not touch any of the 9 pages' actual migration to Vue — this plan only removes `migration.html` and documents the roadmap decision already written to the design spec. Actual per-page migrations are future, separate Scenario 2 cycles.
- No backend/API changes.
- `TEST_CASES.md` and `test-cases.html` must stay mirrored exactly (project convention, `CLAUDE.md`/`sync-docs` skill) — every edit to one happens identically in the other.

---

## File Structure

- Delete: `migration.html`.
- Modify: `CLAUDE.md` (Pages table, line 65) — remove the `migration.html` row.
- Modify: `ARCHITECTURE.md` (file tree line 706, §8 Migration Strategy text lines 718-722) — remove the file-tree line, update the prose to say the tool has been removed.
- Modify: `TEST_CASES.md` (line 309) — remove the AD-10 row (its assertion — "no Data Migration button, tool unreachable" — has no subject left to describe once the file is gone).
- Modify: `test-cases.html` (the `AD-10` object) — mirror the same removal.

---

### Task 1: Delete `migration.html` and remove every stale reference to it

**Files:**
- Delete: `migration.html`
- Modify: `CLAUDE.md:65`
- Modify: `ARCHITECTURE.md:706`, `ARCHITECTURE.md:718-722`
- Modify: `TEST_CASES.md:309`
- Modify: `test-cases.html` (`AD-10` entry, currently at lines 900-902)

**Interfaces:** None — this task has no code interfaces; it's a file removal plus documentation edits.

- [ ] **Step 1: Verify no other file references `migration.html` before deleting**

Run from the repo root:

```bash
grep -rn "migration\.html" --include="*.html" --include="*.js" .
```

Expected: no output (or only matches inside `migration.html` itself, which is about to be deleted). This confirms no `<script src>`, `<a href>`, or JS reference from any other page would break. If this returns an unexpected match in another `.html`/`.js` file, STOP — do not proceed with deletion; report it instead, since that would mean the design spec's "no other file references it" claim was wrong.

- [ ] **Step 2: Delete the file**

```bash
git rm migration.html
```

- [ ] **Step 3: Update `CLAUDE.md`'s Pages table**

Find (around line 65):

```markdown
| `migration.html` | `/migration.html` | One-time data migration tool |
```

Delete this line entirely (the table's other rows are unaffected — no renumbering needed, it's a Markdown table keyed by content, not position).

- [ ] **Step 4: Update `ARCHITECTURE.md`'s file tree**

Find (around line 706):

```
  migration.html          ← one-time localStorage → API migration tool
```

Delete this line entirely from the file-tree code block.

- [ ] **Step 5: Update `ARCHITECTURE.md`'s §8 Migration Strategy text**

Find (around lines 718-722):

```markdown
## 8. Migration Strategy

**Status: Complete.** The localStorage → API migration has been completed. **localStorage is no longer used for server data.**

The `migration.html` tool was used for the one-time migration of existing localStorage data into the PostgreSQL database. It is kept in the repo for reference and disaster recovery but is no longer needed for new installations.
```

Replace the last paragraph with:

```markdown
## 8. Migration Strategy

**Status: Complete.** The localStorage → API migration has been completed. **localStorage is no longer used for server data.**

The `migration.html` tool was used for the one-time migration of existing localStorage data into the PostgreSQL database. It has been removed from the repo (`docs/superpowers/plans/2026-07-14-vue-migration-roadmap.md`) — the migration itself is long complete and the tool was already unreachable from the UI (see `TEST_CASES.md` AD-10, prior to this cycle).
```

- [ ] **Step 6: Remove the AD-10 test case from `TEST_CASES.md`**

Find (around line 309):

```markdown
| AD-10 | Data Migration button absent | Open admin.html | No "↑ Data Migration" button — migration.html is no longer linked from the UI | |
```

Delete this row entirely. Do not renumber the surrounding `AD-09`/`AD-11` rows — this project's test-case IDs are stable identifiers, not positional (consistent with how other removed/obsolete cases have been handled in this repo's history).

- [ ] **Step 7: Remove the mirrored `AD-10` entry from `test-cases.html`**

Find (around lines 900-902):

```js
    {id:'AD-10',scenario:'Data Migration button absent',
     steps:'Open /admin.html and inspect the page header',
     expected:'No "↑ Data Migration" button — migration.html is no longer linked from the UI'},
```

Delete this object entirely from the `admin` section's `cases` array. Leave the surrounding `AD-09`/`AD-11` objects and the trailing comma structure intact (removing the middle object of an array keeps valid JS as long as the comma pattern isn't broken — verify the array still parses by checking `AD-11`'s object still ends with `},` and `AD-09`'s still ends with `},` immediately before the (now-adjacent) `AD-11` entry).

- [ ] **Step 8: Verify no remaining references**

```bash
grep -rn "migration\.html" --include="*.html" --include="*.md" --include="*.js" . | grep -v "docs/superpowers/"
```

Expected: no output. (The `docs/superpowers/` exclusion is deliberate — the Brief, design spec, and this plan itself legitimately mention `migration.html` as a historical record of the deletion decision; those are not stale references to fix.)

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md ARCHITECTURE.md TEST_CASES.md test-cases.html
git commit -m "chore: remove dead migration.html tool and its stale doc references

One-time localStorage->API migration tool, already unreachable from
the UI (AD-10) and documented as no-longer-needed in ARCHITECTURE.md
Sec8. Confirmed via repo-wide grep that no other file references it.

Part of the Vue 3 migration roadmap's Tier 1 prep:
docs/superpowers/specs/2026-07-14-vue-migration-roadmap-design.md"
```

---

## Self-Review Notes

- **Spec coverage:** the design spec's "Deletion of `migration.html`" section lists exactly four doc updates (`CLAUDE.md` Pages table, `ARCHITECTURE.md` file tree + §8 text, `TEST_CASES.md`/`test-cases.html` AD-10) plus the file deletion itself — all five are covered by Steps 2-7. The design spec's roadmap (Tier 1/Tier 2 order, consolidation deferral) requires no implementation task — it's already the committed design spec document, which is the deliverable for that part of the Brief's acceptance criteria.
- **Placeholder scan:** no TBD/TODO; every step has the exact before/after text or an exact command.
- **Type consistency:** N/A — no code interfaces in this task, only file/doc edits.
