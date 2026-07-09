# Status Vocabulary Reconciliation — Design Spec

**Source:** `docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`, Finding F1, F2, F3. Brief: `docs/superpowers/specs/2026-07-09-status-vocabulary-reconciliation-brief.md`.

## Problem

`cfgApplyPipelineRules` (`js/core.js:391-421`) is the single source of truth for which project statuses are selectable per pipeline stage in `project-config.html`'s Status dropdown. It fully regenerates the `<select>`'s options every time it runs (on form load, `js/config-form.js:105`, and on every pipeline change, `js/main.js:137`), overriding the static markup at `project-config.html:65`. Its internal `allowed`/`allOpts` construct has three independent defects:

- **F1** — `Committed` excludes `Started At Risk`, while `Expected`/`Anticipated` both include it. No documented reason (`PRD.md` doesn't specify the pipeline→status relationship at all).
- **F2** — every option list ends in `'Complete'` (no "d"), but `statusBadge`/`statusBadgeLarge` (`js/core.js:330-349`) and the Resource Planning eligible-projects filter (`js/planning.js:471`) both check for `'Completed'`. A project marked complete through this dropdown never gets the correct badge color and is never excluded from the Planning view.
- **F3** — the `allowed` map has three keys (`'Started'`, `'Started at risk'`, `'On Hold'`) that are not valid pipeline stages (`CLAUDE.md:231`'s five: `SIP`/`Expected`/`Anticipated`/`Committed`/`Canceled`) and are never reachable — evidence the map was authored by conflating status values with pipeline-stage keys, likely the mechanism behind F1.

No legacy data is affected: confirmed with the user that no project currently has `status: 'Complete'` saved, so no migration or backward-compatibility handling is needed for existing data.

## Design

### Module: `js/lib/status-rules.js`

New ES module, following the existing `js/lib/cfg-parse.js`/`js/lib/planning-calc.js` pattern (native `export function`, `window.<name>` bridge for classic-script callers), loaded via `<script type="module">` before `js/core.js` on every page that uses it.

```js
export function getStatusRule(pipeline) {
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Completed'];
  const rules = {
    'SIP':         { options: [],   disabled: true },
    'Expected':    { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Anticipated': { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Committed':   { options: ['Started', 'Started At Risk', 'Put on hold', 'Completed'],          disabled: false },
    'Canceled':    { options: null,  disabled: true }, // null = keep current options/value as-is
  };
  return rules[pipeline] || { options: allOpts, disabled: false };
}

window.getStatusRule = getStatusRule;
```

This single pure function captures the entire business rule as testable data — the full allowed-options-per-pipeline table, including the two special cases (`SIP`: no status applicable, empty+disabled; `Canceled`: preserve whatever is already there, just disable). Only 5 real pipeline-stage keys exist; any other input (empty string, or a future/unexpected value) falls back to the full `allOpts` list, matching today's `opts || allOpts` fallback behavior.

### Integration: `js/core.js`

`cfgApplyPipelineRules(pipeline, currentStatus)` becomes a thin DOM-manipulation wrapper around `getStatusRule`:

```js
function cfgApplyPipelineRules(pipeline, currentStatus) {
  const sel = document.getElementById('cfgStatus');
  const { options, disabled } = getStatusRule(pipeline);

  if (options === null) {          // Canceled: leave existing options/value untouched, just disable
    sel.disabled = true;
    return;
  }
  sel.innerHTML = '<option value="">— Select —</option>' +
    options.map(o => `<option value="${o}">${o}</option>`).join('');
  sel.disabled = disabled;         // true only for SIP (options = [])
  sel.value = options.includes(currentStatus) ? currentStatus : '';
}
```

No change to either existing call site (`js/config-form.js:105`, `js/main.js:137`) — same function signature, same externally observable contract, except for the F1/F2/F3 corrections themselves.

### Error handling

None required: `getStatusRule` is a pure function with no I/O, always returns a valid `{ options, disabled }` shape. The `rules[pipeline] || { options: allOpts, disabled: false }` fallback covers every input, including an empty string (initial/no-pipeline state) or an unrecognized value, mirroring the original code's existing fallback behavior.

### Testing

New `js/lib/status-rules.test.js` (vitest, no DOM needed — pure function):

- `getStatusRule('SIP')` → `{ options: [], disabled: true }`
- `getStatusRule('Canceled')` → `{ options: null, disabled: true }`
- `getStatusRule('Committed')` includes `'Started At Risk'` and `'Completed'`, and does **not** include `'Complete'` — the test that pins F1's and F2's fixes directly
- `getStatusRule('Expected')` and `getStatusRule('Anticipated')` return the same status set as each other (symmetry check)
- `getStatusRule('')` and `getStatusRule('unknown-value')` both fall back to the full 5-option `allOpts` list, using `'Completed'`

**Not automated** (DOM-render call site, same precedent as prior cycles' wiring tasks): `cfgApplyPipelineRules`'s own integration in `js/core.js`. Verified manually in the browser: the Status dropdown for a `Committed` project shows `Started At Risk`; saving `Completed` produces the correct navy badge (`statusBadge`/`statusBadgeLarge`) and the project is excluded from the Resource Planning eligible-projects list (`js/planning.js:471`).

## Backward compatibility

No legacy data exists with `status: 'Complete'` (confirmed with the user) — no migration or compatibility shim is needed. `SIP` and `Canceled` behavior is unchanged (verified correct by the source audit, in its "Ruled out" section) — this design preserves both exactly.

## Explicitly out of scope

- F4 (Generate Project lock granularity) — separate cycle, different file and root cause, tracked in its own Brief (`docs/superpowers/specs/2026-07-09-generate-project-lock-granularity-brief.md`).
- Any broader redesign of the status vocabulary beyond the three corrections (adding `Started At Risk` to `Committed`, using `'Completed'` consistently, removing the three dead map keys).
- Any data migration for existing `status` values — not needed per the "no legacy data" confirmation above.
