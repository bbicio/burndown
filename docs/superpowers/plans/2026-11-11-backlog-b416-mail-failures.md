# Backlog, B-416 + B-432: email fallite e posta dei test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-11-backlog-b416-mail-failures-design.md`
**Branch:** `backlog-b416-mail-failures`
**Risk class:** standard — risposte all'errore di posta e infrastruttura di test; nessun cambio di autenticazione o permessi

**Goal:** gli stack di prova mandano la posta a Mailpit; una mail che non parte non diventa più un 500 su un'azione già registrata.

**Architecture:** un servizio `mailpit` aggiunto solo dagli override di `scripts/run-tests.sh` e `scripts/test-branch.sh`; sette route che catturano l'errore di invio (`api/src/routes/cost-grids.js`, `projects.js`, `config.js`, `auth.js`, `exports.js`); due messaggi nel frontend (`js/shares.js`, `admin.html`); una sezione nuova di `test-api.js` (MAIL-01..MAIL-08). Nessuna migrazione, nessuna route nuova.

**Tech Stack:** Docker Compose (override), Mailpit, Node/Express, `test-api.js` via `scripts/run-tests.sh`, vitest.

**Indipendenza dei task:** Task 1 apre MAIL-01..MAIL-08 e richiede l'infrastruttura del Task 2 per girare; i Task 3-5 chiudono MAIL-02..MAIL-08; Task 6 consuma i campi `emailSent` dei Task 3-4.

## Global Constraints

- Testo per l'utente in inglese, con le stringhe fissate dalla Spec §3-§4.
- Docker sullo stack principale: mai `docker compose down/up/restart`, mai `-v`. I test d'integrazione girano solo con `bash scripts/run-tests.sh`. `scripts/test-branch.sh up` non si lancia durante i task: lo stack di branch con Mailpit si prova al Gate 2 di `/finish-cycle`, e mai sopra il branch stack di un'altra sessione (porte fisse condivise).
- `docker-compose.yml` non cambia: Mailpit vive solo negli override generati.
- Worktree come dice `PROCESS.md` §6.1b (`git worktree add .claude/worktrees/backlog-b416-mail-failures -b backlog-b416-mail-failures`, poi verificare il branch); copiare `.env` dal checkout principale; `npm ci` nella root e in `api/` una volta, prima del Task 1.
- `scripts/run-tests.sh` solo dove il Piano lo dice: Task 2 (rosso di MAIL-02..MAIL-08, verde di MAIL-01/TS-26/PY-13). Il verde completo è quello del Gate 1 di `/finish-cycle`.
- Ogni file `js/*.js` toccato: tutti i riferimenti `?v=N` salgono insieme (`grep -rn "js/shares.js?v=" --include=*.html .`).
- Un difetto nuovo trovato strada facendo va in `docs/BACKLOG.md`, non si corregge qui.
- Codice con `\` scritto solo con Edit/Write, mai via `node -e`/shell.

## Review Focus

1. **Nessun percorso dallo stack principale a Mailpit:** `SMTP_HOST: mailpit` compare solo negli override generati, mai in `docker-compose.yml` o in `.env` (Task 2).
2. **La scrittura resta:** dove la risposta è `emailSent: false`, la riga (`resource_shares`, l'utente `pending`) esiste e la notifica in-app è creata comunque (Task 3-4).
3. **Il chaos si spegne sempre:** un'eccezione dentro la sezione MAIL non deve lasciare Mailpit in modalità rifiuto per il resto della suite (Task 1, `finally`).
4. **Il 502 degli export non crea la notifica "Your export is ready"**, e il `forgot-password` non distingue un indirizzo esistente da uno inesistente (Task 4-5).

---

### Task 1: MAIL-01..MAIL-08 in `test-api.js`

**Files:**
- Modify: `test-api.js` (nuova `testMailFailures()` chiamata in `main()` dopo `testPlanningAssistant()`)

**Interfaces:**
- Consumes: `api`, `sql`, `later`, `makeTsUser`, `loginWithCode`, `adminCookie`, `sysadminCookie`, `process.env.MAILPIT_URL`.
- Produces: le etichette MAIL-01..MAIL-08 chiuse dai Task 2-5.

- [ ] **Step 1: scrivere la sezione.** Helper `mailpit(method, path, body)` su `process.env.MAILPIT_URL` (senza la variabile: un solo `fail('MAILPIT_URL unset …')` e la sezione si ferma). `chaos(on)` → `PUT /api/v1/chaos` con `{ Recipient: { ErrorCode: on ? 451 : 0, Probability: on ? 100 : 0 } }`.
  - `MAIL-01` (chaos spento): `DELETE /api/v1/messages`, `POST /api/exports/portfolio` (admin) → 200; `GET /api/v1/messages` → una mail con `To[0].Address === EMAIL`.
  - Chaos acceso in un `try`, spento nel `finally`:
  - `MAIL-02` condivisione di una cost grid creata dal sysadmin con un utente da `makeTsUser` → `201`, `emailSent === false`, riga in `resource_shares`.
  - `MAIL-03` condivisione di un progetto (creato dal sysadmin con `cgVersionId` di una versione di cost grid, come fa `testProjectCurrencyLock`) → `201`, `emailSent === false`, riga in `resource_shares`.
  - `MAIL-04` `POST /api/programs/:id/share` su un programma con quel progetto → `201`, `emailSent === false`.
  - `MAIL-05` `POST /api/auth/invite` (admin) con un indirizzo nuovo → `201`, `emailSent === false`, utente `pending` presente.
  - `MAIL-06` `POST /api/auth/:id/resend-invite` su quell'utente → `502`, `code === 'SEND_FAILED'`.
  - `MAIL-07` `POST /api/exports/portfolio` → `502`, `code === 'SEND_FAILED'`.
  - `MAIL-08` `POST /api/auth/forgot-password { email: EMAIL }` → `200`.
  - Registrare in `later` le pulizie dei fixture (utenti, cost grid, progetto, programma).
- [ ] **Step 2: sintassi** — `node --check test-api.js` → nessun errore.
- [ ] **Step 3: commit** — `git commit -m "test(api): MAIL-01..MAIL-08 mail to Mailpit, responses when SMTP refuses (red)"`

### Task 2: Mailpit negli override

**Files:**
- Modify: `scripts/run-tests.sh` (`write_override`), `scripts/test-branch.sh` (`write_override`)

- [ ] **Step 1: verificare il chaos sull'immagine fissata.** Run: `docker run --rm -d --name pdash-mailpit-probe -e MP_ENABLE_CHAOS=true axllent/mailpit:<versione>` poi `docker exec pdash-mailpit-probe wget -qO- --method=PUT --body-data='{"Recipient":{"ErrorCode":451,"Probability":100}}' --header='Content-Type: application/json' http://localhost:8025/api/v1/chaos` e `docker rm -f pdash-mailpit-probe`. Expected: JSON con `Recipient.ErrorCode` 451. Se l'endpoint non esiste: si applica il ripiego della Spec §5 (`node:test` con `services/email` finto) e lo si annota nel ledger.
- [ ] **Step 2: `run-tests.sh`.** Nell'override: servizio `mailpit` (immagine fissata, `container_name: pdash-mailpit-test`, `environment: MP_ENABLE_CHAOS: "true", MP_SMTP_AUTH_ACCEPT_ANY: "1", MP_SMTP_AUTH_ALLOW_INSECURE: "1"`, nessuna porta); in `api`: `SMTP_HOST: mailpit`, `SMTP_PORT: "1025"`, `depends_on: { mailpit: { condition: service_started } }`; in `test`: `MAILPIT_URL: http://mailpit:8025`.
- [ ] **Step 3: `test-branch.sh`.** Nell'override: servizio `mailpit` (stessa immagine, `container_name: pdash-mailpit-${SANITIZED}`, stesse variabili d'auth, `MP_ENABLE_CHAOS: "true"`, `ports: ["${MAIL_PORT}:8025"]`, `MAIL_PORT="${TEST_BRANCH_MAIL_PORT:-8083}"`); in `api`: `SMTP_HOST`, `SMTP_PORT`, `depends_on` come sopra, uniti all'`environment` già scritto per `ANTHROPIC_API_KEY`. Il messaggio finale di `up` stampa anche `Mail (Mailpit): http://localhost:${MAIL_PORT}`.
- [ ] **Step 4: verificare.** `grep -n "mailpit" docker-compose.yml` → nessuna riga. Run: `bash scripts/run-tests.sh`. Expected: MAIL-01, TS-26, PY-13 verdi; MAIL-02..MAIL-08 rossi (500, o 200 senza `emailSent`); tutto il resto verde. Annotare l'elenco esatto dei rossi nel messaggio di commit.
- [ ] **Step 5: commit** — `git commit -m "test: stack mail goes to Mailpit in run-tests.sh and test-branch.sh (B-416)"`

### Task 3: condivisioni con `emailSent`

**Files:**
- Modify: `api/src/routes/cost-grids.js`, `api/src/routes/projects.js`, `api/src/routes/config.js`

- [ ] **Step 1: implementare.** In ciascuna delle tre route: `let emailSent = true; try { await sendShareNotification(...) } catch (e) { emailSent = false; console.warn('[share] email send failed:', e.message); }`; la notifica in-app resta dopo, come oggi; la risposta aggiunge `emailSent`.
- [ ] **Step 2: verifica locale** — `cd api && node -e "require('./src/routes/cost-grids'); require('./src/routes/projects'); require('./src/routes/config')"` → nessun errore. MAIL-02..MAIL-04 si osservano verdi al Gate 1.
- [ ] **Step 3: commit** — `git commit -m "fix(shares): a refused share email no longer answers 500 (B-416, B-432)"`

### Task 4: invito, nuovo invito, reset

**Files:**
- Modify: `api/src/routes/auth.js`

- [ ] **Step 1: implementare.** `invite`: `sendInvite` in `try/catch` → `201 { id, emailSent }`. `resend-invite`: `catch` → `502 { error: 'The email could not be sent', code: 'SEND_FAILED' }`. `forgot-password`: `sendPasswordReset` in `try/catch` con `console.warn`, risposta `200 { ok: true }` sempre.
- [ ] **Step 2: verifica locale** — `cd api && node -e "require('./src/routes/auth')" && node --test src/routes/auth.test.js` → PASS.
- [ ] **Step 3: commit** — `git commit -m "fix(auth): invite, resend-invite and forgot-password answer a refused email without a 500 (B-432)"`

### Task 5: export

**Files:**
- Modify: `api/src/routes/exports.js`

- [ ] **Step 1: implementare.** Nelle tre route: `sendExportEmail` in `try/catch`; nel `catch` `console.warn` e `return res.status(502).json({ error: 'The email could not be sent', code: 'SEND_FAILED' })`, prima della notifica "Your export is ready".
- [ ] **Step 2: verifica locale** — `cd api && node -e "require('./src/routes/exports')"` → nessun errore.
- [ ] **Step 3: commit** — `git commit -m "fix(exports): a refused export email answers 502 SEND_FAILED (B-416)"`

### Task 6: messaggi nel frontend

**Files:**
- Modify: `js/shares.js`, `admin.html`, ogni `.html` che carica `js/shares.js` (solo il `?v=N`)

- [ ] **Step 1: implementare.** `js/shares.js`: con `emailSent === false` i due messaggi di successo diventano quelli della Spec §4. `admin.html`: con `data.emailSent === false` il riquadro dell'invito mostra `Invite created for X, but the email could not be sent — use Resend invite.`
- [ ] **Step 2: cache-busting.** `grep -rn "js/shares.js?v=" --include=*.html .` → tutti i riferimenti allo stesso nuovo `N`.
- [ ] **Step 3: verifica** — `npm test` → verde (i guard di pagina e di `?v=` inclusi).
- [ ] **Step 4: commit** — `git commit -m "feat(ui): share modal and invite drawer say when the email could not be sent (B-416, B-432)"`

### Task 7: documenti

**Files:**
- Modify: `docs/scripts/run-tests.md`, `docs/scripts/test-branch.md`, `ARCHITECTURE.md` (§5, le righe delle sette route), `CLAUDE.md` (riga di `scripts/test-branch.sh`, solo se cita le porte)

- [ ] **Step 1: scrivere.** `run-tests.md`: la posta va a Mailpit, chaos abilitato, `MAILPIT_URL` nel container `test`. `test-branch.md`: Mailpit, porta 8083 (`TEST_BRANCH_MAIL_PORT`), dove leggere i codici al Gate 2. `ARCHITECTURE.md` §5: le risposte della Spec §3.
- [ ] **Step 2: guard** — `npx vitest run scripts/ js/lib/test-cases-parse.test.js` → PASS.
- [ ] **Step 3: commit** — `git commit -m "docs: Mailpit in the test stacks; responses when the email is refused"`

Dopo l'ultimo task: `npm test` e `cd api && npm test` → verdi.

## Decisioni aperte

1. **Mailpit attivato con `depends_on` nell'override dell'API, senza cambiare i comandi `up` degli script.** Alternativa scartata: un `up -d mailpit` esplicito in ciascuno script. Perché: un solo punto per script (l'override), e Compose avvia Mailpit insieme all'API in ogni ramo di `test-branch.sh`.
2. **Un solo `run-tests.sh` nel Piano (Task 2), il verde completo al Gate 1.** Alternativa scartata: un run anche dopo i Task 3-5. Perché: §6.2 limita i run, il Gate 1 lo esegue comunque sullo stesso HEAD, e il rosso di MAIL-02..MAIL-08 è osservato al Task 2.
3. **La verifica del chaos è il primo step del Task 2, con un container usa e getta.** Alternativa scartata: fidarsi della documentazione di Mailpit. Perché: tutta la prova di (a) dipende da quell'endpoint, e il ripiego è deciso prima di scrivere codice.
4. **Le fixture di MAIL-03/MAIL-04 create dal sysadmin con un `cgVersionId`.** Alternativa scartata: riusare un progetto di un'altra sezione della suite. Perché: la sezione resta indipendente dall'ordine di `main()`.

## Execution Handoff

- **Modalità e modello (§6.1):** esecuzione nativa (`superpowers:executing-plans`): sette task sequenziali, piccoli, su file già noti. Prima di eseguire si passa a mano a `/model sonnet`; revisione finale e `/finish-cycle` su Opus.
- **Classe di rischio (§6.1b):** standard — `/code-review` dei Gate 2-3 a effort medium.
