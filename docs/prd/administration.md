# User Administration

Part of [PRD.md](../../PRD.md) — carries PRD §16 User Administration.

## 16. User Administration

Accessed via `admin.html`, admin or sysadmin.

### 16.1 User List

All users, filterable by status (Active / Pending / Disabled); each row shows role and who invited the user.

### 16.2 Roles & Permissions

Three tiers (2026-09) — `sysadmin` sits above `admin` and inherits every admin capability, plus two exclusives carved out of the plain admin tier:

| Role | Description |
|---|---|
| `sysadmin` | Everything `admin` has, plus exclusive access to the DB Reset page (§16.6) and Terms & Conditions editing (§16.5) |
| `admin` | Full access to all data and configuration — no longer includes DB Reset or T&C editing |
| `user` | Scoped access — owns and sees only their own resources |

No account starts as sysadmin; the first one is set up outside the product (direct DB action). Every promotion after that goes through §16.3's toggle.

| Action | Sysadmin | Admin | User |
|---|---|---|---|
| Access DB Reset page | ✅ | ❌ | ❌ |
| Edit/publish Terms & Conditions | ✅ | ❌ | ❌ |
| Grant/revoke sysadmin | ✅ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ |
| Disable / re-enable users | ✅ | ✅ (not on a sysadmin account) | ❌ |
| Anonymize users | ✅ | ✅ (not on a sysadmin account) | ❌ |
| Manage clients | ✅ | ✅ | read-only |
| Manage programs | ✅ | ✅ | create/rename ✅ (2026-09, see §4.9/§7.5), delete ❌ |
| Manage roles + rates | ✅ | ✅ | read-only |
| View ratecards | ✅ | ✅ | ✅ |
| Create / edit / delete ratecards | ✅ | ✅ | ❌ |
| View all cost grids | ✅ | ✅ | own + shared |
| View all projects | ✅ | ✅ | own + shared |
| View all planning | ✅ | ✅ | own + shared |
| Share cost grid / project | ✅ | ✅ | own only |
| Upload timesheet | ✅ | ✅ | own projects only |
| Broadcast notification | ✅ | ✅ | ❌ |
| Manage Team / Attribute Lists (§16.7/§16.8, 2026-09) | ✅ | ✅ | ❌ |
| Read attribute lists to assign a tag on a proposal/project one has access to (§16.9, 2026-09 Cycle 2) | ✅ | ✅ | ✅ |

### 16.3 Role & Status Actions

Make a user admin or user (any admin/sysadmin can do this). Grant or revoke sysadmin (sysadmin viewers only, and only on an admin/sysadmin row — never directly on a `user` row: promotion is two-step, `user → admin` then `admin → sysadmin`; demotion mirrors it, `sysadmin → admin` then `admin → user`, never a direct jump in either direction). Disable or re-enable an account. No one can change their own role or status — their own row shows "(you)" instead of action buttons. A sysadmin account can only be modified — role, status, or anonymized — by another sysadmin; a plain admin sees no action buttons at all on a sysadmin's row.

### 16.4 Anonymize

Available only on disabled, not-yet-anonymized users. Requires an explicit confirmation describing what will change. Replaces the user's email and name with anonymized placeholders; their operational data (cost grids, projects) is preserved, only the identity is scrubbed. No one can anonymize their own account, and (per §16.3) a plain admin cannot anonymize a sysadmin.

### 16.5 Terms & Conditions Editor

Moved out of `admin.html` (2026-09) to its own page — sysadmin-exclusive, reachable from a sysadmin-only navbar menu. Sysadmin can view the current draft's version number and edit its HTML content. "Save draft" saves the edit for later without publishing it — users are unaffected and never see an unsaved draft. "Publish new version" permanently records the current draft as a new version and increments the version number, which forces every user to re-accept on their next login (see §17.1). A "👁 Preview" button opens the live acceptance page (`/terms.html`) in a new tab, rendering the current *draft* exactly as a real user would see it — a way to check the draft's appearance before committing to Publish.

**Version history (2026-09):** every published version is retained permanently — publishing a new version never destroys the previous one's text, unlike before this change. A "Version History" list shows every past version (number, publish date, publisher); clicking a version opens its full text read-only. This exists primarily for record-keeping — being able to show exactly what text a given user accepted at a given time, which was not previously possible.

### 16.6 DB Reset

Sysadmin-exclusive hidden page (was admin-only before 2026-09) for bulk/targeted destructive DB operations. Reachable from the same sysadmin-only "Sysadmin" navigation section as §16.5 (menu name "DB Reset"). Every destructive action on this page — every scope below, plus the single-proposal delete — requires typing the literal word **DELETE** into a confirmation field before it can proceed, not just a click-through dialog.

**Reset by scope** — 7 independently-triggered, differently-scoped bulk deletions, each with its own stated effect and carve-outs:

| Scope | Deletes | Explicitly spared |
|---|---|---|
| Proposals | All cost grids, versions, phases, tasks, task roles, and related sharing records | — |
| Projects & Programs | All projects (including tasks and planning data) and all programs | Cost grids are not affected |
| Clients & Client Groups | All clients, client groups, and their POTs | Client references on proposals/projects are set to null, not cascade-deleted |
| Client Ratecards | All ratecards linked to a specific client | Agency-wide ratecards (no client) are not affected |
| Actuals (Timesheets) | All uploaded timesheet data | Project structure is not affected |
| Pipeline Years & POTs | All pipeline years and all POT targets with their history | Proposals already in SIP/Committed are not affected |
| Notifications | All in-app notifications for all users | Push/email history already sent is not affected |

**Delete a single proposal** — deletes one cost grid (and everything under it) by ID, independent of the scoped resets above.

**Reassign a proposal's owner** — moves ownership of one proposal to a different active user (see §18.1 for the fuller reassignment behavior, including the equivalent, broader route available directly from the cost grid editor).

### 16.7 Team (Resource Registry, 2026-09)

Own page (`team.html`), admin or sysadmin, reachable from the "Admin" section of the navigation. A standalone directory of people who can be allocated to work — first name, last name, email, role, and a free-text job description — kept separate from PDash user accounts (a resource does not need a login to exist here) but with an optional link to one, when the person also happens to be a PDash user.

Every resource has exactly one **role**, chosen from the same list of roles used elsewhere in the app (§7.6) and shown as "label (code)"; there is no free-text alternative — if a role is missing, an admin creates it first in Config → Roles. The link is to the role itself, not to its name, so renaming a role's label or code in Config updates every resource that has it, and a role that is assigned to a resource cannot be deleted (Config shows "Cannot delete role assigned to a team resource"). The role's code is the value found in the role column of uploaded actuals, which is why it matters for the later stages of resource allocation (2026-09-25). Resources can be deactivated (hidden from the default list, kept for history) and reactivated, or deleted outright.

This is the first of four planned cycles toward AI-assisted resource allocation — nothing on this page is consumed by planning or the pipeline yet.

**Team page layout (2026-09-25, Team UX).** The page has two tabs, "Team" and "Unmatched names (N)" with the number of names waiting. On the Team tab the table can be sorted by clicking the Name, Email, Role or Status header (click again to reverse), and it still has the search box and "Show inactive". Clicking a row opens a side panel with two tabs: **Details** (name, email, role, linked user, status and job description, with an **Edit** button, and at the bottom a collapsed **Aliases** section with a count — the names from uploaded actuals that resolve to that person, each removable) and **Experience profile** (see below). The panel closes with ×, Esc or a click outside it; the row's own buttons (Edit, Deactivate, Delete) work as before. **Paging (2026-09-28, Team UX polish):** with more than 25 rows, "Previous"/"Next" controls and a "Page X of Y" indicator appear below the table; changing the search text, the "Show inactive" checkbox, or the sort column returns to page 1 — editing, deactivating or deleting a row does not.

**Unmatched names (2026-09, Cycle 3b; search/sort/paging added 2026-09-28, Team UX polish).** On its own tab, the "Unmatched names" list shows the person names found in uploaded actuals that could not be linked to a resource, with the hours and the number of projects each appears in. A search box filters by name (accents and case ignored); the Name/Hours/Projects headers sort the list (click again to reverse); with more than 25 rows the same "Previous"/"Next" paging as the Team tab appears, moving back to a valid page automatically if assigning or ignoring a name empties the current one. Clicking a row's project count expands the list of projects that name appears in, shown as "Project name (CODE)". A name is matched automatically when it equals a resource's name regardless of upper/lower case, accents, punctuation or order ("Rossi, Mario" = "Mario Rossi"); an ambiguous name (two active people with the same name) is never matched automatically and is flagged. For each listed name an admin can **Assign** it to a resource — picked from a searchable list (type part of the name, in any order, accents and capitals ignored; deactivated people are marked "(inactive)" and possible namesakes come first) — including a deactivated one, for people who have left — or **Ignore** it when it isn't a person (for example "TBD"). Assigned and ignored names are remembered as aliases, listed under "Existing aliases" as the admin typed them, and can be removed, which returns the name to the list. **Rescan** recomputes the list from all uploaded actuals (needed once for actuals uploaded before this existed); it also refreshes automatically after every actuals upload and every change to the team. Matching is exact — there is no fuzzy or guessed matching (a "suggest a likely candidate" hint was considered for this cycle and deliberately parked, not built).

**Experience profile (2026-09-25, Cycle 3c).** The Experience profile tab summarises the hours a person has worked, taken from the uploaded actuals whose owner name matches them (by name or by an alias). It shows total hours, number of projects and first/last month worked, then one collapsible block per attribute list (Market, Brand, ...): each value the person has worked on with its hours, share of their total, number of projects and last month, expandable to the projects and, inside them, the tasks; hours on projects that carry no value from that list are noted as "N h on projects without a value". A "Roles" block groups the same hours by role code. The profile is calculated in the background, so a new upload, a change of tags or a new alias appears after the next run (every 10 minutes by default); the Unmatched names list still updates immediately. A person with no matching actuals sees "No actuals matched to this person yet" with a link to the Unmatched names tab; a person created since the last run sees "Not calculated yet". Deactivating a person keeps the hours matched by their name, so the history of people who left is preserved (an active person with the same name takes precedence). An admin can force an immediate recalculation, or a full rebuild, from the Profile Processing console (§16.9a).

**Topics in the Experience profile (2026-09-29).** Above the tag lists the tab shows a "Topics" block: the competences (§16.11) attached to the projects and tasks the person worked on, as chips with the number of projects each comes from and a tooltip naming those projects; "No topics yet." when there are none. Project-level topics reach everyone with actuals on the project, task-level topics only those with actuals on that task. Only admin-approved topics appear, and an admin's rename, approval, rejection or merge shows up on the next load, with no wait for the background run.

### 16.8 Attribute Lists (Tag Taxonomy, 2026-09)

Own page (`attribute-lists.html`), admin or sysadmin, reachable from the same "Admin" navigation section as Team. A generic, admin-managed system of named lists and their items — seeded on first deploy with four lists (Market, Brand, Therapeutic Area, Service Type), each empty until an admin populates it. An admin can create additional lists at any time directly from the UI, with no further development needed.

Each list's items can be renamed and toggled active/inactive, but never deleted outright — once a tag exists, it can be retired but not erased, so a future feature that has already applied it to a proposal or project can't have that reference silently vanish. A list's own display name can be renamed too; its underlying identifier is fixed at creation and never changes, even across a rename. An item's label must be unique within its list (case-insensitive) — adding or renaming to a label that already exists in that list is rejected with an error (2026-09).

As of Cycle 2 (2026-09, §16.9), these lists and items are what a proposal/project's Tags section reads from — no other page consumes them yet, and the AI-assisted resource suggestion this taxonomy is ultimately meant to feed remains a later cycle.

The page has two tabs, **Lists** (everything above) and **Topics** (2026-09-29, §16.11), the latter carrying a badge with the number of topics waiting for review.

### 16.9 Tag Assignment on Proposals & Projects (2026-09, Cycle 2)

Second of four planned cycles toward AI-assisted resource allocation (§16.7/§16.8 were the first). Any editor or owner of a proposal — not just an admin — can assign tags from the lists set up in §16.8 (Market, Brand, Therapeutic Area, Service Type, or any list an admin has added) to it, from a new "🏷 Tags" section in the cost grid editor. Tags render as toggleable pills, grouped by list: click to assign, click again to remove.

A project's tags are its own, editable in the project's configuration page by anyone with edit permission on the project. When a project is first linked to a proposal (including when it is generated from one), it starts with a one-time copy of the proposal's tags, provided it has none of its own yet; after that the project's tags are independent — changing them does not affect the proposal, and later changes to the proposal's tags are not carried over to the project. Existing linked projects were seeded once from their proposal's tags when this behaviour shipped (2026-09-25, Cycle 3a). A project created without a linked proposal simply starts with no tags.

A tag whose underlying item is later deactivated (§16.8) stays assigned rather than silently disappearing — it renders distinguishably (dimmed, marked "inactive") so it stays visible and can still be explicitly removed, but is never dropped out from under whoever assigned it.

Filtering the pipeline board or portfolio reporting by these tags is not part of this cycle — deferred to a later one.

### 16.10 Profile Processing Console (2026-09-28, Cycle 3d)

Own page (`profile-jobs.html`), admin or sysadmin — a **hidden page with no navigation entry**, reachable only through a "Profile processing →" button in the header of the Excel Timesheet Upload page (§8), which carries a badge showing how many project codes are currently waiting to be processed (hidden when none are).

Every person's Experience profile (§16.7) is rebuilt in the background from uploaded actuals, one project code at a time, on a schedule (every 10 minutes by default). Until this cycle there was no way to see that queue or influence its timing from the product itself. This page gives an admin:

- **A schedule widget**: turn scheduled processing on/off and set the interval in minutes (1 to 1440); Save is only enabled once something actually changed, and the page confirms the new setting applies on the worker's next check (within 60 seconds, no restart needed) alongside an estimate of when the next scheduled run will happen.
- **Two global actions**: **Recalculate now** processes whatever is currently queued immediately; **Rebuild all** (with a confirmation, since it can take a while on a large database) queues every project code and processes all of them.
- **A list of every project code** the engine knows about — project name, code, number of actuals rows, number of matched resources, status (Queued / Error / Updated / Not processed), when it was last processed and when it's next due — searchable by code or project name, filterable by status, sortable by code/status/last processed. Each row has its own **Process** (recalculate just that code) and, for queued codes, **Remove from queue** (takes it out without changing the profile already calculated from it, until it's processed again).
- **Run history**: a collapsible list of the most recent runs (up to 50) — when, how it was triggered (scheduled/manual/on startup), how many project codes and resource contributions were touched, how long it took, and any error.

A code whose actuals were deleted (or whose project was deleted) but that hasn't been cleaned up yet still appears in the list, listed by its code, with zero rows — it can still be processed or removed from the queue like any other.

**Topic extraction controls (2026-09-29, §16.11).** The schedule card also has a **Topic extraction on/off** switch (with a "no API key configured" hint when the server has no AI key): when off, project descriptions are never sent to the AI service, and turning it back on picks up descriptions edited in the meantime. The code list gains a **Topics** column showing "extraction failed" (the error as tooltip) for a code whose last extraction failed — this does not stop the profile hours from being built and is retried on the next run. **Process** on a row now also sends that project's descriptions to the AI service again, even if unchanged.

### 16.11 Descriptions and Competence Topics (2026-09-29)

Projects and their tasks now carry a free-text **Description** (§7.1), and the proposal field previously called "Notes" is called Description (§4.9). From these texts the system derives **topics**: short competences such as "Medical writing" or "Data visualization", so that a person's Experience profile (§16.7) can say not only where they worked (tags) but what they did.

- **Extraction.** Saving a description never calls the AI service by itself; it only queues the project. The background worker (§16.10) then sends the changed texts of that project to an AI service (Anthropic API, configured on the server) and receives suggested topics. Very short texts (under 20 characters) are ignored. Suggestions that duplicate an attribute-list value (§16.8) are discarded, rejected topics are never proposed again, and an existing similar topic is reused. New suggestions start as **proposed** and are invisible in profiles until an admin approves them.
- **Topics tab** in the Attribute Lists page (admin or sysadmin): the review queue of proposed topics (Approve, Rename, Merge into..., Reject), the approved list (Rename, Merge, Reject), a collapsed list of rejected topics (Restore), and **+ New topic** to seed the vocabulary by hand. Topic names are 1 to 4 words and unique regardless of case and spacing; a name equal to an attribute-list name or item is refused. Merging moves everything onto the target topic; an approved topic can only be merged into another approved topic. Nothing is ever deleted: rejecting keeps the topic so it is not proposed again.
- **Privacy switch.** Extraction can be turned off from the Profile Processing console (§16.10) and is skipped entirely when the server has no AI key.

---

