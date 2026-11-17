# Brief — Contratto di salvataggio, ciclo 7: account, admin e pagine restanti

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperti: **SY-14** (notifiche lette), **SY-15** (pagine con `fetch` diretto: admin, terms, editor T&C, profile-jobs; profile via `apiFetch`), **SY-16** (admin, profile, editor T&C), **SY-18**, **SY-19** (cambio di permesso sulle condivisioni singole), **SY-21**.
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Ultimo della serie; presuppone il ciclo 1 (helper lato client) e, per il publish dei T&C, il ciclo 5.
**Criterio di raggruppamento:** sono le pagine che restano, ciascuna con una correzione piccola. Le accomuna l'adozione dell'helper lato client.
**Natura:** divergenze di correttezza. SY-18 (accettazione dei T&C legata alla versione letta) tocca anche la conformità, ma la correzione è meccanica.
**Classe di rischio:** high-risk (autenticazione e permessi: ruoli utente, condivisioni, accettazione dei T&C).
**Security surface:** yes — `POST /api/auth/accept-terms`, `PATCH /api/users/:id`, le route di condivisione; passaggio di admin e terms da `fetch` diretto ad `apiFetch`.

## Problema

- Le notifiche vengono segnate come lette anche quando il server non le ha registrate.
- L'accettazione dei T&C registra l'ultima versione pubblicata, non quella che l'utente ha letto.
- Cambiare il permesso di una condivisione la ricrea, se nel frattempo era stata rimossa, e rimanda ogni volta l'email.
- Un dispositivo già rimosso resta in lista con un errore.
- Diverse pagine scrivono con `fetch` diretto, senza redirect su 401 né timeout.
- Dopo il salvataggio, alcune pagine ricostruiscono lo stato da valori locali.

## Comportamento attuale

- **SY-14.**
  - "Segna tutte come lette": `await apiFetch('/notifications/read-all', …).catch(() => {}); updateBadge(0);` (`js/notifications.js:136`).
  - Una singola notifica: toglie la classe `unread` prima della richiesta e decrementa il badge leggendone il testo (`:156-161`).
- **SY-18.** `POST /api/auth/accept-terms` non ha body e registra `getCurrentTermsVersion()` (`api/src/routes/auth.js:204-212`); il client è `js/pages/terms.js:33-48`.
- **SY-19.** `_shareUpdatePerm` chiama `api.add(…)` (`js/shares.js:326-341`), che è un `POST` con `ON CONFLICT DO UPDATE` (`api/src/routes/cost-grids.js:1006-1040`, e lo stesso in `projects.js`). Il `POST` manda l'email e la notifica "shared with you" a ogni cambio. Gli errori usano `alert()` nativo (`js/shares.js:320,336`, `js/share-list-component.js:62`).
- **SY-21.** Un 404 "Device not found" finisce in `devices.error` e la riga resta in lista (`js/pages/profile.js:102-116`; `api/src/routes/auth.js:380`).
- **SY-15.** `admin.js`, `terms.js`, `_terms-editor.js`, `_db-reset.js` e `profile-jobs.js` usano `fetch` diretto o un wrapper proprio, senza redirect su 401, overlay né timeout.
- **SY-16.**
  - `admin.js:355` aggiorna un solo campo da una risposta che contiene la riga intera.
  - `profile.js:163` imposta `password_changed_at` con l'ora del client.
  - `_terms-editor.js:54-55` imposta `updatedAt` e `updatedBy` localmente.

## Comportamento atteso

1. **Notifiche:** il badge e lo stato "letto" si aggiornano dopo la conferma del server. Se la richiesta fallisce, si torna allo stato reale (anche da una rilettura del conteggio).
2. **T&C:** l'accettazione invia la versione mostrata. Se nel frattempo ne è stata pubblicata una nuova, il server rifiuta e la pagina mostra la nuova versione da leggere.
3. **Condivisioni:** il cambio di permesso è un'operazione dedicata. Non ricrea una condivisione rimossa (risponde "not found") e non rimanda l'email di condivisione. Gli errori non usano più `alert()` nativo (CLAUDE.md, convenzione "no native alert/confirm").
4. **Dispositivi:** un dispositivo già rimosso è un esito "già fatto", e la riga sparisce.
5. Le pagine elencate in SY-15 scrivono tramite l'helper del ciclo 1. Fanno eccezione le pagine pubbliche senza sessione (login, activate, reset-password), che restano come sono (scelta aperta 1).
6. Dopo il salvataggio lo stato locale prende i valori restituiti dal server, nei punti elencati in SY-16.

## Vincoli

- Nessuna regressione di autenticazione: two-step, rate limit, revoca SSE e rotazione del cookie al cambio password restano invariati.
- Il gate dei T&C (redirect da `nav.js` quando `terms_version < current_terms_version`) resta il punto d'ingresso.
- `_db-reset` resta sysadmin-only, con la conferma digitata.
- CSP: nessuno script inline; cache-busting dei file modificati, compreso il gruppo `nav.js`/`notifications.js`/`core.js` pinnato da `js/lib/nav-shell-guard.test.js` e da `js/lib/foundations-guard.test.js`.
- Testi utente in inglese.

## Criteri di accettazione

- [ ] Con `PATCH /notifications/read-all` che fallisce, il badge non va a zero e le notifiche restano non lette.
- [ ] Accettare la versione N mentre è già pubblicata la N+1 viene rifiutato; la pagina mostra la N+1 (`test-api.js`).
- [ ] Cambiare il permesso di una condivisione già rimossa dà "not found" e non la ricrea; il cambio di permesso non invia email (`test-api.js`).
- [ ] Rimuovere un dispositivo già rimosso lo toglie dalla lista senza errore.
- [ ] In admin, terms, editor dei T&C, `_db-reset` e profile-jobs, un 401 porta al login e un timeout è mostrato come esito sconosciuto.
- [ ] Nessun `alert(` nativo resta in `js/shares.js` né in `js/share-list-component.js`.
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano; `scripts/security-headers-guard.test.js` passa.
- [ ] Documentazione: `docs/js/notifications.md`, `docs/pages/terms.md`, `docs/pages/admin.md`, `docs/pages/profile.md`, `docs/api/app-settings.md`, `docs/api/users.md`; la sezione "Sharing" di CLAUDE.md se cambia l'endpoint del permesso.
- [ ] Regole del progetto: la lista delle eccezioni del guard è vuota, salvo le pagine pubbliche senza sessione se la scelta aperta 1 le esclude (in quel caso restano come eccezione nominata e motivata). Il paragrafo "Data strategy" di CLAUDE.md non contiene più la regola fire-and-forget, e l'intestazione di `js/api-sync.js` descrive il contratto.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` su queste pagine e route sono rilette; quelle superate vengono chiuse al Gate 5 con il controllo eseguito.

## Scope escluso

- Broadcast accidentale nel modale delle notifiche e deriva del badge su `99+` (note fuori scope del report: voci di backlog separate).
- Il caricamento di `terms.js` che non controlla `r.ok` (nota fuori scope).
- `forgotPassword` che riporta sempre successo (scelta voluta, contro l'enumerazione degli account).
- Atomicità del publish dei T&C (ciclo 5).
- Condivisione dei programmi (ciclo 3).

## Scelte aperte per /brainstorming

1. Se le pagine pubbliche senza sessione (login, activate, reset-password) adottano l'helper (che oggi fa redirect su 401) o restano su `fetch` con una gestione propria.
2. Endpoint per il cambio di permesso: `PATCH …/shares/:userId`, e se mantenere il `POST` come sola aggiunta.
3. Notifiche: rilettura del conteggio dal server dopo ogni azione, oppure aggiornamento locale solo dopo la conferma.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
