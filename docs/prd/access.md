# Access and Permissions

Part of [PRD.md](../../PRD.md) — carries PRD §15 Authentication, §17 GDPR & Data Rights, §18 Sharing & Permissions.

## 15. Authentication

### 15.1 Login

Email + password. On success: httpOnly JWT cookie set, user profile returned. Wrong password or unknown email both return a generic "invalid credentials" error (no field hint, no user enumeration). Disabled accounts are refused even with correct credentials. **After the password a 6-digit code is mailed to the account's address** (valid 10 minutes, five attempts per sign-in, a new code after 60 seconds); only then the session opens. "Trust this device for 30 days" skips the code on that browser; the user lists and removes trusted devices in Profile → Trusted devices. A password reset or change, an admin's email change, disabling and anonymizing all remove the user's trusted devices and open sign-ins. Disabling or anonymizing a user, and any password reset or change, also end the user's open sessions at their next action (the browser that changed its own password stays signed in); a user whose role an admin lowers loses the old rights at the next action. Failed password attempts are limited (10 per email, 30 per address, 15 minutes); so are wrong current passwords on a password change (per user and network address, 15 minutes). **A session lasts 8 hours** from login before the user is automatically signed out (no in-app warning as it approaches — the next action simply gets a 401 and redirects to login).

**Password requirement (2026-11-17, NIST SP 800-63B):** every password-setting flow (activation, reset, change) enforces one rule on the server: at least 12 characters and at most 64 (and at most 72 bytes), not a few characters repeated, not containing the user's email local part, first or last name (or "pdash"), not on a list of common passwords, and not known to Have I Been Pwned (only a 5-character hash prefix leaves the server; when the service cannot be reached the password is accepted). No composition rule: upper case, digits and symbols are not required. A refused password gets a message saying why. On the activation, reset and profile pages the same placeholder and hint are shown, the length, repetition and name/email checks are explained under a four-segment strength indicator (Too weak / Fair / Good / Strong, growing with the length) as the user types, and the button enables only when those checks pass and the confirmation matches; the common-list and breach checks answer on submit. Existing passwords are not affected.

**Look of the public pages (2026-10-06):** sign-in, password recovery, reset and activation share one look — a white card centred on the navy page with the PDash logo, the copyright under the card, a single magenta action button per view and icons (not emoji) for the expired-link and success messages.

### 15.2 Invite Flow

Admin fills first name, last name, email, role → user created in `pending` status → invite email sent with a link containing a token valid for **48 hours**. Following the link lets the user set a password (same rule as above); the account becomes `active`.

**Resending an invite (2026-09):** a "✉️ Resend invite" button appears on `admin.html`'s user list, visible only for users still in `pending` status — for the case where the original invite email was lost or never arrived. Resending invalidates the old link and issues a brand-new token with a fresh 48-hour expiry (regardless of whether the previous one had already expired); the same invite email template is used. Any admin or sysadmin can resend, not only the user who sent the original invite.

**When the invite email cannot be sent (2026-11-11):** the pending user is still created, and the invite drawer says "Invite created for X, but the email could not be sent — use Resend invite." A resend whose email cannot be sent shows "The email could not be sent". Password recovery answers the same way whether or not its email was sent.

### 15.3 Password Reset

Self-service, from "Forgot password?" on the sign-in page, which switches the same page to a recovery view (and back with "← Back to sign in"); the email already typed on sign-in is pre-filled there. Requesting a reset always returns success, regardless of whether the email matches an account (no enumeration). If it does match, a reset link is emailed, valid for **2 hours**. Asking again within 2 minutes of a link just sent sends nothing new and leaves that link valid, and the number of requests per address and per network address is limited per hour; the answer is the same in every case. Following it lets the user set a new password (same rule).

### 15.4 Change Password

Available to any authenticated user from the account menu. Requires the current password plus a new password and confirmation (same rule).

### 15.5 Logout

Clears the session cookie and returns the user to the login page.

---

## 17. GDPR & Data Rights

### 17.1 Terms & Conditions Gate

After login, if the user has never accepted the current Terms & Conditions version — or a new version was published since their last acceptance — they are redirected to a standalone acceptance page before continuing to the app. A checkbox must be ticked before the continue button becomes active. Accepting returns the user to the page they were originally headed to. The acceptance records the version the page shows (2026-11-20): if a newer version was published while the page was open, nothing is recorded, the page shows the newer text with the checkbox cleared and a message, and the user accepts again.

### 17.2 Profile Rectification

**Since 2026-11 a user's first name, last name and email are managed by an admin.** "My Profile" in the account menu opens the **My profile** page (`profile.html`, no menu entry; "Change password" opens its Password section). Its sections:
- **Details** shows name, email, role and member-since date read-only, with **Request a change**: a drawer where the user writes what is wrong (up to 2000 characters). The request is recorded, and every other active admin/sysadmin gets a notification and an email linking to User Admin; the page confirms "Request sent to the admins." A user can send 5 requests an hour; a sixth gets "Too many attempts" in the drawer. When no other admin/sysadmin is active, the drawer says "There is no other admin to send this request to." and nothing is recorded.
- **Password** has the current password, the new one twice, a strength hint, and "Last changed on {date}" once a change has been recorded.
- **Privacy & data** lists what PDash keeps (profile, work, agreements, with links to the Privacy Notice) and, when the deployment configures a privacy contact, a "Questions about your data?" card with a "Write an email" button.

The admin makes the correction from User Admin → **Edit details…** (§16.3). Anonymizing a user (§17.3) also deletes their requests and the notifications about them.

### 17.3 Anonymization

The right-to-erasure mechanism for this product is the anonymize action described in §16.4 — admin-performed, not self-service, and requires the account to be disabled first.

---

## 18. Sharing & Permissions

### 18.1 Ownership

The creator of a cost grid or project is its exclusive owner by default. Disabling a user does not remove their ownership; an admin can reassign it to another user.

A sysadmin can reassign a proposal's owner from `_db-reset.html`'s "Change proposal owner" widget (§16.6). As of 2026-09, any admin or sysadmin can also do this directly from the full-page cost grid editor (§4.9) — a "Reassign to…" dropdown next to the owner's name, listing active users, available regardless of whether the version is locked (reassignment is an ownership change, not a content edit). Reassigning a proposal's owner this way additionally grants the new owner Editor access to every project already linked to the proposal (an existing owner of one of those projects keeps their ownership rather than being downgraded), and sends the new owner both an email (listing the linked projects they gained access to) and an in-app notification (2026-09).

### 18.2 Share Modal

Available from a cost grid's detail panel or a project's reporting view — not available at all on a Draft-stage proposal, consistent with a Draft being private to its creator (§4.2). Searches active, non-admin/non-sysadmin platform users by name or email (no free-text email invites — only existing accounts can be granted access). Grants Editor or Viewer access. Permission on an existing share can be changed at any time; the change sends no email or notification, and a share removed meanwhile is not recreated ("This person no longer has access."). Adding someone who already has access is refused with "This user already has access." (2026-11-20). Errors appear inside the modal. Sharing sends the recipient both an email and an in-app notification with a direct link to the shared resource — for all three resource types, project, cost grid, and program (2026-09: previously cost grid share sent only the email, no in-app notification). When the email cannot be sent (2026-11-11), the share and the in-app notification are still made and the modal says "Shared with X, but the email could not be sent." (for a program: "Shared N projects. The email could not be sent.").

**Removing a project share (2026-09):** the person whose access is removed also gets an email and an in-app notification — previously this happened silently, on neither channel. There is no separate "remove" action for a whole program at once — a program's access is granted per-project under the hood, so removing someone from a program means removing them from each of its projects individually, which is where this same notification fires. Removing a cost grid share stays silent on both channels — this cycle only closed the gap for project/program access, not cost grids, as an explicit scope decision.

**Sharing a whole program (2026-09):** each program group's header in the portfolio list view has its own "🔗 Share Program" button — a third, distinct sharing target beyond a single cost grid or project. Sharing a program grants the chosen permission on **every project currently in that program**, in one action, not project-by-project. Only an admin, or someone who already owns/edits at least one project in the program, can do this. (2026-11-18) A program share never lowers anyone's access — an owner or editor of a project keeps it — and the confirmation reads "Shared N projects; K kept their higher access." when that happened. A project can be put into a program only by someone who could already share it (an admin, or an owner/editor of one of its projects, or anyone while the program has no projects).

### 18.3 Inline Share Visibility (2026-09)

Both the pipeline board's sliding detail panel and the full-page proposal editor show, without needing to open the Share modal: the proposal owner's name, its (version's) creation date, and a "Shared with" list of everyone who has access, each with their permission badge. A non-owner share can be removed directly from this list. Adding a new share, or changing an existing share's permission, still requires the Share modal. The full-page proposal editor previously had no sharing controls at all — it now also has its own Share button, opening the same modal.

Sharing a cost grid does not grant access to its linked project(s) — the two are independent grants; a project must be shared separately for someone to see it.

### 18.4 Viewer Enforcement

| Surface | Hidden for viewers |
|---|---|
| Pipeline board (card + detail panel) | Edit, Clone, Delete |
| Proposal editor (`costgrid.html`) | Every structural control: Add/Delete phase and task, the role column ⋮ menu and Add roles, free-task selection, Generate project, Add to project; the version label edit. The grid's fields are read-only (2026-10-23) |
| Project Reporting (portfolio view) | Configure (list card — reintroduced in a later 2026-09 cycle, hidden per-card for a viewer-permission project); Load Actuals stays single-project-view only |
| Project Reporting (single-project view) | Configure, Load Actuals |
| Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action/Reforecast buttons hidden) |
