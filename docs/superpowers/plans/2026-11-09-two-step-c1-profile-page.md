# Two-step, ciclo 1: la pagina My profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-09-two-step-c1-profile-page-design.md`
**Branch:** `two-step-c1-profile-page`
**Risk class:** high-risk — migrazione DB (`033`), autenticazione e permessi (`auth.js`, `PATCH /api/users/:id`), file condivisi caricati da tutte le pagine (`js/nav.js`, `js/api.js`, `css/style.css`)

**Goal:** i modal My Profile e Change password diventano `profile.html` (Details in sola lettura con richiesta di rettifica, Password, Privacy & data); nome, cognome ed email li modifica solo un admin da User Admin.

**Architecture:** Server: regole pure in `api/src/lib/user-details.js` (node:test), chiamate da `routes/auth.js` (rettifica), `routes/users.js` (`PATCH /:id` esteso) e da nessun altro; migration `033` per `password_changed_at` e `rectification_requests`. Frontend: `profile.html` è una pagina Vue con sotto-navigazione presa da `js/lib/md-subnav.js` (nuovo set `profile`, voci con `href` a hash) e logica pura in `js/lib/profile-ui.js` (vitest); `js/nav.js` perde i due modal e porta alla pagina.

**Tech Stack:** Express + pg, node:test; HTML statico + Vue 3 da CDN, Bootstrap 5.3 (offcanvas per i drawer), vitest + jsdom, `test-api.js`, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 2–3 consumano il Task 1; i Task 5–7 consumano le route dei Task 2–3 e il Task 4; i Task 5 e 6 toccano entrambi `js/api.js`.

## Global Constraints

- Copy in inglese, testi esatti della spec §3–§4; carattere `…`, mai `...`. Errori dal campo `error` della risposta, fallback `Network error. Please try again.`
- Nessun hex in `profile.html`, `css/profile.css` e nelle righe toccate di `admin.html`/`css/style.css`; solo `var(--token)`. Token nuovi solo se nessuno va bene, con `js/lib/tokens.test.js` verde. Nessuna emoji, nessun `alert(`/`confirm(`/`showConfirm(` nuovo.
- Drawer = Bootstrap offcanvas: `.pd-drawer` (480 px) in `profile.html`; in `admin.html` `.ua-drawer`, come il drawer Invite che c'è già.
- Versioni, bump su **tutte** le pagine che le referenziano: `js/nav.js` `?v=22`→`23`, `js/api.js` `?v=13`→`14`, `css/style.css` `?v=37`→`38`, `js/lib/md-subnav.js` `?v=5`→`6`. Nuovi a `?v=1`: `css/profile.css`, `js/lib/profile-ui.js`. Ogni altro file versionato toccato: grep di tutti i suoi `?v=N` e bump allo stesso numero.
- Pagina nuova: `#app-shell`/`#nav-container`/`#app-main`, `.ph`, `v-cloak` sul root, `js/lib/icons.js` prima di `nav.js`, script `defer`/`type="module"` (CLAUDE.md "Page shell", "Script loading order").
- Migration applicata solo dal Gate 4 di `/finish-cycle`; verifiche su `scripts/run-tests.sh` e `scripts/test-branch.sh`, mai `docker compose` sul main stack.
- Durante i task solo i test toccati (`npx vitest run <file>`, `node --test <file>` da `api/`); la suite completa gira in `/finish-cycle`.
- File HTML modificati solo con Edit/Write/`sed`, mai `Set-Content` di PowerShell (BOM). Codice con `\` scritto con Edit/Write.

## Review Focus

1. **HTML nel messaggio di rettifica** — `<img src=x onerror=…>` come messaggio: `sendAdminNotificationEmail` interpola `body` e `title` in HTML senza escape. La route deve passare messaggio e nome già escapati all'email (la notifica in-app resta testo). Test nel Task 1 (`escapeHtml`) e nel Task 2 (RR-05).
2. **Utente anonimizzato con richieste registrate** — le righe di `rectification_requests` contengono dati personali liberi: l'anonimizzazione le cancella. Test nel Task 3 (AD-ED-08).
3. **Email con maiuscole o spazi** — ` Mario.Rossi@X.com ` dall'admin si salva `mario.rossi@x.com`; il duplicato si controlla dopo la normalizzazione, case-insensitive. Test nel Task 1 e nel Task 3 (AD-ED-04).
4. **Hash cambiato dall'utente** — `#password` digitato a mano o `#foo` sconosciuto, indietro/avanti: la sezione segue l'hash, `#foo` → Details e l'URL resta navigabile. Test nel Task 4 (`sectionFromHash`).
5. **Admin che modifica sé stesso via API** — `PATCH /api/users/<proprio id>` con `firstName`: 400 come oggi per role/status, DB invariato. Test nel Task 3 (AD-ED-05).

---

### Task 1: Regole server pure — `api/src/lib/user-details.js`

**Files:**
- Create: `api/src/lib/user-details.js`, `api/src/lib/user-details.test.js`

**Interfaces:**
- Produces (CommonJS, `module.exports`):
  - `normalizeDetails({ firstName, lastName, email }) → { firstName?, lastName?, email? }` — solo le chiavi presenti (`!== undefined`); nomi `trim`, email `trim().toLowerCase()`.
  - `detailsError(normalized) → { field, error } | null` — `field` `'firstName'|'lastName'|'email'`; nome vuoto → `'First name is required'` / `'Last name is required'`; email non conforme a `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` → `'Invalid email address'`; stringa oltre 255 → `'{Label} is too long'`; nessuna chiave → `{ field: null, error: 'Nothing to update' }`.
  - `RECTIFICATION_MAX = 2000`
  - `rectificationError(message) → string | null` — non stringa o vuoto dopo `trim` → `'Describe what needs to change'`; oltre `RECTIFICATION_MAX` dopo `trim` → `'Keep it under 2000 characters'`.
  - `escapeHtml(s) → string` — `& < > " '`.

- [ ] **Step 1: Test** — `user-details.test.js` (node:test): `normalizeDetails({ email: ' A@B.Co ' }).email === 'a@b.co'`; chiavi assenti non compaiono; `detailsError({ firstName: '' }).field === 'firstName'`; `detailsError({ email: 'x@y' }).error === 'Invalid email address'`; `detailsError({})` → `Nothing to update`; `detailsError({ firstName: 'A', email: 'a@b.co' }) === null`; `rectificationError('  ')`, `rectificationError(null)`, `rectificationError('x'.repeat(2001))` non null, `rectificationError('x'.repeat(2000)) === null`; `escapeHtml('<img onerror="x">&\'')` === `'&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;'`.
- [ ] **Step 2:** `cd api && node --test src/lib/user-details.test.js` → FAIL (modulo assente).
- [ ] **Step 3:** implementare il modulo.
- [ ] **Step 4:** stesso comando → PASS. Aggiungere la riga del modulo all'indice di `docs/api/lib.md`.
- [ ] **Step 5:** commit `feat(api): pure user-details rules for admin edits and rectification requests`.

### Task 2: Migration 033, `auth.js`, contatto privacy

**Files:**
- Create: `api/src/db/migrations/033_profile_admin_managed.sql`
- Modify: `api/src/routes/auth.js`, `api/src/routes/app-settings.js`, `.env.example`, `docker-compose.yml` (servizio `api`, blocco `environment:`), `test-api.js` (sezione Auth + nuova sezione `Profile`), `ARCHITECTURE.md` (§4.6, §5.1, §6 Auth e App Settings), `docs/db/migrations.md`, `docs/api/app-settings.md`

**Interfaces:**
- Consumes: Task 1 (`rectificationError`, `escapeHtml`, `RECTIFICATION_MAX`); `createNotification(userId, { type, title, body, url, urlLabel })` da `routes/notifications.js`; `sendAdminNotificationEmail({ to, firstName, title, body, url })` da `services/email.js`.
- Produces:
  - `GET /api/auth/me` → in più `created_at`, `terms_accepted_at`, `password_changed_at` (ISO o `null`).
  - `POST /api/auth/rectification-request` `{ message }` → `201 { ok: true }` | `400 { error }`.
  - `GET /api/app-settings/privacy-contact` → `{ name: string|null, email: string|null }`.
  - `PATCH /api/auth/profile` non esiste più (404).

- [ ] **Step 1: Migration** — `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;` e `CREATE TABLE IF NOT EXISTS rectification_requests (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());` più indice su `user_id`. Riga in `docs/db/migrations.md`.
- [ ] **Step 2: Test in `test-api.js`** (falliscono): in `testAuth`, `A-me-2` `/me` ha le chiavi `created_at`, `terms_accepted_at`, `password_changed_at`; nuova `testProfile()` chiamata dopo `testAuth`:
  - `PR-OF-01` `PATCH /api/auth/profile` con `{ firstName: 'Hacked' }` come admin → 404, e `/me` ha ancora `first_name` invariato;
  - `RR-01` `POST /api/auth/rectification-request` senza cookie → 401;
  - `RR-02` messaggio `'   '` → 400; `RR-03` messaggio di 2001 caratteri → 400;
  - `RR-04` messaggio valido come admin → 201, e come sysadmin `GET /api/notifications` contiene una notifica con titolo `Profile change requested by Test Admin`;
  - `RR-05` messaggio `<b>x</b>` → 201 (l'escape vale per l'email, verificato dal test del Task 1);
  - `PC-01` `GET /api/app-settings/privacy-contact` senza cookie → 401, con cookie → 200 con chiavi `name` ed `email`;
  - `PW-01` change-password dell'admin verso `PASS + 'x'` e ritorno a `PASS` → entrambi 200, poi `/me.password_changed_at` non `null`.
- [ ] **Step 3: `auth.js`** — `/me` seleziona le tre colonne; eliminare la route `PATCH /profile` e il suo commento; `change-password`, `reset-password`, `activate` aggiungono `password_changed_at = NOW()` al loro `UPDATE`; nuova route `POST /rectification-request` (`requireAuth`):
  - `rectificationError` → 400;
  - `INSERT INTO rectification_requests`;
  - destinatari: `SELECT id, email, first_name FROM users WHERE status = 'active' AND role IN ('admin','sysadmin') AND id <> $1`;
  - per ognuno `createNotification` con `title` `Profile change requested by {first} {last}`, `body` il messaggio (testo), `url` `/admin.html`, `urlLabel` `Open User Admin`; poi `sendAdminNotificationEmail` con `title` e `body` passati da `escapeHtml`, dentro `try/catch` per destinatario (un errore si logga e non interrompe);
  - `201 { ok: true }`.
- [ ] **Step 4: `app-settings.js`** — `GET /privacy-contact` (`requireAuth`): `email = (process.env.PRIVACY_CONTACT_EMAIL || '').trim() || null`, `name = email ? ((process.env.PRIVACY_CONTACT_NAME || '').trim() || null) : null`. `.env.example`: sezione `# Privacy contact (profile page) — optional: empty hides the card` con le due chiavi; `docker-compose.yml` servizio `api`: `PRIVACY_CONTACT_EMAIL: ${PRIVACY_CONTACT_EMAIL:-}` e `PRIVACY_CONTACT_NAME: ${PRIVACY_CONTACT_NAME:-}`.
- [ ] **Step 5: Docs** — `ARCHITECTURE.md` §4.6 riscritta: dettagli in sola lettura su `profile.html`, rettifica con `POST /api/auth/rectification-request` registrata in `rectification_requests` e notificata agli admin, modifica da `admin.html` → Edit details; §5.1 colonna e tabella; §6 le route nuove e la rimozione di `/profile`. `docs/api/app-settings.md` con la route.
- [ ] **Step 6:** `npx vitest run scripts/architecture-guard.test.js scripts/doc-paths-guard.test.js` → PASS; `bash scripts/run-tests.sh` → le righe `A-me-2`, `PR-OF-01`, `RR-0*`, `PC-01`, `PW-01` passano e nessun'altra regredisce.
- [ ] **Step 7:** commit `feat(api): password_changed_at, rectification requests, privacy contact; drop self-service profile edit`.

### Task 3: `PATCH /api/users/:id` con nome, cognome, email

**Files:**
- Modify: `api/src/routes/users.js` (`PATCH /:id`, `POST /:id/anonymize`), `test-api.js` (`testUsers`), `ARCHITECTURE.md` (§3.2 matrice dei permessi, §6 Users), `docs/api/users.md`

**Interfaces:**
- Consumes: Task 1 (`normalizeDetails`, `detailsError`).
- Produces: `PATCH /api/users/:id` accetta `{ role?, status?, firstName?, lastName?, email? }` → `200` riga aggiornata (`id, email, first_name, last_name, role, status`) | `400 { error, field? }` | `403` | `404` | `409 { error: 'Email already in use', field: 'email' }`.

- [ ] **Step 1: Test in `testUsers`** (falliscono), tutti con un `GET /api/users` di controllo dopo i rifiuti:
  - `AD-ED-01` sysadmin cambia `firstName` dell'admin di test in `Tested` → 200, poi lo rimette a `Test` → 200;
  - `AD-ED-02` sysadmin cambia l'email dell'admin di test in `test-admin-ed@pdash.local` e la rimette → 200, 200 (il login successivo dei test usa ancora `EMAIL`);
  - `AD-ED-03` `lastName: '  '` → 400 con `field: 'lastName'`, nessuna modifica;
  - `AD-ED-04` sysadmin imposta sull'admin `email: ' TEST-SYSADMIN@pdash.local '` → 409, `field: 'email'`;
  - `AD-ED-05` admin su sé stesso con `firstName` → 400, nessuna modifica;
  - `AD-ED-06` admin sul sysadmin con `firstName` → 403;
  - `AD-ED-07` `{ firstName: 'Ok', email: 'not-an-email' }` → 400 e il nome **non** cambia (tutto o niente).
  - L'anonimizzazione non ha test in `test-api.js` (servirebbe un utente usa e getta disabilitato, e l'invito dipende dall'SMTP): la cancellazione delle richieste si verifica al Gate 2 sullo stack del branch, e il caso va in `TEST_CASES.md` (Task 7).
- [ ] **Step 2:** `bash scripts/run-tests.sh` → le `AD-ED-*` falliscono.
- [ ] **Step 3: `users.js`** — nel `PATCH /:id` leggere anche `firstName`, `lastName`, `email`; se uno è presente: target anonimizzato (`/^anon_.+@deleted\.local$/`) → 400 `This user has been anonymized`; `normalizeDetails` + `detailsError` → 400 con `field`; duplicato `SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2` → 409; un solo `UPDATE` con tutti i campi validi (role, status, dettagli), dopo le guardie esistenti (sé stesso, `sysAdminTargetError`, `roleChangeError`). `POST /:id/anonymize`: `DELETE FROM rectification_requests WHERE user_id = $1` nella stessa transazione/sequenza dell'anonimizzazione.
- [ ] **Step 4: Docs** — matrice §3.2: riga `Edit user name / email` (sysadmin ✅, admin ✅ non su un sysadmin, user ❌); §6 Users; `docs/api/users.md`.
- [ ] **Step 5:** `bash scripts/run-tests.sh` → `AD-ED-*` passano; `npx vitest run scripts/architecture-guard.test.js` → PASS.
- [ ] **Step 6:** commit `feat(api): admins edit a user's name and email`.

### Task 4: Logica pura frontend e set `profile` della sotto-navigazione

**Files:**
- Create: `js/lib/profile-ui.js`, `js/lib/profile-ui.test.js`
- Modify: `js/lib/md-subnav.js` (+ il suo test, se esiste: `js/lib/md-subnav.test.js`), bump `md-subnav.js?v=5`→`6` sulle sei pagine che lo caricano

**Interfaces:**
- Produces:
  - `md-subnav.js`: `SUBNAV_SETS.profile = { label: 'My profile', sections: [ { group: 'ACCOUNT', items: [ { id: 'details', label: 'Details', href: '#details' }, { id: 'password', label: 'Password', href: '#password' } ] }, { group: 'PRIVACY', items: [ { id: 'privacy', label: 'Privacy & data', href: '#privacy' } ] } ] }`. `mdSubnavHtml` salta un gruppo con `items.length === 0`.
  - `profile-ui.js` (ES module, bridge `window.<nome>`):
    - `PROFILE_SECTIONS = ['details', 'password', 'privacy']`
    - `sectionFromHash(hash) → string` — `'#password'` → `'password'`; vuoto, `'#'`, sconosciuto → `'details'`.
    - `passwordStrength(pw) → 0|1|2|3|4` — 0 vuoto; 1 sotto 8; poi +1 per ciascuno di: lunghezza ≥ 12, almeno una cifra e una lettera, maiuscole e minuscole, carattere non alfanumerico; massimo 4, minimo 1 sotto 8, minimo 2 da 8 in su.
    - `passwordFormState({ current, next, confirm }) → { mismatch: boolean, canSubmit: boolean }` — `mismatch` se `confirm` non vuota e diversa da `next`; `canSubmit` se i tre pieni, `next.length >= 8`, nessun mismatch.
    - `maskInitials(user) → string` — iniziali di `first_name` + `last_name`, `?` se vuote.

- [ ] **Step 1: Test** — `sectionFromHash('#privacy') === 'privacy'`, `sectionFromHash('#foo') === 'details'`, `sectionFromHash('') === 'details'`; `passwordStrength('') === 0`, `('abc') === 1`, `('abcdefgh') === 2`, `('Abcdefgh1234!') === 4`; `passwordFormState({ current: 'a', next: 'abcdefgh', confirm: 'abcdefgx' })` → `{ mismatch: true, canSubmit: false }`; con conferma uguale → `canSubmit: true`; `next` di 7 caratteri → `canSubmit: false`. Per md-subnav: `mdSubnavHtml('password', 'profile')` contiene `href="#password"` con `aria-current="page"` e il gruppo `PRIVACY`; un set con un gruppo vuoto non rende il suo titolo.
- [ ] **Step 2:** `npx vitest run js/lib/profile-ui.test.js js/lib/md-subnav.test.js` → FAIL.
- [ ] **Step 3:** implementare; bump `?v=` di `md-subnav.js`.
- [ ] **Step 4:** stesso comando → PASS; `npx vitest run js/lib/nav-shell-guard.test.js` → PASS. Riga di `profile-ui.js` in `docs/js/lib.md`.
- [ ] **Step 5:** commit `feat(profile): pure profile helpers and the profile sub-navigation set`.

### Task 5: `js/nav.js` e `js/api.js` — via i modal, link alla pagina

**Files:**
- Modify: `js/nav.js`, `js/api.js`, `css/style.css`, `js/lib/nav-behavior.test.js`, bump `nav.js`/`api.js`/`style.css` su tutte le pagine, `docs/js/nav.md`, `docs/js/shared-libs.md`

**Interfaces:**
- Produces:
  - `Api.auth.rectificationRequest(message) → Promise` (`POST /auth/rectification-request`, body `{ message }`); `Api.appSettings.privacyContact() → Promise<{ name, email }>` (namespace nuovo `appSettings`: `js/api.js` non ne ha uno); `Api.users.update(id, patch) → Promise` (`PATCH /users/:id`) se la pagina admin non ha già un helper equivalente — controllare `admin.html` e riusare quello che usa per role/status. `Api.auth.updateProfile` rimosso.
  - `initNav('profile')` → `#nav-account-btn` ha la classe `active` e `aria-current="page"`.

- [ ] **Step 1: Test** (`nav-behavior.test.js`): il test "three modal titles" diventa solo `sendNotifModal`; nuovi casi: `#navProfileModal` e `#navChangePwdModal` sono `null` dopo `initNav`; click su `#nav-profile-btn` → `location.href` termina con `/profile.html`; click su `#nav-change-pwd-btn` → `/profile.html#password` (usare lo stesso stub di `location` che il file usa già, o `vi.spyOn`); `initNav('profile')` → `#nav-account-btn.classList.contains('active')`; con `initNav('pipeline')` no.
- [ ] **Step 2:** `npx vitest run js/lib/nav-behavior.test.js js/lib/nav-model.test.js` → FAIL sui nuovi casi.
- [ ] **Step 3:** `nav.js`: eliminare i blocchi che iniettano `#navChangePwdModal` e `#navProfileModal` e i loro handler (apertura e salvataggio); i due bottoni (id invariati, pinnati da `nav-model.test.js`) fanno `window.location.href = '/profile.html'` / `'/profile.html#password'`; su `profile.html` stessa, `#password` cambia solo l'hash. `buildNavHtml` aggiunge `active` e `aria-current="page"` a `#nav-account-btn` quando `activeTab === 'profile'`. `style.css`: `.pd-account-btn.active` con sfondo `var(--nav-item-active-bg)` e barra inset magenta da 3 px a sinistra (`box-shadow: inset 3px 0 0 var(--brand-magenta)`), sia nel sidebar sia nel rail. `api.js` come sopra.
- [ ] **Step 4:** grep `?v=` per i tre file e bump su ogni pagina; `npx vitest run js/lib/nav-behavior.test.js js/lib/nav-model.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-layout-guard.test.js` → PASS.
- [ ] **Step 5:** commit `feat(nav): My Profile and Change password open profile.html`.

### Task 6: `profile.html`

**Boards:** `15a-details.png`, `15b-password.png`, `15k-privacy.png`, `15ap-1-profile-tablet.png`, `15ap-2-profile-smartphone.png` in `docs/superpowers/design/two-factor/redesign/` — l'implementatore li apre e riporta un confronto tavola-markup per ciascuno.

**Files:**
- Create: `profile.html`, `css/profile.css`, `docs/pages/profile.md`
- Modify: `CLAUDE.md` (tabella Pages: riga `profile.html` | `/profile.html` | My profile: Details read-only with a rectification request, Password, Privacy & data; own stylesheet `css/profile.css`. Full narrative: docs/pages/profile.md), `TEST_CASES.md` (casi manuali della pagina)

**Interfaces:**
- Consumes: Task 2 (`/me` arricchito, `rectificationRequest`, `privacyContact`), Task 4 (`sectionFromHash`, `passwordStrength`, `passwordFormState`, `maskInitials`, set `profile`), Task 5 (`Api.*`, `initNav('profile')`), `js/lib/dates.js` per le date, `Api.auth.changePassword`.

- [ ] **Step 1:** scheletro: shell, `.ph` (avatar con `maskInitials`, titolo, sottotitolo `{First} {Last} · {role} · member since {date}`), `<nav class="md-subnav" data-md-active="details" data-subnav-set="profile" aria-label="My profile sections">`, root Vue con `v-cloak`, script nello stesso ordine di `privacy-notice.html` più `js/lib/dates.js`, `js/lib/md-subnav.js` e `js/lib/profile-ui.js`; `initNav('profile', { breadcrumbs: [{ label: 'Home', href: '/pipeline.html' }, { label: 'My profile' }] })`. La sezione corrente viene da `sectionFromHash(location.hash)`; su `hashchange` si aggiorna, e si reimposta `data-md-active` richiamando `mountMdSubnav()`.
- [ ] **Step 2: Details** — card a sola lettura (spec §3), footer `Your details are managed by an admin.` + outline **Request a change**; drawer `.pd-drawer` `#rectificationDrawer` (spec §3: eyebrow, titolo, testo, textarea con `maxlength="2000"` e contatore, Cancel + **Send request** disabilitato a vuoto, spinner, errore del server nel drawer); al successo chiusura, textarea svuotata, banner `.pd-banner` `role="status"` `Request sent to the admins.`; focus restituito a **Request a change**.
- [ ] **Step 3: Password** — spec §3: sottotitolo condizionale, tre campi `type="password"` con `autocomplete` `current-password`/`new-password`, barra a 4 segmenti da `passwordStrength`, mismatch da `passwordFormState`, **Update password** abilitato da `canSubmit`; errore 401 del server sotto Current password, altri in banner `role="alert"`; al successo campi vuoti, banner `Password updated.`, `password_changed_at` aggiornato in memoria a ora.
- [ ] **Step 4: Privacy & data** — spec §3; `privacyContact()` in errore o con `email: null` → card nascosta, senza messaggi.
- [ ] **Step 5: Responsive e stati** — sotto-navigazione con le regole `.md-subnav` esistenti (colonna, chip 768–1023.98 px, select < 768 px); card a tutta larghezza su phone, target ≥ 44 px; focus visibile.
- [ ] **Step 6: Verifica** — `npx vitest run js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js js/lib/dates-guard.test.js js/lib/tokens.test.js scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js` → PASS. `scripts/test-branch.sh up`, poi `node scripts/shoot.mjs` su `/profile.html`, `/profile.html#password`, `/profile.html#privacy` a 1440, 1024, 390 (invocazione in `docs/scripts/shoot.md`); leggere le PNG e confrontarle con le tavole; nessun overflow orizzontale.
- [ ] **Step 7:** commit `feat(profile): My profile page`.

### Task 7: User Admin — Edit details

**Files:**
- Modify: `admin.html`, `js/lib/user-admin-rules.js`, `js/lib/user-admin-rules.test.js`, `docs/pages/admin.md`, `TEST_CASES.md` (Edit details, e "Anonymize cancella le richieste di rettifica dell'utente" verificato con `SELECT count(*) FROM rectification_requests WHERE user_id = …` sullo stack del branch); bump `?v=` di `user-admin-rules.js` dove è caricato

**Interfaces:**
- Consumes: Task 3 (`PATCH /api/users/:id` con dettagli, `field` negli errori), Task 5 (`Api.users.update` o l'helper esistente della pagina).
- Produces: `menuGroups(user, me)` mette come prima voce del gruppo `access` `item('edit-details', 'Edit details…', 'Name and email', 'user')` (stessa forma degli altri `item`).

- [ ] **Step 1: Test** (`user-admin-rules.test.js`): `menuGroups` per un utente normale contiene `edit-details` come primo elemento di `access`; per sé stessi, un anonimizzato o un sysadmin visto da admin `menuGroups` resta `[]` (comportamento esistente, asserito anche per la nuova voce).
- [ ] **Step 2:** `npx vitest run js/lib/user-admin-rules.test.js` → FAIL.
- [ ] **Step 3:** `user-admin-rules.js` + `admin.html`: dispatcher del menu (`id === 'edit-details'`) apre `#editDetailsDrawer`, un `.offcanvas.ua-drawer` costruito come `#inviteDrawer` (eyebrow `USER ADMIN`, titolo `Edit details`, First name, Last name, Email precompilati). **Save** disabilitato finché nulla cambia o un campo è vuoto; spinner; un errore con `field` va sotto quel campo, gli altri in testa al drawer. Al successo: chiusura, riga aggiornata in memoria dai dati della risposta, banner della pagina `Details updated for {name}.`
- [ ] **Step 4:** `npx vitest run js/lib/user-admin-rules.test.js` → PASS. Sullo stack del branch: modificare un utente, provare un'email duplicata (errore sotto Email), verificare che la voce manchi sulla propria riga.
- [ ] **Step 5:** commit `feat(admin): Edit details drawer`.

---

## Criteri di accettazione

Quelli della Spec, `docs/superpowers/specs/2026-11-09-two-step-c1-profile-page-design.md` §Criteri di accettazione: questo Piano non ne aggiunge.

## Decisioni aperte

1. **Sotto-navigazione da `js/lib/md-subnav.js` con un set `profile` a hash.** Alternativa scartata: markup scritto da Vue nella pagina. Perché: una sola implementazione di colonna, chip e select su phone.
2. **L'anonimizzazione cancella le richieste di rettifica dell'utente.** Alternativa scartata: lasciarle (la `CASCADE` copre solo la `DELETE`). Perché: il messaggio è testo libero con dati personali.
3. **Messaggio e nome escapati nell'email agli admin, nella route.** Alternativa scartata: correggere `sendAdminNotificationEmail` per tutti i chiamanti. Perché: cambiare il servizio condiviso tocca anche `POST /api/notifications`, fuori ciclo; la correzione generale va in `docs/BACKLOG.md`.
4. **"Edit details…" prima voce del gruppo Access del menu ⋯.** Alternativa scartata: un gruppo nuovo. Perché: la spec la mette con le azioni sull'account; un gruppo da una voce allunga il menu.
5. **Barra di robustezza: regola a punteggio in `passwordStrength`.** Alternativa scartata: una libreria (zxcvbn). Perché: è un suggerimento, e nessuna dipendenza nuova a runtime senza build.
