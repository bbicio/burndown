# Brief — Timesheets (Actuals): colonne cliente/pipeline year, Fee/Spent, export XLSX

## Current behavior

**Frontend** (`timesheets.html`):
- Tabella riassuntiva, una riga per `project_code`: colonne `Project code`, `Uploads`, `Rows`, `Last uploaded` (righe 66-71), nessun filtro/sorting.
- `👁 View` → modal con colonne `Date, Owner, Role, Task, Hours, Notes` (righe 124-140, `viewRows()` righe 213-227).
- `⬇ CSV` → export client-side via Blob (`downloadCsv()`, righe 229-248), nessuna libreria.
- Pagina non carica `config.projects` né dati di pipeline (solo `core.js`, `api.js`, `nav.js`).

**Backend** (`api/src/routes/timesheets.js`):
- `GET /api/timesheets` (righe 29-47) — aggregato per `project_code`, nessun join.
- `GET /api/timesheets/:projectCode` (righe 70-84) — righe raw, nessun campo `fee`.
- `POST /api/timesheets/upload` (righe 87-165) — replace integrale per `project_code`, nessuna risoluzione tariffa al salvataggio.

**Modello dati di riferimento**:
- `js/core.js:264-272` (`findRate`) risolve tariffa via match case-insensitive `task.name`+`role` su `cfg.tasks[].resources[].hourlyRate`; stesso schema in `project_tasks.resources` JSONB (`api/src/routes/projects.js:201-209`).
- `projects.code` lega `timesheets.project_code` a un progetto; `client_name` via `LEFT JOIN clients c ON c.id = p.client_id` (`api/src/routes/projects.js:62,79`).
- `projects.cg_version_id` (`001_initial.sql:124`, colonna singola → un progetto punta al massimo a una `cost_grid_version` in un dato momento, nessuna ambiguità) → `cost_grid_versions.pipeline_year` (`005_drafts_pipeline_year_pot.sql`) è la fonte dell'annualità, la stessa usata dal selettore anno in `pipeline.html` (righe 403-404, 705-718) via `Api.pipelineYears.list()`.

## Expected behavior

1. **Tabella riassuntiva**: aggiungere colonne **Cliente**, **Progetto**, **Project code** (in quest'ordine, prime 3 colonne), seguite dalle esistenti (`Uploads`, `Rows`, `Last uploaded`).
   - Risoluzione via **join lato backend** in `GET /api/timesheets` (`LEFT JOIN projects p ON p.code = t.project_code LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN cost_grid_versions cgv ON cgv.id = p.cg_version_id`).
   - Codici orfani (nessun progetto associato): Cliente/Progetto `—`, Project code mostra il codice.
   - **Filtri**: dropdown Bootstrap con checkbox (multi-select) per Cliente e Progetto (opzioni dai valori distinti nei dati caricati, indipendenti dall'anno selezionato); testo libero per Project code.
   - **Sorting**: click header su Cliente/Progetto/Project code (asc/desc); le altre colonne restano non ordinabili.
   - **Filtro annualità (pipeline year)**: selettore anno riutilizzando `Api.pipelineYears.list()`, stessa logica di default/risoluzione di `pipeline.html` (default anno corrente se presente tra i pipeline years attivi, altrimenti il più recente disponibile), più un'opzione esplicita **"All years"** assente in `pipeline.html`. Filtra le righe per `pipeline_year` risolto via `projects.cg_version_id → cost_grid_versions.pipeline_year`.
     - Progetti senza `cg_version_id`/`pipeline_year`: visibili **solo** con "All years"; spariscono quando è selezionato un anno specifico.
     - Il filtro anno è ortogonale/indipendente dai filtri Cliente/Progetto/Project code (AND); le opzioni dei dropdown Cliente/Progetto non si restringono dinamicamente in base all'anno selezionato.

2. **Modal "View"**: aggiungere **Fee** e **Spent** come ultime 2 colonne (`Date, Owner, Role, Task, Hours, Notes, Fee, Spent`).
   - **Fee**: tariffa oraria risolta per task+role (stessa logica di `findRate`), mostrata con simbolo valuta del progetto.
   - **Spent**: `Fee × Hours` per riga, mostrata con simbolo valuta del progetto.
   - Nessun arrotondamento: `fee` salvato/mostrato come valore decimale fedele.
   - Righe senza tariffa risolvibile: `Fee = 0`, `Spent = 0`.

3. **Storicizzazione Fee**: `fee` risolto e salvato **al momento dell'upload** (`POST /api/timesheets/upload`), dentro ogni entry del JSONB `data`, chiave `fee`. Non ricalcolato a display-time. Nessun campo valuta aggiuntivo per entry — si usa sempre la valuta corrente del progetto.
   - **Dati storici già in DB**: nessuno script di migrazione — re-upload manuale degli XLS dei 7 progetti esistenti dopo il deploy, passando per lo stesso path di upload già testato.

4. **Export**: `⬇ CSV` → `⬇ XLSX` via **ExcelJS** (CDN, stesso pattern di `planning.html`/`costgrid.html`), stesse colonne della griglia del punto 2 incluse Fee/Spent. CSV rimosso, non affiancato.

## Constraints

- Pagina resta admin-only (invariato).
- Nessuna modifica al replace-per-codice dell'upload, al column-mapping euristico, alla validazione date.
- Fee/Spent usano esclusivamente `project_tasks.resources[].hourlyRate` come sorgente — non ratecard/override diretti, non `roles.rate`.
- Filtri Cliente/Progetto/Project code e sorting: client-side sui dati caricati da `GET /api/timesheets`. Filtro anno: `pipeline_year` risolto server-side nello stesso join.
- ExcelJS caricato via `<script defer>` CDN, stesso pattern esistente.
- Nessuno script di migrazione dati: la storicizzazione di `fee` per i timesheet esistenti passa da re-upload manuale.

## Acceptance criteria

- [ ] Tabella riassuntiva mostra Cliente, Progetto, Project code come prime 3 colonne.
- [ ] Codici senza progetto associato: Cliente/Progetto `—`, Project code visibile.
- [ ] Dropdown multi-select funzionanti per Cliente e Progetto; testo libero funzionante per Project code.
- [ ] Sorting funzionante su Cliente/Progetto/Project code (asc/desc); altre colonne senza sorting.
- [ ] Selettore annualità presente, popolato da `Api.pipelineYears.list()`, default = anno corrente, opzione "All years" presente.
- [ ] Selezionando un anno, la tabella mostra solo i progetti il cui `pipeline_year` risolto corrisponde; progetti senza `pipeline_year` compaiono solo con "All years".
- [ ] Griglia "View" mostra Fee e Spent come ultime 2 colonne, valorizzate per riga con simbolo valuta del progetto, nessun arrotondamento.
- [ ] Righe senza tariffa risolvibile: Fee = 0, Spent = 0.
- [ ] Un nuovo upload salva `fee` per ogni entry al momento dell'inserimento in DB.
- [ ] Il bottone di export produce un file `.xlsx` con le stesse colonne della griglia "View" incluse Fee/Spent; bottone CSV rimosso.

## Explicitly excluded scope

- Nessuna colonna/aggregato "Total Spent" nella tabella riassuntiva — Fee/Spent solo nella griglia "View" e nell'export.
- Nessuna modifica a `GET /api/timesheets/all-data` né alle viste che la consumano (portfolio/planning).
- Nessuna gestione multi-valuta/conversione — Fee/Spent nella valuta del progetto, senza normalizzazione EUR.
- Nessun cambiamento ai permessi di delete/upload esistenti.
- Nessuna paginazione lato server per tabella riassuntiva o griglia "View".
- Nessuno script di migrazione per i dati storici — sostituito da re-upload manuale dei 7 progetti esistenti.
- Le opzioni dei dropdown Cliente/Progetto non si ricalcolano dinamicamente in base all'anno selezionato.

## Resolved during brainstorming

- Join backend esteso (projects + clients + cost_grid_versions) in un'unica query — nessun costo rilevante, opera sul risultato già aggregato per `project_code`.
- Chiave JSONB per il fee storicizzato: `fee`, nessun campo valuta separato per entry.
- Multi-select Cliente/Progetto: dropdown Bootstrap con checkbox (nessuna libreria aggiuntiva).
