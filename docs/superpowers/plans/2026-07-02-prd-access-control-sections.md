# PRD Access Control & Administration Sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new sibling sections to `PRD.md` (§15 Authentication, §16 User Administration, §17 GDPR & Data Rights, §18 Sharing & Permissions), a one-sentence pointer in §1 Overview, and short cross-reference notes in §4.3, §4.4, §6.1, §7.1 — documenting the entire auth/admin/GDPR/sharing product layer that the PRD currently omits entirely.

**Architecture:** This is a docs-only change to a single file (`PRD.md`). No code is touched. Each task appends or edits a self-contained block of markdown; tasks run in file order (top of the document to bottom, then the four new sections at the end) so line-number anchors in later tasks aren't invalidated by earlier ones.

**Tech Stack:** Markdown. No build step, no test runner for this content — "testing" means verifying each written fact against its cited source file/line and confirming markdown tables render (no unescaped `|`, no missing header separator rows).

## Global Constraints

- Same register as the rest of the PRD: functional/product language, not implementation detail (no raw SQL, no internal variable/column names) — except where a concrete number *is* the functional behavior a user experiences (e.g. "reset link expires after 2 hours").
- Every factual claim must match its cited source; do not paraphrase away specifics (e.g. exact token expiry hours, exact permission enum values) and do not add any claim not backed by a citation in this plan.
- No renumbering of existing sections 1-14. New sections are appended as §15-18, in that order, after the last line of §14.
- §4.3, §4.4, §6.1, §7.1 get exactly one added line each — no duplication of §18's detail there.
- Verified source facts already spot-checked for this plan: invite-token expiry = 48h (`api/src/routes/auth.js:18`), reset-token expiry = 2h (`api/src/routes/auth.js:24`), sharing permission enum = `'owner' | 'editor' | 'viewer'` (`api/src/db/migrations/001_initial.sql:156`).

---

## File Structure

| File | Change |
|---|---|
| `PRD.md` | Modify: §1 Overview (one sentence extended). Modify: §4.3, §4.4, §6.1, §7.1 (one line added to each). Create: §15, §16, §17, §18 (appended after §14, at the current end of file). |

---

### Task 1: §1 Overview pointer + new §15 Authentication

**Files:**
- Modify: `PRD.md:13`
- Modify: `PRD.md` (append after line 569, the current last line of the file)

**Interfaces:**
- Consumes: nothing
- Produces: §15 section anchor, referenced by the §1 pointer added in this same task and by no other task

- [ ] **Step 1: Extend the §1 Overview sentence**

In `PRD.md`, find line 13:

```
The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control. The frontend is Vanilla JS with no build step; each view is a separate HTML page.
```

Replace it with:

```
The app is backed by a Node.js/Express REST API and a PostgreSQL database, with JWT-based authentication and role-based access control — two account roles (admin/user) plus per-resource sharing permissions (owner/editor/viewer) govern what each user can see and do (see §15–18). The frontend is Vanilla JS with no build step; each view is a separate HTML page.
```

- [ ] **Step 2: Append §15 Authentication at the end of the file**

`PRD.md` currently ends at line 569 (the last row of the §14 Design System table, `| --shadow-xs | --shadow-xl | Elevation shadows |`), with no trailing separator. Append:

```markdown

---

## 15. Authentication

### 15.1 Login

Email + password. On success: httpOnly JWT cookie set, user profile returned. Wrong password or unknown email both return a generic "invalid credentials" error (no field hint, no user enumeration). Disabled accounts are refused even with correct credentials.

### 15.2 Invite Flow

Admin fills first name, last name, email, role → user created in `pending` status → invite email sent with a link containing a token valid for **48 hours**. Following the link lets the user set a password; the account becomes `active`.

### 15.3 Password Reset

Self-service. Requesting a reset always returns success, regardless of whether the email matches an account (no enumeration). If it does match, a reset link is emailed, valid for **2 hours**. Following it lets the user set a new password.

### 15.4 Change Password

Available to any authenticated user from the account menu. Requires the current password plus a new password and confirmation.

### 15.5 Logout

Clears the session cookie and returns the user to the login page.
```

- [ ] **Step 3: Verify the facts**

Confirm the two expiry numbers against the source:

Run: `grep -n "token48h\|token2h" api/src/routes/auth.js`
Expected output includes `function token48h()` and `function token2h()`, confirming 48h/2h are the correct values used in Step 2's text.

- [ ] **Step 4: Verify markdown structure**

Run: `grep -n "^## 15\|^### 15\." PRD.md`
Expected: one `## 15. Authentication` line followed by five `### 15.1`–`### 15.5` lines, in order.

- [ ] **Step 5: Commit**

```bash
git add PRD.md
git commit -m "docs(prd): add §1 access-control pointer and new §15 Authentication"
```

---

### Task 2: New §16 User Administration

**Files:**
- Modify: `PRD.md` (append after the §15 block added in Task 1)

**Interfaces:**
- Consumes: nothing from Task 1's content directly (independent section), but must be appended after it in file order
- Produces: §16.1 anchor (referenced nowhere else), §16.4 anchor (referenced by §17.3 in Task 3), §17.1 will reference "§17.1" not §16 — no forward dependency from this task

- [ ] **Step 1: Append §16 User Administration**

After the §15 block (end of `PRD.md`), append:

```markdown

---

## 16. User Administration

Accessed via `admin.html`, admin-only.

### 16.1 User List

All users, filterable by status (Active / Pending / Disabled); each row shows role and who invited the user.

### 16.2 Roles & Permissions

| Role | Description |
|---|---|
| `admin` | Full access to all data and configuration |
| `user` | Scoped access — owns and sees only their own resources |

| Action | Admin | User |
|---|---|---|
| Invite users | ✅ | ❌ |
| Disable / re-enable users | ✅ | ❌ |
| Manage clients | ✅ | read-only |
| Manage programs | ✅ | read-only |
| Manage roles + rates | ✅ | read-only |
| View ratecards | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ❌ |
| View all cost grids | ✅ | own + shared |
| View all projects | ✅ | own + shared |
| View all planning | ✅ | own + shared |
| Share cost grid / project | ✅ | own only |
| Upload timesheet | ✅ | own projects only |

### 16.3 Role & Status Actions

Make a user admin or user; disable or re-enable an account. An admin cannot change their own role or status — their own row shows "(you)" instead of action buttons.

### 16.4 Anonymize

Available only on disabled, not-yet-anonymized users. Requires an explicit confirmation describing what will change. Replaces the user's email and name with anonymized placeholders; their operational data (cost grids, projects) is preserved, only the identity is scrubbed. An admin cannot anonymize their own account.

### 16.5 Terms & Conditions Editor

Admin can view the current version number and edit its HTML content. "Save draft" updates the content without changing the version (existing users are not re-prompted). "Publish new version" increments the version, which forces every user to re-accept on their next login (see §17.1).
```

- [ ] **Step 2: Verify §16.2 matches the existing source table**

Run: `grep -n "Invite users\|Disable / re-enable users\|Manage roles + rates" ARCHITECTURE.md`
Expected: the same three row labels appear in `ARCHITECTURE.md`'s permission matrix (§3.2), confirming §16.2 is a verbatim reuse, not a paraphrase.

- [ ] **Step 3: Verify markdown structure**

Run: `grep -n "^## 16\|^### 16\." PRD.md`
Expected: one `## 16. User Administration` line followed by five `### 16.1`–`### 16.5` lines, in order.

- [ ] **Step 4: Commit**

```bash
git add PRD.md
git commit -m "docs(prd): add new §16 User Administration"
```

---

### Task 3: New §17 GDPR & Data Rights

**Files:**
- Modify: `PRD.md` (append after the §16 block added in Task 2)

**Interfaces:**
- Consumes: §16.4 "Anonymize" section heading text from Task 2 (referenced by name in §17.3's cross-reference sentence)
- Produces: §17.1 anchor, referenced by §16.5 (already written in Task 2 — confirm that reference reads "§17.1" and matches this task's heading)

- [ ] **Step 1: Append §17 GDPR & Data Rights**

After the §16 block (end of `PRD.md`), append:

```markdown

---

## 17. GDPR & Data Rights

### 17.1 Terms & Conditions Gate

After login, if the user has never accepted the current Terms & Conditions version — or a new version was published since their last acceptance — they are redirected to a standalone acceptance page before continuing to the app. A checkbox must be ticked before the continue button becomes active. Accepting returns the user to the page they were originally headed to.

### 17.2 Profile Rectification

"My Profile" (accessible from the account menu) lets a user update their own first name, last name, and email. Email must be a valid format and not already used by another account.

### 17.3 Anonymization

The right-to-erasure mechanism for this product is the anonymize action described in §16.4 — admin-performed, not self-service, and requires the account to be disabled first.
```

- [ ] **Step 2: Verify the §16.5 ↔ §17.1 cross-reference is consistent**

Run: `grep -n "see §17.1\|## 17. GDPR" PRD.md`
Expected: both lines present; §16.5 (written in Task 2) says "see §17.1" and this task's heading is indeed numbered 17.1 — confirms the forward-reference from Task 2 resolves correctly now that §17 exists.

- [ ] **Step 3: Verify markdown structure**

Run: `grep -n "^## 17\|^### 17\." PRD.md`
Expected: one `## 17. GDPR & Data Rights` line followed by three `### 17.1`–`### 17.3` lines, in order.

- [ ] **Step 4: Commit**

```bash
git add PRD.md
git commit -m "docs(prd): add new §17 GDPR & Data Rights"
```

---

### Task 4: New §18 Sharing & Permissions

**Files:**
- Modify: `PRD.md` (append after the §17 block added in Task 3)

**Interfaces:**
- Consumes: nothing from Tasks 1-3
- Produces: §18.3 anchor "Viewer Enforcement", referenced by the cross-reference lines added in Task 5

- [ ] **Step 1: Append §18 Sharing & Permissions**

After the §17 block (end of `PRD.md`), append:

```markdown

---

## 18. Sharing & Permissions

### 18.1 Ownership

The creator of a cost grid or project is its exclusive owner by default. Disabling a user does not remove their ownership; an admin can reassign it to another user.

### 18.2 Share Modal

Available from a cost grid's detail panel or a project's reporting view. Searches active, non-admin platform users by name or email (no free-text email invites — only existing accounts can be granted access). Grants Editor or Viewer access. Permission on an existing share can be changed at any time. Sharing sends the recipient a notification with a direct link to the shared resource.

### 18.3 Viewer Enforcement

| Surface | Hidden for viewers |
|---|---|
| Pipeline board (card + detail panel) | Edit, Clone, Delete |
| Project Reporting (portfolio view) | Configure, Load Actuals |
| Project Reporting (single-project view) | Configure |
| Project Configuration form | Entire form becomes read-only (sticky banner, all inputs disabled, Save/action buttons hidden) |
```

- [ ] **Step 2: Verify the permission enum matches the DB constraint**

Run: `grep -n "CHECK (permission IN" api/src/db/migrations/001_initial.sql`
Expected: `permission VARCHAR(20) NOT NULL CHECK (permission IN ('owner', 'editor', 'viewer'))` — confirms §18.1/§18.2's "Owner/Editor/Viewer" terminology matches the three real values, not an invented fourth level or different naming.

- [ ] **Step 3: Verify the viewer-enforcement table against the actual code checks**

Run: `grep -rn "myPermission !== 'viewer'\|my_permission !== 'viewer'" js/pipeline-board.js js/portfolio.js js/dashboard.js`
Expected: three matches, one per file, confirming the three UI surfaces listed in §18.3's table each have a real code-level viewer check (not an assumption).

- [ ] **Step 4: Verify markdown structure**

Run: `grep -n "^## 18\|^### 18\." PRD.md`
Expected: one `## 18. Sharing & Permissions` line followed by three `### 18.1`–`### 18.3` lines, in order.

- [ ] **Step 5: Commit**

```bash
git add PRD.md
git commit -m "docs(prd): add new §18 Sharing & Permissions"
```

---

### Task 5: Cross-reference lines in §4.3, §4.4, §6.1, §7.1

**Files:**
- Modify: `PRD.md:71` (§4.3, line number as of before this task's edits — verify current line before editing, since Tasks 1-4 only appended at the end of the file and did not shift line numbers above line 569, so §4.3-§7.1 line numbers are unchanged from the start of this plan)
- Modify: `PRD.md:79` (§4.4)
- Modify: `PRD.md:217` (§6.1)
- Modify: `PRD.md:266` (§7.1)

**Interfaces:**
- Consumes: §18.3 "Viewer Enforcement" section from Task 4 (linked by name in every line added here)
- Produces: nothing consumed by later tasks (this is the last task)

- [ ] **Step 1: Add the cross-reference line to §4.3 Offer Cards**

In `PRD.md`, find:

```
- Edit (✏️) action button; Delete (🗑) action button only on Draft-stage cards with edit permission

Clicking a card (anywhere other than the action buttons) opens the **Detail Panel**.
```

Replace with:

```
- Edit (✏️) action button; Delete (🗑) action button only on Draft-stage cards with edit permission
- Viewer permission hides Edit and Delete entirely (see §18.3)

Clicking a card (anywhere other than the action buttons) opens the **Detail Panel**.
```

- [ ] **Step 2: Add the cross-reference line to §4.4 Detail Panel**

In `PRD.md`, find:

```
**Header:** 🗑 Delete (Draft stage only) · ⧉ Clone · 🔗 Share · ✏️ Edit · ×. When the cost grid has more than one version, a row of version tabs (colour-coded stage dot + label) appears above the two-column body; clicking a tab reloads the panel for that version.

**Left column — Offer metadata + Linked Projects**
```

Replace with:

```
**Header:** 🗑 Delete (Draft stage only) · ⧉ Clone · 🔗 Share · ✏️ Edit · ×. When the cost grid has more than one version, a row of version tabs (colour-coded stage dot + label) appears above the two-column body; clicking a tab reloads the panel for that version. Viewer permission hides Clone, Share, and Edit from the header (see §18.3).

**Left column — Offer metadata + Linked Projects**
```

- [ ] **Step 3: Add the cross-reference line to §6.1 Portfolio Overview**

In `PRD.md`, find:

```
**Toolbar actions:**
- **Load XLS** — upload an Excel timesheet file to import actuals
- **Clients** — open Clients management modal
- **Programs** — open Programs management modal
- **Configure Portfolio** — open Project configuration panel

**View features:**
```

Replace with:

```
**Toolbar actions:**
- **Load XLS** — upload an Excel timesheet file to import actuals
- **Clients** — open Clients management modal
- **Programs** — open Programs management modal
- **Configure Portfolio** — open Project configuration panel

Configure Portfolio and Load Actuals are hidden for viewers (see §18.3).

**View features:**
```

- [ ] **Step 4: Add the cross-reference line to §7.1 Project Configuration**

In `PRD.md`, find:

```
**Edit modes:** Visual form or raw JSON editor.

**Other sections in the form:** Phasing (monthly budget distribution), Planning (monthly sold-hours distribution), and Functional Groups (named role groupings) — each a distinct area of the same full-page form.
```

Replace with:

```
**Edit modes:** Visual form or raw JSON editor.

**Other sections in the form:** Phasing (monthly budget distribution), Planning (monthly sold-hours distribution), and Functional Groups (named role groupings) — each a distinct area of the same full-page form.

The entire form is read-only for viewers (see §18.3).
```

- [ ] **Step 5: Verify all four cross-references resolve**

Run: `grep -n "see §18.3" PRD.md`
Expected: 4 matches — in §4.3, §4.4, §6.1, and §7.1.

- [ ] **Step 6: Full-document sanity check**

Run: `grep -c "^## " PRD.md`
Expected: `18` (sections 1 through 18, no gaps, no duplicates — this also re-confirms the §4.9 duplicate-numbering fix from the earlier PRD audit pass is still intact and this plan did not reintroduce a collision).

- [ ] **Step 7: Commit**

```bash
git add PRD.md
git commit -m "docs(prd): cross-reference §18 viewer enforcement from §4.3/§4.4/§6.1/§7.1"
```

---

## Self-Review Notes (completed by the plan author, not a task step)

**Spec coverage:** §15 (Task 1), §16 (Task 2), §17 (Task 3), §18 (Task 4), §1 pointer (Task 1), all four cross-references (Task 5) — every item in the spec's "New sections" and "Cross-reference additions" lists has a task. The spec's "Out of scope" items (`migration.html`, `_db-reset.html`, renumbering 1-14) are correctly absent from every task.

**Placeholder scan:** no TBD/TODO; every step contains the literal markdown to insert.

**Type/reference consistency:** §16.5 says "see §17.1" and Task 3 creates exactly `### 17.1 Terms & Conditions Gate` — matches. §17.3 says "described in §16.4" and Task 2 creates exactly `### 16.4 Anonymize` — matches. All four Task 5 cross-references say "see §18.3" and Task 4 creates exactly `### 18.3 Viewer Enforcement` — matches. §1's pointer says "see §15–18" and Tasks 1-4 create exactly sections 15 through 18 — matches.
