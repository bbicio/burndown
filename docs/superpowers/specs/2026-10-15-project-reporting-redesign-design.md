# Project Reporting v2 (tavola 7.4) — design spec

**Date:** 2026-10-15
**Brief started:** unknown
**Brief:** `docs/superpowers/design/2026-10-15-briefing-project-reporting.md`
**Scenario:** 2 (evoluzione)

Restyling della vista `dashboard` di `portfolio.html` (`showDashboard(pid)`, `?projectId=`). Tavole in
`docs/superpowers/design/reporting-project/`:

| Tavola | File | Ruolo |
|---|---|---|
| 7.4a | `74a-reporting-project-pm-burndown_breakdown_bytask.jpg` | **Riferimento principale** — Burndown + Breakdown By task, un task espanso |
| 7.4a | `74a-reporting-project-pm-monthly_breakdown_bytask.jpg` | Progress su Monthly summary |
| 7.4c | `74a-reporting-project-pm-breakdown_byrole.jpg` | Breakdown By role |
| 7.4a | `74a-reporting-project-pm-monthly_breakdown_byfunctionalarea.jpg` | Breakdown By functional area |
| 7.4b/d | `74d-reporting-project-switch_progetto_filtro_period.jpg` | Switch fratelli aperto, menu Period aperto |

Le tavole prevalgono sul brief per l'aspetto; il codice prevale su entrambi per le regole di business.
Dati, tariffe e registrazioni nelle tavole sono illustrativi. Nelle tavole un mese delle Entries è
aperto e un task è espanso a solo scopo illustrativo: a riposo nessuno dei due lo è (decisioni 3 e 8).

## 1. Obiettivo

Tre blocchi **KPI → Progress → Breakdown**; la pagina a riposo sta in circa una schermata e mezza e il
dettaglio si apre solo su richiesta (un task alla volta, un mese alla volta). Nessun endpoint, nessun
SQL, nessun calcolo esistente cambiato, con un'unica eccezione voluta: il significato di Spent sotto il
filtro Period (§2.1, §8).

## 2. Fatti verificati nel codice

1. **Spent sotto filtro.** Oggi le tre tabelle di riepilogo mostrano come Spent
   `totalConsumed − inPeriod` (tutto tranne il periodo) e il valore del periodo in una riga
   "In period"; `summaryTotals()` fa lo stesso sul totale. La nuova colonna Spent mostra `inPeriod`.
   Remaining resta `soldHours − totalConsumed` con e senza filtro.
2. **Serie del burndown.** La linea "Remaining hours planned (phasing)" della Program Dashboard è
   `idealValues` di `computeBurndownPoints()` (phasing in denaro convertito in ore, oppure trend
   lineare senza phasing), non `planningData` (Estimated Hours).
3. **Task fatturabili.** `summaryByTask` usa `billableTasks(cfg)`; `taskDetailData` usa `cfg.tasks`
   (inclusi quelli col badge "Excluded from report").
4. **By role.** `summaryByRole` usa la chiave composta `role|task`; la tavola aggrega un ruolo su più
   task. Vince la chiave composta.
5. **Metriche di progetto.** `projectMetrics()` (`js/lib/program-calc.js`) dà `consumptionPct`,
   `timePct` e `vsTime` con le stesse formule della List della Program Dashboard; `computeKpis()` dà
   ore e importi. I due coincidono sulle ore (stessa `billableData`, stessi `soldHours`).
6. **Plugin Today.** Esiste solo inline in `program.html` (`renderBurndownChart`, `pgTodayLabel`).

## 3. File

| File | Cambio |
|---|---|
| `portfolio.html` | template della vista `dashboard` riscritto; computed/metodi di presentazione nuovi; computed di calcolo esistenti invariati salvo campi aggiunti per la sola presentazione (§4, "Campi aggiunti") |
| `js/lib/project-report-calc.js` | **nuovo**, modulo puro con `window.` bridge (§4) |
| `js/lib/project-report-calc.test.js` | **nuovo** |
| `js/lib/chart-today.js` | **nuovo**, plugin Chart.js del marcatore Today (§5) |
| `js/lib/chart-today.test.js` | **nuovo** |
| `program.html` | usa `chart-today.js` al posto del plugin inline; nessun cambio visibile |
| `css/portfolio.css` | classi `.pr-*` |
| `js/lib/portfolio-calc.test.js` | characterization test (§11) |

`js/lib/portfolio-calc.js` e `js/lib/program-calc.js` non cambiano.

## 4. Modulo `js/lib/project-report-calc.js`

Funzioni pure, senza DOM né globali; le dipendenze (formattazione esclusa) arrivano come parametri.

- `paceJudgment(vsTime, threshold = 10)` → `'on-track' | 'ahead' | 'behind' | null`. `null` se
  `vsTime` è `null`; `'ahead'` se `vsTime > threshold` ("Hours ahead of time"), `'behind'` se
  `vsTime < −threshold` ("Hours behind time"), altrimenti `'on-track'` ("Hours on track"). La soglia è
  la `vsTime` di `needsAttention()`.
- `breakdownRows(cols, hasFilter)` → per ogni colonna di `buildSummaryCols()`/`summaryByGroup`:
  `{ label, soldHours, soldAmount, spentHours, spentAmount, remainingHours, remainingAmount, pct,
  barState, overSold }`, dove `spent = hasFilter ? inPeriod : totalConsumed`,
  `remaining = sold − totalConsumed`, `pct = spentPercent(totalConsumed, soldHours)`,
  `barState = spentBarState(pct)`, `overSold = totalConsumed > soldHours`. Più una riga totale con le
  stesse regole sulle somme. `summaryTotals()` resta com'è e non viene più usato dalla vista.
- `taskSubtitle(task, groups)` → `"N roles · <aree>"`: le aree sono i nomi dei gruppi che, tramite
  `normalizeGroupEntries`/`entryMatchesRow`, rivendicano almeno una coppia (ruolo, task) del task,
  unite da `" · "`; senza aree resta `"N roles"`.
- `roleSubtitle(role, task, rows)` → `"<risorse> · <task>"`: le risorse sono gli `owner` distinti delle
  registrazioni di quella coppia; senza registrazioni resta il nome del task.
- `groupSubtitle(group, tasks)` → nomi dei task coperti dal gruppo (una voce jolly copre i task che
  hanno quel ruolo), separati da virgola.
- `entriesByMonth(rows, rateFor)` → `[{ ym, count, hours, amount, rows }]`, mese più recente primo,
  righe in ordine di data; `amount` usa `rateFor(row)` (la stessa tariffa di oggi in
  `taskDetailRows`: la tariffa del ruolo nel task, `null` se il ruolo non è configurato).
- `hoursByMonth(rows)` → mappa `YYYY-MM → ore`, per il menu Period.
- `monthState(ym, today)` → `'past' | 'current' | 'future'`.
- `todayIndex(points, today)` → indice dell'ultimo punto ≤ oggi, `null` se oggi è fuori dall'asse.

### Campi aggiunti ai computed esistenti (solo presentazione)

- `monthlySummary.months[]` riceve `ym`.
- `taskDetailData[].rows[]` riceve `role`, `owners` e `rate` (già calcolati lì dentro, oggi fusi nel
  `label`).
- `dashboardSiblings` include anche il progetto corrente (flag `current`) e ogni voce riceve le sue
  `metrics` da `projectMetrics()`.

## 5. Helper `js/lib/chart-today.js`

`todayLabelPlugin({ id, index, text, bg, fg })` → oggetto plugin Chart.js con `afterDraw` che disegna
la pillola sopra il punto `index` del dataset 0; no-op se `index` è `null` o il punto non esiste. È il
codice di `program.html` spostato, con testo e colori come parametri. `program.html` lo chiama con il
suo testo attuale (`"<ore> left · <label>"`); `portfolio.html` con `"<ore> left"`.

## 6. Layout — mappa tavola → sezione

**Testata.** Breadcrumb invariata. Link compatto "‹ Project Portfolio" (`showOverview`). Riga programma
(solo con `programId`): "PROGRAM" maiuscoletto, nome, "N projects", "Program Dashboard →" verso
`/program.html?programId=`. Titolo 26px/700 navy + pillole stage (`pipelineBadge`) e status
(`statusBadgeLarge`). Riga metadati: cliente · codice monospace (`dashboardProject.code`, mai l'UUID) ·
`monthLabel(start) – monthLabel(end)` · tag del progetto come pillole se presenti. A destra, alti 32px,
con icona SVG `stroke="currentColor"`: Configure e Load Actuals (`my_permission !== 'viewer'`),
Planning, Share (modale esistente).

**Switch fratelli** (solo con `programId`). Il titolo diventa il bottone del menu (chevron, fondo grigio
su hover/aperto). Intestazione "Projects in program <nome>"; una riga per progetto del programma
ordinata per codice poi nome: nome (✓ sul corrente), codice monospace, pillola status, barra 4px + %
(`consumptionPct`, soglie `spentBarState`). Piede: "N projects · Xh sold · Y% consumed" da
`programTotals()` e "Program Dashboard →". Click → `showDashboard(id)`.

**KPI** (3 tile, riuso del pattern `.pg-kpis` con `.pf-spent-bar`):

| Tile | Valore | Accanto | Barra | Riga in fondo |
|---|---|---|---|---|
| Hours | `consumedHours` | "of `soldHours`" | `consumptionPct` | "N% consumed" · "`hoursLeft` left" |
| Budget | `consumedEur` | "of `budgetTotal`" | `spentPercent(consumedEur, budgetTotal)` | "N% spent" · "`budgetLeft` left"; sotto, "incl. X PTC" se `totalPtc > 0` |
| Time elapsed | `timePct`% | durata | grigia | "As of <oggi>" · giudizio di ritmo |

Residui colorati con `kpiLeftColor()`. Senza budget: "—", barra vuota, "No budget". Senza date: "—",
barra vuota, nessun giudizio. Importi in `dashCurrency`.

**Card Progress.** Testata: "Progress" + segmentato Burndown | Monthly summary | Pass-through (terza
voce solo se `ptcReport`).
- *Burndown*: toolbar a destra su una riga — segmentato Monthly/Quarterly/Biweekly/Weekly
  (`burndownInterval`), chip "Task: <All tasks|nome> ▾" (`burndownTaskFilter`, opzioni
  `billableTaskNames`), icona Export PNG (`exportChartPng`). Legenda HTML: "Remaining hours (actual)",
  "Remaining hours planned (phasing)" — "(linear)" quando `hasPhasingEur` è falso —, "Today · <data>".
  Due serie: `burnValues` e `idealValues`. Marcatore Today con `todayLabelPlugin` sull'indice di
  `todayIndex(points, today)`. Tooltip invariato. Colori via `chartColor()`.
- *Monthly summary*: Month · Est. hours · Consumed · Variance · Est. budget · Spent · Variance
  (+ PTC se `hasPtc`); mese `current` con pillola e fondo grigio; mesi `future` in grigio con "—" su
  Consumed/Spent/Variance; riga Total in evidenza; varianza negativa in `--color-danger`; icona
  Export XLS nella toolbar.
- *Pass-through*: la tabella PTC di oggi, ristilizzata.

**Card Breakdown.** Testata: "Breakdown" + segmentato By task | By role | By functional area (l'ultimo
disabilitato con tooltip "No functional areas configured" se `cfg.groups` è vuoto) + icona Export XLS +
pulsante Period. Colonne: nome · Sold · Spent (titolo "Spent · <periodo>" con filtro attivo) ·
Remaining (total) · Total consumption. Sold/Spent/Remaining: ore in evidenza, importo sotto più
piccolo. Total consumption: barra 5px + %. Riga `overSold`: pillola "Over sold", fondo
`color-mix(in srgb, var(--color-danger-bg) 40%, var(--surface-white))`, residuo e barra rossi. Riga
Total in fondo.
- *By task*: righe da `breakdownRows(summaryByTask)`, sottotitolo `taskSubtitle`. Chevron: il task si
  espande al suo posto (più task possono restare aperti) e mostra i ruoli rientrati da
  `taskDetailData[].rows` (nome ruolo; sottotitolo "<risorse> · <tariffa>/h"; stesse 4 colonne) e
  sotto "Entries · N" con Export XLS del task, i mesi da `entriesByMonth(periodData)` **tutti chiusi**
  (intestazione: mese, N entries, ore, importo); aprirne uno chiude l'altro aperto nello stesso task.
  Righe entry: Date · Role (resource) · Hours · Amount · Note.
- *By role*: righe da `summaryByRole` (chiave `role|task`), nome = ruolo, sottotitolo `roleSubtitle`.
- *By functional area*: righe da `summaryByGroup`, sottotitolo `groupSubtitle`.
- *Excluded from report* (solo By task, solo se esistono task con `billable === false`): sezione
  attenuata sotto la riga Total, una riga per task con le sue ore consumate, espandibile alle Entries
  come sopra; nessun suo numero entra nei totali.

**Period.** Pulsante "Period: **<Whole project|periodo>** ▾"; bordo e fondo evidenziati con filtro
attivo, più "Reset" (`resetDateFilter`). Menu: "Whole project" con l'intervallo; i mesi di
`filterMonthOptions` dal più recente, ciascuno con le ore di `hoursByMonth`; "Custom range" con From/To
(`filterStart`/`filterEnd`). Filtra solo la colonna Spent (righe, sottorighe, Total) e le Entries;
Sold, Remaining e Total consumption restano sul totale.

**Fondo pagina.** Il "← Portfolio" in fondo sparisce.

## 7. Stati

- Caricamento: comportamento attuale (`dashboardReady`), nessuno skeleton.
- `!dashboardData.length`: KPI a 0h consumate; nella card Progress "No actuals loaded yet." più
  "Load Actuals" (stesso gating); Breakdown con Spent 0.
- Nessun budget: Sold "—", barre vuote, "No budget".
- Periodo senza registrazioni: Spent 0; nelle Entries "No entries in the selected period."
- Progetto non trovato / senza accesso: invariato.

## 8. Export

PNG del grafico (`exportChartPng`). XLS: Monthly summary (dalla tabella), Breakdown nella vista corrente
(costruito dalle righe con `XLSX.utils.aoa_to_sheet`: nome, sottotitolo, ore e importi delle tre
colonne, %), Entries di un task (tutte le righe nel periodo). Il componente `ExportButtons` non è più
usato dalla vista e viene rimosso se non ha altri usi.

## 9. CSS e cache-busting

Classi `.pr-*` in `css/portfolio.css`; riuso di `.pf-spent-bar*`, `.pf-badge-neutral`, `.pf-clear-link`,
`.pg-kpis`, `.pg-legend-*`. Solo `var(--token)`, nessun hex, nessuna emoji. `portfolio.css` `?v=2→3` su
`portfolio.html` e `program.html`; `program-calc.js?v=1` aggiunto a `portfolio.html`;
`project-report-calc.js?v=1` su `portfolio.html`; `chart-today.js?v=1` su entrambe. Moduli caricati come
`type="module"`.

## 10. Responsive

Sotto 1024px: azioni sotto il titolo, colonna Remaining nascosta nel Breakdown. Sotto 768px: KPI su una
colonna. A nessuna larghezza scroll orizzontale della pagina. Menu "⋯", bottom sheet e righe-card su
smartphone: fuori scope (§13).

## 11. Test

- **Characterization prima del template** (`portfolio-calc.test.js`): `buildSummaryCols` +
  `summaryTotals` con e senza filtro — `totResidual` non dipende dal filtro.
- `project-report-calc.test.js`: ogni funzione di §4, inclusi Spent = `inPeriod` con filtro e
  `totalConsumed` senza, `overSold`, soglia ±10, mesi più recenti primi, `todayIndex` fuori asse.
- `chart-today.test.js`: no-op con `index` `null`, disegno con un contesto finto.
- Guard esistenti (`foundations-guard`, `portfolio-guard`, `program-guard`, `nav-shell-guard`,
  `money-guard`) verdi.
- Verifica visiva con `scripts/shoot.mjs` a 1440 e 1024 su BERMITS Maintenance 2026 e su un progetto
  senza actuals, confrontata con le tavole.

## 12. Documentazione

`docs/pages/portfolio.md` (sezione "Project reporting redesign (7.4)": struttura, decisioni, cambio di
Spent sotto filtro, deviazioni dalla tavola), `docs/pages/program.md` (helper Today), `docs/js/lib.md`
(due moduli nuovi), riga Pages di `portfolio.html` in `CLAUDE.md`.

## 13. Fuori scope

Calcoli e fonti dati; Program Dashboard oltre all'helper Today; popover Share; pannello "Budget
Summary" pinnato; endpoint `/api/reporting/*`; layout tablet/smartphone dedicati (menu "⋯", bottom
sheet, righe-card, toggle Hours | Budget), da fare quando esisteranno le tavole.

## Decisioni aperte

1. **Restyling dentro `portfolio.html` più un modulo puro nuovo.** Alternativa scartata: estrazione in `project.html`, o restyling senza modulo. Perché: la prima moltiplica i punti d'ingresso da toccare, la seconda lascia la logica nuova senza test.
2. **PTC come "incl. X PTC" nel KPI Budget, colonna PTC nel Monthly summary solo se `hasPtc`, tabella PTC come voce "Pass-through" del segmentato Progress.** Alternativa scartata: card PTC separata come oggi. Perché: la tavola non ha card separate e i PTC restano tutti raggiungibili.
3. **Entries raggruppate solo per mese, tutti i mesi chiusi a riposo, uno aperto alla volta per task.** Alternativa scartata: Flat / By role / By owner, oppure il mese più recente aperto di default. Perché: il raggruppamento per ruolo c'è già nei ruoli rientrati, e l'utente preferisce non aprire nulla in partenza.
4. **Tutto in `dashCurrency`, via il sottotitolo "fees + PTC" e "hours × hourly rate".** Alternativa scartata: mantenere il sottotitolo del Budget. Perché: lo sostituisce "incl. X PTC".
5. **Burndown a 2 serie (actual, `idealValues`), "(linear)" senza phasing.** Alternativa scartata: le 3 serie di oggi con "Estimated Hours". Perché: stesse serie della Program Dashboard; le stime orarie mensili restano nel Monthly summary.
6. **Export: PNG del grafico, XLS su Monthly summary, Breakdown corrente e Entries per task; componente `ExportButtons` tolto dalla vista.** Alternativa scartata: XLS + PNG su ogni tabella. Perché: segue la tavola senza perdere un export di dati.
7. **Giudizio di ritmo a ±10 punti di `vsTime` da `projectMetrics()`.** Alternativa scartata: ±3 punti del brief. Perché: un progetto non può essere "on track" qui e "behind" nella Program Dashboard.
8. **Nessun task espanso a riposo.** Alternativa scartata: il primo task espanso. Perché: la pagina a riposo resta corta.
9. **Via il "← Portfolio" in fondo pagina.** Alternativa scartata: tenerlo. Perché: restano il link in testata e la breadcrumb.
10. **Task non fatturabili in una sezione "Excluded from report" sotto la riga Total, fuori dai totali.** Alternativa scartata: farli sparire. Perché: perderebbero l'unico accesso alle loro registrazioni.
11. **By role con chiave `role|task`, sottotitolo "risorse · task".** Alternativa scartata: aggregare il ruolo su più task come la tavola. Perché: un ruolo con tariffe diverse su due task darebbe un totale non riconciliabile.
12. **Plugin Today estratto in `js/lib/chart-today.js`, usato anche da `program.html`.** Alternativa scartata: duplicarlo in `portfolio.html`. Perché: una sola copia da mantenere.
13. **Responsive minimo, verifica a 1440 e 1024.** Alternativa scartata: menu "⋯", bottom sheet e righe-card già in questo ciclo. Perché: le tavole tablet e smartphone non esistono.
14. **Nessuno skeleton di caricamento.** Alternativa scartata: gli skeleton del brief §9. Perché: sarebbe un componente nuovo che nessun'altra pagina ha.
15. **Fratelli nello switch ordinati per codice, poi nome.** Alternativa scartata: l'ordine per id di oggi, o l'ordinamento "needs attention" della Program Dashboard. Perché: l'id è un UUID senza ordine leggibile e la tavola li mostra in ordine di codice.
16. **"As of" del tile Time elapsed = data di oggi.** Alternativa scartata: data dell'ultima registrazione (`kpis.maxDate`). Perché: la % di tempo è calcolata su oggi, come il marcatore Today del grafico.
17. **Fondo rosato delle righe Over sold con `color-mix()` su `--color-danger-bg`.** Alternativa scartata: un token nuovo in `tokens.css`. Perché: evita il bump di `tokens.css` su tutte le pagine per un solo uso.
