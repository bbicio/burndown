# Backlog, ciclo 2: validazione e integrità dei dati lato server — design spec

**Date:** 2026-11-11
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-backlog-c02-server-validation-integrity-brief.md`
**Scenario:** 3 (audit → fix), più B-229 dall'indice (`docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`, "Correzioni dal ciclo 0")

Le route toccate rispondono 400/404/409 a input malformato o a risorsa assente, mai 500; i controlli ripetuti vivono in un modulo di `api/src/lib/`; i NUMERIC arrivano come numeri.

## 1. Fatti verificati nel codice (a `c49a1d8`)

- **B-042:** `GET /api/pots/summary` passa `clientId`, `clientGroupId` e `parseInt(year)` (anche `NaN`) a pg senza controllo; il 22P02 arriva all'handler globale di `api/src/index.js`, che risponde 500.
- **B-236:** `POST /api/pots` accetta qualunque `specialLabel` truthy. `master-pipelines.html` manda solo `'Unassigned / To be Identified'` e `'New Biz'`; il DB principale non ha POT speciali.
- **B-010, B-212 (UUID):** `UUID_RE` ha sei copie in `api/src/routes`: `auth.js`, `config.js`, `cost-grids.js`, `topics.js` e due inline in `projects.js` (`POST /` e `PATCH /:id`). Il client ne ha due: `js/api-sync.js` (`_pushProjectToApiDetailed`) e `js/lib/costgrid-calc.js` (`cgApiClientId`).
- **B-212 (resto):** il `PATCH /api/ratecards/:id/entries` fa un INSERT per voce e accetta `roleId` duplicati (vince l'ultimo).
- **B-207:** `POST /api/ratecards` inserisce `clientId || null`; `POST /api/ratecards/clone` copia la sola `hourly_rate` dalla rate card senza cliente. Unico chiamante della creazione: `master-clients.html`, sempre con `client.id`. `Api.ratecards.clone` (`js/api.js`) non ha chiamanti. `test-api.js` crea rate card con `clientId: null`. DB principale: una rate card, nessuna senza cliente.
- **B-209:** `ratecards` ha `id, client_id, name, created_at`, nessuna versione; il `PATCH …/entries` sostituisce l'intero set sotto `FOR UPDATE` senza sapere da quale stato è partito il client; un ruolo cancellato fa rispondere 400 "Unknown role in the entries" (23503).
- **B-334:** `POST /api/currencies/:code/activate` e `PATCH /api/currencies/:code/rate` controllano solo `rate > 0`. Il client ha già `RATE_MIN = 0.000001`, `RATE_MAX = 9999.999999` e il messaggio `Rate must be between 0.000001 and 9999.999999` (`js/lib/master-currencies.js`).
- **B-189, B-192 (progetti):** `PUT /api/projects/:id/tasks`, `PATCH /:id/phasing` e `PATCH /:id/ptc` leggono la valuta con una SELECT separata, fuori o prima del lock della riga; per un progetto inesistente la valuta è `undefined` e le due `PATCH` rispondono 200 senza scrivere. `canEdit` restituisce `true` a un admin senza guardare se il progetto esiste.
- **B-189, B-192 (cost grid):** `PUT /api/cost-grids/:id/versions/:vId/structure` legge `locked, currency` prima della transazione e prima di `lockVersion`; per una versione inesistente un tasso risponde 400 "…for undefined.".
- **B-191:** in `PUT /api/projects/:id/tasks` una risorsa `null` passa la normalizzazione e viene rifiutata come `Hourly rate of "" on task "X"`.
- **B-229:** nel `PUT structure` `customByCode[r.roleCode] = r.rateIsCustom === true` vale per ogni ruolo con codice, mentre `rateByCode` si riempie solo quando `r.rate != null`.
- **B-297:** `GET /api/pipeline-years` conta come `offers` le proposte visibili la cui versione di riferimento non è Draft né Canceled; `DELETE /api/pipeline-years/:id` rifiuta con 409 se esiste **qualunque** versione con quel `pipeline_year`. `deleteBlock` di `master-pipelines.html` guarda `offers` e i POT.
- **B-292:** `task_roles.days` contiene ore: il fee di `cost-grids.js` è `tr.days * rate` e `/api/reporting/phasing` usa `hrs = d`. `GET /api/exports/phasing` usa `hrs = d * 8`, quindi le ore **e gli importi** dell'XLS sono 8 volte quelli della vista.
- **B-280:** `GET /api/client-groups` esegue la subquery `pots` per ogni chiamante e la scarta in JS per i non-admin.
- **B-223, B-193:** misure in sola lettura nella sezione 2.

## 2. Misure sul DB principale (2026-11-11, `BEGIN READ ONLY`)

- Colonne `numeric`: `currency_rate`, `current_rate`, `currency_rates.rate` `(10,6)`; `pots.amount`, `pot_history.*` `(14,2)`; `hourly_rate`, `rate_override`, `tasks.ptc` `(10,2)`; `task_roles.days` `(6,2)`; `profile_unmatched.hours` senza precisione.
- Massimi: `pots.amount` 400000.00, tassi 1.300000, `roles.hourly_rate` 400.00, `task_roles.days` 1084.00, `tasks.ptc` 44444.00, `profile_unmatched.hours` 193 (scala massima 2), fee massimo di una versione 216630.0000. Tutti esatti in un double.
- Progetti: 15, tutti EUR; phasing mensile massimo 25462.14; riga PTC massima 100.
- Nessun test o codice confronta un NUMERIC come stringa (`test-api.js` usa `Number()`; `CGB-03` pretende già un numero).

## 3. Modulo condiviso `api/src/lib/input-rules.js`

Funzioni pure, testate con `node:test` in `input-rules.test.js`:

- `isUuid(v)` — `true` solo per una stringa UUID.
- `decimalRangeError(n, { min, max, label })` — messaggio d'errore o `null`; rifiuta un non-numero, un non finito e un valore fuori intervallo.
- `SPECIAL_POT_LABELS` (`['Unassigned / To be Identified', 'New Biz']`) e `specialLabelError(v)` — accetta solo un'etichetta della lista, identica, senza trim.

Le sei copie server di `UUID_RE` usano `isUuid`. Le due copie client restano (sezione 9).

## 4. Route

### 4.1 POT (B-042, B-236)

- `GET /api/pots/summary`: `year` deve essere un intero; `clientId`/`clientGroupId` presente deve passare `isUuid`. Altrimenti `400 { error }`.
- `POST /api/pots`: un `specialLabel` presente deve passare `specialLabelError`. Altrimenti `400 { error }`, nessuna riga scritta.

### 4.2 Valute (B-334)

`activate` e `PATCH rate` rifiutano con `400 { error: 'Rate must be between 0.000001 and 9999.999999' }` un tasso fuori intervallo (`decimalRangeError`). La lettura con `parseFloat` del body resta.

### 4.3 Rate card (B-207, B-209, B-212)

- **Migrazione `035_ratecard_version.sql`:** `ALTER TABLE ratecards ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0`. Annotata in `docs/db/migrations.md`.
- `POST /api/ratecards`: `clientId` obbligatorio e `isUuid`; un cliente inesistente (23503) risponde 400. Risponde anche `version`.
- `POST /api/ratecards/clone` è rimossa, e con lei `Api.ratecards.clone` in `js/api.js`. Ogni riferimento `js/api.js?v=N` passa allo stesso `N` nuovo.
- `GET /api/ratecards` e `GET /api/ratecards/:id` restituiscono `version`.
- `PATCH /api/ratecards/:id/entries` accetta `{ version, entries }`:
  - body ad array (la pagina in cache precedente a questo ciclo) o `version` diversa da quella in DB letta sotto `FOR UPDATE` → `409 { error: 'This rate card was changed by someone else. Reopen it to see the current rates.', code: 'RATECARD_STALE' }`, nessuna scrittura;
  - `roleId` duplicato → `400`;
  - le voci di un ruolo che non esiste più vengono scartate prima della scrittura;
  - le voci restanti si scrivono con un solo `INSERT … SELECT … FROM unnest(…) ON CONFLICT … DO UPDATE`;
  - `version` sale di 1 nella stessa transazione e la risposta è `{ ok: true, version }`.
- `master-clients.html`: alla apertura tiene `rc.version`, al salvataggio la manda e poi aggiorna la propria con quella della risposta; su `409` mostra il messaggio del server come errore della modale.

### 4.4 Progetti (B-189, B-191, B-192)

- `PATCH /:id/phasing` e `PATCH /:id/ptc`: in una transazione, `SELECT currency FROM projects WHERE id = $1 FOR UPDATE`; nessuna riga → `404 { error: 'Project not found' }`; il controllo dell'importo usa quella valuta, poi l'`UPDATE`.
- `PUT /:id/tasks`: la valuta si legge nella SELECT `FOR UPDATE` già presente; i controlli dei tassi si spostano lì dentro. Nessuna riga → `404`.
- Una voce di `resources` che non è un oggetto → `400 { error: 'Task "X" has an empty resource entry.' }`.
- Un id che non passa `isUuid` → `400` sulle tre route.
- Un non-admin su un id inesistente continua a ricevere `403` da `canEdit`.

### 4.5 Cost grid (B-189, B-192, B-229)

- `PUT …/versions/:vId/structure`: `:vId` che non passa `isUuid` → 400; la valuta si legge dopo `lockVersion`, nella transazione, e i controlli dei tassi (ruoli, PTC, override) la usano lì; versione inesistente → `404 { error: 'Version not found' }`. Il controllo `locked` resta prima di ogni scrittura.
- `customByCode[r.roleCode]` è `true` solo quando `r.rateIsCustom === true` **e** `r.rate != null`.

### 4.6 Importi JSONB (B-223)

`ptcRowsError` e `phasingError` (`api/src/lib/money-rules.js`) usano `MAX_NUMERIC_14_2` al posto di `MAX_DECIMAL_10_2`. Gli altri usi di `MAX_DECIMAL_10_2` non cambiano.

### 4.7 NUMERIC come numeri (B-193)

`api/src/db/client.js` registra `types.setTypeParser(1700, v => v === null ? null : parseFloat(v))` prima di creare il pool. Vale per ogni NUMERIC, anche i risultati di `SUM`/`ROUND`. `js/roles.js` non cambia.

### 4.8 Anni di pipeline (B-297)

- `GET /api/pipeline-years`, solo per admin e sysadmin, aggiunge a ogni anno `proposals`: il numero di cost grid con almeno una versione in quel `pipeline_year`, di qualunque stage.
- `deleteBlock` in `master-pipelines.html`, quando `proposals > offers`, risponde `Not available: N proposals (Drafts and Canceled included) use this pipeline. Hide it instead.` Il controllo su `offers` e sui POT resta.
- Il `DELETE` non cambia.

### 4.9 Export del phasing (B-292)

`GET /api/exports/phasing` usa `hrs = d`, come `/api/reporting/phasing`. Cambiano le ore e gli importi dei due fogli.

### 4.10 Gruppi di clienti (B-280)

`GET /api/client-groups` include la subquery `pots` nell'SQL solo per admin e sysadmin; la risposta non cambia.

## 5. Test

- `api/src/lib/input-rules.test.js`: UUID (valido, maiuscolo, troncato, non stringa), intervallo decimale (bordi inclusi, sotto, sopra, `NaN`, stringa), etichetta speciale (le due esatte, con spazio finale, minuscola, sconosciuta).
- `api/src/lib/money-rules.test.js`: PTC e phasing accettano un importo sopra `99999999.99` e rifiutano sopra `999999999999.99`.
- `test-api.js`, un caso per ogni rifiuto nuovo, con lettura del DB dopo il rifiuto per i casi di scrittura:
  - pots: `summary` con UUID malformato e anno non intero → 400; `POST` con `'New Biz '` → 400, nessuna riga;
  - valute: `activate` e `PATCH rate` con `0.0000001` e `16500` → 400, tasso invariato;
  - rate card: `POST` senza `clientId` → 400; `clone` → 404; `PATCH` ad array → 409; `PATCH` con versione vecchia → 409 e voci invariate; `roleId` duplicato → 400; voce di un ruolo cancellato scartata; `version` cresce di 1;
  - progetti: `phasing`, `ptc` e `tasks` su id inesistente come admin → 404; id non UUID → 400; risorsa `null` → 400; phasing invariato dopo il rifiuto;
  - cost grid: `structure` su versione inesistente → 404; un ruolo con `rateIsCustom: true` e `rate: null` si rilegge con `rateIsCustom: false`;
  - pipeline years: `proposals` presente per l'admin, assente per l'utente, e conta una cost grid con sola versione Draft;
  - export: le ore di una versione nota sono quelle di `/api/reporting/phasing`;
  - client-groups: un utente non riceve `pots`;
  - B-193: `GET /api/pots/:id/details` o `GET /api/ratecards` restituisce un `hourly_rate`/`amount` di tipo number.
- Frontend: `grep -rhoE "js/api\.js\?v=[0-9]+" --include=*.html . | sort | uniq -c` dà un solo `N` (nessun guard lo pinna oggi); `js/lib/master-clients-ratecard-guard.test.js` pretende che `saveClientRatecard` mandi `version`; `js/lib/master-data-guard.test.js` pretende il ramo `proposals` di `deleteBlock`.

## Criteri di accettazione

1. **Nessun 500 a input malformato** — ogni 400/404/409 della sezione 4 ha il suo caso in `test-api.js`, e per le scritture il DB è invariato dopo il rifiuto.
2. **Modulo condiviso** — `api/src/lib/input-rules.test.js` copre UUID, intervallo decimale ed etichetta speciale, e `grep -rn "0-9a-f\]{8}" api/src/routes` non trova niente.
3. **Rate card vecchia rifiutata** — un salvataggio con versione superata o con body ad array risponde 409 `RATECARD_STALE` senza cambiare le voci.
4. **Due schede sulla stessa rate card** — sullo stack di branch, in `master-clients.html`, la seconda scheda che salva dopo la prima mostra "This rate card was changed by someone else. Reopen it to see the current rates." e le voci della prima restano.
5. **Anno con soli Draft** — sullo stack di branch, un anno con una sola proposta Draft mostra Delete non disponibile con il messaggio della sezione 4.8.
6. **Export del phasing** — l'XLS scaricato da `master-pipelines.html` riporta, per un mese, le stesse ore della vista Phasing in modalità Proposal.
7. **NUMERIC come numeri** — il caso B-193 di `test-api.js` è verde.
8. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- Le regole su date e periodi (ciclo 3), l'hardening di sessione (ciclo 1), B-235 e B-293 (ciclo 14).
- B-378 (ore per alias e per progetto in `team.html`): resta aperta in `docs/BACKLOG.md`.
- Le copie client di `UUID_RE` (`js/api-sync.js`, `js/lib/costgrid-calc.js`): riga nuova in `docs/BACKLOG.md`.
- `/api/reporting/pipeline` e `/api/reporting/portfolio`, che calcolano il budget con `tr.days * 8` e non hanno chiamanti: riga nuova in `docs/BACKLOG.md`.
- La rate card senza cliente come default dell'agenzia; una rate card il cui cliente è cancellato (`ON DELETE SET NULL`).
- La conversione di valuta nell'export del phasing.
- Gli altri 22P02 delle route non nominate dal brief.

## Decisioni aperte

1. **B-378 fuori dal ciclo.** Alternativa scartata: aggiungere qui i campi API e le colonne di `team.html`. Perché: è una funzionalità, non validazione.
2. **B-209 con una colonna `version` sulla rate card e il 409 del body ad array.** Alternativa scartata: salvataggio voce per voce, oppure diff dallo stato di partenza. Perché: è il cambiamento minimo che blocca anche la pagina in cache.
3. **La voce di un ruolo cancellato a modale aperta viene scartata.** Alternativa scartata: rifiutare nominando il ruolo. Perché: la sua voce sparirebbe comunque con il ruolo.
4. **B-207: `clientId` obbligatorio, clone rimosso con `Api.ratecards.clone`.** Alternativa scartata: dare alla rate card senza cliente il significato di default dell'agenzia. Perché: è un cambiamento di prezzi, già escluso dal brief f4.
5. **B-193 con un type parser globale.** Alternativa scartata: cast `::float` query per query. Perché: i valori misurati sono esatti in un double e il parser copre ogni lettore.
6. **B-223: il tetto di PTC e phasing di progetto sale a `NUMERIC(14,2)`.** Alternativa scartata: chiudere la riga senza codice. Perché: sono JSONB senza vincolo di colonna, e `NUMERIC(14,2)` è già il tetto di un POT.
7. **B-297 risolta mostrando il blocco nella UI con un conteggio `proposals`.** Alternativa scartata: permettere il `DELETE` di un anno con soli Draft. Perché: lascerebbe versioni con un anno orfano.
8. **B-292 corregge anche gli importi dell'XLS.** Alternativa scartata: correggere solo il foglio delle ore. Perché: l'importo è calcolato da quelle ore.
9. **B-010 chiude solo le copie server.** Alternativa scartata: unificare anche le due copie client. Perché: il ciclo è lato server.
10. **I 404 nuovi valgono per admin e sysadmin; un non-admin su un id inesistente riceve 403.** Alternativa scartata: 404 per tutti. Perché: non si rivela l'esistenza di una risorsa a chi non la vede.
