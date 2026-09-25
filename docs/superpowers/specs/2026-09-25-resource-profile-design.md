# Ciclo 3 — Profilo risorsa da storico progetti (design)

Terzo dei quattro cicli dell'iniziativa resource-allocation (Ciclo 1: `team.html`/`attribute-lists.html`; Ciclo 2: tag linking proposal/progetto). Questo documento è una **spec di design unica** per l'intero Ciclo 3, che viene eseguito come **quattro sottocicli distinti, 3a–3d** (§2), ciascuno con il proprio piano di implementazione e il proprio `/finish-cycle`. Ultima revisione: 2026-09-25, in fase di design 3c (aggiunto 3d, riviste §5–§9 su dati reali).

## 0. Obiettivo

Costruire, per ogni risorsa, un profilo di esperienza derivato dallo storico dei progetti su cui ha lavorato (actuals), in modo che il Ciclo 4 possa candidarla a progetti e task simili (stesso mercato, brand, area terapeutica, tipo di servizio, task). Il profilo è **calcolato, mai inserito a mano**, e conservato come JSONB leggibile sia dalla UI (treeview) sia dall'AI del Ciclo 4.

Fuori scope (esplicito):
- Motore di suggerimento AI, ranking, chatbot su `planning.html` (Ciclo 4).
- Riassunto testuale generato dall'AI.
- Matching fuzzy dei nomi.
- Similarità semantica tra task (i nomi si normalizzano solo in modo sintattico).
- Filtro per tag nel pipeline board e tag in `portfolio.html`.
- Modifica degli actuals già caricati.
- Finding 2 del Ciclo 2 (rollback race di `toggleTag()` in `costgrid.html`).
- Hardening di `structure`/`linked-projects`/`duplicate` per il controllo di appartenenza `:vId`↔`:id` (stesso difetto delle tag route, ma restano un finding separato).
- Propagazione dei cambi successivi di tag dalla proposal al progetto e indicatore di divergenza: il progetto è autonomo dopo la copia iniziale.

## 1. Contesto verificato nel codice

- Gli actuals stanno in `timesheets(project_code, data JSONB, uploaded_by, uploaded_at)` (`001_initial.sql:163`); `data` contiene righe con `owner` (nome libero), `hours`, task, ruolo, data (`api/src/routes/timesheets.js:153-154`, colonne mappate da `colOwner` ecc. `:316-317`). Ogni upload **reimporta l'intero progetto** (non è incrementale).
- Il legame actuals → progetto è `timesheets.project_code` = `projects.code`.
- Esistono due collegamenti proposal↔progetto distinti:
  - `projects.cg_version_id` (impostato da `POST /api/projects` `projects.js:123` e `PATCH /api/projects/:id` `:153`): è quello che oggi blocca i tag con 409 (`projects.js:449-451`) e attiva `pipelineLocked` in `project-config.html:442-445`;
  - `cg_version_projects`, scritto da `POST .../linked-projects` (`cost-grids.js:671`): tiene i task associati e **non** modifica `cg_version_id`.
  Per i tag conta solo il primo.
- Oggi, per un progetto collegato, `loadTags()` legge i tag della versione (`project-config.html:546-548`), non `project_tags`.
- Nell'API non esiste alcun meccanismo di job schedulati (nessun cron, `setInterval` o coda).

## 2. Decomposizione in sottocicli

Ordine obbligato: **3a → 3b → 3c → 3d** (3c dipende da 3a e 3b; 3d dipende da 3c). Il ciclo "team role by id" e il ciclo "Team UX" (pannello di dettaglio di `team.html`) sono stati eseguiti tra 3b e 3c come cicli a sé. 3d è stato aggiunto in fase di design 3c su richiesta dell'utente (2026-09-25).

| Sottociclo | Contenuto | Tocca |
|---|---|---|
| **3a — Tag del progetto autonomi** | Rimozione del 409 e della sola lettura, copia iniziale dei tag proposal→progetto, backfill, hardening delle tag route | `projects.js`, tag route di `cost-grids.js`, `project-config.html`, migrazione di backfill |
| **3b — Matching e alias** | Normalizzazione nomi, `resource_aliases`, `profile_unmatched`, pannello "Unmatched names" in `team.html`, API | `resources.js`, `timesheets.js` (hook upload), `team.html` (fetch diretto, nessun `js/api.js`), nuova `lib/` + `services/`, migrazione |
| **3c — Motore: contributi, coda, worker, profilo, tab Experience** | `resource_project_contributions`, `profile_project_state` (coda + stato), `profile_job_runs`, `resources.profile`, worker in-process, tab "Experience profile" con treeview | nuova `lib/` + `services/`, `index.js`, `resources.js`, `timesheets.js`, `projects.js`, `attribute-lists.js`, `routes/profile-jobs.js` (solo `POST /run`), `team.html`, `js/lib/team-ui.js`, migrazione `026` |
| **3d — Console dei job** | Nuova pagina `profile-jobs.html` (admin): elenco dei codici con stato e prossima elaborazione, widget intervallo + on/off, azioni (Recalculate now, Rebuild all, Process, Remove from queue), storico delle ultime 50 esecuzioni | `profile-jobs.html`, `routes/profile-jobs.js`, `js/nav.js` (voce di menu) |

Ogni sottociclo ha valore autonomo: 3a permette al gestore di affinare i tag del progetto; 3b collega gli actuals alle risorse e mostra i nomi che non tornano; 3c produce e mostra il profilo (con un job che gira da solo, regolato da default); 3d dà visibilità e controllo sul job. Il piano di 3c viene scritto subito dopo questa spec; il piano di 3d quando ci si arriva (con eventuale revisione di questa spec).

## 3. Sottociclo 3a — Tag del progetto autonomi

**Copia iniziale.** Helper server-side `copyVersionTagsToProject(projectId, versionId)`:
- chiamato in `POST /api/projects` quando `cgVersionId` è valido, e in `PATCH /api/projects/:id` quando `cgVersionId` passa da nullo a valorizzato;
- copia da `cost_grid_version_tags` a `project_tags` **solo se `project_tags` del progetto è vuota** (non sovrascrive tag già inseriti a mano);
- una sola istruzione SQL atomica, best-effort (errore loggato, mai propagato: la scrittura del progetto è già riuscita e `js/api-sync.js` tratta un PATCH fallito come "progetto mancante"); un copy mancato si ripara rieseguendo la stessa istruzione a mano per quel singolo progetto (non rieseguendo la migrazione di backfill, che riempirebbe anche i progetti svuotati di proposito). La lettura del collegamento precedente e la sua scrittura in `PATCH` avvengono sotto un lock di riga (`SELECT … FOR UPDATE` in transazione), così due salvataggi sovrapposti non possono seedare due volte.

**Regola di modifica.**
- `PUT /api/projects/:id/tags` non risponde più 409 per i progetti collegati (`projects.js:449-451` rimosso).
- `project-config.html`: `tagsReadOnly` resta solo per il viewer (`:445`); `loadTags()` legge sempre `Api.projects.tags` (`:546-548`); il testo "managed from its linked proposal" sparisce.
- `project_tags` è la **sola sorgente dei tag di progetto** per il profilo.

**Backfill (migrazione).** Per ogni progetto con `cg_version_id` valorizzato e `project_tags` vuota, copia i tag della versione. Idempotente (`ON CONFLICT DO NOTHING`).

**Hardening delle tag route** (`cost-grids.js`, `GET`/`PUT .../versions/:vId/tags`):
- verifica che la versione appartenga a `:id` (`cost_grid_id = :id`), 404 altrimenti;
- il `PUT` sostituisce il ciclo di `INSERT` con `INSERT ... SELECT unnest($2::uuid[])`, in transazione. Stesso trattamento per `PUT /api/projects/:id/tags`.

**Effetti collaterali:** dopo 3a nessun consumatore esistente dipende dal 409. In 3c, ogni modifica dei tag di un progetto accoda il ricalcolo (l'hook viene aggiunto in 3c).

## 4. Sottociclo 3b — Matching e alias

**Normalizzazione (`normalizeName`, `api/src/lib/`).** Minuscole, rimozione accenti e punteggiatura, spazi compressi; il confronto è sull'**insieme ordinato dei token**, quindi "Rossi Mario" = "mario rossi"; i nomi composti funzionano senza dividere nome/cognome.

**Risoluzione (`matchResource`), in ordine:**
1. alias esatto in `resource_aliases`;
2. nome+cognome di una risorsa **attiva**, normalizzati allo stesso modo;
3. più candidati (omonimi) o nessuno → non abbinato. Un caso ambiguo non si abbina mai in automatico.

Il match per nome cerca prima tra le risorse **attive** (un solo candidato: abbinato; due o più: ambiguo, mai abbinato). Solo se **non esiste alcun candidato attivo** per quel nome ripiega sulle risorse **inattive** (uno solo: abbinato; due o più: ambiguo). Un omonimo attivo vince sempre su uno inattivo; un alias esplicito ha comunque priorità su tutto. Motivo: lo storico di chi ha lasciato va conservato: disattivare una risorsa la esclude dalle allocazioni FUTURE, mai dal calcolo.

**Tabelle (migrazione):**
- `resource_aliases (id, alias_normalized UNIQUE, resource_id NULL FK, created_by, created_at)`; `resource_id NULL` = nome **ignorato** (non è una persona, per es. "TBD").
- `profile_unmatched (project_code, name_normalized, display_name, hours, candidate_resource_ids JSONB)`, chiave `(project_code, name_normalized)`. **Chiavata per `project_code`, non `project_id`** (corretto in fase di piano 3b): `timesheets` è chiavata per codice e `projects.code` non è unico, quindi da un upload non si può risalire a un id in modo affidabile. Riscritta per codice da `refreshUnmatched`; in 3c la stessa funzione viene assorbita dal worker.

**Sequenza in 3b:** il worker non esiste ancora. Il calcolo è `refreshUnmatched(codes | null)` in `api/src/services/resource-matching.js` (regole pure in `api/src/lib/match-resource.js`): l'upload (`timesheets.js`) ricalcola solo i codici caricati (best-effort: un errore non fa fallire l'upload); ogni modifica admin (risorsa creata/rinominata/disattivata/eliminata, alias aggiunto/rimosso) e il pulsante "Rescan" eseguono un **rescan completo** (poche decine di progetti; semplice e sempre coerente).

**UI in `team.html` (admin e sysadmin):** pannello "Unmatched names":
- elenco dei nomi distinti con ore totali e numero di progetti, ordinato per ore decrescenti;
- per riga, un menu delle risorse attive (candidati ambigui in cima) e "Assign"; un pulsante "Ignore";
- l'assegnazione salva un alias e innesca un rescan completo; un elenco degli alias esistenti (con "Remove") permette di annullare un'assegnazione.

**API (`requireAdmin`):** `GET /api/resources/unmatched`, `GET /api/resources/aliases`, `POST /api/resources/aliases` (`{ name, resourceId }` oppure `{ name, ignore: true }`), `DELETE /api/resources/aliases/:id`, `POST /api/resources/unmatched/rescan`.

## 5. Sottociclo 3c — Motore: contributi, coda, worker, profilo, tab Experience

**Revisione della versione iniziale** (fatta in fase di design 3c, su dati reali: 488 righe di actuals, 8 codici progetto, 15 progetti, nessun tag e nessuna risorsa ancora in uso; nessun `projects.code` condiviso, anche se il vincolo non esiste):
- Contributi e coda sono chiavati per **`project_code`**, non `project_id` (come `profile_unmatched` in 3b): `timesheets` è chiavata per codice e `projects.code` non è unico. Il progetto di un codice è **il più vecchio** con quel codice (`ORDER BY created_at, id LIMIT 1`, senza filtro di visibilità: il worker non è un utente); se non esiste, il nome viene dagli actuals e non ci sono tag.
- I **tag non si copiano** nei contributi: si leggono da `project_tags` quando si aggrega il profilo.
- Una risorsa **inattiva** mantiene il suo profilo: l'abbinamento per nome ripiega sulle risorse inattive quando non c'è alcun omonimo attivo (vedi sezione 4), quindi disattivare una persona non toglie le sue ore dal profilo al ricalcolo successivo.
- Una **sola tabella** (`profile_project_state`) fa da coda e da stato per la console di 3d.

**Modello: contributo per progetto, profilo come somma.** Un ricalcolo di un codice non deve cancellare l'esperienza maturata su altri codici.

**Tabelle (migrazione `026`):**
- `resource_project_contributions (resource_id UUID REFERENCES resources ON DELETE CASCADE, project_code VARCHAR(100), data JSONB, computed_at TIMESTAMPTZ, PRIMARY KEY (resource_id, project_code))`;
- `profile_project_state (project_code VARCHAR(100) PRIMARY KEY, queued_at TIMESTAMPTZ NULL, last_processed_at TIMESTAMPTZ NULL, last_error TEXT NULL, last_rows INTEGER, last_resources INTEGER)` — **in coda = `queued_at IS NOT NULL`**;
- `profile_job_runs (id BIGSERIAL PRIMARY KEY, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ NULL, trigger_type VARCHAR(20) CHECK (trigger_type IN ('scheduled','manual','bootstrap')), projects INTEGER, resources INTEGER, error TEXT NULL)`, potata alle ultime 50 righe a ogni esecuzione (scritta in 3c, mostrata in 3d);
- `resources.profile JSONB`, `resources.profile_computed_at TIMESTAMPTZ`.
- Impostazioni in `app_settings` (chiave/valore già esistente, valori testuali): `profile_job_interval_min` (default `10`), `profile_job_enabled` (default `true`); lette dal worker a ogni ciclo, quindi cambiano senza riavviare l'API. Il widget che le modifica è di 3d.

**Contributo (`data`)** — per (risorsa, codice):
```json
{ "projectName": "Alpha launch", "hours": 420, "first": "2025-02", "last": "2026-08",
  "roles": { "HWGDEV - DEVELOPER": 300 },
  "tasks": { "literature review": { "name": "Literature review", "hours": 180 } } }
```
I ruoli sono i **codici** come negli actuals (`roles.code`); i task hanno chiave normalizzata (minuscole, spazi compressi) e nome originale per la visualizzazione; una riga senza task conta sotto la chiave `(no task)`. Ore non numeriche valgono 0; il mese viene da `date` (`YYYY-MM`), assente se non valida.

**Elaborazione di un codice** (una transazione; funzione `processProject(code)` in `api/src/services/profile-engine.js`):
1. Il codice si prende dalla coda: `UPDATE profile_project_state SET queued_at = NULL WHERE project_code = (SELECT project_code FROM profile_project_state WHERE queued_at IS NOT NULL ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING project_code` (oppure un codice esplicito per l'elaborazione singola). Se la transazione fallisce, il rollback lo rimette in coda.
2. Abbina i nomi degli actuals con `matchOwner`/`buildMatchContext` (`api/src/lib/match-resource.js`): alias e nome esatto; ambigui, non abbinati e ignorati non generano contributi.
3. Costruisce i contributi (`buildContributions`, modulo puro) e sostituisce **solo** le righe `(*, codice)`.
4. Riscrive `profile_unmatched` per quel codice (stessa logica di `refreshUnmatched`, riusata).
5. Ricostruisce `resources.profile` per le risorse **coinvolte** (chi contribuiva prima o contribuisce ora) sommando tutti i loro contributi (`aggregateProfile`), con nome e tag dei progetti letti in quel momento.
6. Aggiorna `profile_project_state` (`last_processed_at`, righe, risorse, `last_error` azzerato); un errore imprevisto viene registrato in `last_error` fuori dalla transazione annullata.

**Chi accoda** (`enqueueProject(code)` / `enqueueAll()`, `INSERT ... ON CONFLICT (project_code) DO UPDATE SET queued_at = COALESCE(profile_project_state.queued_at, now())`):
- upload e cancellazione di actuals (`timesheets.js`) → quel codice;
- modifica dei tag di un progetto, e creazione/cambio di codice/cancellazione di un progetto (`projects.js`) → il suo codice (e il vecchio, se cambia);
- alias aggiunto o rimosso, risorsa creata/rinominata/attivata/disattivata/eliminata (`resources.js`), rinomina di un valore di lista (`attribute-lists.js`) → **tutti** i codici con actuals (a questo volume costa millisecondi ed evita di scoprire quali progetti contengono un nome).
La lista "Unmatched names" resta aggiornata **subito** (`refreshUnmatched` in linea, come in 3b); solo il profilo segue in modo asincrono.

**Worker** (`api/src/services/profile-worker.js`, avviato da `api/src/index.js` dopo `app.listen`):
- controlla ogni 60 secondi se è ora di girare: `profile_job_enabled = 'true'` e trascorsi `profile_job_interval_min` minuti dall'inizio dell'ultima esecuzione; un giro elabora l'intera coda e scrive una riga in `profile_job_runs` (`trigger_type = 'scheduled'`);
- un lock advisory (`pg_try_advisory_lock`) impedisce esecuzioni sovrapposte anche con più istanze;
- **bootstrap** all'avvio: se `resource_project_contributions` è vuota ma `timesheets` no, mette in coda tutti i codici e fa un giro (`trigger_type = 'bootstrap'`), così dopo il deploy i profili non partono vuoti;
- un errore in un progetto non ferma il giro: quel progetto resta in coda con `last_error`, gli altri proseguono.
- Le esecuzioni `scheduled` e `bootstrap` vengono registrate in `profile_job_runs` solo se hanno elaborato qualcosa o fallito; quelle `manual` sempre.

**API in 3c** (`requireAdmin`): `GET /api/resources/:id/profile` → `{ profile, profile_computed_at }` (profilo `null` se non ancora calcolato; 404 per risorsa inesistente; sola lettura), e `POST /api/profile-jobs/run` (file `api/src/routes/profile-jobs.js`, che 3d estende) che svuota subito la coda con `trigger_type = 'manual'` e risponde `{ ok, projects, resources }` — serve ai test e alla futura console.

**Profilo aggregato (`aggregateProfile`) — `resources.profile`:**
```json
{ "version": 1, "computedAt": "…",
  "totals": { "hours": 1240, "projects": 9, "firstWorked": "2024-03", "lastWorked": "2026-08" },
  "dimensions": { "<list slug>": { "name": "Market", "untaggedHours": 95,
      "values": [ { "value": "Italy", "itemId": "…", "hours": 780, "share": 0.63,
                    "projects": 6, "last": "2026-08", "projectCodes": ["…"] } ] } },
  "roles": [ { "code": "HWGDEV - DEVELOPER", "hours": 1000, "share": 0.81, "projects": 8, "last": "2026-08", "projectCodes": ["…"] } ],
  "projects": { "<project code>": { "name": "…", "projectId": "…|null", "hours": 420, "last": "2026-08",
                 "tags": { "<list slug>": ["Italy"] },
                 "tasks": [ { "name": "Literature review", "hours": 180 } ] } } }
```
- Le dimensioni sono gli `slug` di `attribute_lists` (nuove liste compaiono da sole); `untaggedHours` = ore dei progetti che non hanno alcun valore in quella dimensione.
- Un progetto con più valori nella stessa dimensione conta per intero su ciascuno: `share` è "quanto del suo tempo ha toccato quel valore" e la somma può superare 1 (dichiarato, non un errore). `share` = ore del valore / ore totali della risorsa.
- I task stanno **per progetto** nell'indice `projects` (ordinati per ore), così "che task ha fatto su quel brand/mercato" ha risposta diretta; la similarità semantica è del Ciclo 4.
- Una risorsa senza contributi ha profilo `null`; `profile_computed_at` si aggiorna comunque.

**Tab "Experience profile" di `team.html`** (sostituisce il segnaposto): all'apertura della tab chiama `GET /api/resources/:id/profile`; mostra totali (ore, progetti, primo e ultimo mese), "Last calculated: …", poi una **treeview** dimensione → valore (ore e quota con barra) → progetto (ore, ultima data) → task (ore), e una sezione **Roles** (codice con la label presa dai `roles` già caricati dalla pagina) → progetti. Primo livello aperto, il resto chiuso, ordinato per ore. Stati: "Not calculated yet" (profilo `null` prima del calcolo); "No actuals matched to this person yet" con rimando alla tab "Unmatched names"; "Loading…" ed errore in un banner. L'albero lo costruisce `buildProfileTree(profile, roles)` in `js/lib/team-ui.js` (puro, vitest); il tag `<script src="js/lib/team-ui.js?v=…">` di `team.html` passa a `?v=2`.

**Limiti dichiarati:** nessuna similarità semantica dei task; nessun peso per recenza o tipo di ruolo; l'etichetta di un valore di lista rinominato si riflette nel profilo al giro successivo (la rinomina accoda tutto).

## 5b. Sottociclo 3d — Console dei job del profilo (nuova pagina)

Nuova pagina `profile-jobs.html` (Vue da CDN, admin o sysadmin, nel menu ⚙ Admin, `initNav('profilejobs')`); scelta dell'utente: una pagina dedicata e non la pagina Timesheets, perché quest'ultima mostra solo i progetti con actuals visibili all'utente e non l'insieme dei progetti da elaborare. Dipende da 3c (tabelle e worker). Contenuto concordato, dettagli fissati nella sua spec/piano:
- **Elenco** dei codici con actuals (unione di `timesheets` e `profile_project_state`): nome progetto, codice, righe di actuals, risorse abbinate, stato (In coda / Aggiornato / Errore), ultima elaborazione, **prossima elaborazione** (orario del prossimo giro se in coda e il job è attivo; "Paused" se disattivato; "—" se aggiornato). Ricerca e filtro per stato.
- **Widget di pianificazione:** intervallo in minuti (1–1440) e interruttore on/off, salvati in `app_settings` (`profile_job_interval_min`, `profile_job_enabled`) e applicati senza riavvio.
- **Azioni:** *Recalculate now* (svuota la coda), *Rebuild all* (accoda tutto ed elabora), *Process* per riga (accoda ed elabora quel codice), *Remove from queue* per riga.
- **Storico** delle ultime 50 esecuzioni (`profile_job_runs`): quando, tipo (scheduled/manual/bootstrap), progetti, risorse, durata, errore; sezione richiudibile.
- API `api/src/routes/profile-jobs.js` (`requireAdmin`; `POST /run` esiste già da 3c): stato dell'elenco, `GET`/`PUT` impostazioni, `POST /rebuild`, `POST /projects/:code/process`, `DELETE /projects/:code/queue`, `GET /runs`.

## 6. Moduli puri testabili

- `api/src/lib/resource-profile.js` (`node:test`): `buildContributions(rows, ctx)` e `aggregateProfile(contributionsByCode, projectsByCode, now)`, più i piccoli helper `monthOf` e `normalizeTask`; e `api/src/lib/job-schedule.js`: `isJobDue(settings, lastRunAt, now)`. Registrati nella tabella `api/src/lib/` di `CLAUDE.md` via `/sync-docs`. (Le funzioni di matching esistono già in `match-resource.js`.)
- `js/lib/team-ui.js` (vitest): `buildProfileTree(profile, roles)` si aggiunge a `sortResources` e `filterComboOptions`.

## 7. Vincoli trasversali

- Nessun bundler/build step; nuove sezioni UI in Vue senza rompere `v-cloak`; testi in inglese.
- Ogni file con `?v=N` modificato richiede il bump in **tutte** le pagine che lo caricano (`js/lib/team-ui.js` → `?v=2` in `team.html`; in 3d la nuova pagina e `js/nav.js` per la voce di menu, con il bump in tutte le pagine che lo caricano).
- Migrazione `026` (3c); 3d non prevede migrazioni.
- Permessi: profilo, console e ogni azione sui job → `requireAdmin` (admin o sysadmin), anche lato server.
- Il profilo è una **cache rigenerabile**: le fonti di verità restano gli actuals, `resource_aliases` e `project_tags`; svuotare i contributi e ricostruire con l'accodamento totale deve riportare allo stesso risultato.
- Le nuove route che referenziano sotto-risorse verificano l'appartenenza fin dall'inizio; nessun `docker compose` sul main stack.

## 8. Testing

- Unit (`node:test`, `api/src/lib/resource-profile.test.js`): contributi (spelling diversi dello stesso nome sommati, ore non numeriche, data mancante o non valida, task vuoto, ambigui/non abbinati/ignorati esclusi) e aggregazione (somma tra codici, quote, ultima data, progetti senza tag, `untaggedHours` per dimensione, valori multipli nella stessa dimensione, risorsa senza contributi, idempotenza); `isJobDue` (attivo/disattivato, mai eseguito, intervallo trascorso o no).
- Vitest (`js/lib/team-ui.test.js`): `buildProfileTree` (ordine per ore, livelli, ruoli con e senza label, profilo `null`/vuoto).
- Integrazione (`test-api.js`, `scripts/run-tests.sh`), via `POST /api/profile-jobs/run`: upload → coda → esecuzione → `GET /api/resources/:id/profile` con le ore attese; **isolamento**: il ricalcolo del codice P1 non altera i contributi di P2; cambio di tag di un progetto → profilo aggiornato; alias assegnato → le ore compaiono nel profilo; cancellazione degli actuals di un codice → le sue ore spariscono; una risorsa inattiva ha profilo; permessi (401 senza login); ricostruzione totale riporta allo stesso profilo.
- Il loop del worker (tick, lock, bootstrap) si verifica a mano sullo stack di test; la decisione "è ora di girare?" è la funzione pura `isJobDue`.
- Verifica manuale tramite `scripts/test-branch.sh` (che non applica migrazioni nuove al clone: la `026` va applicata a mano al DB del branch).

## 9. Domande aperte per i piani

- Se il tick da 60 secondi debba essere configurabile o solo costante interna (proposta: costante).
- Formato di `profile_job_runs.error` (proposta: messaggio testuale troncato a 500 caratteri).
- Comportamento della console con un job già in esecuzione quando si preme *Recalculate now* (proposta: 409 se il lock è occupato).
