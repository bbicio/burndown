# Contratto di salvataggio, ciclo 7: account, admin e pagine restanti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le notifiche risultano lette solo dopo la conferma del server; l'accettazione dei T&C registra la versione mostrata; il cambio di permesso di una condivisione è una `PATCH` dedicata che non ricrea e non rimanda l'email; un dispositivo già rimosso esce dalla lista; le scritture di admin, profile, terms, editor T&C, `_db-reset`, profile-jobs, `nav.js`, `notifications.js` e delle condivisioni passano da `apiSave` e adottano la risposta del server.

**Architecture:** lato server, `accept-terms` con la versione e un `UPDATE` condizionato, due route `PATCH …/shares/:userId`, `POST …/shares` ridotto a sola aggiunta, e due risposte arricchite (`change-password`, `PUT /terms`). Lato client, l'esito `error` di `apiSave` porta `data`, `save.js` è caricato da ogni pagina autenticata, e ogni file del ciclo scrive con `apiSave`; i metodi `Api.*` di scrittura rimasti senza chiamante vengono cancellati.

**Tech Stack:** Node 24, Express, `pg`, PostgreSQL 16; Vue 3 da CDN, nessun build; vitest + jsdom; `test-api.js` su `scripts/run-tests.sh`.

**Spec:** `docs/superpowers/specs/2026-11-20-save-c7-account-admin-rest-design.md`
**Branch:** `save-c7-account-admin-rest`
**Risk class:** high-risk — autenticazione e permessi (accettazione T&C, condivisioni, ruoli utente); file condivisi caricati da ogni pagina (`js/lib/save.js`, `js/nav.js`, `js/notifications.js`, `js/api.js`)

**Task indipendenti:** no. I Task 3-7 dipendono da `data` sull'esito `error` e da `save.js` su ogni pagina (Task 2), e i Task 4-5 dalle route del Task 1. Tutti modificano `scripts/save-contract-guard.test.js` e `js/api.js`, quindi vanno eseguiti in ordine.

## Global Constraints

- **Esiti del server (testi esatti, inglese):**
  - `400 { error: 'version is required' }` — `accept-terms` senza `version` intera positiva.
  - `409 { error: 'A new version of the Terms & Conditions was published. Please read it and accept again.', code: 'STALE', version: <corrente> }`.
  - `404 { error: 'Share not found' }`, `400 { error: "Cannot change the owner's permission" }` — `PATCH …/shares/:userId`.
  - `409 { error: 'This user already has access.', code: 'ALREADY_SHARED' }` — `POST …/shares` su una riga esistente.
- **Testi client (inglese):** "This person no longer has access." (cambio di permesso con 404); "The server's answer was lost — the deletion may have happened. Check before retrying." (`_db-reset` con `unknown`). Con `unknown` altrove si mostra `res.message` (`UNKNOWN_MESSAGE`).
- **Path di `apiSave`:** senza il prefisso `/api` (`apiFetch` lo aggiunge).
- **Nessun `alert(`, `confirm(` nativo** nei file toccati; errori in linea o `showInfo`/`showConfirm` di `core.js`.
- **CSP:** nessuno script inline, nessun `on…=` (`scripts/security-headers-guard.test.js`).
- **Cache-busting:**
  - `js/lib/save.js` passa a `?v=3` su tutte le pagine nel Task 2;
  - `js/api.js` sale di uno su tutte le pagine **una sola volta**, nel primo task che lo modifica (Task 3); i task successivi lo modificano senza un altro bump;
  - ogni altro file versionato toccato sale di uno in ogni `?v=` che lo cita (`grep -rn '<file>?v=' --include=*.html .`); `js/nav.js` e `js/notifications.js` devono concordare su tutte le pagine (`js/lib/nav-shell-guard.test.js`).
- **Guard:** ogni task sposta da `CLIENT_EXEMPT` a `RETIRED` le voci dei file che migra, nello stesso commit (una voce senza violazioni fa fallire il guard).
- **Rimozione di simboli (CLAUDE.md):** il task che cancella un metodo `Api.*` elenca in **Files** ogni test che lo usa (`grep -rln '<nome>' js/lib scripts api/src test-api.js`).
- **Docs:** ogni task aggiorna i documenti della sua riga `**Docs:**` nello stesso commit.
- **Prima di `scripts/run-tests.sh`** (circa 6 minuti): `node --check` dei file JS toccati, poi `npm test` dentro `api/`, concatenati con `&&`. Nel log si cerca `Unexpected error`. Il worktree ha bisogno del `.env` copiato dal checkout principale, di `npm ci` nella root e di `npm ci` in `api/`.
- **Case id:** `ACW-01..ACW-12`, unici e nel formato `[A-Z]{1,6}-\d{1,3}` (`scripts/test-api-ids-guard.test.js`).

## Review Focus

1. **Chiamanti di `POST …/shares` che ricondividono lo stesso utente:** prima ottenevano un upsert, ora un 409. Ci si aspetta che nessun caso esistente di `test-api.js` diventi rosso; il Task 1 lo verifica con il run completo, e il modal (Task 5) ricarica la lista sul 409.
2. **Notifica cliccata con il `PATCH` fallito:** la riga deve restare `unread` e il link deve aprirsi comunque. Il test del Task 3 pinna entrambe le cose.
3. **Pagina T&C in cache senza `version` nel corpo** (HTML non versionato): riceve 400 e deve mostrare un messaggio, non bloccarsi con il pulsante disattivato. Il test del Task 4 pinna che `saving` torna `false` su `error`.
4. **Logout con la sessione già scaduta:** `apiSave` riceve 401 e `apiFetch` porta già al login; il logout deve comunque finire su `/login.html` senza errori in console. Il test del Task 3 pinna la navigazione con qualunque esito.
5. **Cambio di ruolo che il server rifiuta** (ultimo sysadmin, permessi): la riga non deve cambiare e il banner deve mostrare il messaggio. Il test del Task 7 pinna che con `error` `user` resta invariato.

---

### Task 1: server — T&C sulla versione letta, condivisioni, risposte da adottare

**Files:**
- Modify: `api/src/routes/auth.js` (`POST /accept-terms`, `POST /change-password`)
- Modify: `api/src/routes/cost-grids.js`, `api/src/routes/projects.js` (`POST /:id/shares`, nuova `PATCH /:id/shares/:userId`)
- Modify: `api/src/routes/app-settings.js` (`PUT /terms`)
- Modify: `test-api.js` (nuova `testAccountWrites()`, chiamata in `main()` subito dopo `await testServerAtomicity();`)
- Modify: `handbook/restricted/TEST_CASES.md` (nuova sezione `## 35. Account, terms and share writes (2026-11-20)` subito dopo la sezione 34); `js/lib/test-cases-parse.test.js` (i due pin di conteggio, +12 casi, +1 sezione)
- Modify: `handbook/restricted/ARCHITECTURE.md` §5 (le due route `PATCH`)

**Docs:** `docs/api/app-settings.md` (risposta di `PUT /terms`); `docs/api/users.md` se descrive `accept-terms`/`change-password`, altrimenti la doc delle route auth che le descrive (`grep -rln "accept-terms\|change-password" docs`); `handbook/restricted/ARCHITECTURE.md`; `handbook/restricted/TEST_CASES.md`

**Interfaces:**
- Produces: gli esiti dei Global Constraints; `PATCH …/shares/:userId` → 200 `{ user_id, permission }`; `POST /auth/change-password` → `{ ok: true, password_changed_at }`; `PUT /app-settings/terms` → `{ ok, newVersion, version, updatedAt, updatedBy }` (gli ultimi tre come `GET /terms/draft`).

- [ ] **Step 1: scrivi i test.** `testAccountWrites()`, con `section('Account, terms and share writes')`, pulizie con `later(...)`, utenti da `makeTsUser(tag)` e sessione con `loginWithCode`; un cost grid e un progetto di test creati come negli altri test di condivisione (sysadmin).

| Id | Azione | Asserzioni |
|---|---|---|
| ACW-01 | utente `u`; `M = MAX(version)`; `POST /api/auth/accept-terms {}` | 400, `error === 'version is required'` |
| ACW-02 | `{ version: 'abc' }` e `{ version: 0 }` | 400 entrambi |
| ACW-03 | `{ version: M }` | 200, `terms_version === M` in `users` |
| ACW-04 | sysadmin: `PUT /api/app-settings/terms { content: <bozza attuale>, publishNewVersion: true }` | 200, `newVersion === M + 1`, `version`, `updatedAt`, `updatedBy` presenti |
| ACW-05 | `u`: `{ version: M }` | 409, `code === 'STALE'`, `version === M + 1`, `terms_version` ancora `M` |
| ACW-06 | `u`: `{ version: M + 1 }` | 200, `terms_version === M + 1` |
| ACW-07 | condivisione cost grid a `t` (viewer), cancellata con `DELETE`; poi `PATCH …/shares/${t.id} { permission: 'editor' }` | 404 `Share not found`; nessuna riga in `resource_shares` |
| ACW-08 | ricondivisione a `t` (viewer); svuota Mailpit e conta le righe di `notifications` di `t`; `PATCH` a editor | 200, `permission === 'editor'`; nessuna riga nuova in `notifications`, nessun messaggio a `t` in Mailpit |
| ACW-09 | `PATCH` dello `userId` owner del cost grid | 400; permesso dell'owner ancora `owner` |
| ACW-10 | `POST …/shares` a `t` già condiviso, e `POST` dello `userId` owner | 409 `ALREADY_SHARED` entrambi; permessi invariati |
| ACW-11 | ACW-07..ACW-10 sullo stesso schema per `/api/projects/:id/shares` (404, 200 senza notifica, 400 owner, 409) | come sopra |
| ACW-12 | `u`: `POST /api/auth/change-password` riuscito | 200, `password_changed_at` uguale a quello in `users` |

  Con Mailpit non configurato (`!process.env.MAILPIT_URL`), ACW-08 controlla solo `notifications`. In `TEST_CASES.md`, una riga per caso nel formato delle sezioni vicine, esito `✓`.

- [ ] **Step 2: verifica che falliscano.** `node --check test-api.js`, poi `scripts/run-tests.sh`: ACW-01/02/05/07..12 rossi; ACW-03/04/06 possono essere già verdi.

- [ ] **Step 3: `accept-terms`.** Validazione (`Number.isInteger(version) && version > 0`), poi l'`UPDATE` condizionato della Spec §3.1 (`rowCount === 0` → 409 con `getCurrentTermsVersion()`).

- [ ] **Step 4: condivisioni.** `PATCH` nei due file di route secondo la Spec §3.2 (stessi controlli del `POST`, poi l'`UPDATE … AND permission <> 'owner' RETURNING`; con 0 righe, una `SELECT` distingue owner da assente). Nel `POST`: `ON CONFLICT … DO NOTHING RETURNING user_id`; nessuna riga → 409 `ALREADY_SHARED` prima di email e notifica.

- [ ] **Step 5: risposte.** `change-password` aggiunge `password_changed_at` (da `changed`). `PUT /terms`: dentro la callback di `withTransaction`, dopo gli upsert, la query della bozza di `GET /terms/draft` (versione, `updated_at`, nome) letta con `client`; la callback restituisce `{ newVersion, draft }`; la risposta li unisce con `formatFullName`.

- [ ] **Step 6: verifica.** `node --check` dei quattro file di route, `cd api && npm test`, poi `scripts/run-tests.sh`: tutti gli ACW verdi, nessun altro caso rosso (Review Focus 1), nessun `Unexpected error`. `npx vitest run scripts/test-api-ids-guard.test.js scripts/architecture-guard.test.js js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js` → PASS.

- [ ] **Step 7: commit.** `feat(api): terms acceptance on the version read, a dedicated share permission PATCH`

---

### Task 2: `apiSave` con `data` sull'errore, `save.js` su ogni pagina autenticata

**Files:**
- Modify: `js/lib/save.js`; Test: `js/lib/save.test.js`
- Modify: ogni `*.html` che carica `js/nav.js` (aggiunge o porta a `?v=3` `<script type="module" src="js/lib/save.js?v=3"></script>`, prima di `js/nav.js`); `terms.html` (aggiunge `js/api.js?v=<corrente>` con `defer` e `js/lib/save.js?v=3`, prima di `js/pages/terms.js`)
- Modify: `js/lib/nav-shell-guard.test.js`

**Docs:** `docs/js/lib.md` (voce `save.js`: `data` sull'esito `error`); `docs/js/nav.md` se elenca gli script del guscio

**Interfaces:**
- Produces: `apiSave` → con `kind: 'error'` anche `data` (il corpo JSON o `null`). `window.apiSave` disponibile su ogni pagina che chiama `initNav` e su `terms.html`.

- [ ] **Step 1: test.**
  - `save.test.js`: `400 { error: 'Current password is incorrect', field: 'currentPassword' }` → `{ kind: 'error', status: 400, message: 'Current password is incorrect', data: { error: …, field: 'currentPassword' } }`; un `404` non JSON → `data: null`. Gli altri esiti invariati.
  - `nav-shell-guard.test.js`: ogni pagina che carica `js/nav.js` carica anche `js/lib/save.js`, prima di `js/nav.js`, e tutte con lo stesso `?v=`; `terms.html` carica `js/api.js` e `js/lib/save.js`.
- [ ] **Step 2:** `npx vitest run js/lib/save.test.js js/lib/nav-shell-guard.test.js` → FAIL.
- [ ] **Step 3: implementa** `data: err?.data ?? null` sull'esito `error`, aggiorna il commento di testa; aggiungi o aggiorna i tag `<script>` nelle pagine.
- [ ] **Step 4:** `npx vitest run js/lib/save.test.js js/lib/nav-shell-guard.test.js js/lib/save-overlay-trigger.test.js scripts/security-headers-guard.test.js` → PASS; `grep -rn 'save.js?v=' --include=*.html .` → solo `?v=3`.
- [ ] **Step 5: commit.** `feat(save): the error outcome carries the response body; save.js on every signed-in page`

---

### Task 3: notifiche e `nav.js`

**Files:**
- Modify: `js/notifications.js`, `js/nav.js`, `js/api.js` (cancella `auth.logout`; bump `?v=` di `api.js` su tutte le pagine)
- Test: `js/lib/notifications-ui.test.js`, `js/lib/nav-send-notif-options.test.js` (adegua gli stub se leggono `apiFetch`)
- Modify: `scripts/save-contract-guard.test.js` (`js/notifications.js`, `js/nav.js` → `RETIRED`)
- Modify: tutte le pagine che citano `js/notifications.js?v=` e `js/nav.js?v=` (bump)

**Docs:** `docs/js/notifications.md` (letto solo dopo la conferma; rilettura del conteggio sul fallimento); `docs/js/nav.md` (logout e Send Notification su `apiSave`)

**Interfaces:**
- Consumes: `window.apiSave` (Task 2).
- Produces: in `notifications.js`, `async function markAllRead()` e `async function markOneRead(el)`, chiamate dai gestori esistenti (estratte per i test).

- [ ] **Step 1: test** in `notifications-ui.test.js`, con `window.apiSave` e `apiFetch` finti, una lista con due righe `.notif-item.unread`, badge `2`:
  - `markAllRead` con `{ kind: 'ok' }` → badge nascosto, nessuna riga `unread`;
  - `markAllRead` con `{ kind: 'error' }` o `{ kind: 'unknown' }` → righe ancora `unread`, `apiFetch('/notifications/unread-count')` chiamata e badge uguale al conteggio restituito;
  - `markOneRead` con `error` → la riga resta `unread`, conteggio riletto; con `ok` → la riga perde `unread`, badge `1`;
  - il click su una notifica con `data-url` naviga anche quando `markOneRead` riceve `error` (Review Focus 2).
  - `nav.js`: un test sorgente (o di comportamento, nello stile di `nav-send-notif-options.test.js`) che il logout chiama `apiSave('POST', '/auth/logout')` e poi imposta `/login.html` qualunque sia l'esito (Review Focus 4), e che Send Notification usa `apiSave('POST', '/notifications', …)`.
- [ ] **Step 2:** `npx vitest run js/lib/notifications-ui.test.js js/lib/nav-send-notif-options.test.js` → FAIL.
- [ ] **Step 3: implementa** secondo la Spec §4.1 e §4.9 (`background: true` per le notifiche). Send Notification: `ok` → "Sent!", altrimenti `res.message` in `errEl`. Cancella `Api.auth.logout`; sposta le due voci in `RETIRED`; bump dei `?v=`.
- [ ] **Step 4:** `npx vitest run js/lib/notifications-ui.test.js js/lib/nav-send-notif-options.test.js js/lib/nav-shell-guard.test.js js/lib/foundations-guard.test.js scripts/save-contract-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(notifications): read state and badge follow the server's answer; nav writes through apiSave`

---

### Task 4: pagina T&C ed editor T&C

**Files:**
- Modify: `js/pages/terms.js`, `js/pages/_terms-editor.js`; bump dei loro `?v=` in `terms.html` e `_terms-editor.html`
- Test: `js/lib/terms-page.test.js` (nuovo), `js/lib/terms-editor-page.test.js` (nuovo) — caricano lo script di pagina con `Vue.createApp` finto che cattura le opzioni, come fanno i test di pagina esistenti (`grep -l "createApp" js/lib/*.test.js`)
- Modify: `scripts/save-contract-guard.test.js` (`js/pages/terms.js`, `js/pages/_terms-editor.js` → `RETIRED`)

**Docs:** `docs/pages/terms.md` (accettazione con la versione mostrata, comportamento sul 409); `docs/pages/terms-editor.md` (data e autore dalla risposta, Reload sul conflitto)

**Interfaces:**
- Consumes: `POST /auth/accept-terms { version }` e `PUT /app-settings/terms` (Task 1); `apiSave` (Task 2).
- Produces: in `terms.js`, il metodo `loadTerms()` (il caricamento di `mounted()`, estratto e invariato) e `accept()`.

- [ ] **Step 1: test.**
  - terms: `accept()` invia `{ version: this.version }`; con `ok` imposta `location.href = next`; con `conflict` chiama `loadTerms()`, `checked === false`, `errorMsg` uguale al messaggio dell'esito; con `error` (400) `saving === false` e `errorMsg` valorizzato (Review Focus 3).
  - editor: `saveTerms(false)` con `ok` e `data = { version: 4, updatedAt: 'X', updatedBy: 'Ada Admin' }` → `terms.updatedAt === 'X'`, `terms.updatedBy === 'Ada Admin'`, `terms.version === 4`; con `conflict` → `terms.msgOk === false` e un'azione di ricarica disponibile (`terms.reloadable === true`, che il template mostra come pulsante "Reload").
- [ ] **Step 2:** `npx vitest run js/lib/terms-page.test.js js/lib/terms-editor-page.test.js` → FAIL.
- [ ] **Step 3: implementa** secondo la Spec §4.2 e §4.6; in `_terms-editor.html` il pulsante "Reload" visibile con `terms.reloadable`, che chiama `loadDraft()` e `loadVersions()`. Sposta le voci in `RETIRED`; bump dei `?v=`.
- [ ] **Step 4:** `npx vitest run js/lib/terms-page.test.js js/lib/terms-editor-page.test.js scripts/save-contract-guard.test.js scripts/security-headers-guard.test.js js/lib/terms-html-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(terms): accept the version shown; the editor adopts the server's draft metadata`

---

### Task 5: condivisioni

**Files:**
- Modify: `js/shares.js`, `js/share-list-component.js`, `js/api.js` (cancella `costGrids.shares.add/remove`, `projects.shares.add/remove`; restano i `list`)
- Test: `js/lib/shares-modal.test.js` (stub e nuovi casi), `js/lib/share-list-component.test.js` (nuovo); `scripts/save-contract-guard.test.js` (usa `shares.add` solo come fixture lessicale del proprio scanner: non va toccato, ma va riletto) — più le voci `js/shares.js: costGrids.shares`, `js/shares.js: projects.shares`, `js/share-list-component.js` → `RETIRED`
- Modify: bump dei `?v=` di `js/shares.js` e `js/share-list-component.js` in tutte le pagine

**Docs:** `CLAUDE.md` sezione "Sharing" (permesso con `PATCH …/shares/:userId`, `POST` solo aggiunta con 409); `docs/js/shared-libs.md` (voci `shares.js` e `share-list-component.js`)

**Interfaces:**
- Consumes: `PATCH …/shares/:userId`, `POST …/shares` con 409 `ALREADY_SHARED` (Task 1); `apiSave` (Task 2).
- Produces: in `js/shares.js`, `#shareListMsg` creato da `_injectShareModal`, e `_shareMsg(text, kind)` che lo scrive.

- [ ] **Step 1: test.**
  - `shares-modal.test.js`, con `window.apiSave` finto e `alert` spia:
    - cambio di permesso con `{ kind: 'ok', data: { permission: 'viewer' } }` → `apiSave('PATCH', '/cost-grids/<id>/shares/<uid>', { permission: 'viewer' })` e il select vale `viewer`;
    - con `{ kind: 'error', status: 404 }` → la lista si ricarica e `#shareListMsg` contiene "This person no longer has access.";
    - con `{ kind: 'error', status: 400 }` → il select torna al valore precedente, messaggio in `#shareListMsg`;
    - rimozione fallita → messaggio in `#shareListMsg`;
    - aggiunta con 409 → messaggio in `#shareAddMsg` e lista ricaricata;
    - in nessun caso `alert` è chiamata.
  - `share-list-component.test.js`: `removeShare` con `error` → `this.error` uguale al messaggio, `alert` mai chiamata.
  - Un controllo sorgente: nessun `alert(` in `js/shares.js` e `js/share-list-component.js`.
- [ ] **Step 2:** `npx vitest run js/lib/shares-modal.test.js js/lib/share-list-component.test.js` → FAIL.
- [ ] **Step 3: implementa** secondo la Spec §4.3; cancella i quattro metodi `Api.*`; sposta le voci in `RETIRED`; bump dei `?v=`.
- [ ] **Step 4:** `npx vitest run js/lib/shares-modal.test.js js/lib/shares-program.test.js js/lib/share-list-component.test.js scripts/save-contract-guard.test.js scripts/claude-md-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(shares): permission change through the dedicated PATCH, errors inline`

---

### Task 6: profile

**Files:**
- Modify: `js/pages/profile.js`, `js/api.js` (cancella `auth.changePassword`, `auth.rectificationRequest`); bump di `js/pages/profile.js?v=` in `profile.html`
- Test: `js/lib/profile-page.test.js` (nuovo, stesso schema di carico del Task 4)
- Modify: `scripts/save-contract-guard.test.js` (`js/pages/profile.js` → `RETIRED`)

**Docs:** `docs/pages/profile.md` (dispositivo già rimosso; `password_changed_at` dal server)

**Interfaces:**
- Consumes: `password_changed_at` nella risposta di `change-password` (Task 1); `data` sull'errore (Task 2).

- [ ] **Step 1: test.**
  - `removeDevice(d)` con `{ kind: 'error', status: 404 }` → `d` non è più in `devices.list`, `devices.error === ''`; con `ok` → idem; con `error` 500/`unknown` → la riga resta e `devices.error` valorizzato.
  - `submitPassword()` con `ok` e `data.password_changed_at = 'T'` → `user.password_changed_at === 'T'`; con `error` e `data.field === 'currentPassword'` → `pw.currentError` valorizzato, `pw.error === ''`; con `rule` → `pw.error`.
  - `removeAll()` e `sendRequest()` scrivono con `apiSave`.
- [ ] **Step 2:** `npx vitest run js/lib/profile-page.test.js` → FAIL.
- [ ] **Step 3: implementa** secondo la Spec §4.4; cancella i due metodi `Api.*`; sposta la voce in `RETIRED`; bump del `?v=`.
- [ ] **Step 4:** `npx vitest run js/lib/profile-page.test.js js/lib/profile-ui.test.js scripts/save-contract-guard.test.js` → PASS.
- [ ] **Step 5: commit.** `feat(profile): a device already gone leaves the list; the page adopts the server's password time`

---

### Task 7: admin, `_db-reset`, profile-jobs; chiusura del guard e della documentazione

**Files:**
- Modify: `js/pages/admin.js`, `js/pages/_db-reset.js`, `js/pages/profile-jobs.js`; bump dei loro `?v=` in `admin.html`, `_db-reset.html`, `profile-jobs.html`
- Test: `js/lib/admin-page-guard.test.js` (il controllo `await fetch(` di `submitInvite` diventa `await window.apiSave(` / `await apiSave(`), `js/lib/admin-page.test.js` (nuovo, schema del Task 4), `js/lib/profile-jobs-ui.test.js` o un nuovo `js/lib/profile-jobs-page.test.js`
- Modify: `scripts/save-contract-guard.test.js` (`js/pages/admin.js`, `js/pages/_db-reset.js` → `RETIRED`; commento di `CLIENT_EXEMPT` riscritto secondo la Spec §5, con il motivo accanto a ogni voce rimasta)
- Modify: `CLAUDE.md` ("Data strategy", punto "On user action": niente più fire-and-forget; le scritture rimaste nelle liste del guard sono attese con `Api.*`)

**Docs:** `docs/pages/admin.md`, `docs/pages/db-reset.md`, `docs/pages/profile-jobs.md` (scritture su `apiSave`, esiti); `docs/api/users.md` (la pagina adotta la riga di `PATCH /api/users/:id`); `CLAUDE.md`. L'intestazione di `js/api-sync.js` descrive già il contratto: `grep -n "fire-and-forget" js/api-sync.js` deve restare vuoto.

**Interfaces:**
- Consumes: `data` sull'errore (Task 2).

- [ ] **Step 1: test.**
  - admin: `patchUser(user, { role: 'admin' }, 'role')` con `ok` e `data = { id, email: 'e', first_name: 'F', last_name: 'L', role: 'admin', status: 'active' }` → `user` ha tutti quei valori; con `error` → `user` invariato e banner con `res.message` (Review Focus 5); `submitDetails` con `error` e `data.field === 'email'` → `details.errorField === 'email'`; `submitInvite` con `error` 409 → `invite.errorField === 'email'`.
  - `_db-reset`: `_doScopeDelete` con `unknown` → `scopeErrorMsg` contiene il testo dei Global Constraints.
  - profile-jobs: `runAction` con `unknown` → `actionError` uguale al testo attuale "No response from the server…"; con `error` 409 → `BUSY_TEXT`; `apiSave` chiamata con `{ background: true }`; `refresh()` chiamata in ogni caso.
- [ ] **Step 2:** `npx vitest run js/lib/admin-page.test.js js/lib/admin-page-guard.test.js js/lib/profile-jobs-page.test.js` → FAIL.
- [ ] **Step 3: implementa** secondo la Spec §4.5, §4.7, §4.8 (in profile-jobs `request()` resta solo per le GET di `refresh()`); sposta le voci in `RETIRED`; riscrivi il commento di `CLIENT_EXEMPT`; aggiorna `CLAUDE.md`; bump dei `?v=`.
- [ ] **Step 4: verifica.**
  - `npm test` → PASS, guard compresi (`save-contract-guard`, `claude-md-guard`, `doc-paths-guard`, `decision-ledger-guard`, `security-headers-guard`, `nav-shell-guard`, `foundations-guard`).
  - `cd api && npm test` → PASS.
  - `grep -n "alert(" js/shares.js js/share-list-component.js` → vuoto.
- [ ] **Step 5: commit.** `feat(admin): admin, db-reset and profile-jobs write through apiSave; the guard names what stays`

## Criteri di accettazione

Quelli della Spec (`docs/superpowers/specs/2026-11-20-save-c7-account-admin-rest-design.md`, `## Criteri di accettazione`), da 1 a 11. Li coprono:
- **Task 1:** criteri 2 e 3 (`ACW-01..ACW-11`), 6 per `password_changed_at` (`ACW-12`);
- **Task 3:** criterio 1 (vitest);
- **Task 5:** criterio 7;
- **Task 6:** criterio 4 (vitest);
- **Task 3-7:** criterio 8;
- **Task 7, Step 4:** criteri 9 e 10.

I criteri 1-6 si verificano anche a mano sullo stack di branch, al Gate 2 (criterio 5 solo a mano); il criterio 11 al Gate 5.

## Decisioni aperte

1. **I test di pagina caricano lo script con un `Vue.createApp` finto e provano i metodi.** Alternativa scartata: solo controlli sul sorgente. Perché: le Review Focus 2-5 sono comportamenti, non testi.
2. **ACW-04 pubblica davvero una versione dei T&C** (con il contenuto della bozza attuale) sullo stack effimero di `run-tests.sh`. Alternativa scartata: provare il 409 inviando `M + 1`, senza pubblicare. Perché: il criterio 2 della Spec è "accettare N mentre è pubblicata N+1", e solo una pubblicazione reale lo prova.
3. **Esecuzione subagent-driven in sequenza.** Alternativa scartata: nativa. Perché: sette task, quattro route toccate e più di cinque file di produzione (§6.1 "ciclo grande"); i task non sono indipendenti, quindi i dispatch vanno uno alla volta.
