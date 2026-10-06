# Pre-login pages restyling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The terminal step of this project is `/finish-cycle`, never `superpowers:finishing-a-development-branch`.

**Goal:** Restyle `login.html`, `reset-password.html` and `activate.html` to the reference boards, moving their duplicated inline `<style>` into one shared `css/auth.css?v=1`.

**Architecture:** One new stylesheet loaded after Bootstrap 5.3.2 (CDN) and `css/tokens.css?v=9`, overriding the few Bootstrap classes these pages use and adding auth-only components (logo, stack, strength meter, state icons, copyright). Each page migrates in its own task: markup classes change, Vue logic is untouched except `strengthClass` (reset/activate) and the Forgot email pre-fill (login). Static guard tests (vitest, read the files as text) pin every rule.

**Tech Stack:** Static HTML + Vue 3 (CDN, runtime-compiled), Bootstrap 5.3.2 CSS (CDN), vitest 4 + jsdom (dev only).

**Spec:** `docs/superpowers/specs/2026-10-06-prelogin-restyling-design.md` (Brief: `docs/superpowers/design/2026-10-06-prelogin-brief.md`, boards: `docs/superpowers/design/PreLogin/*.png`). Read the spec's §2 for every CSS value — this plan does not repeat them.

## Global Constraints

- No build step; Bootstrap 5.3.2 CSS and Vue 3 stay loaded from the CDN exactly as today.
- No hex literal in `css/auth.css` or in the three pages (markup and inline JS); colours only via `var(--token)` already defined in `css/tokens.css`. The only non-token colours are `rgba(0,0,0,.30)`, `rgba(255,255,255,.08)` (card) and `rgba(255,255,255,.45)` (copyright).
- `css/tokens.css`, `css/style.css`, `js/nav.js`, `terms.html`, every `api/` file: not modified.
- `css/auth.css` is referenced as `css/auth.css?v=1` everywhere; link order in `<head>`: Bootstrap → `css/tokens.css?v=9` → `css/auth.css?v=1`.
- `v-cloak` stays on `#app` in every page.
- All copy unchanged and in English (only emoji are removed).
- Edit the HTML files with the Edit tool only — never PowerShell `Get-Content`/`Set-Content` (adds a BOM). The three files already start with a BOM: keep it, do not add another.
- Frontend tests run in Docker (host Node 20.11 is too old for vitest 4), from the worktree root:
  `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -v /app/node_modules -w /app node:22 sh -c 'npm ci --no-audit --no-fund >/dev/null 2>&1 && npm test'`
  (to run one file append ` -- js/lib/auth-pages-guard.test.js` inside the `npm test` part: `npm test -- js/lib/auth-pages-guard.test.js`). Baseline before the cycle: 602 frontend tests green.
- Never run `docker compose` against the main stack; visual checks use `scripts/test-branch.sh` only (copy `.env` from the main checkout into the worktree first, never commit it).

## Review Focus

1. **Bootstrap specificity on invalid + focus:** Bootstrap's `.form-control.is-invalid:focus` sets a danger `box-shadow` with an `rgba` literal and a background icon; a typed mismatch then focusing the confirm field must show the danger border with no Bootstrap icon. Pinned in Task 1 (`auth.css` has a `.form-control.is-invalid:focus` rule and `background-image: none`).
2. **Short / landscape viewports:** a card taller than the viewport (390×600, keyboard open) must stay fully scrollable, never clipped at the top by flex centring. Pinned in Task 1 (`body` uses `min-height: 100vh`, never `height: 100vh`, and has vertical padding).
3. **Strength label at level 0:** emptying the password must not make the confirm field jump up. Pinned in Task 1 (`.strength-label` has `min-height`).
4. **Spinner colour overridden by utilities:** a leftover `text-secondary` (Bootstrap `!important`) keeps the loading spinner grey. Pinned in Tasks 3–4 (no `text-secondary` in the page).
5. **Forgot pre-fill must not overwrite:** going Sign In → Forgot → back → edit email → Forgot again must keep the email typed in Forgot. Pinned in Task 2 (`||=`, not `=`).

---

### Task 1: `css/auth.css` and its guard tests

**Files:**
- Create: `css/auth.css`
- Create: `js/lib/auth-pages-guard.test.js`
- Modify: `js/lib/foundations-guard.test.js:108-118` (the "every var() used by the public pages is defined" test also scans `css/auth.css`)

**Interfaces:**
- Produces (class names used by Tasks 2–4, values in spec §2–§4): `.auth-stack`, `.auth-card`, `.auth-card--wide`, `.auth-logo`, `.auth-logo--compact`, `.auth-logo-row`, `.auth-logo-mark`, `.auth-logo-name`, `.auth-logo-sub`, `.auth-title`, `.auth-subtitle`, `.auth-field`, `.auth-field--18`, `.auth-field--22`, `.auth-field--24`, `.auth-back` (the "← Back to sign in" link wrapper margin 14px, used with `.link-muted`), `.auth-state` (centred container of loading/invalid/success states), `.auth-state-icon`, `.auth-state-icon--danger`, `.auth-state-icon--success`, `.user-chip`, `.strength-meter`, `.strength-0`…`.strength-4`, `.strength-seg`, `.strength-label`, `.auth-copyright`; overrides of `.form-label`, `.form-control`, `.form-control.is-invalid`, `.invalid-feedback`, `.btn-primary`, `.link-muted`, `.alert-success`, `.alert-danger`, `.spinner-border`.
- Produces (test file): `js/lib/auth-pages-guard.test.js` exports nothing; it defines `const AUTH_PAGES = []` (empty in this task — Tasks 2–4 append their page) and a `describe('css/auth.css', …)` block.

- [ ] **Step 1: Write the failing tests** in `js/lib/auth-pages-guard.test.js` (same `read` helper style as `nav-layout-guard.test.js`), `describe('css/auth.css')`:
  - `it('has no hex literal')`: `expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)`.
  - `it('uses the hover, active and focus tokens')`: contains `var(--brand-magenta-hover)`, `var(--brand-magenta-active)`, `box-shadow: 0 0 0 3px var(--focus-ring)`; not `#d01f6a`, not `rgba(240, 40, 122`.
  - `it('styles the page and the card as the boards')`: `body` block matches `background:\s*var\(--brand-navy\)`, `min-height:\s*100vh`, `font-family:\s*var\(--font-family-base\)`, and the file does not match `/height:\s*100vh/` outside `min-height` (regex `/[^-]height:\s*100vh/`); `.auth-card` block contains `border-radius: 16px`, `padding: 40px 38px`, `max-width: 400px`, `box-shadow: 0 20px 50px rgba(0,0,0,.30)`; `.auth-card--wide` contains `max-width: 420px`; `.auth-stack` contains `gap: 22px`.
  - `it('colours the strength segments by position')`: for n in 1..4 the selector `.strength-${n} .strength-seg:nth-child(-n+${n})` appears; `nth-child(1)` rule uses `var(--color-danger)`, `nth-child(2)` `var(--brand-gold)`, `nth-child(3)` and `nth-child(4)` `var(--color-success)`; `.strength-seg` default background `var(--border-light)`; `.strength-label` block contains `min-height`.
  - `it('neutralises Bootstrap invalid styling')`: contains `.form-control.is-invalid:focus` and, in the `.form-control.is-invalid` block, `border-color: var(--color-danger)` and `background-image: none`.
  - `it('replicates the alert and spinner overrides of style.css')`: contains `--bs-alert-bg: var(--color-success-bg)`, `--bs-alert-bg: var(--color-danger-bg)`, `.spinner-border` with `var(--brand-magenta)` and `.btn .spinner-border` with `color: inherit`.
  - `it('has the 480px phone rules')`: contains `@media (max-width: 480px)`, `width: calc(100% - 32px)`, `padding: 28px 22px`, and a `.form-control` rule with `font-size: 16px` inside that media block.
  - `it('defines every class the pages use')`: each class in the Interfaces list above appears as `.<name>` in the file.

  (Extract a rule block with a small helper `block(sel) = css.slice(css.indexOf(sel + ' {'), css.indexOf('}', css.indexOf(sel + ' {')))`.)

- [ ] **Step 2: Run to verify it fails**
  Run: Docker command with `npm test -- js/lib/auth-pages-guard.test.js`
  Expected: FAIL — `ENOENT ... css/auth.css`.

- [ ] **Step 3: Write `css/auth.css`** with every value from spec §2, §3 and §4 (spacing modifiers), plus: `body { padding: 24px 0; box-sizing: border-box; }` (Review Focus 2), `.auth-back { display: inline-flex; align-items: center; gap: 4px; margin-bottom: 14px; }`, `.auth-state { text-align: center; padding: 8px 0; }` with `.auth-state .auth-title { margin-top: 10px; }`, `.form-control.is-invalid:focus { border-color: var(--color-danger); box-shadow: none; }`, `.strength-0` needs no rule beyond the defaults. Header comment: "Shared stylesheet of the public auth pages (login, activate, reset-password). Loaded after Bootstrap 5.3.2 and tokens.css; colours only via tokens." Section comments match the style of `css/admin-crud.css`.

- [ ] **Step 4: Extend `foundations-guard.test.js`** "every var() used by the public pages is defined" loop to `['login.html', 'activate.html', 'reset-password.html', 'terms.html', 'css/auth.css']`.

- [ ] **Step 5: Run the full suite**
  Run: Docker command (`npm test`)
  Expected: PASS, 602 + the new `css/auth.css` tests.

- [ ] **Step 6: Commit**
  ```bash
  git add css/auth.css js/lib/auth-pages-guard.test.js js/lib/foundations-guard.test.js
  git commit -m "feat(auth): shared css/auth.css for the public auth pages"
  ```

### Task 2: Migrate `login.html` (Sign In + Forgot)

**Files:**
- Modify: `login.html` (head `:7-38`, template `:41-98`, script `:104-117`)
- Modify: `js/lib/auth-pages-guard.test.js` (append `'login.html'` to `AUTH_PAGES`, add page tests)
- Modify: `js/lib/foundations-guard.test.js` (remove `login.html` from the per-page loops at `:100` and `:144`; add `'css/auth.css': 1` to the cache-busting `MIN` map at `:121`)

**Interfaces:**
- Consumes: Task 1 class names.
- Produces: in `auth-pages-guard.test.js`, a `for (const f of AUTH_PAGES)` block of page-level rules that Tasks 3–4 reuse by appending to `AUTH_PAGES`. Logo: only presence is checked here; Task 4 adds the cross-page identity test.

- [ ] **Step 1: Write the failing tests** — append `'login.html'` to `AUTH_PAGES` and add, per page in `AUTH_PAGES`:
  - links: the index of `css/tokens.css?v=9` < index of `css/auth.css?v=1`, and the Bootstrap link is still present (`bootstrap@5.3.2/dist/css/bootstrap.min.css`);
  - `not.toMatch(/<style[\s>]/)`, `not.toMatch(/\sstyle="/)`, `not.toMatch(/:style=/)`;
  - no hex: `not.toMatch(/#[0-9a-fA-F]{3,8}\b/)`;
  - no emoji: `t.replace(/©/g, '')` does `not.toMatch(/\p{Extended_Pictographic}/u)`;
  - no `text-secondary`, `btn-sm`, `btn-outline-secondary`, `brand-name`, `brand-sub`;
  - contains `class="auth-stack"`, `class="auth-logo-mark" aria-hidden="true">P</span>`, `<div class="auth-logo-sub">Project Dashboard</div>`, `class="auth-copyright"`, `year: new Date().getFullYear()`;
  - `<div id="app" v-cloak>` still present.
  And a login-only `it('pre-fills the Forgot email without overwriting it')`: the `switchToForgot()` line contains `this.forgotEmail ||= this.email`; `it('compacts the logo in the Forgot view')`: contains `'auth-logo--compact': view === 'forgot'`.

- [ ] **Step 2: Run to verify it fails**
  Run: Docker command with `npm test -- js/lib/auth-pages-guard.test.js`
  Expected: FAIL on the login.html tests (`<style>` found, `brand-name` found, …).

- [ ] **Step 3: Migrate `login.html`** per spec §4.1–4.2: delete the `<style>` block, add the `auth.css` link, wrap the card in `.auth-stack` with the copyright after it, replace the logo with the spec §2 markup (outer `div` gets `class="auth-logo"` + the `:class` compact binding), `h6`/`p` → `.auth-title`/`.auth-subtitle`, field wrappers `.auth-field` (email) / `.auth-field auth-field--24` (password) / `.auth-field auth-field--22` (Forgot email), back link `class="link-muted auth-back"`, alerts drop `py-2 px-3 small` (keep `alert alert-danger|success mb-3`), drop the unused `.divider`. Script: add `year: new Date().getFullYear()` to `data()`, and `this.forgotEmail ||= this.email;` in `switchToForgot()`.

- [ ] **Step 4: Update `foundations-guard.test.js`**: remove `'login.html'` from the two per-page loops (`:100`, `:144`); add `'css/auth.css': 1` to `MIN`.

- [ ] **Step 5: Run the full suite**
  Run: Docker command (`npm test`)
  Expected: PASS (including `nav-layout-guard` "no `<footer>`" for login.html and the cache-busting test for `css/auth.css`).

- [ ] **Step 6: Commit**
  ```bash
  git add login.html js/lib/auth-pages-guard.test.js js/lib/foundations-guard.test.js
  git commit -m "feat(auth): restyle login.html (Sign In, Forgot) on css/auth.css"
  ```

### Task 3: Migrate `reset-password.html`

**Files:**
- Modify: `reset-password.html` (head `:7-36`, template `:39-108`, script computed `:124-133`, `data()`)
- Modify: `js/lib/auth-pages-guard.test.js` (append `'reset-password.html'` to `AUTH_PAGES`; add strength tests)
- Modify: `js/lib/foundations-guard.test.js` (remove `reset-password.html` from the per-page loops)

**Interfaces:**
- Consumes: Task 1 classes; Task 2's page-level test block.
- Produces: a `STRENGTH_PAGES = ['reset-password.html']` list in the guard file (Task 4 appends `activate.html`).

- [ ] **Step 1: Write the failing tests** — append to `AUTH_PAGES`, and per page in `STRENGTH_PAGES`:
  - contains `strengthClass() { return 'strength-' + this.strength; }` and `:class="strengthClass"`, not `strengthColor`;
  - contains `class="strength-meter"`, `<span v-for="i in 4" :key="i" class="strength-seg"></span>`, `class="strength-label"`;
  - contains `class="auth-card auth-card--wide"` and `class="auth-logo auth-logo--compact"`;
  - contains `auth-state-icon auth-state-icon--danger` and `auth-state-icon auth-state-icon--success`, each on an `<svg` with `stroke="currentColor"` and `aria-hidden="true"`;
  - the `checkStrength()` body is unchanged: contains `if (p.length >= 12) score++;` and `/[0-9!@#$%^&*]/` (note: this regex contains `#$%`, not a hex — the page-level "no hex" regex `#[0-9a-fA-F]{3,8}\b` does not match it; verify).

- [ ] **Step 2: Run to verify it fails**
  Run: Docker command with `npm test -- js/lib/auth-pages-guard.test.js`
  Expected: FAIL on reset-password.html (`<style>`, `strengthColor`, emoji, `#e5e7eb`).

- [ ] **Step 3: Migrate `reset-password.html`** per spec §4.3 and §3: as Task 2 for head/stack/logo/titles/alerts/copyright/`year`; card `auth-card auth-card--wide`; logo `auth-logo auth-logo--compact` (static); loading/invalid/success wrappers `class="auth-state"`; spinner without `text-secondary`; "Validating link…" `.auth-subtitle`; emoji → 30×30 SVGs (warning triangle + exclamation, circle + check; `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`); links → `btn btn-primary w-100` (keep `href="/login.html"`, add `mt-2`); new-password wrapper `.auth-field auth-field--18`, confirm `.auth-field auth-field--22`; strength markup from spec §3; computed `strengthColor` → `strengthClass`.

- [ ] **Step 4: Update `foundations-guard.test.js`**: remove `'reset-password.html'` from both per-page loops.

- [ ] **Step 5: Run the full suite** — Expected: PASS.

- [ ] **Step 6: Commit**
  ```bash
  git add reset-password.html js/lib/auth-pages-guard.test.js js/lib/foundations-guard.test.js
  git commit -m "feat(auth): restyle reset-password.html, strength meter coloured by position"
  ```

### Task 4: Migrate `activate.html`, cross-page logo identity, docs

**Files:**
- Modify: `activate.html` (head `:7-37`, template `:40-115`, script)
- Modify: `js/lib/auth-pages-guard.test.js` (append to `AUTH_PAGES` and `STRENGTH_PAGES`; add the logo-identity and user-chip tests)
- Modify: `js/lib/foundations-guard.test.js` (remove `activate.html`; the per-page loops at `:100` and `:144` are now empty — delete those two tests and note in a comment that the public pages' checks live in `auth-pages-guard.test.js`)
- Modify: `CLAUDE.md` (File structure: add `css/auth.css` after `css/admin-crud.css`; Cache-busting: list `css/auth.css?v=1` among the files `foundations-guard` checks)

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Write the failing tests** — append `'activate.html'` to both lists, and:
  - `it('the logo markup is identical in the three pages')`: for each page take the substring from `<div class="auth-logo-row">` to the closing `</div>` of `.auth-logo-sub` (`indexOf('<div class="auth-logo-sub">Project Dashboard</div>') + its length`); all three strings equal;
  - activate-only: contains `class="user-chip`, an envelope `<svg` inside it, no `btn-outline-secondary`, invalid state has `btn btn-primary w-100`, loading text `Validating invitation…`.

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL on activate.html.

- [ ] **Step 3: Migrate `activate.html`** per spec §4.4, same as Task 3 plus the `.user-chip` (16×16 envelope SVG, `aria-hidden="true"`, `stroke="currentColor"`, in `var(--text-muted)` via `.user-chip svg { color: var(--text-muted); }` — add that rule to `css/auth.css` if Task 1 did not; no `?v` bump needed, still unreleased `v=1`). The logo inner markup must be copied byte-for-byte from `login.html`.

- [ ] **Step 4: Update `foundations-guard.test.js` and `CLAUDE.md`** as listed in Files.

- [ ] **Step 5: Run the full suite** — Expected: PASS; no test count drop other than the deleted per-page foundations tests (now covered by `auth-pages-guard`).

- [ ] **Step 6: Commit**
  ```bash
  git add activate.html css/auth.css js/lib/auth-pages-guard.test.js js/lib/foundations-guard.test.js CLAUDE.md
  git commit -m "feat(auth): restyle activate.html; logo identity guard; document css/auth.css"
  ```

### Task 5: Visual verification on the branch stack

**Files:** none (evidence only; screenshots in the session scratchpad, not committed).

- [ ] **Step 1:** Copy `.env` from `C:\Users\Fabrizio.Fortini\Progetti\burndown\.env` into the worktree (never commit it), then `scripts/test-branch.sh up` and read the branch URL/port it prints. Never `docker compose` on the main stack.
- [ ] **Step 2:** Try headless screenshots (Chrome or Edge `--headless=new --screenshot --window-size=W,H`) of `/login.html`, `/reset-password.html` (no token → `invalid`), `/reset-password.html?token=x` (→ `invalid`), `/activate.html` at 1440×900, 1024×768, 390×844. Compare with the boards: card size/radius/shadow, logo, label case, input height, magenta button, copyright. The `form`/`success` states and the strength levels need a real token: if not obtainable headless, list them for the user's Gate 2 check.
- [ ] **Step 3:** Report findings; fix any deviation in the owning file with a `fix(auth): …` commit and re-run the suite. Do not tear the branch stack down — `/finish-cycle` Gate 2 decides that.
- [ ] **Step 4:** Run `/finish-cycle`.
