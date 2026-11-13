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
