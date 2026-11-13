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
