# Access and Permissions

Part of [PRD.md](../../PRD.md) — carries PRD §15 Authentication, §17 GDPR & Data Rights, §18 Sharing & Permissions.

## 15. Authentication

### 15.1 Login

Email + password. On success: httpOnly JWT cookie set, user profile returned. Wrong password or unknown email both return a generic "invalid credentials" error (no field hint, no user enumeration). Disabled accounts are refused even with correct credentials. **A session lasts 8 hours** from login before the user is automatically signed out (no in-app warning as it approaches — the next action simply gets a 401 and redirects to login).

**Password requirement:** every password-setting flow (activation, reset, change) requires a minimum of 8 characters — enforced both in the UI and, authoritatively, on the server. On the activation and reset pages a four-segment strength indicator (Weak / Fair / Good / Strong) fills as the user types; it is guidance only — the button enables as soon as the password has 8 characters and the confirmation matches.

**Look of the public pages (2026-10-06):** sign-in, password recovery, reset and activation share one look — a white card centred on the navy page with the PDash logo, the copyright under the card, a single magenta action button per view and icons (not emoji) for the expired-link and success messages.

### 15.2 Invite Flow

Admin fills first name, last name, email, role → user created in `pending` status → invite email sent with a link containing a token valid for **48 hours**. Following the link lets the user set a password (same 8-character minimum as above); the account becomes `active`.

**Resending an invite (2026-09):** a "✉️ Resend invite" button appears on `admin.html`'s user list, visible only for users still in `pending` status — for the case where the original invite email was lost or never arrived. Resending invalidates the old link and issues a brand-new token with a fresh 48-hour expiry (regardless of whether the previous one had already expired); the same invite email template is used. Any admin or sysadmin can resend, not only the user who sent the original invite.

### 15.3 Password Reset

Self-service, from "Forgot password?" on the sign-in page, which switches the same page to a recovery view (and back with "← Back to sign in"); the email already typed on sign-in is pre-filled there. Requesting a reset always returns success, regardless of whether the email matches an account (no enumeration). If it does match, a reset link is emailed, valid for **2 hours**. Following it lets the user set a new password (same 8-character minimum).

### 15.4 Change Password

Available to any authenticated user from the account menu. Requires the current password plus a new password and confirmation (same 8-character minimum).

### 15.5 Logout

Clears the session cookie and returns the user to the login page.

---

## 17. GDPR & Data Rights

### 17.1 Terms & Conditions Gate

After login, if the user has never accepted the current Terms & Conditions version — or a new version was published since their last acceptance — they are redirected to a standalone acceptance page before continuing to the app. A checkbox must be ticked before the continue button becomes active. Accepting returns the user to the page they were originally headed to.

### 17.2 Profile Rectification

"My Profile" (accessible from the account menu) lets a user update their own first name, last name, and email. Email must be a valid format and not already used by another account.

### 17.3 Anonymization

The right-to-erasure mechanism for this product is the anonymize action described in §16.4 — admin-performed, not self-service, and requires the account to be disabled first.

---

## 18. Sharing & Permissions

### 18.1 Ownership

The creator of a cost grid or project is its exclusive owner by default. Disabling a user does not remove their ownership; an admin can reassign it to another user.

A sysadmin can reassign a proposal's owner from `_db-reset.html`'s "Change proposal owner" widget (§16.6). As of 2026-09, any admin or sysadmin can also do this directly from the full-page cost grid editor (§4.9) — a "Reassign to…" dropdown next to the owner's name, listing active users, available regardless of whether the version is locked (reassignment is an ownership change, not a content edit). Reassigning a proposal's owner this way additionally grants the new owner Editor access to every project already linked to the proposal (an existing owner of one of those projects keeps their ownership rather than being downgraded), and sends the new owner both an email (listing the linked projects they gained access to) and an in-app notification (2026-09).

### 18.2 Share Modal

Available from a cost grid's detail panel or a project's reporting view — not available at all on a Draft-stage proposal, consistent with a Draft being private to its creator (§4.2). Searches active, non-admin/non-sysadmin platform users by name or email (no free-text email invites — only existing accounts can be granted access). Grants Editor or Viewer access. Permission on an existing share can be changed at any time. Sharing sends the recipient both an email and an in-app notification with a direct link to the shared resource — for all three resource types, project, cost grid, and program (2026-09: previously cost grid share sent only the email, no in-app notification).

**Removing a project share (2026-09):** the person whose access is removed also gets an email and an in-app notification — previously this happened silently, on neither channel. There is no separate "remove" action for a whole program at once — a program's access is granted per-project under the hood, so removing someone from a program means removing them from each of its projects individually, which is where this same notification fires. Removing a cost grid share stays silent on both channels — this cycle only closed the gap for project/program access, not cost grids, as an explicit scope decision.

**Sharing a whole program (2026-09):** each program group's header in the portfolio list view has its own "🔗 Share Program" button — a third, distinct sharing target beyond a single cost grid or project. Sharing a program grants the chosen permission on **every project currently in that program**, in one action, not project-by-project. Only an admin, or someone who already owns/edits at least one project in the program, can do this.

### 18.3 Inline Share Visibility (2026-09)

Both the pipeline board's sliding detail panel and the full-page proposal editor show, without needing to open the Share modal: the proposal owner's name, its (version's) creation date, and a "Shared with" list of everyone who has access, each with their permission badge. A non-owner share can be removed directly from this list. Adding a new share, or changing an existing share's permission, still requires the Share modal. The full-page proposal editor previously had no sharing controls at all — it now also has its own Share button, opening the same modal.

Sharing a cost grid does not grant access to its linked project(s) — the two are independent grants; a project must be shared separately for someone to see it.

### 18.4 Viewer Enforcement

| Surface | Hidden for viewers |
|---|---|
| Pipeline board (card + detail panel) | Edit, Clone, Delete |
| Project Reporting (portfolio view) | Configure (list card — reintroduced in a later 2026-09 cycle, hidden per-card for a viewer-permission project); Load Actuals stays single-project-view only |
| Project Reporting (single-project view) | Configure, Load Actuals |
| Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action/Reforecast buttons hidden) |
