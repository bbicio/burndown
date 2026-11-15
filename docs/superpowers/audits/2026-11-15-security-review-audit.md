# Security Review Audit (backend + frontend)

**Date:** 2026-11-15
**Scope (agreed with the user before any code was read):** verification-only. Backend (`api/src`: routes, middleware, services, lib) and frontend (`js/`, root `*.html` pages), plus the deployment files that shape their exposure (`nginx.conf`, `docker-compose.yml`, `api/Dockerfile`, `api/package.json`). A finding is an exploitable vulnerability or a missing control with a concrete attack path.
**Ground truth:** none in the repo (no security spec); OWASP Top 10 (2021) is the reference for the category label of each finding. Open-ended.
**Out of bounds (user):** `handbook/` and `docs/`.

## Method

- Mapped every `router.<verb>` handler of `api/src/routes/*.js` against the auth middleware it runs under (router-level `router.use(requireAuth…)` and per-route), then, for the resource routes (`cost-grids.js`, `projects.js`, `reporting.js`, `pots.js`, `exports.js`, `notifications.js`, `client-groups.js`, `pipeline-years.js`), against the ownership/share check each handler calls. The script was a text heuristic; every "NONE" or suspicious row was then read by hand (one false positive, see Ruled out).
- Read in full: `middleware/auth.js`, `services/jwt.js`, `lib/rate-limit.js`, the login / two-step / invite / activate / reset / change-password handlers of `routes/auth.js`, `routes/notifications.js` POST, `services/email.js` link building.
- Grepped for SQL built with `${}` on lines holding SQL keywords and read each hit; grepped `v-html` / `innerHTML` across the pages and `js/`, and read the escape path of each that carries data.
- Ran `npm audit --omit=dev` in `api/` (reads `package-lock.json`; needs network to the advisory service).
- Read `nginx.conf`, `docker-compose.yml`, `api/Dockerfile`, `.env.example` (values redacted when printed).
- Did **not** run the app, did not send requests, did not execute any exploit. Every finding below is a code reading, not a reproduction; the ones whose exploitability depends on a runtime fact say so.

## Findings

### S-01 — Notification `url` is stored and followed unvalidated (stored XSS by click, phishing link in email)

- **Type:** Injection / XSS (OWASP A03). **Severity:** High.
- **Location:** `api/src/routes/notifications.js:136-179`, `js/notifications.js:80`, `:156`, `:167`, `api/src/services/email.js:149`.
- **Evidence:**
  - Server stores whatever string arrives: `[u.id, type, title.trim(), body || null, url || null, urlLabel || null]` (`notifications.js:168`); the only check is `if (!title?.trim())` (`:139`). Individual targeting needs only `requireAuth` — the broadcast is the admin-only part (`:155-160`).
  - Client navigates to it: `if (url) window.location.href = url;` (`js/notifications.js:156`, same at `:80` for desktop notifications) and renders `<a href="${_esc(n.url)}">` (`:167`). `_esc` is `esc()` from `core.js:201`, which replaces `& < > "` and nothing about the URL scheme.
  - Email path: `const link = url ? (url.startsWith('http') ? url : \`${APP_URL}${url}\`) : null;` (`email.js:149`) puts any `http…` address, from any authenticated sender, in a mail that comes from the app's own SMTP sender.
- **Description:** any signed-in user can send any other active user (admins included) a notification whose link is `javascript:…`. Clicking the notification row or the link executes the script in the app's origin. The cookie is `httpOnly`, so it is not read, but the script can call every API the victim can: against an admin that is role changes (`PATCH /api/users/:id`), invites, exports, share changes. The same field delivers an arbitrary external URL inside a legitimate-looking in-app and email notification.
- **Root cause:** the notification was designed as "a deep link into the app" (CLAUDE.md "Notifications": `/costgrid.html?cgId=…`), but the route accepts any string, and both consumers trust it.
- **Exploitability caveat:** needs one click by the victim, and a modern browser executes `javascript:` assigned to `location.href`; not reproduced here.
- **Suggested fix (not applied):** accept only a same-origin relative path (`^/[A-Za-z0-9_./?=&%-]*$`, no `//`) on the server and refuse otherwise; re-check on render.

### S-02 — `xlsx` 0.18.5 (prototype pollution, ReDoS) parses files from any authenticated user; no fix on npm

- **Type:** Vulnerable component (OWASP A06). **Severity:** High.
- **Location:** `api/package.json` (`"xlsx": "^0.18.5"`), `api/src/routes/timesheets.js:123-129`.
- **Evidence:** `router.post('/upload', requireAuth, upload.single('file'), …)` then `XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true })` (`:127`); upload limit 20 MB (`:14`). `npm audit`: `xlsx *  high — Prototype Pollution in sheetJS (GHSA-4r6h-8v6p-xvw6); SheetJS ReDoS (GHSA-5pgg-2g8v-p4x9); fixAvailable: false`.
- **Description:** upload is open to every signed-in user (not only admins) and the file is parsed in the single API process. A crafted workbook can pollute `Object.prototype` during parsing, or hold the event loop with a ReDoS payload and take the API down for all users.
- **Root cause:** the npm registry copy of SheetJS stopped at 0.18.5; patched versions are distributed outside npm.
- **Note:** the actual reach of the pollution (which later code reads polluted properties) was not traced.

### S-03 — Invite and password-reset tokens are stored in clear

- **Type:** Cryptographic failure (OWASP A02). **Severity:** Medium.
- **Location:** `api/src/routes/auth.js:410` (insert `invite_token`), `:508` (`UPDATE users SET reset_token = $1`), lookups at `:462`, `:479`, `:526`, `:543`.
- **Evidence:** the token generated by `crypto.randomBytes(32).toString('hex')` (`:79-90`) is written as-is and compared with `WHERE reset_token = $1`. The second factor of the same file is handled the other way: the login code is stored as `hashCode(process.env.JWT_SECRET, ch.id, entered)` (`:291`).
- **Description:** whoever can read the `users` table (a SQL injection elsewhere, a dump in `backups/`, Adminer, a DB role) holds working account-takeover links for every user with an open invite or reset, with no password and no 2FA step (reset and activate end the session state but do not ask for a code: `revokeTwoStepState` at `:490`, `:556`).
- **Root cause:** the hashing discipline applied to the two-step code was not applied to the older token flows.

### S-04 — `forgot-password` has no abuse control, and each call overwrites the victim's pending reset link

- **Type:** Insufficient anti-automation (OWASP A04/A07). **Severity:** Medium.
- **Location:** `api/src/routes/auth.js:495-520`.
- **Evidence:** the route is unauthenticated and uses none of the limiters declared at `:23-30`; for an active user it runs `UPDATE users SET reset_token = $1 …` (`:508`) and sends a mail (`:512`).
- **Description:** (a) a script can send unlimited reset mails to any known address (mail flooding from the app's SMTP identity, and SMTP quota burn); (b) each call replaces `reset_token`, so a flood invalidates the link a real user is about to click — a denial of password recovery. Separate defect on the same lines: `email.toLowerCase()` (`:503`) throws on a non-string body value, so `{"email": {}}` returns 500 instead of the uniform 200 (a minor deviation from the "do not reveal" intent).
- **Root cause:** the limiter work covered login, code sends and rectification (`:23-30`); forgot-password was left out.

### S-05 — Database and Adminer are published on the host; Adminer is unpinned

- **Type:** Security misconfiguration (OWASP A05). **Severity:** Medium (conditional).
- **Location:** `docker-compose.yml:21` (`"5432:5432"`), `:88-92` (`adminer:latest`, `"8080:8080"`).
- **Evidence:** both ports are bound without a host address, i.e. on every interface; `adminer:latest` carries no version.
- **Description:** on any host reachable from a network, PostgreSQL (password only) and a database admin UI are directly exposed, bypassing the nginx allowlist and every API check. Combined with S-03 this is the shortest path to takeover. The compose header and the memory note that port 3000 was closed on the main stack show this class was already attended to for the API, not for these two.
- **Condition:** if this compose file is only a developer workstation setup and production is deployed from elsewhere (the "PDash To Prod" export copies site files only), the severity drops to Low. The production topology is not in the repo, so it is not established here.

### S-06 — No HTTP security headers

- **Type:** Security misconfiguration (OWASP A05). **Severity:** Medium.
- **Location:** `nginx.conf` (no `add_header` anywhere).
- **Evidence:** a search of the file for `add_header`, `limit_req`, `server_tokens` returns nothing.
- **Description:** no `Content-Security-Policy` (which would have contained S-01), no `X-Frame-Options`/`frame-ancestors` (clickjacking of the admin pages), no `X-Content-Type-Options`, no `Strict-Transport-Security`, no `Referrer-Policy`. There is also no request-rate limit in front of the API, so the in-memory limiters in `auth.js` are the only throttle and reset on restart (`lib/rate-limit.js`, header comment).
- **Root cause:** the nginx work (the allowlist cycle) was scoped to which paths are served, not to response headers.

### S-07 — Session cookies are `Secure` only when `NODE_ENV === 'production'`, which compose defaults to `development`

- **Type:** Security misconfiguration (OWASP A05). **Severity:** Low–Medium (depends on the deployed `.env`).
- **Location:** `api/src/services/jwt.js:19`, `api/src/routes/auth.js:36`, `:46`, `docker-compose.yml:40`.
- **Evidence:** `secure: process.env.NODE_ENV === 'production'`; `NODE_ENV: ${NODE_ENV:-development}`.
- **Description:** an instance deployed with the shipped default serves the session, challenge and trusted-device cookies without `Secure`, so a first plain-HTTP request lets them travel in clear. Whether production sets `NODE_ENV=production` cannot be read from the repo.

### S-08 — Every 500 returns the internal error message

- **Type:** Information exposure (OWASP A05). **Severity:** Low.
- **Location:** `api/src/index.js:90-93`.
- **Evidence:** `res.status(err.status || 500).json({ error: err.message || 'Internal server error' })`.
- **Description:** a malformed id or body reaches PostgreSQL and its message (type names, constraint names, `invalid input syntax for type uuid`) is returned to the caller. Several handlers pass client values to queries without `isUuid` (e.g. `userId` in `routes/cost-grids.js:990` share POST, `routes/notifications.js:149`), so this is reachable by any signed-in user.

### S-09 — Other `npm audit` results to triage (not individually exploited)

- **Type:** Vulnerable components (OWASP A06). **Severity:** Low–Medium, pending triage.
- **Location:** `api/package-lock.json`.
- **Evidence (`npm audit --omit=dev --json`):** `nodemailer` high (direct, fix `10.5.0`, breaking); `body-parser` high (transitive, `npm audit fix`); `proxy-addr` **critical** (transitive, IP spoofing through an IPv4-mapped IPv6 trusted subnet, `npm audit fix`); `qs` moderate; `uuid` moderate (direct, fix `14.0.3`, breaking).
- **Description:** the two that touch security controls: `proxy-addr` feeds `req.ip`, which keys the login limiter (`auth.js:226`); the app sets `trust proxy` to the hop count `1` (`index.js:33`), not a subnet list, so the advisory's trigger condition is probably not met, but that was not verified. The nodemailer advisories are mostly about attacker-controlled recipient/headers; recipients here come from the database or from the admin-only invite form, which limits reach. Neither judgement was tested.

### S-10 — Container runs as root; test profile creates known-password privileged accounts

- **Type:** Security misconfiguration / defaults (OWASP A05). **Severity:** Low.
- **Location:** `api/Dockerfile` (no `USER`), `docker-compose.yml:72` and the `test` service command.
- **Evidence:** the `test` service runs `create-admin.js` and `promote-sysadmin.js` with `${TEST_SYSADMIN_PASSWORD:-TestSysAdmin123!}` against the compose project's `db`.
- **Description:** `docker compose --profile test run test` on a stack holding real data would leave a sysadmin with a password published in the repo. `scripts/run-tests.sh` uses an isolated disposable stack, which is the mitigation; the compose profile itself has no guard.

## Ruled out (checked, no divergence)

| Area | What was checked | Citation |
|---|---|---|
| Route authentication | every handler of every route file runs under `requireAuth`/`requireAdmin`/`requireSysAdmin`; the only unauthenticated ones are login, two-step, logout, invite/activate/reset (intended). `GET /api/pots/` carries no own check, I did not read it to the end | `middleware/auth.js:1-66`, route-by-route table in Method |
| Session revocation | role, status and `password_changed_at` re-read from the DB on every request | `middleware/auth.js:19-37` |
| Version IDOR | the apparent hole (version routes check `canEdit(:id)` and then query by `:vId` alone) is closed by `router.use('/:id/versions/:vId', requireAuth, versionScope)`, and pinned by tests `VS-01`..`VS-16` | `routes/cost-grids.js:361-371`, `test-api.js:4056-4082` |
| Project / cost-grid object access | edit routes call `canEdit`, read routes `canAccess`; shares cannot grant `owner`; owner reassignment is admin-only | `cost-grids.js:89`, `:984-989`, `:1073`; `projects.js:34`, `:136` |
| Login brute force | per-IP and per-email failed-attempt limiters, slot reserved before the first `await`, string-type check before bcrypt | `auth.js:216-245` |
| Two-step code | per-challenge attempt counter, HMAC-hashed code, `timingSafeEqual`, `sameSite: strict` challenge cookie | `auth.js:281-322`, `:36-44` |
| Token entropy | invite/reset tokens are 32 random bytes; no limiter needed against guessing | `auth.js:79-90` |
| Role escalation | actor's live role used; sysadmin rows editable only by a sysadmin; email change needs admin | `routes/users.js:91-170` |
| SQL injection | every `${}` in SQL is a server-built fragment (`visibilityClause`, `whereClause`, column lists, constants) with values bound as `$n`; user values go through placeholders. I read the interpolation sites, not every builder of `visibilityClause`/`vis` | grep hits in Method; `cost-grids.js:230`, `:305`; `users.js:60` |
| Output encoding | data rendered through `esc()`/`escapeHtml`/`textContent`; Vue `v-html` is fed by badge builders that `esc()` their input, by static SVG paths, and by `renderChatText` that escapes first | `core.js:224-269`, `js/lib/team-assistant-ui.js:7-9`, `shares.js:140-146`, `:214-222` |
| Client IP behind nginx | nginx appends to `X-Forwarded-For` and Express takes the last hop (`trust proxy 1`), so a client-supplied header does not choose `req.ip` | `nginx.conf` `/api/` block, `index.js:33` |
| Export recipients | exports are emailed only to the requester's own address | `routes/exports.js:16-31`, `:101`, `:192` |
| Static serving | nginx allowlist; `.env`, `backups/` and tests answer 404 | `nginx.conf` (header comment of the site-files block), `scripts/nginx-serve.test.js` |
| CORS / CSRF | single configured origin with credentials; auth cookies `sameSite: lax/strict`, JSON-only body parser | `index.js:35-38`, `jwt.js:17-19` |

## Out of scope / roadmap notes

- **Process:** no security step exists in `/finish-cycle` or `PROCESS.md`; `security-review` is named only to say `domain-audit` does not overlap it. A gate for changes under `api/src/routes`, `middleware`, `services` and `nginx.conf` would have caught S-01, S-04 and S-06 at the cycle that introduced them.
- **Not assessed:** LLM prompt injection through project/task descriptions into `topic-extraction` and the Team assistant; whether CDN-loaded scripts carry SRI; every Vue `:href`/`:src` binding fed by stored data; PostgreSQL role privileges and at-rest encryption of `backups/`; password policy (the code requires 8 characters and nothing else, `auth.js:476`); the production topology and `.env` (S-05, S-07).
- **Documented design, listed for completeness:** `POST /api/programs` and `PATCH /api/programs/:id` on a program with zero projects are open to any authenticated user (`routes/config.js:74`, `:88-93`); `GET /api/users/search` returns the user directory to any signed-in user (`routes/users.js:23`). Both are deliberate per their comments; they are residual integrity/privacy trade-offs, not defects.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.
