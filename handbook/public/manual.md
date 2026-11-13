# User manual

PDash is a web application for project portfolio management: it tracks commercial offers through a sales pipeline, plans who works on what, and compares the budget with the hours actually worked. This manual follows the menu, one chapter per area. A heading marked "(admin)" describes something only administrators can use.

## Getting started

Everything here assumes you already have an account: an administrator creates it and you receive an invitation by email.

### Signing in

Enter your email and password on the sign-in page. PDash then emails you a six-digit code; type it to open your session. A session lasts 8 hours, after which your next click returns you to the sign-in page.

<details>
<summary>Details</summary>

- A wrong password and an unknown email give the same generic error, so the form cannot be used to find out which addresses have an account. A disabled account is refused even with the right password.
- The code is valid for 10 minutes, you have five attempts per sign-in, and a new code can be requested after 60 seconds.
- **Trust this device for 30 days** skips the code on that browser. Trusted devices are listed, and can be removed, in My profile (see Account, privacy and sharing).
- Too many failed password attempts lock sign-in for a while.

</details>

### Accepting the terms

The first time you sign in, and again each time an administrator publishes a new version, you are taken to an acceptance page. Tick the box to enable the continue button; you then go on to the page you were heading to.

### Activating your account and resetting a password

The invitation email carries a link, valid for 48 hours, where you choose your password. If you forget it, use **Forgot password?** on the sign-in page: the same message appears whether or not the address has an account, and if it does, a reset link valid for 2 hours arrives by email. A password needs at least 8 characters.

<details>
<summary>Details</summary>

- On the activation and reset pages a strength indicator (Weak, Fair, Good, Strong) fills as you type. It is only a hint: the button is enabled as soon as the password has 8 characters and the confirmation matches.
- If an invitation expired or was lost, ask an administrator to resend it.

</details>

### The menu

On a wide screen the menu is a sidebar on the left; the button at its top collapses it to a narrow strip of icons, and PDash remembers your choice. On a phone or a narrow tablet it becomes a dark bar at the top with icons only.

| Entry | What it opens |
|---|---|
| Pipeline | The board of commercial offers by deal stage. It is the page that opens first. |
| Portfolio | Budget overview of the projects and the report of each one. |
| Planning | Hours by role, project or owner across all projects. |
| Master Data (admin) | Clients, pipelines, roles and rates, currencies. |
| Timesheets (admin) | Upload of the actual hours. |
| User Admin (admin) | Invite and manage users. |
| Team (admin) | The registry of the people who work on projects. |
| Attribute Lists (admin) | The tag lists used on offers and projects. |

Administrators see the second group of entries under an Admin heading. System administrators also see a Sysadmin heading, with the tools for resetting data and for editing the Terms & Conditions.

<details>
<summary>Details</summary>

- Some pages have no menu entry and are reached from the page that owns them: the project configuration form and the Program Dashboard from Portfolio.
- With the sidebar collapsed, hovering an icon shows its name.

</details>

### The account menu and the bell

At the bottom of the sidebar (top right on a narrow screen) your initials open the account menu:

| Entry | What it does |
|---|---|
| My Profile | Opens your profile page. |
| Privacy Notice | Shows the Terms & Conditions in force. |
| Help | Opens the documentation, including this manual. |
| Send Notification | Sends a message to a colleague. |
| Change password | Opens the password section of your profile. |
| Sign out | Ends your session. |

The bell next to it shows how many notifications you have not read.

### Help

**Help** in the account menu opens the documentation viewer, open to every signed-in user. A list on the left, a drop-down on a narrow screen, shows the documents you can read; this manual is among them. Administrators also see technical documents, a manual test checklist and a production checklist under an Admin heading. A link to a document you may not see opens the first one you can.

## Pipeline and offers

The Pipeline page is a kanban board of commercial offers, one column per deal stage. It is where offers are built, priced, shared and, once agreed, turned into projects. The pipeline-year menu at the top of the page switches the year shown.

### Deal stages

| Stage | Meaning |
|---|---|
| Draft | Private working copy, visible only to its creator and left out of every total and filter. |
| SIP | Strategic intent or early prospect. |
| Expected | Qualified opportunity, likely to close. |
| Anticipated | High confidence, closing soon. |
| Committed | Deal signed. |
| Canceled | Opportunity withdrawn or lost. |

Each column header shows the number of offers and their fee total. **OPEN PIPELINE**, in the board header, is the total in euros of SIP, Expected and Anticipated.

<details>
<summary>Details</summary>

- When every offer of a column is in euros the total is a plain figure. When currencies are mixed the total is shown as "≈ €": every offer is converted with its own exchange rate, never added up raw.
- Clicking a column header collapses it to a narrow strip and clicking again expands it. Columns that are empty when the page opens start collapsed.
- The **Amounts** switch on the right of the filter bar shows amounts in their **Original currency** or **All in EUR**. It does not change the Value filter or Open pipeline, and it is not remembered.
- On a narrow screen the board shows one stage at a time, picked from a row of tabs; the filters move into a **Filters** panel that closes with **Show results**.

</details>

### Offer cards and the detail panel

A card shows the client, the offer name, its fee in the offer's currency (with the euro equivalent for a foreign currency), the creation date and the owner. Hovering a card shows **Edit**, **Clone**, **Share** and, on a Draft, **Delete**. Clicking the card opens a detail panel next to the board.

The panel has the stage, the version selector and the same actions in its header, then four tabs:

| Tab | What it shows |
|---|---|
| Overview | Fees, pass-through costs and total budget, period, currency with its exchange rate, the note, and who the offer is shared with. |
| Tasks | Each phase with its total and one row per task: period, hours and amount. |
| Linked projects | The projects generated from the offer, each with a link to its Project Dashboard. |
| POT | Progress towards the client's revenue target (see below). |

<details>
<summary>Details</summary>

- Deleting the only remaining version of an offer deletes the whole offer.
- Viewers do not see Edit, Clone or Delete.
- Administrators see a **Refresh rate** button next to the exchange rate when it is out of date. It changes only that offer's rate.
- A POT row only appears for offers that have a client with a target for the offer's pipeline year. Draft versions never count.

</details>

### Finding offers

The filter bar above the board has a search box for offer or client names, and filters for Owner, Client, Currency and deal Value. Typing in the search box also suggests clients and offers; picking a client filters the board to it and picking an offer opens its panel.

<details>
<summary>Details</summary>

- Several choices inside one filter match any of them; different filters must all match.
- Value ranges are under €20K, €20K–50K, €50K–100K, €100K–200K and over €200K, with a toggle to count pass-through costs in the range.
- Filters only narrow what you may already see. The Draft column is never filtered.
- **Clear filters** appears as soon as one filter is active. Filters reset when the page is reloaded.

</details>

### Pipeline years and the toolbar

The year menu lists the pipeline years you can see, with the number of offers each holds for you; the open year is marked "Current". The page remembers the year you picked. **+ New Proposal** creates a blank Draft in the year on show and opens it in the editor with the name selected, ready to be typed over. Administrators also see closed years, and only they can add offers to a closed year.

### POT progress

The POT tab compares the client's (or client group's) target for the offer's year with its offers of that year. It shows the percentage reached by Committed plus Anticipated, a bar split by stage, the figures for Committed, Anticipated and Total, and the **GAP TO TARGET** (**OVER TARGET** once exceeded). Lists below name the contributing offers and, greyed out, the SIP and Expected ones that do not count yet.

### The offer editor

**Edit** on a card, or a new proposal, opens the offer editor as a full page. Its top bar names the offer, shows its stage and has one segment per version.

| Control | What it does |
|---|---|
| Save | Saves at once. Every edit is also saved automatically in the background. |
| Clone | Creates a new, separate offer with a copy of this version's phases, tasks and roles. |
| Export XLS | Downloads the version as an Excel workbook. |
| Share | Opens the share dialog (not on a Draft). |
| Publish to SIP | Moves a Draft out of private status. It cannot be undone. |
| Generate project | Turns tasks into a project (not on a Draft). |
| + New version | Adds a Draft version that is a full copy of the one on screen (Draft only). |

The version holds a label, the stage, start and end dates, the currency, the client, the rate card, a description and the linked projects. A Draft banner carries **Delete version**.

<details>
<summary>Details</summary>

- Dates are typed or picked as "Dec 2025". The end cannot be before the start and a task cannot fall outside the offer's period; the page tells you when a typed date is refused.
- The currency is any that an administrator has activated, and the offer keeps its own exchange rate. The currency is locked as soon as a project has been generated from the offer.
- Publishing deletes any other Draft versions of the same offer for good. The confirmation names them first.
- A cloned offer always starts at version "v1" and does not copy tags or the exchange rate.
- The offer owner's name, creation date and the list of people it is shared with appear in the editor. An administrator can hand the offer to another user with **Reassign**.
- The **Tags** card attaches the values of the lists maintained in Attribute Lists (admin).

</details>

### Phases, tasks and roles

An offer is split into phases, each phase into tasks, and each task has hours per role. A task costs the hours times the role's rate plus its own pass-through costs; a phase is the sum of its tasks and the offer the sum of its phases. Hours are entered directly, not as days.

<details>
<summary>Details</summary>

- A role's rate comes from the client's rate card if it has one, otherwise from the role's default in the offer's currency, otherwise from the euro rate converted at the offer's exchange rate.
- A rate typed by hand is marked "Custom"; a rate of 0 is shown as "Missing rate" unless it was typed on purpose. Rates are typed in the offer's currency format and the cell shows the expected format when the text is not a valid amount.
- Each role column has a menu to move it left or right, **Change role…**, **Duplicate with another role…**, **Reset rate** (when the rate is custom) and **Remove column**. Remove asks for a second click on the same item before it deletes the hours.
- A saved offer is never repriced by itself. Rates change only when you change the rate card or the currency, or reset a single role.
- Pass-through costs are entered per task, in the offer's currency.

</details>

### Locked versions

A version becomes read only, with a lock icon, when the offer is Committed and every task has already gone into a project, or when another version of the same offer already has a linked project. While the offer is Committed but some tasks are still unassigned, the version stays editable and **Generate project** remains available.

### Generating a project

Select tasks in the editor and choose **Generate project**. Each role's hours become the sold hours of the new project task, unchanged.

<details>
<summary>Details</summary>

- **All remaining tasks at once** creates one project immediately.
- **Only some tasks**: if the offer has no program yet, a **Create program** step asks you to create one or link an existing program. Cancelling it creates nothing. After that, every project generated from the offer joins the same program with no further question. Any editor of the offer can do this.
- **Existing project** in the selection bar adds the selected tasks to a project already linked to the offer, after a confirmation listing them.
- If the save does not reach the server, a warning says so instead of a false success.

</details>

## Resource planning

Planning compares the hours sold in offers and projects with the hours already worked, and shows what is still to be planned in the coming weeks. Rows can be grouped by role, by project or by owner.

### What a row means

| View | Rows |
|---|---|
| By role | One row per role. It opens into one row for each project and task that role covers. |
| By project | Project, then task, then role. Each role row names the people who logged time on it. |
| By owner | Owner, then project, then task. All the roles a person worked under on a task are added into that one row. |

Every row has a column per month or week of the period you picked, and three summary columns: **Sold**, **From actuals** and **To be planned**. By owner lists the tasks that have nobody yet first, under "Unassigned (TBD)", marked "Needs owner".

<details>
<summary>Details</summary>

- **Sold** is the hours estimated in the task's roles, added up for the row and the Team filter in force.
- **From actuals** covers past weeks and is the timesheet hours matched to the task by its name and role.
- **To be planned** spreads what is left over the task's remaining weeks. What is left is the sold hours minus the actuals, worked out for each task and role and never below zero. Because an over-consumed task contributes zero rather than a negative number, a row's To be planned can be larger than its Sold minus From actuals. This is intended, and the column header explains it.
- If the task has a month-by-month distribution, the leftover follows it; otherwise it is split evenly over the task's own remaining weeks, so the figure does not change as you move through the calendar.
- **Monthly pulse** applies to the even split when that would put less than one hour a week on a task: the month's share is shown once, on the month's first week, as "~Xh".
- **Rounded** switches between whole numbers and two decimals. It only changes how numbers are shown, never a total or an export.
- A person marked inactive in Team receives no share of the future hours; their share goes to the other owners of the task, or to "Unassigned (TBD)" when there are none. Their past hours stay as they were, with an "inactive" badge.

</details>

### Filters and controls

| Control | What it does |
|---|---|
| Pipeline chips | One chip per pipeline stage; click to include or leave out that stage. |
| Projects | Pick the projects to show, searching by name or client. |
| Team | Pick the teams to show. |
| By role / By project / By owner | Chooses how rows are grouped. |
| Monthly / Weekly | Chooses the width of each column. |
| Period | Arrows move the window by one month; its label opens 3, 6 or 12 months, **Whole range**, or a From and To month. **Today** goes back to the current month and the next three. |
| Search | Narrows the rows to those that match, keeping their parents. |
| Monthly pulse, Rounded | The two display switches described above. |
| Expand all, Collapse all | Open or close every group. |
| How estimates work | A short explanation of the numbers in the active view. |
| Export XLS | Downloads the table as an Excel file. |
| Load XLS | Uploads a timesheet file; see Timesheet upload. |

<details>
<summary>Details</summary>

- A load of 24 hours a week or more for a person is shown in amber ("High load") and 30 or more in red ("Over-allocated"). It applies to the By owner view only and is a fixed display rule, not an analysis.
- Below 1024 pixels the search, the filters, the switches and Load XLS move into a **Filters** panel whose button shows how many filters differ from their default.
- On a phone the page is for reading only: a stepper shows one period at a time and each top-level row becomes a card that opens into its children.
- Export XLS is disabled while the data is loading, and the export is not changed by the search box.

</details>

### Team assistant (admin)

Administrators see a **Team assistant** button at the top of the page. It helps choose who to staff on a project. Pick a project already in Planning and press **Calculate team**, or ask in the chat, for example "Exclude Anna and recalculate" or "Why is X not among the best?".

The answer is three tables for each role the project needs: the best team (people with that job title, ranked by experience), an alternative team (other job titles with relevant experience) and the available team (ranked by experience and free hours over the project's period).

<details>
<summary>Details</summary>

- The experience score combines hours worked under the same job title, on the project's tags (market, brand, therapeutic area, service type), on similar tasks and on matching competence topics.
- Free hours are counted as 32 a week minus the planned and actual load of everything else in Planning.
- Calculate team uses no language model. The chat only turns your sentences into constraints and writes the summary; every number and table is calculated by the server. Chat messages, with the names, hours and project details they need, are sent to an external AI service.

</details>

## Project reporting

The Portfolio page shows every project you can see with its budget at a glance, and opens a full report for each one. Projects are created from an offer, so there is no button to create one here.

### The portfolio overview

A segmented control switches between **Card** and **List** and PDash remembers your choice. A project card shows the client, the project name and code, its stage and status, the duration, the amount sold, the amount spent and the variance, and a spend bar. The bar turns amber from 85% spent and red above 100%. **Dashboard** opens the project's report and **Configure** opens its configuration form.

| Control | What it does |
|---|---|
| Search | Matches project name, code or client. |
| Client, Stage, Status | Multi-select filters. Choices inside one filter match any of them; the filters together must all match. |
| Sort | Client A–Z, or Alphabetical. |
| Clear filters | Appears while a filter is active. |

<details>
<summary>Details</summary>

- "No budget" means nothing is sold on the project. "0% spent" means there is a budget that has not been billed against yet.
- A project with no timesheet data carries a "No actuals available" badge.
- Viewers do not see **Configure**.
- The List view has the columns Program / Project, Stage, Status, Duration, Sold, Spent and Variance; below about 1024 pixels Duration and Spent are dropped.

</details>

### Programs

Projects that belong to the same program are grouped under one row or card, with the figures added up across the program. A program card opens a panel with its projects; **Dashboard** on the program opens the Program Dashboard. **Share** gives a colleague access to every project of the program at once. While a filter is active the programs stay open so that a match is never hidden inside a closed one.

<details>
<summary>Details</summary>

- A program opened in Card view is also open in List view, and the other way round. Card view keeps one program open at a time.
- A program's status in List view reads "N at risk" when any project is at risk, otherwise "N projects".

</details>

### A single project's report

The **Dashboard** of a project opens its report. The header offers a way back to the portfolio, a menu with the other projects of its program, and these actions:

| Control | What it does | Who sees it |
|---|---|---|
| Configure | Opens the project's configuration form. | Not viewers |
| Load Actuals | Uploads a timesheet file for this project. | Not viewers |
| Share | Opens the share dialog. | Owner and editors |
| Planning | Opens Planning filtered to this project. | Everyone with access |

Three tiles summarise the project:

| Tile | Shows |
|---|---|
| Hours | Hours consumed out of hours sold, the percentage and the hours left. |
| Budget | Fees spent out of fees sold, the percentage and the amount left. Pass-through costs are shown beneath, not included. |
| Time elapsed | How much of the project's period has passed and whether hours are on track, ahead of or behind time. |

<details>
<summary>Details</summary>

- Hours and Budget come from the project's tasks and actuals, not from the monthly phasing grid, so they can differ from a phasing total that was not kept up to date.
- Hours dated after today are counted as consumed and noted under the Hours tile.
- With a project that has nothing sold, the tiles show "—" and "No budget".

</details>

### Burndown and monthly summary

The Progress card has three views, **Burndown**, **Monthly summary** and, for projects with pass-through costs, **Pass-through**.

The burndown is a line chart of the hours still remaining. The solid line is the actual trend up to today, with a label for what is left today; the dashed line is the plan, taken from the monthly phasing, or a straight line to zero when the project has no phasing. You can narrow it to one task and choose monthly, quarterly, biweekly or weekly steps, and **Export PNG** saves the chart.

The monthly summary has one row per month with planned hours, consumed hours and their variance, then estimated budget, spent and variance, a pass-through column when the project has such costs, and a total row. **Export XLS** downloads the same figures.

<details>
<summary>Details</summary>

- Only the bad variance is highlighted: a negative figure, over budget or over hours, shows in red.
- The current month carries a "current" mark and future months are muted.
- Without any timesheet data the card says "No actuals loaded yet." and, for people who can change the project, offers **Load Actuals**.

</details>

### Breakdown by task, role and functional area

A selector on the Breakdown card chooses the view. Each row shows what was sold, what was spent, what remains and a consumption bar; the total row is the same in the three views. A row that has consumed more than was sold is marked "Over sold".

| View | One row per |
|---|---|
| By task | Billable task. It opens into its roles and the individual time entries. Non-billable tasks are listed under "Excluded from report" and count in no total. |
| By role | Role and task together, so a role billed at two different rates gets two rows. |
| By functional area | Functional area defined in the project configuration, plus an "Ungrouped" row for hours that no area claims. |

<details>
<summary>Details</summary>

- Entries are grouped by month, newest first. A filter at the top (by role or by resource) narrows them, and the column headers sort them.
- A role that is in two functional areas counts in each of them and once in the total; a note under the table says so.
- **Period**, at the top right, limits the Spent column to the whole project, to one month or to a custom range of dates. Sold, remaining and consumption stay on the whole project.
- **Export XLS** downloads the current view.

</details>

### Program Dashboard

The Program Dashboard answers whether a program as a whole is on budget and on schedule, and which project needs attention first. It is opened from **Dashboard** on a program, or from the program line in a project's header. It adds nothing new to maintain: it is calculated from the projects the program contains and that you can see.

It has four tiles: Budget, Hours, Time elapsed and Needs attention. A project needs attention when its status is "Started At Risk", when 85% of it is consumed, or when its consumption is more than 10 points ahead of the time elapsed. Under the tiles come the program's burndown and the projects, as a **List** with a bar for each project, or a **Timeline** with a bar positioned by the project's dates.

<details>
<summary>Details</summary>

- When the projects of a program use different currencies, money figures read "Mixed currencies"; hours and percentages stay.
- The List ends with a "PROGRAM TOTAL" row. **Reporting →** on a row opens that project's own report.
- Projects without dates do not appear in the Timeline, and the Timeline is not offered for a program with no dated project.
- A program whose projects you cannot see shows a message instead of a refusal.

</details>

## Project configuration

The configuration form holds everything about one project: its identity, tasks, monthly budget and hours, pass-through costs, functional groups, tags and actuals. It opens from **Configure** on a project card or report. A project cannot be created here: it is generated from an offer (see Pipeline and offers), and the form cannot be opened without a project.

### Saving and navigating

The page head has a link back to the portfolio, the project's name with its stage and status, and three buttons: **Project Dashboard**, **Discard** and **Save**. Discard returns the whole form to its last saved state, after a confirmation. Save returns you to the project's report. A list of sections beside the form scrolls to each one; an amber dot marks a section that needs attention, with the reason when you hover it.

<details>
<summary>Details</summary>

- If something changed and you close the tab or leave the page, the browser asks you to confirm. Tags, actuals and a new client or program are saved at once and are not part of this.
- A save that is refused says "Save failed", names what was not saved and gives the reason.
- Below 1024 pixels the section list becomes a row of tabs, and on a phone one section is shown at a time.

</details>

### Project information

| Field | Notes |
|---|---|
| Name | Must match the project name in the timesheet file. |
| Start date, End date | Month level, typed or picked as "Dec 2025". The end cannot be before the start. |
| Currency | Read only: the project keeps the currency of its offer. |
| Pipeline, Status | The status choices depend on the pipeline stage. |
| Client, Program | Optional. |
| Description | What the project is about; used to learn the competences of the team. |

### Tasks and resources

Each task has a name that must match the "Task/Issue" column of the timesheet file, a **Billable** and a **Completed** tick, optional start and end dates, a description, and its resources: a role, the sold hours and the hourly rate. Tasks are listed in a table and one task is open for editing at a time.

For a task that lasts more than one month, a percentage per month says how its hours are spread; a badge shows whether the percentages add up to 100%. **Spread evenly** fills the months equally and **Clear** empties them. When some tasks have no valid split, one warning offers **Spread all evenly**, which fills only those and never overwrites a valid split.

<details>
<summary>Details</summary>

- The percentages cannot be edited once the task is Completed, when it covers a single month, or for a viewer.
- A task date cannot lie outside the project period. A task that already does is marked "Outside the project period".
- A rate is typed in the project's currency format; an invalid one stays outlined in red and Save is refused until it is fixed.

</details>

### Monthly phasing and planning

One card holds two grids switched by **Budget** and **Hours**: the budget planned for each month and the sold hours planned for each month. Both can be typed by hand, or filled by two actions.

| Action | What it does |
|---|---|
| Derive from task dates | Spreads every task's budget and hours over the months its dates cover. It is always available and ignores actuals. |
| Reforecast from actuals | Appears once actuals exist. Months with actuals take the real figures and the remaining budget and hours are spread over the current and future months. |

<details>
<summary>Details</summary>

- Both actions overwrite the grids on screen, ask for confirmation first and cannot be undone. Nothing is saved until you press **Save**; reloading the page before that discards the result.
- Reforecast shares what remains among the tasks still open, in proportion to what each has left, following the task's monthly split when it adds up to 100%. A task that is over its sold total gets nothing more.
- A line under the grid says whether the months add up to the billable total.

</details>

### Pass-through costs

External costs that are not sold hours, such as licences or travel. Add each as a line with a title, an optional note, an amount and the month it falls in; the project dates must be set first. A running total sums the lines and any line can be removed after confirming.

### Functional groups

A functional group is a name and a list of roles. Each role row has the role name, which must match the role in the timesheet file, and a task, "Any task" by default. Choosing a task claims that role's hours only on that task for the group. Groups appear in the Breakdown of the project report.

### Actuals

| Control | What it does |
|---|---|
| Load actuals | Uploads a timesheet file (see Timesheet upload). |
| View | Lists every imported row: date, owner, role, task, hours, notes, fee and spent. Available to viewers too. |
| Download actuals | Saves the same rows as an Excel file. |
| Delete actuals | Permanently removes the actuals of this project after a confirmation. Not shown to viewers. |

### Viewers

For a viewer the whole form is read only: a banner says so, every field is disabled and Save, Discard and the actuals buttons that change data are hidden.

## Timesheet upload

Actual hours reach PDash from a timesheet export in Excel. The upload replaces what was loaded before for each project, and every report is refreshed as soon as it is done.

### Where to upload

The same upload is offered in three places: **Load Actuals** on a project's configuration form, **Load Actuals** on a project's report, and **Load XLS** in Planning. Anyone who can change the project can use it; viewers cannot.

### The file

| Column | Notes |
|---|---|
| Date | Several formats are accepted: day/month/year, month/day/year or year-month-day. |
| Job Role: Name | The role, as "CODE - LABEL"; matched to the roles in Master Data. |
| Owner: Name | The person who logged the hours. |
| Hours | A decimal number, with a comma or a point. |
| Task/Issue | Must match a task of the project's configuration. |
| D365 Project ID | Identifies the project. |
| WF Project Name | A display name. |
| Notes | Free text, not used in any calculation. |

A new upload for a project code replaces every row loaded earlier for that code; it does not add to them. Rows with no project ID are skipped.

<details>
<summary>Details</summary>

- **Dates.** When one of the two numbers of a date is above 12 the order is obvious. When both are 12 or below, such as 03/04/2026, PDash reads it as month then day. A date that does not exist on the calendar rejects the whole file, and the message names the spreadsheet row. Nothing is imported in that case.
- **Role and task check.** Before anything is imported, every row's task and role are compared with the project's configured tasks and the roles on each task. If even one row does not match, the whole file is refused and a dialog lists every project, task and role combination that does not match. Correct the file, or the project's tasks and resources, and upload again.
- **The rate is fixed at import.** Each row's hourly rate is looked up once, when the file is imported, and stored with the row. A later change of a rate does not change rows already imported; uploading the file again picks the new rate up.

</details>

### Reviewing and removing uploads (admin)

Administrators open **Timesheets** from the menu. It lists every project code with uploaded data, grouped by client, with the number of uploads, the rows and the date of the last upload. Filters narrow it by client, project or code, and a pipeline-year selector, which starts on the current year, can be set to all years. A side menu switches between **Actuals** and **Profile processing**.

| Control | What it does |
|---|---|
| View | Lists every imported row: date, owner, role, task, hours, notes, fee and spent. |
| Download actuals | Saves the same rows as an Excel file named after the client, project, code and date. |
| Delete actuals | In the row's menu. Removes every row of that code after a confirmation. It cannot be undone. |

<details>
<summary>Details</summary>

- Spent is the fee multiplied by the hours, in the project's currency.
- Clicking Client, Project or Project code in the table header cycles through ascending, descending and unsorted.
- A project code with no linked offer has no pipeline year and only appears under all years.
- Profile processing is the queue that rebuilds the experience profiles shown in Team. It is a reference for administrators only; the numbers on it need no action in normal use.

</details>

## Master data (admin)

Master Data is for administrators. The pages are reached from the entries under Admin and linked by a side menu with two groups: Commercial (Clients and groups, Pipelines and POTs) and Financial (Roles and rates, Currencies).

### Clients and groups

A client is a name, used to group projects. The page has a **List** view and a **By group** view. **+ Add client** opens a drawer for the name and an optional group; clients can be renamed and deleted from their row, and a client that still has projects cannot be deleted. A group bundles clients that share a revenue target; a client belongs to at most one group, and a group that has a target cannot be deleted.

Each client's **Rate card** holds the rate for each role: the agency default, shown for reference, and a custom rate for this client, with an extra column for each active currency. A blank custom rate means the agency default applies. A new offer for the client takes its custom rates automatically.

<details>
<summary>Details</summary>

- Rates are typed in the convention of their own currency, for example 1.234,50 in euros or 1,234.50 in dollars. Text that is not an amount refuses the save.
- A caption under each field says where the rate in force comes from. A switch limits the list to customised roles and a save bar shows the number of unsaved changes, with **Discard**.
- If someone else saved the same rate card meanwhile, the save is refused and your edits stay on screen: reopen the card to see the current rates.
- Programs are not managed here. They are created from the project configuration form or when a project is generated from an offer, and their ID cannot be changed afterwards.

</details>

### Pipelines and POT targets

The page lists the pipeline years. A new year starts Hidden; the Visible switch decides whether the year appears on the Pipeline board, and a year can only be deleted while it has no offers or targets. From a year you can open its POT targets, its Proposal Phasing and its Project Phasing, each with an XLS export for the proposals.

A POT is the total revenue target for a client, a client group or one of two general scopes, "Unassigned / To be Identified" and "New Biz", in a year. The year page shows the total target with the share reached by Committed plus Anticipated, a summary card per stage, and a table of the POTs. **+ New POT** asks for the target and the amount; editing a target needs a reason, and every change is recorded in the history.

<details>
<summary>Details</summary>

- The details drawer of a POT shows four figures (Target, Total, Committed, Anticipated), the history of changes and the proposals that count towards it, each linking to its offer.
- Draft and Canceled offers are left out of those lists. SIP and Expected offers are shown but never count in the total.
- Amounts in the tables are in euros; an offer in another currency is converted with its own exchange rate.

</details>

### Roles and rates

Each role has a label, a code that must match the role code in the timesheet file, a team (the part of the code before the dash, used to filter Planning) and a default hourly rate in euros. For each active currency there is an optional default rate; left blank, PDash converts the euro rate at the current exchange rate. The list is grouped by team, with a search and a **Missing rates** switch to find roles with no euro rate.

### Currencies

The euro is the fixed base currency. Any other currency is inactive until an administrator activates it with **+ Activate currency** and the rate "1 EUR = X"; only active currencies can be chosen on offers. A rate can be updated at any time, after a confirmation that shows the old and new rate, and its history is kept.

<details>
<summary>Details</summary>

- Changing a rate does not change offers or projects already in the system: each offer keeps its own exchange rate, fixed when it was created or when its currency was changed. A **Refresh rate** in the offer's detail panel brings it up to date on request.
- Every amount is written and read in the convention of its currency, for example € 1.234,50 or $ 1,234.50. A currency such as the yen has no decimals.

</details>

## Team and attribute lists (admin)

Team and Attribute Lists are for administrators and system administrators. They are in the Admin group of the menu.

### Team

Team is the registry of the people who can be assigned to work: first name, last name, email, one role and a free-text job description. A person does not need a PDash account to be listed; a resource can optionally be linked to a user when the person has one. The role is chosen from the roles of Master Data, so renaming a role updates everyone who has it, and a role in use by a person cannot be deleted.

The page is one list. A bar above it filters by Active, Inactive or All, by role, and by linked or unlinked user, with a search box. Click a person to open a side panel with two tabs, **Details** and **Experience profile**. Each row's **⋯** menu offers **Edit**, **Deactivate** or **Activate**, and **Delete…**. **New resource** opens a drawer.

<details>
<summary>Details</summary>

- Deactivating hides the person from the default list and keeps their history; it also removes them from the future hours shown in Planning. Delete… asks you to tick a box first and lists the aliases that go back to the queue.
- Lists of more than 25 people have Previous and Next buttons. On a tablet or a phone some filters move into a menu and rows become cards.

</details>

### Unmatched names

Timesheet files carry the owner's name as free text. When a name cannot be matched to a resource, an amber notice above the Team list gives the number of names waiting and the hours not yet attributed, and opens the **Unmatched names** drawer.

For each name, which comes with its hours and the projects it appears in, you can **Assign** it to a resource or **Ignore** it when it is not a person, such as "TBD". An assigned or ignored name is remembered as an alias, listed under "Existing aliases", where it can be removed to send the name back to the queue. **Rescan** recomputes the list from all uploaded actuals.

<details>
<summary>Details</summary>

- A name matches automatically when it equals a resource's name ignoring capitals, accents, punctuation and order, so "Rossi, Mario" matches "Mario Rossi".
- A name shared by two people is flagged AMBIGUOUS and is never matched by itself: pick the right person from the chips beside it.
- Deactivated people can still be chosen, for colleagues who have left; they are marked "(inactive)".

</details>

### Experience profile

The Experience profile tab sums up what a person has worked on, from the uploaded actuals whose owner name matches them: total hours, number of projects and the first and last month. Below it come a block of competence Topics, one block for each attribute list (Market, Brand and so on) showing each value with its hours, share and projects, and a block of hours by role. Blocks open down to projects and tasks. A link on the tab opens Profile processing, the queue that rebuilds the profiles.

### Attribute lists and tags

Attribute Lists holds the lists used to tag offers and projects. Market, Brand, Therapeutic Area and Service Type are there from the start, empty until you fill them, and you can create more with **New list**. Pick a list in the side menu to see its values, with an Active, Inactive or All filter, a search, **New item** and **Rename**. A value's **⋯** menu has **Edit label** and **Deactivate** or **Activate**; values are never deleted, only retired, and a green message after each change offers **Undo**. A label must be unique within its list.

Tags appear in the **Tags** section of the offer editor and of the project configuration form, as pills grouped by list: click to assign and click again to remove. Anyone who can edit the offer or the project can tag it. A project starts with a one-time copy of its offer's tags and is independent afterwards. A tag whose value was later deactivated stays assigned and is shown dimmed as "inactive".

### Competence topics

The same page reviews the competence topics that PDash suggests from the descriptions of projects and tasks, such as "Medical writing". The side menu lists them as **Proposed**, **Approved** and **Rejected**. A proposed topic does not appear in anyone's profile until you approve it.

<details>
<summary>Details</summary>

- Each topic has a **⋯** menu: **Rename**, **Reject** and **Merge into…**. Merging cannot be undone and asks for confirmation. A rejected topic can be restored and is never suggested again.
- **New topic** adds a topic by hand. Names have one to four words.
- The suggestions come from an external AI service, run in the background after a description is saved, and descriptions under 20 characters are ignored. Extraction can be turned off from the Profile processing page, and it does not run at all when the server has no AI key.

</details>

## User administration (admin)

User Admin is for administrators and system administrators. It lists all users, with filters by status (All, Active, Pending, Disabled, each with its count) and by role, a search on name and email, and sortable columns. **Invite user** opens a drawer for the first name, last name, email and role; the new person receives an invitation email and the account stays pending until they choose a password.

| Role | What it can do |
|---|---|
| user | Sees and edits only their own offers and projects, and what is shared with them. |
| admin | Everything about data and configuration, and managing users. |
| sysadmin | Everything an admin can do, plus resetting data and editing the Terms & Conditions. |

Each row has at most one visible button, **Resend invite** for a pending user or **Enable** for a disabled one. Everything else is in the row's **⋯** menu, grouped as Role, Access and Data; an action that is not available is greyed out with the reason.

<details>
<summary>Details</summary>

- **Role.** Any admin can make a user an admin or make an admin an ordinary user. Granting or removing sysadmin is for system administrators only and goes one step at a time: user to admin, then admin to sysadmin, and back in the same order.
- **Access.** **Disable** asks for confirmation and takes effect at the person's next action. **Enable** gives access back.
- **Edit details…** changes a user's name and email in a drawer. It is how a request to correct someone's details is handled. Changing the email cancels a reset link or an invitation sent to the old address, so resend the invitation afterwards.
- **Anonymize** is available only on a disabled account. After a confirmation it replaces the name and email with placeholders and keeps the person's offers and projects. It is how the right to erasure is honoured.
- Nobody can change their own role or status: your own row reads "Your account". A system administrator's row can only be changed by another system administrator; an admin sees "Sysadmin only".
- If the invitation email cannot be sent, the user is still created and the drawer says so; use **Resend invite**. Resending issues a new link valid for 48 hours.

</details>

### Sysadmin tools

System administrators have two more pages under the Sysadmin heading. **Terms & Conditions** edits the text people accept: **Save draft** keeps it private, **Publish new version** records it permanently and asks everyone to accept it again at their next sign-in, and a preview shows how it looks. Every published version is kept and can be read from the version history. **DB Reset** deletes data in bulk, by scope: proposals, projects and programs, clients and groups, client rate cards, actuals, pipeline years and POTs, and notifications. Every action there is irreversible and asks you to type the word DELETE.

## Account, privacy and sharing

### My profile

My Profile has one section per topic, listed in a small menu at the top.

| Section | What it holds |
|---|---|
| Personal details | Your name, email, role and the date you joined, read only. |
| Password | Change your password: the current one, then the new one twice. |
| Two-step verification | Explains the six-digit email code asked after the password. |
| Trusted devices | The browsers that skip the code, with their expiry and a way to remove them. |
| Your data in PDash | What PDash keeps about you and the documents you agreed to. |

Your name and email are managed by an administrator. To correct them, choose **Request a change** in Personal details and describe what is wrong; every other active administrator receives a notification and an email. You can send five requests an hour.

<details>
<summary>Details</summary>

- Changing or resetting your password, or having your email changed, removes your trusted devices and signs you out elsewhere; the browser where you changed the password stays signed in.
- If no other administrator is active, the request drawer says so and nothing is recorded.
- When your deployment names a privacy contact, Your data in PDash also shows a card with a **Write an email** button for questions about your data.

</details>

### Privacy and your data rights

**Privacy Notice**, in the account menu, shows the latest published Terms & Conditions with their version and publication date. Right to erasure is not self-service: an administrator disables your account and then anonymizes it, which removes your personal data while keeping the work records.

### Sharing

Every offer and every project has an owner, normally whoever created it, and can be shared with colleagues who have an account. Sharing offers two permission levels: **Editor** can change the item, **Viewer** can only read it. Open the share dialog from the offer's detail panel or from the project's report; you search people by name or email, since only existing accounts can be given access. A draft offer is private to its creator and cannot be shared.

<details>
<summary>Details</summary>

- Sharing an offer does not share the projects generated from it: each grant is separate.
- The offer's detail panel and the offer editor list who has access, with the permission of each person. A share can be removed from that list; adding one or changing its permission needs the share dialog.
- Each program in Portfolio, and its Program Dashboard, has a **Share** button that gives the chosen permission on every project of the program in one step. It is available to administrators and to people who own or edit at least one project of the program.
- Viewers do not see the buttons that change things: Edit, Clone and Delete on the pipeline board, Configure and Load Actuals on the reports, and the project configuration form is read only.
- An administrator can reassign an offer's owner from the offer editor. The new owner also gets Editor access to the projects already linked to it, and is notified by email.
- When someone's access to a project is removed, they are notified.

</details>

### Notifications

The bell shows the number of unread notifications. Clicking it opens the last 50, which arrive in real time without reloading the page. Clicking a notification marks it read and follows its link, if it has one; **Mark all read** clears the badge in one step.

| You are notified when |
|---|
| An offer, a project or a program is shared with you, or your access to a project is removed. |
| You become the owner of an offer. |
| A colleague, or an administrator for everyone, sends you a message. |
| A colleague asks the administrators to correct their details (administrators only). |

<details>
<summary>Details</summary>

- The first line of the notification panel can switch on desktop pop-ups. They appear only while the PDash tab is not in front, and the row is hidden if your browser has blocked notifications for the site.
- Share and ownership notifications are also sent by email.

</details>

### Sending a notification

Choose **Send Notification** in the account menu, pick a colleague, write a title and, if you like, a message and a link, and decide whether it goes as a push notification, as an email, or both. Administrators can also address everyone at once.
