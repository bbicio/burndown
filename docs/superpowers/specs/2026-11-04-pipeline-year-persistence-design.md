# Pipeline year — anno sul Draft e anno ricordato — design spec

**Date:** 2026-11-04
**Brief started:** unknown
**Brief:** none — bug segnalato in chat, design concordato in chat il 2026-11-04
**Scenario:** 2 (evoluzione, bug incluso)

Una proposal creata mentre `pipeline.html` mostra un anno diverso da quello corrente (es. 2027) viene pubblicata
nell'anno corrente e sparisce dalla pipeline guardata. In più, la pipeline scelta non sopravvive alla navigazione
tra le pagine.

## 1. Obiettivo

- Una proposal creata (New o Clone) mentre si guarda l'anno Y resta nell'anno Y dopo la pubblicazione.
- L'anno scelto in `pipeline.html` viene ricordato tra pagine e ricariche.

## 2. Fatti verificati nel codice (a `e5c8ff4`)

- `POST /api/cost-grids/:id/versions` crea sempre un Draft con `pipeline_year = NULL`
  (`api/src/routes/cost-grids.js`, handler `/:id/versions`).
- `POST …/publish` scrive `pipeline_year = new Date().getFullYear()` e non legge nessun anno dal Draft.
- `GET /api/cost-grids?year=Y` mostra i Draft del proprietario in qualunque anno
  (`NOT EXISTS` di versioni non Draft), quindi un Draft si vede nell'anno sbagliato fino alla pubblicazione.
- `POST …/duplicate` crea sempre un Draft "senza anno" (`ND-03` in `test-api.js`).
- `projects` non ha `pipeline_year`: un progetto riceve l'anno dalla versione collegata (`cg_version_id`), quindi
  l'anno sbagliato della proposal sposta anche i suoi progetti nei report.
- Lettori di `pipeline_year`: `pots.js`, `exports.js`, `pipeline-years.js` (conteggi) filtrano per stage non Draft;
  `timesheets.js` legge l'anno di una versione già collegata a un progetto. **`reporting.js`, query admin di `GET /api/reporting/phasing`
  (`WHERE cgv.pipeline_year = $1`), non filtra `pipeline`.**
- `pipeline.html` risolve l'anno da `?year=` e altrimenti dall'anno corrente; i link a `/pipeline.html` delle altre
  pagine e dell'editor non portano `?year=`.
- `js/core.js` cancella ogni chiave `PDash*` fuori dal suo `keep` Set a ogni caricamento di pagina.

## 3. Comportamento atteso

### 3.1 Anno sul Draft

- `POST /api/cost-grids/:id/versions` accetta `pipelineYear` opzionale. Valido = intero presente in
  `pipeline_years` e attivo; altrimenti `400 { error }`. Assente = `NULL`, come oggi.
- `POST …/duplicate` copia `pipeline_year` dalla versione sorgente **solo se la sorgente è un Draft**; da una
  sorgente non Draft resta `NULL`.
- `POST …/publish` scrive `COALESCE(pipeline_year, anno corrente)`.
- `pipeline.html` passa `selectedYear` a New Proposal e a Clone (`cgCreateNewGrid(year)`, `cgCloneGrid(src, ver, year)`
  in `js/costgrid.js`); le copie fatte dall'editor non cambiano.
- `reporting.js`: `GET /api/reporting/phasing` esclude `pipeline = 'Draft'`.

### 3.2 Anno ricordato

- Chiave `localStorage` `PDash_pipelineYear` (aggiunta al `keep` Set di `js/core.js`), scritta da `selectYear()`.
- Precedenza all'apertura di `pipeline.html`: `?year=` valido, poi valore salvato valido, poi anno corrente, poi il
  primo anno disponibile. "Valido" = presente tra gli anni restituiti da `GET /api/pipeline-years` (per un non-admin
  sono solo i suoi attivi).
- Un valore salvato non valido viene ignorato senza errore; `localStorage` assente o che lancia lascia la pagina
  funzionante.
- La precedenza è una funzione pura in `js/lib/pipeline-year.js` (modulo ES, ponte `window`).

## 4. Scope escluso

- Le proposal già pubblicate nell'anno sbagliato non vengono corrette; i Draft esistenti restano a `NULL`.
- Nessuna migration, nessuna colonna nuova.
- Nessun cambio al filtro `GET /api/cost-grids?year=` (i Draft restano visibili in ogni anno).
- Nessun anno modificabile da UI su un Draft esistente.

## Criteri di accettazione

1. **New proposal in un altro anno** — con la pipeline 2027 aperta, "+ New Proposal" e "Publish to SIP" lasciano la proposal in 2027; compare nella colonna SIP di 2027 e non in quella di 2026 (`test-api.js`; Gate 2).
2. **Clone in un altro anno** — Clone dalla pipeline 2027 produce un Draft che, pubblicato, resta in 2027 (`test-api.js`; Gate 2).
3. **New version di un Draft** — la duplicazione di un Draft con anno copia l'anno; da un Draft senza anno resta senza anno (`ND-03` invariato; nuovo caso in `test-api.js`).
4. **Anno non valido sul Draft** — `pipelineYear` non intero, inesistente o inattivo → 400 e nessuna versione creata (`test-api.js`; `api/src/lib/pipeline-year.test.js`).
5. **Publish senza anno** — un Draft con `pipeline_year` NULL viene pubblicato nell'anno corrente (`test-api.js`).
6. **Report senza Draft** — `GET /api/reporting/phasing` non conta un Draft con anno (`test-api.js`).
7. **Anno ricordato** — scelto il 2027 e navigato a un'altra pagina e ritorno via menu o breadcrumb, `pipeline.html` riapre il 2027 (`js/lib/pipeline-year.test.js`; Gate 2).
8. **Precedenza e robustezza** — `?year=` batte il salvato, il salvato non valido cade sull'anno corrente, `localStorage` che lancia non rompe la pagina (`js/lib/pipeline-year.test.js`).
9. **Chiave non cancellata** — `PDash_pipelineYear` sopravvive a `cleanLegacyStorage()` (guard test su `core.js`).
10. **Cache-busting** — i riferimenti a `core.js` e `costgrid.js` sono allineati (`js/lib/foundations-guard.test.js`).

## Decisioni aperte

1. **Anno scritto su `cost_grid_versions.pipeline_year` del Draft.** Alternativa scartata: colonna `intended_pipeline_year` copiata al Publish. Perché: una sola colonna per un solo fatto, nessuna migration; il rischio (un lettore che conta un Draft) è chiuso verificando i lettori e correggendo `reporting.js`.
2. **`localStorage`, non `sessionStorage`.** Alternativa scartata: `sessionStorage` per scheda. Perché: l'utente vuole ritrovare la pipeline scelta anche in una nuova scheda o sessione.
3. **Anno passato dal client alla creazione, validato dal server.** Alternativa scartata: Publish che riceve l'anno dall'anno ricordato. Perché: sbaglia se la proposal viene pubblicata in una sessione con un altro anno selezionato.
4. **`duplicate` copia l'anno solo da un Draft.** Alternativa scartata: copiarlo sempre, o mai. Perché: la nuova versione di un Draft 2027 deve restare 2027; da una versione pubblicata il Draft nuovo non ha un "anno previsto" da ereditare.
5. **Il Clone eredita l'anno visualizzato, non l'anno della sorgente.** Alternativa scartata: anno della sorgente. Perché: l'utente clona dentro la pipeline che sta guardando e la copia deve comparire lì.
6. **Un anno con Draft non è eliminabile.** Alternativa scartata: escludere i Draft dal blocco di `DELETE /api/pipeline-years/:id`. Perché: il Draft appartiene a quell'anno; cancellarlo lascerebbe un anno orfano.
7. **Anno inattivo rifiutato alla creazione.** Alternativa scartata: accettarlo. Perché: coerente con il 403 della lettura e con `newProposalVisible`.
