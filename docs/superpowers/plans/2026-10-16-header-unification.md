# Header di pagina unificato (ciclo 1 di 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni pagina che chiama `initNav`, tranne le cinque `master-*.html` (Spec §10), ha la stessa banda header (breadcrumb come prima riga, titolo, badge chiari, back link, azioni magenta/bianche con icona) e, dove serve, la stessa banda toolbar, con i valori della pipeline.

**Architecture:** Un componente CSS `.ph-*` in `css/style.css`, scritto a mano nel markup Vue di ogni pagina; una libreria di icone `js/lib/icons.js` usata da `nav.js` e dal componente Vue `<ph-icon>`; un helper `headerBadge()` in `js/core.js` con nuovi token `--status-*-soft-*`. Un guard (`js/lib/page-head-guard.test.js`) fissa il risultato pagina per pagina.

**Tech Stack:** HTML + Vue 3 da CDN senza build, CSS con token, vitest + jsdom, `scripts/shoot.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-16-header-unification-design.md`
**Branch:** `header-unification`
**Risk class:** high-risk — file condivisi caricati da più pagine (`css/style.css`, `css/tokens.css`, `js/core.js`, `js/nav.js` su tutte le pagine autenticate).

**Indipendenza dei task:** i Task 1-3 sono la base e vanno in ordine. I Task 4-9 consumano solo le interfacce dei Task 1-3 e sono indipendenti fra loro (file diversi; ognuno toglie le proprie pagine da `PENDING` nel guard). Il Task 10 chiude: `?v=`, svuotamento di `PENDING`, verifica visiva.

## Global Constraints

- Valori di `.ph-*`: tabella della Spec §2, copiati da `css/pipeline.css` (`.pb-header` righe 6-11, `.pb-title` 17-20, `.pb-subtitle` 23, `.pb-header-right` 53, `.pb-btn-new` 60-66, `.pb-toolbar` 69-74, `.pb-lbl-*` 246 e 273-274).
- Solo token di `css/tokens.css`, nessun hex nuovo fuori da `tokens.css`; ogni coppia testo/sfondo ≥ 4.5:1.
- Nessun cambio funzionale: handler, `v-if`, dropdown, `goBack` del cost grid, permessi (`my_permission`) restano identici.
- `#app-shell`/`#nav-container`/`#app-main` invariati; `v-cloak` sulle root invariato; gli ID emessi da `nav.js` invariati.
- Testi visibili in inglese; nessuna emoji nei titoli dell'header.
- HTML editato solo con Edit/Write, mai con `Get-Content`/`Set-Content` (BOM).
- `?v=` solo nel Task 10. Valori attuali → nuovi: `css/style.css` 21→22, `css/tokens.css` 9→10 (23 pagine, comprese le pre-login), `css/admin-crud.css` 2→3, `css/pipeline.css` 2→3, `css/portfolio.css` 4→5, `css/costgrid.css` 3→4, `js/core.js` 13→14, `js/nav.js` 17→18; `js/lib/icons.js` nasce `?v=1`.
- Durante i task si lanciano solo i test del task (`npx vitest run <file>`); la suite completa è del Gate 1.
- Ogni task di pagina (4-9) apre la sua tavola (riga `Boards:`) e `header_pipeline_model.jpg`, e nel report scrive il confronto markup ↔ tavola. Senza confronto il task non è chiuso.

## Review Focus

1. Titolo lunghissimo (nome di proposta/programma da 80+ caratteri) a 1024px → il titolo va a capo dentro `.ph-main`, le azioni scendono sotto, nessuno scroll orizzontale — test nel Task 3 (regole `min-width: 0` / `flex-wrap` / `overflow-wrap: anywhere` su `.ph-title`).
2. Utente viewer sul project dashboard e sul cost grid → i secondari nascosti oggi restano nascosti (stessi `v-if`) e la banda non lascia buchi — assert sul markup nei Task 5 e 7.
3. Stage o status sconosciuto/vuoto (progetto senza stage, versione Draft) → `headerBadge` ritorna `''`, nessuna pill vuota — test nel Task 2.
4. Ricaricamento della pagina dopo il deploy con `?v=` vecchi in cache → tutti i riferimenti a ogni file toccato hanno lo stesso nuovo `?v=` — test nel Task 10 (guard esistenti aggiornati).
5. Cost grid: click su "‹ Pipeline" con modifiche non salvate → salva prima di uscire ("Saving…") come oggi — assert nel Task 7 che `.ph-back` chiami `goBack` e mostri `backSaving`.

---

### Task 1: libreria icone `js/lib/icons.js` + `nav.js`

**Files:**
- Create: `js/lib/icons.js`, `js/lib/icons.test.js`
- Modify: `js/nav.js` (righe 29-53: `NAV_ICON_PATHS`, `navIcon`), le 19 pagine con `initNav` (un `<script type="module" src="js/lib/icons.js?v=1">` prima del tag di `js/nav.js`)

**Interfaces:**
- Produces: `export const ICON_PATHS` (oggetto nome → markup interno SVG); `export function iconSvg(name: string, size = 16, cls = ''): string`; `export const PhIcon` (componente Vue: props `name: String` richiesto, `size: Number` default 16; template `<svg class="pd-icon" …>` con `v-html`); bridge `window.ICON_PATHS`, `window.iconSvg`, `window.PhIcon`.
- Nomi garantiti: tutti quelli di `NAV_ICON_PATHS` (pipeline, portfolio, planning, config, timesheets, user, team, tag, dbreset, terms, notify, key, signout, bell, lock, chevronLeft, chevronRight), tutti quelli di `PF_ICON_PATHS` in `portfolio.html` (riga ~700-726, nomi come sono), più `save`, `clone`, `download`, `share`, `configure`, `upload`, `calendar`, `plus`, `chevronDown`, `search`. Nome presente in entrambe le fonti con disegni diversi → vince quello di `NAV_ICON_PATHS`.

- [ ] **Step 1: test rosso** — `js/lib/icons.test.js`:
  - `iconSvg('pipeline')` contiene `viewBox="0 0 16 16"`, `width="16"`, `aria-hidden="true"`, `class="pd-icon"`;
  - `iconSvg('share', 14, 'x')` contiene `width="14"` e `class="pd-icon x"`;
  - `iconSvg('nope') === ''`;
  - ogni nome della lista "Nomi garantiti" è una chiave di `ICON_PATHS`;
  - ogni `navIcon('…')` / `icon: '…'` citato in `js/nav.js` (regex sul sorgente) è una chiave di `ICON_PATHS`;
  - ogni pagina con `initNav(` carica `js/lib/icons.js` e il suo indice è minore di quello di `js/nav.js`.
- [ ] **Step 2:** `npx vitest run js/lib/icons.test.js` → FAIL (modulo assente).
- [ ] **Step 3: implementa** `js/lib/icons.js`; in `js/nav.js` elimina `NAV_ICON_PATHS` e fai leggere `navIcon` da `window.ICON_PATHS` mantenendo identico il markup emesso (`nav-icon nav-icon-${size}`); aggiungi il tag module alle 19 pagine subito prima di `js/nav.js`.
- [ ] **Step 4:** `npx vitest run js/lib/icons.test.js js/lib/nav-model.test.js js/lib/nav-shell-guard.test.js` → PASS.
- [ ] **Step 5: commit** — `feat(icons): shared icon library used by nav.js`

### Task 2: token `--status-*-soft-*` + `headerBadge()`

**Files:**
- Modify: `css/tokens.css` (dopo riga 113), `js/lib/tokens.test.js` (elenco riga 42-43 e nuovo `it`), `js/core.js`
- Test: `js/lib/header-badge.test.js` (estrae `headerBadge` dal sorgente di `js/core.js`, come fanno i test esistenti che leggono funzioni da classic script — seguire lo schema di un test `js/lib/*.test.js` che già lo fa)

**Interfaces:**
- Produces: token `--status-{not-started,started,at-risk,on-hold,completed}-soft-bg` e `-soft-text` (hex); `headerBadge(kind: 'stage'|'status', value: string): string` globale in `js/core.js`.
- Mappa status → slug: `Not started yet`→`not-started`, `Started`→`started`, `Started At Risk`→`at-risk`, `Put on hold`→`on-hold`, `Completed`→`completed`. Stage → slug: minuscolo di `SIP|Expected|Anticipated|Committed|Canceled`.

- [ ] **Step 1: test rosso** —
  - `tokens.test.js`: i 10 nuovi nomi nell'elenco dei token attesi; `it('soft status badges meet WCAG AA')` → per ogni slug `ratio(value('status-<s>-soft-text'), value('status-<s>-soft-bg')) >= 4.5`.
  - `header-badge.test.js`: `headerBadge('stage','Committed')` contiene `class="ph-badge"`, `var(--pipeline-committed-bg)`, `var(--pipeline-committed-color)` e il testo `Committed`; `headerBadge('status','Started At Risk')` contiene `var(--status-at-risk-soft-bg)`; `headerBadge('stage','')`, `headerBadge('stage','Draft')`, `headerBadge('status','Unknown')` → `''`; `headerBadge('stage','<b>')` → `''` (nessun HTML non scappato).
- [ ] **Step 2:** `npx vitest run js/lib/tokens.test.js js/lib/header-badge.test.js` → FAIL.
- [ ] **Step 3: implementa** i token (toni chiari della stessa famiglia del rispettivo `--status-*-bg`, testo scuro della stessa famiglia) e `headerBadge` (testo via `esc()`).
- [ ] **Step 4:** stesso comando → PASS.
- [ ] **Step 5: commit** — `feat(core): headerBadge and soft status tokens`

### Task 3: componente `.ph-*`, breadcrumb, guard

**Files:**
- Modify: `css/style.css` (breadcrumb righe 31-36; nuovo blocco `/* ── Page head ── */`)
- Create: `js/lib/page-head-guard.test.js`

**Interfaces:**
- Produces: classi `.ph`, `.ph-main`, `.ph-back`, `.ph-eyebrow`, `.ph-title-row`, `.ph-title`, `.ph-badge`, `.ph-sub`, `.ph-side`, `.ph-actions`, `.ph-btn-primary`, `.ph-btn`, `.ph-toolbar`, `.ph-toolbar-spacer`, `.ph-lbl-wide`, `.ph-lbl-narrow`, `.pd-icon` (`flex-shrink: 0`). Guard con `const EXCLUDED = new Set([le cinque master-*.html])` (permanente in questo ciclo, Spec §10) e `const PENDING = new Set([...le altre pagine con initNav])` che i Task 4-9 svuotano.

- [ ] **Step 1: test rosso** — `page-head-guard.test.js`:
  - `css/style.css` definisce ognuna delle classi sopra;
  - `.breadcrumb-bar` non ha `border-bottom` e ha padding orizzontale `var(--space-6)`;
  - `.ph-title` ha `min-width: 0` sul contenitore (`.ph-main`) e `overflow-wrap: anywhere`; `.ph` ha `flex-wrap: wrap` (Review Focus 1);
  - per ogni pagina con `initNav(` **non** in `PENDING` né in `EXCLUDED`: contiene `class="ph"` o `class="ph `; ogni testo dentro un elemento `.ph-title` non contiene `\p{Extended_Pictographic}`; non contiene (nemmeno nei blocchi `<style>` inline) i selettori vietati;
  - `css/pipeline.css`, `css/portfolio.css`, `css/costgrid.css`, `css/admin-crud.css`, `css/style.css` non contengono i selettori vietati **delle pagine già fuori da `PENDING`** (mappa selettore → file CSS → pagine; il Task 10 rende il controllo totale);
  - selettori vietati (Spec §8): `.pb-header`, `.pb-title`, `.pf-header`, `.pf-header-title`, `.pr-head`, `.pr-back`, `.pg-topline`, `.pg-header-row`, `.pg-title`, `.pg-label`, `.cg-header`, `.cg-header-name`, `.cg-back-link`, `.page-header`, `.page-title-bar`, `.page-toolbar` (match esatto del nome di classe, non prefisso: `.pb-header-right` è un selettore diverso).
- [ ] **Step 2:** `npx vitest run js/lib/page-head-guard.test.js` → FAIL sulle classi CSS.
- [ ] **Step 3: implementa** il blocco CSS (valori dei Global Constraints / Spec §2) e la modifica al breadcrumb. Media query `max-width: 1023.98px` per `.ph-lbl-*` e per `.ph-side { width: 100% }`.
- [ ] **Step 4:** `npx vitest run js/lib/page-head-guard.test.js js/lib/nav-layout-guard.test.js` → PASS.
- [ ] **Step 5: commit** — `feat(css): shared page head component and guard`

### Task 4: `pipeline.html`

**Boards:** `docs/superpowers/design/header/header_pipeline_model.jpg`
**Files:** `pipeline.html` (righe 23-54 e 114), `css/pipeline.css`, `js/lib/page-head-guard.test.js` (togli `pipeline.html` da `PENDING`)
**Interfaces:** Consumes `.ph-*` (Task 3).

- [ ] **Step 1:** togli `pipeline.html` da `PENDING`; `npx vitest run js/lib/page-head-guard.test.js js/lib/pipeline-guard.test.js` → FAIL.
- [ ] **Step 2:** `.pb-header`→`.ph`, `.pb-title`→`.ph-title` dentro `.pb-title-btn`, `.pb-subtitle`→`.ph-sub`, `.pb-header-right`→`.ph-side`, `.pb-btn-new`→`.ph-btn-primary`, `.pb-toolbar`→`.ph-toolbar`, `.pb-toolbar-spacer`→`.ph-toolbar-spacer`, `.pb-lbl-*`→`.ph-lbl-*`; elimina le regole sostituite da `css/pipeline.css` (`.pb-title-btn` tiene solo reset del bottone e layout); aggiorna `pipeline-guard.test.js` se fissa i nomi vecchi. `.pb-open*`, `.pb-year-*`, `.pb-chevron` restano.
- [ ] **Step 3:** stesso comando → PASS. Confronto con la tavola: la pagina deve restare **identica** a `header_pipeline_model.jpg`.
- [ ] **Step 4: commit** — `refactor(pipeline): use the shared page head`

### Task 5: `portfolio.html` (overview + project dashboard)

**Boards:** `header_portfolio_to_be_updated.jpg`, `header_project_dashboard_to_be_updated.jpg`, `header_pipeline_model.jpg`
**Files:** `portfolio.html` (righe 30-86 overview, 320-370 dashboard, ~700-735 `PF_ICON_PATHS`/`PfIcon`), `css/portfolio.css` (righe 4-18, 454-530), `js/lib/portfolio-guard.test.js` se fissa nomi rimossi, `js/lib/page-head-guard.test.js`
**Interfaces:** Consumes `PhIcon`, `headerBadge`, `.ph-*`.

- [ ] **Step 1:** togli `portfolio.html` da `PENDING`; aggiungi al guard (blocco dedicato al portfolio) che `portfolio.html` non contiene `pf-icon`, `PF_ICON_PATHS`, `btn-primary` dentro `.ph`, e che i quattro secondari del dashboard sono `.ph-btn` con gli stessi `v-if` di oggi (`my_permission !== 'viewer'` su Configure e Load Actuals — Review Focus 2). Run guard + `portfolio-guard` → FAIL.
- [ ] **Step 2: overview** — `.ph` con `.ph-title` "Project Portfolio", `.ph-sub` `portfolioCounts`, `.ph-side` con `.ph-btn-primary` "+ New Project" (stesso `:disabled`/`:title`); `.pf-toolbar` → `.ph-toolbar` (contenuto invariato). Banda a tutta larghezza fuori dal padding di `.app-container` (Spec §2 "Larghezza piena").
- [ ] **Step 3: dashboard** — `.ph` con `.ph-back` "Project Portfolio" (`showOverview`), riga Program come `.ph-eyebrow` (contenuto invariato), `.ph-title-row` con il dropdown di cambio progetto (bottone che contiene `.ph-title`) o `<h1 class="ph-title">`, badge `v-html="headerBadge('stage', …) + headerBadge('status', …)"` al posto di quelli pieni, `.ph-sub` meta-line, `.ph-side`/`.ph-actions` con i quattro `.ph-btn` e `<ph-icon>`. `PfIcon` → `app.component('ph-icon', window.PhIcon)`; gli altri usi di `<pf-icon>` nella pagina diventano `<ph-icon>`.
- [ ] **Step 4:** elimina da `css/portfolio.css` le regole sostituite (Spec §2); `.pr-action` resta solo se ancora usata (riga 451) e senza ruolo di header.
- [ ] **Step 5:** run → PASS; confronto con le due tavole nel report.
- [ ] **Step 6: commit** — `feat(portfolio): shared page head on overview and project dashboard`

### Task 6: `program.html`

**Boards:** `header_program_dashboard_to_be_updated.jpg`, `header_pipeline_model.jpg`
**Files:** `program.html` (righe 34-50 e registrazione componenti), `css/portfolio.css` (righe 272-285), `js/lib/page-head-guard.test.js`
**Interfaces:** Consumes `PhIcon`, `headerBadge`, `.ph-*`.

- [ ] **Step 1:** togli `program.html` da `PENDING`; run guard → FAIL.
- [ ] **Step 2:** `.ph` con `.ph-back` "Project Portfolio" (link a `/portfolio.html`), `.ph-eyebrow` "Program dashboard", `.ph-title` `program.name` + `headerBadge('stage', domPipeline)`, `.ph-sub` `metaLine`, `.ph-btn` Export (`download`) e Share (`share`). Lo skeleton di caricamento resta sotto la banda o fuori, come oggi. Rimuovi le regole `.pg-*` sostituite (`.pg-tile*`, `.pg-kpis` restano: ciclo 2).
- [ ] **Step 3:** run → PASS; confronto con la tavola.
- [ ] **Step 4: commit** — `feat(program): shared page head`

### Task 7: `costgrid.html`

**Boards:** `header_costgrid_to_be_updated.jpg`, `header_pipeline_model.jpg`
**Files:** `costgrid.html` (righe 29-80, `CG_HEADER_STAGE_STYLE` e il suo computed), `css/costgrid.css` (righe 8-50 e `.cg-btn-secondary` se non più usata altrove), `js/lib/page-head-guard.test.js`, eventuali guard del cost grid che fissano `cg-header`
**Interfaces:** Consumes `PhIcon`, `headerBadge`, `.ph-*`.

- [ ] **Step 1:** togli `costgrid.html` da `PENDING`; aggiungi al guard: `.ph-back` con `@click.prevent="goBack"` e `backSaving` nel testo (Review Focus 5); nessun `CG_HEADER_STAGE_STYLE`; Share con lo stesso `v-if="!isDraft"`. Run → FAIL.
- [ ] **Step 2:** banda a due righe (Spec §6 cost grid): riga 1 `.ph-back` "Pipeline"/"Saving…", `.ph-title` `cg?.name`, `headerBadge('stage', draft?.pipeline)` (Draft → nessuna pill, come da `headerBadge`), `.ph-sub` invariato; riga 2 `.cg-version-seg` invariato + `.ph-actions` con `.ph-btn` Save (`save`), Clone (`clone`), Export XLS (`download`), Share (`share`), divisore, `.ph-btn-primary` Publish to SIP → / Generate project, nota "All tasks are in projects" e "Selecting tasks…" invariati. La card `.cg-header` sparisce; banner locked sotto la banda.
- [ ] **Step 3:** rimuovi `CG_HEADER_STAGE_STYLE` e il computed che lo legge; rimuovi le regole CSS sostituite. Verifica con `grep -n "cg-btn-secondary" costgrid.html` gli usi fuori dall'header prima di toccare `.cg-btn-secondary`.
- [ ] **Step 4:** run guard + test del cost grid toccati → PASS; confronto con la tavola.
- [ ] **Step 5: commit** — `feat(costgrid): shared page head replaces the header card`

### Task 8: `project-config.html` + `planning.html`

**Boards:** `header_pipeline_model.jpg`
**Files:** `project-config.html` (righe 24, 32-40), `planning.html` (righe 36-117), `css/style.css` (rimozione `.page-title-bar`, `.page-toolbar*` righe 407-421), `js/lib/page-head-guard.test.js`

- [ ] **Step 1:** togli le due pagine da `PENDING`; run → FAIL.
- [ ] **Step 2: project-config** — `.ph` con un solo `.ph-back`: "Project Dashboard" (`goProjectDashboard`) se `!isNewProject`, altrimenti "Portfolio" (`/portfolio.html`); `.ph-title` senza "📁"; azioni dell'header come `.ph-btn`/`.ph-btn-primary`. Il link "← Back to Portfolio" di riga 24 (stato d'errore) e i pulsanti in fondo al form (righe 320-321) restano.
- [ ] **Step 3: planning** — `.page-title-bar` → `.ph` (`.ph-title` `planningTitle`); `.page-toolbar` → `.ph-toolbar` con contenuto invariato (`.page-toolbar-left/right` diventano contenitori senza stile di banda).
- [ ] **Step 4:** rimuovi `.page-title-bar`, `.page-toolbar*` da `css/style.css`; run → PASS.
- [ ] **Step 5: commit** — `feat(planning,project-config): shared page head`

### Task 9: pagine admin e sysadmin

**Boards:** `header_pipeline_model.jpg`
**Files:** `team.html`, `admin.html`, `attribute-lists.html`, `profile-jobs.html`, `settings.html`, `timesheets.html`, `_terms-editor.html`, `_db-reset.html`, `css/admin-crud.css` (righe 6-7), il blocco `<style>` inline con `.page-header` di `timesheets.html`, `js/lib/page-head-guard.test.js`. **Non toccare le cinque `master-*.html`** (fuori ciclo, Spec §10): il loro `.page-header` inline resta.

- [ ] **Step 1:** togli le 8 pagine da `PENDING`; aggiungi al guard: `_db-reset.html` ha un `.alert-danger` subito dopo la `.ph` e nessun `#dc3545` né `font-size:2.5rem` nel titolo. Run → FAIL.
- [ ] **Step 2:** in ogni pagina `.page-header` → `.ph` con `.ph-title` (testo senza contatore né emoji), `.ph-sub` con il contatore (`{{ users.length }} users`, `{{ resources.length }} resources`, `{{ lists.length }} lists`, ecc.; singolare per 1), `.ph-side` con le CTA attuali (`btn-primary` → `.ph-btn-primary`, outline → `.ph-btn`). Ricerca/filtri sotto il titolo, dove ci sono, in `.ph-toolbar`.
- [ ] **Step 3: `_db-reset`** — `.ph-title` "Database Reset"; l'avvertimento già presente nella pagina passa in un `.alert.alert-danger` sotto la banda. **`_terms-editor`** — `.ph-title` "Terms & Conditions" senza "📄".
- [ ] **Step 4:** rimuovi `.page-header*` da `css/admin-crud.css` e dal `<style>` inline di `timesheets.html`; run → PASS.
- [ ] **Step 5: commit** — `feat(admin): shared page head on admin and sysadmin pages`

### Task 10: chiusura — `?v=`, guard totale, verifica visiva (coordinatore)

**Boards:** tutte e cinque.
**Files:** tutte le pagine con riferimenti ai file versionati, `js/lib/nav-shell-guard.test.js` (righe 94-98), `js/lib/auth-pages-guard.test.js` (riga 121), `js/lib/pipeline-guard.test.js` (riga 55), `js/lib/portfolio-guard.test.js` (riga 40), eventuali altri guard che fissano un `?v=` dei file in elenco, `js/lib/page-head-guard.test.js`

- [ ] **Step 1:** `grep -rn -E "(style|tokens|admin-crud|pipeline|portfolio|costgrid)\.css\?v=|js/(core|nav)\.js\?v=" --include=*.html --include=*.test.js .` per l'elenco completo; aggiorna prima i guard ai nuovi valori (Global Constraints) e togli `PENDING` dal guard (controllo totale sui CSS) → `npx vitest run js/lib/` → FAIL sui `?v=`.
- [ ] **Step 2:** bump di ogni riferimento; run → PASS; il `grep` dello Step 1 non mostra più valori vecchi.
- [ ] **Step 3: commit** — `chore: bump ?v= for the page head cycle`
- [ ] **Step 4: verifica visiva** (coordinatore, non subagent — §6.6.3): `scripts/test-branch.sh up` dal worktree (`.env` copiato), poi `node scripts/shoot.mjs --base http://localhost:8081 --settle 3000 --widths 1440,1024,768 --url <pagina> --out shots/<nome>` per `pipeline.html`, `portfolio.html`, project dashboard (`portfolio.html` con lo snippet `--eval` che apre un progetto), `program.html?programId=<id>`, `costgrid.html?cgId=&verId=` di una proposta Committed, `team.html`, `_db-reset.html`. Rileggere ogni PNG e confrontarlo con `header_pipeline_model.jpg` e con la tavola della pagina; presentare gli scostamenti uno per uno (§6.6.5). Lo stack di branch resta su per il Gate 2.

## Decisioni aperte

1. **Master Data fuori dal ciclo** (decisione utente 2026-10-16, Spec Decisione 8): le cinque `master-*.html` ricevono solo il tag di `icons.js` (Task 1) e i bump `?v=` (Task 10). Alternativa scartata: banda dentro `.md-content`. Perché: il restyling di Master Data cambierà la struttura di quelle pagine.
2. **Il guard cresce pagina per pagina con un insieme `PENDING`, svuotato nel Task 10.** Alternativa scartata: guard scritto tutto nel Task 10. Perché: ogni task di pagina ha così un test rosso proprio, e un revisore può rifiutare un task senza bloccare gli altri.
3. **Tutti i bump `?v=` in un solo task finale.** Alternativa scartata: bump nel task che tocca ciascun file. Perché: `css/style.css` e `js/core.js` sono toccati da più task, e i guard di versione fallirebbero a metà ciclo.
