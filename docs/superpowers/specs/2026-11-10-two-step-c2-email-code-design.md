# Two-step, ciclo 2: secondo passo del login via email — design spec

**Date:** 2026-11-10
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-09-two-step-c2-email-code-brief.md`
**Boards:** `docs/superpowers/design/two-factor/redesign/15c-twostep-email.png`, `15i-trusted-devices.png`, `15u-login-email-initial.png`, `15v-login-email-resent.png`, `15w-login-email-wrong-code.png`, `15x-login-email-expired.png`, `15y-login-verifying.png`, `15z-login-too-many-attempts.png`, `15aa-login-email-send-error.png`, `15ag-login-tablet.png`, `15ah-login-phone-email.png`, `15ai-login-phone-wrong-code.png`, `15al-login-phone-locked.png`
**Scenario:** 1 (nuova feature)

Dopo la password corretta il login chiede un codice di 6 cifre inviato all'email dell'account. Un dispositivo può
essere marcato fidato per 30 giorni. Il profilo mostra il metodo attivo e l'elenco dei dispositivi fidati. Ogni
percorso che cambia una credenziale o lo stato dell'account revoca challenge e dispositivi fidati. Dove la tavola
contraddice il sito vale il sito (brief UI §0).

## 1. Fatti e perimetro

### 1.1 Fatti verificati nel codice (a `5579929`)

- `POST /api/auth/login` (`api/src/routes/auth.js`) controlla password e stato e chiama subito `setAuthCookie`;
  `pdash_token` è un JWT stateless di 8 h, `requireAuth` non legge il DB.
- Le password si scrivono in `change-password`, `reset-password`, `activate` (`routes/auth.js`) e in
  `api/src/create-admin.js`, che non aggiorna `password_changed_at`. Email e stato si scrivono in `PATCH /api/users/:id`,
  `DELETE /api/users/:id` e `POST /api/users/:id/anonymize` (`routes/users.js`).
- `api/src/index.js` non imposta `trust proxy`: `req.ip` è l'indirizzo di nginx, che manda già `X-Forwarded-For`.
- Nessun rate limiting nell'API; nessuna dipendenza di rate limiting in `api/package.json`.
- Lo stack principale gira con `NODE_ENV=development` (default di `docker-compose.yml`).
- Login automatizzati con la sola password: `test-api.js` (container `test`, che monta `api/src` e ha
  `DATABASE_URL`), `scripts/shoot.mjs` (`SHOOT_EMAIL`/`SHOOT_PASSWORD`), `api/src/scripts/seed-planning-golden.js`.
- `login.html` ha le viste `login` e `forgot`, carica `css/tokens.css` e `css/auth.css`, non `style.css`.
- `profile.html` ha la sotto-navigazione `md-subnav` con `data-subnav-set="profile"` (gruppi da `js/lib/md-subnav.js`)
  e le sezioni Details, Password, Privacy; la nota sulle sessioni del Password è omessa (ciclo 1, decisione 8).
- `sendAdminNotificationEmail` (`api/src/services/email.js`) interpola senza escape (B-396); la route di rettifica
  pre-escapa il titolo, che finisce in chiaro nell'oggetto (B-400); `exports.js` spedisce a `req.user.email` (B-397);
  `POST /api/auth/invite` non applica `normalizeDetails`/`detailsError` (B-409).

### 1.2 Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 15u, 15y | §5.1 vista `code`, stato iniziale e verifica in corso |
| 15v | §5.1 stato "resent" |
| 15w, 15ai | §5.1 stato "wrong code" |
| 15x | §5.1 stato "expired" |
| 15z, 15al | §5.1 stato "locked" |
| 15aa | §5.1 stato "send error" |
| 15ag, 15ah | §5.3 responsive del login |
| 15c | §5.4 Two-step verification (senza la riga Authenticator) |
| 15i | §5.5 Trusted devices |

Le altre tavole della cartella sono fuori scope (Brief, "Scope escluso"). Ne vengono onorati due elementi: il chip
`THIS DEVICE` di 15h (riusato in 15i) e la nota del Password di 15b, riscritta in §5.6.

### 1.3 Elementi delle tavole omessi o cambiati

- 15c: la riga Authenticator app e il suo pulsante sono omessi; il sub dell'header perde "Choose how you get it.".
- 15i: la nota diventa `Changing your password removes all trusted devices.` (niente "or verification method": il
  metodo è uno solo).
- 15b: la nota del footer diventa `Updating your password removes trusted devices.` (niente "signs you out of other
  sessions": le sessioni JWT non si revocano, §3.4).
- Sotto-navigazione: Sessions e Notifications restano non rese (ciclo 1, decisione 9).

## 2. Dati — migration `034_two_step_email.sql`

Ri-eseguibile, ogni statement con guardia, in una transazione.

- `users.two_step_method TEXT NOT NULL DEFAULT 'email'`. Nessun `CHECK`: i valori ammessi stanno in
  `api/src/lib/two-step.js` (`TWO_STEP_METHODS = ['email']`).
- `login_challenges`: `id UUID PK`, `user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE`, `token_hash TEXT NOT
  NULL UNIQUE`, `method TEXT NOT NULL`, `code_hash TEXT NOT NULL`, `code_expires_at TIMESTAMPTZ NOT NULL`,
  `code_sent_at TIMESTAMPTZ` (NULL se l'invio è fallito), `attempts INT NOT NULL DEFAULT 0`, `sends INT NOT NULL
  DEFAULT 1`, `created_at`, `expires_at TIMESTAMPTZ NOT NULL`. Indice su `user_id`. Nessuna email salvata.
- `trusted_devices`: `id UUID PK`, `user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE`, `token_hash TEXT NOT
  NULL UNIQUE`, `label TEXT NOT NULL`, `kind TEXT NOT NULL` (`desktop`|`mobile`), `created_at`, `expires_at
  TIMESTAMPTZ NOT NULL`, `last_used_at TIMESTAMPTZ`. Indice su `user_id`. Né IP né user agent grezzo.
- I token dei cookie si salvano come sha256 (32 byte casuali, entropia piena). Il codice si salva come
  HMAC-SHA256(`JWT_SECRET`, `challengeId + ':' + code`).

## 3. Server

### 3.1 Regole pure — `api/src/lib/two-step.js` (`node:test`)

- Costanti: `CODE_TTL_MS` 10 min, `RESEND_COOLDOWN_MS` 60 s, `MAX_ATTEMPTS` 5, `CHALLENGE_TTL_MS` 30 min,
  `MAX_SENDS` 5 per challenge, `TRUST_DAYS` 30, `TWO_STEP_METHODS`.
- `generateCode()` (`crypto.randomInt`, 6 cifre con zeri iniziali), `hashCode(secret, challengeId, code)`,
  `hashToken(token)`.
- `verifyOutcome(challenge, now, matches)` → `{ result: 'ok' }` | `{ result: 'wrong', attemptsLeft }` |
  `{ result: 'expired' }` | `{ result: 'locked' }`. Gli attempts contano per challenge: un reinvio non li azzera.
- `resendWait(challenge, now)` → millisecondi residui di cooldown (0 se si può), oppure `'exhausted'` oltre `MAX_SENDS`.
- `maskEmail('fabrizio@eversana.com')` → `f•••@eversana.com`.
- `deviceLabel(ua)` → `{ label: 'Chrome on Windows', kind: 'desktop' }`; browser Edge, Chrome, Firefox, Safari, Opera;
  sistemi Windows, macOS, iPhone, iPad, Android, Linux; fallback `Unknown browser` / `Unknown device`.
- `deviceTrusted(device, user, now)`: stesso `user_id`, non scaduto, `created_at > password_changed_at` (o
  `password_changed_at` NULL).

### 3.2 Rate limiting — `api/src/lib/rate-limit.js` (`node:test`)

Limiter a finestra fissa in memoria, nessuna dipendenza: `createLimiter({ windowMs, max })` → `hit(key, now)` →
`{ allowed, retryInMs }`, con pulizia delle chiavi scadute. `app.set('trust proxy', 1)` in `index.js`. Limiti:

- `POST /api/auth/login`: i soli tentativi falliti (password errata o email sconosciuta), 30 per IP e 10 per email in
  15 min; un login riuscito non conta. Oltre il limite si risponde 429 anche alla password giusta.
- Invii del codice (login che crea un challenge, resend): 10 per utente all'ora.

Oltre il limite: `429 { error, code: 'RATE_LIMITED', retryIn }` (secondi). I contatori si perdono al riavvio.

### 3.3 Route

In `api/src/routes/auth.js`, con la logica dei challenge in `api/src/services/two-step.js`.

- **`POST /api/auth/login`**, dopo i controlli di oggi:
  - cookie `pdash_device` valido per l'utente (`deviceTrusted`) → aggiorna `last_used_at`, `setAuthCookie`, risposta
    di oggi;
  - altrimenti: purge dei challenge e dispositivi scaduti, nuovo challenge, invio di `sendLoginCode`, cookie
    `pdash_challenge` (httpOnly, `sameSite: 'strict'`, `secure` in produzione, path `/api/auth`, 30 min) e
    `200 { twoStep: { method, destination, expiresIn, resendIn, sendFailed } }` senza `pdash_token`. Se l'invio fallisce
    il challenge resta, `code_sent_at` è NULL, `sendFailed: true`, `resendIn: 0`.
- **`POST /api/auth/two-step/verify { code, trustDevice }`**: legge il challenge dal cookie (assente o scaduto →
  `401 { code: 'NO_CHALLENGE' }`); utente assente o non `active` → challenge cancellato e `401 NO_CHALLENGE`. Il
  tentativo si conta con `UPDATE … SET attempts = attempts + 1 WHERE id = $1 AND attempts < 5 RETURNING attempts`
  (nessuna riga → `423 LOCKED`). Esiti:
  - ok → challenge cancellato, cookie `pdash_challenge` rimosso, `setAuthCookie`; con `trustDevice` nuovo
    `trusted_devices` e cookie `pdash_device` (httpOnly, `sameSite: 'lax'`, `secure` in produzione, path `/api/auth`,
    30 giorni). Risposta come il login di oggi.
  - `400 { code: 'WRONG_CODE', attemptsLeft }`; al quinto errore `423 { code: 'LOCKED' }` e challenge cancellato.
  - `410 { code: 'CODE_EXPIRED' }`.
  - Un codice non di 6 cifre → `400 { code: 'WRONG_CODE', … }`, contato come tentativo.
- **`POST /api/auth/two-step/resend`**: senza challenge `401 NO_CHALLENGE`; in cooldown `429 { code: 'COOLDOWN',
  retryIn }`; oltre `MAX_SENDS` `429 { code: 'RATE_LIMITED' }`; altrimenti nuovo codice (il precedente smette di
  valere), `sends + 1`, nuova scadenza di 10 min. Invio fallito → `502 { code: 'SEND_FAILED' }`, codice nuovo comunque
  salvato.
- **`DELETE /api/auth/two-step`**: cancella il challenge del cookie e il cookie. Sempre `200`.
- **`GET /api/auth/me`** aggiunge `two_step: { method, destination }` (`destination` = `maskEmail`).
- **`GET /api/auth/trusted-devices`** (`requireAuth`): `[{ id, label, kind, created_at, expires_at, current }]`, solo
  non scaduti, `current` dal confronto con l'hash del cookie.
- **`DELETE /api/auth/trusted-devices/:id`** (UUID validato, solo dell'utente, altrimenti 404) e **`DELETE
  /api/auth/trusted-devices`** (tutti); se è coinvolto il dispositivo corrente il cookie viene rimosso.
- **`POST /api/auth/logout`**: rimuove anche un eventuale `pdash_challenge`; `pdash_device` resta.

### 3.4 Revoca: chi conserva ancora una credenziale o una copia dei dati

`revokeTwoStepState(userId, { db })` in `api/src/services/two-step.js` cancella challenge e dispositivi fidati
dell'utente. Si chiama da ogni percorso sotto, nella stessa transazione della scrittura quando la route ne ha una.

| Evento | Challenge | Dispositivi fidati | JWT `pdash_token` |
|---|---|---|---|
| `change-password` | cancellati | cancellati, cookie corrente rimosso | invariato |
| `reset-password` | cancellati | cancellati | invariato |
| `activate` | cancellati | cancellati | — |
| `create-admin.js` (reset) | cancellati | cancellati; imposta `password_changed_at` | — |
| `PATCH /api/users/:id` con email diversa | cancellati | cancellati | invariato (B-397 risolto per gli export) |
| `PATCH /api/users/:id` con `status: 'disabled'`, `DELETE /api/users/:id` | cancellati | cancellati | invariato |
| anonymize | cancellati | cancellati | invariato |
| cancellazione dell'utente (`reset.js`) | cascade | cascade | — |
| verify ok / lock | quel challenge cancellato | — | — |
| scadenza | purge a ogni nuovo challenge | purge a ogni nuovo challenge | — |

Seconda difesa: al login un dispositivo vale solo se `created_at > password_changed_at` (§3.1), così un percorso
dimenticato che cambia la password non riapre un dispositivo fidato. Il JWT resta valido fino a 8 h dopo disable,
anonymize o cambio password: la revoca delle sessioni è fuori scope (§7) e va in `docs/BACKLOG.md`.

**Guard:** `api/src/lib/credential-revocation-guard.test.js` (`node:test`, senza DB) legge i file `.js` sotto
`api/src` (test esclusi) e fallisce se un file che contiene una scrittura SQL su `users` di `password_hash`, `email`,
`status = 'disabled'` o `status = $` non contiene anche `revokeTwoStepState(`. Il limite (granularità di file, non di
statement) è dichiarato nell'intestazione del guard.

### 3.5 Email

- `sendLoginCode({ to, firstName, code })`: oggetto `PDash — Your sign-in code`, corpo con il codice, la scadenza di 10
  minuti e "If you didn't try to sign in, change your password.".
- Ogni valore interpolato nell'HTML di `email.js` passa da `escapeHtml` dentro il mailer, oggetto escluso (B-396); la
  route di rettifica smette di pre-escapare (B-400).
- `exports.js` legge l'email del destinatario da `users` per `req.user.id` (B-397).
- `POST /api/auth/invite` applica `normalizeDetails`/`detailsError` (B-409).

### 3.6 CLI

- **`api/src/trust-device.js <email> [--days N]`**: crea un dispositivo fidato `Automation (CLI)`, `desktop`, e stampa
  il valore del cookie `pdash_device`. Rifiuta un utente non `active`.
- **`api/src/two-step-code.js <email>`**: sul challenge aperto più recente dell'utente genera un codice nuovo con
  scadenza di 10 min e lo stampa; senza challenge aperto esce con errore e lo dice. La password resta necessaria.
- `docker-compose.yml`, servizio `test`: riceve `JWT_SECRET`; dopo `create-admin.js` esegue `trust-device.js` per i due
  account di test ed esporta i valori in `TEST_ADMIN_DEVICE`/`TEST_SYSADMIN_DEVICE`. `test-api.js` li manda al login; i
  test `TS-*` fanno login senza cookie di dispositivo e ottengono il codice da `two-step-code.js`.
- `scripts/shoot.mjs` legge `SHOOT_DEVICE` (`.env`, env o `--device`) e lo manda come cookie al login;
  `seed-planning-golden.js` legge `PDASH_DEVICE`. `.env.example` documenta `SHOOT_DEVICE`.

### 3.7 Rollout

Obbligatorio per tutti dal merge, senza interruttore. Dopo il merge sullo stack principale serve
`trust-device.js` per l'account `SHOOT_EMAIL` (lo dice `docs/scripts/shoot.md`); senza, `shoot.mjs` fallisce con "no
pdash_token".

## 4. Componente del codice

- `js/lib/otp.js` (ES module + bridge `window`, vitest): `normalizeDigits(text)` (solo cifre, max 6), `applyInput(digits,
  index, text)` → `{ digits, focus }` (digitazione e incolla/autofill da qualunque casella), `applyKey(digits, index,
  key)` (Backspace su casella vuota torna indietro, frecce si spostano), `isComplete(digits)`.
- `js/otp-input.js`: componente Vue globale `window.OtpInput` (come `js/cg-controls.js`). Props `label`, `disabled`,
  `invalid`; emette `update:modelValue` e `complete`. Sei `input` con `inputmode="numeric"`, `aria-label="Digit n of
  6"`, `autocomplete="one-time-code"` solo sul primo, `role="group"` con `aria-label`, spazio più largo fra 3 e 4.
  Con `invalid` le caselle sono rosse e tengono le cifre fino alla prossima digitazione.
- `css/otp-input.css`: caselle 48×52 (54 di altezza sotto 576 px), solo token.

## 5. Frontend

### 5.1 `login.html`, vista `code` (15u–15aa)

- Si apre quando `/api/auth/login` risponde con `twoStep`; la vista dipende da `twoStep.method` (oggi solo `email`, un
  metodo sconosciuto mostra un errore generico e torna al sign-in).
- Indicatore `✓ Password — 2 Verification`, icona mail in un cerchio di 44 px, titolo `Check your email`, testo `We
  sent a 6-digit code to <strong>{destination}</strong>. It expires in 10 minutes.`
- Label `Code from email`, `<otp-input>`, checkbox `Trust this device for 30 days`, **Verify** a tutta larghezza
  (pallido finché incompleto, spinner e `Verifying…` in corso), invio automatico alla sesta cifra.
- `Resend code` oppure `Resend in {s} s` (`aria-live="polite"`), `← Back to sign in` (chiama `DELETE
  /api/auth/two-step`).
- Stati, in un box `role="alert"` sopra l'input:
  - wrong code: `Incorrect code. {n} attempts left.` (`1 attempt left.` al singolare), caselle rosse;
  - resent (verde): `A new code has been sent. Use the latest one: earlier codes no longer work.`, cooldown riparte;
  - expired: `This code has expired. Send a new one to continue.`, caselle disabilitate, primario `Send a new code`;
  - send error (`sendFailed` o `SEND_FAILED`): `We couldn't send the email. Check your connection and try again.`,
    primario `Send a new code`;
  - locked (o `NO_CHALLENGE`): la card mostra solo il lucchetto rosso, `Too many attempts`, `For your security we
    stopped this sign-in. Sign in again with your password to get a new code.` e **Back to sign in**
    (per `NO_CHALLENGE` il titolo è `Sign-in expired` e il testo `Sign in again with your password to get a new
    code.`);
  - rate limited: `Too many attempts. Try again in {n} minutes.` nel box d'errore del sign-in.
- Dopo il codice corretto: `window.location.href = '/'` come oggi (il gate T&C resta in `nav.js`).
- `login.html` carica `css/otp-input.css`, `js/lib/otp.js`, `js/otp-input.js` con `?v=1`.

### 5.2 Accessibilità del login

Focus sulla prima casella all'apertura della vista e dopo un errore; il box d'errore è `role="alert"`; le caselle non
si svuotano mai senza un messaggio.

### 5.3 Responsive del login (15ag, 15ah, 15ai, 15al)

La stessa `auth-card`, 16 px di margine sotto 576 px, target ≥ 44 px, input sopra la piega a 390×844.

### 5.4 `profile.html`, Two-step verification (15c)

- Hash `#two-step`, voce SECURITY → `Two-step verification` con chip `Email` in `md-subnav` (set `profile`).
- Card: titolo `Two-step verification`, sub `After your password, PDash asks for a 6-digit code.`, una riga-metodo
  (tile 36 px con icona mail, `Email code`, chip verde `Active` con pallino, testo `Codes are sent to {destination} and
  expire after 10 minutes.`). La lista è un `v-for` su un array di righe, così le righe future si aggiungono.

### 5.5 `profile.html`, Trusted devices (15i)

- Hash `#devices`, voce `Trusted devices` con il conteggio reale.
- Titolo `Trusted devices`, sub `These devices skip the verification code until trust expires. Remove any device you
  no longer use.`
- Righe: icona laptop o telefono da `kind`, `label`, chip `THIS DEVICE` sul corrente, `Trusted on {date} · expires
  {date}` (ambra, `expires in {n} days`, sotto i 10 giorni), **Remove** outline con spinner di riga.
- Footer: `Changing your password removes all trusted devices.` e **Remove all** (solo con 2 o più), con il confirm
  condiviso.
- Stato vuoto: `No trusted devices` / `Check "Trust this device for 30 days" when you sign in to skip the code on that
  device.`
- Errore di caricamento o di rimozione: `.pd-banner` di errore.

### 5.6 `profile.html`, Password

Nota del footer: `Updating your password removes trusted devices.` Dopo un cambio riuscito il conteggio dei
dispositivi si ricarica.

### 5.7 Vincoli trasversali

Componenti del sito prima delle tavole, niente hex, testo in inglese, `?v=N` aggiornati in ogni riferimento a un file
toccato, `md-subnav.js` aggiornato con i test che lo pinnano.

## 6. Test e verifica

- `node:test`: `two-step.test.js`, `rate-limit.test.js`, `credential-revocation-guard.test.js`.
- vitest: `js/lib/otp.test.js`; il test di `md-subnav` per i gruppi nuovi.
- `test-api.js`, blocco `TS-*`: login senza dispositivo → `twoStep` e nessun `pdash_token`; `/me` senza sessione → 401;
  codice errato → `attemptsLeft` 4; quinto errore → 423 e challenge cancellato; resend in cooldown → 429; resend dopo
  il cooldown (forzato via DB) invalida il codice vecchio; codice scaduto (via DB) → 410; codice giusto → sessione;
  `trustDevice` → cookie e login successivo senza codice; `change-password` revoca i dispositivi; email cambiata da
  admin, disable e anonymize cancellano challenge e dispositivi; `GET/DELETE /trusted-devices` con `current`; login
  oltre il limite → 429.
- Screenshot con `scripts/shoot.mjs` dallo stack del branch (`--base http://localhost:8081`, `--settle 3000`): login a
  1440, 1024 e 390 negli stati iniziale, wrong code, expired, locked, send error; profilo, sezioni Two-step e Trusted
  devices (con almeno due dispositivi, uno corrente), a 1440 e 390. I PNG si rileggono e si confrontano con le tavole,
  uno scostamento alla volta.

## Criteri di accettazione

1. **Secondo passo obbligatorio** — un login con la password giusta e senza dispositivo fidato non imposta
   `pdash_token` e mostra la vista `Check your email` con l'email mascherata (`test-api.js` TS, verifica nel browser).
2. **Codice** — il codice ricevuto per email apre la sessione; dopo il gate T&C si arriva alla pipeline come oggi.
3. **Tentativi** — un codice errato mostra `Incorrect code. 4 attempts left.`; al quinto errore compare `Too many
   attempts` e serve di nuovo la password (`test-api.js` TS).
4. **Scadenza** — un codice oltre i 10 minuti risponde 410 e la vista offre `Send a new code` (`test-api.js` TS).
5. **Reinvio** — durante i 60 s compare `Resend in {s} s`; dopo, `Resend code` manda un codice nuovo e il precedente
   non vale più (`test-api.js` TS).
6. **Errore di invio** — con l'SMTP non raggiungibile la vista mostra `We couldn't send the email…` e `Send a new
   code`.
7. **Input a sei caselle** — incolla di 6 cifre riempie tutte le caselle e invia; Backspace e frecce si muovono
   (`js/lib/otp.test.js`, verifica nel browser).
8. **Dispositivo fidato** — con `Trust this device for 30 days` il login successivo dallo stesso browser non chiede il
   codice; la sezione Trusted devices lo elenca con `THIS DEVICE`; Remove e Remove all lo tolgono e il login successivo
   chiede di nuovo il codice (`test-api.js` TS).
9. **Revoca** — cambio password, reset password, email cambiata da admin, disable e anonymize cancellano challenge e
   dispositivi fidati dell'utente (`test-api.js` TS, `credential-revocation-guard.test.js`).
10. **Profilo** — la sezione Two-step verification mostra la sola riga `Email code · Active` con l'email mascherata;
    la sotto-navigazione ha il chip `Email` e il conteggio dei dispositivi.
11. **Rate limiting** — oltre il limite il login risponde 429 con `retryIn` (`rate-limit.test.js`, `test-api.js` TS).
12. **CLI** — `trust-device.js` stampa un cookie con cui `shoot.mjs` entra senza codice; `two-step-code.js` stampa un
    codice valido per il challenge aperto.
13. **Follow-up assorbiti** — l'oggetto dell'email di rettifica non contiene entità HTML e il corpo di
    `sendAdminNotificationEmail` è escapato (B-396, B-400); gli export vanno all'email in DB (B-397); l'invite rifiuta
    un nome oltre 100 caratteri e l'indirizzo `anon_…@deleted.local` con 400 (B-409).
14. **Responsive** — login a 1024 e 390 e profilo a 390 corrispondono alle tavole 15ag, 15ah, 15ai, 15al (screenshot
    del Piano).

## Scope escluso esplicitamente

- Authenticator app, recovery code, wizard, ri-autenticazione, switch back, regenerate, reset da admin, badge 2FA in
  User Admin, setup forzato per ruolo, passkey.
- Sessions (compresa la revoca dei JWT dopo disable, anonymize o cambio password), Notifications, Download my data,
  email di avviso di sicurezza.
- B-401 (throttle della rettifica) e gli altri follow-up del ciclo 1 non elencati in §3.5.

## Decisioni aperte

1. **Challenge in DB con cookie opaco.** Alternativa scartata: cookie JWT firmato di "mezza sessione". Perché: tentativi e revoca devono stare sul server; un token stateless non si revoca su cambio email o anonymize.
2. **`two_step_method` colonna su `users`, senza `CHECK`.** Alternativa scartata: tabella `user_two_step` o un
   `CHECK (method IN ('email'))`. Perché: ogni utente ha un metodo, e il `CHECK` imporrebbe una migration per
   l'authenticator.
3. **Codice come HMAC con `JWT_SECRET`.** Alternativa scartata: bcrypt o sha256 semplice. Perché: bcrypt è lento per
   tentativo, sei cifre in sha256 si invertono; il pepper non richiede configurazione nuova.
4. **Tentativi per challenge, non azzerati dal reinvio.** Alternativa scartata: 5 tentativi per codice. Perché: altrimenti ogni reinvio regala 5 tentativi.
5. **Rate limiter in processo, senza dipendenze.** Alternativa scartata: `express-rate-limit` o una tabella in DB.
   Perché: l'API è un solo processo; perdere i contatori al riavvio è accettabile.
6. **Login automatizzati con un dispositivo fidato emesso da CLI, test del codice con la CLI d'emergenza.** Alternativa scartata: `TWO_STEP_TEST_CODE` o un bypass su `NODE_ENV`. Perché: lo stack principale gira in `development`, un
   bypass a env si accenderebbe dove non deve.
7. **Obbligatorio dal merge, senza interruttore.** Alternativa scartata: `TWO_STEP_ENABLED`. Perché: un'env che spegne
   un controllo di sicurezza è un rischio, e la CLI copre il lockout.
8. **Etichetta del dispositivo da un parser interno, salvate solo etichetta e `kind`.** Alternativa scartata: `ua-parser-js`, o user agent e IP in DB. Perché: minimizzazione dei dati, anonymize con meno da cancellare.
9. **Un solo `revokeTwoStepState`, un guard e il controllo `created_at > password_changed_at`.** Alternativa scartata: DELETE inline in ogni route. Perché: è la classe dei 3 round del Gate 3 del ciclo 1.
10. **Revoca dei JWT fuori scope, in backlog.** Alternativa scartata: controllo in DB in `requireAuth`. Perché: è
    Sessions, escluso dal Brief, e tocca ogni route.
11. **B-396, B-400, B-397, B-409 assorbiti nel ciclo.** Alternativa scartata: lasciarli in backlog. Perché: sono la
    classe email/credenziali indicata dall'utente e costano poche righe; B-401 resta fuori.
12. **Copy adattata al vero** (sub di 15c, note di 15b e 15i). Alternativa scartata: copy delle tavole. Perché: oggi
    sarebbe falsa (stesso principio della decisione 8 del ciclo 1).
13. **Screenshot automatici nel Piano**, con gli stati e le larghezze di §6. Alternativa scartata: la sola verifica
    del Gate 2. Perché: 13 tavole su tre larghezze.
14. **Il limiter del login conta i soli tentativi falliti, 30 per IP e 10 per email.** Alternativa scartata: ogni
    tentativo, 20 per IP. Perché: `test-api.js` e un ufficio dietro un solo NAT fanno molti login riusciti dallo stesso
    IP; il bersaglio è l'indovinare la password.
