# Contratto di salvataggio, ciclo 7: account, admin e pagine restanti — design spec

**Date:** 2026-11-20
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c7-account-admin-rest-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-14 notifiche, SY-15, SY-16, SY-18, SY-19 condivisioni singole, SY-21)
**Scenario:** 3 (audit-fix)
**Classe di rischio:** high-risk (autenticazione e permessi: accettazione dei T&C, condivisioni, ruoli utente; file condivisi caricati da ogni pagina: `js/notifications.js`, `js/nav.js`, `js/lib/save.js`)
**Security surface:** yes — `POST /api/auth/accept-terms`, nuova `PATCH /api/{cost-grids|projects}/:id/shares/:userId`, `POST …/shares` ridotto a sola aggiunta, `PATCH /api/users/:id`; admin, terms, editor T&C e `_db-reset` passano da `fetch` diretto ad `apiFetch` (redirect su 401, timeout)

Le notifiche risultano lette solo dopo la conferma del server. L'accettazione dei T&C registra la versione mostrata. Il cambio di permesso di una condivisione è un'operazione dedicata, che non ricrea una condivisione rimossa e non rimanda l'email. Un dispositivo già rimosso esce dalla lista. Le scritture di admin, profile, terms, editor T&C, `_db-reset`, profile-jobs, `nav.js` e delle condivisioni passano da `apiSave`; dopo un salvataggio le pagine adottano i valori del server.

## 1. Fatti verificati

- `apiSave` (`js/lib/save.js`, `?v=2`) non lancia mai e risponde `ok | conflict | rule | error | unknown`. L'esito `error` porta solo `{ status, message }`: il corpo della risposta si perde.
- `apiFetch` (`js/api.js`) su un 401 porta a `/login.html`. `POST /api/auth/login` risponde 401 a una password errata, quindi le pagine pubbliche non possono scrivere con `apiFetch` senza cambiare il loro comportamento. `POST /api/auth/change-password` risponde 400, non 401, con `field: 'currentPassword'` per la password attuale errata.
- `js/notifications.js` e `js/nav.js` sono caricati da ogni pagina che chiama `initNav`; `js/lib/save.js` solo da una parte di esse (`grep -l "js/lib/save.js" *.html`). `terms.html` non carica né `api.js` né `save.js`.
- `POST /api/auth/accept-terms` non ha body e registra `getCurrentTermsVersion()` (`COALESCE(MAX(version), 1)` su `terms_versions`). `GET /api/app-settings/terms` restituisce la `version` mostrata.
- `POST /api/{cost-grids|projects}/:id/shares` fa `ON CONFLICT … DO UPDATE SET permission = $3`, poi manda l'email e crea la notifica "shared with you". Un `POST` con lo `userId` dell'owner lo retrocede (finding nuovo, vedi Decisione 3). `DELETE …/shares/:userId` rifiuta l'owner (400) e risponde 200 anche se la riga non c'è.
- `js/shares.js` cambia il permesso con `api.add(…)` e mostra gli errori di rimozione e di cambio con `alert()`; `js/share-list-component.js` mostra con `alert()` l'errore di rimozione.
- `DELETE /api/auth/trusted-devices/:id` risponde 404 "Device not found" per un dispositivo inesistente; `profile.js` lo mostra come errore e lascia la riga.
- `PATCH /api/users/:id` risponde `id, email, first_name, last_name, role, status`; `admin.js` `patchUser` ne copia un solo campo.
- `PUT /api/app-settings/terms` risponde `{ ok, newVersion }`; `_terms-editor.js` imposta `updatedAt` con l'ora del client e `updatedBy` con il proprio nome. Un publish concorrente risponde già `409 STALE` (ciclo 5).
- `profile-jobs.js` scrive con il wrapper `request()` (`{ ok, status, data, network }`), con il metodo in una variabile: il guard non lo vede.
- `CLIENT_EXEMPT` di `scripts/save-contract-guard.test.js` contiene, oltre alle voci di questo ciclo, scritture che il Brief non nomina e che l'audit dichiara corrette ("Ruled out") o che sono letture inviate come POST (§4).

## 2. Fondamenta lato client

### 2.1 `apiSave` espone il corpo dell'errore

L'esito `error` diventa `{ kind: 'error', status, message, data }`, dove `data` è il corpo JSON della risposta (`err.data`) o `null`. Gli altri esiti non cambiano. Serve a leggere `field` (password attuale errata in profile; campo in errore nei dettagli utente di admin).

### 2.2 `save.js` su ogni pagina autenticata

- Ogni pagina che chiama `initNav` carica `<script type="module" src="js/lib/save.js?v=3">`, prima di `js/nav.js`. Ne hanno bisogno `notifications.js` e `nav.js`, che usano `window.apiSave` solo dentro gestori di eventi.
- `terms.html` carica `js/api.js` e `js/lib/save.js`.
- `js/lib/nav-shell-guard.test.js` pinna che ogni pagina che chiama `initNav` carichi `js/lib/save.js` e che tutte le pagine concordino sul `?v=`.

### 2.3 Metodi `Api.*` senza chiamante

Dopo la migrazione vengono cancellati i metodi di scrittura di `js/api.js` rimasti senza chiamante (regola "An `Api.*` method left without a caller is deleted"); il guard lo verifica. Sono attesi: `auth.logout`, `auth.changePassword`, `auth.rectificationRequest`, `costGrids.shares.add/remove`, `projects.shares.add/remove`. Le letture `*.shares.list` restano.

## 3. Server

### 3.1 Accettazione dei T&C (SY-18)

`POST /api/auth/accept-terms` richiede `{ version }`:

- `version` assente o non intero positivo → `400 { error: 'version is required' }`.
- Una sola istruzione: `UPDATE users SET terms_version = $1, terms_accepted_at = NOW() WHERE id = $2 AND $1 = (SELECT COALESCE(MAX(version), 1) FROM terms_versions)`.
- 0 righe aggiornate → `409 { error: 'A new version of the Terms & Conditions was published. Please read it and accept again.', code: 'STALE', version: <versione corrente> }`.
- Riuscita → `{ ok: true, terms_version }` come oggi.

### 3.2 Cambio di permesso (SY-19)

Nuova `PATCH /api/cost-grids/:id/shares/:userId` e `PATCH /api/projects/:id/shares/:userId`, body `{ permission }`:

- Stessi controlli del `POST`: `canEdit` (403), `permission` in `editor|viewer` (400), `userId` UUID (400).
- Una sola istruzione: `UPDATE resource_shares SET permission = $3 WHERE resource_type = … AND resource_id = $1 AND user_id = $2 AND permission <> 'owner' RETURNING user_id, permission`.
- 0 righe: se la riga esiste ed è owner → `400 { error: "Cannot change the owner's permission" }`; altrimenti → `404 { error: 'Share not found' }`.
- Nessuna email, nessuna notifica. Risposta: la riga aggiornata.

### 3.3 `POST …/shares` è solo aggiunta

- `ON CONFLICT (resource_type, resource_id, user_id) DO NOTHING RETURNING …`; nessuna riga inserita → `409 { error: 'This user already has access.', code: 'ALREADY_SHARED' }`, senza email né notifica.
- Il resto della risposta (`201 { ok, emailSent }`) non cambia.
- Con questo un `POST` non può più retrocedere l'owner.

### 3.4 Risposte che le pagine adottano (SY-16)

- `POST /api/auth/change-password` risponde `{ ok: true, password_changed_at }`, dal `RETURNING` già presente.
- `PUT /api/app-settings/terms` risponde anche `version`, `updatedAt` e `updatedBy` della bozza, letti con la stessa query di `GET /terms/draft` **dentro** la transazione (nessuna lettura dopo il COMMIT che possa trasformare un salvataggio riuscito in un 500).

## 4. Client

### 4.1 Notifiche (`js/notifications.js`, SY-14)

- **Mark all read:** `apiSave('PATCH', '/notifications/read-all', null, { background: true })`. Con `ok`: `updateBadge(0)` e via la classe `unread` da tutte le righe. Con qualunque altro esito: le righe restano non lette e il badge si rilegge con `loadUnreadCount()`.
- **Una notifica:** la classe `unread` non si toglie più prima della richiesta. `apiSave('PATCH', '/notifications/:id/read', null, { background: true })`; con `ok` si toglie la classe e si decrementa il badge, altrimenti `loadUnreadCount()`. Il link della notifica si apre comunque dopo la risposta.

### 4.2 T&C (`js/pages/terms.js`)

- `accept()` scrive con `apiSave('POST', '/auth/accept-terms', { version: this.version })`.
- `ok` → `this.next`.
- `conflict` → la pagina richiama il caricamento esistente (testo e versione nuovi), toglie la spunta e mostra il messaggio del server.
- `error` / `unknown` → il messaggio dell'esito; il pulsante torna attivo.
- Il caricamento resta quello attuale (fuori scope, Decisione 9); viene solo estratto in un metodo per poterlo richiamare.

### 4.3 Condivisioni (`js/shares.js`, `js/share-list-component.js`)

- Aggiunta: `apiSave('POST', …/shares, { userId, permission })`. Con 409 `ALREADY_SHARED` il messaggio va nell'area esistente `#shareAddMsg` e la lista si ricarica.
- Cambio di permesso: `apiSave('PATCH', …/shares/:userId, { permission })`. Con `ok` il select prende `data.permission`. Con 404 la lista si ricarica e mostra "This person no longer has access." Con ogni altro esito il select torna al valore precedente e il messaggio compare in linea.
- Rimozione: `apiSave('DELETE', …)`. Errore in linea, mai `alert()`.
- Nel componente, l'errore di rimozione va in una riga di errore del componente, non in `alert()`.
- Il messaggio in linea del modal è un elemento sopra la lista (`#shareListMsg`), creato dallo stesso `_injectShareModal`.

### 4.4 Profile (`js/pages/profile.js`, SY-21)

- Rimozione di un dispositivo: `apiSave('DELETE', …)`. `ok` o `error` con status 404 → la riga esce dalla lista, nessun errore. Altri esiti → `devices.error`.
- Rimozione di tutti, richiesta di rettifica e cambio password passano ad `apiSave`.
- Cambio password: con `ok` la pagina adotta `data.password_changed_at`; con `error` e `data.field === 'currentPassword'` il messaggio va sotto il campo; `rule` (`PASSWORD_RULE`) e gli altri esiti nel messaggio generale.

### 4.5 Admin (`js/pages/admin.js`)

- Le cinque scritture (dettagli, invito, ruolo/stato, reinvio invito, anonimizzazione) passano ad `apiSave`.
- `patchUser` adotta la riga restituita: `Object.assign(user, data)`.
- Dettagli: `errorField` da `out.data?.field`. Invito: con `error` e status 409 l'errore va sul campo email.
- `unknown` → il messaggio di `UNKNOWN_MESSAGE` nel banner, e la lista si ricarica.

### 4.6 Editor T&C (`js/pages/_terms-editor.js`)

- `saveTerms` scrive con `apiSave('PUT', '/app-settings/terms', …)`.
- `ok` → `terms.version`, `terms.updatedAt` e `terms.updatedBy` dalla risposta; poi `loadVersions()` come oggi.
- `conflict` (publish concorrente) → il messaggio con un'azione Reload che ricarica bozza e versioni.

### 4.7 `_db-reset` (`js/pages/_db-reset.js`)

- Le tre scritture passano ad `apiSave`. `unknown` → "The server's answer was lost — the deletion may have happened. Check before retrying." La conferma digitata `DELETE` e il controllo sysadmin non cambiano.

### 4.8 profile-jobs (`js/pages/profile-jobs.js`)

- `runAction` scrive con `apiSave(method, path, body, { background: true })`: la pagina ha già il suo stato di attesa e l'aggiornamento automatico.
- `unknown` → il testo attuale "No response from the server — the action may still be running…". `error` con status 409 → `BUSY_TEXT` come oggi. `ok` → `onSuccess(data)`.
- Le letture di `refresh()` restano sul wrapper attuale, ridotto alle sole GET.

### 4.9 `js/nav.js`

- Logout: `apiSave('POST', '/auth/logout')`, poi `/login.html` con qualunque esito, come oggi.
- Send Notification: `apiSave('POST', '/notifications', …)`; `ok` → "Sent!", altrimenti il messaggio dell'esito. Il broadcast accidentale resta com'è (fuori scope).

### 4.10 Letture

Le letture delle pagine migrate restano come sono: il Brief chiede le scritture (Decisione 9).

## 5. Guard — `scripts/save-contract-guard.test.js`

- Escono da `CLIENT_EXEMPT` ed entrano in `RETIRED`: `js/notifications.js`, `js/nav.js`, `js/pages/terms.js`, `js/pages/admin.js`, `js/pages/profile.js`, `js/pages/_terms-editor.js`, `js/pages/_db-reset.js`, `js/share-list-component.js`, `js/shares.js: costGrids.shares`, `js/shares.js: projects.shares`.
- Restano, ciascuna con un commento che ne dice il motivo:
  - **permanenti:** `js/pages/login.js`, `js/pages/activate.js`, `js/pages/reset-password.js` (pagine pubbliche: il 401 è una risposta, non una sessione scaduta); `js/pages/planning.js` (letture inviate come POST);
  - **in attesa del Brief futuro di uniformazione:** le scritture del ciclo di vita delle proposte in `js/costgrid.js`, `js/pages/costgrid.js: costGrids.reassignOwner`, `js/pages/pipeline.js`, l'upload e la cancellazione degli actuals (`js/upload.js`, `js/pages/timesheets.js`, `js/pages/project-config.js: timesheets.*`).
- Il commento di testa di `CLIENT_EXEMPT` sostituisce il riferimento "cycle 7: single shares" con la classificazione sopra.

## 6. Cache-busting

Ogni file modificato porta il `?v=` aumentato in tutte le pagine che lo caricano: `js/lib/save.js` (`?v=3` ovunque), `js/api.js`, `js/nav.js`, `js/notifications.js`, `js/shares.js`, `js/share-list-component.js` e gli script di pagina toccati. `js/lib/nav-shell-guard.test.js` e `js/lib/foundations-guard.test.js` pinnano l'accordo dei gruppi condivisi.

## 7. Documentazione

- `docs/js/notifications.md`, `docs/pages/terms.md`, `docs/pages/admin.md`, `docs/pages/profile.md`, `docs/api/app-settings.md`, `docs/api/users.md`; `docs/pages/profile-jobs.md`, `docs/pages/db-reset.md`, `docs/pages/terms-editor.md` dove descrivono le scritture.
- `docs/js/lib.md` (`save.js`: `data` sull'esito `error`).
- `CLAUDE.md`: la sezione "Sharing" (il `PATCH` del permesso, il `POST` solo aggiunta); il paragrafo "Data strategy" senza la regola fire-and-forget.
- L'intestazione di `js/api-sync.js` descrive il contratto, non più "fire-and-forget".
- `handbook/restricted/ARCHITECTURE.md` §5: le due route `PATCH …/shares/:userId` (`scripts/architecture-guard.test.js`).
- `handbook/restricted/TEST_CASES.md` per i casi nuovi di `test-api.js`.

## 8. Verifica

- **`test-api.js`** (nuovi casi `SC7-*`):
  - accettare la versione N mentre è pubblicata la N+1 → 409 `STALE` con `version` N+1, e `users.terms_version` invariato; accettare la corrente → 200; senza `version` → 400;
  - `PATCH` su una condivisione rimossa → 404 e nessuna riga in `resource_shares`;
  - `PATCH` riuscito → nessuna riga nuova in `notifications` per il destinatario e nessun messaggio nuovo in Mailpit;
  - `PATCH` sull'owner → 400 e permesso invariato;
  - `POST` su una condivisione esistente → 409 `ALREADY_SHARED`, permesso invariato;
  - `POST /auth/change-password` riuscito → `password_changed_at` nella risposta.
- **Vitest (jsdom):** `apiSave` con `data` sull'esito `error`; notifiche con `PATCH` fallito (badge e classi invariati, conteggio riletto); un dispositivo con 404 esce dalla lista; nessun `alert(` in `js/shares.js` e `js/share-list-component.js`; il pin di `save.js` nel nav-shell-guard.
- **Backend unit:** se la regola della versione accettata viene estratta in una funzione pura di `api/src/lib/`, il suo test `node:test`.

## Criteri di accettazione

1. **Notifiche** — con `PATCH /notifications/read-all` che fallisce, il badge non va a zero e le notifiche restano non lette; lo stesso per la singola notifica (vitest; a mano bloccando la richiesta nel browser).
2. **T&C sulla versione letta (security surface)** — accettare la versione N mentre è già pubblicata la N+1 è rifiutato con 409 e `terms_version` resta invariato (`test-api.js`); la pagina mostra la N+1 con la spunta tolta (a mano: pubblicare una versione dall'editor mentre `terms.html` è aperta, poi Accept).
3. **Permesso di una condivisione (security surface)** — cambiare il permesso di una condivisione già rimossa dà "not found" e non la ricrea; il cambio di permesso non invia email né notifica; il permesso dell'owner non cambia né con `PATCH` né con `POST` (`test-api.js`).
4. **Dispositivi** — rimuovere un dispositivo già rimosso lo toglie dalla lista senza errore (vitest; a mano con due schede).
5. **Sessione e timeout (security surface)** — in admin, terms, editor T&C, `_db-reset`, profile-jobs, profile e nel modal di condivisione, una scrittura con la sessione scaduta porta a `/login.html`, e un timeout o un 502 è mostrato come esito sconosciuto (a mano).
6. **Valori del server** — dopo il cambio password la pagina mostra il `password_changed_at` del server; dopo un salvataggio dell'editor T&C, data e autore vengono dalla risposta; in admin, dopo un cambio di ruolo, la riga intera viene dalla risposta (a mano; `test-api.js` per `password_changed_at`).
7. **Niente `alert()`** — nessun `alert(` nativo resta in `js/shares.js` né in `js/share-list-component.js` (vitest).
8. **Guard** — le voci del §5 sono in `RETIRED`; `CLIENT_EXEMPT` contiene solo le voci permanenti e quelle in attesa, ciascuna con il suo motivo; `scripts/save-contract-guard.test.js` passa.
9. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano; `scripts/security-headers-guard.test.js` passa.
10. **Documentazione** — i documenti del §7 sono aggiornati; `scripts/doc-paths-guard.test.js` e `scripts/architecture-guard.test.js` passano.
11. **Backlog** — al Gate 5 le voci aperte di `docs/BACKLOG.md` su queste pagine e route sono rilette, e quelle superate vengono chiuse con il controllo eseguito.

## Scope escluso

- Broadcast accidentale nel modal Send Notification e deriva del badge su `99+`.
- Il caricamento di `terms.js` che non controlla `r.ok`.
- `forgotPassword` che riporta sempre successo.
- Atomicità del publish dei T&C (ciclo 5).
- Condivisione dei programmi (ciclo 3).
- Le scritture rimaste in `CLIENT_EXEMPT` in attesa (§5): Brief futuro.
- Le letture delle pagine migrate.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

- **Uniformare ad `apiSave` le scritture rimaste:** il ciclo di vita delle proposte in `js/costgrid.js`, `reassignOwner`, `refreshRate`, l'upload e la cancellazione degli actuals (FormData: `apiSave` oggi serializza solo JSON). Passano già da `apiFetch`; l'audit le dichiara corrette.
- **`POST …/shares` poteva retrocedere l'owner** a editor o viewer (`ON CONFLICT DO UPDATE` senza esclusione dell'owner). Questo ciclo lo chiude come conseguenza della Decisione 3; lo si registra perché non era nell'audit.

## Decisioni aperte

1. **Scope: le superfici del Brief più `js/nav.js`; le altre scritture di `CLIENT_EXEMPT` restano con un motivo e vanno in un Brief futuro.** Alternativa scartata: svuotare tutta la lista. Perché: quelle scritture passano già da `apiFetch` e l'audit le dichiara corrette; confermato dall'utente in `/brainstorming`.
2. **Le pagine pubbliche (login, activate, reset-password) restano su `fetch`, come eccezione permanente.** Alternativa scartata: adottare `apiSave`. Perché: `apiFetch` trasforma in redirect il 401 di una password errata.
3. **Permesso con una `PATCH` dedicata; `POST` diventa sola aggiunta con 409 `ALREADY_SHARED`.** Alternativa scartata: lasciare il `POST` come upsert e aggiungere solo la `PATCH`. Perché: un unico endpoint per "aggiungi" e "cambia" è la causa radice di SY-19, e l'upsert permette anche di retrocedere l'owner.
4. **Notifiche: aggiornamento locale dopo la conferma, rilettura del conteggio solo sul fallimento.** Alternativa scartata: rileggere il conteggio dopo ogni azione. Perché: una richiesta in più a ogni clic, e correggerebbe di straforo la deriva su `99+`, fuori scope.
5. **Un'accettazione senza `version` è rifiutata con 400.** Alternativa scartata: trattarla come la versione corrente. Perché: riaprirebbe esattamente SY-18 per una pagina rimasta in cache.
6. **`apiSave` espone `data` sull'esito `error`.** Alternativa scartata: un `code` lato server per la password attuale errata. Perché: è generale, serve anche al campo in errore di admin, e non cambia le risposte del server.
7. **`js/lib/save.js` caricato da ogni pagina autenticata.** Alternativa scartata: `notifications.js` e `nav.js` restano esenti. Perché: sono i due file caricati ovunque, e restare esenti lascerebbe il contratto senza effetto proprio lì.
8. **profile-jobs scrive con `background: true`.** Alternativa scartata: l'overlay di salvataggio anche lì. Perché: un rebuild lungo bloccherebbe la pagina, che ha già il suo stato di attesa.
9. **Le letture delle pagine migrate restano come sono.** Alternativa scartata: migrarle insieme alle scritture. Perché: il Brief chiede le scritture, e migrare il caricamento di `terms.js` correggerebbe di straforo una nota che il Brief esclude.
