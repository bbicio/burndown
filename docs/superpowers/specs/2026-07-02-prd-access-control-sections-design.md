# PRD.md — Access Control & Administration sections (Passaggio 3 of PRD audit)

**Date:** 2026-07-02
**Context:** third and final pass of the PRD.md audit against the real application (see `docs/superpowers/specs` — the audit itself was conducted conversationally, not written to a separate spec; Passaggi 1-2 already merged corrections to `PRD.md` on branch `docs/prd-audit`). Passaggi 1-2 fixed facts already stated in the PRD (wrong/stale/missing details in existing sections). This pass adds content for an entire product layer — authentication, user administration, GDPR rights, and sharing/permissions — that the PRD never described at all, despite it being core to a multi-user product.

**Goal:** Add four new sibling sections (§15-18) to `PRD.md` covering Authentication, User Administration, GDPR & Data Rights, and Sharing & Permissions, plus short cross-referencing notes in the existing sections where viewer-permission enforcement is visible, and a one-sentence pointer in §1 Overview — all content verified against the real code/DB, not deduced.

## Constraints

- Same register as the rest of the PRD: functional/product language, not implementation detail (no raw SQL, no internal variable names) — except where a concrete detail *is* the functional behavior a user experiences (e.g. "reset link expires after 2 hours" is functional; `reset_expires` column name is not).
- Every factual claim must be verified against the real code/DB before being written (this pass already spot-checked invite-token expiry = 48h and reset-token expiry = 2h directly in `api/src/routes/auth.js:18,24`, and the permission enum `'owner'|'editor'|'viewer'` in `api/src/db/migrations/001_initial.sql:156` — all three match the existing `ARCHITECTURE.md`/`TEST_CASES.md` descriptions used as source material for this pass).
- No renumbering of existing sections 1-14. New sections are appended as §15-18.
- Sections 4 (Pipeline Board), 6 (Project Reporting), 7.1 (Project Configuration) get only a one-line pointer each — no duplication of §18's detail.

## New sections

### §15 Authentication

Source: `ARCHITECTURE.md` §4 (Auth Flows), spot-verified against `api/src/routes/auth.js`.

- **15.1 Login** — email + password; on success, httpOnly JWT cookie set, user profile returned; wrong credentials or unknown email both return a generic "invalid credentials" (no field hint, no user enumeration); disabled accounts are refused even with correct credentials.
- **15.2 Invite Flow** — admin fills first name, last name, email, role; user created in `pending` status; invite email sent with a link containing a token valid for **48 hours**; user follows the link, sets a password, account becomes `active`.
- **15.3 Password Reset** — self-service; requesting a reset always returns success (does not reveal whether the email exists); if the email matches an account, a reset link is sent, valid for **2 hours**; following it lets the user set a new password.
- **15.4 Change Password** (authenticated) — requires the current password plus a new password + confirmation.
- **15.5 Logout** — clears the session cookie.

### §16 User Administration

Accessed via `admin.html`, admin-only. Source: `ARCHITECTURE.md` §3.1-3.3, `TEST_CASES.md` §11 (AD-01–AD-20).

- **16.1 User List** — all users, filterable by status (Active / Pending / Disabled), showing role and who invited them.
- **16.2 Roles & Permissions** — reuse the roles table and permission matrix already in `ARCHITECTURE.md` §3.1/3.2 verbatim (two roles, `admin`/`user`; matrix of actions × role).
- **16.3 Role & Status Actions** — make a user admin/user, disable/re-enable an account; an admin cannot change their own role or status (shown as "(you)" instead of action buttons).
- **16.4 Anonymize** — available only on disabled, not-yet-anonymized users; requires an explicit confirmation describing what will change; replaces the user's email/name with anonymized placeholders while preserving their operational data (cost grids, projects remain, only the identity is scrubbed); an admin cannot anonymize their own account.
- **16.5 Terms & Conditions Editor** — admin can view the current version and edit its HTML content; "Save draft" updates content without changing the version; "Publish new version" increments the version, which forces every user to re-accept on next login (see §17.1).

### §17 GDPR & Data Rights

Source: `ARCHITECTURE.md` §4.6-4.7, `TEST_CASES.md` §12 (GD-01–GD-10).

- **17.1 Terms & Conditions Gate** — after login, if the user has never accepted the current T&C version (or a new version was published since their last acceptance), they are redirected to a standalone acceptance page before continuing; a checkbox must be ticked before the continue button becomes active; accepting returns the user to the page they were headed to.
- **17.2 Profile Rectification** — "My Profile" panel (accessible from the account menu) lets a user update their own first name, last name, and email; email must be valid and not already used by another account.
- **17.3 Anonymization** — the right-to-erasure mechanism for this product is the anonymize action described in §16.4: it is admin-performed (not self-service) and requires the account to be disabled first.

### §18 Sharing & Permissions

Source: `ARCHITECTURE.md` §3.3 (Ownership and Sharing), `CLAUDE.md` (`js/shares.js` description), `TEST_CASES.md` §15 (SH-01–SH-10), plus direct `my_permission`/`myPermission` checks confirmed in `pipeline-board.js`, `portfolio.js`, `dashboard.js`.

- **18.1 Ownership** — the creator of a cost grid or project is its exclusive owner by default; disabling a user does not remove their ownership (an admin can reassign it).
- **18.2 Share Modal** — available from a cost grid's detail panel or a project's reporting view; searches active, non-admin platform users by name/email (no free-text email invites); grants Editor or Viewer access; permission on an existing share can be changed at any time; sharing sends the recipient a notification with a direct link.
- **18.3 Viewer Enforcement** — a table listing, per surface, which controls are hidden for a viewer:

  | Surface | Hidden for viewers |
  |---|---|
  | Pipeline board (card + detail panel) | Edit, Clone, Delete |
  | Project Reporting (portfolio view) | Configure, Load Actuals |
  | Project Reporting (single-project view) | Configure |
  | Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action buttons hidden) |

## Cross-reference additions to existing sections

- **§4.3 Offer Cards** (after the Edit/Delete bullet): *"Viewer permission hides Edit and Delete entirely (see §18.3)."*
- **§4.4 Detail Panel** (after the Header bullet): *"Viewer permission hides Clone, Share, and Edit from the header (see §18.3)."*
- **§6.1 Portfolio Overview** (after the Toolbar actions list): *"Configure Portfolio and Load Actuals are hidden for viewers (see §18.3)."*
- **§7.1 Project Configuration** (after Edit modes): *"The entire form is read-only for viewers (see §18.3)."*

## §1 Overview addition

Extend the existing sentence (line 13) rather than adding a new paragraph:

> "...with JWT-based authentication and role-based access control — two account roles (admin/user) plus per-resource sharing permissions (owner/editor/viewer) govern what each user can see and do (see §15–18)."

## Out of scope for this pass

- `migration.html` and `_db-reset.html` (hidden, one-off/admin-debug tools) — not user-facing product features in the PRD sense; not added.
- Any renumbering or restructuring of sections 1-14 beyond the four approved one-line additions above.
