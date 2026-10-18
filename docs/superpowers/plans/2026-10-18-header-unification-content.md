# Header unification ciclo 2 — contenuto sotto l'header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** card, tile, banner, sfondo e spaziature sotto la banda uguali su tutte le pagine in scope, letti da token comuni, più B-096/B-099/B-100/B-101 e le icone della toolbar di planning.

**Architecture:** token di componente nuovi in `css/tokens.css`; le classi esistenti di ogni pagina li leggono al posto dei letterali. Un guard nuovo (`js/lib/content-surface-guard.test.js`) pinna token, assenza di letterali, deduplica e immutabilità delle pagine escluse.

**Tech Stack:** CSS, HTML statico + Vue 3 da CDN, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-18-header-unification-content-design.md`
**Branch:** `header-unification-content`
**Risk class:** high-risk — file condivisi caricati da più pagine (`css/tokens.css`, `css/style.css`, `css/admin-crud.css`, `js/lib/icons.js`).

**Indipendenza dei task:** i task NON sono indipendenti: 2-7 leggono i token del Task 1 e quasi tutti toccano `css/style.css` e il guard del Task 1. Vanno eseguiti in ordine.

## Global Constraints

- Nessun cambio funzionale; testo visibile in inglese.
- Pagine escluse, che non devono cambiare: `master-*.html`, `project-config.html`, `login.html`, `activate.html`, `reset-password.html`, `terms.html`; card kanban `.pb-card`; tabelle, form, modali, grafici, contenuto interno delle card; le copie inline di `.card` in `timesheets.html` e `_terms-editor.html`.
- Le regole globali di `.alert` di Bootstrap (`css/style.css` righe 439-442) e `.cfg-section` (righe 338-339) non cambiano.
- Niente hex, `rgb(a)`, px o rem letterali nelle regole toccate, tranne la definizione di `--tile-value-size: 1.375rem` in `tokens.css`.
- HTML modificati solo con lo strumento Edit (mai `Get-Content`/`Set-Content`: aggiunge il BOM).
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`.
- Ogni coppia testo/sfondo in `tokens.css` ≥ 4.5:1 (`js/lib/tokens.test.js`).
- Durante i task si lanciano solo i file di test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Worktree: `git worktree add .claude/worktrees/header-unification-content -b header-unification-content` dal checkout principale, poi copia di `.env` e `npm ci` (PROCESS.md §6.1b, §6.2).

## Review Focus

1. **Pagine escluse renderizzate identiche.** project-config e master-clients a 1440 devono essere uguali a `main`, anche se caricano `tokens.css` e `style.css` cambiati. Pinnato dall'impronta del Task 1 e dagli scatti del Task 8.
2. **Toggle Full width/Compact di planning.** In entrambi gli stati la banda e il contenuto partono dallo stesso x (12px in full width, 24px in compact). Task 4, scatto del Task 8 con `--eval` che clicca il toggle.
3. **Phone (375px) sulle pagine diverse da pipeline.** Le bande vanno in colonna senza scroll orizzontale. Pipeline resta com'era. Dentro `.app-container` il padding laterale della banda vale `--app-pad` anche sul phone (vedi Decisioni aperte, voce 5). Task 5, scatti del Task 8.
4. **CTA primaria disabilitata e alta 32px** (`+ New Project` del portfolio, disabilitato). Resta pallida e alta come `.ph-btn`, e sul phone sale a 44px. Task 5.
5. **Banner del cost grid locked e draft.** Mantengono colori e bordo, cambiano solo raggio, padding e corpo del testo. Il link "Delete version" del draft resta allineato a destra. Task 3, scatto del Task 8 su una versione draft.

---

### Task 1: token di componente e guard

**Files:**
- Modify: `css/tokens.css` (blocco `:root`, dopo `--shadow-xl`, riga 164)
- Create: `js/lib/content-surface-guard.test.js`

**Interfaces:**
- Produces: i token di Spec §2 con quei nomi esatti; in `content-surface-guard.test.js` gli helper `rule(text, selector) -> string|null` (corpo della prima regola il cui selettore è esattamente `selector`) e `LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b\d*\.?\d+(px|rem)\b/`, che i task 2-7 usano per aggiungere i propri `describe`.

- [ ] **Step 1: scrivere il test che fallisce**

`describe('component tokens')`: per ciascuno dei 14 token di Spec §2, `tokens.css` contiene `--<nome>: <valore>;` con il valore della spec (es. `--card-border: 1px solid var(--border-light);`, `--tile-value-size: 1.375rem;`, `--content-gap: var(--space-4);`).

`describe('excluded pages are untouched')`: per `master-clients.html`, `master-client-groups.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` e `project-config.html`, lo sha256 del contenuto di tutti i `<style>` inline è uguale a una costante `EXCLUDED_STYLE_SHA`. Inoltre il corpo di `.cfg-section` in `css/style.css` è identico alla stringa di `main`: `background: var(--surface-light); border-radius: var(--radius-md); padding: 16px 18px; margin-bottom: 1rem;`.

Helper `rule` testato su due casi: `rule('.a{x:1}.ab{y:2}', '.a')` → `'x:1'`; `rule('.ab{y:2}', '.a')` → `null`.

- [ ] **Step 2: calcolare le impronte**

Run: `node -e "const c=require('crypto'),f=require('fs');for(const p of ['master-clients.html','master-client-groups.html','master-pipelines.html','master-roles.html','master-currencies.html','project-config.html']){const s=[...f.readFileSync(p,'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');console.log(p,c.createHash('sha256').update(s).digest('hex'))}"`
Copiare gli hash in `EXCLUDED_STYLE_SHA`, calcolati prima di qualunque modifica.

- [ ] **Step 3: eseguire il test e verificare che fallisca**

Run: `npx vitest run js/lib/content-surface-guard.test.js`
Expected: FAIL solo su `component tokens`.

- [ ] **Step 4: aggiungere i 14 token in `css/tokens.css`**, con un commento di sezione `/* Component surfaces (2026-10, header unification cycle 2) */`.

- [ ] **Step 5: eseguire i test**

Run: `npx vitest run js/lib/content-surface-guard.test.js js/lib/tokens.test.js`
Expected: PASS.

- [ ] **Step 6: commit** — `feat(tokens): component surface tokens + content-surface guard`

### Task 2: card e tile

**Files:**
- Modify: `css/style.css:275-281` (cancellare `.kpi-card*`), `css/style.css:300-311` (`.section-card`, `.section-header`)
- Modify: `css/costgrid.css:327-335` (`.cg-grid-card-header` padding)
- Modify: `css/portfolio.css:53-57` (`.pf-card`), `:255-264` (`.pg-tile*`), `:281-287` (`.pg-card*`), `:485-487` (`.pr-kpis`), `:498-505` (`.pr-card`, `.pr-card-head`)
- Modify: `css/admin-crud.css:6` (`.card`)
- Modify: `_db-reset.html:21-30` (`.danger-card` inline)
- Test: `js/lib/content-surface-guard.test.js`

**Interfaces:**
- Consumes: token del Task 1, helper `rule`, `LITERAL`.

- [ ] **Step 1: test che falliscono** — `describe('cards and tiles')`:
  - `rule(style.css,'.section-card')` contiene `var(--card-bg)`, `var(--card-border)`, `var(--card-radius)`, `var(--card-shadow)`;
  - `rule(style.css,'.section-header')` contiene `var(--card-head-pad)`;
  - `.pg-card`, `.pr-card`, `.pf-card` in `portfolio.css` contengono `var(--card-border)` e `var(--card-radius)`;
  - `.pg-card` e `.pf-card` contengono `var(--card-pad)`, `.pr-card-head` e `.cg-grid-card-header` contengono `var(--card-head-pad)`;
  - `.card` in `admin-crud.css` contiene `var(--card-border)`, `var(--card-radius)`, `var(--card-shadow)`;
  - `.danger-card` inline di `_db-reset.html` contiene `var(--card-danger-border)`, `var(--card-radius)`, `var(--card-pad)`; `.danger-card h5` contiene `var(--color-danger-text)`, `.danger-card p` contiene `var(--text-muted)`;
  - `.pg-tile` contiene `var(--tile-pad)`, `.pg-tile-label` contiene `var(--tile-label-size)`, `.pg-tile-value` contiene `var(--tile-value-size)`;
  - `rule(portfolio.css,'.pr-kpis .pg-tile')` è `null` oppure non contiene `padding`; `rule(portfolio.css,'.pr-kpis .pg-tile-value')` non contiene `font-size`;
  - nessuno dei corpi sopra fa match con `LITERAL`;
  - `style.css` non contiene `.kpi-card`.
- [ ] **Step 2: run** `npx vitest run js/lib/content-surface-guard.test.js` → FAIL su `cards and tiles`.
- [ ] **Step 3: implementare.** Nelle regole elencate si sostituiscono le proprietà: `.section-card` prende anche `border`, `.pf-card` perde `--border-medium`. Nelle regole del summary fissato di `portfolio.html` riga 104-105 (stile inline) non si tocca niente. Se `.pr-kpis .pg-tile` resta vuota si cancella.
- [ ] **Step 4: run** lo stesso comando → PASS.
- [ ] **Step 5: commit** — `style: cards and KPI tiles read the component tokens`

### Task 3: banner e alert

**Files:**
- Modify: `css/style.css` (aggiungere `.alert-sm` dopo la riga 442)
- Modify: `css/admin-crud.css:25`, `timesheets.html:32`, `_terms-editor.html:15` (cancellare `.alert-sm`)
- Modify: `css/costgrid.css:110-119` (`.cg-banner`)
- Modify: `costgrid.html:25`, `planning.html:34`, `_db-reset.html:51`, `_db-reset.html:53` (aggiungere la classe `alert-sm`, le utility di margine esistenti restano)
- Test: `js/lib/content-surface-guard.test.js`

- [ ] **Step 1: test che falliscono** — `describe('banners and alerts')`:
  - `rule(style.css,'.alert-sm')` = font-size `var(--banner-font-size)`, padding `var(--banner-pad)`, border-radius `var(--banner-radius)`;
  - fra `css/*.css` (escluso `auth.css`) e gli inline `<style>` delle pagine in scope, `.alert-sm {` compare una volta sola. Pagine in scope = pagine con `initNav(` meno master-* e `project-config.html`;
  - `.cg-banner` contiene `var(--banner-radius)`, `var(--banner-pad)`, `var(--banner-font-size)`, `var(--content-gap)` e nessun `LITERAL`;
  - `costgrid.html` e `planning.html` hanno `class="alert alert-danger alert-sm m-4"`;
  - `_db-reset.html` ha `alert-sm` sui due alert delle righe 51 e 53.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implementare** (`.cg-banner`: `gap: 10px` → `var(--space-2)`).
- [ ] **Step 4: run** → PASS. Eseguire anche il blocco `excluded pages are untouched`: le master-* tengono la loro `.alert-sm` inline e l'impronta non cambia.
- [ ] **Step 5: commit** — `style: one .alert-sm, banners read the component tokens`

### Task 4: sfondo, font, spaziature, B-100

**Files:**
- Modify: `css/admin-crud.css:4-5` (cancellare la regola `body`; `.page` → `margin: var(--content-gap) auto`)
- Modify: `settings.html:13-14` (cancellare `body` e `.page` inline: la pagina carica `admin-crud.css`)
- Modify: `timesheets.html:12,15`, `_db-reset.html:12-13`, `_terms-editor.html:12-13` (cancellare `body`; `.page` → `margin: var(--content-gap) auto`)
- Modify: `css/style.css:100-108` (padding laterale della banda e `margin-bottom`)
- Modify: `portfolio.html:15`, `program.html:15` (cancellare `.app-container { --app-pad: 12px; }`; se lo `<style>` resta vuoto si cancella)
- Test: `js/lib/content-surface-guard.test.js`

- [ ] **Step 1: test che falliscono** — `describe('page surface and spacing')`:
  - nessuna pagina in scope e nessun `css/admin-crud.css` ha una regola `body` con `background` o `font-family`;
  - ogni regola `.page` (admin-crud e inline) contiene `var(--content-gap)` e nessun `LITERAL`;
  - `rule(style.css,'.app-container > .ph, .app-container > .ph-toolbar')` contiene `padding-left: var(--app-pad)` e `padding-right: var(--app-pad)`;
  - le regole `.app-container .ph:not(:has(+ .ph-toolbar))` e `.app-container .ph-toolbar` contengono `margin-bottom: var(--content-gap)`;
  - `portfolio.html` e `program.html` non contengono `--app-pad:`.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implementare.** `body.pp-fullwidth` (`style.css` riga 461) non cambia: la banda lo segue tramite `--app-pad`.
- [ ] **Step 4: run** `npx vitest run js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 5: commit** — `style: one page background and band-to-content gap; band follows --app-pad (B-100)`

### Task 5: header phone e altezza CTA (B-096, B-101)

**Files:**
- Modify: `css/pipeline.css:250-260` (togliere le regole `.ph`, `.ph-title`, `.ph-sub`, `.ph-side`, `.ph-btn-primary`, `.ph-toolbar`; restano le `.pb-*`)
- Modify: `css/style.css:76-80` (`.ph-btn-primary`), blocco `@media (max-width: 767.98px)` dopo la riga 118
- Test: `js/lib/page-head-guard.test.js`

- [ ] **Step 1: test che falliscono** in `page-head-guard.test.js`, dentro il `describe` delle regole condivise:
  - `style.css` ha, nel blocco `@media (max-width: 767.98px)`, `.ph { flex-direction: column; …; padding: var(--space-3) var(--space-4); position: relative; }`, `.ph-title { font-size: 20px; }`, `.ph-sub { display: none; }`, `.ph-side { width: 100%; justify-content: space-between; gap: var(--space-3); }`, `.ph-btn-primary { min-height: 44px; … }` e `.ph-toolbar { flex-wrap: nowrap; padding: var(--space-2) var(--space-4); }`. I valori sono quelli copiati da `pipeline.css`;
  - `pipeline.css` non contiene più un selettore che inizia con `.ph` (`hasSelector` per ognuna delle sei classi);
  - `rule(style.css,'.ph-btn-primary')` contiene `display: inline-flex`, `align-items: center`, `height: 32px`, `padding: 0 var(--space-4)`.
- [ ] **Step 2: run** `npx vitest run js/lib/page-head-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** (spostare, non riscrivere, le sei regole).
- [ ] **Step 4: run** → PASS.
- [ ] **Step 5: commit** — `style: phone page head for every page (B-096), CTA as tall as .ph-btn (B-101)`

### Task 6: badge vuoto (B-099)

**Files:**
- Modify: `costgrid.html:34`, `portfolio.html:356`
- Test: `js/lib/page-head-guard.test.js`

- [ ] **Step 1: test che fallisce** — ogni `<span v-html="headerBadge(` in `costgrid.html` e `portfolio.html` è preceduto, nello stesso tag, da `v-if="headerBadge(` con gli stessi argomenti.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: implementare** (tre span: uno in costgrid, due in portfolio).
- [ ] **Step 4: run** → PASS.
- [ ] **Step 5: commit** — `fix(header): no empty badge span in the title row (B-099)`

### Task 7: icone della toolbar di planning

**Files:**
- Modify: `js/lib/icons.js` (aggiungere `maximize`, `minimize` in coda a `ICON_PATHS`)
- Modify: `planning.html:123-126` (quattro bottoni), `planning.html:1364` (registrare `ph-icon` prima del `mount`)
- Test: `js/lib/icons.test.js`, `js/lib/content-surface-guard.test.js`

**Interfaces:**
- Produces: `ICON_PATHS.maximize`, `ICON_PATHS.minimize`. Sono path 16×16 con `stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"`, come `upload`/`download`. `maximize`: quattro angoli verso l'esterno. `minimize`: quattro angoli verso l'interno.

- [ ] **Step 1: test che falliscono:**
  - in `icons.test.js`, `GUARANTEED` include `'maximize', 'minimize'`;
  - in `content-surface-guard.test.js`, `describe('planning toolbar')`:
    - il testo di `.ph-toolbar` in `planning.html` non fa match con `/\p{Extended_Pictographic}|[⛶⊡⬇]/u`;
    - i bottoni `Team assistant`, `Load XLS`, `Export XLS` e il toggle hanno `class="ph-btn"` e contengono `<ph-icon`, con `name="team"`, `name="upload"`, `name="download"` e `:name="fullWidth ? 'minimize' : 'maximize'"`;
    - `planning.html` contiene `app.component('ph-icon', window.PhIcon)` prima di `app.mount('#planningApp')`.
- [ ] **Step 2: run** `npx vitest run js/lib/icons.test.js js/lib/content-surface-guard.test.js` → FAIL.
- [ ] **Step 3: implementare.** `v-if`, `title`, `@click` dei bottoni restano identici. Le icone usano `:size="14"` come gli altri `.ph-btn`. Le etichette perdono solo l'emoji e i simboli (`Compact`, `Full width`, `Export XLS`).
- [ ] **Step 4: run** → PASS.
- [ ] **Step 5: commit** — `feat(planning): toolbar buttons use the shared icons`

### Task 8: cache-busting, suite, verifica visiva

**Files:**
- Modify: ogni `.html` che referenzia i file versionati toccati: `css/tokens.css` `?v=10`→`11` (23 riferimenti), `css/style.css` `?v=22`→`23` (19), `css/admin-crud.css` `?v=3`→`4` (5), `css/portfolio.css` `?v=5`→`6` (2), `css/costgrid.css` `?v=4`→`5` (1), `css/pipeline.css` `?v=3`→`4` (1), `js/lib/icons.js` `?v=1`→`2` (19)

- [ ] **Step 1: verificare i conteggi** prima di modificare: `grep -oh "css/tokens.css?v=[0-9]*" *.html | sort | uniq -c` e lo stesso per gli altri sei file. Expected: i numeri sopra. Se differiscono, aggiornare tutti i riferimenti trovati.
- [ ] **Step 2: aggiornare i `?v=`** con Edit, file per file. Le master-* e project-config cambiano solo nel `?v=`, e la loro impronta degli `<style>` resta valida.
- [ ] **Step 3: run** `npx vitest run js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/icons.test.js js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js` → PASS.
- [ ] **Step 4: commit** — `chore: bump ?v= for the files changed by header unification cycle 2`
- [ ] **Step 5: stack di branch.** Dal worktree: `scripts/test-branch.sh up`. Expected: `scripts/test-branch.sh status` stampa `up`.
- [ ] **Step 6: scatti** con `MSYS_NO_PATHCONV=1 node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --widths 1440,375 --height 900 --url <u> --out <scratchpad>/after/<nome>`. Pagine: portfolio, portfolio `?projectId=`, program `?programId=`, planning (più una run con `--eval` che clicca il toggle Full width), costgrid su una versione locked e su una draft, admin, team, attribute-lists, timesheets, profile-jobs, settings, _db-reset, _terms-editor, pipeline. Più, a 1440, project-config e master-clients. Gli stessi URL si scattano su `main` (`--base http://localhost`) in `<scratchpad>/before/`.
- [ ] **Step 7: rilettura.** Ogni PNG `after/` si apre con Read e si confronta con il suo `before/` e con le tavole `header_program_dashboard_to_be_updated.jpg` e `header_project_dashboard_to_be_updated.jpg`. Il risultato si presenta come elenco di scostamenti, ciascuno con una proposta fix-ora o accetta-e-registra (PROCESS.md §6.6.5). Va verificato in particolare:
  - project-config e master-clients identici a `main`;
  - bordo sinistro della banda e del contenuto allineati su portfolio, program e planning (in entrambi gli stati del toggle);
  - stessa distanza fra banda e contenuto su tutte le pagine;
  - nessuno scroll orizzontale a 375.
- [ ] **Step 8:** lo stack di branch resta acceso per il Gate 2 di `/finish-cycle`, che decide il teardown.

## Decisioni aperte

1. **Tutti i `?v=` si aggiornano in un task finale unico.** Alternativa scartata: aggiornarli in ogni task che tocca il file. Perché: `style.css` è toccato da cinque task, e un solo bump per file evita cinque giri sugli stessi 19 riferimenti; i commit intermedi non vengono mai serviti.
2. **Sugli alert portati a `alert-sm` restano le utility di margine esistenti (`m-4`, `mb-4`).** Alternativa scartata: sostituirle con `--content-gap`. Perché: gli alert di errore di caricamento sostituiscono l'intera vista e le utility ne fissano già la posizione.
3. **L'immutabilità delle pagine escluse si pinna con un'impronta sha256 dei loro `<style>` inline, calcolata su `main`.** Alternativa scartata: solo confronto visivo. Perché: l'impronta fallisce subito in un task; lo scatto arriva solo al Task 8.
4. **`settings.html` perde le sue regole `body` e `.page` inline invece di riscriverle.** Alternativa scartata: riscriverle con i token. Perché: la pagina carica già `admin-crud.css`, che dopo il Task 4 dà gli stessi valori.
5. **Sul phone, dentro `.app-container`, il padding laterale della banda è `--app-pad` (24px), non i 16px di pipeline.** Alternativa scartata: forzare 16px anche lì. Perché: la regola `.app-container > .ph` del Task 4 è più specifica e tiene la banda allineata al contenuto, che sul phone resta a `--app-pad`. Pipeline, fuori da `.app-container`, resta a 16px.
