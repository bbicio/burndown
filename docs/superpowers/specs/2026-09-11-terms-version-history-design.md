# Design — Terms & Conditions version history

Brief: (inline, produced via `/feature-brief` in the same conversation as this spec — not a separate committed file)

## Overview

Today's T&C storage is a single overwritten row: `app_settings.terms_content`/`terms_version` (`api/src/db/migrations/015_app_settings.sql`). Every `PUT /api/app-settings/terms` call — draft save *or* publish — overwrites `terms_content` immediately (`api/src/routes/app-settings.js:36`); only `publishNewVersion: true` also bumps `terms_version`. There is no separate draft storage, so a "Save draft" changes what `terms.html`'s acceptance gate shows in real time, and publishing a new version permanently destroys the previous version's text — `users.terms_version` (`014_terms_accepted.sql`) records only the version *number* a user accepted, never a copy of what they actually agreed to.

This spec adds an append-only, immutable version-history table (`terms_versions`) alongside the existing draft mechanism, and separates "what `terms.html` shows" (latest published version) from "what the sysadmin editor is currently working on" (the draft).

## 1. Data model

```sql
-- 019_terms_versions.sql
CREATE TABLE terms_versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version       INTEGER NOT NULL UNIQUE,
  content       TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by  UUID REFERENCES users(id)
);

INSERT INTO terms_versions (version, content, published_at, published_by)
SELECT
  (SELECT value::int FROM app_settings WHERE key = 'terms_version'),
  (SELECT value FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_at FROM app_settings WHERE key = 'terms_content'),
  (SELECT updated_by FROM app_settings WHERE key = 'terms_content');
```

Rows in `terms_versions` are never updated or deleted by application code after insertion — the "immutable" guarantee is enforced by never writing an `UPDATE`/`DELETE` against this table anywhere in `api/src/routes/`, not by a DB-level trigger (consistent with this codebase's existing level of DB constraint usage — no other table in this schema uses triggers for write-protection).

`app_settings.terms_content`/`terms_version`/`updated_at`/`updated_by` are unchanged mechanically but change **role**: they now represent only the current **draft** — never read by `terms.html` or any acceptance-gate logic after this change ships.

`users.terms_version`/`terms_accepted_at` (`014_terms_accepted.sql`) are untouched — still the pointer to which published version a user accepted, now meaningfully joinable against `terms_versions.version` to retrieve the actual text.

## 2. Backend (`api/src/routes/app-settings.js`)

All sysadmin-only (`requireSysAdmin`) except `GET /terms`, which stays `requireAuth` (used by `terms.html`, any authenticated user).

### `GET /api/app-settings/terms` (existing, behavior changes)

Before:
```js
router.get('/terms', requireAuth, async (req, res, next) => {
  // reads app_settings.terms_content/terms_version/updated_at/updated_by
```

After: reads the latest row of `terms_versions` (`ORDER BY version DESC LIMIT 1`) instead. Response shape is unchanged (`{ version, content, updatedAt, updatedBy }`) — `updatedBy` now resolves `published_by` via the same `users` join pattern already used for `updated_by` today, so `terms.html` needs zero changes.

### `GET /api/app-settings/terms/draft` (new, sysadmin-only)

Returns the current draft — i.e. exactly what today's `GET /terms` used to return, read from `app_settings.terms_content`/`terms_version`/`updated_at`/`updated_by`. Same response shape as `GET /terms`. Used by `_terms-editor.html` on load, replacing its current `GET /terms` call.

### `PUT /api/app-settings/terms` (existing, behavior changes)

Same request shape (`{ content, publishNewVersion }`), same route, same guard.

- `publishNewVersion: false` (Save draft): writes only to `app_settings.terms_content`/`terms_version`(unchanged)/`updated_at`/`updated_by` — exactly today's draft-save code path, just no longer touching anything `terms.html` reads.
- `publishNewVersion: true` (Publish): computes `newVersion` as `MAX(version) + 1` from `terms_versions` (not from `app_settings.terms_version`, which could theoretically drift — `terms_versions` is now the source of truth for "what's the latest published version number"), inserts a new immutable row (`version`, `content`, `published_at = NOW()`, `published_by = req.user.id`), and — to keep the draft in sync so the next edit starts from what was just published — also writes the same content into `app_settings.terms_content`/`terms_version` (mirroring today's write, now redundant-but-harmless bookkeeping rather than the source of truth). Returns `{ ok: true, newVersion }`, unchanged shape.

### `GET /api/app-settings/terms/versions` (new, sysadmin-only)

Returns `terms_versions` ordered `version DESC`, **without** the `content` column (list view — could be arbitrarily large text, no need to ship it for a list row): `[{ version, publishedAt, publishedBy }, ...]`, `publishedBy` resolved via the same `users` join pattern.

### `GET /api/app-settings/terms/versions/:version` (new, sysadmin-only)

`:version` is the integer version number (not a UUID — matches how the frontend already thinks about versions, avoids exposing/requiring the internal `id`). Returns `{ version, content, publishedAt, publishedBy }` for that one row, 404 if no such version exists.

## 3. Frontend (`_terms-editor.html`)

- `created()`'s `loadTerms()` call is replaced by `loadDraft()`, hitting `GET /terms/draft` instead of `GET /terms` — same response handling, same `terms.*` state shape, just a different endpoint and a renamed method (`loadTerms` → `loadDraft`, since it no longer loads "the terms", it loads "the draft").
- `saveTerms()` is unchanged (still calls `PUT /terms` with the same body) except its success path also calls a new `loadVersions()` to refresh the history list after every save (draft or publish — cheap, keeps the list honest even though only publishes actually add a row).
- New state: `versions: []`, `versionsLoading: false`, `viewingVersion: null` (the version object currently shown in the read-only modal, or `null`).
- New method `loadVersions()`: `GET /terms/versions`, populates `versions`.
- New method `viewVersion(version)`: `GET /terms/versions/:version`, sets `viewingVersion` to the result, shows the modal (`bootstrap.Modal.getOrCreateInstance(...).show()` — same idiom already used elsewhere in this codebase, e.g. `timesheets.html`'s View modal).
- New markup: a "📜 Version History" card below the existing editor card, listing `versions` (version number, formatted `publishedAt` via the existing `fmtDate()`, `publishedBy`), each row with a "👁 View" button calling `viewVersion(v.version)`. A new `<div class="modal fade" id="versionViewModal">` (page-local, mirrors the existing card's structure) shows `viewingVersion.content` read-only (e.g. in a disabled `<textarea>` or a scrollable `<pre>` — plain text/HTML source display, no rendering, matching the main editor's own raw-HTML-in-a-textarea treatment) plus its version/date/publisher header line.
- `created()` also calls `loadVersions()` alongside `loadDraft()` (both awaited, e.g. `Promise.all`) before `ready = true`.

## 4. Error handling

- `GET /terms/versions/:version` 404s on an unknown version number (mirrors existing 404 conventions elsewhere in this route file's sibling routes, e.g. `reset.js`).
- `PUT /terms`'s publish path computing `newVersion` from `MAX(version)+1` inside the same transaction-less flow as today (this route has never used explicit transactions, and this spec doesn't introduce one — matches existing risk level, not a regression) — a race between two simultaneous publishes is a pre-existing class of risk (today's `app_settings.terms_version` read-then-increment has the identical race) and out of scope to fix here.
- Frontend: `loadDraft()`/`loadVersions()`/`viewVersion()` each wrap their `fetch` in try/catch reusing the existing `terms.msg`/`terms.msgOk` pattern for draft-load failures (already fixed in a prior cycle) and a parallel, separate error slot for the version-history list/modal (so a failed version-history load doesn't stomp on an unrelated draft-save success message, or vice versa) — e.g. `versionsError`/`viewVersionError`, following the same string-or-null convention as `terms.msg`.

## 5. Testing

No automated test harness covers `api/src/routes/app-settings.js` or `_terms-editor.html` today (frontend has no build-step test coverage for this page; backend has no route-level test harness beyond `test-api.js`'s integration suite, which doesn't currently exercise this route at all). This spec doesn't introduce one — consistent with the existing level of coverage for this feature area. Verification is manual, in-browser, against an isolated stack (`scripts/test-branch.sh`), covering:

- Fresh migration: existing live content appears as version 1 (or whatever the pre-migration `terms_version` was) in the new Version History list, with correct `publishedAt`/`publishedBy`.
- Save draft does not change what `terms.html` shows to a user who hasn't yet accepted the current version.
- Publish creates a new immutable row, `terms.html` now reflects it, and the draft (re-opened editor) shows the just-published text as its starting point.
- Version History list shows all published versions in descending order; View opens the correct historical text for each, unaffected by later draft edits.
- `GET`/`PUT` endpoints correctly reject a non-sysadmin (`403`), matching every other route in this file.

## Explicitly excluded scope

(from the Brief)

- No recovery of version text already lost before this change ships (impossible — already overwritten).
- No changes to `terms.html` itself beyond continuing to show the latest published version (same response shape it already consumes).
- No per-user snapshot of the exact text a given user accepted — relying on `users.terms_version` + `terms_versions.version` join, not a redundant per-user copy.
- No changes to the T&C legal content itself.
- No DB-level immutability enforcement (trigger/constraint) on `terms_versions` — enforced only by application code never issuing `UPDATE`/`DELETE` against it, matching this schema's existing conventions.
- No transactional guard against a concurrent double-publish race — pre-existing risk class, unchanged by this spec.
