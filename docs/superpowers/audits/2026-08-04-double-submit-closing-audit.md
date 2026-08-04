# Double-Submit Closing Audit

**Date:** 2026-08-04

## Scope

Negotiated with the user before reading any code: systematically check every user-triggered async action anywhere in the app (Save/Submit/Create/Delete/Clone/Generate/Publish/Login/Invite/Upload — any real network round-trip, not a purely local UI toggle) for protection against a fast repeat click. Covers all 13 Vue pages and all classic scripts in `js/`.

Out of bounds: purely local actions (UI toggles, filters, navigation), and the specific actions already fixed or confirmed safe across the 4 prior cycles of this roadmap — those are treated as ground truth, not re-verified from scratch. Ground truth patterns already established as safe:
- Explicit guard-and-disable (`if (btn.disabled) return; btn.disabled = true;` synchronous, before or immediately after purely-synchronous validation, `try/finally` re-enable) — `js/ai.js`'s `aiPlanSend()`, `js/clients.js`'s `saveClientFromModal()`, `js/costgrid.js`'s `cgSaveVersion()`/`cgCreateNewGrid()`/`cgCloneGrid()`.
- `showConfirm()`'s own closure-scoped `clicked` guard (`js/core.js:363-370`) — protects every one of its call sites automatically.
- Native, page-blocking browser dialogs (`prompt()`, `confirm()`, a native `<input type="file">` picker) — inherently un-double-clickable, confirmed safe for `costgrid.html`'s Generate Project flow and `timesheets.html`'s delete flow.
- A modal hidden as the literal first synchronous statement of a click handler, before any `await` — confirmed safe for `_cgEnsureAddToProjectModal()`'s Confirm button.

## Method

Grepped every `.html` page for `@click="..."` bindings and every classic script in `js/` for `addEventListener('click', ...)`/`onclick=` handlers whose target method performs a network call (`Api.*`, `fetch(...)`, `apiFetch(...)`). For each one not already covered by the 4 prior cycles, read the method body and classified it as: (a) has an explicit imperative re-entry guard, (b) relies on a Vue-reactive `:disabled` binding set as the async method's first statement, (c) has no protection of any kind, or (d) is inherently safe via a blocking native dialog / synchronous-before-`await` pattern.

For pattern (b) — reactive-binding-only — the theoretical concern was whether Vue's microtask-batched DOM update could leave a race window for a second real click to land before the `disabled` attribute actually paints. This was tested empirically rather than assumed: on `config.html`, `Api.clients.create` was stubbed to a slow, always-failing call (never touching the real backend), and two genuine, separate `computer`-tool mouse clicks (real OS-level input events, not synchronous JS invocations) were fired on the real "Create" button in the real mounted Vue app. Result: `createCallCount` was `1`, not `2` — confirming that a real double-click, dispatched as two separate browser tasks, has the microtask queue (including Vue's reactive DOM flush) drain between them, so the second click lands on an already-disabled (and therefore non-event-receiving) button. This differs from the earlier synchronous `Promise.all([...])`-style tests used in prior cycles, which simulate a same-tick double-invocation more aggressive than a real click and were the right tool for verifying an explicit guard's correctness — but are not, on their own, evidence that an *unguarded* Vue-reactive-only pattern is exploitable by a real user.

## Findings

### Finding 1: `project-config.html`'s `saveClientModal()`/`saveProgramModal()` have zero protection against a repeat click

- **Type:** Missing double-submit guard
- **Severity:** Medium — real, currently-reachable duplicate-record risk, but a narrower blast radius than the bugs the 4 prior cycles fixed (affects only newly-added clients/programs from this one nested-modal flow, not proposals/clones/timesheet data)
- **Location:** `project-config.html:645-656` (`saveClientModal`), `project-config.html:661-674` (`saveProgramModal`); trigger buttons at `project-config.html:287` and `project-config.html:300`

**Evidence** (`project-config.html:645-656`):
```js
async saveClientModal() {
  const name = this.clientModal.name.trim();
  if (!name) { this.clientModal.error = 'Name is required.'; return; }
  try {
    const created = await Api.clients.create(name);
    await loadClientsFromApi();
    this.project.clientId = created.id;
    bootstrap.Modal.getInstance(document.getElementById('clientEditModal'))?.hide();
  } catch (e) {
    this.clientModal.error = e.message || 'Save failed.';
  }
},
```
`saveProgramModal()` (`project-config.html:661-674`) is structurally identical, calling `Api.programs.create(id, name)`.

Neither the Save button (`project-config.html:287`, `project-config.html:300` — both plain `<button class="btn btn-primary btn-sm" @click="saveClientModal">Save</button>` / `@click="saveProgramModal"`, no `:disabled` attribute at all) nor the method body itself sets *any* loading/busy flag — not even the Vue-reactive-only pattern confirmed safe elsewhere in this same audit. This is a stricter absence of protection than the reactive-only pattern: there is no mechanism, synchronous or asynchronous, standing between a real click and a second real click both reaching `Api.clients.create(name)`/`Api.programs.create(id, name)`.

**Root cause:** `project-config.html` has its own independent, small "add a client/program from inside this form" flow — a duplicate of the functionality `js/clients.js`'s `saveClientFromModal()` (already fixed in Cycle 1) and `config.html`'s `saveClient()` (already using the reactive-flag pattern) provide, but implemented separately rather than reusing either. Cycle 4's report already flagged this exact function ("New finding, out of scope for this cycle... not caught by the original investigation, which only scanned `js/clients.js`, not every page's own inline duplicate logic") — this audit confirms it as a genuine, still-open gap and adds `saveProgramModal()` as a second instance of the identical pattern, not previously named.

**Suggested fix shape** (not applied — audits don't fix): add a `saving`/`loading` flag to `this.clientModal`/`this.programModal`, set as the first statement of each method (matching the pattern already used by this same file's own `onSave()`, `project-config.html:601`), bound to the Save button's `:disabled`.

## Ruled out

Checked and confirmed already protected, with citations, beyond what the 4 prior cycles' own reports already establish:

- **`costgrid.html`'s `deleteVersion()`/`deletePhase()`/`deleteTask()`** (`costgrid.html:945-949`, `costgrid.html:1021-1032`) and **`pipeline.html`'s `deleteSelectedVersion()`/`confirmRefreshRate()`** (`pipeline.html:632-650`) — all route through `showConfirm()` (via `cgConfirmDeleteVersion`/`cgConfirmDeleteGrid`, `js/costgrid.js:267-311`, or directly), covered by Cycle 3's general fix.
- **`config.html`'s `saveClient()`** (`config.html:1349-1357`) and, by the same structural pattern, its five siblings (`saveGroup`, `createPipelineYear`, `savePot`, `activateCurrency`, `saveProgram`, `saveRole`) — Vue-reactive `loading` flag set as the first statement after purely-synchronous validation; empirically confirmed safe against a real double-click (see Method).
- **`admin.html`'s `saveTerms()`** (`admin.html:413-414`) and **`submitInvite()`** (`admin.html:309-311`) — same reactive-flag-first pattern, `invite.loading` additionally already paired with a visible spinner (`admin.html:228`).
- **`terms.html`'s `accept()`** (`terms.html:119-121`), **`login.html`'s `login()`/`forgotPassword()`** (`login.html:119-140`), **`activate.html`'s `activate()`** (`activate.html:166-170`), **`reset-password.html`'s `resetPassword()`** (`reset-password.html:157-161`) — same pattern; `activate()`/`resetPassword()`'s extra `if (!this.canSubmit) return;` guard is a form-validity check (password length/match, `activate.html:132-134`), not a re-entry guard, but doesn't need to be one given the reactive-flag timing is already confirmed safe.
- **`_db-reset.html`'s `confirmDelete()`/`_doScopeDelete()`/`_doCgDelete()`/`changeOwner()`** (`_db-reset.html:206-220+`) — same pattern (`confirmBusy`/`ownerChangeBusy` set first).
- **`timesheets.html`'s `deleteCode()`** (`timesheets.html:199-211`) — additionally protected by a native, page-blocking `confirm()` before the loading flag is even reached; the delete button already has both `:disabled="r._loading"` and a visible spinner (`timesheets.html:89-94`).
- **`js/shares.js`'s `_shareAddUser`/`_shareUpdatePerm`** (`js/shares.js:96,115,271,293`) and **`js/ratecards.js`'s create/save-entries paths** (`js/ratecards.js:174,185,373,387`) — classic-script direct-DOM `btn.disabled = true`/`= false` pairs, same idiom already fixed into `js/ai.js`/`js/clients.js`/`js/costgrid.js` in prior cycles.
- **`js/nav.js`'s Send Notification** (`js/nav.js:572-590`) — validation checks before `sendBtn.disabled = true` are all synchronous (no `await` between the click firing and the disable), so — per the same single-threaded-JS reasoning already applied to `saveClientFromModal()`'s guard placement in Cycle 1's own code review — a second click cannot interleave before the button disables, with no explicit guard needed.
- **`portfolio.html`'s Load Actuals** (`portfolio.html:1063-1066`, `1868-1871`) and **`costgrid.html`'s Generate Project / Add-to-Project flows** — already confirmed safe in Cycle 4's own report (native file-picker / native `prompt()` / synchronous-before-`await` modal hide); not re-investigated here.

## Out of scope / roadmap notes

None. Everything surfaced during this audit either fits the negotiated scope directly (Finding 1) or was a "ruled out" check within that same scope. No unrelated pattern or second domain surfaced.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
