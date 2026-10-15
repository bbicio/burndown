# Project reporting — correzione dei calcoli (B-071…B-077) — design spec

**Date:** 2026-10-15
**Brief started:** unknown
**Brief:** messaggio in chat del 2026-10-15 (nessun file di Brief); item in `docs/BACKLOG.md` B-071…B-077
**Scenario:** 2 (evoluzione / fix)

Follow-up di Project Reporting v2 (7.4, merge `930881a`, report
`docs/superpowers/reports/2026-10-15-project-reporting-v2-finish-cycle.md`). Il round 3 del Gate 3 di quel
ciclo ha trovato difetti nei calcoli ereditati, che la spec 7.4
(`docs/superpowers/specs/2026-10-15-project-reporting-redesign-design.md`) dichiarava invariati. Questo
ciclo li corregge. Riferimenti di prodotto: `docs/prd/reporting.md` §6.1–§6.3, narrativa
`docs/pages/portfolio.md` ("Project reporting redesign (7.4)").

## 1. Stato attuale (verificato sul codice, 2026-10-15)

- **B-071.** `computeBurndownPoints()` (`js/lib/portfolio-calc.js`) calcola `burnValues[i]` con le
  registrazioni datate `<= points[i]`, cioè all'**inizio** dell'intervallo. La pillola Today di
  `portfolio.html` (`renderBurndownChart`) stampa `burnValues[index]`. Il tile Hours stampa invece
  `soldHours − consumedHours` su tutte le registrazioni. Il difetto c'è anche sulla Program Dashboard:
  `programBurndown()` (`js/lib/program-calc.js`) fa `todayRemaining = actual[todayIndex]` con punti al primo
  del mese. Ogni punto futuro conta tutte le registrazioni, quindi la linea actual prosegue piatta nel futuro.
- **B-072.** `kpiBudgetPct = spentPercent(consumedEur, budgetTotal)`: `consumedEur` comprende le sole fee,
  `budgetTotal` è `feesOnly + totalPtc`. La Program Dashboard (`projectMetrics()`) lavora solo sulle fee,
  con fallback sulla fee del pipeline budget quando nessun task ha fee.
- **B-073.** `summaryByTask` conta tutte le ore dei task fatturabili. `summaryByRole` conta solo le coppie
  (ruolo, task) configurate. `summaryByGroup` conta due volte, su Sold e su Spent, un ruolo presente in più
  gruppi e omette ciò che nessun gruppo reclama. `toRow()` (`js/lib/project-report-calc.js`) con
  `soldHours = 0` e ore consumate restituisce `overSold: true`.
- **B-074.** Il tooltip stampa `Estimated: planningData[i]`, ricavato da `cfg.planning`. È una serie non più
  disegnata. La linea tratteggiata è `idealValues`, da phasing € o lineare.
- **B-075.** `exportTableXls($refs.monthlyTable, …)` usa `XLSX.utils.table_to_book`: il mese esce
  "Oct 2026current" e i mesi futuri escono "—" letterale.
- **B-076.** `var(--weight-normal)` in `css/portfolio.css` (`.pg-tile-of`, `.pr-period-meta`). Il token
  esistente è `--weight-regular`.
- **B-077.** `todayLabelPlugin()` (`js/lib/chart-today.js`) disegna la pillola 12px sopra il punto senza
  controllare i bordi del canvas.

## 2. Comportamento atteso

### 2.1 B-071 — Today su entrambi i burndown

- `computeBurndownPoints(data, cfg, taskFilter, interval, billableData, billableTasks, findRate, today)`:
  il nuovo ottavo parametro è opzionale. **Senza `today` l'output è identico a oggi**, pinnato da
  characterization test. Con `today`, e solo per un progetto con `startDate` ed `endDate`:
  - `todayIndex` = indice del punto il cui intervallo contiene oggi, con la stessa regola di
    `todayIndex(points, today, { start: axisStart, end: axisEnd })`;
  - `todayValue` = residuo a oggi, cioè `budget − ore delle righe filtrate datate ≤ oggi`, con clamp a 0
    (senza budget: le ore cumulate a oggi);
  - `burnValues[todayIndex] = todayValue`, e `burnValues[j] = null` per ogni `j > todayIndex`. Stesso
    taglio su `tooltipBudgetConsumed`, dove il valore all'indice di oggi è il consumato € a oggi;
  - con oggi prima dell'asse, tutti i punti sono `null` e `todayIndex` è `null`. Con oggi dopo l'asse,
    `burnValues` resta invariato, `todayIndex` è `null` e `todayValue` è comunque calcolato;
  - i campi `todayIndex`/`todayValue` sono presenti nell'output anche quando `today` manca (valgono `null`).
- `todayIndex()` si sposta in `js/lib/portfolio-calc.js`. `js/lib/project-report-calc.js` lo re-esporta
  (`export { todayIndex } from …`), quindi il bridge `window.todayIndex` e i chiamanti restano invariati.
- **`portfolio.html`:** la pillola, il punto e il marcatore usano `series.todayIndex`/`series.todayValue`.
  Il testo resta `<N>h left` (`consumed` senza budget). Senza filtro task e senza sforamento coincide con
  il "left" del tile Hours.
- **`program.html`:** sull'asse del programma, il mese di oggi vale la somma dei `todayValue` dei progetti
  aggregati: un progetto non ancora iniziato contribuisce l'intero residuo, uno finito il residuo finale.
  I mesi precedenti seguono la regola di oggi (valori per mese, hold primo/ultimo valore). I mesi successivi
  valgono `null`. `todayRemaining` è quel valore, e lo leggono pillola e `afterLabel`.
- **Tooltip su un punto futuro** (entrambe le pagine): mostra solo le righe del Planned. Nessuna riga
  actual e nessun tooltip vuoto quando la serie planned c'è.

### 2.2 B-072 — Tile Budget sulle sole fee

- Valore: `consumedEur` "of `feesOnly`". Percentuale e barra: `spentPercent(consumedEur, feesOnly)`.
  "Left": `feesLeft = feesOnly − consumedEur`, campo nuovo di `computeKpis()`.
- Nota sotto il tile: `+ <totalPtc> PTC` quando `totalPtc > 0`, al posto di "incl. X PTC".
- "No budget"/"—" quando `feesOnly` è 0, anche se ci sono PTC (la nota PTC resta visibile).
- `budgetTotal` e `budgetLeft` restano in `computeKpis()` invariati, insieme ai loro test.
- Divergenza nota, **non** corretta: con zero fee sui task, la Program Dashboard ricade sulla fee del
  pipeline budget, il tile di progetto no.

### 2.3 B-073 — I tre Total della Breakdown coincidono

- La logica di `summaryByRole` e `summaryByGroup` si sposta, **prima** invariata e pinnata da test, in
  funzioni pure di `js/lib/project-report-calc.js` (`roleColumns(...)`, `areaColumns(...)`). Solo dopo
  cambia.
- **By role:** ogni coppia (ruolo, task) fatturabile con ore registrate ma non configurata ottiene la
  propria colonna con `soldHours: null`, `soldEur: null`, prezzata con `findRate` come By task. Le colonne
  non configurate seguono quelle configurate, in ordine di task (ordine di `billableTasks`) e poi di ruolo
  (alfabetico, case-insensitive).
- `toRow()`/`breakdownRows()`: con `soldHours === null` la riga ha `soldKnown: false`, `overSold: false`,
  `pct: null`, `barState: 'none'`, `remainingHours`/`remainingAmount` `null`. Nel Total i `null` contano 0
  per Sold e Remaining. A schermo la riga mostra "—" su Sold, Remaining e % e la barra è vuota.
- **By functional area:**
  - una riga per gruppo, che conta tutto ciò che la sua definizione reclama, sovrapposizioni comprese;
  - una riga "Ungrouped", solo se non vuota: Sold dalle risorse e Spent dalle righe che nessun gruppo
    reclama;
  - una riga Total calcolata **una volta** su tutti i dati fatturabili, non come somma delle righe;
  - quando almeno una risorsa o una registrazione è reclamata da più gruppi, una nota sotto la tabella:
    "Some roles belong to more than one area: their hours count in each area and once in the Total."
- **Criterio di accettazione:** senza filtro di periodo, Sold, Spent e Remaining (ore e importi) del Total
  coincidono in By task, By role e By functional area, e le ore coincidono con il tile Hours. Con un filtro
  di periodo coincide la colonna Spent. Fixture di test: un ruolo registrato su un task dove non è
  configurato, un ruolo in due gruppi, un ruolo in nessun gruppo.

### 2.4 B-074 — Tooltip allineato alla linea disegnata

- Sezione Hours: `Consumed`, `Remaining`, e `Planned: idealValues[i]` quando `idealValues` esiste.
- Sezione Budget: `Consumed`, `Remaining`, e `Planned: tooltipPhasingEur[i]` solo quando la linea viene dal
  phasing (`hasPhasingEur`).
- `planningData` esce da `computeBurndownPoints()`: non ha altri consumatori, da verificare con grep nel
  Piano.

### 2.5 Monthly summary — intestazione della colonna ore

- "Est. hours" diventa "Planned hours (resource plan)", con `title` che indica la fonte (il piano risorse
  del progetto). Nessun cambio di calcolo: resta `cfg.planning[YYYYMM]`.

### 2.6 B-075 — Export XLS del Monthly summary

- Il foglio si costruisce dai dati di `monthlySummary` con `XLSX.utils.aoa_to_sheet`, non dal DOM:
  - stesse colonne della tabella, con il codice valuta nelle intestazioni monetarie (es. `Spent (EUR)`);
  - mese come testo ("Oct 2026"), senza pillola;
  - valori numerici: ore a 2 decimali, importi ai decimali della valuta;
  - celle vuote nelle colonne actual dei mesi futuri;
  - riga Total in fondo.

### 2.7 B-076 — Token del peso

- `var(--weight-normal)` → `var(--weight-regular)` in `.pg-tile-of` e `.pr-period-meta`.

### 2.8 B-077 — Pillola Today nei bordi

- `todayLabelPlugin()`: se il riquadro sopra il punto uscirebbe dal canvas in alto, lo disegna sotto il
  punto (12px). Clampa la x del riquadro dentro `[0, chart.width]`.

## 3. File toccati

| File | Cambio |
|---|---|
| `js/lib/portfolio-calc.js` | `computeBurndownPoints` (`today`, `todayIndex`, `todayValue`, niente `planningData`), `computeKpis` (`feesLeft`), `todayIndex` spostato qui |
| `js/lib/project-report-calc.js` | re-export di `todayIndex`, `toRow` con `soldHours: null`, `roleColumns`/`areaColumns` nuove |
| `js/lib/program-calc.js` | `programBurndown` taglia a oggi e somma i `todayValue` |
| `js/lib/chart-today.js` | flip e clamp della pillola |
| `portfolio.html` | KPI Budget, Breakdown By role/By area, pillola e tooltip, intestazione e export del Monthly summary |
| `program.html` | pillola e tooltip, nessun cambio di layout |
| `css/portfolio.css` | token del peso, stile della nota di sovrapposizione |
| test `*.test.js` accanto a ciascun modulo | characterization prima, poi i casi nuovi |

**Cache-busting:**

| File | Bump | Dove |
|---|---|---|
| `portfolio-calc.js` | `?v=6` → `?v=7` | entrambe le pagine e i due import ES |
| `program-calc.js` | `?v=2` → `?v=3` | entrambe le pagine |
| `project-report-calc.js` | `?v=1` → `?v=2` | `portfolio.html` |
| `chart-today.js` | `?v=1` → `?v=2` | entrambe le pagine |
| `portfolio.css` | `?v=3` → `?v=4` | entrambe le pagine |

## 4. Verifica

- Characterization test su `computeBurndownPoints` (senza `today`), `summaryByRole`/`summaryByGroup`
  estratti e `programBurndown`, scritti e verdi **prima** di ogni modifica di calcolo.
- Unit test per ogni punto del §2, compresa l'uguaglianza dei tre Total sulla fixture del §2.3 (è la
  riproduzione di B-073 che mancava) e il flip/clamp di `todayLabelPlugin` con un contesto finto.
- Una verifica visiva (`scripts/shoot.mjs`) sullo stack isolato, prima controllando se è già attivo con
  `scripts/test-branch.sh status`: un progetto con il punto Today al massimo dell'asse y (B-077), la Program
  Dashboard, la Breakdown By role e By area, il tile Budget di un progetto con PTC.
- Classe di rischio attesa: high-risk (moduli condivisi fra due pagine, numeri visibili all'utente).
- Documentazione: `docs/prd/reporting.md` §6.1–§6.3, `docs/pages/portfolio.md`, `docs/pages/program.md`,
  `docs/js/lib.md`.

## 5. Scope escluso

- B-068, B-069, B-070, B-079.
- B-078: i tre punti della regola `findRate` sono in `taskDetailData`, che questo ciclo non tocca.
- Il fallback della Program Dashboard sulla fee del pipeline budget (§2.2).
- **Finding nuovo, isolato:** `summaryByTask` e `findRate` confrontano il nome del task con il solo
  `toLowerCase()`, mentre `billableData` collassa anche gli spazi. Una registrazione con spazi in più nel
  nome del task entrerebbe nel tile Hours ma non in By task. Va registrato come riga di `docs/BACKLOG.md`,
  non corretto qui.

## Decisioni aperte

1. **Pillola Today = valore disegnato, con clamp a 0.** Alternativa scartata: il valore senza clamp. Perché: non coinciderebbe con l'altezza del punto; con sforamento la pillola dice 0h e il tile un valore negativo.
2. **Il taglio della linea si applica solo ai progetti con date.** Alternativa scartata: tagliare anche quelli senza date. Perché: il loro asse è sintetico e oggi non hanno marcatore Today.
3. **Programma: un progetto non ancora iniziato conta l'intero residuo nel mese di oggi.** Alternativa scartata: escluderlo finché non inizia. Perché: il tile Hours del programma lo conta già.
4. **`todayIndex` si sposta in `portfolio-calc.js` e viene re-esportato.** Alternativa scartata: farlo importare a `portfolio-calc.js` da `project-report-calc.js`. Perché: sarebbe un import circolare.
5. **Le righe By role non configurate vanno dopo quelle configurate, per task e poi per ruolo.** Alternativa scartata: mescolarle in ordine alfabetico. Perché: le righe che hanno un Sold restano raggruppate in testa.
6. **La riga "Ungrouped" e la nota di sovrapposizione compaiono solo quando servono.** Alternativa scartata: mostrarle sempre. Perché: su un progetto senza sovrapposizioni sarebbero rumore.
7. **`planningData` esce da `computeBurndownPoints()`.** Alternativa scartata: lasciarlo come output morto. Perché: non ha consumatori e inviterebbe a riusare la serie sbagliata.
8. **Export XLS con valori numerici e valuta nell'intestazione.** Alternativa scartata: il testo formattato della tabella. Perché: un foglio di calcolo deve poter sommare.
9. **Flip e clamp della pillola dentro il plugin.** Alternativa scartata: `layout.padding` sui due grafici. Perché: restringerebbe il grafico per un caso raro.
10. **Il finding sugli spazi nel nome del task è registrato, non corretto.** Alternativa scartata: correggerlo in questo ciclo. Perché: è un finding nuovo fuori dalle righe di backlog e il processo lo isola.
