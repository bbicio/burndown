# Brief — date, ciclo C3: i task dentro i mesi della proposta o del progetto (item 11)

**Tipo:** evoluzione (Scenario 2), raggruppamento confermato dall'utente il 2026-10-24.
**Perché è diverso dal C1:** la regola non esiste ancora, quindi non c'è una divergenza da riallineare. Inoltre la violano già dati esistenti. Va deciso cosa farne: è una scelta di design, non un fix meccanico.
**Origine:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding **D-04, D-07, D-08, D-11** e la parte "task" di **D-12**. Item 11 del backlog dei test manuali (aggiunto il 2026-10-07).
**Dipende da:** C1 (modulo date, confronto tra mese e giorno) e C2 (controllo condiviso con `min`/`max`).

## Problema

Le date di un task possono stare del tutto fuori dai mesi della sua proposta o del suo progetto, e né la UI né l'API lo impediscono. Dove il periodo serve a distribuire ore o budget, la parte del task che cade fuori viene scartata senza alcun avviso.

## Comportamento attuale

- **D-04:** `PUT …/structure` (`api/src/routes/cost-grids.js:718-731`) e `PUT /api/projects/:id/tasks` (`api/src/routes/projects.js:402-416`) non leggono il periodo del genitore. Le scritture del periodo (version e project PATCH) non guardano i task già salvati.
- **D-07:** in costgrid i picker dei task sono limitati solo dalla data gemella (`costgrid.html:398-408`). `onPeriodChange` (`:1446-1450`) cambia il periodo senza controllare i task.
- **D-08:** `phasingByMonth` (`costgrid.html:1023-1040`) tiene solo i mesi dentro il periodo. Un task a metà fuori conta per metà, un task invertito per zero.
- **D-11:** `deriveDistribution` (`js/lib/config-form-calc.js:35-44`) perde il budget dei giorni fuori dai mesi del progetto. Dopo che il periodo viene ristretto, le chiavi di phasing fuori periodo restano salvate e `phasingSum` (`project-config.html:504`) continua a sommarle. Le `PATCH /:id/phasing|planning|ptc` (`api/src/routes/projects.js:432-433` e seguenti) non controllano le chiavi mese.
- **D-12 (task):** "Generate project" e "Add tasks to project" (`js/costgrid.js:1105-1106,1240-1241`) copiano le date dei task senza confrontarle con il periodo del progetto di destinazione.
- **Dati sullo stack principale (2026-10-24):** 12 task di cost grid su 44 e 9 task di progetto su 28 sono fuori dal periodo.
- Il periodo è in mesi `YYYYMM`, i task sono in giorni `YYYYMMDD` (ISO in memoria). Il confronto lo fornisce il modulo di C1.

## Comportamento atteso

- Un task (di proposta o di progetto) ha Start ≥ il primo giorno del mese di inizio del periodo ed End ≤ l'ultimo giorno del mese di fine.
- La regola vale sia nella UI sia sul server, con la stessa definizione, quella del modulo di C1.
- Nessuna distribuzione (phasing della proposta, derivazione del progetto) scarta in silenzio ore o budget. Se un dato fuori periodo esiste, l'utente lo vede.

## Decisioni aperte per il `/brainstorming`

1. **Dati esistenti fuori periodo:**
   - (a) bloccare il salvataggio finché l'utente non li corregge;
   - (b) segnalarli e permettere di salvare;
   - (c) riallinearli automaticamente al periodo;
   - (d) correggerli una volta sola con un passo confermato.

   Conta anche il caso delle proposte già Committed.
2. **Restringimento del periodo** quando ci sono task che ne uscirebbero: impedire, segnalare i task, oppure riallinearli.
3. **Task senza date**, che oggi ricadono sul periodo: restano ammessi?
4. **Task copiati da una proposta in un progetto** con periodo diverso ("Add tasks to project"): rifiuto, avviso, oppure adattamento.
5. **Chiavi mese delle `PATCH` phasing/planning/PTC fuori periodo** (seconda metà di D-11): stanno in questo ciclo, oppure in un Brief a parte?
6. **Comportamento di `phasingByMonth` / `deriveDistribution`** quando un dato fuori periodo è comunque presente: avviso, oppure una colonna "fuori periodo".

## Vincoli

- Il controllo lato server della regola di periodo convive con quello d'ordine di C1 e usa lo stesso formato di rifiuto (`400 { error, code }`).
- Un salvataggio legittimo (rinomina, riordino, ore) di una proposta che contiene già un task fuori periodo non deve essere bloccato. Fa eccezione il caso in cui la decisione 1 scelga esplicitamente di bloccarlo.
- Se la decisione 1 sceglie una correzione dei dati: va fatto un backup (`scripts/backup-db.sh`) prima di applicarla, e serve la conferma dell'utente (regole di Infrastructure safety in CLAUDE.md).
- Tutto il testo visibile all'utente è in inglese. `?v=N` aggiornati per ogni file versionato toccato. Riavvio di `api` solo nella deroga del Gate 4 step 7.

## Criteri di accettazione

1. `test-api.js`: `PUT …/structure` e `PUT /api/projects/:id/tasks` con un task fuori dal periodo del genitore si comportano come stabilito dalla decisione 1. Lo stesso vale per il PATCH del periodo, secondo la decisione 2.
2. Un test (vitest) verifica che i picker di un task in costgrid e in project-config non permettano di scegliere, né digitando né cliccando, un giorno fuori dai mesi del periodo.
3. Un test sulla distribuzione verifica che, con un task fuori periodo, la somma del phasing sia uguale al totale del task, oppure che lo scarto sia mostrato all'utente.
4. Dopo il ciclo, le query del report ("cg tasks outside version months", "project tasks outside project months") danno il risultato voluto dalla decisione 1.

## Scope escluso esplicitamente

- Il modulo date e i controlli di formato e ordine (C1). Il controllo dei form e il formato digitato (C2).
- Il resto delle note "Out of scope" del report: codice morto di costgrid, `PUT /tasks` non transazionale.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
