# Finish-cycle report — worktree-config-tabs-reorder-roles-currency

**Date:** 2026-09-17
**Branch:** worktree-config-tabs-reorder-roles-currency → main

## What was done

1 commit:
- `0f39f2a` feat: reorder config.html tabs, hide Programs, filter Roles form to active currencies
  - Config nav tab order changed to Currencies, Roles, Clients, Client Groups, Pipelines & POTs.
  - "Programs" tab button hidden from nav (program creation now happens via `project-config.html` and Generate Project's auto-link flow); the panel, `programs` data, and CRUD methods are untouched and still functional, just unreachable from this nav — confirmed nothing else in the file can set `activeTab = 'programs'`. Rename/delete UI entry point explicitly deferred as an open follow-up (not an oversight).
  - Roles Add/Edit form's per-currency rate fields now filter on `c.active`, fixing a real divergence: the app previously showed a field for every non-EUR currency regardless of activation status, contradicting PRD.md's own already-documented "one field per active currency" behavior.

## Code review follow-ups

Round 1: 0 findings. One clarifying (non-actionable) note confirmed that two similarly-shaped currency filters elsewhere in the codebase (`js/ratecards.js`, another spot in `config.html`) did NOT need the same fix — they already read from a pre-filtered active-only data source (`window.__currencies`, populated by `Api.currencies.active()`), unlike the fixed field which reads the page's own unfiltered `currencies` list (`Api.currencies.list()`).

None remain as follow-ups.

## Roadmap notes

- Programs tab is now hidden from `config.html`'s nav with no replacement UI for renaming or deleting an existing program (creation is available elsewhere). Revisiting where that capability should live is an explicitly open item, flagged in PRD.md §7.5 and CLAUDE.md.

## Sync-docs outcome

- **PRD.md**: updated (in the feature commit itself, §7.5 Programs and the tab enumerations in §7.6/§7.7) — verified accurate, no further change needed.
- **CLAUDE.md**: updated (in the feature commit itself, `config.html`'s file-structure entry) — verified accurate.
- **TEST_CASES.md / test-cases.html**: updated (in the feature commit itself, new CN-01/CN-02 section and RL-04/RL-05) — verified accurate and in sync between the two.
- **ARCHITECTURE.md**: not touched — this file documents API/DB/architecture, not UI tab enumeration; its one loosely-related line (config.html's role-edit-form mention) remains accurate without needing detail on the active-currency filter.
- **test-api.js**: not evaluated as needing a change — no API endpoint or auth rule changed, this was a pure frontend markup/template change.
- **PROCESS.md gate**: none of the three conditions applied (no process-skill change, no recurring exception, no skeleton/guardrail change) — a pure bounded UI cycle. PROCESS.md left untouched.
