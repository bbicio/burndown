# PDash — Operational Manual

**Generated:** 2026-09-16
**Source:** `PRD.md` (the project's product requirements document, kept in sync with what is actually merged and live — not a roadmap). No other document was used as source material.
**Scope:** What a user can do in the app and how, organized by page/flow. Permission differences are noted inline within each flow rather than as separate sections, since a person's access level can differ from one project to the next.

> This manual describes the English-language product interface. Regenerate it once enough live changes have accumulated to make it meaningfully stale — check the date above against recent changes to `PRD.md`.

---

## 1. Who uses PDash

PDash is for project and portfolio managers at a consulting or professional-services firm who need to track commercial offers, plan people's time, and watch budget spend across many projects at once.

Every project starts life as a **commercial offer** (called a Cost Grid) — an estimate of effort and cost, built role by role. Once an offer is far enough along, it becomes a **project**, and actual hours worked (imported from a weekly timesheet export) are compared against what was sold.

**Access levels.** Two things determine what you can do:
- Your **account role**: `user`, `admin`, or `sysadmin`. Admins and sysadmins can see and manage everything; a plain user only sees their own work plus anything shared with them.
- Your **permission on a specific offer or project**: `owner`, `editor`, or `viewer`. This is set per resource — you might own one project, edit another, and only view a third. A **viewer** can always look but never change anything on that resource.

---

## 2. Getting started

### 2.1 Signing in

Sign in with your email and password. If either is wrong, you'll see a generic "invalid credentials" message — the app never reveals which one was incorrect. A disabled account cannot sign in even with the correct password.

### 2.2 Getting an account

You can't sign yourself up — an administrator invites you by entering your name, email, and starting role. You'll receive an email with a link (valid 48 hours) to set your own password and activate the account.

### 2.3 Forgotten password

From the sign-in page, request a reset link by email. For privacy, the app always says a link was sent, whether or not the email matches a real account. If it does match, the link (valid 2 hours) lets you set a new password.

### 2.4 Changing your password

From the account menu (top right, any page), choose to change your password. You'll need to enter your current password plus the new one twice.

### 2.5 Your profile

From the account menu, "My Profile" lets you update your own first name, last name, and email.

### 2.6 Accepting Terms & Conditions

The first time you sign in — or any time the Terms & Conditions have been updated since you last accepted them — you're taken to an acceptance page before you can use the app. Tick the checkbox to continue; you're then returned to wherever you were headed.

### 2.7 Signing out

From the account menu, sign out clears your session and returns you to the sign-in page.

---

## 3. The three main views

Along the top of every page is a navigation bar with three tabs:

| Tab | What it's for |
|---|---|
| **Pipeline** | The board of commercial offers, organized by how close each one is to closing |
| **Resource Planning** | How sold hours are distributed across people, projects, and roles, and how that compares to actual time logged |
| **Project Reporting** | Budget health for every project — estimated vs. spent |

The app opens on **Pipeline** by default.

---

## 4. Pipeline — commercial offers

### 4.1 The board

Offers are shown as cards in six columns, one per stage:

| Stage | Meaning |
|---|---|
| Draft | Your own private working copy — no one else sees it, and it isn't counted in any column total |
| SIP | An early prospect |
| Expected | A qualified opportunity likely to close |
| Anticipated | High confidence, close is imminent |
| Committed | The deal is signed |
| Canceled | The opportunity was withdrawn or lost |

Every column except Draft shows the total value of everything in it at the bottom.

Each card shows the offer's name, stage, total value, how many phases/tasks it has, any project(s) it has produced, and quick actions. Editing and deleting are only available to you if you have edit access; a **viewer** never sees those buttons.

### 4.2 Finding an offer

A search box above the columns matches offer name or client name as you type. Alongside it, four dropdown filters — Owner, Client, Currency, and deal size — narrow the board further; you can select more than one value in any one filter, and the filters combine together. A "Clear filters" link appears once you've set anything, to reset in one click. Filters only ever narrow what you can already see — they never hide something from you that your access wouldn't already allow, and the Draft column always shows in full regardless of any filter.

### 4.3 Opening an offer

Click anywhere on a card (other than its buttons) to open the detail panel on the right. It shows:
- The offer's name, stage, dates, currency, and any notes
- The total value, split into professional fees and pass-through costs
- Every project this offer has produced, each with its own status and a button through to that project's own reporting page
- A full breakdown of phases, tasks, and the role-by-role cost of each

If the offer has more than one version, tabs above the detail panel let you switch between them.

Viewers can open and read everything here, but the Clone, Share, and Edit buttons aren't shown to them.

### 4.4 Creating a new offer

The **+ New Proposal** button opens a blank offer in the full editor.

### 4.5 The offer editor

Each offer is built from **phases**, each phase from **tasks**, and each task from **roles** with an estimated number of days. The editor lets you:
- Name the offer and set its version label, stage, dates, currency, and notes
- Attach a client and, optionally, a client-specific rate card (this changes what each role costs on this particular offer)
- Add or remove role columns, each with its own hourly rate
- Add pass-through costs at the task level
- Clone the whole offer, or delete a version that's still a Draft

The cost of each task is days × rate, summed per role, per phase, and for the offer as a whole.

**Locking.** Once an offer's stage is Committed *and* every one of its tasks has been turned into a project, that version locks — it shows a padlock and becomes read-only. As long as any task is still unconverted, the offer stays editable and you can keep generating projects from it, even after it's marked Committed.

### 4.6 Turning tasks into a project

From the editor, select the tasks you want to turn into a project and generate it. If you select only some of the offer's tasks (not all of them, and the offer isn't a Draft) and no **program** has been linked to this offer yet, you'll be asked to either create a new program or link to an existing one before the project is created — canceling that step cancels the whole thing, nothing is created. Once a program has been set up this way, every later project generated from the same offer links to that same program automatically, with no further prompt. Any editor of the offer can do this, not just admins.

### 4.7 Pipeline years

An administrator controls which yearly pipelines are visible on the board. If a year is hidden, it simply doesn't appear for anyone.

### 4.8 POT progress on an offer

If an offer is linked to a client (or a group of clients) that has a revenue target (a "POT") set for the year, the detail panel shows progress toward that target as a two-color bar — committed revenue in green, anticipated in orange — with the underlying amounts listed below.

---

## 5. Resource Planning

### 5.1 What it shows

How many hours have been sold, how many have actually been logged so far, and how the remaining hours should be spread across the weeks or months ahead — viewed by role, by project, or by the person doing the work.

### 5.2 Controls

| Control | What it does |
|---|---|
| Project filter | Limit to specific projects |
| Group by | Switch between By Role, By Project, and By Owner |
| Monthly / Weekly | Change the time granularity |
| Previous / Next | Move the visible date range |
| Team filter | Limit to a specific team |
| Monthly pulse | When someone's weekly hours would be tiny, bundle them into one monthly figure instead of a thin sliver every week |
| Rounded | Show whole numbers instead of two decimal places (display only — doesn't change any total) |
| Export XLS | Download the current table |

### 5.3 Reading the table

Every row has three summary figures — **Sold** (what was estimated), **From actuals** (what's actually been logged so far, for past periods), and **To be planned** (what's left to spread across the future). The remaining amount is never allowed to go negative — if actual hours already exceed what was sold on a task, that task simply contributes nothing further to future planning, rather than showing a negative number.

**By Owner** groups everything under each person, then their projects, then their tasks — so you can see at a glance what someone is actually working on, combining every role they've logged time under on that task into one figure.

**By Role** can be expanded: click a role to reveal which project/task combinations make up its total, each with its own figures, instead of one blended number.

### 5.4 The task timeline (Gantt view)

Opening a single project shows a bar for every task, colored by its state — grey if marked non-billable, green once complete, red if it's over its sold hours, blue otherwise. The filled portion of each bar shows how much of the sold effort has actually been consumed. The current week is highlighted.

---

## 6. Project Reporting

### 6.1 The project list

Each card shows a project's identity (name, code, stage, and status badges), whether it has any imported actuals yet, and a compact row of figures: the project's duration, what was sold, what's been spent, and the variance between them (shown in green when you're under budget, red when over).

**Finding a project.** A search box (first in the row) matches project name, project code, or client name as you type. Next to it, a Client dropdown and a Status dropdown (multi-select — Not started yet / Started / Started At Risk / Put on hold / Completed) narrow the list further; selecting more than one status shows anything matching *any* of them, while the search box, Client filter, and Status filter all have to agree together. A "Clear filters" link appears once anything is active, and resets search, Client, and Status together (it leaves your sort order alone). If nothing matches, the page says so plainly instead of showing a blank space.

Projects that share a **program** are grouped under one header showing the group's own combined totals and a project count; if a search or status filter matches only a project hidden inside a collapsed group, the group opens automatically so you don't have to go looking for it — while a filter is active, the manual show/hide control is replaced by a small "shown" indicator, since there's nothing left to toggle.

Each card has two buttons: **⚙️ Configure**, which takes you straight to that project's configuration form (hidden if you're only a viewer on that project), and **Project Dashboard**, which opens the project's own detail page.

### 6.2 A project's detail page

Opening a project shows:
- Key figures at a glance: total sold hours and budget, hours and budget consumed so far, and what's left of each
- A month-by-month table of estimated vs. spent hours and budget, with a running total and any pass-through costs broken out
- A burndown chart
- Three breakdowns of the timesheet data: by task, by role, and by functional area you've defined for the project — each shown in both hours and money
- Buttons to configure the project, load new actuals, share it, jump to its resource plan, or pin it into the summary table at the top of the list view

Configure and Load Actuals are hidden here if you're only a viewer. A "← Portfolio" link at both the top and bottom of the page takes you back to the list.

### 6.3 Comparing several projects

From the list, you can pin any number of projects into a summary table at the top of the page — a month-by-month comparison of estimated vs. spent across just the projects you've chosen.

---

## 7. Setting up a project

### 7.1 The project form

Every project has a name (must match the name used in the timesheet export), start/end dates, currency, stage, status, an optional client and program, and a link back to the offer it was generated from, if any. A "← Back to Portfolio" / "← Project Dashboard" pair of links appears at both the top and bottom of the form.

**Tasks.** Each task has a name (must match the timesheet's task column), whether it's billable, whether it's complete, its own start/end dates, how its budget is spread across the months it runs, and the roles and hours sold against it.

**Status.** Which status values you can pick depend on the project's stage — some stages disable the field entirely, others offer a longer list including "Started At Risk."

**Functional groups.** You can group roles into named areas for reporting — each group is a list of role names, each optionally scoped to just one task (or left as "any task"). This lets a functional area's totals stay accurate even when the same role is billed at different rates on different tasks.

### 7.2 Actuals for this project

From the same form: **Load Actuals** imports a timesheet file for this project; **View** shows every imported row with its rate and computed spend; **Download actuals** exports the same as an Excel file; **Delete actuals** permanently removes everything imported so far, after confirming. All of this except deleting is visible to viewers too.

### 7.3 Filling in the monthly grids automatically

Rather than typing every month's figures by hand, two buttons can bulk-fill them:

- **Derive from Task Dates** — always available. Spreads each task's sold hours and budget across the months it runs, based purely on its dates — no actuals involved.
- **Reforecast from actuals** — only available once actuals exist for this project. Past months are overwritten with what was actually logged (scaled down if actuals exceed what was sold, so nothing shows over 100%); future months are recalculated from whatever budget remains.

Either action only updates what's on screen — nothing is saved to the server until you click **Save** afterward. If you navigate away first, the recalculated numbers are lost and the page reloads the previous saved values. There's no undo once you've saved over the old numbers, and no way to preview the result beyond the confirmation dialog each button shows before running.

If a Reforecast run can't be completed without pushing a month's plan above 100%, nothing is changed at all — you'll see a message naming the task and asked to adjust its monthly split by hand before trying again.

The whole form is read-only if you're only a viewer on this project.

---

## 8. Timesheet uploads (actuals)

### 8.1 What a timesheet file needs

A spreadsheet with a date, role, person, hours, task name, and the project's own identifying code for each logged row. Dates in day/month or month/day format are read automatically wherever the numbers make it unambiguous; if a date genuinely can't be resolved, the whole file is rejected with the offending row named, rather than importing everything except that row.

### 8.2 What happens on upload

Rows are matched to a project by its code and grouped accordingly. Uploading a new file for a project replaces whatever was imported for it before — it doesn't add to the old data. Every report on the app refreshes to reflect the new numbers.

Each row's hourly rate is worked out and locked in at the moment it's imported — a later change to someone's rate doesn't retroactively change what's already been imported; re-uploading is how a project's numbers pick up a rate change.

### 8.3 Managing uploaded actuals (administrators)

A dedicated page lists every project code that has data, with upload counts and dates. You can filter by client or project, search by project code, view or export any project's rows, and permanently delete a project's actuals.

---

## 9. Settings

From the account menu, **⚙ Settings** has two tabs:

- **API & Integrations** — enter your own API key for an AI provider (Anthropic, OpenAI, or Google Gemini) if you want to use the AI features described in §11. Keys are stored only in your own browser.
- **Data Manager** — request an emailed export (cost grids, the project portfolio, or — admins only — role rate cards), download a full backup of the app's data, and send a notification to a colleague or (admins/sysadmins) broadcast one to everyone.

---

## 10. Notifications

A bell icon in the top bar shows how many notifications you haven't read yet. Opening it lists your last 50, newest first, delivered instantly as they happen — no need to refresh the page. Clicking one marks it read and takes you to whatever it links to, if anything; "Mark all read" clears everything at once.

You'll be notified when an export you requested is ready, when someone sends you a message, or when a cost grid or project is shared with you.

---

## 11. AI Assistant

Available from the "🤖 AI Chat" button, once you've entered an API key in Settings (§9).

- **Planning chat** — ask free-form questions about resourcing; the assistant already has context on the relevant project's configuration, tasks, and allocations, and can estimate how things look for the months ahead.
- **Project analysis** — run from a specific project's reporting page; returns a red/amber/green status with reasoning, a look at burn rate and budget risk, and concrete recommendations.
- **Overallocation check** — flags anyone booked more than 28 hours a week across their projects, ranked by severity.

---

## 12. Sharing and permissions

### 12.1 Ownership

Whoever creates an offer or a project owns it by default. An administrator can reassign ownership to someone else at any time — this doesn't happen automatically if the original owner's account is disabled.

Reassigning an offer's owner also gives the new owner edit access to every project that offer has already produced (without taking ownership away from anyone who already owns one of those projects), and emails the new owner a summary of what they've gained access to.

### 12.2 Sharing something with someone

From an offer's detail panel, or a project's reporting page, open **Share** to search for an existing colleague by name or email and grant them Editor or Viewer access. You can change or revoke that access at any time from the same place. The person is notified with a direct link to what was shared.

Sharing an offer does **not** automatically share the project(s) it produced — each needs to be shared on its own.

### 12.3 Seeing who has access

Both the offer's detail panel and its full editor show, without opening the Share dialog, who owns it and a plain list of everyone else with access and their permission level — you can remove someone directly from that list.

### 12.4 What a viewer can't do

A **viewer** can open and read an offer or project, but never edit, clone, delete, configure, or load actuals for it. If your only access to something is as a viewer, those controls simply aren't shown to you.

---

## 13. Administration

The sections below are for **admin** and **sysadmin** accounts. A plain user doesn't see these areas.

### 13.1 Clients

A simple registry of client names, each optionally with its own rate card — custom hourly rates per role that override the standard default whenever that client is selected on an offer. A rate card can hold rates in more than one currency.

### 13.2 Client groups

Named bundles of clients, used when several clients share one combined revenue target.

### 13.3 Pipelines & revenue targets (POTs)

Manage which pipeline years are visible, and set revenue targets ("POTs") per client, per client group, or against two general buckets for not-yet-identified or brand-new business. Each POT's page shows its target, how much has actually been committed or is anticipated toward it, a history of every change, and every offer counted toward it.

### 13.4 Programs

A simple registry grouping related projects together across the reporting and portfolio views.

### 13.5 Roles registry

Define the roles used throughout the app — a display name, a code that must match the timesheet export, and a default hourly rate (which can be overridden per offer).

### 13.6 User administration

Invite new users, change someone's role between user and admin, disable or re-enable an account, and (sysadmin only) grant or revoke sysadmin access and permanently anonymize a disabled account's identity while keeping their work data intact. No one can change their own role, status, or disable/anonymize themselves. A sysadmin account can only be changed by another sysadmin.

### 13.7 Terms & Conditions

Sysadmin-only. Edit and save a draft of the Terms & Conditions without affecting anyone; publishing a new version is permanent, is kept on record forever alongside every version before it, and forces every user to re-accept the next time they sign in.

### 13.8 Bulk data operations

Sysadmin-only, and irreversible. Delete data by category, delete a single offer outright, or reassign an offer's owner directly.

---

## 14. Quick reference — who can do what

| Action | Sysadmin | Admin | User |
|---|:---:|:---:|:---:|
| Bulk/destructive data operations | ✅ | ❌ | ❌ |
| Edit/publish Terms & Conditions | ✅ | ❌ | ❌ |
| Grant/revoke sysadmin | ✅ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ |
| Disable/re-enable users | ✅ | ✅ (not on a sysadmin) | ❌ |
| Anonymize a user | ✅ | ✅ (not on a sysadmin) | ❌ |
| Manage clients / programs / roles | ✅ | ✅ | view only |
| Manage rate cards | ✅ | ✅ | view only |
| See every offer / project / plan | ✅ | ✅ | own + shared only |
| Share an offer or project | ✅ | ✅ | own only |
| Upload a timesheet | ✅ | ✅ | for own projects only |
| Broadcast a notification to everyone | ✅ | ✅ | ❌ |

Beyond account role, a **viewer**'s permission on any one offer or project always overrides the above for that specific resource — even an admin who's been shared a project as a viewer sees it read-only, the same as anyone else would.
