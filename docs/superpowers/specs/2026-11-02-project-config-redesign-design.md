# Project configuration v2 (tavola 8) — design spec

**Date:** 2026-11-02
**Brief started:** unknown
**Brief:** `docs/superpowers/design/config-project/2026-11-02-redesign-project-config-form-handoff.md`
**Scenario:** 2 (evoluzione)

Restyling di `project-config.html` dentro la sua struttura attuale: stessa app Vue 3 (CDN, nessun build),
stesso oggetto `this.project`, stessi metodi di salvataggio, stesse chiamate API. Tavole in
`docs/superpowers/design/config-project/`:

| Tavola | File | Ruolo |
|---|---|---|
| 8.1 | `config_form_part1.jpg` | **Riferimento principale** — page head, indice + Totals, Client & program, Project info, Actuals, Tasks & resources (un task aperto) |
| 8.2 | `config_form_part2.jpg` | Monthly phasing (Budget), Pass-through costs, Functional groups. Il blocco Tags di questa tavola **non** si segue (§6.8) |
| 8.3 | `config_form_phasing_hours.jpg` | Monthly phasing, segmento Hours |
| 8.4 | `config_form_tablet_smartphone.jpg` | Responsive: tablet 1024×768, smartphone 390×844 |

Le tavole prevalgono sul brief per l'aspetto; il sito prevale sulle tavole per componenti, token, navigazione e
salvataggio (brief §0); il codice prevale su entrambi per le regole di business. Dati, importi e separatori
italiani nelle tavole sono illustrativi. La barra di salvataggio sticky in fondo, presente in 8.1 e 8.4, **si
ignora** (brief §1).

## 1. Obiettivo

Portare la pagina al linguaggio visivo delle pagine già ridisegnate (Cost Grid, Portfolio, Project Reporting):
un indice delle sezioni con lo stato di ciascuna, card al posto dei blocchi numerati, i task in tabella con un
solo task aperto, una sola card di phasing per Budget e Hours, Tags uguale a Cost Grid, e un responsive reale a
1024 e sotto 768 — senza cambiare nessuna regola di business, nessun dato salvato e nessuna API.

## 2. Fatti verificati nel codice

Verificati il 2026-11-02 su `main` (`64cb23d`); i numeri di riga sono di `project-config.html`.

- **Page head:** `.ph` minimo (righe 33-41): `.ph-back` ("Project Dashboard" via `goProjectDashboard`, oppure
  "Portfolio" se `isNewProject`) e `.ph-title`. Nessun `.ph-eyebrow`, `.ph-badge`, `.ph-sub`, `.ph-side`,
  `.ph-actions`.
- **Save** vive in una riga in fondo (325-331) con "← Back to Portfolio" (onclick inline) e "← Project
  Dashboard"; è un `btn btn-primary` "💾 Save"/"💾 Saving…", nascosto ai viewer. `onSave` (858) non ha un
  `if (this.saving) return` iniziale: la protezione è il `:disabled="saving"` del pulsante. Dopo un salvataggio
  riuscito redirige a `/portfolio.html?projectId=<id>`.
- **Discard** non esiste in nessuna pagina del sito. `costgrid.html` tiene Save in `.ph-actions` come `.ph-btn`
  con `<ph-icon name="save">`.
- **Sezioni** (`cfg-section`), in ordine: "Client" (senza numero, 48), "0. Program (optional)" (64),
  "1. Project info" (80), "2. Actuals" (102), "3. Tasks & Resources" (119), "4. Monthly Budget Phasing" (206),
  "5. Monthly Hour Planning" (232), "6. Pass Through Costs (PTC)" (255), "7. Functional Groups (optional)" (280),
  "8. Tags (optional)" (301, `v-if="!isNewProject"`). Le sezioni 4 e 5 hanno ciascuna la propria coppia
  Derive/Reforecast, e ciascun pulsante scrive sia `phasing` sia `planning`.
- **Split mensile:** `task.monthlyDistribution` è `{YYYYMM: percent}`, normalizzato a `{}`. Il badge per task
  (`distBadgeClass`/`distBadgeText`, 1038-1050) usa la tolleranza 0,05: "Σ = 100%", "…% too much", "…% missing"
  (vuoto = "Σ = 0% (100% missing)"). Per i calcoli (`config-form-calc.js` 36, 66, 126) uno split è valido se la
  somma è entro 0,5 da 100. La griglia è `readonly` quando `taskMonthRange(task).length === 1 || task.completed ||
  isViewer` (164) e usa `monthLabel(ym, 'it-IT')` (161); phasing e planning usano `monthLabel(ym)` (en-US).
- **Mesi con actuals:** non esiste uno stato dedicato; `actuals.exportRows` contiene le righe caricate con
  `row.date`.
- **CSS:** la pagina carica `tokens.css?v=12`, `style.css?v=27`, `controls.css?v=1`; `css/project-config.css`
  non esiste; le classi `cfg-*` sono in `style.css` (341-348). Ventisei attributi `style=""`, quattro con hex
  (154 `#e9ecef`, 166 `#888`, 199 `#f8f9fa`, 277 `#fff3cd`).
- **Emoji:** nel markup ⚠️ ℹ️ 👁 📂 ⬇ 🗑 💾 ✕ ＋ ⟳ ↻; nelle stringhe di stato JS ✅ ❌ ⏳ (724-853).
- **Tags:** in `costgrid.html` (226-260) è markup inline, non un componente: `.section-card.cg-section-card`,
  header `.section-header.cg-section-header` (role=button, `toggleTagsCollapsed`), `.cg-section-chevron`,
  `.cg-section-title`, `.cg-tag-summary`/`.cg-tag-summary-pill`, `.cg-section-toggle-label`, corpo
  `.cg-tag-groups` > `.tag-group`. Le classi `cg-*` stanno in `css/costgrid.css` (143-164, 272-282), che
  `js/lib/costgrid-guard.test.js` permette solo a `costgrid.html`; `.tag-*` e `.section-card`/`.section-header`
  sono già in `style.css`. Su `project-config.html` Tags è un `cfg-section` piatto (300-321).
- **Icone:** `js/lib/icons.js?v=2` ha, fra le altre, `lock`, `chevron-right`, `chevron-down`, `chevron-left`,
  `close`, `check`, `upload`, `download`, `plus`, `save`, `calendar`. Mancano un cestino, un occhio, un refresh e
  una freccia di trend.
- **Bottom sheet:** `pipeline.html` usa già un Bootstrap `offcanvas offcanvas-bottom` (`.pb-sheet`, 204).
- **Breakpoint:** `js/nav.js` usa solo `(min-width: 1024px)`; `style.css` usa `max-width: 1023.98px` e
  `max-width: 767.98px` per `.ph`.
- **Guard che leggono la pagina** e che il restyling deve lasciare verdi:
  - `content-surface-guard`: nessun `<style>` inline sulla pagina; `.cfg-section` in `style.css` resta
    esattamente `background: var(--surface-light); border-radius: var(--radius-md); padding: 16px 18px;
    margin-bottom: 1rem;`.
  - `project-config-ptc-phasing-guard`, `project-config-rate-input-guard`, `project-config-task-period-guard`:
    stringhe di input, messaggi e corpi di metodi (estratti con un'indentazione di 6 spazi; `distBadgeClass`
    deve restare subito dopo `rebuildTaskDist`).
  - `dates-guard` (esattamente 4 `<cg-date-picker>`, ciascuno con `:disabled="isViewer"`), `page-head-guard`,
    `project-rules-guard` (`v-model="project.currency"…:disabled="currencyLocked"`), `proposal-modals-guard`
    (`api-sync.js?v=31`), `nav-shell-guard`, `money-guard`, `foundations-guard`.

## 3. File

| File | Modifica |
|---|---|
| `project-config.html` | markup di tutte le sezioni, page head, indice, Discard, stato UI nuovo |
| `css/project-config.css` | **nuovo**, `?v=1`, caricato solo da questa pagina dopo `style.css` e `controls.css`; solo token |
| `css/style.css` | riceve le regole Tags/card richiudibile da `costgrid.css` (§6.8); bump `?v=` su ogni pagina |
| `css/costgrid.css` | perde quelle regole; bump `?v=` |
| `js/lib/config-form-calc.js` | nuovi helper puri (§4); `?v=6` |
| `js/lib/icons.js` | quattro icone nuove (§5); bump `?v=` su ogni pagina che lo carica |
| `js/lib/config-form-calc.test.js` | test dei nuovi helper |
| `js/lib/project-config-layout-guard.test.js` | **nuovo** guard (§10) |
| docs | §11 |

Nessun file sotto `api/`, nessuna migrazione, `js/api-sync.js` invariato.

## 4. Helper puri in `js/lib/config-form-calc.js`

Stesso stile degli export esistenti (`export function` + bridge `window.<name>`).

- **`spreadEvenly(months)`** → `{ [ym]: percent }`. Ogni mese riceve `floor(10000 / n) / 100` (due decimali);
  l'ultimo mese riceve `100 − somma degli altri`, arrotondato a due decimali. `[]` → `{}`; un mese → `{ym: 100}`.
  La somma è sempre 100 entro 0,005.
- **`splitState(distribution, months)`** → `{ sum, valid, label, tone }`:
  - `valid` = somma entro 0,5 da 100 (la stessa regola dei calcoli);
  - `label`: somma 0 → `'Not split · 100% missing'`; somma entro 0,05 da 100 → `'100%'`; sopra → `'<x>% too
    much'`; sotto → `'<x>% missing'` (x con un decimale, come oggi);
  - `tone`: `'ok'` | `'warn'` | `'danger'` (danger solo per "too much").
  `distBadgeClass`/`distBadgeText` restano dove sono (il guard fissa la loro posizione) e delegano a
  `splitState`.
- **`phasingBalance(sum, total, decimals)`** → `{ balanced, diff }`, con `balanced` = `|sum − total| <
  0.5 × 10^−decimals` (per gli importi `decimals` è quello della valuta del progetto; per le ore 2).

## 5. Icone

Si aggiungono a `js/lib/icons.js`, nello stesso formato delle esistenti (SVG a linea, `stroke="currentColor"`):
`trash`, `eye`, `refresh`, `trend-up`. Ogni emoji della pagina diventa `<ph-icon>` oppure solo testo; le
stringhe di stato JS perdono ✅ ❌ ⏳ (resta il testo, la classe di colore resta).

## 6. Layout — mappa tavola → sezione

### 6.1 Page head (8.1, 8.4)

- `.ph-back` → "Portfolio" (`/portfolio.html`), sia per un progetto esistente sia per uno nuovo.
- `.ph-eyebrow` "Project configuration"; `.ph-title` = `isNewProject ? 'New Project' : project.name` (invariato).
- Accanto al titolo due `.ph-badge`: stage e status via `headerBadge('stage', …)` / `headerBadge('status', …)`
  di `js/core.js`; assenti se il valore manca.
- `.ph-sub`: client · codice D365 · periodo (`Dec 2025 – Dec 2026`, testo da `js/lib/dates.js`) · valuta ISO;
  ogni parte assente si omette insieme al suo separatore.
- `.ph-side` > `.ph-actions`, nell'ordine: "Project Dashboard" (`.ph-btn`, icona `chevron-right` dopo il testo,
  `goProjectDashboard`, `v-if="!isNewProject"`), "Discard" (`.ph-btn`), "Save" (`.ph-btn-primary`, "Save" /
  "Saving…"). Discard e Save `v-if="!isViewer"`.
- Sotto il page head, nell'ordine: `jsonError`, il banner viewer (testo invariato, senza emoji), l'avviso
  `outOfPeriod` (stessa condizione e stesso testo, ora qui invece che sopra Save).
- La riga in fondo alla pagina (Back to Portfolio / Project Dashboard / Save) **si rimuove**.

### 6.2 Save e Discard

- **Save:** `onSave()` invariato nel corpo; cambia solo la label. Si aggiunge in testa `if (this.saving) return;`
  (stesso idioma di `saveClientModal`), che non sposta nulla di quanto i guard fissano fra `async onSave()` e
  `this.saving = true`.
- **Discard** (`onDiscard`, nuovo): disabilitato quando `!isProjectDirty(savedSnapshot, project)` o `saving`;
  se sporco chiede `showConfirm('Discard all unsaved changes?')` (il `showConfirm` locale della pagina); su
  conferma `this.project = <JSON.parse(savedSnapshot)>` passato per le stesse normalizzazioni del caricamento
  (estratte da `resolveProject` in un metodo `normalizeProject(p)` riusato da entrambi), poi `phasingInvalid =
  {}`, `ptcInvalid = {}`, `rateInvalid = {}`, `openTaskIndex = null`. Tags, actuals e modali client/program
  persistono subito e non sono toccati da Discard.

### 6.3 Indice delle sezioni e Totals (8.1)

- Due colonne: `.pc-layout` = indice (larghezza fissa da token) + colonna delle card.
- **Indice** (`.pc-index`, sticky): etichetta "Sections", una voce per sezione nell'ordine della pagina: Client &
  program, Project info, Actuals, Tasks & resources, Monthly phasing, Pass-through costs, Functional groups,
  Tags. Le ultime tre portano "optional" a destra. Tags compare solo se `!isNewProject`.
- **Click:** `window.scrollTo({ top: <offset della card> − <altezza del breadcrumb/top bar> − margine, behavior:
  'smooth' })`; mai `scrollIntoView`.
- **Voce attiva:** un `IntersectionObserver` sulle card aggiorna `activeSection`; stile attivo come in 8.1 (bordo
  sinistro magenta, fondo bianco). Disconnesso in `beforeUnmount`.
- **Pallino ambra** (con `title` che dice il motivo):
  - Tasks & resources: almeno un task con `!splitState(...).valid` su un intervallo di mesi non vuoto, oppure
    `outOfPeriod.length`, oppure `rateInvalid` non vuoto;
  - Monthly phasing: `phasingInvalid` non vuoto, oppure — con periodo impostato e `grandTotalBudget > 0` —
    Budget o Hours non bilanciati;
  - Pass-through costs: `ptcInvalid` non vuoto.
  Le altre voci non hanno pallino. Il calcolo vive in un computed `sectionIssues` (`{ key: reason | null }`).
- **Totals** (`.pc-totals`) sotto l'indice: "Totals", `formatMoney(grandTotalBudget, project.currency,
  currencies)`, poi `<ore>h · <n> tasks`.

### 6.4 Client & program, Project info (8.1)

- Le card sono `cfg-section` con la classe aggiuntiva `pc-card` (bianco, bordo, raggio, ombra da token, padding
  da tavola); `.cfg-section` in `style.css` non cambia. Titoli senza numero; le sezioni opzionali portano
  "· optional" in grigio.
- **Client & program:** due select affiancate, stessi `v-model` (`project.clientId` con `__unassigned__`,
  `project.programId`). "+ New client" / "+ New program" sono link di testo a destra della label
  (`openClientModal`/`openProgramModal`). Opzione vuota del programma: "No program · standalone project".
- **Project info:** griglia a 3 colonne. Riga 1: D365 project ID (hint "Must match the XLS column"), Project name
  (2 colonne, `onNameInput`). Riga 2: Start month, End month, Currency. Riga 3: Pipeline stage, Status. Riga 4:
  Description (tutta la larghezza, hint "used to extract competence topics for team profiles").
  - Currency: se `currencyLocked`, aspetto bloccato (fondo `--surface-light`, icona `lock`), sotto un hint di una
    riga "Locked · contact a sysadmin to change it" con `currencyHint` completo nel `title`.
  - Pipeline stage: aspetto bloccato **solo** con `pipelineLocked`, hint "From the linked proposal"; altrimenti la
    select di oggi. Status segue `statusRule` invariato.
  - I due `<cg-date-picker>` del periodo mantengono `:min`/`:max` e `:disabled="isViewer"`.

### 6.5 Actuals (8.1)

- Header della card: titolo "Actuals" e, sotto, `actuals.info` (ultima upload, righe, dimensione) come oggi.
- A destra: "Load actuals" (`.ph-btn` con bordo navy, icona `upload`), "View" (`.ph-btn`), Download (icon button,
  icona `download`, `title`/`aria-label` "Download actuals"), Delete (icon button, icona `trash`, `title`/
  `aria-label` "Delete actuals", rosso solo in hover). Condizioni di visibilità e `:disabled` invariate
  (`project.code && !isViewer`, `actuals.exportRows`, `actuals.deleting`).
- `actuals.guardMsg` e `actuals.status` sotto i pulsanti, come oggi.

### 6.6 Tasks & resources (8.1, 8.4)

- **Header:** "Tasks & resources", sotto l'hint accorciato "Task name must match the **Task/Issue** XLS column;
  role must match **Job Role: Name**." A destra "Export XLSX" (`.ph-btn`, icona `download`, `exportTasksXlsx`) e
  "+ Add task" (pulsante navy pieno, `v-if="!isViewer"`).
- **Warning unico:** se almeno un task ha uno split non valido su un intervallo di mesi non vuoto, una barra
  `alert-warning` "<n> of <m> tasks have no monthly split: phasing falls back to the task period." con a destra
  "Spread all evenly" (`v-if="!isViewer"`). Spread all applica `spreadEvenly(taskMonthRange(task))` ai soli task
  con split non valido, più di un mese e non completati.
- **Tabella** (`.pc-tasks`): colonne Task, Period (`Dec 25 – Dec 26`), Roles (numero di risorse), Hours, Total,
  Monthly split (pill di `splitState`). Riga Total in fondo (`grandTotalHours`, `grandTotalBudget`).
  - Sulla riga chiusa, accanto al nome: pill "Excluded" se `!task.billable`, "Completed" se `task.completed`, e
    "Outside the project period" se `isTaskOutOfPeriod(task)` (stesso testo di oggi).
  - Click sulla riga (o Invio/Spazio, `role="button"`, `aria-expanded`) → `openTaskIndex = ti`; un secondo click
    la chiude. Un solo task aperto per volta; stato non persistito.
- **Task aperto** (sotto la sua riga, fondo `--surface-light`):
  - Riga 1: Task name; Period (hint "defaults to project dates") con i due `<cg-date-picker>` del task (stessi
    `aria-label`, `:min`/`:max="taskDateBounds(…)"`, `rebuildTaskDist(ti)`); switch "Include in report"
    (`task.billable`); checkbox "Completed".
  - Description (hint "what is done and which competences it needs").
  - "Monthly % split" con la pill di stato e a destra "Spread evenly" | "Clear" (`v-if="!isViewer"`, disabilitati
    quando la griglia è readonly): Spread evenly = `spreadEvenly(taskMonthRange(task))`, Clear =
    `monthlyDistribution = {}`. Griglia con mesi in inglese (`monthLabel(ym)`), stessa regola `readonly`.
  - Tabella risorse: Job role: name ("must match XLS"), Sold hours, Hourly rate (`onResRateBlur`, stringhe dei
    guard invariate), Subtotal, rimozione (icona `close`, `confirmRemoveResource`). In fondo "+ Add role" e il
    totale del task. "+ Add role" è l'attuale aggiunta di risorsa.
  - "Remove task" in fondo a destra, link rosso (`confirmRemoveTask`).
- **+ Add task** (non disegnato): `addTask` invariato nei default; poi `openTaskIndex` = nuovo indice e, in
  `$nextTick`, focus sul campo Task name.

### 6.7 Monthly phasing (8.2, 8.3)

- Una card "Monthly phasing" con un controllo segmentato Budget | Hours (`phasingMode`, default `'budget'`,
  non persistito) e il sottotitolo "Estimated budget to spend per month (<valuta>)" o "Planned hours to consume
  per month".
- A destra **una sola** coppia "Derive from task dates" (icona `refresh`, `derivePhasing`) e "Reforecast from
  actuals" (icona `trend-up`, `runReforecast`, `v-if="reforecastVisible"`); `phasingActionError` sotto.
- Per ogni mese: una barra sopra l'input, altezza proporzionale al valore del mese sul massimo della serie
  visualizzata. Navy per i mesi presenti in `actuals.exportRows` (computed `actualMonths`, un `Set` di `YYYYMM`
  ricavato da `row.date`), azzurro per gli altri; il mese di oggi ha l'etichetta in grassetto e l'input con
  bordo marcato. Legenda "Past months · actuals loaded" / "Planned".
- **Budget:** gli input di oggi (`onPhasingBlur`, `phasingInvalid`, `moneyInput`, stringhe del guard invariate).
  **Hours:** gli input di oggi della planning (`cfgParseHours`/`cfgFmtHours`). Si usa `v-show`, non `v-if`,
  così entrambe le serie restano nel DOM.
- **Bilancio** a destra della legenda, con `phasingBalance`: bilanciato → testo verde con icona `check`
  "<somma> of <totale> · balanced"; altrimenti colore warning "<somma> of <totale> · <diff> to allocate" (o
  "· <diff> over"). Importi con `formatMoney`, ore con `cfgFmtHours` + "h".
- Senza periodo: il messaggio di oggi "Set Start and End month first.".

### 6.8 Pass-through costs, Functional groups, Tags (8.2)

- **Pass-through costs · optional:** sottotitolo "External costs (licences, travel…) with title, note, amount and
  the month they occur."; "+ Add PTC" a destra. Senza righe: riquadro tratteggiato "No pass-through costs · Total
  PTC <importo>". Con righe: una riga-card per PTC (Title, Note, Amount, Month, rimozione), campi e logica
  invariati (`onPtcBlur`, `ptcInvalid`, `confirmRemovePtc`, select del mese); sotto, "Total PTC <importo>" in
  stile neutro (niente giallo). **+ Add PTC** (non disegnato) aggiunge una riga-card con il focus sul Title.
- **Functional groups · optional:** spiegazione di una riga "Group roles into functional areas for the reporting.
  Pick a task to count a role only on that task, or "Any task" to count it everywhere." Gruppi come card
  affiancate (a capo), header con nome modificabile, "<n> roles" e rimozione (icona `trash`); ogni ruolo è un
  input con sotto "on" + una select piccola (task del progetto, "Any task" per `entry.task === ''`); "+ Add role"
  in fondo alla card. **+ Add group** (non disegnato) aggiunge una card vuota con il focus sul nome. Modello
  `entries: [{role, task}]` e pulizia in `onSave` invariati.
- **Tags · optional:** **stesso markup di `costgrid.html`** (card richiudibile, riepilogo pill da chiusa, griglia
  `.tag-group`/`.tag-pill` da aperta, `.tag-pill--inactive`, `.tags-section--readonly`), con uno stato
  `tagsCollapsed` locale (default chiuso, come Cost Grid). Logica invariata (`loadTags`, `toggleTag`,
  `tagSaving`, `tagsReadOnly`); i tag persistono subito, fuori da Save/Discard. Le regole
  `.cg-section-header`, `.cg-section-chevron(--collapsed)`, `.cg-section-title`, `.cg-section-toggle-label`,
  `.cg-tag-summary*`, `.cg-tag-groups` si **spostano** da `css/costgrid.css` a `css/style.css` con gli stessi
  nomi e gli stessi valori, senza modificare `costgrid.html`. Nessun link "Manage lists in Attribute Lists".

### 6.9 Modali (non disegnati)

`#actualsViewModal` (stesse colonne Date/Owner/Role/Task/Hours/Notes/Fee/Spent, stessi dati, `formatMoney`, conteggio
righe), New client, New program e `#confirmModal` (titoli "Confirm" / "Info", senza emoji): restyling leggero con
le classi del sito (`.modal` già sovrascritta in `style.css`, pulsanti `.ph-btn`/`.ph-btn-primary`/`.btn-danger`);
nessun cambiamento di comportamento.

## 7. Stati

| Stato | Comportamento |
|---|---|
| Viewer | Save, Discard, "+ Add …", Spread/Clear, Remove nascosti; input disabilitati come oggi; banner sotto il page head |
| Progetto collegato | Currency e stage con aspetto bloccato; Project Dashboard presente |
| Progetto senza periodo | phasing con "Set Start and End month first."; nessun pallino di bilancio |
| Progetto senza actuals | tutte le barre azzurre; Reforecast nascosto (`reforecastVisible`) |
| Progetto nuovo | (raggiungibile solo con la creazione diretta riattivata) niente Tags, niente Project Dashboard |
| Not found | stato attuale, invariato |

## 8. CSS e cache-busting

- `css/project-config.css?v=1`: solo `var(--token)`, nessun hex, nessuna emoji; prefisso di classe `pc-`. Le
  `style=""` con colori diventano classi; le altre `style=""` di layout dove possibile.
- `css/style.css`: riceve le regole del §6.8; bump di **ogni** riferimento `?v=` nel repo allo stesso numero
  (`foundations-guard`, `nav-shell-guard`). `css/costgrid.css`: bump su `costgrid.html`.
- `js/lib/config-form-calc.js` → `?v=6`; `js/lib/icons.js` → bump su ogni pagina che lo carica.

## 9. Responsive (8.4)

- **≤ 1023.98px** (sidebar a icone o navbar): l'indice diventa una fila di tab orizzontali sticky sotto il page
  head (stesso scroll, stesso `activeSection`, pallini ambra); il box Totals sparisce; nella tabella dei task
  restano Task, Hours, Total, Monthly split; periodo e numero di ruoli vanno sotto il nome; la griglia dello
  split va a capo.
- **≤ 767.98px:** una sezione alla volta. Sotto il page head un selettore "<i> / <n> · <sezione>" (con il
  pallino della sezione) apre l'elenco delle sezioni in un Bootstrap `offcanvas offcanvas-bottom` (stesso
  idioma di `.pb-sheet` in `pipeline.html`), righe da 48px; scegliere una voce imposta `mobileSection` e chiude il
  pannello. Le altre card sono nascoste con `v-show` (classe legata a un `matchMedia('(max-width: 767.98px)')`
  ascoltato in `created`/`beforeUnmount`), non smontate. Campi su una colonna, input alti 44px. Le righe dei
  task diventano card impilate ("<ore>h · <totale>" + pill); le risorse diventano card (ore × tariffa =
  subtotale); la griglia dello split scorre in orizzontale. Save/Discard restano in `.ph-actions`, che `.ph`
  già impila a questa larghezza.

## 10. Test

- **vitest, `js/lib/config-form-calc.test.js`:** `spreadEvenly` (0, 1, 3, 12, 13 mesi; somma 100; due decimali;
  l'ultimo prende il resto), `splitState` (vuoto, 100, 99,96, 100,4 valido ma "missing", 101, 50), `phasingBalance`
  (0 e 2 decimali, bilanciato e no).
- **Nuovo `js/lib/project-config-layout-guard.test.js`:** Save e Discard dentro `.ph-actions`; nessuna barra di
  salvataggio sticky e nessuna riga "Back to Portfolio"; nessuna emoji (`\p{Extended_Pictographic}`) nella pagina;
  nessun hex nella pagina e in `css/project-config.css`; `project-config.css?v=` caricato solo da questa pagina;
  il markup Tags usa `cg-section-header`, `cg-tag-summary`, `cg-tag-groups`, `tag-group`; le regole `cg-section-*`
  e `cg-tag-*` stanno in `style.css` e non più in `costgrid.css`; nessun `scrollIntoView`.
- **Guard esistenti** (§2): tutti verdi senza modificarne le asserzioni.
- **Screenshot** (decisi in brainstorming, PROCESS.md §6.3): `scripts/shoot.mjs` contro lo stack di
  `scripts/test-branch.sh` (`--base http://localhost:8081`, `--settle 3000` o attesa di un selettore), larghezze
  1440, 1024, 390, sugli stati: progetto con actuals, progetto senza periodo, progetto collegato, viewer; più task
  aperto, segmento Hours, bottom sheet aperto. I PNG si rileggono e si confrontano con le tavole; gli scostamenti
  si presentano uno per uno con fix-ora / accetta-e-registra, gli "accetta" vanno in `docs/pages/project-config.md`
  con il motivo.
- **`TEST_CASES.md`:** casi nuovi per scroll dell'indice e pallini, apertura/chiusura task, Spread evenly / Spread
  all / Clear, segmento Budget/Hours, Discard, parità Tags con Cost Grid, viewer.

## 11. Documentazione

- `docs/pages/project-config.md`: nuova sezione con layout, indice, tabella con un task aperto, Spread evenly,
  phasing unito, Discard, Tags allineato a Cost Grid, responsive.
- `CLAUDE.md`: il conteggio e l'elenco dei fogli di stile nel blocco File structure (`css/`) e la riga della
  pagina nella tabella Pages (stylesheet `css/project-config.css`); `docs/css/stylesheets.md`.
- `docs/pages/costgrid.md` / `docs/css/stylesheets.md`: dove stanno ora le regole Tags condivise.
- `docs/js/lib.md`: i tre helper nuovi di `config-form-calc.js`.

## 12. Fuori scope

- API, DB, `js/api-sync.js`, la matematica di Derive/Reforecast, le regole di money e date.
- I modali New client / New program oltre a un restyling leggero.
- Riattivare la creazione diretta (`DIRECT_PROJECT_CREATION_ENABLED` resta `false`).
- "Copy from phasing" per lo split; il link "Manage lists in Attribute Lists"; la barra di salvataggio sticky.
- Rinominare le classi `cg-*` spostate in `style.css`.

## Criteri di accettazione

1. **Page head** — `.ph` con back "Portfolio", eyebrow, badge stage/status, sub, e in `.ph-actions` Project
   Dashboard, Discard e Save; nessuna riga di pulsanti in fondo alla pagina.
2. **Discard** — dopo una modifica, Discard chiede conferma e riporta il form all'ultimo stato salvato,
   azzerando i campi invalidi; senza modifiche è disabilitato; nascosto al viewer.
3. **Indice** — un click porta alla sezione, la voce attiva segue lo scroll, i pallini ambra compaiono su Tasks,
   Monthly phasing e Pass-through costs nei casi del §6.3 con il motivo nel tooltip; Totals mostra budget, ore e
   numero di task.
4. **Tabella task** — un solo task aperto per volta; il warning unico conta i task senza split valido; Spread
   evenly, Spread all evenly e Clear producono split a somma 100 (o vuoti) rispettando le regole readonly.
5. **Phasing** — una card con Budget/Hours, un'unica coppia Derive/Reforecast, barre navy sui mesi con actuals,
   stato di bilancio corretto; Derive/Reforecast producono gli stessi valori di prima.
6. **Tags** — aspetto e comportamento identici alla sezione Tags di `costgrid.html`, che resta invariata a
   schermo.
7. **Regole invariate** — salvataggio, prompt di uscita, lock di valuta e stage, regole di date, money, rate e
   PTC si comportano come prima; tutti i guard esistenti verdi.
8. **Niente emoji, niente hex** — `project-config-layout-guard.test.js` verde.
9. **Responsive** — a 1024 indice a tab e niente Totals; a 390 una sezione alla volta con bottom sheet, input da
   44px, Save/Discard nel page head.
10. **Fedeltà** — screenshot a 1440/1024/390 confrontati con le tavole, scostamenti decisi uno per uno.

## Decisioni aperte

1. **Un solo ciclo per tutto l'handoff.** Alternativa scartata: due cicli (desktop + tablet, poi smartphone).
   Perché: scelta dell'utente in brainstorming.
2. **Project Dashboard, Discard e Save in `.ph-actions`; `.ph-back` = "Portfolio".** Alternativa scartata:
   lasciare `.ph-back` = "Project Dashboard". Perché: la tavola 8.1 mette "Project Portfolio" come back e
   Project Dashboard come pulsante a destra, e `.ph-actions` è dove `costgrid.html` tiene Save.
3. **Le regole `cg-section-*`/`cg-tag-*` si spostano da `costgrid.css` a `style.css` con gli stessi nomi.**
   Alternativa scartata: copiarle in `project-config.css` (un fork) o rinominarle (tocca `costgrid.html`).
   Perché: unica via senza fork e senza toccare il Cost Grid, al costo di un bump di `style.css` su tutte le
   pagine.
4. **`spreadEvenly` a due decimali, l'ultimo mese prende l'arrotondamento.** Alternativa scartata: interi (13 mesi
   → 7 × 12 + 16). Perché: la tolleranza del badge è 0,05 e i due decimali restano leggibili.
5. **"Spread all evenly" agisce solo sui task con split non valido, multi-mese e non completati.** Alternativa
   scartata: su tutti i task. Perché: non sovrascrive split già validi.
6. **Bottom sheet = Bootstrap `offcanvas-bottom` come `.pb-sheet` di `pipeline.html`.** Alternativa scartata: un
   pannello custom. Perché: componente già presente nel sito.
7. **Sotto 768 le sezioni non attive si nascondono con `v-show`, non si smontano.** Alternativa scartata: `v-if`.
   Perché: input, stato e guard restano intatti.
8. **Barre del phasing: navy = mesi presenti in `actuals.exportRows`, mese corrente = oggi.** Alternativa
   scartata: un nuovo stato o una chiamata API. Perché: rispetta la decisione 5 dell'handoff senza nuova API.
9. **Quattro icone nuove (`trash`, `eye`, `refresh`, `trend-up`) in `js/lib/icons.js`.** Alternativa scartata: SVG
   inline nel markup della pagina. Perché: `<ph-icon>` è l'idioma delle pagine ridisegnate; costa un bump di
   `icons.js` su ogni pagina che lo carica.
