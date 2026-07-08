# /sync-docs — Sync all project documentation

Review all recent code changes in this session (and git diff if needed) and update the following files so they accurately reflect the current state of the codebase. Do NOT invent features that don't exist — only document what is actually implemented.

## Files to update

### 1. ARCHITECTURE.md
- Update any section that describes modules, API endpoints, DB schema, or architectural patterns that changed.
- If a new JS module was added or its responsibilities changed, update the file tree and its description.
- If a new API endpoint was added or its auth changed (requireAuth vs requireAdmin), update the API Reference table.
- If a new DB migration was applied, add it to the migrations list.
- If a new frontend behaviour was introduced (e.g. new modal, new state variable, new data flow), add or update the relevant section.

### 2. CLAUDE.md
- Update the file structure table (`js/`, `api/src/routes/`, etc.) if any file was added, removed, or its purpose changed.
- Update the Pages table if a new page was added or its purpose changed.
- Update any architectural notes (routing, data strategy, settings modal, notifications, etc.) that are now outdated.

### 3. TEST_CASES.md
- For every new feature or bug fix, add one or more test cases in the appropriate section.
- For changed behaviour, update the existing test case description and expected result.
- For removed features, remove or mark the test case as obsolete.
- Mark automated cases with ✓ in the Auto column if they are covered by test-api.js.

### 4. test-cases.html
- Mirror every change made to TEST_CASES.md exactly:
  - New cases → add `{id, scenario, steps, expected, auto}` objects to the correct section array.
  - Updated cases → update the matching object fields.
  - Removed cases → remove the object.
  - `auto:true` only when the case is covered by an automated API test in test-api.js.

### 5. test-api.js (only if new API endpoints were added or auth rules changed)
- Add test functions for new endpoints following the existing pattern (section header, ok() assertions, cleanup via later()).
- If an endpoint's auth changed (e.g. requireAdmin → requireAuth), update the SEC-01 loop or add a new security assertion.
- Call new test functions from main() in a logical order.

### 6. PRD.md (only if user-visible behaviour changed)
- Trigger only when the change alters what a user can do, see, or experience: a new page/view, a new feature, a changed user flow, a changed permission/role behaviour, or a UI element added/removed that affects how the product is used.
- Do NOT trigger for internal refactors, extracted modules, added tests, dev tooling, or changes to files/functions that produce byte-identical user-facing behaviour — even if extensive.
- If the change is a bugfix, update PRD.md only if the PRD's description of the feature was itself inaccurate (i.e. the bug meant the PRD never matched reality); do not update it for fixes that restore documented behaviour.
- When in doubt whether a change is "user-visible," state the ambiguity in the summary and leave PRD.md untouched — flagging beats guessing.

### 7. docs/superpowers/PROCESS.md (only if the cycle changed the development *process* itself, not the product)

**PROCESS.md gate** — answer this as an explicit yes/no before deciding whether to touch the file. Does the cycle just closed satisfy **at least one** of:
1. It introduced or modified one of the process skills (`feature-brief`, the audit skill, `audit-to-brief`).
2. It introduced an exception to the standard process expected to be **recurring** (not a one-off already documented in that single cycle's own report).
3. It modified the common 7-phase skeleton, or the scenario-specific guardrails for one of the three scenarios (new feature / evolution / audit-fix).

- If **none** of the three is true → do not touch `PROCESS.md`; proceed normally with the other `/sync-docs` outputs.
- If **at least one** is true → update the relevant section of `PROCESS.md`, and note in the cycle's own report which of the three conditions triggered the update.

A cycle that merely *executes* the process as documented — the large majority of cycles — is not material for this file; it stays in that cycle's own report, not here.

## Process

1. Read the current state of each file before editing.
2. Cross-reference against the actual code (js/, api/src/routes/, costgrid.html, config.html, etc.) to verify what changed.
3. Make targeted edits — do not rewrite sections that are still accurate.
4. Report a brief summary at the end: which files were updated and what changed in each. Always explicitly state whether PRD.md was evaluated and the outcome — updated / not necessary (internal-only change) / ambiguous (needs human verification) — even when PRD.md itself was left untouched. Always explicitly state the PROCESS.md gate's answer (which of the three conditions applied, or none) — even when PROCESS.md itself was left untouched.
