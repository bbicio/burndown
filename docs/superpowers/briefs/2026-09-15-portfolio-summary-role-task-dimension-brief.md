# Brief — Aggiungere la dimensione task a "Summary by role" e "Summary by functional area" in portfolio.html

**Data:** 2026-09-15
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** Discussione utente su un caso reale osservato sul progetto Bayer AG ("BERMITS Maintenance 2026") — vedi indagine sotto

## Current behavior

`portfolio.html`'s dashboard per-progetto ha 4 card di reporting basate su timesheet, tutte alimentate dagli stessi `dashboardData`/`billableData`:

- **"Summary by task"** — `summaryByTask()` (`portfolio.html:748-756`), raggruppa via `buildSummaryCols(this.dashboardData, r => r.task.toLowerCase(), entries)`: una colonna per task, ignorando il ruolo. Comportamento corretto, verificato.
- **"Summary by role"** — `summaryByRole()` (`portfolio.html:758-768`), raggruppa via `buildSummaryCols(bData, r => r.role.toLowerCase(), [...roleMap.values()])`: **una colonna per etichetta di ruolo**, sommando ore/€ su *tutti* i task in cui quel ruolo compare.
- **"Summary by functional area"** — `summaryByGroup()` (`portfolio.html:770-793`), raggruppa per area funzionale (`cfg.groups[].name`, con `roles: string[]` come criterio di appartenenza): **una colonna per area**, sommando su tutti i ruoli/task che vi appartengono.
- **"Task detail"** — `taskDetailData()` (`portfolio.html:795+`), una card per task con righe per ruolo filtrate su quel task specifico. Comportamento corretto, verificato.

Le prime tre condividono l'helper generico `buildSummaryCols(rows, byKeyFn, entries)` (`portfolio.html:939-950`), che filtra `rows` per una singola chiave e calcola Total Amount/Spent/In period/Residual (ore + €); `summaryTotals(cols, hasFilter)` (`portfolio.html:951-963`) somma un array di colonne per la colonna TOTAL, senza dipendere da come sono state raggruppate.

**Problema concreto, verificato sul progetto reale Bayer AG ("BERMITS Maintenance 2026", `project_id = ce54e0a8-5776-44cf-9ca1-4bd4e595bd92`):** la stessa etichetta di ruolo può corrispondere a tariffe diverse su task diversi, perché `rate_override` è configurato per coppia `(task, role)` nel cost grid (`task_roles.rate_override`), non per ruolo globale. Query dirette sul DB confermano:

| task | ruolo configurato | rate_override |
|---|---|---|
| Overall Coordination | Healthware Account Director | 168.00 |
| Project  Management | Healthware Account Services Intern | 130.00 |

Nei timesheet caricati per Fabrizio Fortini su questo progetto, il campo `role` grezzo riporta la stessa stringa ("HWGACCSVS - DIRECTOR") su entrambi i task, ma il `fee` salvato per riga è 168 su "Overall coordination" e 130 su "Project Management" — risolto correttamente per singola riga da `resolveFee`/`findRate` (`api/src/lib/rate-resolve.js`, `js/core.js`), che risolvono la tariffa in base a `(task, role)`, con fallback silenzioso al primo/unico ruolo configurato sul task quando il testo del ruolo caricato non trova corrispondenza esatta.

Conseguenza: in **"Summary by role"**, la colonna "HWGACCSVS - DIRECTOR" (o l'equivalente etichetta pulita) somma insieme ore fatturate a 168€/h e a 130€/h sotto un'unica cifra aggregata — il totale della colonna non corrisponde a "ore × una singola tariffa", rendendo impossibile riconciliare il numero contro il cost grid. Lo stesso vale, in forma amplificata (più ruoli, non solo più task), per **"Summary by functional area"**.

**Confermato NON impattato** (verificato in questa stessa indagine, nessuna ambiguità di ruolo presente):
- `monthlySummary()` (`portfolio.html:654-697`) — raggruppa solo per mese, chiama `findRate(r,cfg)` per singola riga; corretto per costruzione.
- `computeBurndownPoints()` (`js/lib/portfolio-calc.js:38+`) — raggruppa solo per periodo temporale, con filtro opzionale per task (`burndownTaskFilter`, `portfolio.html:234`); nessuna dimensione ruolo.
- L'export Excel (`ExportButtons`, `portfolio.html:492+`) usa `XLSX.utils.table_to_book(tbl, ...)` (`portfolio.html:1176`) sul `<table>` DOM renderizzato — riflette automaticamente qualunque cambiamento di colonne, senza codice export separato da aggiornare.

## Expected behavior

- **"Summary by role"** deve produrre una colonna per ogni combinazione **(ruolo, task)** effettivamente presente nei dati/configurazione del progetto — non una colonna per ruolo puro. Una colonna deve corrispondere sempre a una singola tariffa coerente.
- **"Summary by functional area"** deve produrre una colonna per ogni combinazione **(area funzionale, task)** effettivamente presente — stessa logica.
- La colonna **TOTAL** di entrambe le card deve continuare a corrispondere esattamente al totale di progetto (nessun doppio conteggio o omissione introdotto dal nuovo raggruppamento più fine).
- "Summary by task" e "Task detail" restano invariate (già corrette).
- L'export Excel di entrambe le card riflette le nuove colonne senza modifiche di codice oltre al meccanismo già esistente.

## Constraints

- Nessun cambiamento a DB/API — modifica interamente lato frontend, confinata a `portfolio.html`.
- `summaryByRole`/`summaryByGroup`/`buildSummaryCols`/`summaryTotals` sono definite inline nel `Vue.createApp({...})` di `portfolio.html`, non in `js/lib/portfolio-calc.js` — non è un file versionato con `?v=N` condiviso da altre pagine, quindi nessun bump di cache-busting è necessariamente richiesto dal solo fatto di modificare questa logica (da verificare comunque in fase di implementazione se la struttura cambia).
- Non toccare `summaryByTask`, `taskDetailData`, `monthlySummary`, `computeBurndownPoints` — confermate corrette e fuori scope.
- Non toccare `planning.html` (nessuna pagina/file di quel percorso) — gestito in un ciclo separato.
- Il wrapper `table-responsive` esistente deve continuare a gestire correttamente lo scroll orizzontale quando il numero di colonne cresce (un ruolo/area che copre molti task produce più colonne di oggi).

## Acceptance criteria

1. Sul progetto Bayer AG ("BERMITS Maintenance 2026"), "Summary by role" mostra almeno due colonne distinte per il ruolo "Healthware Account Director"/"HWGACCSVS - DIRECTOR": una per "Overall Coordination" (168€/h) e una per "Project Management" (130€/h) — non una colonna unica che le mescola.
2. Per ciascuna colonna (ruolo, task), Total Amount/Spent/In period/Residual corrispondono esattamente a quanto si ottiene filtrando `dashboardData` su quella singola coppia (verificabile con lo stesso metodo di interrogazione usato in questa indagine).
3. La colonna TOTAL di "Summary by role" e "Summary by functional area" resta identica al totale di progetto calcolato prima del cambiamento (nessuna regressione sul grand total).
4. "Summary by functional area" mostra colonne separate per ogni combinazione (area funzionale, task) realmente presente.
5. L'export Excel di entrambe le card (pulsante "⬇ Export" esistente) riproduce esattamente le colonne mostrate a schermo.
6. Nessuna differenza di comportamento rilevabile in "Summary by task", "Task detail", "Monthly Summary" e nel grafico burndown (regression check).
7. `planning.html` non viene modificato da questo ciclo.

## Explicitly excluded scope

- **`planning.html` (vista "By Role")** — stessa classe di problema (`byRoleView()`, `planning.html:350+`, già con un `breakdown` per task raccolto ma non esposto come riga persistente), ma gestita in un ciclo separato successivo, per decisione esplicita dell'utente.
- **Il mismatch etichetta-ruolo in fase di caricamento timesheet** (il testo del ruolo grezzo caricato via XLS non corrisponde ai ruoli realmente configurati sul task, mascherato dal fallback silenzioso di `resolveFee`/`findRate` al primo/unico ruolo del task) — root cause a monte del sintomo osservato, ma esplicitamente fuori scope: questo Brief copre solo la correttezza del *reporting*, non l'origine/validazione del dato caricato (decisione esplicita dell'utente: "non è la fase di upload il problema che sto lamentando").
- **`summaryByTask`, `taskDetailData`, `monthlySummary`, il grafico burndown** — verificate corrette e non impattate, non vengono toccate.

## Domande aperte per `/brainstorming`

- Formato esatto dell'etichetta di colonna per la combinazione (ruolo, task) e (area, task) — es. "Ruolo — Task" vs altre notazioni — da definire in fase di design, non deciso in questo Brief.
- Se estrarre `buildSummaryCols`/`summaryByRole`/`summaryByGroup` (o la logica di raggruppamento a chiave composita) in `js/lib/portfolio-calc.js`, allineandosi alla convenzione già seguita da `computeKpis`/`computeBurndownPoints` in questo stesso file, per ottenere copertura vitest — oggi questa logica non ha test automatici essendo inline nel componente Vue. Da valutare in brainstorming, non deciso qui.

Brief ready. Next step: /brainstorming.
