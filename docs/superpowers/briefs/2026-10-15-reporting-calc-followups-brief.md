# Brief — follow-up dei calcoli del reporting di progetto (B-080, B-081)

**Brief started:** 2026-10-15 (avvio di `/feature-brief`)
**Classificazione (dichiarata dall'utente, 2026-10-15):** Scenario 2 (evoluzione).
Fonte: `docs/BACKLOG.md`, righe B-080 e B-081, aperte dal ciclo `project-reporting-calc-fix` (`2d0264b`,
report `docs/superpowers/reports/2026-10-15-project-reporting-calc-fix-finish-cycle.md`).
Le scelte sul comportamento atteso sono state delegate dall'utente alle raccomandazioni proposte
(«procedi seguendo le tue raccomandazioni»): B-081 deciso, B-080 lasciato a `/brainstorming`.
**B-082 escluso dall'utente (2026-10-15)** dopo la verifica di raggiungibilità sotto: resta in backlog.

## Current behavior

### B-080 — pillola Today vs tile Hours

- **Tile Hours e Budget** (`portfolio.html` righe 385-390, dati da `computeKpis`,
  `js/lib/portfolio-calc.js` righe 7-27): `consumedHours`, `hoursLeft` e `consumedEur` sommano **tutte**
  le righe di `billableData`, senza filtro di data.
- **Pillola Today** (`portfolio.html` riga 1632, `todayValue`): viene da `remainingAsOf`
  (`js/lib/portfolio-calc.js` righe 77-81), che conta solo le righe con `r.date <= date`.
- Con righe datate dopo oggi (pre-registrate o un refuso di data) la pillola mostra più ore residue del
  «left» del tile. La spec del ciclo precedente (`docs/superpowers/specs/2026-10-15-project-reporting-calculations-fix-design.md`)
  afferma che i due coincidono: vale solo senza righe future.
- `remainingAsOf` è condivisa: la usa anche il Program Dashboard (`js/lib/program-calc.js` righe 210, 226).

### B-081 — tooltip Budget con filtro task

- `computeBurndownPoints` (`js/lib/portfolio-calc.js` righe 128-130): con `taskFilter`,
  `totalBudgetEur` somma `soldHours × hourlyRate` su `cfg.tasks`, cioè su **tutti** i task del progetto,
  non billable inclusi; senza filtro su `billableTasks(cfg)`.
- Il budget in ore con filtro invece è del solo task filtrato (`burndownBudget`, righe 67-73).
- Il tooltip (`portfolio.html` righe 1662-1666) stampa `Remaining = totalBudgetEur − consumed`, dove
  `consumed` è del solo task filtrato: il residuo è quindi il budget dell'intero progetto meno il consumo
  di un task.
- Con filtro la linea ideale a phasing è già spenta (`usePhasingIdeal`, riga 131): `totalBudgetEur` con
  filtro alimenta solo il tooltip.

## Expected behavior

- **B-080:** la pillola Today e il tile Hours non si contraddicono in presenza di righe datate dopo oggi.
  Quale dei due cambia (o se le ore future vanno mostrate a parte) è una domanda aperta per
  `/brainstorming`.
- **B-081:** con un filtro task, la sezione Budget del tooltip usa il budget in € del **solo task
  filtrato** (`soldHours × hourlyRate` delle sue risorse), lo stesso perimetro del budget in ore; il
  Remaining è quel budget meno il consumo in € del task. Senza filtro il comportamento non cambia.

## Constraints

- Frontend soltanto; nessun build step, i file restano serviti così come sono.
- Funzioni pure in `js/lib/` con test vitest; `js/core.js` resta uno script classico.
- Ogni file versionato toccato richiede il bump di ogni suo `?v=N` in tutto il repo (CLAUDE.md,
  "Cache-busting").
- Le modifiche a funzioni condivise (`remainingAsOf`) si riflettono anche su
  `program.html` e sulle altre pagine che le caricano: il comportamento lì va verificato, non dato per
  invariato.
- Characterization test sul comportamento attuale prima di cambiarlo (Scenario 2).

## Acceptance criteria

1. Con un progetto che ha righe datate dopo oggi, la pillola Today e il tile Hours sono coerenti secondo la
   regola fissata in Spec; un test vitest lo pinna.
2. Con un filtro task, il tooltip Budget mostra `Remaining = budget € del task − consumo € del task`; un
   test su `computeBurndownPoints` pinna `totalBudgetEur` con e senza filtro, incluso un progetto con un
   task non billable.
3. Senza righe future e senza filtro task, tutti i valori del reporting restano
   identici a oggi (test esistenti verdi).
4. `npm test` verde; `?v=N` coerenti per ogni file toccato.

## Explicitly excluded scope

- **B-082** (regola di confronto dei nomi task): raro — l'upload (`api/src/routes/timesheets.js`,
  `findRoleTaskInconsistencies`, righe 266-283, `trim()` a riga 161) rifiuta già ogni task che non
  coincide in lower-case, quindi il caso nasce solo da righe caricate prima di quel controllo o da una
  rinomina che cambi solo gli spazi. Resta `open` in `docs/BACKLOG.md`.
- Validazione dell'upload e `resolveFee` lato server (`api/`): il ciclo è solo frontend.
- `program.html` e `js/lib/program-calc.js`, salvo quanto ereditano dalle funzioni condivise.
- Gli altri follow-up aperti del 7.4: B-068, B-069, B-070, B-078, B-079.

## Open questions for `/brainstorming`

1. **B-080:** quale lato cede — il tile conta «as of today» (e allora anche il tile Budget?), la pillola
   conta tutto (e diverge dalla linea), oppure le ore future si mostrano a parte?
