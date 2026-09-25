# Ciclo 3 — Profilo risorsa da storico progetti (design)

Terzo dei quattro cicli dell'iniziativa resource-allocation (Ciclo 1: `team.html`/`attribute-lists.html`; Ciclo 2: tag linking proposal/progetto). Questo documento è una **spec di design unica** per l'intero Ciclo 3, che viene eseguito come **tre sottocicli distinti** (§2), ciascuno con il proprio piano di implementazione e il proprio `/finish-cycle`.

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

Ordine obbligato: **3a → 3b → 3c** (3c dipende da entrambi).

| Sottociclo | Contenuto | Tocca |
|---|---|---|
| **3a — Tag del progetto autonomi** | Rimozione del 409 e della sola lettura, copia iniziale dei tag proposal→progetto, backfill, hardening delle tag route | `projects.js`, tag route di `cost-grids.js`, `project-config.html`, migrazione di backfill |
| **3b — Matching e alias** | Normalizzazione nomi, `resource_aliases`, `profile_unmatched`, pannello "Unmatched names" in `team.html`, API | `resources.js`, `timesheets.js` (hook upload), `team.html` (fetch diretto, nessun `js/api.js`), nuova `lib/` + `services/`, migrazione |
| **3c — Contributi, scheduler, profilo** | `resource_project_contributions`, coda di ricalcolo + worker, `resources.profile`, treeview, "Rebuild profiles"/"Recalculate now" | nuova `lib/`, worker in `api/src/index.js`, `resources.js`, `team.html`, migrazione |

Ogni sottociclo ha valore autonomo: 3a permette al gestore di affinare i tag del progetto; 3b collega gli actuals alle risorse e mostra i nomi che non tornano; 3c produce il profilo. Il piano di 3a viene scritto subito dopo questa spec; i piani di 3b e 3c quando ci si arriva (con eventuale revisione di questa spec se emergono cambiamenti).

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

Le risorse inattive sono escluse dal match automatico ma un alias esplicito può puntare anche a loro (per non perdere lo storico di chi ha lasciato).

**Tabelle (migrazione):**
- `resource_aliases (id, alias_normalized UNIQUE, resource_id NULL FK, created_by, created_at)`; `resource_id NULL` = nome **ignorato** (non è una persona, per es. "TBD").
- `profile_unmatched (project_code, name_normalized, display_name, hours, candidate_resource_ids JSONB)`, chiave `(project_code, name_normalized)`. **Chiavata per `project_code`, non `project_id`** (corretto in fase di piano 3b): `timesheets` è chiavata per codice e `projects.code` non è unico, quindi da un upload non si può risalire a un id in modo affidabile. Riscritta per codice da `refreshUnmatched`; in 3c la stessa funzione viene assorbita dal worker.

**Sequenza in 3b:** il worker non esiste ancora. Il calcolo è `refreshUnmatched(codes | null)` in `api/src/services/resource-matching.js` (regole pure in `api/src/lib/match-resource.js`): l'upload (`timesheets.js`) ricalcola solo i codici caricati (best-effort: un errore non fa fallire l'upload); ogni modifica admin (risorsa creata/rinominata/disattivata/eliminata, alias aggiunto/rimosso) e il pulsante "Rescan" eseguono un **rescan completo** (poche decine di progetti; semplice e sempre coerente).

**UI in `team.html` (admin e sysadmin):** pannello "Unmatched names":
- elenco dei nomi distinti con ore totali e numero di progetti, ordinato per ore decrescenti;
- per riga, un menu delle risorse attive (candidati ambigui in cima) e "Assign"; un pulsante "Ignore";
- l'assegnazione salva un alias e innesca un rescan completo; un elenco degli alias esistenti (con "Remove") permette di annullare un'assegnazione.

**API (`requireAdmin`):** `GET /api/resources/unmatched`, `GET /api/resources/aliases`, `POST /api/resources/aliases` (`{ name, resourceId }` oppure `{ name, ignore: true }`), `DELETE /api/resources/aliases/:id`, `POST /api/resources/unmatched/rescan`.

## 5. Sottociclo 3c — Contributi, scheduler, profilo

**Modello: contributo per progetto, profilo come somma.** Un ricalcolo di un progetto non deve cancellare l'esperienza maturata su altri progetti.

**Tabelle (migrazione):**
- `resource_project_contributions (resource_id, project_id, data JSONB, computed_at, PRIMARY KEY (resource_id, project_id))`;
- `profile_recalc_queue (project_id PRIMARY KEY, enqueued_at)`;
- `resources.profile JSONB`, `resources.profile_computed_at TIMESTAMPTZ`.

**Contributo (`data`):**
```json
{ "hours": 420, "first": "2025-02", "last": "2026-08",
  "roles": { "senior consultant": 300 },
  "tasks": { "literature review": 180 },
  "tags":  { "market": ["Italy"], "brand": ["Brand A"] } }
```
Chiavi di ruolo e task normalizzate (minuscole, spazi compressi); il nome originale si conserva solo per la visualizzazione.

**Flusso:**
1. Upload XLS → dopo la scrittura degli actuals il progetto viene inserito in coda (`ON CONFLICT DO NOTHING`). L'upload non calcola nulla.
2. Modifica dei tag di un progetto (3a) e assegnazione/rimozione di un alias (3b) accodano i progetti interessati.
3. **Worker** nel processo API (`setInterval`, 2-3 volte al giorno), reclamo delle voci con `SELECT ... FOR UPDATE SKIP LOCKED`. Per ogni progetto: normalizza e abbina i nomi (riusa `matchResource` di 3b), sostituisce **solo** le righe `(*, project_id)` in `resource_project_contributions`, riscrive `profile_unmatched` per quel progetto, ricostruisce `resources.profile` per le sole risorse toccate sommando i loro contributi, elimina la voce di coda.
4. "Rebuild profiles" (admin) accoda tutti i progetti con actuals; "Recalculate now" sveglia il worker subito. L'assorbimento della logica di `refreshUnmatched` di 3b nel worker è parte di 3c.
5. Un processo separato per il worker è rimandato finché non serve scalare a più istanze.

**Profilo aggregato (`aggregateProfile`) — `resources.profile`:**
```json
{ "version": 1, "computedAt": "…",
  "totals": { "hours": 1240, "projects": 9, "firstWorked": "2024-03", "lastWorked": "2026-08" },
  "dimensions": { "<list slug>": [ { "value": "Italy", "hours": 780, "share": 0.63,
                                      "projects": 6, "last": "2026-08", "projectIds": ["…"] } ] },
  "roles": [ { "value": "senior consultant", "hours": 1000, "share": 0.81, "projects": 8, "last": "2026-08" } ],
  "projects": { "<projectId>": { "code": "…", "name": "…", "hours": 420, "last": "2026-08",
                                 "tags": { "market": ["Italy"] }, "tasks": { "literature review": 180 } } },
  "unassigned": { "hoursWithoutTags": 95 } }
```
- Le dimensioni sono gli `slug` di `attribute_lists` (nuove liste compaiono da sole).
- Un progetto con più valori nella stessa dimensione conta per intero su ciascuno: `share` è "quanto del suo tempo ha toccato quel valore" e la somma può superare 1 (dichiarato, non un errore).
- I task stanno **per progetto** nell'indice `projects`, così la domanda "ha fatto questo task su questo brand/mercato" ha risposta diretta; la similarità semantica è del Ciclo 4.

**Treeview in `team.html`:** sezione "Experience profile", separata dalla job description, in sola lettura per admin e sysadmin. Livelli: dimensione → valore (ore, quota) → progetto (ore, ultima data) → task (ore). Costruito dalla UI incrociando `projectIds` con l'indice `projects`; ordinato per ore; primo livello aperto, il resto chiuso. Intestazione con totali, data dell'ultimo calcolo e "Recalculate now". Profilo vuoto: "No experience data yet" con rimando al pannello "Unmatched names".

**Limiti dichiarati:** nessuna similarità semantica dei task; nessun peso per tipo di ruolo; se un'etichetta di tag viene rinominata il profilo non si aggiorna finché il progetto non viene riaccodato.

## 6. Moduli puri testabili (`api/src/lib/`, `node:test`)

`normalize-name.js`, `match-resource.js`, `resource-profile.js` (`buildContribution`, `aggregateProfile`). Registrati nella tabella `api/src/lib/` di `CLAUDE.md` via `/sync-docs`.

## 7. Vincoli trasversali

- Nessun bundler/build step; nuove sezioni UI in Vue senza rompere `v-cloak`.
- Ogni file con `?v=N` modificato (`project-config.html`, `team.html`, `js/api.js`, `css/style.css`, ecc.) richiede il bump in **tutte** le pagine che lo caricano.
- Tutti i testi utente in inglese.
- Migrazioni numerate dopo `022`, una per sottociclo.
- Permessi: pannello "Unmatched names", profilo, rebuild → `requireAdmin` (admin o sysadmin). La modifica dei tag dal progetto resta ai soli editor del progetto.
- Il JSONB è una **cache rigenerabile**: fonti di verità restano gli actuals e `project_tags`.
- Le nuove route con `:id` che referenziano sotto-risorse verificano l'appartenenza fin dall'inizio.

## 8. Testing

- Unit (`node:test`) per i tre moduli di `lib/`: normalizzazione (ordine nome/cognome, accenti, composti), abbinamento (esatto, alias, ambiguo, inattivo, ignorato), contributo e aggregazione (somma tra progetti, quota, progetti senza tag, idempotenza).
- Integrazione (`test-api.js`, `scripts/run-tests.sh`): 3a — 409 rimosso, copia alla creazione/collegamento, rifiuto di `:vId` non appartenente, backfill; 3b — API alias/unmatched e permessi; 3c — coda, isolamento per progetto (un ricalcolo di P1 non altera P2), rebuild.
- Nessuna manipolazione dello stack principale: verifica manuale tramite `scripts/test-branch.sh`; regole Docker di `CLAUDE.md` invariate.

## 9. Domande aperte per i piani

- Quale intervallo esatto per il worker (proposta: ogni 6 ore) e come configurarlo (variabile d'ambiente).
- Comportamento del worker all'avvio dell'API (eseguire subito una passata o attendere il primo intervallo).
- Numerazione esatta delle migrazioni (decisa al momento del piano di ciascun sottociclo).
