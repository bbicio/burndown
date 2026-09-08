# Timesheets Actuals Buttons Relabel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `timesheets.html`'s actuals-management button labels (`⬇ XLSX` → `⬇ Download actuals`, `🗑 Delete all` → `🗑 Delete actuals`) and the matching hint text, to align with the wording already used on `portfolio.html`/`project-config.html`.

**Architecture:** Three literal string replacements in one file (`timesheets.html`). No JS logic, function names, or `@click` bindings change.

**Tech Stack:** Vue 3 (CDN, no build step) — template text only.

## Global Constraints

- No behavior change — `downloadXlsx(r)` and `deleteCode(r)` bindings, and their implementations, stay exactly as they are.
- `👁 View` stays unchanged.
- No upload/"Load Actuals" button is added to this page (already absent, stays absent).
- The native `confirm()` in `deleteCode()` (`timesheets.html:315`) is explicitly out of scope — do not touch it.

---

## File Structure

- **Modify:** `timesheets.html` — three string changes: two button labels (lines 131, 138) and one hint-text sentence (line 57). No other file is touched.

---

### Task 1: Relabel the actuals buttons and hint text

**Files:**
- Modify: `timesheets.html:57`, `timesheets.html:131`, `timesheets.html:138`

**Interfaces:**
- None — this task has no consumers and consumes nothing from elsewhere. It's a self-contained text change.

- [ ] **Step 1: Update the hint text**

Find, in `timesheets.html` (around line 57):

```html
      <strong>Delete all</strong> permanently removes every timesheet row for that project from the database.
```

Replace with:

```html
      <strong>Delete actuals</strong> permanently removes every timesheet row for that project from the database.
```

- [ ] **Step 2: Rename the XLSX button**

Find, in `timesheets.html` (around line 129-132):

```html
                <button class="btn btn-outline-primary btn-sm me-1" style="font-size:.78rem"
                        @click="downloadXlsx(r)">
                  ⬇ XLSX
                </button>
```

Replace the button text only:

```html
                <button class="btn btn-outline-primary btn-sm me-1" style="font-size:.78rem"
                        @click="downloadXlsx(r)">
                  ⬇ Download actuals
                </button>
```

(The `@click="downloadXlsx(r)"` binding and every other attribute stay exactly as they are — only the text node between the tags changes.)

- [ ] **Step 3: Rename the Delete button**

Find, in `timesheets.html` (around line 133-139):

```html
                <button class="btn btn-outline-danger btn-sm"
                        style="font-size:.78rem"
                        :disabled="r._loading"
                        @click="deleteCode(r)">
                  <span v-if="r._loading" class="spinner-border spinner-border-sm"></span>
                  <span v-else>🗑 Delete all</span>
                </button>
```

Replace the text inside the `v-else` span only:

```html
                <button class="btn btn-outline-danger btn-sm"
                        style="font-size:.78rem"
                        :disabled="r._loading"
                        @click="deleteCode(r)">
                  <span v-if="r._loading" class="spinner-border spinner-border-sm"></span>
                  <span v-else>🗑 Delete actuals</span>
                </button>
```

(The `:disabled="r._loading"`/`@click="deleteCode(r)"` bindings and the loading-spinner `v-if` branch stay exactly as they are.)

- [ ] **Step 4: Manual verification**

```bash
scripts/test-branch.sh up
```

- Open `/timesheets.html` as admin. Confirm the hint paragraph now reads "**Delete actuals** permanently removes every timesheet row for that project from the database."
- Confirm each row's action buttons now read `👁 View`, `⬇ Download actuals`, `🗑 Delete actuals` — in that order, no other buttons.
- Click `⬇ Download actuals` on a row with data: confirm it still downloads a `.xlsx` file (unchanged behavior — same `downloadXlsx(r)` method as before the rename).
- Click `🗑 Delete actuals` on a row: confirm the same confirm-dialog and delete behavior as before (unchanged — same `deleteCode(r)` method), and the loading spinner still appears while the request is in flight.
- Confirm `👁 View` still opens the row-detail modal, unchanged.
- Tear down: `scripts/test-branch.sh down`.

- [ ] **Step 5: Commit**

```bash
git add timesheets.html
git commit -m "$(cat <<'EOF'
docs: relabel timesheets.html actuals buttons to match portfolio.html/project-config.html wording

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Czd2T16Y3TbXF4H5XCVRog
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all 3 string changes from the design doc (hint text, XLSX button, Delete button) are covered by Task 1's steps 1-3; `👁 View` unchanged (step 4 confirms) and no upload button added (step 4 confirms) — both design requirements that need no code change, verified rather than implemented.
- **Placeholder scan:** no TBD/TODO; every step shows the literal before/after HTML.
- **Type consistency:** N/A — no functions, types, or cross-task interfaces exist in a single-task, text-only plan.
