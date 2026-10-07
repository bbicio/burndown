# Portfolio overview — Ciclo 1 (viste Card e List) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire la vista `overview` di `portfolio.html` con due layout alternativi — una griglia Card uniforme con pannello figli a tutta larghezza e una vista List ad albero — disegnati nelle tavole, senza toccare la vista `dashboard` né le API.

**Architecture:** Tutta la logica decidibile va in funzioni pure in `js/lib/portfolio-calc.js`, testate con vitest; `portfolio.html` resta una sola app Vue che le consuma. Un unico computed `portfolioRows` alimenta entrambe le viste, così il loro ordine non può divergere. Lo stile nasce in `css/portfolio.css`, caricato solo da questa pagina.

**Tech Stack:** Vue 3 da CDN senza build step, Bootstrap 5.3, vitest + jsdom per i test, CSS con i soli token di `css/tokens.css`.

**Spec:** `docs/superpowers/specs/2026-10-08-portfolio-overview-cycle1-views-design.md`

**Boards:** `docs/superpowers/design/Portfolio/6.3-portfolio-card-list.jpg` (Card), `docs/superpowers/design/Portfolio/6.3-portfolio-project-list.jpg` (List). La terza tavola, `6.3-portfolio-share-modale.jpg`, è del Ciclo 2 e **non va implementata qui**.

**Dipendenza fra i task:** i task di questo piano **non sono indipendenti** — 2 dipende dalle funzioni di 1, 3 dal modello dati di 2, 4 e 5 dal CSS e dalle icone di 3, 6 da tutti. Per PROCESS.md §6.1 la precondizione del subagent-driven (task indipendenti) **non è soddisfatta**: l'esecuzione prevista è **nativa**.

## Global Constraints

- Tutto il testo rivolto all'utente è in **inglese**. Il piano e la spec sono in italiano, il prodotto no.
- Nessun build step: nginx serve `js/` e `css/` come stanno su disco.
- Nessun letterale esadecimale in CSS o JS: solo `var(--token)` da `css/tokens.css`.
- `css/style.css` e `css/tokens.css` **non devono comparire nel diff**. Nessun token nuovo.
- `js/core.js` si modifica **solo** per aggiungere `'PDash_portfolioLayout'` al `keep` Set (Task 3). Le funzioni `pipelineBadge`, `statusBadgeLarge`, `budgetBadgeHtml` restano invariate.
- Nessuna emoji nella vista `overview`: solo SVG inline via `PfIcon` o testo.
- `#app-shell` e `#app-main` non devono ricevere `overflow`, `position`, `transform`, `filter`, `contain`, `will-change`. `v-cloak` sul root resta.
- La vista `dashboard` (`view === 'dashboard'`, righe 201–472 di `portfolio.html`) non si tocca.
- Il pulsante `+ New project` resta disabilitato e il `Dashboard` del programma resta inattivo: sono punti fermi, non difetti da correggere.
- Ogni task che produce markup **deve aprire le tavole elencate nella sua riga `Boards:`** e confrontare il proprio markup con l'immagine prima di chiudersi, dichiarando nel report cosa ha confrontato e cosa diverge.

## Review Focus

Cinque condizioni che la spec implica ma che nessun task esercitava: ciascuna ha ora il suo test nel task che possiede il codice.

1. **`localStorage` con un valore non valido o assente** per `PDash_portfolioLayout` (`null`, `''`, `'grid'`, o un accesso che lancia in finestra privata): la pagina deve aprirsi in Card, non vuota. → Task 1, `readLayoutPreference`.
2. **Il programma aperto sparisce per effetto di un filtro:** `expandedProgramId` resta puntato a un id non più presente e il pannello figli diventa orfano. Deve tornare `null`. → Task 1, `resolveExpandedProgramId`.
3. **Passaggio da List a Card:** la griglia non è montata mentre si è in List, quindi il `ResizeObserver` non ha mai misurato nulla e `gridColumns` è il default. Le colonne vanno ricalcolate quando la griglia compare. → Task 1 `columnsForWidth` per il calcolo, Task 4 per la rimisurazione al cambio layout.
4. **Venduto maggiore di zero e speso uguale a zero:** è `0% spent` con barra vuota, **non** `No budget` — che vale solo quando manca il venduto. → Task 1, `spentPercent` / `spentBarState`.
5. **Programma con figli in valute diverse:** `commonCurrency` ripiega su EUR, quindi i totali del programma sono etichettati EUR mentre i figli mostrano la propria valuta. È il comportamento attuale e la spec lo conserva, ma va pinnato perché non cambi in silenzio. → Task 1, test di caratterizzazione su `commonCurrency`.

---

## File Structure

| File | Responsabilità | Task |
|---|---|---|
| `js/lib/portfolio-calc.js` | Funzioni pure nuove, accanto a quelle esistenti | 1 |
| `js/lib/portfolio-calc.test.js` | Test delle funzioni pure (file esistente, si estende) | 1 |
| `portfolio.html` — blocco `data`/`computed`/`methods` | Stato nuovo, filtri, `portfolioRows`, correzione di `cardData()` | 2 |
| `portfolio.html` — template `overview` | Header, toolbar, vista Card, vista List | 3, 4, 5 |
| `css/portfolio.css` | Tutto lo stile della overview, prefisso `.pf-*` | 3, 4, 5 |
| `js/core.js` | Una riga: la chiave nel `keep` Set | 3 |
| `js/lib/portfolio-guard.test.js` | Guard di isolamento, ricalcato su `pipeline-guard.test.js` | 6 |
| `docs/pages/portfolio.md`, `CLAUDE.md` | Documentazione | 6 |

---

### Task 1: Funzioni pure e loro test

**Files:**
- Modify: `js/lib/portfolio-calc.js` (aggiunte in coda, prima del blocco dei bridge `window.*`)
- Test: `js/lib/portfolio-calc.test.js` (file esistente)

**Boards:** nessuna — task di sola logica. Le soglie 85/100 vengono dalla spec §6.3, a sua volta verificata sulle tavole.

**Interfaces:**
- Consumes: `commonCurrency(cfgs)`, già in questo file.
- Produces, tutte esportate e con il bridge `window.<nome> = <nome>` come le esistenti:
  - `buildPortfolioRows(rows: Row[], sortMode: 'client'|'name') -> Row[]`
  - `spentPercent(spent: number, sold: number) -> number|null`
  - `spentBarState(pct: number|null) -> 'none'|'normal'|'warning'|'danger'`
  - `programAtRisk(children: {status?: string}[]) -> number`
  - `readLayoutPreference(raw: string|null) -> 'card'|'list'`
  - `columnsForWidth(width: number) -> 1|2|3`
  - `resolveExpandedProgramId(currentId: string|null, rows: Row[]) -> string|null`
  - dove `Row` è `{ kind: 'program'|'project', id: string, name: string, clientName: string, ... }`

- [ ] **Step 1: Scrivere i test che falliscono**

In `js/lib/portfolio-calc.test.js`, un `describe` per funzione. Assertion richieste:

```js
// buildPortfolioRows
// sortMode 'client': cliente asc, poi programmi prima dei progetti a parità di cliente, poi nome
const rows = [
  { kind: 'project', id: 'p1', name: 'TEST PROPOSAL', clientName: 'Bayer AG' },
  { kind: 'project', id: 'p2', name: 'BERMITS', clientName: 'Bayer AG' },
  { kind: 'program', id: 'g1', name: 'Field Force', clientName: 'Bayer AG' },
  { kind: 'project', id: 'p3', name: 'Pharmacovigilance', clientName: 'Angelini Pharma' },
];
expect(buildPortfolioRows(rows, 'client').map(r => r.id))
  .toEqual(['p3', 'g1', 'p2', 'p1']);
// sortMode 'name': solo il nome, programmi e progetti indistinti
expect(buildPortfolioRows(rows, 'name').map(r => r.name))
  .toEqual(['BERMITS', 'Field Force', 'Pharmacovigilance', 'TEST PROPOSAL']);
// clientName vuoto ordina prima, senza lanciare
expect(() => buildPortfolioRows([{ kind: 'project', id: 'x', name: 'X', clientName: '' }], 'client')).not.toThrow();
// non muta l'array in ingresso
const input = [...rows]; buildPortfolioRows(input, 'client'); expect(input).toEqual(rows);

// spentPercent — Review Focus 4
expect(spentPercent(0, 1000)).toBe(0);        // venduto senza speso: 0%, non null
expect(spentPercent(500, 1000)).toBe(50);
expect(spentPercent(1200, 1000)).toBe(120);
expect(spentPercent(100, 0)).toBeNull();       // niente venduto: nessuna percentuale
expect(spentPercent(100, null)).toBeNull();
expect(spentPercent(100, undefined)).toBeNull();

// spentBarState — confini esatti
expect(spentBarState(null)).toBe('none');
expect(spentBarState(0)).toBe('normal');
expect(spentBarState(84)).toBe('normal');
expect(spentBarState(85)).toBe('warning');
expect(spentBarState(100)).toBe('warning');
expect(spentBarState(101)).toBe('danger');

// programAtRisk — grafia esatta di statusFilterOptions
expect(programAtRisk([{ status: 'Started At Risk' }, { status: 'Started' }, {}])).toBe(1);
expect(programAtRisk([])).toBe(0);

// readLayoutPreference — Review Focus 1
expect(readLayoutPreference('list')).toBe('list');
expect(readLayoutPreference('card')).toBe('card');
expect(readLayoutPreference(null)).toBe('card');
expect(readLayoutPreference('')).toBe('card');
expect(readLayoutPreference('grid')).toBe('card');

// columnsForWidth — Review Focus 3
expect(columnsForWidth(1200)).toBe(3);
expect(columnsForWidth(1000)).toBe(3);
expect(columnsForWidth(999)).toBe(2);
expect(columnsForWidth(640)).toBe(2);
expect(columnsForWidth(639)).toBe(1);
expect(columnsForWidth(0)).toBe(1);

// resolveExpandedProgramId — Review Focus 2
const live = [{ kind: 'program', id: 'g1', name: 'A', clientName: 'C' }];
expect(resolveExpandedProgramId('g1', live)).toBe('g1');
expect(resolveExpandedProgramId('gone', live)).toBeNull();
expect(resolveExpandedProgramId(null, live)).toBeNull();
// un progetto con lo stesso id non conta come programma
expect(resolveExpandedProgramId('p1', [{ kind: 'project', id: 'p1', name: 'P', clientName: 'C' }])).toBeNull();

// commonCurrency — caratterizzazione, Review Focus 5
expect(commonCurrency([{ currency: 'CHF' }, { currency: 'CHF' }])).toBe('CHF');
expect(commonCurrency([{ currency: 'CHF' }, { currency: 'USD' }])).toBe('EUR');
```

- [ ] **Step 2: Lanciare i test per verificare che falliscano**

Run: `npx vitest run js/lib/portfolio-calc.test.js`
Expected: FAIL, le funzioni nuove non sono definite (`commonCurrency` passa già).

- [ ] **Step 3: Implementare le sette funzioni in `js/lib/portfolio-calc.js`**

Firme nell'Interfaces block sopra. Note dove la firma non basta:
- `buildPortfolioRows` ordina una **copia** (`[...rows]`), confronta i nomi con `localeCompare` e, per `'client'`, usa come chiave intermedia `kind === 'program' ? 0 : 1`.
- `columnsForWidth` usa le soglie `>= 1000` e `>= 640` della spec §13.
- Aggiungere il bridge `window.<nome> = <nome>` per ciascuna, accanto a quelli esistenti in fondo al file.

- [ ] **Step 4: Lanciare i test per verificare che passino**

Run: `npx vitest run js/lib/portfolio-calc.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib/portfolio-calc.js js/lib/portfolio-calc.test.js
git commit -m "feat(portfolio): pure helpers for the overview redesign"
```

---

### Task 2: Stato, filtri, `portfolioRows` e correzione di `cardData()`

Solo il blocco script di `portfolio.html`. Il markup resta quello attuale e deve continuare a funzionare a fine task: è il passo che rende sicuro il resto.

**Files:**
- Modify: `portfolio.html` (blocco `data()`, `computed`, `methods`; adeguamenti minimi al markup dei filtri)

**Boards:** nessuna — task di sola logica.

**Interfaces:**
- Consumes: tutte le funzioni di Task 1 via i bridge `window.*`.
- Produces: `portfolioRows` (computed), e lo stato `portfolioLayout`, `portfolioStageFilter`, `portfolioClientFilter` (ora array), `expandedProgramId`, `listExpandedPrograms`, `gridColumns`, consumati dai Task 3–5.

- [ ] **Step 1: Aggiornare `data()`**

Secondo la tabella della spec §5: aggiungere `portfolioLayout` (inizializzato con `readLayoutPreference(localStorage.getItem('PDash_portfolioLayout'))` dentro un `try/catch` che ripiega su `'card'`), `portfolioStageFilter: []`, `expandedProgramId: null`, `listExpandedPrograms: new Set()`, `gridColumns: 3`; cambiare `portfolioClientFilter` da `''` a `[]`; rimuovere `expandedPrograms`.

- [ ] **Step 2: Aggiornare i filtri**

In `sortedFilteredProjects`: il filtro cliente diventa `!this.portfolioClientFilter.length || this.portfolioClientFilter.includes(p.clientId)`; si aggiunge il filtro stadio `!this.portfolioStageFilter.length || this.portfolioStageFilter.includes(getProjectPipeline(p.id) || p.pipeline)`. Ricerca e stato **invariati**, compreso `p.status || 'Not started yet'`.
Aggiornare di conseguenza `portfolioFiltersActive` (il cliente ora è un array) e `clearPortfolioFilters` (azzera anche `portfolioStageFilter`).
Aggiungere il computed `stageFilterOptions` che ritorna `['SIP', 'Expected', 'Anticipated', 'Committed', 'Canceled']`.

- [ ] **Step 3: Aggiungere il computed `portfolioRows`**

Costruisce le righe nella forma della spec §6.2 da `visibleProgramGroups` (`kind: 'program'`, `clientName` = `prog.domClientName`, `stats`/`duration` da `programStatsMap[prog.id]`, `pipeline` = `prog.domPipeline`, `atRisk` = `programAtRisk(prog.children)`) e da `ungroupedProjects` (`kind: 'project'`, `clientName` = `getClientName(cfg.clientId)` vuoto se `'__unassigned__'`, `card` = `cardDataMap[cfg.id]`), poi ritorna `buildPortfolioRows(rows, this.portfolioSort)`.

Aggiungere il computed `expandedProgram`, che ritorna la riga programma corrispondente a `resolveExpandedProgramId(this.expandedProgramId, this.portfolioRows)`, oppure `null`.

- [ ] **Step 4: Correggere `cardData()`**

Rimuovere il `return null` anticipato: la funzione ritorna sempre un oggetto, con in più `hasDuration` (`months.length > 0`). Quando `hasDuration` è falso i totali restano `0`; `hasData` e `hasPhasing` conservano il significato attuale. Rimuovere i due `v-if="cardDataMap[cfg.id]"` dal markup esistente e gatear i valori secondo la tabella della spec §6.4.

- [ ] **Step 5: Aggiornare i tre `<select>`/dropdown dei filtri nel markup attuale**

Il filtro Client passa da `<select>` a dropdown con checkbox sul modello di quello Status già presente (prefisso id `flt-client-`); si aggiunge il dropdown Stage (prefisso `flt-stage-`). È una modifica provvisoria: il Task 3 li riscrive nella toolbar nuova, ma la pagina deve restare usabile a ogni commit.

- [ ] **Step 6: Verificare che la suite non regredisca**

Run: `npm test`
Expected: PASS, nessun test nuovo rotto (`nav-shell-guard` e `foundations-guard` compresi).

- [ ] **Step 7: Commit**

```bash
git add portfolio.html
git commit -m "feat(portfolio): row model, stage filter, multi-client filter, dateless projects"
```

---

### Task 3: `portfolio.css`, `PfIcon`, header e toolbar

**Files:**
- Create: `css/portfolio.css`
- Modify: `portfolio.html` (`<head>`, template della testata e della toolbar, registrazione del componente)
- Modify: `js/core.js` (una riga: il `keep` Set)

**Boards:** `docs/superpowers/design/Portfolio/6.3-portfolio-card-list.jpg` e `6.3-portfolio-project-list.jpg` — la testata e la toolbar sono identiche nelle due. **Aprirle entrambe e confrontare prima di chiudere il task.**

**Interfaces:**
- Consumes: lo stato di Task 2.
- Produces: il componente `PfIcon` (prop `name`), le classi `.pf-*` di base e i token di layout usati dai Task 4 e 5.

- [ ] **Step 1: Aggiungere la chiave al `keep` Set di `js/core.js`**

`'PDash_portfolioLayout'` dentro il `Set` alla riga 4. Senza questo `cleanLegacyStorage()` cancella la preferenza al caricamento successivo — è quanto accadde a `PDash_cgCompactHeader`.

- [ ] **Step 2: Creare `css/portfolio.css` e linkarlo**

`<link rel="stylesheet" href="css/portfolio.css?v=1">` in `portfolio.html`, dopo `style.css`. Contiene per ora le variabili locali, la testata e la toolbar. Solo `var(--token)`.

- [ ] **Step 3: Aggiungere il componente `PfIcon`**

Nel blocco `<script type="module">` di `portfolio.html`, accanto a `ExportButtons`, e registrarlo in `components`. Prop `name`; SVG inline `stroke="currentColor"`, `aria-hidden="true"`, dimensione 16px di default. Nomi: `search`, `chevron-right`, `chevron-down`, `grid`, `list`, `gear`, `arrow-right`, `close`.

- [ ] **Step 4: Riscrivere testata e toolbar**

Secondo la spec §9: titolo, sottotitolo `N programs · N projects` (computed nuovo `portfolioCounts`), `+ New Project` magenta **disabilitato** con il `<span>` esterno e il tooltip, ricerca con icona, i tre dropdown a checkbox con badge, `Sort` con le etichette `Client A–Z` e `Alphabetical`, segmentato `Card | List`, `Clear filters` come link neutro. Rimuovere il sottotitolo «Budget Spent vs Estimated by month…».

Aggiungere il method `setLayout(v)` che assegna `portfolioLayout` e scrive `localStorage['PDash_portfolioLayout']` dentro un `try/catch`.

- [ ] **Step 5: Preservare i due stati vuoti (spec §10)**

Riscrivendo quest'area non vanno persi né il blocco `v-if="!projects.length"` con i suoi **due** rami di `directCreationEnabled`, né `No projects match the current filters.`, che ora si valuta su `portfolioRows.length`. I testi restano **parola per parola** quelli attuali.

- [ ] **Step 6: Confronto con le tavole**

Aprire le due immagini elencate in `Boards:` e confrontare testata e toolbar con il proprio markup. Annotare ogni scostamento nel report del task.

- [ ] **Step 7: Verificare**

Run: `npm test`
Expected: PASS. `foundations-guard` fallisce se il `?v=` di `core.js` non concorda fra le pagine: il bump globale è del Task 6, quindi qui `core.js` **non** va bumpato.

- [ ] **Step 8: Commit**

```bash
git add css/portfolio.css portfolio.html js/core.js
git commit -m "feat(portfolio): new header and toolbar, PfIcon, portfolio.css"
```

---

### Task 4: Vista Card

**Files:**
- Modify: `portfolio.html` (template della vista Card, methods del toggle e del `ResizeObserver`)
- Modify: `css/portfolio.css`

**Boards:** `docs/superpowers/design/Portfolio/6.3-portfolio-card-list.jpg` — **aprirla e confrontare** card progetto, card programma e pannello figli prima di chiudere il task.

**Interfaces:**
- Consumes: `portfolioRows`, `expandedProgram`, `gridColumns` (Task 2); `PfIcon` e le classi di base (Task 3); `spentPercent`, `spentBarState`, `columnsForWidth` (Task 1).
- Produces: nulla per i task successivi.

- [ ] **Step 1: Sostituire la griglia Bootstrap con la griglia Card**

Rimuovere `div.row.g-3.mb-4` con i `col-md-6` e i `section-card` dai bordi viola. Nuova griglia su `--pf-cols`, suddivisa in blocchi di `gridColumns` righe; dopo il blocco che contiene `expandedProgram` si inserisce il pannello figli con `grid-column: 1 / -1`. Struttura delle card e del pannello: spec §7.

- [ ] **Step 2: Montare il `ResizeObserver`**

In `mounted()`, osservare il contenitore della griglia e assegnare `gridColumns = columnsForWidth(entry.contentRect.width)`, scrivendo anche `--pf-cols` sul contenitore. Disconnettere in `beforeUnmount`. **Review Focus 3:** rimisurare quando si torna in Card da List, dove il contenitore non era montato — un `watch` su `portfolioLayout` che riaggancia l'observer in `$nextTick`.

- [ ] **Step 3: Toggle a uno alla volta**

Sostituire `toggleProgramExpanded(id)`: assegna `expandedProgramId = (this.expandedProgramId === id ? null : id)`. Aprire un programma chiude il precedente. A filtri attivi il toggle è l'etichetta non interattiva `Shown (filtered)` e i figli sono sempre visibili.

- [ ] **Step 4: Stati disabilitati**

`Dashboard` del programma e `Program Dashboard →` nel pannello: `disabled`, `title="Program Dashboard — coming soon"`, nessun `@click`. `Configure` solo se `cfg.my_permission !== 'viewer'`. `Dashboard` del progetto chiama `showDashboard(cfg.id)`.

- [ ] **Step 5: Confronto con la tavola**

Aprire `6.3-portfolio-card-list.jpg` e confrontarla con il proprio markup: etichette, pillole, griglia 2×2, barra, footer, effetto impilato della card programma, pannello figli a 4 colonne. Annotare gli scostamenti nel report.

- [ ] **Step 6: Verificare**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add portfolio.html css/portfolio.css
git commit -m "feat(portfolio): card view with full-width children panel"
```

---

### Task 5: Vista List

**Files:**
- Modify: `portfolio.html` (template della vista List)
- Modify: `css/portfolio.css`

**Boards:** `docs/superpowers/design/Portfolio/6.3-portfolio-project-list.jpg` — **aprirla e confrontare** intestazione, riga programma e riga figlio prima di chiudere il task.

**Interfaces:**
- Consumes: `portfolioRows`, `listExpandedPrograms` (Task 2); `PfIcon` (Task 3); `spentPercent`, `spentBarState` (Task 1).

- [ ] **Step 1: Costruire la tabella a griglia**

`v-if="portfolioLayout === 'list'"`, alternativa alla griglia Card. Colonne e contenuti: spec §8. Griglia CSS, non `<table>`. Intestazione a fondo grigio con etichette maiuscole spaziate.

- [ ] **Step 2: Righe programma e figli**

Chevron che commuta l'id in `listExpandedPrograms` (più programmi aperti insieme). Colonna Status testuale: `N at risk` se `row.atRisk > 0`, altrimenti `N projects`, resa in **navy scuro, non in rosso** — la tavola prevale sul brief. Riga figlio: rientro 30px, fondo leggermente grigio, celle Stage e Duration **vuote**, nessun `Configure`.

- [ ] **Step 3: Azioni**

Programma: `Share` che chiama `openShareModal('program', row.id, row.name)` — la modale attuale, la nuova è del Ciclo 2 — e `Dashboard →` disabilitato col tooltip. Progetto e figlio: `Dashboard →` che chiama `showDashboard`.

- [ ] **Step 4: Responsive della List**

Sotto 1024px si nascondono le colonne `Duration` e `Spent`, con le varianti `html[data-sidebar="collapsed"]` come nel ciclo Pipeline.

- [ ] **Step 5: Confronto con la tavola**

Aprire `6.3-portfolio-project-list.jpg` e confrontarla con il proprio markup. Annotare gli scostamenti nel report.

- [ ] **Step 6: Verificare**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add portfolio.html css/portfolio.css
git commit -m "feat(portfolio): list view"
```

---

### Task 6: Guard test, cache-busting e documentazione

**Files:**
- Create: `js/lib/portfolio-guard.test.js`
- Modify: tutte le pagine che referenziano `js/core.js` (18) e `portfolio.html` per `portfolio-calc.js`
- Modify: `docs/pages/portfolio.md`, `CLAUDE.md`

**Boards:** nessuna.

- [ ] **Step 1: Scrivere `js/lib/portfolio-guard.test.js`**

Ricalcato su `js/lib/pipeline-guard.test.js`. Asserzioni: `portfolio.css` è linkato dalla sola `portfolio.html`; nessun letterale esadecimale in `css/portfolio.css`; nessuna emoji nel template della vista `overview`; ogni referenza a `portfolio.css` è `?v=1`.

- [ ] **Step 2: Lanciarlo e vederlo fallire se un'asserzione non regge**

Run: `npx vitest run js/lib/portfolio-guard.test.js`
Expected: PASS se i Task 3–5 hanno rispettato i vincoli; un fallimento qui è un difetto reale da correggere, non il test da ammorbidire.

- [ ] **Step 3: Bump delle versioni**

`js/lib/portfolio-calc.js` da `?v=4` a `?v=5` in `portfolio.html` (unica referenza, verificata). `js/core.js` da `?v=12` a `?v=13` in **tutte** le 18 pagine che lo caricano. Verificare con `grep -rn "core\.js?v=" --include=*.html .` che non resti alcuna occorrenza a 12.

**Attenzione:** non modificare l'HTML con `Get-Content`/`Set-Content` di PowerShell — aggiungono un BOM. Usare gli strumenti di edit o `sed`.

- [ ] **Step 4: Aggiornare la documentazione**

`docs/pages/portfolio.md`: sezione nuova sulle due viste, con **gli scostamenti accettati dalle tavole e il loro motivo** (spec §18) — altrimenti riemergono come difetti al ciclo successivo. `CLAUDE.md`: `css/portfolio.css` nella file structure e la riga della pagina Portfolio nella tabella delle Pages.

- [ ] **Step 5: Suite completa**

Run: `npm test`
Expected: PASS, `foundations-guard` compreso.

- [ ] **Step 6: Commit**

```bash
git add js/lib/portfolio-guard.test.js docs/pages/portfolio.md CLAUDE.md *.html
git commit -m "test(portfolio): isolation guard; chore: cache-bust and docs"
```

---

## Verifica visiva (dopo il Task 6, prima di `/finish-cycle`)

Non è un task del piano e **non va assegnata a un esecutore senza browser**. La esegue chi ha lo strumento.

```bash
scripts/test-branch.sh up
node scripts/shoot.mjs --url /portfolio.html --out shots/portfolio \
  --base http://localhost:8081 --widths 1440,1024,390 --settle 3000
```

Stati da catturare: Card con tutti i programmi chiusi, Card con un programma aperto, List con un programma aperto, e un giro a filtri attivi (gli ultimi tre via `--eval`). I PNG vanno **riletti con `Read` e confrontati** con le due tavole; il risultato si presenta come elenco di scostamenti, uno per uno, con una proposta fix-ora / accetta-e-registra, aspettando la decisione.

Il ciclo si chiude con `/finish-cycle`, mai con `superpowers:finishing-a-development-branch`.
