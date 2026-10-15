# Spec — follow-up dei calcoli del reporting di progetto (B-080, B-081)

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-15-reporting-calc-followups-brief.md` (Scenario 2).
Design concordato in chat il 2026-10-15 (una fermata, §6b). B-082 escluso dall'utente, resta in
`docs/BACKLOG.md`.

## 1. Stato attuale

Vedi il Brief, sezione "Current behavior" — non ripetuto qui. In sintesi:

- **B-080.** Il tile Hours (`computeKpis`, `js/lib/portfolio-calc.js`) conta tutte le righe fatturabili;
  la pillola Today (`remainingAsOf`) conta solo quelle con `r.date <= today`. Il resto del report è già
  "as of today": il burndown si ferma a oggi, il Monthly summary nasconde le ore dei mesi futuri
  (`portfolio.html`, `monthState(...) === 'future'`). Il Total del Breakdown conta tutte le righe, e la
  spec `docs/superpowers/specs/2026-10-15-project-reporting-calculations-fix-design.md` pinna che le sue
  ore coincidono con il tile Hours.
- **B-081.** In `computeBurndownPoints`, con `taskFilter`, `totalBudgetEur` somma il budget in € di
  `cfg.tasks` (tutti i task, non fatturabili inclusi), mentre il budget in ore è del solo task filtrato.

## 2. Comportamento atteso

### B-080 — ore datate dopo oggi

Tile e pillola non cambiano valore; la differenza diventa visibile.

- `computeKpis(data, cfg, billableData, billableTasks, findRate, today = null)`: nuovo parametro opzionale.
  Il risultato porta un campo in più, `futureHours`: la somma delle ore delle righe di
  `billableData(data, cfg)` con `r.date > today`; `null` quando `today` non è passato. Vale anche senza
  `cfg` (stesso ramo anticipato, `futureHours` aggiunto). Tutti gli altri campi restano identici.
- `portfolio.html`: il computed `kpis` passa `this.reportToday`. Gli altri chiamanti
  (`js/lib/pipeline-calc.js`, `js/lib/program-calc.js`) non passano `today` e non cambiano.
- Sotto il tile Hours, solo quando `kpis.futureHours > 0`, una nota con la classe esistente
  `.pr-kpi-note` (la stessa della nota PTC del tile Budget): `incl. <fmtH(futureHours)> dated after today`.
- Invariante, con `cfg` e progetto con date: `todayValue = max(0, hoursLeft + futureHours)`, dove
  `hoursLeft` e `futureHours` vengono da `computeKpis` con lo stesso `today`.

### B-081 — budget € con filtro task

- In `computeBurndownPoints`, con `taskFilter`, `totalBudgetEur` è la somma di
  `soldHours × hourlyRate` delle risorse del task trovato con lo stesso confronto di `burndownBudget`
  (`t.name.toLowerCase() === taskFilter.toLowerCase()`); `0` se il task non esiste. Senza filtro, invariato.
- Effetto visibile: il Remaining della sezione Budget del tooltip è il budget € del task meno il suo
  consumo €. La linea ideale a phasing resta spenta con filtro (`usePhasingIdeal`), quindi non cambia
  altro.

## 3. File toccati

- `js/lib/portfolio-calc.js` — `computeKpis`, `computeBurndownPoints`.
- `js/lib/portfolio-calc.test.js` — test (sezione 4).
- `portfolio.html` — computed `kpis`, nota sotto il tile Hours.
- Cache-busting (CLAUDE.md "Cache-busting"): `portfolio-calc.js` passa da `?v=7` a `?v=8` in
  `portfolio.html`, `program.html` e negli import di `js/lib/program-calc.js` e
  `js/lib/project-report-calc.js` (commenti `?v=7` inclusi). Quei due file cambiano a loro volta, quindi
  `program-calc.js` passa da `?v=3` a `?v=4` (`portfolio.html`, `program.html`) e `project-report-calc.js`
  da `?v=2` a `?v=3` (`portfolio.html`).

## 4. Test

Vitest, `js/lib/portfolio-calc.test.js`, prima della modifica i test di caratterizzazione:

1. Con righe datate dopo `today`, `remainingAsOf(..., today)` le esclude e `computeKpis` le conta in
   `consumedHours`.
2. Con un filtro task su un progetto con un task non fatturabile, `totalBudgetEur` oggi è la somma su tutti
   i task (pinna il difetto; il test viene poi aggiornato al valore atteso).

Dopo la modifica:

3. `futureHours`: `null` senza `today`; somma delle sole righe fatturabili con data `> today` (una riga
   futura su un task non fatturabile non conta); `0` senza righe future; presente anche senza `cfg`.
4. `totalBudgetEur` con filtro = budget € del solo task; senza filtro invariato; task filtrato
   inesistente → `0`.
5. Invariante: `computeBurndownPoints(...).todayValue === Math.max(0, kpis.hoursLeft + kpis.futureHours)`
   su un progetto con date e righe future.
6. I test esistenti restano verdi (criterio 3 del Brief: senza righe future e senza filtro nulla cambia).

Verifica visiva (§6.3): una sola, sul report di un progetto con almeno una riga datata dopo oggi — la nota
appare sotto il tile Hours, e il tooltip filtrato su un task mostra il Remaining del task.

## 5. Fuori scope

- B-082 (resta in `docs/BACKLOG.md`).
- Lato server (`api/`), dati salvati.
- Program Dashboard: ha la stessa asimmetria tra `todayRemaining` e i totali, e non riceve la nota.
- `kpiPace` continua a contare anche le ore future.
- Gli altri follow-up del 7.4: B-068, B-069, B-070, B-078, B-079.

## Decisioni aperte

1. **B-080: nota sotto il tile Hours, tile e pillola invariati.** Alternativa scartata: tile "as of today", oppure pillola che conta tutto. Perché: la prima rompe l'invariante Breakdown Total = tile Hours, la seconda stacca la pillola dal punto della linea su cui è disegnata.
2. **Nota solo sul tile Hours, non sul tile Budget.** Alternativa scartata: una nota in € anche sul tile Budget. Perché: nessun elemento del report confronta il tile Budget con un valore a oggi.
3. **Il Program Dashboard non riceve la nota.** Alternativa scartata: estenderla a `program.html`. Perché: fuori scope per il Brief.
4. **`kpiPace` invariato.** Alternativa scartata: calcolarlo a oggi. Perché: è un indicatore che il Brief non nomina.
