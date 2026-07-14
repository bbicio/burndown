# Vue 3 Migration Roadmap — Design Spec

**Source:** Brief `docs/superpowers/specs/2026-07-14-vue-migration-roadmap-brief.md`.

## Problem

9 pages remain Vanilla JS while 6 already run on Vue 3 (CDN, no build step). The Brief asked `/brainstorming` to resolve: migration order, how to handle the ruoli/client/programmi/ratecard duplication between `config.html` (Vue) and 5 Vanilla pages, and whether the 3 minor/administrative pages belong in the roadmap at all.

## Roadmap

### Tier 1 — isolated pages, no shared-module dependency

Verified via `grep` on `<script src=...>` tags: none of these load `js/roles.js`/`js/clients.js`/`js/programs.js`/`js/ratecards.js`, so each can be migrated independently, without first resolving the Tier 2 duplication question.

| Order | Page | Size | Notes |
|---|---|---|---|
| 1 | `terms.html` | 142 lines, self-contained inline `<script>` | Real user-facing page (T&C acceptance, shown on first login / version bump) but small and simple — validates the migration pattern with real stakes but contained blast radius. |
| 2 | `_db-reset.html` | 365 lines, self-contained inline `<script>` | Admin-only, hidden page (not linked from nav) — near-zero exposure risk, good second validation. |

`migration.html` (397 lines) is **removed from the roadmap** — see "Deletion of `migration.html`" below, folded into this cycle instead of migrated.

`index.html` (10 lines, `window.location.replace('/pipeline.html')`) is **excluded from the roadmap entirely** — it's a redirect one-liner, not a page with UI to migrate.

### Tier 2 — shared-dependency cluster

`project-config.html`, `pipeline.html`, `portfolio.html`, `costgrid.html`, `planning.html` all load `js/roles.js`/`js/clients.js`/`js/programs.js` (`costgrid.html` also `js/ratecards.js`) as shared modals (`CLAUDE.md:144,149-154`). None of these 5 can be migrated in isolation without a decision on the parallel Vue implementation already living in `config.html` (which manages the same client/roles/programs/ratecard entities with its own internal Vue code, loading none of the Vanilla helper files — verified via `config.html`'s `<script>` tags).

**Consolidation decision (resolved in `/brainstorming`):** do not consolidate the two implementations as standalone prep work ahead of any Tier 2 migration — that risks designing a shared abstraction before knowing how the first Tier 2 page will actually consume it (premature abstraction). Instead, this decision is deferred to the Brief/design of whichever Tier 2 page is migrated first: at that point, decide concretely whether to extract a shared Vue component (reusable by later Tier 2 pages) or keep two implementations running until the last Vanilla consumer is migrated. This roadmap does **not** pick a Tier 2 order — that's a separate future roadmap decision once Tier 1 validates the pattern.

### Deletion of `migration.html`

Confirmed with the user: `migration.html` (one-time localStorage → API migration tool) is never used and should be removed from the project outright, not migrated to Vue. Supporting evidence it's already effectively dead:
- `TEST_CASES.md:309` (AD-10): "No 'Data Migration' button — `migration.html` is no longer linked from the UI" — already unreachable via normal navigation, existing test case already documents this.
- `ARCHITECTURE.md:718-722` (§8 Migration Strategy): "**Status: Complete.** ... kept in the repo for reference and disaster recovery but is no longer needed for new installations."

Since this cycle is small, the deletion is folded into this same cycle rather than deferred:
- Delete `migration.html`.
- Remove its row from `CLAUDE.md`'s Pages table (`CLAUDE.md:65`).
- Remove its entry from `ARCHITECTURE.md`'s file tree (`ARCHITECTURE.md:706`) and update §8's Migration Strategy text (`ARCHITECTURE.md:718-722`) to state the tool has been removed (not just "no longer needed").
- `TEST_CASES.md:309` / `test-cases.html`'s AD-10 case ("Data Migration button absent") becomes moot once the file no longer exists — remove the case rather than leave it describing a now-nonexistent file's absence.

No other file references `migration.html` in a way that requires code changes (confirmed via repo-wide grep — only doc/test-case mentions, no `<script>` or `<a href>` reference from any other page).

## Testing

- **Tier 1/Tier 2 roadmap itself:** no code, nothing to test — this is a planning artifact.
- **`migration.html` deletion:** no automated test covers this file (it was never linked from nav, so no navigation test exercises it). Manual verification: confirm `admin.html` still renders correctly with no broken link (already guaranteed by AD-10 having passed previously — the button was already removed from the UI in a prior cycle, only the file itself remained). No `js/*.js` file imports or requires `migration.html` (it's a standalone page), so no reference-breakage risk elsewhere.
- **Future Tier 1/Tier 2 page migrations** (`terms.html`, `_db-reset.html`, and later the Tier 2 pages) are explicitly **not** implemented by this cycle — each gets its own Scenario 2 Brief → design → plan cycle, with its own testing section scoped to that page.

## Backward compatibility

No behavior change for any existing page. `migration.html` removal has no user-facing effect (already unreachable via UI navigation, per AD-10). This cycle produces the roadmap document and one small, low-risk deletion — no functional changes to any live page.

## Explicitly out of scope

- Actually migrating `terms.html`, `_db-reset.html`, or any Tier 2 page to Vue — each is a future, separate Scenario 2 cycle with its own Brief.
- Deciding the Tier 2 migration order — deferred until Tier 1 validates the pattern.
- Resolving the roles/clients/programs/ratecards consolidation — deferred to the first Tier 2 page's own cycle.
- Any build-step introduction (Vite/SFC) — Brief already confirmed CDN-only stays.
- Backend/API changes.
- Re-touching any of the 6 pages already on Vue.
