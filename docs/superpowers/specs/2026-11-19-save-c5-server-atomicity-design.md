# Contratto di salvataggio, ciclo 5: atomicità delle route fuori dalle entità critiche — design spec

**Date:** 2026-11-19
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c5-server-atomicity-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-12, SY-20)
**Scenario:** 3 (audit-fix)
**Classe di rischio:** high-risk (money: POT e tassi di cambio; cancellazione di dati: actuals)
**Security surface:** no

Ogni scrittura composta delle route di questo ciclo riesce tutta o niente, così l'esito che il server risponde è quello che il DB contiene. I passi best-effort che seguono una scrittura (rescan della coda Unmatched, enqueue dei profili, push SSE, email) girano dopo il COMMIT e non fanno mai fallire la risposta.

## 1. Fatti verificati

- `api/src/db/transaction.js` esporta `withTransaction(pool, fn)`: `BEGIN`, `fn(client)`, `COMMIT`; `ROLLBACK` e rilancio su errore; il client è sempre rilasciato. È già usato da `auth.js`, `users.js`, `config.js`, `cost-grids.js`, `projects.js`.
- `rescanAll` (`api/src/routes/resources.js`) chiama `refreshUnmatched` dentro un `try/catch` e poi `enqueueAllQuiet`, che passa da `quiet()` (`api/src/services/profile-engine.js`) e ingoia l'errore. Oggi un rescan fallito **non** fa già rispondere 500: quella parte di SY-20 non è raggiungibile.
- L'unico chiamante di `POST /api/resources/aliases` è `postAlias` di `js/pages/team.js`, lanciato dalla coda Unmatched (Assign e Ignore). Gli alias esistenti si possono solo cancellare. Con una risposta non ok la pagina mostra `data.error`.
- `test-api.js` riassegna lo stesso nome alla **stessa** risorsa e si aspetta 200 con `updated_by` aggiornato (casi intorno alla riga 3721-3734).
- `timesheets.project_code` ha solo un indice, nessun vincolo `UNIQUE` (`001_initial.sql`).
- `terms_versions.version` è `UNIQUE` (`019_terms_versions.sql`).
- `test-api.js` ha l'helper `sql()` per l'SQL diretto sul DB dello stack di test.
- Scritture composte senza transazione trovate nel codice, oltre a quelle del Brief: `POST /api/pots` (INSERT più `pot_history`) e `POST /api/currencies/:code/activate` (UPDATE più `currency_rates`).

## 2. Server

Tutte le transazioni usano `withTransaction(pool, …)`. `versionedWrite` non serve: nessuna di queste entità è registrata in `saved-entities.js`.

### 2.1 Upload timesheet — `POST /api/timesheets/upload`

- Validazioni invariate: dimensione, formato, date, incoerenze di ruolo e task.
- Per tutti i codici del file, una sola transazione. Per prima cosa prende `pg_advisory_xact_lock(hashtext('timesheets:' || code))` per ogni codice, in ordine alfabetico. Poi, per ogni codice, `DELETE` e `INSERT`.
- Un errore in un punto qualsiasi lascia le actuals di tutti i codici come erano.
- Dopo il COMMIT, come oggi: `refreshUnmatched(codes)` best-effort ed `enqueueProjectsQuiet(codes)`. Risposta invariata.

### 2.2 Delete timesheet — `DELETE /api/timesheets/:projectCode`

- Controllo di accesso invariato.
- In una transazione: lock advisory del codice, `DELETE FROM timesheets`, `DELETE FROM profile_unmatched`.
- Dopo il COMMIT, `enqueueProjectsQuiet`. Risposta invariata (`{ ok, deleted }`).

### 2.3 POT — `pots.js`

- **`PATCH /:id`.** In una transazione: `SELECT amount FROM pots WHERE id = $1 FOR UPDATE` (404 se manca), `UPDATE`, poi `INSERT pot_history` con il valore vecchio letto sotto lock. Validazioni (`MONEY_RULE`, nota obbligatoria) e risposta invariate.
- **`POST /`.** In una transazione: `INSERT pots` e poi `INSERT pot_history`. Il `23505` resta `409 'A POT already exists…'`.

### 2.4 Valute — `currencies.js`

- **`PATCH /:code/rate`.** In una transazione: `SELECT active … FOR UPDATE` (404 e 400 invariati), `UPDATE currencies`, `INSERT currency_rates`.
- **`POST /:code/activate`.** Stessa forma: lettura sotto lock, `UPDATE`, `INSERT currency_rates`. Risposte invariate.

### 2.5 Publish dei T&C — `PUT /api/app-settings/terms`

- Validazione e sanitizzazione invariate.
- In una transazione: con `publishNewVersion` legge `MAX(version)`, inserisce in `terms_versions`, poi fa l'upsert di `terms_content` e, se si pubblica, di `terms_version`. Senza `publishNewVersion` fa solo l'upsert del draft, sempre dentro la transazione.
- Un `23505` sul vincolo di `terms_versions.version` vuol dire che un altro publish è entrato prima. La transazione va in rollback e la risposta è `409 { error: 'Another version was published at the same time. Reload to see it.', code: 'STALE', version: <MAX(version) letto dopo il rollback> }`.
- Due publish che non si sovrappongono riescono entrambi, come oggi.

### 2.6 Notifiche — `POST /api/notifications`

- Validazioni e permessi (broadcast solo admin) invariati.
- Le notifiche si inseriscono con una sola istruzione, `INSERT INTO notifications (…) SELECT u.id, … FROM unnest($1::uuid[]) AS u(id) RETURNING …`, sugli id dei destinatari già letti.
- Push ed email partono dopo, per ogni riga restituita. Un errore dell'INSERT non lascia notifiche parziali e non ne spinge nessuna.
- Risposta invariata (`{ ok, created }`).

### 2.7 Alias — `POST /api/resources/aliases`

Validazioni invariate. Poi, in una transazione:

1. `SELECT id, resource_id, display_name, alias_normalized FROM resource_aliases WHERE alias_normalized = $1 FOR UPDATE`.
2. Se l'alias non c'è: `INSERT` e 201, come oggi. Se un INSERT concorrente fa scattare il `23505`, l'esito si calcola sulla riga che ha vinto, con le stesse regole dei punti 3 e 4.
3. Se c'è con la **stessa** risoluzione (stesso `resource_id`, oppure `NULL` per ignore): `UPDATE display_name, updated_by, updated_at` e 200, come oggi.
4. Se c'è con una risoluzione **diversa**: niente scrittura e `409 { error: '"<nome>" was already resolved by someone else. Reload the list.', code: 'ALREADY_RESOLVED', alias: <riga attuale> }`.

Il `rescanAll` gira dopo il COMMIT, solo se c'è stata una scrittura. Resta nel percorso della risposta perché `team.js` ricarica la coda subito dopo e deve vederla aggiornata. Resta best-effort (§1).

### 2.8 Altre scritture di `resources.js`

`DELETE /aliases/:id`, `POST /`, `PATCH /:id` e `DELETE /:id` sono già a istruzione singola seguita da `rescanAll` best-effort: non cambiano. Il test del §4 pinna che un rescan fallito non le trasforma in errore.

## 3. Regola del progetto

Nella sezione "Save contract" di `CLAUDE.md`, una voce: una scrittura lato server composta da più istruzioni gira in `withTransaction` (`api/src/db/transaction.js`); i passi best-effort che la seguono (rescan, enqueue, push, email) partono dopo il COMMIT e non fanno mai fallire la risposta. Nessun guard meccanico (Decisione 8).

## 4. Verifica

Test in `test-api.js`, eseguiti da `scripts/run-tests.sh`, che usa uno stack usa e getta. Ogni test di atomicità:

1. crea con `sql()` un trigger temporaneo che fa `RAISE EXCEPTION` sull'istruzione **successiva** alla prima, solo sulle righe marcate dal test (per esempio una nota o un codice dedicati);
2. chiama la route vera e si aspetta 500;
3. rilegge il DB e verifica che sia allo stato precedente;
4. rimuove il trigger in `finally`.

| Route | Istruzione che fallisce | Stato verificato |
|---|---|---|
| Upload timesheet (2 codici) | `INSERT timesheets` del secondo codice | le actuals di entrambi i codici sono quelle di prima |
| Delete timesheet | `DELETE profile_unmatched` | le righe di `timesheets` ci sono ancora |
| POT PATCH | `INSERT pot_history` | `pots.amount` invariato, nessuna riga di storico |
| POT POST | `INSERT pot_history` | nessun POT creato |
| Rate valuta | `INSERT currency_rates` | `current_rate` invariato |
| Activate valuta | `INSERT currency_rates` | la valuta è ancora inattiva |
| Publish T&C | upsert in `app_settings` | nessuna riga nuova in `terms_versions` |
| Broadcast notifiche | INSERT della riga di un destinatario | zero notifiche con quel titolo |

Altri casi:

- **Publish concorrente.** Un trigger con `pg_sleep` sull'INSERT in `terms_versions` e due `PUT` in parallelo: una risposta 200 e una `409 STALE` con `version`; una sola versione nuova.
- **Alias.** Assign di un nome già assegnato a un'altra risorsa: `409 ALREADY_RESOLVED` con la riga attuale, alias invariato. Ignore di un nome assegnato: 409. Stesso target: 200, come oggi.
- **Rescan fallito.** Un trigger che fa `RAISE` su `profile_unmatched`: `POST /aliases` risponde 201 e l'alias è salvato.
- **Test unitari.** `api/src/db/transaction.js` ha già il suo test. Nessun nuovo modulo puro.

## 5. Documentazione

- `docs/api/timesheets.md`: transazione unica dell'upload, lock per codice, delete transazionale.
- `docs/api/currencies.md`: rate e activate in transazione.
- `docs/api/app-settings.md`: publish transazionale e `409 STALE`.
- `docs/api/notifications.md`: INSERT unico, push ed email dopo.
- `docs/api/resources.md`: regola dell'alias (201/200/409 `ALREADY_RESOLVED`); il rescan resta best-effort.
- `pots.js` non ha un file in `docs/api/`: basta il commento sopra le route.
- `CLAUDE.md`: la voce del §3.
- `handbook/restricted/TEST_CASES.md`, se elenca casi di queste route.

## Criteri di accettazione

1. **Atomicità per route** — per ciascuna riga della tabella del §4, il test con l'errore iniettato trova il DB allo stato precedente.
2. **T&C concorrenti** — due publish sovrapposti producono una sola versione nuova e un `409 STALE` con `version`.
3. **Rescan fallito** — un `refreshUnmatched` che fallisce non fa rispondere 500 a un `POST /aliases`; l'alias è salvato.
4. **Alias non ripuntato** — un Assign o un Ignore su un nome già risolto in un altro modo risponde `409 ALREADY_RESOLVED` e lascia l'alias com'era; lo stesso target risponde 200.
5. **Contratti invariati** — le risposte di successo e gli errori esistenti (`MONEY_RULE`, incoerenze xlsx, limite di dimensione, 404/400/403) non cambiano: i casi esistenti di `test-api.js` passano.
6. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
7. **Regola** — `CLAUDE.md` dice che una scrittura composta lato server sta in una transazione e che i passi best-effort vanno dopo il COMMIT.
8. **Documentazione** — i file del §5 descrivono il comportamento nuovo.
9. **Backlog** — le voci aperte di `docs/BACKLOG.md` su queste route sono rilette al Gate 5; quelle superate vengono chiuse con il controllo eseguito.

## Scope escluso

- Le route delle entità registrate (cicli 1-3).
- La gestione lato client del `409 STALE` dei T&C e del `409 ALREADY_RESOLVED` degli alias (cicli 6-7). Il client attuale mostra già il messaggio d'errore.
- Il broadcast accidentale nel modale delle notifiche (voce di backlog separata).
- Il drawer risorsa aperto da tempo che sovrascrive le modifiche di un altro admin (SY-20, terzo punto): richiede una versione su `resources`.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

- **Drawer risorsa stale** (SY-20, terzo punto): `PATCH /api/resources/:id` invia sempre sei campi senza versione, quindi una pagina vecchia annulla le modifiche di un altro admin.

## Decisioni aperte

1. **`withTransaction` come helper.** Alternativa scartata: `versionedWrite` senza registro. Perché: nessuna di queste entità ha versione o change_log, e l'helper esiste già.
2. **Upload timesheet in una sola transazione per tutto il file, con lock advisory per codice.** Alternativa scartata: una transazione per codice, senza lock. Perché: il file è già trattato tutto o niente, e senza lock la transazione non impedisce le righe doppie per lo stesso codice.
3. **POT POST e currency `/activate` inclusi.** Alternativa scartata: isolarli come finding nuovi. Perché: stesso difetto, stesso file, stessa tabella di storico; rientrano nel comportamento atteso n.1 del Brief.
4. **T&C concorrenti: `409 STALE` sul `23505`.** Alternativa scartata: serializzare con un lock (due versioni, contro il criterio) o chiedere un `baseVersion` al client (cambia il contratto). Perché: rifiuto esplicito senza cambiare il contratto.
5. **Notifiche con un solo `INSERT … SELECT`.** Alternativa scartata: il loop dentro `withTransaction`. Perché: una sola istruzione è atomica di suo; push ed email vanno comunque spostati dopo.
6. **Alias: `409 ALREADY_RESOLVED` con la riga attuale quando la risoluzione è diversa; stessa risoluzione → 200.** Alternativa scartata: un 200 "already resolved" senza scrittura. Perché: il client attuale lo mostrerebbe come un successo.
7. **`rescanAll` resta sincrono e best-effort, pinnato da un test.** Alternativa scartata: spostarlo in background. Perché: `team.js` ricarica la coda subito dopo la risposta.
8. **Nessun guard meccanico, solo la regola in `CLAUDE.md`.** Alternativa scartata: un guard euristico ("≥2 scritture nell'handler senza transazione"). Perché: una scansione di prova ha dato 2 falsi positivi su 10 e non vede le scritture dentro helper o loop.
