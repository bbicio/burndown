# Spec — date, ciclo C4: salvataggi e messaggi dopo la regola del periodo

**Brief started:** 2026-10-26 17:40
**Brief:** `docs/superpowers/briefs/2026-10-26-dates-c4-saves-after-period-rule-brief.md` (Scenario 2, evoluzione).
**Handoff:** `docs/superpowers/briefs/2026-10-26-dates-c4-handoff.md` (stato dopo C3, lezioni di C3).
**Righe di BACKLOG:** B-150, B-159, B-128, B-131, B-157, B-158, B-161, B-130, B-136, B-138.
Design concordato in chat il 2026-10-26 (una fermata, §6b).

## 1. Scope

Un solo Save (o autosave) che cambia insieme il periodo e le date dei task passa quando lo stato finale rispetta la regola del periodo di C3, ed è rifiutato con il messaggio del periodo quando non la rispetta. Gli avvisi e i messaggi dicono esattamente cosa non è stato salvato. Gli stati provvisori con inizio dopo la fine non fanno perdere dati e non mostrano un messaggio che non corrisponde alla causa.

Fuori scope: quello che il Brief elenca in "Scope escluso esplicitamente".

## 2. Il periodo viaggia con i task

### 2.1 Regola

Quando il client manda i task di una versione (la struttura) o di un progetto (la lista task), il periodo va **nella stessa richiesta** e **non** nella `PATCH`. Il server controlla i task contro il periodo della richiesta e scrive periodo e task nella stessa transazione. Quando il client non manda i task, il periodo resta nella `PATCH`, controllato contro i task salvati come oggi (`periodShrinkError`).

### 2.2 Server — `PUT /api/cost-grids/:id/versions/:vId/structure`

- Il body accetta in più `period: { startDate, endDate }` (mesi `YYYYMM` o vuoto), facoltativo. Senza `period` la route si comporta come oggi.
- Con `period`, dentro la transazione e dopo `lockVersion`:
  1. `periodChangeError({ start, end }, { stored }, { kind: 'month', label: 'version' })`; un errore → `ROLLBACK`, `400 { error, code: 'DATE_RULE' }`;
  2. ogni task con `taskPeriodError` contro il periodo della richiesta (non quello salvato);
  3. `UPDATE cost_grid_versions SET start_date, end_date` (vuoto → `NULL`, come la `PATCH`), prima di cancellare e riscrivere le fasi.
- Il controllo d'ordine dei task (`periodError` con `kind: 'day'`) passa **dopo** il controllo di periodo (§5.1).

### 2.3 Server — `PUT /api/projects/:id/tasks`

- Il body accetta l'array di oggi **oppure** `{ tasks, period: { startDate, endDate } }`. Con l'array la route si comporta come oggi.
- La route diventa una transazione su un client dedicato (`BEGIN`/`COMMIT`/`ROLLBACK`), con o senza `period`.
- Con `period`: `periodChangeError(…, { kind: 'month', label: 'project' })`, poi `taskPeriodError` di ogni task contro il periodo della richiesta, poi `UPDATE projects SET start_date, end_date`, poi la cancellazione e il reinserimento dei task.
- Il controllo d'ordine dei task passa dopo il controllo di periodo (§5.1). Il controllo delle ore vendute resta il primo.
- `enqueueProjectCode` resta dopo il `COMMIT`.

### 2.4 Client — `_cgUpsertVersionToApi` (`js/api-sync.js`)

Con la struttura caricata (`phases.length > 0`):
1. nome della griglia (`Api.costGrids.update`);
2. `PATCH` della versione **senza** `startDate` e `endDate`;
3. `saveStructure` con `{ phases, roles, period: { startDate, endDate } }`.

Senza struttura caricata: nome, poi `PATCH` con il periodo, come oggi.

Il ritentativo di C3 (`metaRefusal`, `structureSaved`, il secondo `versions.update`) viene tolto. Un rifiuto della `PATCH` (con o senza `DATE_RULE`) non impedisce più il salvataggio della struttura; il valore di ritorno resta `true` solo se ogni scrittura è arrivata al server. Con `strict` il primo errore lancia, come oggi.

### 2.5 Client — `_pushProjectToApiDetailed` (`js/api-sync.js`)

Quando la lista task va mandata (`wanted(tasks)`):
1. `PATCH` del progetto **senza** `startDate` e `endDate`; il ripiego su `POST` per un progetto non ancora creato manda il periodo, come oggi;
2. `saveTasks(project.id, { tasks, period: { startDate, endDate } })`;
3. phasing, PTC, planning, gruppi, come oggi.

Quando la lista task non va mandata, la `PATCH` porta il periodo come oggi. Un rifiuto della `PATCH` continua a non tentare le sezioni (§3.3). Un rifiuto del `PUT` dei task con il periodo è registrato come `{ part: 'tasks', withPeriod: true, … }`.

`Api.projects.saveTasks` (`js/api.js`) manda il secondo argomento così com'è: array o oggetto.

### 2.6 Esito per combinazione

| Modifica | Struttura caricata | Richieste, in ordine | Stato finale valido | Stato finale invalido |
|---|---|---|---|---|
| Restringere | sì | nome, `PATCH` senza periodo, struttura + periodo | tutto salvato | intestazione salvata; periodo e struttura no; avviso §3.1 |
| Allargare | sì | idem | tutto salvato | idem |
| Spostare | sì | idem | tutto salvato | idem |
| Solo periodo | no | nome, `PATCH` con periodo | salvato | `PATCH` rifiutata con `periodShrinkError`; nulla della versione salvato |
| qualunque | strict (`+ New version`, Clone) | come sopra | la copia parte dallo stato modificato | il primo rifiuto lancia; l'azione si ferma con il suo messaggio |
| Save di `project-config.html` | — | `PATCH` senza periodo, task + periodo, sezioni | tutto salvato, redirect | intestazione e sezioni salvate; task e periodo no; messaggio §3.3 |

## 3. Avvisi e testi

### 3.1 Avvisi di rifiuto in costgrid (B-128, B-131)

- `_cgRuleNotified` resta un `Set`, ma la chiave è `` `${versionId}|${code}|${message}` ``.
- Quando `saveStructure` di una versione va a buon fine, e quando `cgLoadStructureFromApi` ricarica la sua struttura, si cancellano tutte le chiavi che iniziano con `` `${versionId}|` ``. La funzione che lo fa è esportata dallo stesso file, per i test.
- Il testo per `DATE_RULE` diventa: `<messaggio del server>. Task dates and the period of this version are not saved until this is fixed; other changes are saved.` Il testo per `STRUCTURE_RULE` non cambia.

### 3.2 Banner fuori periodo (B-161)

- `costgrid.html`: `N task(s) is/are outside the proposal period (S – E). Task dates and the period are not saved until the tasks are moved inside it or the period is widened; other changes are saved.`
- `project-config.html`: lo stesso, con `project period`.
- Il ramo con il periodo non valido (`list[0].error`) non cambia.

### 3.3 Messaggio del Save di `project-config.html` (B-138)

`summarizePushResult` (`js/lib/project-push-result.js`):
- con un solo fallimento `part: 'project'`: `Save failed: project details were not saved, so tasks, phasing, PTC, monthly planning and role groups were not attempted. Fix the issue and press Save again.`, più ` Reason: …` come oggi;
- con `part: 'tasks'` e `withPeriod: true`, l'etichetta è `tasks and the project period`;
- gli altri casi non cambiano.

## 4. Generate e Add tasks

### 4.1 Generate da un periodo non valido (B-130)

`cgGenerationPlan` (`js/costgrid.js`) calcola `refusal` anche quando il periodo della versione non passa `periodError(start, end, { kind: 'month', label: 'proposal' })` di `js/lib/dates.js`, con o senza task datati. Il rifiuto arriva prima di ogni scrittura: niente `config.projects`, niente `linkedProjects`, niente richieste.

### 4.2 Rifiuto del `PUT` dei task (B-136)

- **Add tasks to project** (`cgDoAddTasksToProject`): usa `_pushProjectToApiDetailed(proj, { skipEmpty: true })`. Se fra i `failed` c'è `part: 'tasks'`, toglie da `proj.tasks` i task appena aggiunti, non aggiorna `linkedProjects` e mostra `showInfo` con il motivo del server. Un fallimento della sola `PATCH` si comporta allo stesso modo.
- **Generate** (`cgDoGenerateProject`): usa `_pushProjectToApiDetailed`. Il progetto creato resta, e resta il collegamento. Se il `PUT` dei task fallisce, il collegamento si registra con `taskIds` e `taskNames` vuoti, e l'avviso finale dice che il progetto è stato creato ma i task non sono stati salvati, con il motivo.

## 5. Stati provvisori inizio > fine

### 5.1 Messaggio (B-157)

In `PUT …/structure` e in `PUT /api/projects/:id/tasks` il controllo di periodo di ogni task (`taskPeriodError`) passa prima del controllo d'ordine (`periodError` con `kind: 'day'`). Un task invertito con almeno una data fuori periodo riceve il messaggio del periodo. Il controllo di formato resta, perché `taskPeriodError` ignora le date malformate e `periodError` le rifiuta dopo. I picker non cambiano.

### 5.2 Distribuzione mensile (B-158)

Nuova funzione pura `keepDistribution(dist, months)` in `js/lib/config-form-calc.js`, con bridge `window.keepDistribution`:
- con `months` vuoto restituisce `dist` invariata;
- altrimenti le chiavi di `dist` contenute in `months`, con `100` sull'unico mese quando `months` ne ha uno solo (il comportamento di oggi).

`rebuildTaskDist` di `project-config.html` la usa.

## 6. Test e verifica

- **vitest, `_cgUpsertVersionToApi`:** una riga per ogni riga di §2.6 lato costgrid. Per ognuna: la sequenza delle chiamate, la presenza o l'assenza del periodo nel body della `PATCH` e della struttura, il valore di ritorno o l'eccezione in strict. Più le chiavi di `_cgRuleNotified` (§3.1).
- **vitest, `_pushProjectToApiDetailed`:** con e senza task da mandare, `PATCH` rifiutata, task rifiutati con `withPeriod`.
- **vitest, il resto:** `summarizePushResult` (§3.3), `keepDistribution` (§5.2), `cgGenerationPlan` con periodo invertito (§4.1), Add tasks con il `PUT` rifiutato (§4.2), i testi dei banner (§3.2).
- **`test-api.js`, id `PS-01` in poi** (prefisso libero il 2026-10-26: `grep -noE "\bPS-0[0-9]" test-api.js TEST_CASES.md` non trova nulla):
  - struttura + periodo che sposta il periodo con un task nella parte nuova → `200`, periodo e task salvati;
  - struttura + periodo con lo stato finale invalido → `400 DATE_RULE`, periodo e struttura invariati;
  - struttura senza `period` → comportamento di oggi;
  - task di progetto con `{ tasks, period }`: gli stessi tre casi, più il body ad array;
  - task invertito e fuori periodo → il messaggio del periodo (§5.1), sui due `PUT`.
- **`scripts/shoot.mjs --eval-file` sul branch stack:** lo spostamento combinato (periodo e un task nella parte nuova) in costgrid e in project-config, annotando i record toccati.
- I guard da lanciare, per nome di file: `js/lib/costgrid*guard*.test.js` per ogni task su `costgrid.html`, quelli di `project-config` per `project-config.html`, quelli dei `?v=` per ogni file versionato toccato (`js/api-sync.js`, `js/api.js`, `js/costgrid.js`, `js/lib/project-push-result.js`, `js/lib/config-form-calc.js`).

## 7. Documentazione

`/sync-docs` aggiorna `docs/js/api-sync.md`, `docs/js/lib.md`, `docs/pages/costgrid.md`, `docs/pages/project-config.md`, la sezione "Dates" di `CLAUDE.md` se una sua regola cambia, e le righe di `docs/BACKLOG.md` chiuse dal ciclo.

## Criteri di accettazione

1. **Combinazioni costgrid** — un test vitest per ogni riga costgrid di §2.6 passa.
2. **Spostamento su server** — `test-api.js` `PS-*`: struttura e task di progetto con `period` che sposta il periodo e porta un task nella parte nuova sono salvati in una sola richiesta.
3. **Stato finale invalido** — `test-api.js` `PS-*`: periodo e task restano invariati dopo un `400 DATE_RULE`.
4. **Compatibilità** — `test-api.js` `PS-*`: struttura senza `period` e task di progetto ad array si comportano come prima.
5. **Flush strict** — vitest: `+ New version` dopo uno spostamento combinato entro il debounce chiama `saveStructure` con il periodo nuovo prima della copia (B-159).
6. **Save di project-config** — vitest: un Save che restringe il periodo e sposta un task dentro manda la `PATCH` senza periodo e poi i task con il periodo (B-150); a mano sul branch stack, il redirect al portfolio avviene e il periodo è quello nuovo.
7. **Avvisi** — vitest: dopo un avviso `DATE_RULE`, un rifiuto `STRUCTURE_RULE` della stessa versione mostra un avviso; dopo un salvataggio riuscito della struttura, lo stesso rifiuto di prima si mostra di nuovo (B-128, B-131).
8. **Banner** — i banner di `costgrid.html` e `project-config.html` portano i testi di §3.2 (B-161).
9. **Messaggio di Save** — vitest su `summarizePushResult`: i testi di §3.3 (B-138).
10. **Distribuzione** — vitest: `keepDistribution` con `months` vuoto restituisce la distribuzione invariata (B-158).
11. **Messaggio del periodo prima dell'ordine** — `test-api.js` `PS-*`: un task invertito e fuori periodo riceve il messaggio del periodo (B-157).
12. **Generate con periodo invertito** — vitest: nessuna richiesta, nessuna modifica di `config.projects` né di `linkedProjects`, `refusal` con il motivo (B-130).
13. **Add tasks rifiutato** — vitest: `proj.tasks` e `linkedProjects` invariati, avviso con il motivo (B-136).
14. **Verifica nel browser** — `scripts/shoot.mjs --eval-file` sul branch stack: lo spostamento combinato in costgrid e in project-config si salva senza avvisi.
15. **Dati invariati** — le due query dell'handoff danno ancora `12 44` e `9 28` sullo stack principale.

## Decisioni aperte

1. **Il periodo viaggia con i task, nella stessa transazione.** Alternativa scartata: l'ordine delle scritture deciso dal client (a), o una `PATCH` che si fida dei task dichiarati nel body (c). Perché: (a) costa tre richieste e salva uno stato intermedio; con (c), se il `PUT` fallisce, resta salvato un periodo che esclude i task salvati.
2. **Il `PUT` dei task di progetto accetta anche l'array.** Alternativa scartata: una sola forma nuova per tutti i chiamanti. Perché: `test-api.js` e i chiamanti di `js/costgrid.js` mandano l'array.
3. **Con lo stato finale invalido non si salva neanche un allargamento parziale del periodo.** Alternativa scartata: lasciare che la `PATCH` salvi da sola un allargamento che lascia fuori dei task. Perché: si giudica lo stato finale.
4. **Dopo un rifiuto della `PATCH` di progetto le sezioni vengono nominate, non tentate.** Alternativa scartata: tentarle comunque. Perché: scriverebbero su un progetto appena rifiutato dalle regole.
5. **B-157 si risolve con l'ordine dei controlli sul server.** Alternativa scartata: impedire inizio > fine nel picker. Perché: con la gemella fuori periodo darebbe di nuovo min > max.
6. **Un avviso torna mostrabile quando cambia codice o messaggio, dopo una struttura salvata o dopo un ricaricamento.** Alternativa scartata: svuotare il `Set` a ogni autosave. Perché: lo stesso avviso tornerebbe ogni due secondi.
7. **Generate con i task rifiutati tiene il progetto e il collegamento, senza quei task.** Alternativa scartata: annullare la generazione. Perché: la cancellazione di un progetto è inibita.
8. **Il `PUT` dei task di progetto diventa transazionale anche senza `period`.** Alternativa scartata: transazione solo con `period`. Perché: una sola forma della route, e la corsa con la `PATCH` (B-151) resta fuori in entrambi i casi.
9. **La `PATCH` di progetto omette il periodo ogni volta che i task vengono mandati, anche se il periodo non è cambiato.** Alternativa scartata: ometterlo solo quando è cambiato. Perché: una regola senza confronto con lo stato salvato, e il server tratta un periodo uguale a quello salvato come nessun cambio.
10. **Un rifiuto della `PATCH` della versione non impedisce più il salvataggio della struttura.** Alternativa scartata: fermarsi come oggi su ogni rifiuto che non sia `DATE_RULE`. Perché: la `PATCH` non porta più il periodo, quindi struttura e intestazione sono scritture indipendenti, come già lo sono il nome e la versione.
