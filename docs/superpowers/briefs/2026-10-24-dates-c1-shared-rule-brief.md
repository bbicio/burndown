# Brief — date, ciclo C1: regola condivisa e validazione di formato e ordine

**Tipo:** audit-fix (Scenario 3), raggruppamento confermato dall'utente il 2026-10-24.
**Origine:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding **D-15, D-01, D-02, D-03, D-14, D-05, D-06** e la parte "periodo" di **D-12**.
**Sequenza concordata:** C1 (questo) → C2 datepicker nei form (`2026-10-24-dates-c2-datepickers-brief.md`) → C3 task dentro il periodo (`2026-10-24-dates-c3-task-period-brief.md`).

## Problema

Nel progetto non c'è una definizione unica di "data valida" né di "intervallo valido". Ogni pagina e ogni route ha scritto il proprio parser o adattatore (D-15). Di conseguenza nessuna route controlla le date che riceve (D-01, D-02, D-03), un ramo dell'ingest dei timesheet ne controlla solo la forma (D-14), e il componente `cg-date-picker` lascia passare, digitando o con le scorciatoie, valori che il suo calendario rifiuta (D-05, D-06).

## Comportamento attuale

Per evidenze e righe vale il report. In sintesi:
- **D-01** `api/src/routes/cost-grids.js:391,414,436-437`: version POST/PATCH scrivono `startDate`/`endDate` così come arrivano. Non c'è controllo di forma né d'ordine, e PATCH accetta un lato solo. Nel DB c'è già una versione invertita (`ce702b4c-…`, `202609` → `202607`).
- **D-02** `api/src/routes/projects.js:156,170-171,239-252`: lo stesso per i progetti.
- **D-03** `cost-grids.js:718-720`, `projects.js:412-413`: le date dei task vengono ripulite dai `-` e troncate a 8 caratteri, senza alcun controllo.
- **D-14** `api/src/routes/timesheets.js:418`: il ramo ISO controlla solo la forma.
- **D-05** `js/cg-controls.js:166-173`: `commitTyped()` non consulta `min`/`max` (è la terza parte di B-030).
- **D-06** `js/cg-controls.js:185-190`: "This month" e "Next month" chiamano `pick()` senza vincoli.
- **D-12 (periodo)** `js/costgrid.js:1256-1264`: Start ed End del progetto generato vengono scelti indipendentemente l'uno dall'altro e possono risultare invertiti.
- **D-15:** le conversioni duplicate sono inventariate nel report. I due validatori rigorosi già esistenti sono `parseItDate` (`js/lib/cg-controls-calc.js:98`) e `isValidCalendarDate` (`api/src/lib/date-parse.js:5`), e li usa una superficie ciascuno. `api/src/lib/planning-request.js:27-33` è il precedente di un controllo d'ordine già fatto lato server.

## Comportamento atteso

- Un modulo date in `js/lib/` e il suo twin in `api/src/lib/`, sul modello di `money.js`/`money-format.js`. Definiscono in un solo punto:
  - la validità di un mese `YYYYMM` e di un giorno, con controllo di calendario;
  - le conversioni tra i formati di storage (`YYYYMM`, `YYYYMMDD`) e quello in memoria (ISO `YYYY-MM-DD`);
  - il confronto d'ordine tra due date, anche di granularità diversa (mese contro giorno), perché C3 ne avrà bisogno.
- La regola per i form futuri è scritta in **un solo file** e le altre pagine ci rimandano. È pinnata da un guard test che fallisce quando una superficie fa da sé quello che il modulo fa.
- Il server rifiuta con `400 { error, code }`, senza scrivere niente:
  - una data malformata o inesistente su version POST/PATCH, project POST/PATCH, `PUT …/structure` e `PUT /api/projects/:id/tasks`;
  - un intervallo con fine prima dell'inizio. Sul PATCH parziale il confronto avviene con il lato già salvato.
- L'ingest dei timesheet rifiuta anche una data ISO inesistente, con lo stesso comportamento del ramo `dd/mm/yyyy` (tutto il file rifiutato, riga indicata).
- `cg-date-picker` non emette mai un valore fuori da `min`/`max`, che arrivi da digitazione, scorciatoia o click. Al rifiuto di un valore digitato l'utente vede perché, invece di un ritorno silenzioso al valore precedente.
- La generazione di un progetto non produce mai un periodo invertito.

## Vincoli

- **Parsing e formattazione per la visualizzazione stanno in un unico punto del modulo.** C2 adotterà un formato digitato non ambiguo (decisione dell'utente del 2026-10-24, opzione 1) e deve poterlo fare cambiando solo quel punto, senza toccare route né storage.
- Lo storage non cambia: niente migration di schema.
- **Dato esistente invertito.** L'autosave di costgrid rimanda il periodo a ogni salvataggio (`js/api-sync.js:175-176`), quindi un rifiuto "a ogni scrittura" bloccherebbe ogni salvataggio di quella versione. Il brainstorming sceglie tra:
  - rifiutare solo quando le date cambiano, come fa `project-rules.js` per una valuta re-inviata identica;
  - correggere il dato una volta, con un passo esplicito e confermato.
- Il codice d'errore e la scelta tra un codice nuovo e uno già esistente li decide il brainstorming.
- `js/cg-controls.js`, `js/costgrid.js` e ogni `js/lib/*.js` toccato hanno il `?v=N`: tutti i riferimenti vanno aggiornati.
- Le route modificate richiedono `docker compose restart api` sullo stack principale. Va fatto solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.
- B-030 raggruppa tre problemi; questo ciclo ne chiude uno. Come registrarne la chiusura parziale in `docs/BACKLOG.md` lo decide il brainstorming.

## Criteri di accettazione

1. Esistono un modulo date in `js/lib/` e il suo twin in `api/src/lib/`, ciascuno con i propri test (vitest e `node:test`). I test coprono almeno `20260431`, `20260229`, `202613`, `2026-05` e stringhe vuote.
2. Un guard test fallisce se una pagina o una route converte o valida date fuori dal modulo, per esempio con `.replace(/-/g, '')` su una data o con un controllo `isNaN(new Date(...))`. Cosa esattamente riconosce lo fissa la Spec.
3. `test-api.js` verifica che version POST/PATCH, project POST/PATCH, `PUT …/structure` e `PUT /api/projects/:id/tasks` rispondano 400 a una data malformata, a una data inesistente e a un intervallo invertito, e che dopo il rifiuto il DB sia invariato.
4. Un PATCH che cambia solo `endDate`, portandolo prima dello `start_date` salvato, risponde 400.
5. Un upload di timesheet con `2026-13-45` viene rifiutato con il numero di riga.
6. Un test di `cg-date-picker` verifica che un valore digitato fuori `min`/`max` e le scorciatoie "This month"/"Next month" fuori `min`/`max` non emettano `update:modelValue`.
7. La regola è descritta in un solo file, e CLAUDE.md rimanda a quel file.
8. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- La sostituzione dei campi data con il datepicker e il cambio del formato digitato (C2).
- Il vincolo "task dentro i mesi della proposta o del progetto" (C3), compresa la parte task di D-12 e le perdite silenziose D-08/D-11.
- Le prime due parti di B-030 (listener globali, Home/End), gli item 3 e 5 del backlog e le note "Out of scope" del report.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
