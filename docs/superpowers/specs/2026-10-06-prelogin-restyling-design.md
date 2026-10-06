# Pre-login pages restyling — design

Date: 2026-10-06. Type: evolution (Scenario 2), UI redesign page cycle. Source: Brief `docs/superpowers/design/2026-10-06-prelogin-brief.md` (with the reference boards `docs/superpowers/design/PreLogin/2.1-signin.png`, `2.2-forgot.png`, `2.3-reset.png`), verified against the code in `/brainstorming`.

## Goal

Visual restyling of the three public authentication pages — `login.html` (Sign In + Forgot password views), `reset-password.html`, `activate.html` — to match the reference boards, and remove the `<style>` block that is today copied into all three pages by moving it into one shared stylesheet, `css/auth.css`.

Routes, API calls, Vue states, flows, copy and file organisation do not change, with one small logic addition (Forgot pre-fills the email, §4.2). Bootstrap 5.3 and Vue 3 stay loaded from the CDN. No new design token: every colour maps to an existing token in `css/tokens.css`, which is not modified.

## Current behaviour (verified in code)

- Each page loads Bootstrap 5.3.2 CSS (CDN, no Bootstrap JS), `css/tokens.css?v=9`, then an inline `<style>` (`login.html:9-38`, `activate.html:9-37`, `reset-password.html:9-36`). They do not load `css/style.css`.
- The three `<style>` blocks are identical except `.auth-card { max-width }` (400px login, 420px activate/reset) and page-only rules: `.divider` (login, `#f3f4f6`), `.strength-bar` (activate/reset), `.user-chip` (activate, `#f3f4f6` background). Literals `#9ca3af` (`.brand-sub`) and `#374151` (`.form-label`) are hard-coded.
- Logo: `<div class="brand-name"><span class="p">P</span>Dash</div>` + `<div class="brand-sub">Project Dashboard</div>` in all three pages.
- `login.html`: `view` is `'login'` or `'forgot'` (`switchToForgot()` / `switchToLogin()`, `login.html:116-117`); Forgot confirmation = `alert-success` with the email input and button disabled (`login.html:84-95`).
- `reset-password.html` / `activate.html`: `state` is `loading` / `invalid` / `form` / `success`. Loading uses `spinner-border text-secondary`; invalid/success use emoji (⚠️ ✅, plus ✉️ in activate's `.user-chip`) via inline `style="font-size:…"`; their links are `btn btn-primary btn-sm` (reset invalid + success, activate success) and `btn btn-outline-secondary btn-sm` (activate invalid).
- Strength meter: four `.strength-bar` divs with `:style="{ background: i <= strength ? strengthColor : '#e5e7eb' }"`; `strengthColor` returns one hex per level (`#ef4444`, `#f97316`, `#eab308`, `#22c55e`), so every active segment has the same colour. `checkStrength()` scores 0-4 (length ≥ 8, length ≥ 12, mixed case, digit/symbol); `canSubmit` = length ≥ 8 and match. The backend only enforces length ≥ 8 (`api/src/routes/auth.js:173,231,254`).
- Mismatch: confirm input gets `is-invalid`, `.invalid-feedback` says "Passwords do not match.".
- All three files start with a UTF-8 BOM (`ef bb bf`), `terms.html` does not.
- Guard tests: `js/lib/foundations-guard.test.js:100-118` requires each page to contain `var(--brand-magenta-hover)` and `var(--focus-ring)` and every `var()` it uses to exist in `tokens.css`; `:144-149` forbids `#fff`/`#e5e7eb`/`#6b7280` inside each page's `<style>`. `js/lib/nav-layout-guard.test.js:93-97` forbids a `<footer>` (already satisfied).
- All tokens the Brief maps to exist: `--brand-navy`, `--brand-magenta(-hover/-active)`, `--brand-gold`, `--border-light` (#e5e7eb), `--border-dark` (#9ca3af), `--text-muted`, `--surface-white`, `--surface-subtle`, `--text-inverse`, `--color-danger(-bg/-text)`, `--color-success(-bg/-text)`, `--focus-ring`, `--font-family-base`, `--radius-md` (8px).

## Design

### 1. File organisation

- New **`css/auth.css?v=1`**, the shared stylesheet of the public authentication pages, same precedent as `css/admin-crud.css`. Loaded by `login.html`, `reset-password.html`, `activate.html` right after `css/tokens.css?v=9` (so after Bootstrap: its rules win on equal specificity).
- The three inline `<style>` blocks are deleted, and so are all static `style="…"` attributes in the three pages. The only dynamic styling (strength meter) moves to classes (§3).
- Card width: `.auth-card` has `max-width: 400px`; modifier `.auth-card--wide` sets 420px, used by reset and activate.
- Not touched: `terms.html`, `css/style.css`, `css/tokens.css`, `js/nav.js`, any API file.
- Edits are made with the Edit tool only (no PowerShell `Get-Content`/`Set-Content`), so the existing BOM is neither duplicated nor added elsewhere. Removing the existing BOM is out of scope.

### 2. `css/auth.css` content

All colours are `var(--token)`. Sizes are px literals taken from the Brief (the token rule covers colours; the type scale tokens are rem steps that do not match the boards). The only non-token colour values are the two `rgba()` literals the Brief specifies (card shadow/border, copyright).

- **`body`**: `background: var(--brand-navy)`, `min-height: 100vh`, flex centring both axes, `font-family: var(--font-family-base)`, `margin: 0`.
- **`.auth-stack`** (new wrapper, inside `#app`, which keeps `v-cloak`): column flex, `align-items: center`, `gap: 22px`, `width: 100%`.
- **`.auth-card`**: `background: var(--surface-white)`, `border-radius: 16px` (literal: fidelity to the board; no 16px radius token exists and every other measure in the file is a literal too), `padding: 40px 38px`, `width: 100%`, `max-width: 400px`, `box-shadow: 0 20px 50px rgba(0,0,0,.30)`, `border: 1px solid rgba(255,255,255,.08)`. `.auth-card--wide { max-width: 420px; }`.
- **Logo** — identical markup in the three pages:
  ```html
  <div class="auth-logo">
    <div class="auth-logo-row">
      <span class="auth-logo-mark" aria-hidden="true">P</span>
      <span class="auth-logo-name">Dash</span>
    </div>
    <div class="auth-logo-sub">Project Dashboard</div>
  </div>
  ```
  Accessibility: the "P" mark is `aria-hidden`; screen readers read "Dash, Project Dashboard" — accepted, no extra ARIA (the page `<title>` already names PDash). `.auth-logo`: centred, `margin-bottom: 30px`; `.auth-logo--compact { margin-bottom: 26px; }` is always applied in reset/activate and, in login, via `:class="{ 'auth-logo--compact': view === 'forgot' }"` (the logo block markup itself, i.e. its inner HTML, stays byte-identical across the three pages). `.auth-logo-row`: inline-flex, centred. `.auth-logo-mark`: 34×34, `border-radius: 9px`, `background: var(--brand-navy)`, `border-bottom: 3px solid var(--brand-magenta)`, `color: var(--brand-magenta)`, 17px/800, centred, `box-sizing: border-box`. `.auth-logo-name`: 24px/800, `color: var(--brand-navy)`, `margin-left: 8px`. `.auth-logo-sub`: 10.5px/700, uppercase, `letter-spacing: .08em`, `color: var(--border-dark)`, `margin-top: 6px`.
- **`.form-label`**: 11px/700, uppercase, `letter-spacing: .04em`, `color: var(--text-muted)`, `margin-bottom: 0`.
- **`.form-control`**: `margin-top: 6px`, `border: 1px solid var(--border-light)`, `border-radius: var(--radius-md)`, `padding: 10px 13px`, `font-size: 13.5px`, `color: var(--brand-navy)`; `::placeholder { color: var(--border-dark); opacity: 1; }`; `:focus { border-color: var(--brand-magenta); box-shadow: 0 0 0 3px var(--focus-ring); }`.
- **Invalid field**: `.form-control.is-invalid { border-color: var(--color-danger); background-image: none; padding-right: 13px; }` (the board shows no Bootstrap error icon), focus keeps the danger border; `.invalid-feedback { color: var(--color-danger); font-size: 11.5px; }`.
- **`.btn-primary`**: `background: var(--brand-magenta)`, `border: none`, `color: var(--text-inverse)`, 13.5px/700, `padding: 12px 14px`, `border-radius: var(--radius-md)`; `:hover:not(:disabled)` → `var(--brand-magenta-hover)`; `:active` → `var(--brand-magenta-active)`; `:disabled { opacity: .65; color: var(--text-inverse); }`. Bootstrap's default button focus ring stays (rule from the foundations cycle: buttons keep Bootstrap's ring).
- **`.link-muted`**: 12px/600, `color: var(--text-muted)`, no underline, `cursor: pointer`; `:hover, :focus-visible` → `var(--brand-magenta)`.
- **View title / subtitle**: `.auth-title` 15px/800, `color: var(--brand-navy)`, `margin: 0 0 4px`; `.auth-subtitle` 12.5px, `color: var(--text-muted)`, `line-height: 1.5`, `margin: 0 0 20px`. They replace the current `h6.fw-bold` + `p.text-muted.small` pairs (the `h6` element stays, only its classes change).
- **Alerts**: the `--bs-alert-*` rules of `css/style.css:363-364` (`.alert-success`, `.alert-danger`) are replicated, plus `font-size: 12px` and `padding: 8px 12px` (replacing the `py-2 px-3 small` utilities).
- **Spinner**: `.spinner-border { color: var(--brand-magenta); }` and `.btn .spinner-border { color: inherit; }` (same as `style.css:359-360`). The `text-secondary` class is removed from the two loading spinners (Bootstrap's `!important` would otherwise win).
- **State icon** (`.auth-state-icon`): 30×30 inline SVG, `stroke="currentColor"`, `fill="none"`, `aria-hidden="true"`; modifiers `.auth-state-icon--danger { color: var(--color-danger); }` and `--success { color: var(--color-success); }`. Shapes: warning triangle with exclamation (invalid), circle with check (success).
- **`.user-chip`** (activate): `background: var(--surface-subtle)`, `border-radius: var(--radius-md)`, `padding: 10px 14px`, 13px, `color: var(--brand-navy)`; the ✉️ emoji becomes a 16px envelope SVG in `var(--text-muted)`.
- **Copyright** (`.auth-copyright`): 11px, `color: rgba(255,255,255,.45)`, text `© {{ year }} PDash`. Each page's `data()` gains `year: new Date().getFullYear()`. It is placed in `.auth-stack` after the card, so it is inside `#app` and hidden by `v-cloak` until mount.
- **Responsive** (`@media (max-width: 480px)`): `.auth-card { width: calc(100% - 32px); padding: 28px 22px; }`, `.form-control { font-size: 16px; }` (avoids iOS zoom). Nothing changes at 1024px.

### 3. Strength meter (reset and activate) — colour per position

Choice A (approved in `/brainstorming`): each segment has a fixed colour by position, matching board 2.3 ("Fair" = one red + one amber segment).

- Markup:
  ```html
  <div class="strength-meter" :class="strengthClass">
    <span v-for="i in 4" :key="i" class="strength-seg"></span>
  </div>
  <div class="strength-label">{{ strengthLabel }}</div>
  ```
- CSS: `.strength-meter { display: flex; gap: 4px; margin-top: 9px; }`, `.strength-seg { flex: 1; height: 4px; border-radius: 2px; background: var(--border-light); transition: background .2s; }`. Active segments: `.strength-1 .strength-seg:nth-child(-n+1)`, `.strength-2 …(-n+2)`, `.strength-3 …(-n+3)`, `.strength-4 …(-n+4)` are coloured by position — `:nth-child(1)` `var(--color-danger)`, `:nth-child(2)` `var(--brand-gold)`, `:nth-child(3)` and `:nth-child(4)` `var(--color-success)`. `.strength-label { font-size: 11px; color: var(--text-muted); margin-top: 5px; min-height: 1em; }`.
- JS: computed `strengthColor` is replaced by `strengthClass() { return 'strength-' + this.strength; }`. `checkStrength()`, `strengthLabel`, `canSubmit` are unchanged. The `:style` binding with `#e5e7eb` disappears.

### 4. Pages and states

Spacing between fields is set by wrapper classes instead of Bootstrap margin utilities where the Brief gives a value: `.auth-field { margin-bottom: 16px; }` plus the modifiers `.auth-field--18`, `--22`, `--24` (`margin-bottom` 18/22/24px). Use: Sign In email 16, password 24; Forgot email 22; reset/activate new-password block 18, confirm 22. Other Bootstrap utilities used for layout (`d-flex`, `justify-content-between`, `align-items-center`, `w-100`, `text-center`) may stay.

#### 4.1 Sign In (`login.html`, `view === 'login'`)

Structure and copy unchanged: logo → (error alert) → Email (16px below) → row "Password" label + "Forgot password?" link (space-between) → password input (24px below) → **Sign in** button with spinner while `loading`.

#### 4.2 Forgot password (`login.html`, `view === 'forgot'`)

Structure and copy unchanged: logo (compact margin) → "← Back to sign in" link (`margin-bottom: 14px`) → title "Reset your password" → subtitle → (error / success alert) → Email (22px below) → **Send reset link**. Confirmation stays the success alert with input and button disabled.

Logic addition: `switchToForgot()` gains `this.forgotEmail ||= this.email;` (pre-fills the email typed in Sign In, never overwrites one already typed in Forgot).

#### 4.3 Reset password (`reset-password.html`, `.auth-card--wide`)

- `loading`: magenta spinner + "Validating link…" (`.auth-subtitle`, centred).
- `invalid`: danger warning icon → title "Link expired or invalid" → subtitle (current text) → **Request a new link** as `btn btn-primary w-100` (still `href="/login.html"`).
- `form`: title "Set new password" → subtitle → (error alert) → New password + strength meter (18px below the block) → Confirm new password (22px below, mismatch = invalid border + "Passwords do not match.") → **Reset password**, disabled until `canSubmit`.
- `success`: success check icon → title "Password updated!" → subtitle (current text) → **Go to sign in** as `btn btn-primary w-100`. The existing timed redirect is unchanged.

#### 4.4 Activate account (`activate.html`, `.auth-card--wide`)

Same treatment as 4.3 for the four states (loading "Validating invitation…", invalid, form, success), with the user chip (envelope SVG) kept in `form`. The invalid state's `btn btn-outline-secondary btn-sm` "Go to sign in" becomes `btn btn-primary w-100`: it is the only action of that view, so there is still one magenta button per view.

Copy everywhere is the current English copy; no text changes except the removal of emoji.

### 5. Tests

- `js/lib/foundations-guard.test.js`:
  - The "uses the hover and focus tokens" checks move from each page to `css/auth.css` (`var(--brand-magenta-hover)`, `var(--focus-ring)`, no `#d01f6a` / `rgba(240, 40, 122`).
  - "Every `var()` used by the public pages is defined" also scans `css/auth.css`.
  - The "exact-match literals in `<style>`" test for the three pages becomes: no `<style>` block in the page, and `css/auth.css` contains no hex literal at all (`#[0-9a-f]{3,8}\b`).
  - `css/auth.css` joins the cache-busting `MIN` map at `1`.
- New guard file `js/lib/auth-pages-guard.test.js`:
  - each of the three pages links `css/auth.css?v=` after `css/tokens.css`;
  - no static `style="` attribute and no `:style` binding;
  - no emoji (Unicode `Extended_Pictographic`, excluding `©` and `←`, which are typographic);
  - the inner HTML of the `.auth-logo` block is byte-identical in the three pages;
  - `activate.html`/`reset-password.html` use `strengthClass` and contain no `strengthColor`;
  - `login.html`'s `switchToForgot` contains `forgotEmail ||= this.email`.
- `js/lib/nav-layout-guard.test.js` (no `<footer>`): unchanged, must still pass.
- Run the frontend suite via the Docker `node:22` fallback (host Node 20.11).

### 6. Verification (manual / visual)

On an isolated branch stack (`scripts/test-branch.sh up`, never the main stack), at 1440, 1024 and 390px: Sign In (empty, error, loading), Forgot (empty, pre-filled, error, confirmation), Reset and Activate (loading, invalid, form with each strength level 0-4, mismatch, success). Screenshots via headless Chrome/Edge if available; otherwise the visual check is done by the user at Gate 2.

### 7. Documentation

- `CLAUDE.md` "File structure": add the `css/auth.css` line next to `css/admin-crud.css`; mention its `?v=` in the cache-busting notes where `admin-crud.css` is listed.
- No `docs/pages/` file exists for these pages; none is created.

## Acceptance criteria

1. `css/auth.css?v=1` exists and is loaded by the three pages; none of them has a `<style>` block or a static `style=` attribute.
2. No hex literal in `css/auth.css` or in the three pages' markup/JS; `tokens.css` unchanged.
3. No emoji in the three pages.
4. Logo markup identical in the three pages and matching board 2.1-2.3.
5. Strength meter coloured by position (red, amber, green, green), empty segments `--border-light`.
6. Forgot pre-fills the Sign In email.
7. All states listed in §6 render correctly at 1440, 1024, 390px; one magenta button per view.
8. `npm test` green (updated `foundations-guard`, new `auth-pages-guard`, unchanged `nav-layout-guard`).
9. `CLAUDE.md` updated.

## Out of scope

- Any logic, endpoint, API error message or copy change (beyond §4.2).
- Removing Bootstrap from these pages.
- `terms.html`, `css/style.css`, `css/tokens.css`, `js/nav.js`.
- Pointing "Request a new link" at the Forgot view (`login.html?view=forgot`) — it keeps going to `/login.html`.
- `<label for>`/`aria-describedby` accessibility wiring and backend password policy changes.
- Removing the existing UTF-8 BOM from the three files.
