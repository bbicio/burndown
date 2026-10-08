# Program Dashboard — design spec (2026-10-08)

Ciclo di reporting di programma. Input: brief dell'utente
`docs/superpowers/design/reporting-dashboard/2026-10-08-program-dashboard-brief.md`
e tavole `docs/superpowers/design/reporting-dashboard/`:

| Tavola | File | Ruolo |
|---|---|---|
| 7.5a | `7.5a-dashboard-reporting-list.jpg` | **Riferimento principale** — pagina intera, vista List |
| 7.5b | `7.5b-dashboard-reporting-timeline.jpg` | Stessa pagina, vista Timeline |
| 7.4d | `7.4d-dashboard-reporting-dentro-un-programma.jpg` | Solo i punti di ingresso dal reporting di progetto |

Le tavole prevalgono sul testo del brief per l'aspetto; **il codice prevale su entrambi per le
regole di business** (CLAUDE.md). Dati e importi nelle tavole sono illustrativi.

---

## 1. Obiettivo

Una **panoramica di programma**: i progetti sono le righe, senza task né registrazioni. Serve a
capire *quale* progetto guardare; l'analisi resta nel reporting del singolo progetto. Oggi non
esiste: nel Portfolio i pulsanti `Dashboard`/`Program Dashboard →` del programma sono `disabled`
con tooltip "Program Dashboard — coming soon" (`portfolio.html:156`, `:202`, `:263`).

Successo = da `portfolio.html` si apre la dashboard di un programma, i suoi KPI e la sua lista
coincidono con quanto il reporting del singolo progetto mostra per ciascun progetto, e da ogni
riga si torna a quel reporting.

## 2. Fatti verificati nel codice (contraddicono il brief)

Verificati il 2026-10-08 prima di scrivere questa spec. Guidano le decisioni §3.

1. **`GET /api/reporting/projects/:id` e `/reporting/portfolio` sono codice morto lato frontend.**
   Sono definiti in `js/api.js:202-203` ma nessuna pagina li chiama (le uniche chiamate a
   `Api.reporting.*` sono `phasing`/`projectPhasing` da `master-pipelines.html`). Tutto il
   reporting di `portfolio.html` è calcolato **nel browser** da `timesheetData` e
   `config.projects`, caricati a `portfolio.html:1119-1121`, tramite `js/lib/portfolio-calc.js`
   (`computeKpis`, `computeBurndownPoints`). → Il nuovo endpoint del brief §7.1 creerebbe una
   seconda implementazione delle stesse regole: **non si fa**.
2. **La visibilità è per progetto, non per programma.** `POST /programs/:id/share`
   (`api/src/routes/config.js:124`) fa fan-out creando una `resource_shares` per ogni progetto
   *esistente in quel momento*; un progetto aggiunto dopo non eredita nulla, e un progetto può
   essere condiviso singolarmente. Non è una contraddizione del brief ma **terreno nuovo**: una
   vista di programma non è mai esistita, quindi la semantica di visibilità di programma si
   decide qui (D5).
3. **`Sold` del Portfolio e `Sold` del reporting di progetto hanno fonti diverse, che in pratica
   coincidono.** Nella List del Portfolio `Sold` è il **totale phasing**
   (`cardData().totalPhasing`, `portfolio.html:278`), nel reporting di progetto è il **budget
   venduto** (Σ `soldHours × hourlyRate`, `computeKpis`). Misurato sui dati reali il 2026-10-08:
   dei 15 progetti, i 10 che hanno un phasing lo hanno **esattamente uguale** al budget dei task
   (179.340 = 179.340, 60.020 = 60.020, …); i 5 senza phasing hanno phasing 0 e budget non nullo
   (21.555, 14.625, …). `project-config.html:220` mostra infatti `phasingSum / grandTotalBudget`
   affiancati, ma nulla impedisce di salvare con phasing vuoto (`:858`, solo un confirm).
   Controllato se il phasing mancante dipendesse dalle date (ipotesi dell'utente, 2026-10-08):
   **no** — quei 5 progetti hanno date di progetto (`202609–202612`) e zero task senza date; il
   phasing semplicemente non è stato compilato, caso riproducibile da un utente reale.
   → La fonte robusta è il **budget dei task**: esiste sempre, coincide col phasing quando il
   phasing c'è.
4. **`phasing` è denaro al mese, non ore — ed è esattamente ore × tariffa.** Le "ore residue
   previste" del burndown si ricavano da `budget × (1 − cumPhasing / totalBudgetEur)`
   (`computeBurndownPoints`): poiché Σphasing = Σ(ore × tariffa) (fatto 3), quella formula è
   già la conversione in ore della distribuzione temporale del denaro, cioè ciò che serve.
   L'alternativa "distribuire le ore dalle date dei task" **non è percorribile**:
   `project_tasks.monthly_distribution` esiste ma nei dati reali contiene stringhe vuote
   (`{"202607": ""}`), non è una distribuzione utilizzabile.
5. **Nessun vincolo di valuta unica per programma.** `projects.currency` è per progetto, il
   programma non ha valuta. Nei dati reali al 2026-10-08 tutti e 5 i programmi sono a valuta
   singola (EUR).
6. **Vincoli di test esistenti da aggiornare:** `js/lib/portfolio-guard.test.js:25` impone che
   `css/portfolio.css` sia linkato **solo** da `portfolio.html`; `js/lib/nav-shell-guard.test.js:41`
   elenca le 18 pagine con lo shell. Entrambi vanno estesi alla pagina nuova.
7. Le pagine senza voce di menu usano `initNav('<id esistente>', { breadcrumbs: [...] })` — schema
   di `profile-jobs.html:286`. `js/lib/page-names.test.js` vincola solo le pagine di menu.

## 3. Decisioni prese in brainstorming (prevalgono sul brief)

| # | Tema | Decisione |
|---|---|---|
| D1 | Dove vive | **Pagina nuova `program.html`**, non una terza vista di `portfolio.html` (richiesta esplicita dell'utente). Il brief §1/§9.1 proponeva la vista interna. |
| D2 | Backend | **Nessun endpoint nuovo, nessun SQL nuovo.** Calcolo client-side come il Portfolio (fatto §2.1). Il brief §7.1 è annullato. |
| D3 | Fonte di `Sold` | **Budget dei task** (Σ `soldHours × hourlyRate`), come il reporting di progetto, con fallback `getPipelineBudget(versionId).fee`. Scelta delegata dall'utente e decisa sui dati (fatto §2.3): il phasing coincide col budget quando c'è, ma manca su 5 progetti su 15, dove darebbe 0. La colonna `Sold` del Portfolio **non** viene cambiata in questo ciclo: lì `Sold` è il termine di confronto della colonna `Variance` (= phasing − spent), cambiarne la fonte romperebbe quella relazione in una pagina mergiata il giorno prima. Resta item aperto per la review finale del Portfolio (§16). |
| D4 | Valute miste | Valuta del programma = nuova `programCurrency(cfgs)` in `program-calc.js`, che torna il codice solo se unico e **`null`** se le valute divergono. Non si riusa `commonCurrency` di `portfolio-calc.js`: quella torna `'EUR'` sulle valute miste (`:205-208`), cioè maschera il caso invece di segnalarlo. Se `null`, le cifre in denaro mostrano `"Mixed currencies"` e le ore restano. Nessun enforcement nuovo lato DB/API. L'utente afferma che il caso non si verifica. |
| D5 | Visibilità | La dashboard aggrega i **progetti visibili all'utente** (`config.projects` è già filtrato lato API); `"Showing N of M projects"` nella testata **solo se N < M**, quindi nel caso normale non appare mai. Nessun accesso negato. Vincolo che lega questa scelta a D2: includere progetti **non** visibili richiederebbe per forza un endpoint server (il browser non li riceve), cioè rinunciare a D2. La regola alternativa "chi vede il programma vede tutti i suoi progetti" resta possibile in futuro, ma è una modifica del modello di permessi, non di questa pagina. |
| D6 | Share | **Riuso della modale attuale** (`openShareModal('program', id, name)`), con i suoi limiti noti (per i programmi mostra solo testo, il remove è un no-op). Lo Share vero è il Ciclo 2 del Portfolio e sistemerà entrambe le pagine insieme. |
| D7 | Export | **Solo PNG del burndown** (icona di download sul grafico, come nel reporting di progetto). Nessun Export PDF di pagina: il brief §3/§9.6 è annullato. |
| D8 | Needs attention | Il click sulla tile **filtra** la card Projects (List e Timeline) sui progetti critici, con modo di togliere il filtro. |
| D9 | Burndown | **Solo Monthly, nessun selettore**, come la tavola. |
| D10 | Soglie | `vs time`: rosso oltre **+10 pt**, verde sotto **−10 pt**, neutro in mezzo. `Needs attention`: status `Started At Risk` **oppure** consumo ≥ **85%** **oppure** (consumo% − tempo%) > **10**. Barra: navy < 85%, ambra ≥ 85%, rosso > 100%. |
| D11 | CSS | **`css/portfolio.css` condiviso** fra le due pagine (classi nuove `.pg-*` nello stesso foglio), guard aggiornato a "portfolio.html + program.html", `?v=` allineato su entrambe. |
| D12 | Controlli | Stile dei controlli = quello del Portfolio (`.pf-*`). L'uniformazione ai controlli costgrid (`<cg-select>` ecc.) resta il **ciclo dedicato** che tratterà entrambe le pagine. |
| D13 | Codice morto | `GET /api/reporting/portfolio` e `/reporting/projects/:id` **restano**, ma smettono di ingannare: un commento in testa a ciascuna rotta (`api/src/routes/reporting.js:74`, `:122`) e una nota nella tabella di `ARCHITECTURE.md:754-755` dicono che nessuna pagina li chiama e che il reporting è client-side. Cancellarli è una modifica backend (restart di `pdash-api`) estranea al rischio di questa pagina: va nella review finale §16. Il costo di lasciarli senza nota è dimostrato — hanno indotto in errore il brief stesso (§7.1). |
| D14 | Perimetro di review e test | **Code review e test limitati ai file toccati da questo ciclo** (richiesta esplicita dell'utente). Niente review allargata alla codebase: una review completa del portale si farà in un ciclo a sé **al termine del restyling della sezione Portfolio**. Vale anche per i reviewer dispatchati: il loro perimetro è il diff del branch, non il resto del repo. |

## 4. Pagina, shell, routing

- Nuovo file `program.html`, URL `/program.html?programId=<uuid>`.
- `<title>PDash — Portfolio</title>`; `initNav('portfolio', { breadcrumbs: [ { label: 'Home',
  href: '/pipeline.html' }, { label: 'Portfolio', href: '/portfolio.html' }, { label: <nome
  programma> } ] })`. La voce di menu attiva resta Portfolio.
- Page shell obbligatorio: head snippet `PDash_sidebarCollapsed`, `#app-shell` > `#nav-container`
  + `#app-main`, `v-cloak` sul root Vue, script tutti dopo lo shell, `defer`/`type="module"`.
- `programId` mancante, non UUID, programma inesistente o senza progetti visibili per l'utente →
  redirect a `/portfolio.html?notice=<messaggio>` (meccanismo `?notice=` già esistente), **tranne**
  il caso "programma esistente ma zero progetti visibili", che resta sulla pagina con lo stato
  vuoto §9.2 (l'utente deve capire che il programma c'è ma non vede nulla).
- Niente `history.replaceState` di manutenzione: l'URL è già quello giusto all'ingresso.

## 5. Caricamento dati

Stessa sequenza di `portfolio.html:1119-1121`, nello stesso ordine:

```js
await Promise.all([loadClientsFromApi(), loadProgramsFromApi(), loadCurrenciesFromApi()]);
await Promise.all([loadConfigFromApi(), refreshTimesheetDataFromApi(), loadPipelineBudgetsFromApi()]);
```

Script da caricare (ordine di documento = ordine di esecuzione): Chart.js, Bootstrap, Vue,
`js/api.js`, `js/core.js`, `js/lib/money.js`, `js/notifications.js`, `js/clients.js`,
`js/programs.js`, `js/shares.js`, `js/lib/portfolio-calc.js`, `js/lib/program-calc.js` (nuovo),
`js/api-sync.js`, `js/nav.js`. `js/upload.js` e `xlsx` **non** servono (nessun Load Actuals qui).

Dati in memoria usati: `getPrograms()` per la testata, `config.projects.filter(p => p.programId
=== programId)` per i progetti (già filtrati dalla visibilità lato API), `timesheetData` per gli
actuals, `getPipelineBudget(versionId)` come fallback di budget.

## 6. Modulo di calcolo `js/lib/program-calc.js` (nuovo)

ES module con bridge `window.<name> = <name>` per ogni export, come gli altri `js/lib/`. Funzioni
pure, nessun accesso a `config`/`timesheetData` globali: tutto per parametro, così sono testabili.

| Funzione | Firma | Cosa fa |
|---|---|---|
| `programCurrency` | `(cfgs) → code \| null` | Codice valuta se unico fra i progetti, `null` se divergono (D4). |
| `programRange` | `(cfgs) → { startYm, endYm, startDate, endDate, months[] }` | Primo `startDate` e ultima `endDate` fra i progetti (formato `YYYYMM`); `months` = elenco dei mesi inclusi. `null` se nessun progetto ha date. |
| `projectMetrics` | `(cfg, rows, deps) → { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct, timePct, vsTime, hasBudget, hasActuals, started }` | Metriche di una riga. `deps` = `{ findRate, billableTasks, billableData, getPipelineBudget, today }`. |
| `programTotals` | `(metrics[]) → { soldHours, soldMoney, spentHours, spentMoney, remainingHours, remainingMoney, consumptionPct }` | Somme; `consumptionPct` = Σspent / Σsold (**non** media delle percentuali). I progetti senza budget sono esclusi dal denominatore ma contati nel numero progetti. |
| `timeElapsed` | `(range, cfgs, today) → { pct, startedCount, totalCount }` | % trascorsa sul range di programma e "N of M projects started". |
| `needsAttention` | `(metrics[], thresholds) → { ids[], reasons: { [id]: string } }` | Regola D10. `reasons` è la frase sintetica della tile (es. `At risk · 95% spent, ends Sep 2026`). |
| `programBurndown` | `(points, perProjectSeries[]) → { labels, actual[], planned[] }` | Allineamento e somma delle serie per progetto sull'asse di programma (§7). |
| `timelineBars` | `(cfgs, metrics[], range) → bars[]` | Per ogni progetto: offset e larghezza in % sull'asse mesi, % di riempimento, stato colore, `started`. |
| `sortProjectRows` | `(rows, needsAttentionIds, sortMode) → rows[]` | Default: critici in cima, poi per data di inizio. |

Riuso senza duplicare: `spentPercent`, `spentBarState` da `portfolio-calc.js`;
`findRate`, `billableTasks`, `billableData`, `fmtH`, `statusBadge` da `core.js`; `formatMoney` da
`money.js`. **Nessun `Intl.NumberFormat`** fuori da `money.js` (guard esistente).

Definizioni (identiche a `computeKpis`, D3):
- `soldHours` = Σ `billableTasks(cfg)[].resources[].soldHours`.
- `soldMoney` = Σ `soldHours × hourlyRate`; se 0, fallback `getPipelineBudget(versionId).fee`.
- `spentHours` = Σ `hours` delle righe timesheet del progetto; `spentMoney` = Σ `hours × findRate(row, cfg)`.
- `remaining*` = `sold* − spent*` (può andare negativo: si mostra com'è).
- `consumptionPct` = `spentHours / soldHours × 100`, `null` se `soldHours === 0`.
- `timePct` = `(today − start) / (end − start) × 100`, limitata a [0, 100]; `null` senza date.
- `vsTime` = `consumptionPct − timePct` in punti, `null` se manca uno dei due.

## 7. Program burndown

Asse = mesi di `programRange` (D9: solo Monthly). Per **non** riscrivere le formule, per ogni
progetto si chiama `computeBurndownPoints(rows, cfg, '', 'monthly', billableData, billableTasks,
findRate)` e se ne proietta il risultato sull'asse di programma:

- mese presente nella serie del progetto → il suo valore;
- mese **prima** dell'inizio del progetto → il primo valore della sua serie (budget intero, nulla
  consumato);
- mese **dopo** la fine → l'ultimo valore (il residuo resta quello).

`actual[m]` = Σ `burnValues`, `planned[m]` = Σ `idealValues` (le ore residue previste derivate dal
phasing, fatto §2.4); un progetto senza phasing contribuisce con la sua rampa lineare, che è ciò
che `computeBurndownPoints` già produce. Marcatore "Today": punto sull'asse al mese corrente con
etichetta `{ore residue totali}h left · {data}`, come in tavola (`2457h left · Sep 22`).

Chart.js con `chartColor('--chart-actual')` / `chartColor('--chart-phasing')` (Chart.js non
risolve `var()`), linea piena con area per l'effettivo, tratteggio magenta per il previsto,
legenda in alto a destra come in tavola, icona di download PNG (D7).

## 8. Layout — mappa tavola → sezione

Tutte le misure sono prese dalla 7.5a salvo diversa indicazione.

| # | Tavola | Sezione | Note di implementazione |
|---|---|---|---|
| L1 | 7.5a riga 86 | `‹ Project Portfolio` | Link compatto, `--text-muted`, torna a `/portfolio.html` |
| L2 | 7.5a riga 104 | Etichetta `PROGRAM DASHBOARD` | maiuscoletto, `--text-2xs`, `--text-muted`, letter-spacing |
| L3 | 7.5a riga 128 | Titolo + pillola stadio | 26px/700 `--brand-navy`; pillola = stadio pipeline del programma (`domPipeline`, primo figlio per id — stessa regola del Portfolio, D7 del ciclo Portfolio) |
| L4 | 7.5a riga 156 | Meta `Novartis Farma · 9 projects · Jan 2026 – Mar 2027 · EUR` | cliente dal primo progetto con cliente; range da `programRange`; valuta da `programCurrency`; `Showing N of M projects` appeso solo se N < M (D5) |
| L5 | 7.5a destra | Azioni `Export`, `Share` | 32px, icona SVG inline, nessuna emoji. Export = PNG del burndown (D7); Share = `openShareModal('program', …)` (D6) |
| L6 | 7.5a tile 1 | **BUDGET** | `€ 295.350` grande + `of € 577.850`, barra, `51% spent` a sinistra, `€ 282.500 left` a destra in `--color-success-text` |
| L7 | 7.5a tile 2 | **HOURS** | `2569h` + `of 5025h`, barra, `51% consumed`, `2457h left` |
| L8 | 7.5a tile 3 | **TIME ELAPSED** | `58%` + range, barra, `7 of 9 projects started`, `Consumption below time` (o `above time` se vsTime programma > 0) |
| L9 | 7.5a tile 4 | **NEEDS ATTENTION · N** | etichetta in `--color-danger-text`, nome del progetto peggiore + motivo, chevron a destra; l'intera tile è un bottone che filtra (D8). Con N = 0: tile neutra `No projects need attention`, non cliccabile |
| L10 | 7.5a card | **Program burndown** | titolo + sottotitolo `Sum of remaining hours across N projects`, legenda `Remaining hours (actual)` / `Remaining hours planned (phasing)` |
| L11 | 7.5a card | **Projects** + segmentato `List` \| `Timeline` | segmentato stile `.pf-seg` del Portfolio; a destra la nota `Task, role and entry analysis is in each project's reporting` in `--text-muted` |
| L12 | 7.5a tabella | Colonne `PROJECT · STATUS · SOLD · SPENT · REMAINING · CONSUMPTION · VS TIME · azione` | PROJECT = nome 600 + riga `codice monospace · Jan 26 – Mar 27` in `--text-muted`; SOLD/SPENT/REMAINING = ore in evidenza con € sotto più piccolo, allineati a destra; CONSUMPTION = barra 5px + % + **tacca grigia** a `timePct`; VS TIME = `+6 pt` / `−10 pt` con colori D10; azione `Reporting →` |
| L13 | 7.5a riga Congress Hub | Riga critica | sfondo tenue di evidenza, barra ambra, status `Started at risk` |
| L14 | 7.5a ultima riga | `PROGRAM TOTAL` | sfondo `--surface-medium`, stesse colonne, `consumptionPct` di programma, nessuna azione |
| L15 | 7.5b | **Timeline** | asse mesi in testa; per riga: nome + sottotitolo `Started · 64% consumed`; barra durata `--surface-medium` dal mese di start al mese di end, riempita per `consumptionPct` (navy / ambra ≥85% / rosso >100%); progetti non iniziati = contorno tratteggiato vuoto; linea verticale `Today` rossa con etichetta in basso; click sulla riga = `Reporting →` |
| L16 | 7.5b legenda | Legenda in fondo | `Project duration`, `Budget consumed (amber ≥85%, red over sold)`, `Not started` |

Ordinamento righe: `sortProjectRows` (critici in cima, poi per data di inizio). L'ordinamento per
colonna è **fuori scope** (il brief lo dà facoltativo).

## 9. Stati

1. **Caricamento** — scheletri: 4 tile grigie, card burndown grigia, 5 righe skeleton.
2. **Programma senza progetti visibili** — testata con il solo nome, messaggio
   `No projects in this program are visible to you.` e `← Portfolio`.
3. **Progetto senza budget** — riga presente, SOLD `—`, barra vuota, pillola `No budget`,
   `consumptionPct` e `vsTime` `—`; escluso dal denominatore dei totali, contato nei progetti.
4. **Progetto senza registrazioni** — SPENT `0.00h` / `€ 0,00`, pillola neutra `No actuals`.
5. **Progetto non ancora iniziato** — tacca a 0, `vs time` `—`, barra tratteggiata in Timeline.
6. **Valuta mista** (`programCurrency === null`) — ogni cifra in denaro, tile comprese, mostra
   `Mixed currencies`; ore, consumo e vs time restano pieni.
7. **Programma inesistente / id non valido** — redirect `/portfolio.html?notice=…`.
8. **Nessun progetto con date** (`programRange === null`) — tile Time elapsed `—`, burndown
   sostituito da `No dated projects in this program`, Timeline non selezionabile.

## 10. Ingressi e uscite

| Dove | Oggi | Dopo |
|---|---|---|
| `portfolio.html:156` (Card, riga programma) | `<button disabled title="Program Dashboard — coming soon">Dashboard</button>` | attivo → `/program.html?programId=…` |
| `portfolio.html:202` | stesso, `Program Dashboard →` | attivo |
| `portfolio.html:263` (List) | stesso, `Dashboard →` | attivo |
| `portfolio.html:155` | `<span class="pf-shown-filtered" title="Program Dashboard — coming soon">` | il `title` "coming soon" va tolto (resta il testo `Shown (filtered)`) |
| `portfolio.html` vista reporting, `dashboardProgramRow` (`:327`) | riga testuale del programma | aggiunge `Program Dashboard →` (link a `/program.html?programId=…`), come 7.4d |
| `portfolio.html` menu fratelli (`:332-341`) | elenco progetti fratelli | aggiunge in fondo la voce `Program Dashboard →`, come 7.4d |
| `portfolio.html` breadcrumb del reporting (`:321-325`) | `Portfolio / <Progetto>` | `Portfolio / <Programma> / <Progetto>` con il programma cliccabile, quando il progetto ha un programma |
| `program.html`, ogni riga/barra | — | `Reporting →` = `/portfolio.html?projectId=<id>` |

Nessun'altra modifica al reporting di progetto: la 7.4 è un ciclo a sé (le sue emoji, i suoi KPI e
il suo layout restano come sono).

## 11. CSS e cache-busting

- `css/portfolio.css` diventa condiviso: linkato da `portfolio.html` **e** `program.html`, con le
  classi nuove `.pg-*` aggiunte in fondo in una sezione commentata.
- `js/lib/portfolio-guard.test.js` aggiornato: "linkato solo da portfolio.html" → "solo da
  portfolio.html e program.html"; il controllo `?v=` uniforme resta e sale a `?v=2` su entrambe.
- `js/lib/nav-shell-guard.test.js`: `PAGES` passa da 18 a 19 voci con `program`.
- Solo `var(--token)`, nessun hex nuovo, nessuna emoji in `program.html`.
- Qualunque file versionato toccato (`css/portfolio.css`, e `js/core.js`/`js/nav.js` se servisse)
  va ribumpato **in tutte** le pagine che lo linkano.

## 12. Responsive (provvisorio — tavole non disegnate)

Regole del brief §12, da verificare a schermo ma senza pretesa di fedeltà a una tavola:
KPI 4 → 2 sotto 1280 → 1 sotto 768; List nasconde `Remaining` e `vs time` sotto 1024 e sotto 768
diventa elenco di card (nome, status, barra con tacca, Spent/Sold, `Reporting →`); Timeline solo
da 1024 in su, sotto sparisce il segmentato e resta la List.

## 13. Test

**Unit (vitest, `js/lib/program-calc.test.js`)** — funzioni pure:
somma delle righe = riga Total; `consumptionPct` di programma = Σspent/Σsold e **non** media;
progetto senza budget escluso dal denominatore ma contato; soglie D10 ai bordi (84.9/85/100/100.1,
+9.9/+10/+10.1); `vsTime` `null` senza date; `programRange` con progetti senza date;
`programBurndown` che estende prima/dopo l'asse di un progetto; valuta mista → `null` da `programCurrency`; `timeElapsed` prima dell'inizio e dopo la fine; `sortProjectRows` stabile.

**Guard (`js/lib/program-guard.test.js`)**: shell `#app-shell`/`#app-main` senza
`overflow`/`position`/`transform`, head snippet presente, `v-cloak` sul root, `?v=` concordi,
nessun hex, nessuna emoji, nessun `Intl.NumberFormat`, nessun `alert(`/`confirm(` nativo.

**Guard aggiornati**: `portfolio-guard.test.js` (due pagine), `nav-shell-guard.test.js` (19 pagine)
e `page-names.test.js`, che prende `program.html → 'portfolio'` nella mappa `PAGES` così anche la
pagina nuova è vincolata a "voce di menu = `<title>` = breadcrumb". L'asserzione attuale cerca la
stringa esatta `{ label: 'Portfolio' }`: qui la voce Portfolio è intermedia e porta un `href`,
quindi il controllo va reso tollerante all'`href` (prefisso `{ label: 'Portfolio'`), senza
indebolirlo per le altre pagine. `money-guard.test.js` deve continuare a passare.

**Backend**: nessuna modifica di comportamento (solo i commenti D13), quindi nessun nuovo test
`node:test` e nessun restart di `pdash-api` necessario per la logica — il commento viene comunque
ricaricato da nodemon.

**Perimetro (D14)**: la suite da far girare è quella frontend completa (`npm test`, è veloce e i
guard sono trasversali), ma **i test nuovi e la code review coprono solo i file di questo ciclo**:
`program.html`, `js/lib/program-calc.js`, `css/portfolio.css`, `portfolio.html`, i guard toccati,
`api/src/routes/reporting.js` (solo commenti). Nessuna incursione nel resto della codebase.

**Verifica visiva** (PROCESS.md §6.3/§6.6): `scripts/shoot.mjs` a **1440, 1024, 390** contro le
tavole 7.5a e 7.5b, su un programma reale con più progetti (`MEN_26_AURORA…` ne ha 4), più un
caso senza budget e uno non iniziato. Il confronto tavola-vs-markup è parte del task: un report
che non lo contiene non chiude il task.

## 14. Gestione delle tavole (come nel ciclo Portfolio)

Vincolo esplicito dell'utente, memoria `feedback-boards-in-every-dispatch`:
ogni dispatch di implementer **e di reviewer** porta nel prompt il path assoluto delle tavole
pertinenti e una riga `Boards:` nel task del piano; il report del subagent deve contenere il
confronto esplicito tavola-vs-markup. Nessuna eccezione: "non riesco a renderizzare" non è una
ragione valida — `scripts/shoot.mjs` e headless Chrome funzionano.

## 15. Documentazione da aggiornare a fine ciclo

- `docs/pages/program.md` (nuovo) — narrativa della pagina.
- `docs/pages/portfolio.md` — ingressi attivati, breadcrumb del reporting, `css/portfolio.css` condiviso.
- `CLAUDE.md` — riga nella tabella Pages, `js/lib/program-calc.js` nel File structure, nota sul
  foglio condiviso.
- `docs/js/lib.md` — voce `program-calc.js`.
- `ARCHITECTURE.md` — se la sezione pagine lo richiede (nessun endpoint nuovo da documentare).

## 16. Item aperti per la review finale del Portfolio

Da raccogliere nel ciclo di code review sull'intera codebase, previsto **al termine del restyling
della sezione Portfolio** (D14):

1. Cancellare `GET /api/reporting/portfolio` e `/reporting/projects/:id` più i wrapper
   `js/api.js:202-203` e le righe di `ARCHITECTURE.md`, se nel frattempo nessuno li ha adottati (D13).
2. Decidere la fonte di `Sold` nelle Card/List del Portfolio: oggi è il phasing, che vale 0 sui
   progetti senza phasing (5 su 15 al 2026-10-08), mentre il reporting e la Program Dashboard usano
   il budget dei task. Cambiarla implica rivedere anche la colonna `Variance` (D3).
3. `.pf-list-actions` con `overflow:hidden` taglierebbe il bottone più a sinistra (follow-up
   accettato del ciclo Portfolio 1).
4. Uniformazione dei controlli allo stile costgrid su entrambe le pagine (D12).
5. Lo Share di programma vero (Ciclo 2 del Portfolio), che sostituirà il riuso D6.

## 17. Fuori scope

Reporting di progetto 7.4 oltre ai link; filtro Period, filtro task, Breakdown ed Entries a
livello programma; Share di programma vero (Ciclo 2 del Portfolio); Export PDF di pagina;
ordinamento per colonna nella List; uniformazione dei controlli allo stile costgrid (ciclo
dedicato, entrambe le pagine); enforcement della valuta unica per programma; allineamento della
semantica `Sold` nelle Card/List del Portfolio (item aperto, §2.3).
