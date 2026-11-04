# Master Data — Pipelines & POTs (phase 2, page 2 of 4) — design spec

**Date:** 2026-11-04
**Brief started:** unknown
**Brief:** `docs/superpowers/design/MD-Pipeline-Pots/202061104-brief-master-data-pipelines-claude-code.md`
**Scenario:** 2 (evoluzione)

Fase 2 del redesign Master Data, seconda pagina: il contenuto della sezione "Pipelines & POTs" dentro la shell
della fase 1. Tre livelli in una pagina — lista pipeline → POT targets di una pipeline → phasing (proposal /
project) — ciascuno con il suo URL. Il modale dei dettagli POT diventa un drawer; nuovo anno, nuovo POT e
modifica del target diventano inline. Il brief è normativo dove differisce dalle note delle tavole; le regole
attuali dell'app vincono sulle tavole (brief §2). Le catture JPG che il brief colloca in `docs/captures/pipelines/`
stanno nella cartella design del brief.

## 1. Obiettivo

- Lista pipeline (10.4a) con switch Visible/Hidden, achievement a due colori, conteggio POT, menu "⋯"; nuovo anno
  inline (10.4b), creato Hidden.
- POT targets (10.4c–e): riepilogo con C+A dell'intera pipeline, gap, tessere per stage, tabella POT con barra,
  nota fuori-POT, nuovo POT inline, edit target sotto la riga con motivo obbligatorio.
- Drawer dettaglio POT (10.4f) in Vue al posto di `#potDetailsModal`.
- Phasing (10.5a–b) a tutta larghezza, filtri stage/client/POT, EUR vs valuta originale senza mescolare valute.
- Tablet e smartphone come 10.4g; niente emoji, niente `confirm()`/`alert()`, copy in inglese.

## 2. Fatti verificati nel codice (a `4645a63`)

- `master-pipelines.html`: quattro viste scelte da stato (`activePipeline`, `phasingYear`, `projectPhasingYear`),
  nessun URL. Tabelle di phasing costruite come stringa (`phasingTableHtml`, `projectPhasingTableHtml`) e rese con
  `v-html`. `deletePipelineYear` e `deletePot` usano `confirm()`. `openPotDetails` riempie `#potDetailsModal` con
  `innerHTML`. `stageColor()`/`stageBg()` con hex letterali.
- `POST /api/pipeline-years` accetta `{ year, active = true }` (`pipeline-years.js:46`); `Api.pipelineYears.create(year)`
  (`js/api.js:175`) invia solo `year`; unico chiamante `master-pipelines.html`.
- `DELETE /api/pipeline-years/:id` → 409 "Pipeline N cannot be deleted because it has proposals. Deactivate it
  instead." se **qualsiasi** `cost_grid_versions.pipeline_year` vale l'anno (`pipeline-years.js:84`).
- `GET /api/pots` senza `year` restituisce i POT di tutti gli anni con i totali C/A/E/SIP e `achieved_total`
  (`pots.js:186`), ordinati per anno desc e nome.
- `GET /api/pots/year-totals` → per anno `pot_total`, C, A, E, SIP, `achieved_total`; nessun conteggio POT.
- `/reporting/phasing` → righe `{ cgId, versionId, name, versionLabel, pipeline, currency, currencyRate, clientId,
  months: { 'YYYY-MM': { hours, amount } } }`; `/reporting/project-phasing` → `{ projectId, name, pipeline, currency,
  currencyRate, clientId, months: { 'YYYY-MM': number } }`.
- `portfolio.html` apre il reporting di un progetto con `?projectId=` (`portfolio.html:1501`).
- `formatMoney(amount, code, currencies, { rounded })` in `js/lib/money.js:33`; nessuna opzione per omettere il
  simbolo.
- Componenti esistenti: `.md-seg`, `.md-switch` (`css/style.css:222-248`), `<cg-select>` (`js/cg-controls.js`, opzioni `{ value, label, disabled }`,
  usato da costgrid, project-config, portfolio e planning; `master-clients.html` ha un menu a pillola locale), `showConfirm` (`js/core.js`), icone `.pd-icon` in `js/lib/icons.js` (presenti:
  `pencil`, `trash`, `more`, `info`, `download`, `close`, `chevron-left/right/down`, `arrow-right`, `plus`).
- Nessun drawer condiviso: `.pb-panel` (`css/pipeline.css`) e il drawer del Team assistant (`css/planning.css:391`)
  sono specifici delle loro pagine. `--overlay-scrim` esiste in `css/tokens.css:32`.
- `master-pipelines-pot-input-guard.test.js` pinna `potf.amountText`, `onPotAmountFocus/Blur`, `@keydown.enter="savePot"`,
  il messaggio di errore di `savePot` e `stored: this.potf.stored`; vieta il letterale `Target (€)`.

## 3. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| `10.4a-pipelines-list.jpg` | §5 Lista pipeline |
| `10.4b-new-year-inline.jpg` | §5.3 Nuovo anno inline |
| `10.4c-pot-targets.jpg` | §6.1 Testata e riepilogo, §6.2 Tabella POT |
| `10.4d-new-pot-inline.jpg` | §6.3 Nuovo POT inline |
| `10.4e-edit-target.jpg` | §6.4 Edit target |
| `10.4f-pot-detail-drawer.jpg` | §7 Drawer dettaglio POT |
| `10.4g-tablet-smartphone.jpg` | §9 Responsive |
| `10.5a-project-phasing.jpg` | §8 Phasing (Project) |
| `10.5b-proposal-phasing.jpg` | §8 Phasing (Proposal) |

Nelle tavole ma fuori scope (brief §7): righe "No project yet" e raggruppamento dei progetti sotto la proposta
("· 4 projects"); hint "Clients already in a group POT are not listed"; nome di client d'esempio nella nota
fuori-POT; "Export XLS keeps decimals and the active filters" (l'export non cambia); legenda "Past months ·
actuals" (diventa "Past months"); "· N proposals" sotto ogni POT (dato assente); switch Visible verde (resta
`.md-switch` navy, brief §2).

## 4. Architettura

- **Una sola app Vue** in `master-pipelines.html`. Stato di livello derivato dall'URL:
  - `master-pipelines.html` — lista
  - `?year=2026` — POT targets
  - `?year=2026&pot=<id>` — POT targets con drawer aperto
  - `?year=2026&phasing=proposal|project` — phasing
  Cambio di livello e apertura/chiusura del drawer: `history.pushState`; switch Proposal/Project:
  `history.replaceState`; `popstate` rilegge l'URL e applica lo stato. Reload riapre lo stesso livello. Anno
  sconosciuto → lista con `globalError` "Pipeline <anno> not found."; `pot` sconosciuto → POT targets senza drawer.
  I filtri della phasing non vanno nell'URL.
- **Nuovo modulo `js/lib/master-pipelines.js`** (ES module + bridge `window.*`), funzioni pure:
  - `parseMdpUrl(search)` → `{ year, pot, phasing }` (numeri/stringhe validati, `phasing` solo
    `proposal|project`); `buildMdpUrl(state)` → query string.
  - `potCountByYear(pots)` → `{ [year]: n }`.
  - `achievement(achieved, target)` → % intero, `null` se target ≤ 0.
  - `gapToTarget(target, ca)` → `{ gap, over }` (`gap = max(0, target − ca)`, `over = max(0, ca − target)`).
  - `outsidePotCommitted(summary, pots)` → Committed di `pipeline-summary` − Σ `committed_total` dei POT; `null`
    se ≤ 0.
  - `potClientIds(pot, groups)` → insieme dei client coperti: client POT → `{client_id}`; group POT → client del
    gruppo; General → insieme vuoto.
  - `filterPhasingRows(rows, { stages, clientId, potClientIds })` — esclude sempre Draft/Canceled (stage fuori da
    SIP/Expected/Anticipated/Committed); `stages` vuoto = tutti; `clientId` e `potClientIds` in AND.
  - `rowMonthAmount(row, month)` — normalizza `{ amount }` (proposal) e numero (project).
  - `phasingTotals(rows, months, mode)` — `mode: 'eur'` → una riga di totali, importo locale / `currencyRate`
    (`|| 1`); `mode: 'original'` → una riga per valuta presente, ordinate con EUR prima e poi per codice, ciascuna
    con `{ currency, count, months, total }`. Mai sommare valute diverse.
- **Characterization prima del refactor:** test che pinnano filtro e totali EUR delle due computed attuali
  (stage, client, Draft/Canceled esclusi, conversione per `currencyRate`, valuta non EUR) su dati fissi; le nuove
  funzioni devono restituire gli stessi numeri sugli stessi casi.
- Le tabelle di phasing diventano template Vue (niente `v-html`); `phasingTableHtml`/`projectPhasingTableHtml`,
  `stageColor()`/`stageBg()`, `fmtRate`, `potYearOptions` e lo stato di tab rimosso spariscono.
- **Wide mode** (brief §8.1): modificatore `md-layout--wide` su `.md-layout` in `css/style.css` che nasconde
  `.md-subnav` e dà a `.md-content` tutta la larghezza a ogni breakpoint; applicato da Vue solo nella phasing
  (classe sull'elemento `.md-layout` fuori dalla root Vue, impostata da un `watch` sul livello). Unico tocco alla
  shell.
- **API client**: `Api.pipelineYears.create(year, active)` — secondo argomento opzionale; se è definito viene
  inviato `active`. Chiamanti esistenti invariati. Bump di `?v=` di `js/api.js` in ogni riferimento del repo.
- **Money**: `formatMoney(amount, code, currencies, { rounded, symbol })` — nuova opzione `symbol` (default
  `true`); con `symbol: false` il numero è formattato con lo stesso locale e raggruppamento, senza simbolo. Solo
  frontend; il twin server non cambia. Bump di `?v=` di `js/lib/money.js` ovunque.

## 5. Lista pipeline (10.4a, 10.4b)

### 5.1 Testata

Card head: titolo "Pipelines", descrizione "One pipeline per year. Each pipeline has its POT targets by client or
client group.", primario **+ Add year**. Breadcrumb `Home / Master Data / Pipelines & POTs`.

### 5.2 Tabella

Testata 10px maiuscolo, ordinamento per anno desc.

| Colonna | Contenuto |
|---|---|
| Pipeline | "Pipeline 2026" (14px 700, link ai POT; muted se hidden), sotto "N proposals" da `offers` |
| Visibility | `.md-switch` + "Visible"/"Hidden", tooltip "Hidden pipelines are not shown in the Pipeline page"; chiama `Api.pipelineYears.toggle`; disabilitato durante il salvataggio; in errore ripristina e mostra l'errore in `globalError` |
| POT target | `pot_total` di year-totals, o "—" |
| Achievement · C + A | % (`achievement`), importo C+A, barra Committed/Anticipated (token stage), riga "C € … · A € …"; "No POTs set" se `pot_total` è 0/assente |
| POTs | `potCountByYear` da un `GET /pots` senza anno al caricamento, o "—" |
| Actions | "POT targets →", "⋯" |

Le voci E e S della cella achievement spariscono.

**Menu "⋯"** (popover locale, chiuso da Esc e click fuori): Proposal phasing (View →), Project phasing (View →),
divisore, Delete pipeline con hint di una riga.
- Disabilitato con `offers > 0`: "Not available: N proposals use this pipeline. Hide it instead."
- Altrimenti hint "Removes the pipeline year."; `showConfirm` "Delete Pipeline 2027? Cost grid versions linked to
  this year stay; the pipeline entry is removed."; un 409 del server va in `globalError`.

### 5.3 Nuovo anno inline (10.4b)

Prima riga sotto la testata: label "Pipeline", input testo `inputmode="numeric"` prefillato con max anno + 1 (logica
di `openPyForm`), focus ring magenta, autofocus; hint "Created hidden: show it when POTs are ready." che diventa
rosso con "Enter a year that doesn't exist yet." quando l'anno è fuori 2000–2100 o già presente. Cancel / Create;
Enter = Create, Esc = Cancel. Create chiama `Api.pipelineYears.create(year, false)`. Il 409 del server sotto la riga.

### 5.4 Nota e vuoto

Nota: "Achievement = (Committed + Anticipated) / POT target. Hidden pipelines stay in reports but don't appear in
the Pipeline page." Vuoto: "No pipeline years yet. Use + Add year to create the first one."

## 6. POT targets (10.4c–10.4e)

### 6.1 Testata e riepilogo

- Link "← Pipelines", titolo "Pipeline 2026" + pillola Visible/Hidden (sola lettura). A destra bottoni secondari
  **Proposal phasing** e **Project phasing** (icona barre). Breadcrumb `… / Pipelines & POTs / Pipeline 2026`.
- Card riepilogo, tre colonne:
  - **Total POT target**: Σ importi dei POT, "N POTs".
  - **Committed + Anticipated**: C + A di `pipeline-summary` (intera pipeline) e "% of target"; barra
    Committed / Anticipated / Expected / SIP (SIP a strisce) scalata su max(target, C+A+E+SIP), tacca navy
    "Target"; legenda con i quattro importi; nota "Progress and gap to target count Committed + Anticipated only.
    SIP and Expected are shown as upcoming pipeline."
  - **Gap to target**: `gapToTarget`; "% of target", didascalia "Target − (C + A)"; con C+A ≥ target "Over target"
    e il surplus in verde.
- Riga "Whole pipeline by stage · all clients": cinque tessere compatte (SIP, Expected, Anticipated, Committed,
  Canceled) "Stage · count" + importo, colori `--pipeline-<stage>-bg/-color`; count 0 a opacità ridotta.
- Senza POT: niente parte barra/gap; le tessere restano.

### 6.2 Tabella POT

Testata "POT targets" + primario **+ New POT**. Righe 58px, ordine dell'API.

| Colonna | Contenuto |
|---|---|
| Client / group | Nome (una riga, ellipsis; click apre il drawer) + pillola **Client** / **Group** / **General** (`special_label`); sotto, per un gruppo, i suoi client da `GET /client-groups` |
| Target | Importo 700 |
| Committed | Verde (token stage) |
| Anticipated | Arancio (token stage) |
| Achievement · C + A | Barra C, A, E, SIP (a strisce) + % da `achieved_total / amount`, verde se ≥ 100%; riga blu "+ € … in SIP / Expected" se E + SIP > 0 |
| Actions | Link "Details", icona edit (30×30, navy pieno mentre il suo editor è aperto), icona delete |

**Delete POT**: `showConfirm` `Delete the POT target for "X" (2026)? This cannot be undone.`; errore in `globalError`.

**Nota fuori-POT** (icona info): "Committed outside POTs: € … (clients without a POT). It counts in the stage
totals but not in the POT targets." da `outsidePotCommitted`; nascosta quando è `null`.

**Vuoto**: "No POT targets for Pipeline 2026. Use + New POT to add the first one."

### 6.3 Nuovo POT inline (10.4d)

Prima riga sotto la testata della tabella, sfondo come la testata, va a capo:
- `.md-seg` **Individual client / Client group** (sostituisce la select Target type).
- `<cg-select>` del target (240px): Individual client → "Unassigned / To be Identified", "New Biz", divisore,
  client per nome; Client group → gruppi per nome. Nascosti i target che hanno già un POT nell'anno (client,
  gruppo o `special_label`). Placeholder "Select client without a POT…" / "Select group without a POT…".
- Input target 150px (`potf.amountText`, focus/blur come oggi), placeholder da `moneyFormatExample`, simbolo da
  `currencyInfo`.
- Hint: solo per Client group, "All clients of the group count towards one target."
- Cancel / Create (disabilitato finché target e importo non ci sono); Enter = Create, Esc = Cancel; errori sotto
  la riga con le stringhe attuali.

### 6.4 Edit target (10.4e)

Sotto la riga del POT, uno alla volta, sfondo come la testata:
- "New target (<simbolo>)" con l'input prefillato (stesso `potf.amountText`).
- "Reason for change *" · "saved in the change history", placeholder "Explain why the target is changing".
- Testo "Current € …".
- Cancel / **Update target** (primario), disabilitato finché il motivo è vuoto o l'importo non è valido; le
  stringhe d'errore e il controllo di `savePot` restano.
- Dopo il salvataggio: riga aggiornata, cache di dettagli/storia del POT invalidata.
- Si apre anche dal drawer ("Edit target" chiude il drawer e apre l'editor della riga).

Un solo stato `potf` serve §6.3 e §6.4 (`potf.id` nullo = nuovo POT): aprire uno chiude l'altro.

## 7. Drawer dettaglio POT (10.4f)

- Pannello a destra 560px, `position: fixed`, scrim `--overlay-scrim` a opacità; chiude con click sullo scrim, ✕,
  Esc; stili locali della pagina sul modello di `css/planning.css:391`. `#potDetailsModal` rimosso. Reso con Vue.
- Testa: "POT · Pipeline 2026", nome + pillola "Client POT" / "Group POT" / "General target", sotto i client del
  gruppo; bottoni **Edit target** e ✕.
- Progresso: "N%" + "of € … target reached by Committed + Anticipated", barra C/A/E/SIP, riga blu "+ € … in SIP /
  Expected · not counted in the gap" se E + SIP > 0.
- Tre tessere: Committed, Anticipated, **Gap to target** o **Over target** (+ surplus, verde).
- "Proposals · N": nome proposta, "data · owner" (per un group POT preceduto dal client), pillola stage (token),
  valore EUR, `↗` a `/costgrid.html?cgId=…&verId=…` (nuova scheda). Non EUR: importo originale con EUR sotto.
  Righe SIP ed Expected al 60% di opacità. Piede "Only Committed and Anticipated count towards the target." Vuoto:
  "No proposals for this target in this year."
- "Target history": timeline dalla più recente; "old → new" (vecchio barrato, "—" alla creazione), "data · utente"
  (+ "· created" sulla prima), nota in un chip grigio. Vuoto: "No history yet."
- Dati da `GET /pots/:id/details?year=` (invariato). Caricamento: skeleton nel drawer; errore inline nel drawer.

## 8. Phasing (10.5a, 10.5b)

### 8.1 Contenitore

- Livello `?phasing=`; `md-layout--wide` attivo. Breadcrumb `… / Pipeline 2026 / Proposal phasing|Project phasing`.
- Link "← Pipeline 2026 · POT targets", titolo "<Mode> · Pipeline 2026" + `.md-seg` **Proposal phasing / Project
  phasing** (cambia modalità, conserva i filtri, carica i dati della modalità se mancano). Descrizione:
  - Proposal: "Monthly budget phasing of every proposal version in the pipeline (from its cost grid)."
  - Project: "Monthly phasing of every project in the pipeline. Open a project to see its reporting."
- A destra **Export XLS** (icona download) verso `/api/exports/phasing?year=`, solo in Proposal, tooltip
  "Committed and Anticipated proposals, all clients". Le cinque card stage della phasing di oggi spariscono.

### 8.2 Toolbar

- Chip **Stage** con conteggio sulle righe del set (SIP, Expected, Anticipated, Committed); nessuna selezionata = tutte,
  e in quello stato tutte colorate; con una selezione le altre attenuate.
- `<cg-select>` **Client**: "All" + client per nome.
- `<cg-select>` **POT**: "All" + POT dell'anno esclusi i General; filtro con `potClientIds`.
- Link "Clear" quando un filtro è attivo.
- A destra "Amounts" `.md-seg` **All in EUR / Original currency**.

### 8.3 Tabella

- Colonne: nome (sticky a sinistra, ≥ 200px), Stage (pillola token), 12 mesi, Total. Testata sticky; scroll
  orizzontale dentro la card.
- Riga/e di totale in alto, grassetto, sfondo token più vicino a `#F3F4F6`.
- Nome: ellipsis con tooltip del nome intero + `↗`; sotto client + pillola valuta viola per le righe non EUR,
  tooltip "Proposal currency · converted at the version exchange rate".
  - Proposal: nome cost grid; sotto client · `versionLabel`; `↗` → `/costgrid.html?cgId=…&verId=…`.
  - Project: nome progetto; sotto client; `↗` → `/portfolio.html?projectId=…`, tooltip "Open project reporting".
- Riga senza importi nell'anno: una cella corsiva muted che copre i mesi, "No phasing yet".
- Mese corrente con testata blu; mesi passati su grigio chiaro. Legenda "Past months".
- Celle `formatMoney(v, code, currencies, { rounded: true, symbol: false })`; valore pieno in tooltip
  (`formatMoney` senza opzioni); celle vuote "—".
- Piede: "N proposals · rounded to the unit" / "N projects · rounded to the unit", legenda valuta.
- Vuoto: "No proposals for Pipeline 2026." / "No projects for Pipeline 2026."; nessun match: "No rows match the
  current filters."

### 8.4 Valuta

- **All in EUR** (default): ogni importo = locale / `currencyRate`; una riga "Total · € · all amounts in EUR".
- **Original currency**: importi nativi della riga; una riga di totale per valuta presente nelle righe filtrate
  ("Total EUR", "Total GBP" + numero di righe), da `phasingTotals(..., 'original')`.
- Piede: pillola valuta + "Converted to € at the version rate" (solo in EUR e con righe non EUR).

## 9. Responsive (10.4g)

**Tablet (768–1023px)**
- Lista: colonna POTs nascosta; controlli 40px.
- POT targets: i due bottoni di phasing diventano un menu "Phasing ▾" (Proposal phasing / Project phasing).
  Riepilogo su due righe: "N%" + "€ C+A of € target · gap € …", barra, tessere stage in una riga a scroll
  orizzontale.
- Tabella POT: Nome (+ pillola, sotto-riga), Target, Achievement (barra + % + "C € … · A € …"), chevron; colonne
  Committed/Anticipated e azioni nascoste; la riga apre il drawer, la cui testa porta Edit target e "⋯" → Delete.
- Phasing: stessa tabella, nome sticky, toolbar che va a capo.

**Smartphone (< 768px)**
- Lista: "+ Add year" a tutta larghezza (44px) sotto il selettore di sezione. Card per pipeline: nome + "⋯" (44px;
  Proposal phasing, Project phasing, Delete), "% of € target" + barra (o "No POTs set"), piede 44px con switch
  Visible e "N POTs →"; tap sulla card apre i POT.
- POT targets: come tablet impilato; POT come card (nome + pillola, target, barra + %); tap apre il dettaglio.
- Dettaglio POT a schermo intero: "← Pipeline 2026" (≥ 36px), tessere in griglia a 3, proposte in lista (righe
  44px), storia; barra fissa in fondo con **Edit target** (46px) che apre un bottom sheet (nuovo valore + motivo
  obbligatorio + Update target), stesso stato `potf`.
- Phasing: stessa tabella con scroll orizzontale e nome sticky; toolbar = chip stage in riga a scroll, poi Client /
  POT / Amounts impilati.

## 10. Componenti, token, icone, cache-busting

- Riuso: `.md-seg`, `.md-switch`, `<cg-select>` (carica `js/cg-controls.js` e `css/controls.css`), `showConfirm`,
  `.pd-icon`. Stili specifici nel `<style>` della pagina, senza hex: token (`--pipeline-*`, superfici, bordi).
- Nessuna emoji (📊 📋 🔍 ✏️ 🗑 ⬇ ✕); `↗` e `→` come glifi di testo.
- Bump `?v=` in ogni riferimento del repo di: `css/style.css`, `js/api.js`, `js/lib/money.js` (guard esistenti).

## 11. Test

- **Nuovo** `js/lib/master-pipelines.test.js`: `parseMdpUrl`/`buildMdpUrl` (livelli, valori invalidi),
  `potCountByYear`, `achievement`, `gapToTarget` (sotto e sopra target), `outsidePotCommitted` (null se ≤ 0),
  `potClientIds` (client, gruppo, General), `filterPhasingRows` (Draft/Canceled esclusi, stage vuoto = tutti,
  client, POT di gruppo), `phasingTotals` (EUR con `currencyRate`, original per valuta senza somme miste);
  **characterization**: stessi totali EUR e stesse righe filtrate delle computed attuali sugli stessi dati.
- `js/lib/money.test.js`: `symbol: false` con e senza `rounded`, EUR e GBP/JPY.
- `master-pipelines-pot-details.test.js` aggiornato: E/SIP nella barra e nella riga blu, drawer al posto del
  modale, nessun `innerHTML` sul dettaglio; restano valori, `achieved_total`, valuta originale solo per non EUR,
  nessun hex, token stage.
- `master-pipelines-pot-input-guard.test.js` invariato e verde.
- `master-data-guard.test.js`: il `must` di `master-pipelines.html` perde `id="potDetailsModal"` e prende il drawer; più il check di `md-layout--wide` in `css/style.css`.
- Guard di pagina (nuovi casi in `master-pipelines-pot-details.test.js` o file dedicato): create invia
  `active: false`; delete pipeline disabilitato con `offers > 0` e errore del server in `globalError`; Update target
  disabilitato senza motivo; nessun `confirm(`/`alert(`; nessuna emoji; `popstate` gestito.
- Manuale: caso nuovo in `TEST_CASES.md` (livelli e back/forward, drawer, edit target, phasing EUR/original).

## 12. Verifica visiva

`scripts/shoot.mjs` contro lo stack del branch (`scripts/test-branch.sh up`, `--base http://localhost:8081`,
`--settle 3000`): a 1440 lista, nuovo anno, POT targets, nuovo POT, edit target, drawer, proposal phasing, project
phasing; a 1024 POT targets; a 390 lista e dettaglio POT. I PNG si rileggono e si confrontano con le tavole del
§3; gli scostamenti si presentano uno per uno (fix ora / accetta e registra in `docs/pages/config.md`).

## 13. Fuori scope

Shell della fase 1 salvo `md-layout--wide`; Clients & groups, Roles & rates, Currencies; qualunque cambio al
calcolo di C/A/E/SIP, fee, phasing o conversione; `/exports/phasing`; link proposta sui progetti e righe "No project
yet"; filtro dei client già coperti da un POT di gruppo; conteggio proposte per POT; filtri nell'URL.

## Criteri di accettazione

1. **Tre livelli con URL** — lista, `?year=`, `?year=&pot=`, `?year=&phasing=` si aprono da reload; back/forward attraversano i livelli; anno sconosciuto → lista con errore (`master-pipelines.test.js`; Gate 2).
2. **Lista pipeline** — switch Visible/Hidden funziona e ripristina in errore; achievement a due colori senza E/S; conteggio POT per anno (Gate 2).
3. **Nuovo anno** — riga inline prefillata con max+1, validazione 2000–2100 e duplicato, creazione Hidden (`active: false`) (guard; Gate 2).
4. **Delete pipeline** — disabilitato con `offers > 0` con l'hint; altrimenti conferma e un 409 del server appare in `globalError` (guard; Gate 2).
5. **Riepilogo POT** — C+A dall'intera pipeline, gap / over target, tessere stage, nota fuori-POT nascosta quando ≤ 0 (`master-pipelines.test.js`; Gate 2).
6. **Nuovo POT ed edit target inline** — target speciali presenti, target con POT nascosti, Update target disabilitato senza motivo, input guard verde (`master-pipelines-pot-input-guard.test.js`; Gate 2).
7. **Drawer** — dettaglio POT in Vue con progresso, tessere, proposte (valuta originale solo non EUR, link cost grid), storia; chiusura con scrim/✕/Esc (`master-pipelines-pot-details.test.js`; Gate 2).
8. **Phasing** — filtri stage/client/POT con gli stessi risultati di oggi per stage e client; POT di gruppo copre i client del gruppo; Original currency non somma valute diverse; link cost grid / project reporting; sub-nav nascosta (`master-pipelines.test.js`, `master-data-guard`; Gate 2).
9. **Calcoli invariati** — totali EUR e righe filtrate identici alle computed attuali (characterization in `master-pipelines.test.js`).
10. **Responsive** — tablet e smartphone come 10.4g, target touch ≥ 44px su phone (shoot a 1024 e 390, confronto con `10.4g-tablet-smartphone.jpg`).
11. **Niente emoji, niente dialog nativi, niente hex** — in `master-pipelines.html` (guard).

## Decisioni aperte

1. **Modulo puro `js/lib/master-pipelines.js` più template Vue.** Alternativa scartata: logica inline nell'HTML con `v-html`. Perché: il brief chiede test su URL, filtri e totali per valuta.
2. **Nuova pipeline Hidden via `Api.pipelineYears.create(year, active)`.** Alternativa scartata: `apiFetch` diretto dalla pagina, o creazione Visible. Perché: la tavola e il brief §7.1 lo chiedono e l'API client resta l'unico punto di chiamata.
3. **Default del brief §7.2–§7.6 adottati; conteggio POT da un `GET /pots` senza anno.** Alternativa scartata: un campo nuovo in `year-totals` o il conteggio proposte per POT. Perché: nessun cambio API.
4. **Drawer locale alla pagina sul modello di Planning.** Alternativa scartata: `.md-drawer` condiviso. Perché: non esiste un drawer condiviso da riusare.
5. **`<cg-select>` per target, Client e POT; anno come input testo numerico.** Alternativa scartata: `<select>` nativi. Perché: fedeltà alle tavole, è il controllo custom già condiviso da altre pagine; il divisore è un'opzione `disabled`.
6. **Un solo stato `potf` per nuovo POT ed edit target.** Alternativa scartata: due stati. Perché: l'input guard passa invariato e resta un editor alla volta.
7. **Celle di phasing senza simbolo, arrotondate, con `formatMoney(..., { symbol: false })`.** Alternativa scartata: simbolo in ogni cella con l'opzione `rounded` esistente. Perché: la tavola mostra numeri nudi e la valuta sta nella riga di totale.
8. **Chip stage: nessuna selezionata = tutte, mostrate tutte colorate.** Alternativa scartata: tutte selezionate di default. Perché: semantica di oggi, risultato identico.
9. **Filtri della phasing fuori dall'URL.** Alternativa scartata: filtri nella query string. Perché: il brief li dichiara opzionali.
10. **Switch Visible con `.md-switch` navy.** Alternativa scartata: variante verde della tavola. Perché: i componenti condivisi vincono (brief §2).
11. **Verifica visiva con `scripts/shoot.mjs` nel Piano (§12).** Alternativa scartata: solo il Gate 2. Perché: nove tavole su tre larghezze.
