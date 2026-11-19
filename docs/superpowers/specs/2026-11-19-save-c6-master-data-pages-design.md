# Contratto di salvataggio, ciclo 6: pagine dei master data sul contratto — design spec

**Date:** 2026-11-19
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c6-master-data-pages-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-13, SY-15, SY-16, SY-17, lato client di SY-20)
**Scenario:** 3 (audit-fix)
**Classe di rischio:** high-risk (importi: POT e tassi; nuove regole lato server; migrazione; file condivisi `js/api.js` e `js/lib/save.js`)
**Security surface:** yes — team e attribute-lists passano da `fetch` diretto ad `apiFetch` (redirect su 401); le regole di unicità e di cancellazione passano dal client al server, sotto `requireAdmin`

Ogni scrittura di master-clients, master-pipelines, master-currencies, team, attribute-lists, `js/clients.js` e del modal cliente di project-config passa da `apiSave`. L'esito distingue "la scrittura è fallita" da "la ricarica è fallita". Dopo un salvataggio la pagina adotta la risposta del server. L'unicità dei nomi di clienti e gruppi, e il divieto di cancellare un anno con POT, li applica il server.

## 1. Fatti verificati

- `apiSave` (`js/lib/save.js`) non lancia mai eccezioni e risponde `ok | conflict | rule | error | unknown`. Lo caricano `costgrid`, `master-clients`, `master-roles`, `pipeline`, `portfolio`, `program` e `project-config` (`?v=2`).
- `CLIENT_EXEMPT` di `scripts/save-contract-guard.test.js` contiene `js/clients.js`, `js/pages/master-clients.js`, `js/pages/master-currencies.js`, `js/pages/master-pipelines.js`, `js/pages/team.js` e `js/pages/project-config.js: clients.create`. `js/pages/attribute-lists.js` non c'è: il guard non vede le sue scritture, perché il metodo sta in una variabile del wrapper `request()`.
- Nella tabella `clients` (5 righe) e in `client_groups` (1 riga) del DB principale non ci sono nomi duplicati senza distinzione di maiuscole. Nessuna delle due tabelle ha un indice unico sul nome. L'unico indice di questo tipo è quello di `attribute_list_items`, aggiunto dalla migrazione `021`, che prima rinomina i duplicati. L'ultima migrazione è la `037`.
- `POST /clients` controlla il duplicato con una `SELECT` prima dell'`INSERT`; `PATCH /clients/:id`, `POST /client-groups` e `PATCH /client-groups/:id` non lo controllano.
- `DELETE /pipeline-years/:id` rifiuta (409, senza `code`) solo se una `cost_grid_versions` usa l'anno. Lo fa con tre query separate.
- `pots.year` è un intero, non una FK a `pipeline_years`, e `POST /pots` non controlla che l'anno esista.
- `PATCH /pots/:id` legge il vecchio importo sotto lock e scrive una riga di `pot_history` con la nota obbligatoria. Risponde con la riga intera.
- `PATCH /currencies/:code/rate` risponde `{ code, rate }`; `POST /currencies/:code/activate` risponde con la riga intera.
- `POST /resources/aliases` (ciclo 5) risponde 201 per un alias nuovo e 200 per la stessa risoluzione già presente, con lo stesso corpo (la riga). Una risoluzione diversa riceve `409 { code: 'ALREADY_RESOLVED', alias }`.
- `PATCH /resources/:id` aggiorna solo i campi presenti nel corpo e risponde 400 "No fields to update" se non ce n'è nessuno.
- `team.js` legge e scrive con `fetch` diretto più `await res.json()`. `attribute-lists.js` usa `request()`, che non lancia mai e restituisce `{ ok, status, data }`; scrive anche i topic (`/api/topics`).
- `moveClient` (`js/lib/master-clients.js`) riceve un oggetto `{ assignClient, removeClient }` le cui funzioni lanciano in caso di fallimento; il rollback dipende da questo.
- `js/clients.js` (modal clienti di `costgrid.html`) usa `Api.clients.*` e un `alert()` nativo; nelle sei pagine che lo caricano compare senza `?v=`.
- I metodi `Api.clients.{create,update,delete}`, `Api.clientGroups.{create,rename,delete,assignClient,removeClient}`, `Api.pipelineYears.{create,toggle,delete}`, `Api.pots.{create,update,delete}` e `Api.currencies.{activate,updateRate}` sono chiamati solo dai file di questo ciclo e da `project-config.js` (`clients.create`).

## 2. Server

### 2.1 Migrazione `038_unique_client_group_names.sql`

- Per `clients` e per `client_groups`, separatamente, segue lo schema della `021`:
  - per ogni gruppo di nomi uguali senza distinzione di maiuscole (`lower(name)`), il più vecchio (`created_at, id`) resta com'è;
  - gli altri prendono il suffisso ` (duplicate n)`, troncando il nome perché stia in 255 caratteri.
- Poi crea `CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_name_lower ON clients (lower(name))` e `uq_client_groups_name_lower ON client_groups (lower(name))`.
- Le route scrivono già il nome con `trim()`, quindi l'indice non ha bisogno di `btrim`.
- La migrazione si può rieseguire: con l'indice già creato non resta nessun duplicato da rinominare.

### 2.2 Nomi di clienti e gruppi

- `POST /clients`, `PATCH /clients/:id`, `POST /client-groups` e `PATCH /client-groups/:id` trasformano il `23505` dell'indice in `409 { error, code: 'NAME_TAKEN' }`, con questi messaggi:
  - `A client named "<nome>" already exists.`
  - `A group named "<nome>" already exists.`
- La `SELECT` di controllo di `POST /clients` va tolta: con due richieste concorrenti la vinceva una sola, e adesso lo fa l'indice.
- Le risposte riuscite non cambiano (`{ id, name }` per i clienti, la riga del gruppo per i gruppi).

### 2.3 Cancellazione di un anno di pipeline

`DELETE /pipeline-years/:id` gira in `withTransaction`:

1. `SELECT year FROM pipeline_years WHERE id = $1 FOR UPDATE`: se l'anno non c'è, 404 come oggi.
2. Una `cost_grid_versions` con quell'anno → `409 { error: <messaggio attuale>, code: 'YEAR_IN_USE' }`.
3. Una `pots` con quell'anno → `409 { error: 'Pipeline <anno> cannot be deleted because it has POT targets. Deactivate it instead.', code: 'YEAR_HAS_POTS' }`.
4. `DELETE`, poi 200 `{ ok: true }`.

Resta una finestra, documentata in `docs/api/config.md`: un `POST /pots` per lo stesso anno, concorrente alla cancellazione, può creare un POT per un anno appena cancellato. `POST /pots` non verifica l'anno, e farlo sarebbe una regola nuova (Decisione 6).

## 3. Client

### 3.1 `js/lib/save.js`

- `saveAndReload(method, path, body, reload, opts)`:
  - chiama `apiSave(method, path, body, opts)`;
  - con un esito `ok` o `unknown` chiama poi `await reload()`: la ricarica è riuscita se la funzione risolve un valore diverso da `false` e non lancia;
  - restituisce l'esito di `apiSave` più `reloaded: true | false`; con `conflict`, `rule` o `error` non ricarica e `reloaded` è `false`.
- `SAVED_NOT_RELOADED = "Saved, but the list couldn't be reloaded. Reload the page to see the latest."`
- Entrambi passano anche su `window` (`window.saveAndReload`, `window.SAVED_NOT_RELOADED`).

### 3.2 `js/api.js`

I metodi di scrittura elencati nel §1 vengono cancellati, perché restano senza chiamante (regola del guard). Restano i metodi di lettura.

### 3.3 master-clients (`js/pages/master-clients.js`)

- `loadAll` e `reloadGroups` restituiscono `true`/`false`. `loadAll` continua a impostare `globalError` quando fallisce al caricamento della pagina. `reloadGroups` non lo imposta più: lo decide il chiamante.
- **Creazione di un cliente**: `apiSave('POST', '/clients', { name })`. Il cliente aggiunto alla lista usa `res.data.id` e `res.data.name`. L'assegnazione al gruppo scelto e la sua gestione degli errori restano come sono, e le chiamate passano dall'adattatore del punto successivo.
- **Spostamento tra gruppi**: `moveTo` passa a `moveClient` un adattatore, `{ assignClient, removeClient }`. Ognuna delle due funzioni chiama `apiSave` e, se l'esito non è `ok`, lancia un `Error(res.message)`. Rollback e `reloadGroups` nel `finally` restano come sono (vincolo del Brief).
- **Rinomina**: `apiSave('PATCH', '/clients/' + id, { name })`, poi `c.name = res.data.name`.
- **Cancellazione di un cliente**: `apiSave('DELETE', …)`. La riga sparisce solo con `ok`; con `unknown` la pagina ricarica tutto.
- **Gruppi** (creazione, rinomina, cancellazione): `saveAndReload(…, () => this.reloadGroups())`. Con `reloaded === false` e un esito `ok` compare `SAVED_NOT_RELOADED` in `globalError`.
- **Esiti**: con `rule`, `error` o `conflict` compare `res.message` nel campo del form (creazione, rinomina) o in `globalError` (cancellazione, spostamento). Con `unknown` compare `res.message` e la pagina ricarica.
- I controlli dei duplicati lato client (`createClient`, `saveClientEdit`, `groupNameError`) restano come risposta immediata. Quello che decide è il 409 `NAME_TAKEN` del server, mostrato nel form.

### 3.4 `js/clients.js` e il modal cliente di project-config

- `saveClientFromModal` usa `apiSave` per `POST` e `PATCH` e adotta `res.data` (`id`, `name`). Un esito diverso da `ok` mostra `res.message` in `#clientModalError`.
- `deleteClient` usa `apiSave('DELETE', …)`; un fallimento mostra `showInfo('Delete failed: ' + res.message)` al posto di `alert()`.
- `saveClientModal` di `js/pages/project-config.js` usa `apiSave('POST', '/clients', { name })`, poi `loadClientsFromApi()` (che non lancia) e `this.project.clientId = res.data.id`.
- Se `res.data.name` è un nome trimmato, la lista mostra quello.

### 3.5 master-pipelines (`js/pages/master-pipelines.js`)

- `loadPots` restituisce `true`/`false`.
- **Anni**:
  - creazione: `apiSave('POST', '/pipeline-years', { year, active: false })`, poi push di `res.data`;
  - attivazione: `apiSave('PATCH', …, { active })`, poi `py.active = res.data.active`;
  - cancellazione: `apiSave('DELETE', …)`.
  - Con `YEAR_HAS_POTS`, `YEAR_IN_USE` o un altro errore compare `res.message` in `globalError` e l'anno resta. Con `unknown` compare il messaggio e la pagina chiama `loadAll()`.
- **Creazione di un POT**: `saveAndReload('POST', '/pots', body, () => this.loadPots())`.
  - Con un esito `ok` il form si chiude sempre. Se `reloaded === false`, `globalError = SAVED_NOT_RELOADED`.
  - Con `unknown` il form si chiude e compare `res.message`: la ricarica, se riesce, mostra se il POT c'è.
  - Con un rifiuto il form resta aperto con `res.message` (per esempio il 409 "A POT already exists…").
- **Modifica di un POT**: `apiSave('PATCH', …, { amount, note })`, poi `p.amount = res.data.amount` (come oggi) e `invalidatePotDetails`.
- **Cancellazione di un POT**: `apiSave('DELETE', …)`.
- `refreshYearData()` resta in fire-and-forget (SY-14, fuori scope).

### 3.6 master-currencies (`js/pages/master-currencies.js`)

- `loadAll` restituisce `true`/`false` e imposta `globalError` solo quando la chiamata arriva dal caricamento della pagina (`created`).
- **Tasso** (`confirmRate`): `saveAndReload('PATCH', '/currencies/' + code + '/rate', { rate }, () => this.loadAll({ quiet: true }))`.
  - Con `ok`: il dialogo e la riga in modifica si chiudono, e la riga prende `current_rate = res.data.rate` prima della ricarica. Se `reloaded === false`, `globalError = SAVED_NOT_RELOADED`. Poi parte `loadHistories([code])`.
  - Con un rifiuto: `confirm.error = res.message` e il dialogo resta aperto.
  - Con `unknown`: il dialogo si chiude e compare `globalError = res.message`.
- **Attivazione** (`activateCurrency`): stesso schema. La riga prende `res.data` (la riga intera), e un rifiuto va in `act.error`.

### 3.7 team (`js/pages/team.js`)

- **Letture**: risorse, ruoli, utenti, profilo, coda unmatched e alias passano da `apiFetch('/resources…')` (e da `/roles`, `/users/active-list`) dentro un `try/catch`.
  - Il messaggio d'errore è `e.message`. Una risposta non JSON diventa il messaggio di `apiFetch` (`HTTP 502`), non più "Network error.".
  - Un 401 porta al login (`apiFetch`).
  - Le funzioni restituiscono ancora una stringa d'errore o `null` (`loadResources` …) e `true`/`false` (`loadUnmatched`), come oggi.
- **Scritture**: `apiSave`.
  - **Assign e Ignore** (`postAlias`):
    - con `ok` (201 o 200) il banner di successo è quello di oggi, perché in entrambi i casi il nome è risolto come chiesto;
    - con `error` e status 409 (`ALREADY_RESOLVED`) compaiono `res.message` e la ricarica della coda;
    - con `unknown` compaiono `res.message` e la ricarica della coda.
  - **Rimozione di un alias e rescan**: `apiSave`, poi `loadUnmatched()` come oggi; con un esito diverso da `ok` compare `res.message`.
  - **Creazione di una risorsa**: `apiSave('POST', '/resources', payload)`. Il riquadro "created" usa `res.data`. Poi parte la ricarica: se fallisce, compare il banner di errore di oggi con `SAVED_NOT_RELOADED`.
  - **Modifica di una risorsa**:
    - il drawer conserva i valori con cui si è aperto (`form.initial`);
    - il `PATCH` invia solo i campi che sono cambiati;
    - senza campi cambiati il drawer si chiude senza richiesta e con il banner "No changes.";
    - con `ok` la risorsa in lista prende `res.data` prima della ricarica.
  - **Stato attivo/inattivo e cancellazione**: `apiSave`. Una cancellazione con `unknown` ricarica la lista.
  - Su ogni scrittura, con `unknown` il messaggio è `res.message` (`UNKNOWN_MESSAGE`), non "Network error.".

### 3.8 attribute-lists (`js/pages/attribute-lists.js`)

- `request()` ed `errorText()` vengono cancellati.
- **Letture** (`loadLists`, `loadTopics`, `loadItems`): un metodo `read(path)` chiama `apiFetch(path)` dentro `try/catch` e restituisce `{ ok, data, message }`. I chiamanti attuali di `r.ok` e `r.data` restano invariati.
- **Scritture**: `apiSave(method, path, body)` (path senza `/api`).
  - I punti che oggi leggono `r.ok` leggono `res.kind === 'ok'`.
  - Quelli che leggono `r.data` leggono `res.data`.
  - Quelli che leggono `errorText(r)` leggono `res.message`.
  - Con `unknown`, `topicAction` ricarica come oggi; i drawer mostrano `res.message` e restano aperti.
- I banner "…, but the topics couldn't be reloaded" e "The list was reloaded / couldn't be reloaded" restano come sono (vincolo del Brief).

## 4. Guard — `scripts/save-contract-guard.test.js`

- Da `CLIENT_EXEMPT` a `RETIRED`:
  - `js/clients.js`
  - `js/pages/master-clients.js`
  - `js/pages/master-currencies.js`
  - `js/pages/master-pipelines.js`
  - `js/pages/team.js`
  - `js/pages/project-config.js: clients.create`
- Il commento in cima a `CLIENT_EXEMPT` va aggiornato.
- `js/pages/attribute-lists.js` non entra in nessuna lista, perché senza `request()` non scrive più con un metodo in variabile. La sua migrazione la verifica un test di pagina (§7).

## 5. Cache-busting

- `js/lib/save.js` `?v=2` → `?v=3` nelle sette pagine che lo caricano. Lo aggiungono, a `?v=3`, `master-pipelines.html`, `master-currencies.html`, `team.html` e `attribute-lists.html`, come `type="module"` prima dello script della pagina.
- `js/api.js` `?v=20` → `?v=21` in ogni pagina.
- `js/clients.js` riceve `?v=1` in tutte e sei le pagine che lo caricano.
- Gli script di pagina toccati salgono di uno: `master-clients` 2→3, `master-pipelines` 1→2, `master-currencies` 1→2, `team` 1→2, `attribute-lists` 1→2, `project-config` 3→4.

## 6. Documentazione

- `docs/pages/config.md`: esiti delle scritture di Clients & groups, Pipelines & POTs e Currencies; il 409 `NAME_TAKEN` e `YEAR_HAS_POTS`.
- `docs/pages/team.md`: letture e scritture da `apiFetch`/`apiSave`, `PATCH` dei soli campi cambiati, esito dell'alias.
- `docs/pages/attribute-lists.md`: `request()` sostituito.
- `docs/api/config.md`: unicità dei nomi (indice, `NAME_TAKEN`), cancellazione dell'anno (`YEAR_IN_USE`, `YEAR_HAS_POTS`) e la finestra del §2.3. Se le route di client-groups e pipeline-years non vi sono descritte, vanno nel file che le descrive.
- `docs/api/resources.md`: il client distingue 409 `ALREADY_RESOLVED`.
- `docs/db/migrations.md`: la `038`.
- `docs/js/lib.md`: `saveAndReload`, `SAVED_NOT_RELOADED`.
- `handbook/restricted/TEST_CASES.md`: i casi `MDR-*`.

## 7. Verifica

- **`test-api.js`**, casi `MDR-*`:
  - `MDR-01`: cliente creato con un nome già usato con maiuscole diverse → 409 `NAME_TAKEN`;
  - `MDR-02`: rinomina di un cliente nel nome di un altro → 409 `NAME_TAKEN`, il nome resta;
  - `MDR-03`: rinomina di un cliente nel proprio nome con maiuscole diverse → 200;
  - `MDR-04`: gruppo creato con un nome già usato → 409 `NAME_TAKEN`;
  - `MDR-05`: rinomina di un gruppo nel nome di un altro → 409 `NAME_TAKEN`;
  - `MDR-06`: cancellazione di un anno con un POT → 409 `YEAR_HAS_POTS`, l'anno resta;
  - `MDR-07`: cancellazione di un anno usato da una versione → 409 `YEAR_IN_USE`;
  - `MDR-08`: il nome restituito da `POST` e `PATCH /clients` è trimmato.
- **vitest**:
  - `js/lib/save.test.js` (`saveAndReload`):
    - con `ok` ricarica e `reloaded: true`;
    - con una ricarica che lancia, oppure che risolve `false`, `reloaded: false` e la scrittura resta `ok`;
    - con `unknown` ricarica;
    - con `rule`, `error` e `conflict` non ricarica.
  - Un test di pagina `js/lib/master-data-save-guard.test.js`: in `js/pages/attribute-lists.js` e `js/pages/team.js` non resta nessun `fetch(`, e ogni scrittura usa `apiSave`/`saveAndReload`.
  - `js/lib/save-overlay-trigger.test.js` e i guard di pagina esistenti aggiornati, dove leggono i metodi cancellati.
- **A mano** (branch stack): i criteri 1, 2, 5 e 6.

## Criteri di accettazione

1. **POT salvato, ricarica fallita** — con `GET /api/pots` bloccato dopo il `POST`, la creazione chiude il form e mostra "Saved, but the list couldn't be reloaded…"; un secondo tentativo con lo stesso target riceve dal server il 409 "A POT already exists…" (vitest su `saveAndReload`; a mano).
2. **Tasso salvato, ricarica fallita** — con `GET /api/currencies` bloccato dopo il `PATCH`, la pagina mostra "Saved, but the list couldn't be reloaded…" e il tasso nuovo nella riga, non "Failed to load" (a mano).
3. **Nomi duplicati rifiutati dal server** — creazione e rinomina di clienti e gruppi su un nome già usato rispondono 409 `NAME_TAKEN` (`test-api.js` `MDR-01..MDR-05`); la pagina mostra il messaggio nel form.
4. **Anno con POT** — `DELETE /pipeline-years/:id` di un anno con un POT risponde 409 `YEAR_HAS_POTS` e l'anno resta (`test-api.js` `MDR-06`).
5. **team e attribute-lists su `apiFetch` (security surface)** — con la sessione scaduta, una lettura o una scrittura di team o di attribute-lists porta a `/login.html`; un 502 HTML su una scrittura mostra il messaggio "esito sconosciuto", non "Network error." (a mano; `master-data-save-guard.test.js` per l'assenza di `fetch(`).
6. **Valori del server** — dopo una rinomina con spazi iniziali, il cliente mostra il nome trimmato restituito dal server; dopo una modifica di una risorsa che cambia un solo campo, il `PATCH` contiene solo quel campo (a mano; `test-api.js` `MDR-08`).
7. **Alias** — un Assign su un nome che un altro admin ha risolto in modo diverso mostra il messaggio `ALREADY_RESOLVED` e ricarica la coda (a mano).
8. **Guard** — le sei voci del §4 sono in `RETIRED`, non in `CLIENT_EXEMPT`, e `scripts/save-contract-guard.test.js` passa.
9. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
10. **Documentazione** — i documenti del §6 sono aggiornati; `scripts/doc-paths-guard.test.js` passa.
11. **Backlog** — al Gate 5 le voci aperte di `docs/BACKLOG.md` su queste pagine e route sono rilette, e quelle superate vengono chiuse con il controllo eseguito.

## Scope escluso

- Ruoli e ratecard (ciclo 1).
- Atomicità lato server di POT, valute e alias (ciclo 5).
- Change log e controllo di versione (409 `STALE`) per clienti, gruppi, anni, POT, valute, risorse e liste (Decisione 2).
- `refreshYearData()` e `refreshRatecards()` in fire-and-forget (SY-14).
- Lo spostamento di un cliente in una sola transazione lato server (B-270).
- La verifica, in `POST /pots`, che l'anno esista (Decisione 6).
- Le altre pagine con `fetch` diretto (admin, login, profile …): ciclo 7.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

- `js/clients.js` compare senza `?v=` in sei pagine. Questo ciclo lo versiona solo perché lo modifica; nessun guard pretende il `?v=` sugli script condivisi diversi da quelli di `js/lib/foundations-guard.test.js`.
- `POST /pots` accetta un anno che non ha una riga in `pipeline_years`.

## Decisioni aperte

1. **Duplicati: indice unico su `lower(name)` con migrazione che rinomina i duplicati esistenti.** Alternativa scartata: un controllo solo nella route. Perché: con un controllo nella route, due admin possono ancora creare lo stesso nome nello stesso momento; la `021` è il precedente.
2. **Nessun controllo di versione, POT compresi.** Alternativa scartata: 409 `STALE` sui POT. Perché: `PATCH /pots` legge il vecchio importo sotto lock e lo scrive nello storico con una nota obbligatoria, quindi nessuna modifica si perde in silenzio; il registro è escluso dal Brief.
3. **Il wrapper di attribute-lists viene tolto, non ricostruito su `apiSave`.** Alternativa scartata: `request()` riscritto sopra `apiSave`. Perché: una seconda forma di esito è proprio ciò che SY-15 segnala.
4. **`saveAndReload` e `SAVED_NOT_RELOADED` condivisi in `js/lib/save.js`.** Alternativa scartata: ogni pagina gestisce da sé la ricarica. Perché: la regola "scrittura fallita / ricarica fallita" sta in un punto solo ed è testata.
5. **Anche l'esito `unknown` ricarica.** Alternativa scartata: ricaricare solo dopo `ok`. Perché: la ricarica mostra se la scrittura è avvenuta (per esempio se il POT c'è).
6. **La finestra fra `DELETE` dell'anno e `POST /pots` concorrente resta, documentata.** Alternativa scartata: `POST /pots` rifiuta un anno senza pipeline. Perché: è una regola nuova, fuori da SY-17.
7. **Codici `NAME_TAKEN`, `YEAR_HAS_POTS` e `YEAR_IN_USE` con status 409, non `*_RULE`.** Alternativa scartata: 400 `*_RULE`. Perché: il precedente è `GROUP_HAS_POT`; `apiSave` li mostra come `error` con il messaggio del server.
8. **Alias: 200 e 201 mostrano lo stesso banner.** Alternativa scartata: un campo `created` nella risposta. Perché: in entrambi i casi il nome è risolto come l'utente ha chiesto; solo il 409 cambia ciò che vede.
9. **Anche le letture di team passano ad `apiFetch`.** Alternativa scartata: migrare solo le scritture. Perché: un 401 su una lettura porta al login anche lui (criterio 5).
10. **Incluso `project-config.js: clients.create`.** Alternativa scartata: lasciare quell'eccezione. Perché: stessa entità e stessa forma di SY-13, ed è l'ultimo chiamante di `Api.clients.create`.
11. **Modifica di una risorsa: `PATCH` dei soli campi cambiati, nessuna richiesta senza cambiamenti.** Alternativa scartata: inviare sempre i sei campi. Perché: con un drawer vecchio, l'invio dei sei campi cancella le modifiche fatte da un altro admin ai campi non toccati (SY-16, SY-20).
