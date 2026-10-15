# Brief per Claude Code — Project Reporting v2 (tavola 7.4)

Immagini allegate (`docs/superpowers/design/reporting-project/`):

| Tavola | File | Contenuto |
|---|---|---|
| 7.4a | `74a-reporting-project-pm-burndown_breakdown_bytask.jpg` | Default: Burndown + Breakdown By task, Project Management espanso — **riferimento principale** |
| 7.4a | `74a-reporting-project-pm-monthly_breakdown_bytask.jpg` | Progress su "Monthly summary" |
| 7.4c | `74a-reporting-project-pm-breakdown_byrole.jpg` | Breakdown By role |
| 7.4a | `74a-reporting-project-pm-monthly_breakdown_byfunctionalarea.jpg` | Breakdown By functional area |
| 7.4b/d | `74d-reporting-project-switch_progetto_filtro_period.jpg` | Progetto di un programma, switch fratelli aperto, filtro Period attivo |

La Program Dashboard (`program.html`, già rilasciata) è fuori scope: qui interessa solo come destinazione di "Program Dashboard →" e come **riferimento di implementazione** (stessi pattern, stesse classi condivise).

---

## 0. Natura dell'intervento

**Restyling della vista esistente**, non una pagina nuova. È la vista `dashboard` di `portfolio.html` (`showDashboard(pid)`, `?projectId=`), oggi in stile vecchio: 6 KPI con emoji, card Bootstrap `section-card`, 5 tabelle in verticale, Task detail con tutte le registrazioni giornaliere.

Obiettivo: tre blocchi **KPI → Progress → Breakdown**, pagina a riposo in ~1,5 schermate, dettaglio aperto solo su richiesta (un task e un mese alla volta).

Vincoli dal `CLAUDE.md` del repo: niente build step, solo `var(--token)`, `?v=N` aggiornato su **tutti** i riferimenti dei file versionati toccati, shim/override solo `type="module"`, `#app-shell`/`#app-main` senza `overflow`/`position`/`transform`, `v-cloak` invariato, workflow `docs/superpowers/PROCESS.md` con `/finish-cycle`. **Le regole di business del codice hanno la precedenza sui disegni**: dati, tariffe e registrazioni della tavola sono illustrativi; formattazione solo via `formatMoney(…, dashCurrency, currencies)`, `fmtH`, `fmtVar`, `varColor`, `monthLabel`. Nessuna emoji.

**Nessun cambio di calcolo.** `kpis`, `monthlySummary`, `summaryByTask/Role/Group` (`buildSummaryCols`, `summaryTotals`, `normalizeGroupEntries`/`entryMatchesRow`), `taskDetailData`, `findRate()` (tariffa per coppia task/ruolo) e `computeBurndownPoints()` restano la fonte dei numeri. Si cambia la presentazione e il modo in cui il filtro Period si applica (§6). Nessun endpoint, nessun SQL.

## 1. Dove vive

- Resta la vista `dashboard` di `portfolio.html`, stessa URL `?projectId=`. Tutti gli ingressi esistenti (Portfolio Card/List, `pipeline.html`, `costgrid.html`, `planning.html`, redirect di `project-config.html`, "Reporting →" della Program Dashboard) restano invariati.
- Stili in `css/portfolio.css` con prefisso nuovo (proposta `.pr-*`), riusando dove possibile `.pf-spent-bar`, `.pf-spent-{normal,warning,danger}`, `.pf-badge-neutral`, `.pf-clear-link` e i pattern `.pg-*` della Program Dashboard (KPI tile, legenda burndown, pulsante download). Bump di `portfolio.css` su **entrambe** le pagine che lo linkano.
- Alternativa: estrarre in `project.html` come fatto per `program.html` (§10, decisione 1). Sconsigliato in questo ciclo: moltiplica i punti di ingresso da toccare.

## 2. Testata

Da sinistra:
- Link compatto "‹ Project Portfolio" (sostituisce il pulsante "Back"); stessa `showOverview()`.
- **Riga programma** (solo se il progetto ha `programId`, oggi `dashboardProgramRow`): etichetta "PROGRAM" in maiuscoletto, nome programma, "N projects", "Program Dashboard →" (link reale a `/program.html?programId=`, già presente — va solo ristilizzato).
- **Titolo** 26px/700 navy + pillole stage (pipeline) e status (`statusBadgeLarge`). Se il progetto è in un programma, il titolo è un **menu dei fratelli** (§3); altrimenti statico.
- **Riga metadati**: cliente · codice (monospace, `dashboardProject.code`, mai l'UUID) · durata (`monthLabel(start) – monthLabel(end)`) · tag del progetto come pillole (se presenti nel config; altrimenti la riga si ferma alla durata).

A destra, all'altezza del titolo, pulsanti alti 32px con icona SVG `stroke="currentColor"`, stessi gating di oggi:
- **Configure** — `goConfigure`, `v-if my_permission !== 'viewer'`
- **Load Actuals** — `triggerLoadActuals`, stesso gating
- **Planning** — `goPlanningForProject`
- **Share** — `openShareModal('project', …)`, **modale esistente**. In tavola è un popover: non si implementa il popover.

Breadcrumb invariata (`Portfolio / <Programma> / <Progetto>` già in produzione).

## 3. Switch tra progetti del programma (7.4d)

Evoluzione del dropdown `dashboardSiblings` esistente, che diventa il titolo stesso (chevron a destra, fondo grigio al hover/aperto).

- Intestazione "Projects in program <Programma>".
- Una riga per fratello: nome (✓ sul corrente), codice monospace, pillola status, barra 4px + % di consumo ore (soglie §4). Nessun fratello disabilitato (regola già in produzione).
- Piede: "N projects · Xh sold · Y% consumed" e "Program Dashboard →".
- Click su un fratello → `showDashboard(id)`.
- **Coerenza numeri**: % e totali devono coincidere con la List della Program Dashboard. Riusare `projectMetrics()`/`programTotals()` di `js/lib/program-calc.js` (non ricalcolare a mano). Se richiede di caricare `program-calc.js` in `portfolio.html`, aggiungerlo con `?v=` allineato.

## 4. KPI (3 tile)

Sostituiscono le 6 tile attuali (le 6 informazioni stanno in 2 tile).

| Tile | Valore grande | Sotto | Barra | Riga in fondo |
|---|---|---|---|---|
| **Hours** | `consumedHours` | "of `soldHours`" | consumo % | "N% consumed" · "`hoursLeft` left" |
| **Budget** | `consumedEur` | "of `budgetTotal`" | spesa % | "N% spent" · "`budgetLeft` left" |
| **Time elapsed** | % trascorso | durata | grigia | "As of `<data>`" · giudizio ritmo |

- Soglie barra come Portfolio/Program (`spentBarState()`): navy < 85%, ambra 85–100%, rosso > 100%.
- Residuo: verde se positivo, rosso se negativo (`kpiLeftColor()`, già esistente).
- **Giudizio ritmo** (ore % vs tempo %): "Hours on track" entro ±3 punti, altrimenti "Hours ahead of time" / "Hours behind time". Soglia da confermare (§10) — la Program Dashboard usa ±10 punti per "vs time".
- `soldHours`/`budgetTotal` nulli → "—", barra vuota, "No budget".
- Il box "task oltre il venduto" in testata **non c'è**: gli sforamenti si leggono nelle righe del Breakdown.
- PTC: vedi §8.

## 5. Card "Progress"

Una sola card con selettore segmentato **Burndown | Monthly summary** nella testata. Sostituisce la card del burndown e la card Monthly Summary separate.

**Burndown**
- Toolbar su una riga, a destra: granularità come segmentato (Monthly / Quarterly / Biweekly / Weekly, `burndownInterval`), chip "Task: All tasks ▾" (`burndownTaskFilter`, stessa logica della select attuale), icona Export PNG (`exportChartPng`).
- Legenda: "Remaining hours (actual)" linea piena navy con area; "Remaining hours planned (phasing)" tratteggio magenta; "Today · <data>".
- Marcatore Today: punto + pillola navy "Xh left", stesso plugin `afterDraw` della Program Dashboard (estrarlo in un helper condiviso se possibile, non duplicarlo).
- Serie: oggi il grafico ne ha 3 (actual, "Estimated Budget (phasing)" / "Ideal Trend", "Estimated Hours"). Il disegno ne mostra 2 — decisione §10.
- Colori sempre via `chartColor()`.

**Monthly summary**
- Colonne: Month · Est. hours · Consumed · Variance · Est. budget · Spent · Variance.
- Mesi futuri in grigio con "—" su Consumed/Spent/Variance; mese corrente marcato con pillola "current" e fondo grigio; riga **Total** in evidenza.
- Varianza negativa in rosso (`--color-danger`).
- Colonna PTC: vedi §8.
- Export XLS della tabella: icona nella toolbar al posto del gruppo `ExportButtons` (decisione §10).

## 6. Card "Breakdown"

Sostituisce: Period filter (card), Summary by task, Summary by role, Summary by functional area, Task detail.

**Testata**: titolo "Breakdown", segmentato **By task | By role | By functional area**, a destra il pulsante **Period** (§6.3).

**Tabella verticale**, colonne sempre uguali:
`<Task | Role (resource) | Functional area>` · Sold · Spent · Remaining (total) · Total consumption

- Sold / Spent / Remaining: ore in evidenza, importo sotto più piccolo (`.eur-sub` come oggi, ristilizzato).
- Nome riga + sottotitolo leggibile:
  - task: "N roles · <area>";
  - ruolo: "<risorsa> · <task, …>" (chiave composita `role|task` già in produzione: un ruolo su due task con tariffe diverse resta due righe);
  - area: elenco dei task.
- Total consumption: barra 5px + %, soglie §4.
- **Sforamento**: pillola "Over sold", fondo rosato (`--color-danger-bg` o equivalente), residuo rosso, barra rossa. Stesso segnale su righe e sottorighe.
- Riga **Total** in fondo (`summaryTotals`).

### 6.1 Espansione task (solo By task)

- Chevron sulla riga; il task si espande **al suo posto**.
- Dentro: i **ruoli** rientrati (nome, risorsa · €/h dalla tariffa del task, stesse 4 colonne) — dati di `taskDetailData[].rows`.
- Sotto: **Entries · N** con "Export XLS" (per task), raggruppate per **mese** (label, N entries, ore, importo). Si apre **un mese alla volta**, il più recente di default.
- Righe entry: Date · Role (resource) · Hours · Amount · Note.
- Default: nessun task espanso (decisione §10 — la tavola mostra Project Management aperto solo a scopo illustrativo).
- By role / By functional area: righe non espandibili.

### 6.2 Raggruppamento delle entries

Oggi ogni task ha i modi **Flat / By role / By owner** (`taskDetailState[].groupMode`). Il disegno raggruppa solo per mese. Decisione §10.

### 6.3 Filtro Period

- Pulsante "Period: **Whole project** ▾" nella testata del Breakdown. Bordo e fondo evidenziati quando attivo; compare "Reset" (`resetDateFilter`).
- Menu: "Whole project" (con intervallo), elenco mesi con le ore di ciascuno (più recente in alto, da `filterMonthOptions`), sezione "Custom range" con From/To (`filterStart`/`filterEnd`).
- **Cosa filtra (cambio di comportamento)**: solo la colonna **Spent**, che diventa "Spent · <periodo>", e le Entries del task espanso. **Sold, Remaining (total) e Total consumption restano sul totale**, come il Residual di oggi.
- Sparisce la riga "In period" delle vecchie tabelle (il valore è ora la colonna Spent).
- Verificare che `summaryTotals(cols, hasFilter)` produca gli stessi Remaining di oggi con filtro attivo (test).

## 7. Navigazione in fondo pagina

Oggi c'è un "← Portfolio" duplicato in fondo (ciclo "Symmetric back-navigation"). Il disegno non lo mostra: decisione §10.

## 8. Differenze note codice ↔ disegno (da confermare)

1. **Pass Through Costs.** Il codice ha: card "Pass Through Costs" (`ptcReport`), colonna PTC nel Monthly Summary (`hasPtc`), sottotitoli KPI "fees + PTC". Il disegno non ha PTC. Proposta: KPI Budget con sottotitolo "incl. € X PTC" quando > 0; colonna PTC nel Monthly summary solo se `hasPtc`; tabella PTC come terza voce del segmentato Progress ("Pass-through") solo se presenti.
2. **Modi di raggruppamento delle entries** (§6.2). Proposta: mese come raggruppamento primario; Flat/By role/By owner rimossi (il By role c'è già nei ruoli rientrati).
3. **Valuta.** Tutto in `dashCurrency` (valuta del progetto) — il disegno usa € solo come esempio. Il sottotitolo EUR del KPI Budget (`kpiBudgetEurSub`) va mantenuto o tolto? Proposta: rimosso, salvo per i progetti non-EUR dove resta come riga piccola.
4. **Serie del burndown** (§5): 2 come in tavola o 3 come oggi.
5. **Export**: oggi XLS + PNG su ogni tabella; in tavola PNG solo sul grafico e XLS per task. Proposta: Export PNG grafico, XLS su Monthly summary e Breakdown (vista corrente), XLS per task nelle Entries.

## 9. Stati

- **Caricamento**: scheletri di tile, card Progress e Breakdown.
- **Nessuna registrazione** (`!hasActuals`): KPI con 0h consumate; Burndown con sola serie prevista; Breakdown con Spent 0; messaggio nella card Progress "No actuals loaded yet." + "Load Actuals" (se permesso).
- **Nessun budget/cost grid**: Sold "—", barre vuote, "No budget".
- **Nessuna functional area configurata**: voce "By functional area" disabilitata con tooltip "No functional areas configured".
- **Periodo senza registrazioni**: Spent 0 su tutte le righe; nelle Entries "No entries in the selected period."
- **Progetto non trovato / senza accesso**: comportamento attuale invariato.

## 10. Decisioni da confermare

1. Restyling dentro `portfolio.html` (proposta) o estrazione in `project.html`.
2. PTC (§8.1).
3. Raggruppamento entries: solo mese o mantenere Flat/By role/By owner (§8.2).
4. Valuta e sottotitolo EUR del Budget (§8.3).
5. Burndown a 2 o 3 serie (§8.4).
6. Export (§8.5).
7. Soglia del giudizio "Hours on track" (±3 punti) vs ±10 della Program Dashboard.
8. Task espanso di default: nessuno (proposta) o il primo.
9. "← Portfolio" in fondo pagina: tenerlo o toglierlo.

## 11. Mappatura colori → token

| Uso | Token |
|---|---|
| Testo principale, titoli, link, serie actual | `--brand-navy`, `--chart-actual` |
| Hover link, serie prevista | `--brand-magenta`, `--chart-phasing` |
| Bordi, divisori | `--border-light` |
| Etichette maiuscoletto, sottotitoli, mesi futuri | `--text-muted`, `--text-faint` |
| Testata tabella, riga Total, mese corrente | `--surface-light`, `--surface-medium` |
| Barra ≥85% / >100%, residuo negativo, Over sold | `--color-warning`, `--color-danger`, `--color-danger-bg` |
| Residuo positivo nei KPI | `--color-success` |
| Pillole status / stage | `--status-*`, `--pipeline-*` |

Nessun hex nuovo; se manca un token (es. fondo rosato riga), aggiungerlo in `tokens.css` rispettando il test di contrasto (`tokens.test.js`) e bumpare `tokens.css` su tutte le pagine.

## 12. Copy (inglese)

"Project Portfolio", "Program", "N projects", "Program Dashboard →", "Projects in program …", "Configure", "Load Actuals", "Planning", "Share", "Hours", "Budget", "Time elapsed", "of …", "N% consumed", "N% spent", "… left", "As of …", "Hours on track", "Hours ahead of time", "Hours behind time", "No budget", "Progress", "Burndown", "Monthly summary", "Monthly", "Quarterly", "Biweekly", "Weekly", "Task: All tasks", "Export PNG", "Remaining hours (actual)", "Remaining hours planned (phasing)", "Today", "Month", "Est. hours", "Consumed", "Variance", "Est. budget", "Spent", "current", "Total", "Breakdown", "By task", "By role", "By functional area", "Task", "Role (resource)", "Functional area", "Sold", "Spent · …", "Remaining (total)", "Total consumption", "Over sold", "N roles", "Entries · N", "Export XLS", "N entries", "Date", "Hours", "Amount", "Note", "Period:", "Whole project", "Custom range", "Reset", "No actuals loaded yet.", "No entries in the selected period.", "No functional areas configured".

## 13. Responsive

Tablet 1024×768 e smartphone 390×844 **non ancora disegnati** (da produrre in parallelo, come da regola di progetto). Regole provvisorie:
- Testata: azioni sotto il titolo sotto 1024; su smartphone Configure/Load Actuals/Planning/Share in un menu "⋯" (icona SVG) con Share primo.
- KPI: 3 colonne → 1 sotto 768.
- Progress: toolbar a capo; su smartphone granularità come select, Monthly summary con le sole colonne ore (budget dietro un toggle Hours | Budget).
- Breakdown: sotto 1024 nascondere Remaining (resta nella barra); sotto 768 righe come card (nome, Over sold, barra, Spent / Sold); Entries a una colonna (data + ore, ruolo e nota sotto).
- Period: bottom sheet su smartphone.
- Switch fratelli: bottom sheet su smartphone.

## 14. Fuori scope

- Calcoli e fonti dati (§0).
- Program Dashboard oltre ai link.
- Popover Share (resta la modale).
- Pannello "Budget Summary" pinnato (nascosto dal 2026-09: lasciarlo com'è).
- Rimozione degli endpoint `/api/reporting/*` morti.

## 15. Documentazione

- `docs/pages/portfolio.md`: nuova sezione "Project reporting redesign (7.4)" con struttura, decisioni §10, cambio di comportamento del Period, deviazioni accettate dalla tavola.
- `docs/pages/program.md`: se si estraggono helper condivisi (plugin Today, metriche).
- `CLAUDE.md`: riga Pages di `portfolio.html`, versioni `?v=`.

## 16. Checklist

- [ ] Testata: back compatto, riga programma, titolo 26px + pillole, metadati con codice, 4 azioni SVG 32px con gating invariato.
- [ ] Switch fratelli con status + % (numeri = Program Dashboard) e piede programma.
- [ ] 3 KPI con barre, soglie, residui colorati, giudizio ritmo.
- [ ] Card Progress: Burndown (granularità, Task, PNG, Today) / Monthly summary (futuri grigi, current, Total).
- [ ] Card Breakdown: 3 viste, colonne uniche, Over sold, riga Total, nessuno scroll orizzontale.
- [ ] Task espandibile: ruoli + Entries per mese, un mese alla volta, Export XLS.
- [ ] Period: filtra solo Spent ed Entries; Remaining invariato (test).
- [ ] PTC, raggruppamenti, valuta, serie, export secondo §10.
- [ ] Nessuna emoji, nessun hex nuovo, `?v=` allineati (`portfolio.css` su 2 pagine).
- [ ] Verifica a 1440, 1024, 390 con BERMITS Maintenance 2026 (tariffe per task, task oltre il venduto, functional areas) e un progetto senza actuals.
- [ ] Docs aggiornate (§15).
