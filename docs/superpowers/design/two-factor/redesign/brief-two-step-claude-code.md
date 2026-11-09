# Brief — My profile page + two-step verification (`profile.html`, `login.html`, `admin.html`)

**Goal**
- Replace the **My Profile** modal and the **Change password** modal with a real page, `profile.html`.
- Add **two-step verification (2FA)** in three places:
  - a second step at sign-in;
  - a Security section where users manage their method;
  - an admin reset in User Admin.

The product brief with flows, rules and policies is `docs/superpowers/design/two-factor/2026-11-09-two-factor-brief.md`. **Read it first.** This document covers the UI only: layout, components, copy and states. It doesn't redefine the backend.

**Scope**
- **Visual and interaction layer.** 2FA itself is new development (endpoints, TOTP, codes, sessions). Build it to the product brief. The boards only show how it looks and behaves.
- Elements that need new development **beyond** the product brief are marked **⚠ only if available**. Leave them out if the backend doesn't support them, and list them in the PR.

## 0. The site wins over the design

The boards are a visual reference, not a spec. **The site's rules and stylistic choices take precedence over the boards.**

- **Visual consistency with the redesigned pages comes first.** Use the components and classes the site already has: `.ph`, the Master Data sub-navigation, `.pd-drawer`, `.pd-row-menu`, `.pd-status-pill`, `.pd-banner`, `.pd-confirm` / `.pd-confirm-modal`, `.pd-state`, the `auth-card` (`css/auth.css`), and buttons and inputs. If a board shows a slightly different variant (spacing, radius, shadow, font size), **use the site's version**.
- **When a board and the site disagree on data, rules, permissions, API responses or flows, the site (and the product brief) is right.**
- Sample names, dates, devices, counts and codes in the boards are placeholders.

## 1. References

Captures are in `docs/captures/two-step/` (PNG, 1×). Each file name starts with the board id. The source files are:

- `MyProfile.dc.html`
- `TwoStepLogin.dc.html`
- `UserAdmin2FA.dc.html`
- `MyProfileResponsive.dc.html`

The notes (in Italian) are in `Section - Two-Step.dc.html`.

| Board | File | State |
|---|---|---|
| 15a | `15a-details.png` | Profile · Details (email read-only) |
| 15b | `15b-password.png` | Profile · Password |
| 15c | `15c-twostep-email.png` | Two-step · Email code active, invitation to set up the app |
| 15d | `15d-twostep-app-enabled.png` | Two-step · Authenticator active, just enabled (banner) |
| 15e | `15e-twostep-app-no-fallback.png` | Two-step · Authenticator active, policy without email fallback |
| 15f | `15f-twostep-loading.png` | Two-step · loading |
| 15g | `15g-twostep-save-error.png` | Two-step · save error |
| 15h | `15h-sessions.png` | Sessions ⚠ |
| 15i | `15i-trusted-devices.png` | Trusted devices |
| 15j | `15j-notifications.png` | Email notifications ⚠ |
| 15k | `15k-privacy.png` | Privacy & data |
| 15l | `15l-privacy-export-ready.png` | Privacy & data · export ready ⚠ |
| 15m | `15m-wizard-scan.png` | Wizard step 1 · Scan |
| 15n | `15n-wizard-verify-error.png` | Wizard step 2 · Verify, code doesn't match |
| 15o | `15o-wizard-recovery-codes.png` | Wizard step 3 · Save recovery codes |
| 15p | `15p-switch-confirm.png` | Switch back to email · confirm + re-authentication |
| 15q | `15q-switch-wrong-password.png` | Switch · wrong password |
| 15r | `15r-regenerate-reauth.png` | Regenerate codes · re-authentication |
| 15s | `15s-regenerate-new-codes.png` | Regenerate · new codes |
| 15t | `15t-switched-to-email.png` | After the switch to email |
| 15u | `15u-login-email-initial.png` | Login · Email code, resend on cooldown |
| 15v | `15v-login-email-resent.png` | Login · code resent |
| 15w | `15w-login-email-wrong-code.png` | Login · wrong code, attempts left |
| 15x | `15x-login-email-expired.png` | Login · code expired |
| 15y | `15y-login-verifying.png` | Login · verifying |
| 15z | `15z-login-too-many-attempts.png` | Login · too many attempts |
| 15aa | `15aa-login-email-send-error.png` | Login · email couldn't be sent |
| 15ab | `15ab-login-app-with-fallback.png` | Login · Authenticator, with "Send a code to my email instead" |
| 15ac | `15ac-login-app-no-fallback.png` | Login · Authenticator, without the email fallback |
| 15ad | `15ad-login-app-wrong-code.png` | Login · Authenticator, wrong code |
| 15ae | `15ae-login-recovery-code.png` | Login · Use a recovery code |
| 15af | `15af-login-recovery-invalid.png` | Login · recovery code invalid or used |
| 15ag | `15ag-login-tablet.png` | Login · tablet 1024×768 |
| 15ah–15al | `15ah-login-phone-email.png` … `15al-login-phone-locked.png` | Login · smartphone 390×844 (email, error, app, recovery, locked) |
| 15am | `15am-admin-2fa-badges.png` | User Admin · App / Email badge next to the name |
| 15an | `15an-admin-row-menu-reset.png` | User Admin · ⋯ menu with the Security group |
| 15ao | `15ao-admin-reset-confirm.png` | User Admin · Reset two-step verification confirm |
| 15ap | `15ap-1-profile-tablet.png`, `15ap-2-profile-smartphone.png` | My profile · tablet and smartphone |

## 2. Constraints

- Vue 3 and Bootstrap 5.3 from CDN. No build step. The server generates the QR code as an image.
- **No hex literals in code.** Use `var(--token)` from `css/tokens.css`; the hex values in the boards only show the intent. Add a token only if none fits, and justify it in the PR. Every text/background pair must be ≥ 4.5:1.
- All UI copy in English. Use the ellipsis character `…`.
- Icons: inline SVG, `stroke="currentColor"`, 14/16 px. No emoji.
- No `alert()` / `confirm()`. Use one modal idiom: the shared confirm.
- Layering: page < drawer < confirm modal.

## 3. Navigation and entry points

- **Account menu** (`js/nav.js`, `.pd-account-menu`):
  - **My Profile** now opens `profile.html` instead of `#navProfileModal`.
  - **Change password** opens `profile.html#password`.
  - Privacy Notice, Send Notification and Sign out are unchanged.
  - Remove `#navProfileModal` and `#navChangePwdModal`, and their handlers. Update `js/lib/nav-behavior.test.js`, which checks those ids.
- On `profile.html` the account button at the bottom of the sidebar (`.pd-account-btn`) is the **active entry**: light background plus a 3 px magenta inset bar, as on the other active items. In the icon rail (tablet) it's the avatar.
- The sub-section is in the hash (`#details`, `#password`, `#two-step`, `#sessions`, `#devices`, `#notifications`, `#privacy`). Without a hash the page opens on Details.

## 4. Page structure (15a)

- Shell unchanged: `pd-nav` sidebar and `#app-main`. Breadcrumb `Home › My profile`.
- `.ph` header:
  - 48 px navy avatar with the initials;
  - title **My profile**;
  - subtitle `{First} {Last} · {role} · member since {date}`.
  - No header button: actions live inside the sections.
- Body: **Master Data sub-navigation** on the left (≈ 212 px) and content on the right (max ≈ 780 px). The groups:
  - **ACCOUNT**: Details, Password
  - **SECURITY**: Two-step verification (chip `Email` grey / `App` green), Sessions (count), Trusted devices (count)
  - **PREFERENCES**: Notifications
  - **PRIVACY**: Privacy & data
- Each section is one white card: a header (15 px bold title + muted sub), a body, and an optional footer with actions on the right.

## 5. Details (15a) and Password (15b)

- **Details**
  - First name and Last name are editable.
  - **Email is read-only**: a grey field with a lock icon, and the help text `Managed by an admin. Sign-in codes are sent to this address, so only an admin can change it.`
  - Role (`.pd-status-pill`-style role chip) and Member since are plain text.
  - Footer: magenta **Save changes**, disabled until something changes, with a spinner while saving. **Discard** appears only while there are changes. After saving: `Changes saved.` in green on the left.
  - API: `Api.auth.updateProfile` with the current email, unchanged. ⚠ The backend should reject a self-service email change; if it doesn't yet, list it in the PR. Check that admins can change a user's email from User Admin.
- **Password**
  - Sub: `Last changed on {date}.` ⚠ only if available.
  - Fields: Current password, New password (placeholder `At least 8 characters`), Confirm new password. A mismatch shows a red field and `Passwords don't match.`
  - A 4-segment strength bar below the fields. It's only a hint: the rule stays the server's minimum of 8 characters.
  - Footer note: `Updating your password signs you out of other sessions and removes trusted devices.` Only if the backend does this; otherwise remove the note.
  - Button **Update password**, using `Api.auth.changePassword` as today.

## 6. Two-step verification (15c–15g)

Card header: **Two-step verification**, with the sub `After your password, PDash asks for a 6-digit code. Choose how you get it.` Below it, the **methods as a list of rows**. Passkeys will be one more row later, with no redesign. Each row has a 36 px icon tile, a title, a status chip, a description and, if needed, an action on the right.

- **Email code active (15c)**
  1. **Email code**, green `Active` chip with a dot. Text: `Codes are sent to f•••@company.com and expire after 10 minutes.` Mask the email.
  2. **Authenticator app**, pink `Recommended` chip, a very light pink row background. Text: `More secure, and works offline: codes come from an app on your phone instead of your inbox.` The magenta **Set up authenticator app** button is the only primary on the page. It opens the wizard (§7).
- **Authenticator active (15d, 15e)**
  1. **Authenticator app**, `Active` chip. Text: `Enabled on {date}. PDash asks for the code from the app after your password.`
  2. **Recovery codes**, chip `{n} of 10 left` (amber when ≤ 3, with `You're running low. Regenerate them…`). A row of 10 small segments shows the codes left. Outline button **Regenerate codes**, which opens §8.
  3. **Email code**, grey `Backup` chip, with the text `If you can't use the app, you can ask for a code at f•••@… when you sign in.` **Show this row only if the policy allows the email fallback (15e: without it).**
  4. Footer strip: amber shield icon, the text `Going back to email codes removes the app and your recovery codes. It's less secure: anyone with access to your mailbox could sign in.`, and an amber underlined link **Switch back to email code…**, which opens §8. Lowering security must look like it.
- **Feedback**: section banner above the card (`.pd-banner`).
  - `Authenticator app enabled. From your next sign-in, PDash asks for the code from the app.`
  - `Switched to email code. The app and recovery codes were removed. We sent a security notice to your email.`
  - `New recovery codes created. Your previous codes no longer work.`
  - Error (15g): `Couldn't save your changes. The server didn't respond. Your sign-in method hasn't changed. Try again.`
- **Loading (15f)**: spinner inside the card, `Loading your sign-in methods…`.

## 7. Wizard "Set up authenticator app" (15m–15o)

A **480 px drawer** (`.pd-drawer`, same as Invite user / New resource). Header: eyebrow `TWO-STEP VERIFICATION`, title **Set up authenticator app**, close ×. Below the header is a **3-step indicator**: Scan · Verify · Save codes. Done steps are navy circles with ✓; the current step has a navy outline.

1. **Scan (15m)**
   - Text: `Open an authenticator app on your phone, like Microsoft Authenticator, Google Authenticator or 1Password, and scan this code.`
   - The QR image from the server, about 176 px, inside a white box with a border.
   - A grey box: `Can't scan? Enter this key in the app`, the key in monospace grouped by 4, a **Copy** button (it changes to `Copied`), and `Account: PDash · {email} · time-based`.
   - Footer: `Step 1 of 3`, **Cancel**, **Continue**.
2. **Verify (15n)**
   - Text: `Enter the 6-digit code shown in the app for PDash. It changes every 30 seconds.`
   - The same 6-box input as the login (§9).
   - Error box: `Code doesn't match. Check that the time on your phone is set automatically, then enter the current code.`
   - Footer: **Back**, **Verify** (disabled until 6 digits, spinner `Verifying…`).
3. **Save recovery codes (15o)**
   - Amber box: **Save these codes now. You won't see them again.** `If you lose your phone, each code lets you sign in once.`
   - A 2-column grid of the 10 codes in monospace.
   - Outline buttons **Copy**, **Download .txt**, **Print**.
   - A required checkbox, as a bordered row: `I have saved these codes in a safe place`.
   - **Done** stays disabled until it's ticked.
   - **No × at this step**: the app is already active after Verify, so the only way out is Done. Esc doesn't close the drawer either. Done closes it and shows the banner from §6.

## 8. Re-authentication: Switch back to email and Regenerate codes (15p–15t)

The shared **confirm modal** (`.pd-confirm`, the same as Disable in User Admin), with a **Confirm it's you** block inside.

- **Switch back to email code? (15p)**
  - Amber shield icon.
  - Body: `Sign-in codes will go to your inbox again. Email is less secure than an app: anyone with access to your mailbox could sign in to PDash.`
  - Two boxes: **REMOVED** (Authenticator app · {n} unused recovery codes · Trusted devices) and **NEXT SIGN-IN** (Code sent to f•••@…).
- **Regenerate recovery codes? (15r)**
  - Key icon.
  - Body: `Your {n} unused codes stop working right away, and you'll get 10 new ones to save.`
- **Confirm it's you**: field **Current password**. The link on the right, `Use a code from your app instead`, swaps it for a 6-digit field (`inputmode="numeric"`, `autocomplete="one-time-code"`), and back again with `Use your password instead`.
  - Errors under the field (15q): `That password isn't right. Try again.` / `That code doesn't match. Use the current one from the app.`
- Buttons: **Cancel** and a navy primary (**Switch to email code** / **Regenerate codes**), disabled until the field is filled, with a spinner `Confirming…`.
- After Regenerate, the **New recovery codes** drawer (15s) opens: the same body as wizard step 3, without the step indicator and without ×. The footer says `Old codes stopped working.`
- After the switch (15t): Email code is active and the success banner appears.

## 9. Login, second step (15u–15al)

This is a third view inside the `auth-card` of `login.html`, next to "login" and "forgot". There is no shell.

- **Shared parts**
  - Logo as today.
  - **Step indicator** above the title: green ✓ circle `Password` — line — magenta-outline circle `2` **Verification**. It tells the user this step is expected and not an error.
  - A 44 px icon in a light circle: mail / phone / key.
  - Title 20 px, lead text 13 px.
- **Code input**
  - **Six separate boxes**, about 48×52 px (54 px high on smartphone). The gap between boxes 3 and 4 is wider.
  - Wrap them in a `role="group"` labelled `Code from email` / `Code from app`, and give each box `aria-label="Digit n of 6"`.
  - Every box has `inputmode="numeric"`. `autocomplete="one-time-code"` goes only on the first box.
  - Pasting (or iOS/Android autofill) fills all six boxes.
  - Typing moves to the next box; Backspace on an empty box goes back; the arrow keys move between boxes.
  - **Submit automatically on the 6th digit**, and keep **Verify** for anyone who prefers it.
- **Trust this device for 30 days**: a checkbox under the input.
- **Primary**: a full-width magenta **Verify**. It's pale while the code is incomplete, and shows a white spinner and `Verifying…` while it runs.
- **Email code (15u)**: `Check your email` / `We sent a 6-digit code to f•••@company.com. It expires in 10 minutes.` Under the button, **Resend code**, or `Resend in {s} s` during the cooldown (`aria-live="polite"`).
- **Authenticator (15ab, 15ac)**: `Enter your app code` / `Open your authenticator app and enter the 6-digit code for PDash.`
  - The **escape hatches** go below a hairline, in small grey text: `Can't use the app?` · **Use a recovery code** · **Send a code to my email instead**.
  - The second link appears **only if the policy allows it** (15ac: without it).
- **Recovery code (15ae)**: `Use a recovery code` / `Enter one of the recovery codes you saved when you set up the authenticator app.`
  - A single monospace field with placeholder `XXXX-XXXX`. It turns input to upper case and adds the dash.
  - Help: `Each recovery code works once. After signing in, check how many you have left in My profile.`
  - Escape: `Have your phone?` · **Use the authenticator app instead**.
- **States**: inline box above the input, `role="alert"`, red for errors and green for info.
  - Wrong code (15w, 15ad): the boxes turn red and keep the digits until the next keystroke. `Incorrect code. {n} attempts left.` The app version adds `Use the code currently shown in the app: it changes every 30 seconds.`
  - Resent (15v): `A new code has been sent. Use the latest one: earlier codes no longer work.` The cooldown restarts.
  - Expired (15x): `This code has expired. Send a new one to continue.` The boxes are disabled and the primary becomes **Send a new code**.
  - Send error (15aa): `We couldn't send the email. Check your connection and try again.` The primary becomes **Send a new code**.
  - Recovery code not valid (15af): `That recovery code isn't valid or was already used.`
  - Too many attempts (15z): the card shows only a red lock, **Too many attempts**, `For your security we stopped this sign-in. Sign in again with your password to get a new code.` and the primary **Back to sign in**.
- **← Back to sign in** (small grey link at the bottom) goes back to the password step.
- After the correct code, the flow continues as today, Terms & Conditions gate included.
- **Smartphone**: the same card with 16 px around it. This is the most common case: keep the input above the fold, and every target ≥ 44 px.

## 10. User Admin (15am–15ao)

- **Badge next to the name**: a small 2FA chip after the name (and after `YOU`).
  - Green `App` with a phone icon, or grey `Email` with a mail icon.
  - Tooltip: `Two-step verification: authenticator app` / `… email code`.
  - Not shown on pending or anonymized users.
- **Row ⋯ menu**: a new **SECURITY** group between Access and Data, with **Reset two-step verification…** (key icon) and the sub `Removes their authenticator app. Next sign-in uses an email code.`
  - Show it **only if the user has the app active**.
  - The visibility rules are those of the other actions: nobody acts on themselves, and an admin doesn't act on a sysadmin.
- **Confirm (15ao)**: the same modal as Disable.
  - Key icon. Title `Reset two-step verification for {name}?`
  - Body: `{name} will sign in with an email code next time. Their authenticator app and recovery codes will be removed. Use this only if they lost access to both.`
  - Boxes **REMOVED** (Authenticator app · Unused recovery codes · Trusted devices) and **STAYS AS IT IS** (Password · Role and access).
  - Navy button **Reset two-step verification**.
- **After the reset**: the row spinner `Updating…`, then the green banner `Two-step verification reset for {name}. They'll get an email code at the next sign-in. We sent them a security notice.`

## 11. Sessions, Trusted devices, Notifications, Privacy & data

- **Sessions (15h) ⚠ only if available** (it needs server-side session tracking)
  - Rows: device icon, `{browser} on {OS}`, the `THIS DEVICE` chip on the current one, `{city, country} · {Active now | n hours ago}`.
  - Outline **Sign out** on the other sessions, with a row spinner `Signing out…`.
  - Footer: `Locations are approximate, based on the IP address.` and navy **Sign out of all other sessions**.
- **Trusted devices (15i)**: required, because the login has "Trust this device".
  - Rows: device, `Trusted on {date} · expires {date}` (amber when it expires within 10 days), outline **Remove**.
  - Footer: `Changing your password or verification method removes all trusted devices.` and **Remove all** (only with 2 or more devices).
  - Empty state: `No trusted devices` / `Check "Trust this device for 30 days" when you sign in to skip the code on that device.`
- **Notifications (15j) ⚠ only if available**
  - Title **Email notifications**, sub `Choose what PDash sends to your inbox. Notifications in the bell are always on.`
  - **Security alerts** is locked to `Always on`.
  - The other rows are toggles that save immediately, with `Saved` in green in the header. **The rows in the board are a proposal: use the notification types PDash actually sends**, and leave the section out if there are none besides security.
- **Privacy & data (15k, 15l)**
  1. **Your data in PDash**: a key/value list (Profile · Sign-in activity · Your work · Agreements). Agreements shows `Terms & Conditions accepted on {date} · View` (⚠ the date only if available) and the **Privacy notice** link (→ `/privacy-notice.html`, the same as the account menu).
  2. **Download my data ⚠ only if available** (it needs an async job and an expiring link). Outline **Request export**, then `Preparing…` with a spinner, then a navy **Download ZIP · {size}** and `The link works until {date}.`
  3. **Questions about your data?**: `To access, correct or delete your personal data, or to close your account, contact {PRIVACY_CONTACT_NAME} at {PRIVACY_CONTACT_EMAIL}.`, with an outline **Write an email** button (`mailto:`).
     - **Configuration**: two new environment variables, `PRIVACY_CONTACT_EMAIL` and `PRIVACY_CONTACT_NAME` (the alias shown). Add them to the env example and expose them to the client through the existing config endpoint.
     - **If `PRIVACY_CONTACT_EMAIL` is empty, hide the card.**

## 12. Responsive (15ap, 15ag–15al)

- **Tablet 1024×768 (icon sidebar)**: the sub-navigation becomes a **horizontal row of chips** under the header (as Master Data / Attribute Lists on tablet), with the selected chip marked by a magenta bottom bar. The method rows keep the action on the right. Targets are 40–44 px.
- **Smartphone 390×844 (top navbar)**
  - Header `My profile`.
  - A **section picker** (48 px field `SECURITY · Two-step verification ▾`) opens a bottom sheet with the four groups.
  - Each method is a stacked card, with the primary button full width.
  - The wizard is **full screen**, with a 3-segment progress bar and the footer pinned to the bottom.
  - On the phone you can't scan your own screen, so **step 1 shows the `otpauth://` link first** (**Open in authenticator app**), then the manual key with **Copy key**, and the note `Setting up from a computer? The QR code is shown there instead.`
  - No **Print** on mobile.
  - The confirm and re-authentication modals become a **bottom sheet**.
  - Every target is ≥ 44 px.

## 13. Accessibility

- Sub-navigation: `nav aria-label="My profile sections"`, with `aria-current="page"` on the selected entry.
- OTP input: `role="group"` with a label, `aria-label` on each box, and errors in `role="alert"`. The cooldown uses `aria-live="polite"`. Never clear the boxes without a message.
- Drawers and modals:
  - trap the focus, and return it on close;
  - in the wizard, focus the first box at step 2;
  - Esc closes the topmost layer, except wizard step 3 and the new-codes drawer.
- Toggles: `role="switch"` with `aria-checked`. Checkboxes: `role="checkbox"` or a native input.
- Banners: `role="status"` for success, `role="alert"` for errors.

## 14. Acceptance

- `profile.html` exists, with a sub-navigation and hash per section. The two old modals are gone. The account menu points to the page, and the account button is active on it.
- Email is read-only on the profile.
- Login has a second step in the `auth-card` with the step indicator, six boxes, paste and auto-submit, resend cooldown, all the states of §9, and the escape hatches below the hairline (the email fallback follows the policy).
- The two-step section lists the methods as rows. Set up is the only magenta primary. Switch back is amber and requires re-authentication. Regenerate requires re-authentication.
- The wizard has 3 steps, the recovery codes require the checkbox, and step 3 can't be dismissed.
- User Admin has the App/Email badge, the Security group with Reset (only if the app is active) and the confirm.
- The privacy contact is read from `PRIVACY_CONTACT_EMAIL` / `PRIVACY_CONTACT_NAME`, and hidden when they're not set.
- Tablet and smartphone follow §12.
- No hex literals. New tokens are justified in the PR. Everything marked ⚠ that was left out is listed in the PR.
