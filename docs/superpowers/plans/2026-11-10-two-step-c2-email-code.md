# Two-step, ciclo 2: secondo passo del login via email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-10-two-step-c2-email-code-design.md`
**Branch:** `two-step-c2-email-code`
**Risk class:** high-risk — migrazione DB (`034`), autenticazione (`routes/auth.js`, `routes/users.js`, login), file condivisi caricati da più pagine (`js/lib/md-subnav.js`, `css/auth.css`)

**Goal:** dopo la password il login chiede un codice di 6 cifre via email; dispositivi fidati per 30 giorni; revoca di challenge e dispositivi su ogni cambio di credenziale o di stato dell'account.

**Architecture:** regole pure in `api/src/lib/two-step.js` e `api/src/lib/rate-limit.js`; accesso ai dati in `api/src/services/two-step.js`; route in `api/src/routes/auth.js`; due CLI sotto `api/src/`. Frontend: logica pura in `js/lib/otp.js`, componente Vue globale `js/otp-input.js`, vista `code` in `login.html`, due sezioni nuove in `profile.html`.

**Tech Stack:** Node/Express, PostgreSQL 16, `node:test`; Vue 3 da CDN, vitest + jsdom; `test-api.js` via `scripts/run-tests.sh`.

**Indipendenza dei task:** i task **non** sono indipendenti. 2 usa 1; 3 usa 1-2; 4 usa 2-3; 6 usa 5; 7 usa 3; 8 usa 3; 9 usa tutti. 5 è indipendente da 1-4.

## Global Constraints

- Tutto il testo per l'utente in inglese, con il carattere `…`; niente hex (solo `var(--token)`), ogni coppia testo/sfondo ≥ 4.5:1.
- Nessun codice né token in chiaro nel DB: token come sha256, codice come HMAC-SHA256(`JWT_SECRET`, `challengeId + ':' + code`).
- Costanti: codice 10 min, cooldown 60 s, 5 tentativi per challenge (un reinvio non li azzera), challenge 30 min, `MAX_SENDS` 5, fiducia 30 giorni.
- Cookie: `pdash_challenge` (httpOnly, `sameSite: 'strict'`, path `/api/auth`, 30 min); `pdash_device` (httpOnly, `sameSite: 'lax'`, path `/api/auth`, 30 giorni); `secure` solo con `NODE_ENV === 'production'`.
- Ogni `?v=N` di un file toccato si aggiorna in **ogni** riferimento del repo (grep prima del commit); `css/auth.css` è pinnato da `js/lib/foundations-guard.test.js`.
- HTML del repo modificato solo con Edit/Write (mai PowerShell `Set-Content`: aggiunge un BOM); codice con `\` mai scritto via `node -e`/shell.
- Docker sullo stack principale: vietato ai subagent. I test d'integrazione girano solo con `bash scripts/run-tests.sh` (stack isolato). Mai `docker compose down/up/restart` sullo stack principale, mai `-v`.
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`, `node --test src/lib/<file>` da `api/`); la suite completa gira in `/finish-cycle`.
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui (Brief, "Guardia sui finding nuovi").

## Review Focus

1. **Challenge chiuso altrove:** "Back to sign in" in un'altra scheda, o il lock, cancellano il challenge; il verify successivo riceve `401 NO_CHALLENGE` e la vista deve mostrare `Sign-in expired`, non un errore generico (Task 3 TS-10, Task 6 step 1).
2. **Codice incollato con spazi o trattino** (`123 456`, `123-456`): il client lo normalizza e anche il server toglie i non-cifra prima del confronto (Task 1 `normalizeCode`, Task 5 `normalizeDigits`, Task 3 TS-06).
3. **Codice con zeri iniziali** (`004217`): generato, inviato e verificato come stringa di 6 caratteri (Task 1 test `generateCode`).
4. **Cookie di dispositivo di un altro utente** sullo stesso browser: non salta il codice per l'utente B (Task 1 `deviceTrusted`, Task 3 TS-12).
5. **Email cambiata da admin con un challenge aperto:** il verify successivo risponde `401 NO_CHALLENGE`, il codice spedito al vecchio indirizzo non apre nulla (Task 4 TS-22).

---

### Task 1: regole pure e rate limiter

**Files:**
- Create: `api/src/lib/two-step.js`, `api/src/lib/two-step.test.js`, `api/src/lib/rate-limit.js`, `api/src/lib/rate-limit.test.js`

**Interfaces:**
- Produces (`two-step.js`, CommonJS): `CODE_TTL_MS=600000`, `RESEND_COOLDOWN_MS=60000`, `MAX_ATTEMPTS=5`, `CHALLENGE_TTL_MS=1800000`, `MAX_SENDS=5`, `TRUST_DAYS=30`, `TWO_STEP_METHODS=['email']`; `generateCode(): string`; `normalizeCode(input): string` (solo cifre); `hashCode(secret, challengeId, code): string` (hex); `hashToken(token): string` (sha256 hex); `newToken(): string` (32 byte hex); `verifyOutcome(ch, now, matches)` → `{result:'ok'}|{result:'wrong',attemptsLeft}|{result:'expired'}|{result:'locked'}` dove `ch = {attempts, code_expires_at}` e `attempts` è già incrementato; `resendWait(ch, now)` → `number` ms oppure `'exhausted'`, con `ch = {code_sent_at, sends}`; `maskEmail(email): string`; `deviceLabel(ua): {label, kind}`; `deviceTrusted(device, user, now): boolean` con `device = {user_id, created_at, expires_at}`, `user = {id, password_changed_at}`.
- Produces (`rate-limit.js`): `createLimiter({ windowMs, max })` → `{ hit(key, now = Date.now()) → {allowed, retryInMs}, peek(key, now) → {allowed, retryInMs}, reset(key) }`.

- [ ] **Step 1: scrivere `two-step.test.js`** con almeno:
  - `generateCode` 1000 volte: sempre `/^\d{6}$/`.
  - `normalizeCode(' 123-456 ')` → `'123456'`; `normalizeCode(null)` → `''`.
  - `hashCode('s','id','123456')` stabile e ≠ `hashCode('s','id2','123456')` e ≠ `hashCode('t','id','123456')`.
  - `verifyOutcome`: `matches` e non scaduto → ok; non `matches`, `attempts: 1` → `{wrong, attemptsLeft: 4}`; `attempts: 5` non match → `locked`; scaduto (`code_expires_at` < now) → `expired` anche con `matches`.
  - `resendWait`: `code_sent_at` 10 s fa → 50000; 61 s fa → 0; `code_sent_at: null` → 0; `sends: 5` → `'exhausted'`.
  - `maskEmail('fabrizio@eversana.com')` → `'f•••@eversana.com'`; `maskEmail('a@b.it')` → `'a•••@b.it'`.
  - `deviceLabel`: UA di Chrome su Windows → `{label:'Chrome on Windows', kind:'desktop'}`; Edge su Windows → `Edge on Windows` (l'UA di Edge contiene anche "Chrome"); Safari su iPhone → `{label:'Safari on iPhone', kind:'mobile'}`; Chrome su Android → `kind:'mobile'`; Firefox su macOS; `''` → `{label:'Unknown browser on Unknown device', kind:'desktop'}`.
  - `deviceTrusted`: stesso utente, non scaduto, creato dopo `password_changed_at` → true; altro `user_id` → false; scaduto → false; creato prima di `password_changed_at` → false; `password_changed_at: null` → true.
- [ ] **Step 2: `rate-limit.test.js`**: `max: 3, windowMs: 1000`; tre `hit` allowed, il quarto `{allowed:false, retryInMs>0}`; dopo `now+1001` di nuovo allowed; chiavi diverse indipendenti; `peek` non conta; `reset` azzera.
- [ ] **Step 3:** `cd api && node --test src/lib/two-step.test.js src/lib/rate-limit.test.js` → FAIL (moduli assenti).
- [ ] **Step 4: implementare** i due moduli. `generateCode` con `crypto.randomInt(0, 1000000)` e `padStart(6,'0')`; `hashCode` con `crypto.createHmac('sha256', secret)`; il limiter è una `Map` key → `{start, count}`, con pulizia delle voci scadute a ogni `hit`.
- [ ] **Step 5:** stesso comando → PASS.
- [ ] **Step 6: commit** `feat(api): two-step pure rules and in-memory rate limiter`.

### Task 2: migration, servizio, email

**Files:**
- Create: `api/src/db/migrations/034_two_step_email.sql`, `api/src/services/two-step.js`
- Modify: `api/src/services/email.js`, `api/src/routes/auth.js:79-87` (rettifica: niente pre-escape)

**Interfaces:**
- Consumes: Task 1.
- Produces (`services/two-step.js`, ogni funzione accetta `db` con `.query`, default `require('../db/client')`):
  - `createChallenge(userId, { db }) → { challenge, token, code }` (purge dei challenge e dispositivi scaduti prima dell'insert; `code_sent_at` NULL finché `markSent`).
  - `markSent(challengeId, { db })`.
  - `findChallenge(token, { db }) → row | null` (non scaduto: `expires_at > NOW()`).
  - `recordAttempt(challengeId, { db }) → attempts | null` (`UPDATE … SET attempts = attempts + 1 WHERE id = $1 AND attempts < 5 RETURNING attempts`).
  - `replaceCode(challengeId, { db }) → code` (nuovo `code_hash`, `code_expires_at = NOW() + 10 min`, `sends = sends + 1`, `code_sent_at` NULL).
  - `deleteChallenge(challengeId, { db })`.
  - `revokeTwoStepState(userId, { db })` → cancella `login_challenges` e `trusted_devices` dell'utente.
  - `trustDevice(userId, ua, { db, days = TRUST_DAYS, label }) → token`.
  - `findTrustedDevice(token, { db }) → row | null`; `touchDevice(id, { db })`.
  - `listDevices(userId, currentToken, { db }) → [{ id, label, kind, created_at, expires_at, current }]` (non scaduti, `ORDER BY created_at DESC`).
  - `removeDevice(userId, id, currentToken, { db }) → { removed: boolean, wasCurrent: boolean }`; `removeAllDevices(userId, { db })`.
- Produces (`email.js`): `sendLoginCode({ to, firstName, code })`; `sendAdminNotificationEmail` escapa `firstName`, `title`, `body` nell'HTML e usa `title` grezzo nell'oggetto.

- [ ] **Step 1: migration** come in Spec §2, `BEGIN … COMMIT`, `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Nessun `CHECK` su `method`/`two_step_method`.
- [ ] **Step 2: servizio** con le firme sopra; l'HMAC usa `process.env.JWT_SECRET`.
- [ ] **Step 3: email.** `sendLoginCode`: oggetto `PDash — Your sign-in code`; corpo `Hi {firstName},`, `Your PDash sign-in code is:`, il codice in grande (`<p style="font-size:24px;letter-spacing:4px"><strong>{code}</strong></p>` — lo stile inline è ammesso nelle email, non hex), `It expires in 10 minutes.`, `If you didn't try to sign in, change your password.`. In `sendAdminNotificationEmail` importare `escapeHtml` da `../lib/user-details` ed escapare dentro il mailer (B-396); in `routes/auth.js` la rettifica passa `firstName: a.first_name, title, body: text` senza `escapeHtml` (B-400).
- [ ] **Step 4:** `cd api && node -e "require('./src/services/two-step.js'); require('./src/services/email.js')"` carica senza errori (richiede `api/node_modules`; in assenza, il controllo passa al run di Task 3). L'escape del mailer non ha un test automatico (l'email non si legge): lo verifica il revisore del task.
- [ ] **Step 5: commit** `feat(api): migration 034, two-step service, login code email; escape inside the mailer (B-396, B-400)`.

### Task 3: route del login, CLI, test d'integrazione del flusso

**Files:**
- Modify: `api/src/routes/auth.js` (login, logout, `/me`, route nuove), `api/src/index.js` (`app.set('trust proxy', 1)` prima delle route), `docker-compose.yml` (servizio `test`: `JWT_SECRET: ${JWT_SECRET}`), `test-api.js`
- Create: `api/src/trust-device.js`, `api/src/two-step-code.js`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces (HTTP): Spec §3.3 esattamente, con i `code` `NO_CHALLENGE`, `WRONG_CODE`, `CODE_EXPIRED`, `LOCKED`, `COOLDOWN`, `RATE_LIMITED`, `SEND_FAILED`; `retryIn` in secondi interi arrotondati per eccesso; login con challenge → `200 { twoStep: { method:'email', destination, expiresIn: 600, resendIn: 60|0, sendFailed } }`; `/me` → `two_step: { method, destination }`.
- Produces (CLI): `node src/trust-device.js <email> [--days N]` stampa su stdout la sola stringa del token (senza `pdash_device=`), exit 1 su utente assente o non attivo; `node src/two-step-code.js <email>` stampa le sole 6 cifre, exit 1 senza challenge aperto (messaggio su stderr). Bootstrap `.env`/`DATABASE_URL` copiato da `create-admin.js`.
- Produces (`test-api.js`): `cli(script, ...args) → string` (`execFileSync('node', [script, ...args], { env: { ...process.env, NODE_PATH: '/tmp/node_modules' } })`, trim); `cookieValue(headers, name) → string` (`name=value` da `getSetCookie()`); `loginWithCode(email, password) → cookie pdash_token` (login, poi `cli('src/two-step-code.js', email)`, poi verify); `ADMIN_DEVICE`/`SYSADMIN_DEVICE` creati a inizio suite con `cli('src/trust-device.js', …)`.

- [ ] **Step 1: TS da scrivere prima** in `test-api.js`, nuova sezione `testTwoStep()` chiamata subito dopo `testAuth()`, con un utente usa-e-getta creato via `create-admin.js`-like SQL o via invite+activate (seguire il pattern di `reqEmail` a riga ~1382) e registrato per il cleanup:
  - TS-01 login senza dispositivo → 200, `data.twoStep.method === 'email'`, `destination` mascherata, nessun `pdash_token` nel `set-cookie`, presente `pdash_challenge`.
  - TS-02 `/me` con il solo `pdash_challenge` → 401.
  - TS-03 verify con un codice di 6 cifre diverso da quello dato dalla CLI → 400 `WRONG_CODE`, `attemptsLeft: 4`.
  - TS-04 altri 3 errati → `attemptsLeft: 1`; il quinto → 423 `LOCKED`; un verify successivo → 401 `NO_CHALLENGE`.
  - TS-05 nuovo login, codice da CLI, verify → 200 con `pdash_token`; `/me` → 200 con `two_step.method === 'email'`.
  - TS-06 verify con il codice scritto come `'123 456'`-style (cifre del codice giusto con uno spazio in mezzo) → 200.
  - TS-07 resend subito → 429 `COOLDOWN` con `retryIn` tra 1 e 60.
  - TS-08 `UPDATE login_challenges SET code_sent_at = NOW() - interval '61 seconds'` via `sql()`, resend → 200; il codice precedente → 400 `WRONG_CODE`; il nuovo da CLI → 200.
  - TS-09 `UPDATE … SET code_expires_at = NOW() - interval '1 second'`, verify col codice giusto → 410 `CODE_EXPIRED`.
  - TS-10 `DELETE /api/auth/two-step` → 200 e la riga non esiste più (`sql`); un verify successivo con lo stesso cookie → 401 `NO_CHALLENGE`.
  - TS-11 verify con `trustDevice: true` → `pdash_device` nel `set-cookie`; login successivo con quel cookie → 200 con `pdash_token` e senza `twoStep`.
  - TS-12 il cookie di dispositivo dell'utente usa-e-getta presentato al login dell'admin → `twoStep` presente.
  - TS-13 `GET /api/auth/trusted-devices` con il cookie del dispositivo → un elemento con `current: true`; `DELETE /api/auth/trusted-devices/:id` → 200, login successivo con quel cookie → `twoStep`; `DELETE` di un id di un altro utente → 404.
  - TS-14 `DELETE /api/auth/trusted-devices` con due dispositivi → lista vuota.
  - TS-15 10 login falliti su un'email inesistente dedicata → l'undicesimo 429 `RATE_LIMITED` con `retryIn`.
  - TS-16 due login dello stesso utente (due cookie di challenge): il codice dalla CLI (challenge più recente) col cookie del **primo** → 400 `WRONG_CODE`; lo stesso codice col cookie del secondo → 200. I due challenge coesistono.
  - TS-17 `two-step-code.js` per un utente senza challenge → exit ≠ 0.
  - A-01/A-06 esistenti: mandare `pdash_device=<ADMIN_DEVICE>` / `<SYSADMIN_DEVICE>` col login; A-02/A-04 invariati. I login alle righe ~226, ~1382, ~2447 passano da `loginWithCode` o dal cookie del dispositivo, secondo l'account.
- [ ] **Step 2:** `bash scripts/run-tests.sh` → TS-* FAIL (route assenti). Copiare prima `.env` dal checkout principale se manca nel worktree.
- [ ] **Step 3: implementare** le route di Spec §3.3, i limiter (`loginIpLimiter` 30/15 min e `loginEmailLimiter` 10/15 min sui soli fallimenti, controllati con `peek` prima di `bcrypt.compare` e incrementati con `hit` solo su 401; `sendLimiter` 10/ora per utente su ogni creazione di challenge e resend), `trust proxy`, le due CLI, `JWT_SECRET` nel servizio `test`.
- [ ] **Step 4:** `bash scripts/run-tests.sh` → tutti i test verdi, compresi i TS di questo task.
- [ ] **Step 5: commit** `feat(api): email code second step, trusted devices, rate limits, CLIs`.

### Task 4: revoca su ogni percorso, guard, follow-up B-397 e B-409

**Files:**
- Modify: `api/src/routes/auth.js` (`change-password`, `reset-password`, `activate`, `invite`), `api/src/routes/users.js` (`PATCH /:id`, `DELETE /:id`, `/anonymize`), `api/src/create-admin.js`, `api/src/routes/exports.js:65,77,158`, `test-api.js`
- Create: `api/src/lib/credential-revocation-guard.test.js`

**Interfaces:**
- Consumes: `revokeTwoStepState(userId, { db })` (Task 2), `cookieValue`, `loginWithCode`, `sql` (Task 3).

- [ ] **Step 1: guard** (`node:test`, legge i file da disco): per ogni `.js` sotto `api/src` (esclusi `*.test.js`, `db/migrations`), se contiene un `UPDATE users` (case-insensitive) il cui testo, fino al `WHERE` successivo, contiene `password_hash`, `email`, `status` → il file deve contenere `revokeTwoStepState(`. Un secondo test pinna che il guard trova almeno `routes/auth.js`, `routes/users.js`, `create-admin.js` (così un regex rotto non passa a vuoto). Intestazione: limite di granularità a livello di file.
- [ ] **Step 2:** `cd api && node --test src/lib/credential-revocation-guard.test.js` → FAIL.
- [ ] **Step 3: TS di revoca** in `test-api.js` (`testTwoStepRevocation()`, dopo `testTwoStep()`), ognuno con un utente usa-e-getta che ha un dispositivo fidato e un challenge aperto (login senza cookie):
  - TS-20 `change-password` → zero righe in `trusted_devices` e `login_challenges` per l'utente; il `set-cookie` cancella `pdash_device`.
  - TS-21 `reset-password` (token impostato via `sql`) → zero righe.
  - TS-22 admin `PATCH /api/users/:id` con un'email nuova → zero righe; il verify col vecchio cookie di challenge → 401 `NO_CHALLENGE`.
  - TS-23 `PATCH` con `status: 'disabled'` e, su un altro utente, `DELETE /api/users/:id` → zero righe.
  - TS-24 anonymize → zero righe.
  - TS-26 B-397: dopo un cambio email dell'utente, `POST /api/exports/portfolio` con la sua sessione risponde `email` uguale alla nuova (`data.email`).
  - TS-27 B-409: invite con `firstName` di 101 caratteri → 400; invite di `anon_x@deleted.local` → 400.
  - TS-28 `create-admin.js` su un utente esistente → `password_changed_at` non NULL e zero dispositivi.
- [ ] **Step 4: implementare.** `revokeTwoStepState` nella stessa transazione dove la route ne apre una, altrimenti subito dopo l'`UPDATE` riuscito; nel `PATCH` solo se l'email cambia davvero o se `status === 'disabled'`; `change-password` rimuove anche il cookie `pdash_device` (`res.clearCookie('pdash_device', { path: '/api/auth' })`). `create-admin.js` aggiunge `password_changed_at = NOW()`. `exports.js` legge `email, first_name` da `users` per `req.user.id`. `invite` usa `normalizeDetails`/`detailsError` come `PATCH /api/users/:id`.
- [ ] **Step 5:** guard → PASS; `bash scripts/run-tests.sh` → verde.
- [ ] **Step 6:** aggiungere a `docs/BACKLOG.md` la riga "il JWT `pdash_token` resta valido fino a 8 h dopo disable, anonymize o cambio password" (origine: questo ciclo, Spec §3.4; stato open; verifica `grep -c "query" api/src/middleware/auth.js` dentro `requireAuth`), nel formato delle righe B-3xx, con il primo numero libero.
- [ ] **Step 7: commit** `feat(api): revoke two-step state on every credential change; guard; B-397, B-409`.

### Task 5: input a sei caselle

**Files:**
- Create: `js/lib/otp.js`, `js/lib/otp.test.js`, `js/otp-input.js`, `css/otp-input.css`
- Boards: `15u-login-email-initial.png`, `15w-login-email-wrong-code.png`, `15x-login-email-expired.png`, `15ah-login-phone-email.png`

**Interfaces:**
- Produces (`js/lib/otp.js`, ES module + `window` bridge): `OTP_LENGTH = 6`; `normalizeDigits(text): string`; `applyInput(digits: string[6], index, text) → { digits, focus }`; `applyKey(digits, index, key) → { digits, focus } | null` (`null` = tasto non gestito); `isComplete(digits): boolean`.
- Produces (`js/otp-input.js`, classic script `defer`): `window.OtpInput`, componente Vue registrabile come `app.component('otp-input', window.OtpInput)`; props `modelValue: string`, `label: string`, `disabled: boolean`, `invalid: boolean`; emette `update:modelValue` (stringa di sole cifre) e `complete` (stringa di 6 cifre); metodo pubblico `focusFirst()`.

- [ ] **Step 1: `otp.test.js`**: `normalizeDigits('12a 3-4')` → `'1234'`, max 6; `applyInput` di `'5'` all'indice 2 → cifra in 2, focus 3; incolla `'123456'` all'indice 0 → tutte e sei, focus 5; incolla `'987'` all'indice 4 → riempie 4 e 5, ignora il resto; testo non numerico → digits invariati; `applyKey` Backspace su casella piena → la svuota, focus fermo; Backspace su vuota → svuota la precedente, focus −1; `ArrowLeft`/`ArrowRight` ai bordi restano in 0..5; `'Enter'` → `null`; `isComplete`.
- [ ] **Step 2:** `npx vitest run js/lib/otp.test.js` → FAIL.
- [ ] **Step 3: implementare** `otp.js`, poi il componente (Spec §4: `role="group"` con `aria-label` = `label`, ogni casella `aria-label="Digit n of 6"`, `inputmode="numeric"`, `autocomplete="one-time-code"` solo sulla prima, `maxlength` assente perché l'autofill incolla 6 cifre in una casella; con `invalid` classe `otp-box--invalid` finché non arriva un nuovo input) e `css/otp-input.css` (caselle 48×52, 54 di altezza sotto 576 px, spazio fra la 3 e la 4 più largo, focus con `--focus-ring`, invalid con i token danger, disabled con lo sfondo grigio di 15x).
- [ ] **Step 4:** `npx vitest run js/lib/otp.test.js` → PASS.
- [ ] **Step 5: commit** `feat(ui): reusable six-box code input`.

### Task 6: `login.html`, vista `code`

**Files:**
- Modify: `login.html`, `css/auth.css` (indicatore di passo, icona circolare, box di stato, vista locked), ogni `?v=` di `auth.css` (`login.html`, `activate.html`, `reset-password.html`)
- Boards: `15u`, `15v`, `15w`, `15x`, `15y`, `15z`, `15aa`, `15ag`, `15ah`, `15ai`, `15al` (tutte in `docs/superpowers/design/two-factor/redesign/`)

**Interfaces:**
- Consumes: HTTP di Task 3; `window.OtpInput`, `normalizeDigits` (Task 5).

- [ ] **Step 1: implementare** la vista di Spec §5.1-5.3 con il copy esatto della Spec. Stato in `data`: `twoStep`, `code`, `trust`, `codeState` (`'idle'|'wrong'|'resent'|'expired'|'sendError'|'locked'|'gone'`), `attemptsLeft`, `resendIn` (contatore a 1 s, `setInterval` fermato su `beforeUnmount` e al cambio di vista). Mappa risposte: 400 `WRONG_CODE` → `wrong`; 410 → `expired`; 423 → `locked`; 401 `NO_CHALLENGE` → `gone` (titolo `Sign-in expired`); 429 `COOLDOWN` → `resendIn = retryIn`; 502 `SEND_FAILED` → `sendError`; `Send a new code` chiama il resend; 429 `RATE_LIMITED` al login → `Too many attempts. Try again in {n} minutes.` (`n = Math.ceil(retryIn/60)`). Un errore di rete in qualunque chiamata → il box d'errore con `Network error. Please try again.` senza svuotare le caselle. `← Back to sign in` e **Back to sign in** chiamano `DELETE /api/auth/two-step` (fire-and-forget) e tornano a `login` con la password svuotata. La logo usa la variante compatta come `forgot`.
- [ ] **Step 2: caricare** `css/otp-input.css?v=1`, `js/lib/otp.js?v=1` (`type="module"`), `js/otp-input.js?v=1` (`defer`) prima dello script dell'app; bump di `auth.css` ovunque; `npx vitest run js/lib/foundations-guard.test.js` → PASS.
- [ ] **Step 3: confronto con le tavole.** Aprire ogni tavola della riga `Boards:` e confrontarla col markup; elencare gli scostamenti nel report del task (componenti del sito prima delle tavole, brief UI §0).
- [ ] **Step 4: commit** `feat(login): email code second step`.

### Task 7: `profile.html`, Two-step verification e Trusted devices

**Files:**
- Modify: `profile.html`, `css/profile.css`, `js/lib/profile-ui.js` (+ test), `js/lib/md-subnav.js` (+ `js/lib/md-subnav.test.js`), ogni `?v=` di `md-subnav.js` (7 pagine), `profile-ui.js`, `profile.css`
- Boards: `15c-twostep-email.png`, `15i-trusted-devices.png`, `15b-password.png` (solo la nota), `15ap-1-profile-tablet.png`, `15ap-2-profile-smartphone.png`

**Interfaces:**
- Consumes: `/me.two_step`, `GET/DELETE /api/auth/trusted-devices[/:id]` (Task 3).
- Produces: `PROFILE_SECTIONS = ['details','password','two-step','devices','privacy']`; `SUBNAV_SETS.profile` con il gruppo `SECURITY` (`two-step` → `#two-step`, `devices` → `#devices`) fra ACCOUNT e PRIVACY; `setSubnavChip(id, text)` in `md-subnav.js` (pill `.md-subnav-chip` con testo, rimossa se `text` è vuoto o `'0'`; nessun tag sul selettore del telefono); `deviceExpiry(expiresAt, now) → { text, soon }` in `profile-ui.js` (`soon` sotto i 10 giorni, testo `expires in {n} days` / `expires in 1 day` / `expires {D Mon YYYY}`).

- [ ] **Step 1: test**: `md-subnav.test.js` — il set `profile` ha i gruppi `['ACCOUNT','SECURITY','PRIVACY']` e gli href `#two-step`, `#devices`; `setSubnavChip('two-step','Email')` aggiunge una pill con testo `Email`; `setSubnavChip('devices','0')` la toglie. `profile-ui.test.js` — `sectionFromHash('#devices')` → `'devices'`; `deviceExpiry` con 3 giorni → `{soon:true, text:'expires in 3 days'}`, con 20 giorni → `{soon:false}` e la data.
- [ ] **Step 2:** `npx vitest run js/lib/md-subnav.test.js js/lib/profile-ui.test.js` → FAIL.
- [ ] **Step 3: implementare** le due sezioni di Spec §5.4-5.6 col copy esatto; **Remove all** con lo `showConfirm` condiviso (`Remove all trusted devices?` / `Every device will ask for a code at the next sign-in.` / `Remove all`); dopo un Remove del dispositivo corrente il chip `THIS DEVICE` sparisce con la riga; conteggio della sotto-navigazione aggiornato dopo ogni rimozione e dopo un cambio password riuscito.
- [ ] **Step 4:** test di step 1 → PASS; `npx vitest run js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS; grep dei `?v=` toccati: ogni riferimento con lo stesso numero.
- [ ] **Step 5: confronto con le tavole** della riga `Boards:`, scostamenti elencati nel report.
- [ ] **Step 6: commit** `feat(profile): two-step and trusted devices sections`.

### Task 8: login automatizzati

**Files:**
- Modify: `scripts/shoot.mjs`, `api/src/scripts/seed-planning-golden.js`, `.env.example`, `docs/scripts/shoot.md`

**Interfaces:**
- Consumes: `trust-device.js` (Task 3).

- [ ] **Step 1:** `shoot.mjs` legge il dispositivo da `--device`, `SHOOT_DEVICE` o `.env` (stesso `fromDotEnv`) e manda `Cookie: pdash_device=<v>` nel login; se la risposta ha `twoStep`, l'errore dice `login needs a trusted device: run docker exec pdash-api node src/trust-device.js <email> and set SHOOT_DEVICE`. `seed-planning-golden.js` fa lo stesso con `PDASH_DEVICE`. `.env.example` aggiunge `SHOOT_DEVICE=` commentato; `docs/scripts/shoot.md` documenta il passo nella sezione delle credenziali.
- [ ] **Step 2:** `node scripts/shoot.mjs --help` (o l'invocazione senza argomenti) non si rompe; `node --check api/src/scripts/seed-planning-golden.js`.
- [ ] **Step 3: commit** `feat(scripts): automated logins through a CLI-minted trusted device`.

### Task 9: verifica visiva (coordinatore, non un subagent)

**Boards:** tutte quelle della Spec.

- [ ] **Step 1:** dal worktree, `.env` copiato, `bash scripts/test-branch.sh up`; applicare `034` a mano al DB del branch (`docker exec -i <db del branch> psql -U pdash -d pdash -v ON_ERROR_STOP=1 < api/src/db/migrations/034_two_step_email.sql`) e riavviare **solo** l'api del branch (mai lo stack principale).
- [ ] **Step 2:** creare un dispositivo per l'account `SHOOT_EMAIL` sul branch (`docker exec <api del branch> node src/trust-device.js <email>`), più un secondo dispositivo via `trust-device.js` per avere due righe in Trusted devices.
- [ ] **Step 3:** `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000` su `/login.html` a 1440,1024,390 senza credenziali, con `--eval` che imposta la vista `code` e ciascuno stato (iniziale, wrong con `attemptsLeft: 3`, expired, locked, sendError); su `/profile.html#two-step` e `/profile.html#devices` a 1440,390 col dispositivo.
- [ ] **Step 4:** rileggere ogni PNG con Read, confrontarlo con la tavola, presentare gli scostamenti uno per uno con fix-ora / accetta-e-registra (§6.6.5) e aspettare la decisione; gli "accetta" vanno in `docs/pages/profile.md` e in un `docs/pages/login.md` solo se esiste già, altrimenti nel report.
- [ ] **Step 5:** lasciare lo stack del branch acceso: lo smonta solo il Gate 2 di `/finish-cycle`.

## Criteri di accettazione

Quelli della Spec, `## Criteri di accettazione`, voci 1-14.

## Decisioni aperte

1. **TS-16: due challenge dello stesso utente coesistono, uno per cookie.** Alternativa scartata: un nuovo login cancella i challenge precedenti dell'utente. Perché: chi apre il login su due schede non deve vedersi invalidare la prima; i tentativi restano 5 per challenge e gli invii restano limitati da `sendLimiter`.
2. **Il dispositivo corrente si riconosce rileggendo il cookie, senza salvarne l'id lato client.** Alternativa scartata: restituire l'id del dispositivo al verify e tenerlo in `localStorage`. Perché: `localStorage` non tiene dati del server (CLAUDE.md, "Data strategy").
3. **I test del flusso ottengono il codice dalla CLI d'emergenza dentro il container `test`.** Alternativa scartata: leggere l'email da un outbox di test. Perché: nessuna infrastruttura nuova, e la CLI viene provata dallo stesso run.
4. **La verifica visiva la fa il coordinatore sullo stack del branch, non un subagent.** Alternativa scartata: un task di screenshot delegato. Perché: richiede comandi Docker sullo stack del branch e il confronto va presentato all'utente (§6.6.3).
