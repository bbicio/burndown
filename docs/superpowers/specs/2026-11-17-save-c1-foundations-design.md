# Contratto di salvataggio, ciclo 1: fondamenta + pilota su ruoli e ratecard — design spec

**Date:** 2026-11-17
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c1-foundations-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-01, SY-15 parte helper, SY-16 ruoli e ratecard)
**Scenario:** 2 (evoluzione su base audit)
**Classe di rischio:** high-risk (migrazione DB; money: tariffe di ruoli e ratecard; file condivisi `js/api.js` e helper caricati da più pagine)
**Security surface:** yes — nuove scritture lato server sotto `requireAdmin`; il registro conserva l'id dell'utente che modifica

Il ciclo introduce il contratto di salvataggio e lo prova su ruoli e ratecard. Il contratto prevede:

- lettura con versione;
- scrittura con la versione di partenza;
- conflitto esplicito (`409 STALE`);
- risposta del server adottata dal client;
- fotografia nel registro `change_log`, nella stessa transazione.

Un guard lo rende obbligatorio. Fanno eccezione i file non ancora migrati, elencati in una lista che i cicli 2-7 svuotano.

## 1. Fatti verificati

- **Ratecard.** `PATCH /api/ratecards/:id/entries` (`api/src/routes/config.js`) è l'unica scrittura con controllo di versione. Il flusso è:
  1. `SELECT … version … FOR UPDATE`;
  2. confronto con `req.body.version`;
  3. `409 { code: 'RATECARD_STALE' }`, anche per un body ad array nudo;
  4. `version = version + 1`;
  5. risposta `{ ok, version }`.

  `RATECARD_STALE` compare solo lì e in `test-api.js` (SV-33, SV-35).
- **Ruoli.** `PATCH /api/roles/:id` scrive i campi ricevuti senza alcuna versione e restituisce `RETURNING *`. `GET /api/roles` non restituisce una versione.
- **Altre route della ratecard.** `PATCH /api/ratecards/:id` (rinomina) e `DELETE /api/ratecards/:id` non hanno chiamanti in `js/`. Non li hanno nemmeno `Api.ratecards.rename` e `Api.ratecards.delete`.
- **Creazione della ratecard.** `POST /api/ratecards` converge su una card per cliente grazie al lock sul cliente. Se la card esiste già, risponde `200` con quella card.
- **Ruoli e voci della ratecard.** `ratecard_entries.role_id` è `REFERENCES roles(id) ON DELETE CASCADE` (`001_initial.sql`). Eliminare un ruolo modifica quindi le ratecard che lo contengono.
- **Pilota ruoli.** `js/pages/master-roles.js`:
  - per creazione, modifica ed eliminazione chiama `Api.roles.create/update/delete`;
  - dopo il successo ricopia i valori dal form;
  - riconosce i rifiuti dal testo del messaggio (`master-roles.js:334`).
- **Pilota ratecard.** `js/pages/master-clients.js` chiama `Api.ratecards.create` e `Api.ratecards.updateEntries`. Su 409 mostra `e.message`. Dopo il successo ricostruisce `stored` dai propri input.
- **`apiFetch`.** `js/api.js` esegue `JSON.parse(text)` senza `try`, quindi un corpo d'errore HTML (un 502 di nginx) diventa un `SyntaxError` senza `data`. Il timeout diventa `Error('Request timed out')`, e un errore di rete viene rilanciato così com'è.
- **Transazioni.** `api/src/db/transaction.js` esporta già `withTransaction(pool, fn)`, con il suo test.
- **Chiavi.** `programs.id` è `VARCHAR(100)`; le chiavi di ruoli, ratecard, cost grid, versioni e progetti sono UUID.

## 2. Migrazione — `api/src/db/migrations/037_save_contract.sql`

È rieseguibile (`IF NOT EXISTS`) e si applica a mano, come dice CLAUDE.md.

```sql
ALTER TABLE roles              ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE programs           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE projects           ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE cost_grids         ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
ALTER TABLE cost_grid_versions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS change_log (
  id          bigserial PRIMARY KEY,
  entity_type text        NOT NULL,
  entity_id   text        NOT NULL,
  version     integer     NOT NULL,
  action      text        NOT NULL,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  snapshot    jsonb       NOT NULL
);
CREATE INDEX IF NOT EXISTS change_log_entity_idx ON change_log (entity_type, entity_id, version);
```

- `ratecards.version` esiste già (`035`).
- Non c'è backfill: un'entità che esiste già entra nel registro alla sua prima modifica.
- Il registro non scade e non ha interfaccia: si consulta da Adminer o con una query.
- `docs/db/migrations.md` riceve la voce.

## 3. Helper lato server

### 3.1 Registro delle entità — `api/src/services/saved-entities.js`

Una voce per tipo, con:

- `table`: la tabella che porta la colonna `version`;
- `snapshot(client, id)`: l'oggetto JSON salvato nel registro e restituito al client.

In questo ciclo:

- `role`: tabella `roles`. Lo snapshot è la riga, con `version`, nella stessa forma di `GET /api/roles`.
- `ratecard`: tabella `ratecards`. Lo snapshot ha la forma di `GET /api/ratecards/:id`: `id, name, client_id, version, entries[]`. La query si estrae in una funzione sola, che usano sia la route `GET` sia lo snapshot.

`program`, `project`, `cost_grid` e `cost_grid_version` non sono registrati in questo ciclo: li aggiungono i cicli 2-3, quando adottano l'helper.

### 3.2 `api/src/services/versioned-write.js`

```js
versionedWrite(poolOrClient, { type, id, expectedVersion, userId, action, write })
// → { entity, version }  oppure lancia StaleError
```

Comportamento:

1. **Transazione.** Con un `pool`, la apre con `withTransaction`. Con un `client` già in transazione, la usa così com'è; serve al §4.3 e ai cicli successivi.
2. **Modifica ed eliminazione.** `action` vale `'update'`, `'delete'` o un'azione specifica, per esempio `'update-entries'`.
   1. Esegue `SELECT version FROM <table> WHERE id = $1 FOR UPDATE`. Senza riga lancia `NotFoundError`.
   2. Se `expectedVersion` non è un intero o è diverso dalla versione salvata, lancia `StaleError`. Non scrive nulla.
   3. Con `'delete'` calcola lo snapshot prima di `write`.
   4. Esegue `await write(client)`.
   5. Se non è un `'delete'`, esegue `UPDATE <table> SET version = version + 1 … RETURNING version` e poi lo snapshot.
   6. Inserisce la riga in `change_log`. Per `'delete'` la versione registrata è quella salvata più 1, così ogni riga del registro di un'entità ha una versione diversa.
3. **Creazione** (`action: 'create'`, senza `id` né `expectedVersion`):
   - `write(client)` restituisce l'id della riga nuova;
   - l'helper calcola lo snapshot e registra la versione 0.

   `write` può restituire `{ id, created: false }`. È il caso di `POST /ratecards` quando la card esiste già: l'helper restituisce lo snapshot e non scrive nel registro.
4. **Errori.** Un errore in `write`, nello snapshot o nell'`INSERT` del registro fa rollback di tutto. Questo vale anche dentro una transazione già aperta dal chiamante: l'errore risale al chiamante, che la annulla.
5. **Utente.** `userId` viene sempre da `req.user.id`, mai dal body.

Un middleware, o un helper `respondSaveError(res, err)` nello stesso modulo, traduce gli errori:

- `StaleError` → `409 { error, code: 'STALE', version }`;
- `NotFoundError` → `404`.

I messaggi sono in inglese e scelti per tipo, per esempio "This role was changed by someone else since you opened it."

### 3.3 Test — `api/src/services/versioned-write.test.js` (`node:test`)

Usano un client finto che registra le query, sullo stesso schema di `api/src/db/transaction.test.js`:

- versione giusta → `write` viene eseguita, la versione aumenta di 1, il registro riceve la riga con lo snapshot e `{ entity, version }` torna al chiamante;
- versione vecchia o mancante → `StaleError`, nessuna `write`, nessun `INSERT INTO change_log`, `ROLLBACK`;
- `INSERT` del registro che fallisce → `ROLLBACK`, errore rilanciato, nessun `COMMIT`;
- creazione → riga di registro con versione 0. Con `created: false` nessuna riga;
- eliminazione → snapshot calcolato prima di `write`;
- un `client` passato dal chiamante non riceve `BEGIN`/`COMMIT` dall'helper.

## 4. Route migrate (`api/src/routes/config.js`)

Tutte restano sotto `requireAdmin` e mantengono `amountError`/`overridesError`/`ratecardEntryError` prima di ogni scrittura. Un body senza `version` intero riceve `409 STALE`, non 400.

### 4.1 Ruoli

- `GET /roles` aggiunge `version` alle colonne.
- `POST /roles`: `versionedWrite` con `create`. Risponde 201 con lo snapshot. Il `23505` resta `409 'Role code already exists'`, senza `code: 'STALE'`.
- `PATCH /roles/:id`: il body è l'entità intera più `version`. Risponde con lo snapshot.
- `DELETE /roles/:id`: il body è `{ version }`. I controlli su `task_roles`/`resources` e la traduzione del `23503` stanno dentro `write`. Si applica anche il §4.3. Risponde `{ ok: true }`.

### 4.2 Ratecard

- `POST /ratecards`: `versionedWrite` con `create`. Quando la card esiste già, `created: false`: risponde 200 con lo snapshot, senza riga di registro.
- `PATCH /ratecards/:id`: il body è `{ name, version }`. Risponde con lo snapshot.
- `PATCH /ratecards/:id/entries`:
  - il body è `{ version, entries }`, mentre l'array nudo riceve `409 STALE`;
  - action `'update-entries'`;
  - la sostituzione completa e lo scarto dei ruoli eliminati restano dentro `write`;
  - risponde con lo snapshot completo della card, non più `{ ok, version }`.
- `DELETE /ratecards/:id`: il body è `{ version }`. Il controllo d'uso nelle cost grid sta dentro `write`.
- `RATECARD_STALE` viene rimosso e sostituito da `STALE`. `test-api.js` SV-33/SV-35 si aggiornano al codice nuovo.

### 4.3 Eliminare un ruolo aggiorna le ratecard che lo contengono

Nella stessa transazione del `DELETE /roles/:id`, prima della cancellazione, si cercano le ratecard che hanno una voce per quel ruolo. Il ruolo si cancella, e il `CASCADE` elimina le voci. Poi, per ciascuna di quelle ratecard, si esegue `versionedWrite(client, { type: 'ratecard', action: 'role-deleted', … })` con la versione appena letta sotto lock. La versione aumenta e il registro riceve la fotografia senza la voce.

L'effetto è che un editor della ratecard aperto prima dell'eliminazione riceve `STALE` al salvataggio, e il registro della ratecard non perde la modifica.

## 5. Helper lato client

### 5.1 `js/api.js` — `apiFetch`

Cambia solo il trattamento della risposta. Overlay, redirect su 401 e timeout restano invariati.

- Il corpo si legge con `res.text()`, poi `JSON.parse` dentro un `try`:
  - un corpo non JSON con `res.ok` lancia un `Error` con `nonJson = true` e `status`;
  - un corpo non JSON con errore HTTP lancia un `Error('HTTP <status>')` con `data = null`, `status` e `nonJson = true`.
- Un errore HTTP JSON porta `err.status` oltre a `err.data`.
- Un timeout lancia un `Error('Request timed out')` con `timeout = true`.
- Un errore di rete rilanciato porta `network = true`.
- Il `?v=` di `js/api.js` si aggiorna in tutte le pagine che lo caricano, allo stesso nuovo valore.

### 5.2 `js/lib/save.js`

Il modulo ES esporta `apiSave(method, path, body)`, con il ponte `window.apiSave = apiSave`. Chiama `window.apiFetch` al momento dell'invocazione, mai al caricamento. Non lancia mai e restituisce:

| `kind` | Quando | Campi |
|---|---|---|
| `ok` | risposta 2xx JSON | `data` |
| `conflict` | 409 con `data.code === 'STALE'` | `message`, `version` |
| `rule` | errore HTTP con `data.code` che finisce in `_RULE` | `code`, `message` |
| `error` | altro errore HTTP JSON; 4xx non JSON; 401 (redirect già in corso) | `status`, `message` |
| `unknown` | timeout, rete, 5xx non JSON, 2xx non JSON | `message` |

- Il messaggio di `unknown` è "The server's answer was lost — the change may have been saved. Reload to check."
- I messaggi di `conflict`, `rule` ed `error` sono quelli del server, o `HTTP <status>` se mancano.

Ogni pagina che lo usa carica `js/lib/save.js` come `type="module"`, con il suo `?v=`.

### 5.3 Test — `js/lib/save.test.js` (vitest)

`js/api.js` si carica con `new Function`, come in `js/lib/save-overlay-trigger.test.js`, con un `fetch` finto. C'è un caso per ogni riga della tabella:

- 200 JSON → `ok`;
- 409 `STALE` → `conflict`;
- 400 `MONEY_RULE` → `rule`;
- 404 JSON → `error`;
- 413 HTML → `error`;
- 401 → `error`, con redirect;
- 502 HTML → `unknown`;
- timeout (`AbortError`) → `unknown`;
- `TypeError` di rete → `unknown`;
- 200 HTML → `unknown`.

Un ultimo test verifica che `apiSave` non rigetti mai.

## 6. Pilota — `master-roles`

- Ogni ruolo in memoria porta `version`, preso da `GET /roles`.
- **Salvataggio.** Chiama `apiSave('PATCH', '/roles/' + id, { label, code, hourlyRate, rateOverrides, version })`, oppure `'POST'` per un ruolo nuovo. Su `ok` la riga in memoria si ricostruisce da `data` con la stessa funzione che mappa la lista caricata. Il pannello si chiude come oggi.
- **Eliminazione.** Chiama `apiSave('DELETE', '/roles/' + id, { version })`. Il ramo che oggi riconosce il rifiuto dal testo del messaggio legge `kind`/`message`.
- **Conflitto o esito sconosciuto.** Il pannello, o la modale di eliminazione, mostra il messaggio e un pulsante **Reload**:
  - per `conflict`: "This role was changed by someone else since you opened it. Reload to see the current values — your edits will be discarded.";
  - per `unknown`: il messaggio della tabella del §5.2.

  **Reload** rilegge i ruoli e riapre il pannello con i valori del server. Se il ruolo è stato eliminato, chiude il pannello con l'avviso "This role no longer exists."
- **Rifiuto ed errore.** `rule` ed `error` mostrano il messaggio, come oggi.

## 7. Pilota — ratecard (`master-clients`)

- La creazione della card chiama `apiSave('POST', '/ratecards', …)`. Il salvataggio delle voci chiama `apiSave('PATCH', '/ratecards/' + id + '/entries', { version, entries })`.
- Su `ok` le righe si ricostruiscono da `data` con la stessa mappatura del caricamento: `texts`, `stored`, `hidden` e `initial` vengono dal server. Questo sostituisce la ricostruzione dagli input.
- Su `conflict` o `unknown` compare il messaggio con un pulsante **Reload**, che rilegge la card del cliente scartando le modifiche.
- `master-clients` resta in `EXEMPT`, perché le scritture di clienti e gruppi sono del ciclo 6.

## 8. Guard — `scripts/save-contract-guard.test.js`

Segue lo schema di `js/lib/money-guard.test.js`. Le funzioni di analisi sono esportate o locali, e hanno test su sorgenti sintetici.

### 8.1 Lato server

- **Cosa si controlla.** I file `.js` sotto `api/src/routes` e `api/src/services`, test esclusi. Si cerca ogni `INSERT INTO`, `UPDATE` o `DELETE FROM` su una tabella registrata: `roles`, `ratecards`, `ratecard_entries`, `programs`, `projects`, `cost_grids`, `cost_grid_versions`.
- **La regola.** L'istruzione deve stare lessicalmente dentro gli argomenti di una chiamata `versionedWrite(`. Lo verifica uno scanner che appaia le parentesi e salta stringhe e commenti. `api/src/services/versioned-write.js` è escluso.
- **Le eccezioni** sono la lista `SERVER_EXEMPT` di coppie `'file: tabella'`. Comprende almeno `config.js: programs`, le tabelle di `cost-grids.js`, `projects.js` e `reset.js`, più ogni altra coppia trovata quando il guard gira la prima volta.

### 8.2 Lato client

- **Cosa si controlla.** I file `.js` sotto `js/`, test esclusi, tranne `js/api.js` e `js/lib/save.js`. Un file viola la regola se contiene:
  - una chiamata `Api.<ns>.<nome>(` a un metodo di scrittura, cioè un metodo che in `js/api.js` ha `method: 'POST'|'PUT'|'PATCH'|'DELETE'`. L'insieme si ricava leggendo `js/api.js`, non si scrive a mano;
  - una chiamata `apiFetch(` o `fetch(` con un metodo di scrittura nei suoi argomenti. Un `fetch` di sola lettura non conta.
- **Le eccezioni** sono la lista `CLIENT_EXEMPT` dei file non migrati. Comprende `master-clients.js` e non `master-roles.js`.

### 8.3 Regole sulle liste

- `RETIRED` contiene i file, e le coppie lato server, usciti dalle eccezioni. In questo ciclo contiene `js/pages/master-roles.js`, `config.js: roles`, `config.js: ratecards` e `config.js: ratecard_entries`. Il guard fallisce se una voce di `RETIRED` è anche in un'eccezione.
- Il guard fallisce se una voce di un'eccezione non ha più alcuna violazione: la lista si riduce, non si gonfia.
- Il guard fallisce se un metodo di scrittura di `Api.*` in `js/api.js` non ha chiamanti in `js/`. In questo ciclo si tolgono:
  - `Api.roles.create`, `update` e `delete`;
  - `Api.ratecards.create`, `rename`, `updateEntries` e `delete`.

### 8.4 Test del guard

Usano sorgenti sintetici e dimostrano che il guard fallisce su:

- un `fetch('/api/x', { method: 'POST' })` in un file fuori dalla lista;
- una `Api.<ns>.<write>(` in un file fuori dalla lista;
- un `UPDATE roles` fuori da `versionedWrite(`;
- una voce di `RETIRED` rimessa in un'eccezione;
- una voce di eccezione senza violazioni;
- un metodo di scrittura di `Api.*` senza chiamanti.

Dimostrano anche che il guard passa su un `UPDATE roles` dentro `versionedWrite(…)` e su un `fetch` di sola lettura.

## 9. Documentazione

- **CLAUDE.md** riceve la nuova sezione `### Save contract`, nello stile di "Dates":
  - ogni route che scrive un'entità registrata passa da `versionedWrite`: transazione, versione, `change_log`;
  - nessun file di `js/` scrive con `fetch` diretto, con `apiFetch` o con un metodo di scrittura di `Api.*`: si scrive solo con `apiSave`;
  - un metodo di `Api.*` che resta senza chiamanti si cancella;
  - un `409 STALE` si mostra con un'azione di ricarica;
  - dopo il successo si adotta la risposta del server;
  - rimanda a `scripts/save-contract-guard.test.js` per le eccezioni.

  "Data strategy (in-memory cache)" rimanda a questa sezione e limita il fire-and-forget ai file elencati nelle eccezioni del guard. Le voci della File structure per `versioned-write.js`, `saved-entities.js`, `js/lib/save.js` e per il guard restano di una riga. `scripts/claude-md-guard.test.js` deve passare.
- **`docs/api/config.md`:** versione e body di ruoli e ratecard, `STALE`, la risposta con lo snapshot, il §4.3.
- **`docs/api/services.md`:** `versioned-write.js` e `saved-entities.js`.
- **`docs/js/lib.md`:** `save.js` e i suoi cinque esiti.
- **`docs/db/migrations.md`:** `037`.
- **`docs/pages/config.md`:** il conflitto e il Reload su ruoli e ratecard.

## 10. Verifica

- **Unità.** `node --test` in `api/` per l'helper lato server. `npm test` per `save.test.js` e per il guard.
- **Integrazione.** In `test-api.js`, sullo stack di `scripts/run-tests.sh`, con la migrazione `037` applicata:
  - due `PATCH` dello stesso ruolo dalla stessa versione: il primo dà 200 con `version + 1`, il secondo `409 STALE`, e il ruolo resta quello del primo;
  - un `PATCH` senza `version` dà `409 STALE`;
  - ogni salvataggio riuscito di ruolo e ratecard (creazione, modifica, voci, eliminazione) lascia in `change_log` una riga con snapshot completo, `user_id` dell'utente e versione nuova;
  - un `409` o un `400 MONEY_RULE` non lascia righe;
  - eliminare un ruolo contenuto in una ratecard aumenta la versione della card e lascia una riga `role-deleted`;
  - un utente non admin riceve 403 su tutte le route migrate;
  - nessuna route espone `change_log`;
  - SV-33/SV-35 aggiornati a `STALE`.
- **A mano**, sullo stack di `scripts/test-branch.sh`, con la migrazione applicata a mano a quello stack. Due schede aperte sullo stesso ruolo e sulla stessa ratecard: la seconda che salva vede il conflitto e Reload; dopo il successo compaiono i valori del server.
- **Main stack.** Prima di applicare `037`: `scripts/backup-db.sh` e la conferma dell'utente (Infrastructure safety). Poi il riavvio di `pdash-api` previsto dal Gate 4.

## Criteri di accettazione

1. **Helper server testato** — `api/src/services/versioned-write.test.js` copre tre casi: versione giusta (salva, incrementa, registra); versione vecchia (409 senza scrittura né riga nel registro); registro che fallisce (nessuna scrittura). `node --test` passa.
2. **Migrazione e letture** — `037_save_contract.sql` aggiunge `version` a `roles`, `programs`, `projects`, `cost_grids` e `cost_grid_versions` e crea `change_log`. `GET /api/roles` e `GET /api/ratecards[/:id]` restituiscono `version`.
3. **Conflitto sui ruoli** — in `test-api.js`, due `PATCH` dello stesso ruolo dalla stessa versione: il primo riesce, il secondo riceve `409 STALE`, e il ruolo resta quello del primo.
4. **Registro** — in `test-api.js`, ogni salvataggio riuscito di ruolo e ratecard lascia una riga in `change_log` con lo snapshot completo, l'utente e la versione nuova. Un salvataggio rifiutato non ne lascia.
5. **Eliminazione di un ruolo nella ratecard** — in `test-api.js`, eliminare un ruolo presente in una ratecard aumenta la versione della card e lascia una riga `role-deleted`.
6. **Security surface** — in `test-api.js`, un utente non admin riceve 403 su ogni route migrata di ruoli e ratecard. Nessuna route restituisce righe di `change_log`. `user_id` è l'utente della sessione anche se il body ne contiene un altro.
7. **Helper client testato** — `js/lib/save.test.js` copre i cinque esiti, con un 502 HTML e un timeout, e verifica che `apiSave` non rigetti mai.
8. **Piloti a mano** — su branch stack, `master-roles` e la ratecard di `master-clients` mostrano il conflitto con il pulsante Reload. Dopo il successo mostrano i valori restituiti dal server.
9. **Guard** — `scripts/save-contract-guard.test.js` esiste. `CLIENT_EXEMPT` comprende tutti i file non migrati e non `master-roles.js`. I suoi test dimostrano il fallimento su un `fetch` di scrittura fuori lista, su una route di un'entità registrata fuori da `versionedWrite`, su una voce di `RETIRED` rimessa in lista e su un metodo di scrittura di `Api.*` senza chiamanti.
10. **Niente metodi orfani nel namespace Api** — `Api.roles.create/update/delete` e `Api.ratecards.create/rename/updateEntries/delete` non esistono più in `js/api.js`.
11. **CLAUDE.md** — contiene la sezione "Save contract". "Data strategy" vi rimanda e limita il fire-and-forget ai file in lista. `scripts/claude-md-guard.test.js` passa.
12. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
13. **Backlog** — le voci aperte di `docs/BACKLOG.md` che toccano i file del ciclo sono rilette. Quelle superate si chiudono al Gate 5, con il controllo eseguito scritto in `Verified how`.

## Decisioni aperte

1. **Scelta dell'approccio: un helper per entità con un registro dei tipi (`saved-entities.js`), e l'SQL di scrittura che resta nella route dentro `write`.** Alternativa scartata: un modulo store per entità con tutto l'SQL, oppure un `withVersion` senza registro dei tipi. Perché: le route cambiano il minimo, e lo snapshot ha un'unica definizione per tipo.
2. **La versione è un intero incrementale, uno su `cost_grids` e uno su ogni `cost_grid_versions`.** Alternativa scartata: `updated_at`, oppure una sola versione per proposta. Perché: è il precedente della ratecard, e testata e versioni si modificano separatamente.
3. **La versione viaggia nel body, anche nelle `DELETE`.** Alternativa scartata: l'header `If-Match`. Perché: c'è una regola sola, già usata dalla ratecard, senza plumbing di header in `apiFetch`.
4. **Il pilota manda l'entità intera con la versione.** Alternativa scartata: solo i campi cambiati. Perché: con la versione è sicuro, e il form ha comunque l'entità completa.
5. **Il registro salva solo la fotografia dopo la modifica, e quella prima della cancellazione per le eliminazioni. Non c'è backfill.** Alternativa scartata: colonne `before`/`after`, oppure una riga base per ogni entità esistente. Perché: lo stato precedente è la riga precedente. Il limite accettato è che la prima modifica di un'entità già esistente non ha uno stato precedente registrato.
6. **Un codice comune `STALE`; `RATECARD_STALE` viene rimosso.** Alternativa scartata: un codice per entità, oppure tenere `RATECARD_STALE` come alias. Perché: il client ha una sola ramificazione, e l'unico consumatore migra in questo ciclo.
7. **Un body senza versione riceve `409 STALE`, non 400.** Alternativa scartata: 400. Perché: una pagina vecchia in cache riceve "ricarica", come già succede all'array nudo della ratecard.
8. **Il client usa `js/lib/save.js` → `apiSave(method, path, body)` sopra `apiFetch`, che impara a gestire i corpi non JSON.** Alternativa scartata: sostituire `apiFetch`, oppure avvolgere i metodi `Api.*`. Perché: overlay, redirect su 401 e timeout restano in un solo posto.
9. **Un 401 dà `kind: 'error'`, con il redirect già in corso.** Alternativa scartata: un sesto esito `unauthorized`. Perché: la pagina non ha niente da mostrare mentre si apre il login.
10. **Il guard lato client copre tutte le scritture di `js/`, non solo quelle delle entità registrate. Un `fetch` di sola lettura non conta.** Alternativa scartata: vietare ogni `fetch` diretto, letture comprese. Perché: `handbook.js` legge file statici, e il ciclo 7 deve poter svuotare la lista.
11. **Il guard lato server è lessicale: l'SQL di scrittura deve stare dentro `versionedWrite(`, sulle tabelle di testata più `ratecard_entries`.** Alternativa scartata: includere già le tabelle di struttura (`phases`, `tasks`, `task_roles`, quelle dei progetti). Perché: la loro forma dipende da come il ciclo 2 farà lo snapshot della struttura.
12. **Le eccezioni sono per file lato client e per coppia `(file, tabella)` lato server, con una lista `RETIRED` e il fallimento sulle voci senza violazioni.** Alternativa scartata: eccezioni per singola riga. Perché: è il taglio con cui lavorano i cicli 2-7.
13. **`reset.js` (eliminazione in blocco e cambio di owner) va nella lista delle eccezioni lato server.** Alternativa scartata: registrare già ora anche le eliminazioni in blocco. Perché: è fuori dallo scope del Brief, e lo decide il ciclo 7.
14. **Il guard fallisce quando un metodo di scrittura di `Api.*` in `js/api.js` non ha più chiamanti in `js/`. In questo ciclo si tolgono i quattro metodi resi orfani dai piloti e i due che non avevano già chiamanti.** Alternativa scartata: un ciclo finale di pulizia. Perché: il codice morto si accumulerebbe per sei cicli.
15. **Eliminare un ruolo aumenta la versione e scrive il registro di ogni ratecard che lo conteneva, nella stessa transazione (§4.3).** Alternativa scartata: lasciare che il `CASCADE` modifichi le voci senza versione né registro, come limite dichiarato. Perché: altrimenti il registro della ratecard perde una modifica, e un editor aperto salverebbe da una versione che il server considera ancora corrente.
