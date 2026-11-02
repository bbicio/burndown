# Project configuration v2 — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (esecuzione nativa, vedi
> Handoff) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-02-project-config-redesign-design.md`
**Branch:** `project-config-redesign`
**Risk class:** high-risk — file condivisi caricati da più pagine (`css/style.css`, `js/lib/icons.js`)

**Goal:** restyling di `project-config.html` secondo le tavole 8.1-8.4 e la spec, senza cambiare regole di
business, dati salvati o API.

**Architecture:** stessa app Vue 3 della pagina; nuovo foglio `css/project-config.css` (prefisso `pc-`); tre
helper puri nuovi in `js/lib/config-form-calc.js`; quattro icone nuove in `js/lib/icons.js`; le regole Tags
condivise passano da `costgrid.css` a `style.css`. Un guard nuovo, `js/lib/project-config-layout-guard.test.js`,
cresce task dopo task.

**Tech Stack:** Vue 3 CDN, Bootstrap 5.3.2, vitest + jsdom, `scripts/shoot.mjs`.

**Indipendenza dei task:** i task **non** sono indipendenti — i Task 4-9 modificano tutti `project-config.html`
in sequenza e ciascuno parte dal markup del precedente.

## Global Constraints

- Nessun build step; nessun hex in `project-config.html` e `css/project-config.css`; solo `var(--token)`.
- Nessuna emoji nella pagina (`\p{Extended_Pictographic}`), stringhe JS comprese; icone solo via `<ph-icon>`.
- Nessun `<style>` inline nella pagina (`content-surface-guard`); `.cfg-section` in `style.css` invariata.
- Nessun `scrollIntoView`; scroll con `window.scrollTo`.
- `#app-shell`/`#app-main` senza `overflow`/`transform`/`filter`/`contain`/`will-change`/`position`; `v-cloak`
  invariato.
- Ogni file versionato toccato: tutti i suoi `?v=N` nel repo allo stesso nuovo `N`
  (`grep -rn "<path>?v=" --include=*.html .`).
- Le asserzioni dei guard esistenti non si modificano: `project-config-ptc-phasing-guard`,
  `project-config-rate-input-guard`, `project-config-task-period-guard`, `dates-guard`, `page-head-guard`,
  `project-rules-guard`, `proposal-modals-guard`, `content-surface-guard`, `nav-shell-guard`, `money-guard`,
  `foundations-guard`, `costgrid-guard`, `icons.test.js`. In particolare: metodi indentati a 6 spazi,
  `distBadgeClass` subito dopo `rebuildTaskDist`, esattamente 4 `<cg-date-picker>` con `:disabled="isViewer"`.
- Testo utente in inglese; mesi in inglese ovunque (`monthLabel(ym)`).
- Importi solo con `formatMoney(amount, project.currency, currencies)`.
- Breakpoint: `max-width: 1023.98px` e `max-width: 767.98px`.
- Test durante i task: solo i file toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.

## Review Focus

1. **Discard dopo un Derive/Reforecast o un'aggiunta di task:** deve tornare esattamente all'ultimo stato
   salvato, con le stesse normalizzazioni del caricamento (`monthlyDistribution: null` → `{}`), e
   `isProjectDirty` deve tornare `false` subito dopo. Test nel Task 4 (normalizeProject, round-trip).
2. **Spread evenly su un task a un mese o completato:** non deve mai scrivere (griglia readonly); Spread all
   salta questi task e quelli già validi. Test nel Task 1 (`spreadEvenly`) e asserzione di guard nel Task 6.
3. **Valuta a zero decimali (JPY) nel bilancio del phasing:** `phasingBalance` con `decimals = 0` non deve dire
   "balanced" per una differenza di 1. Test nel Task 1.
4. **Viewer:** nessun pulsante di modifica nuovo visibile (Discard, Spread, Clear, Add role, Remove task, Add
   PTC/group). Asserzioni di guard nei Task 4, 6, 8.
5. **Cambio di larghezza da desktop a < 768 e ritorno:** le sezioni nascoste con `v-show` devono ricomparire
   tutte; nessuna sezione resta nascosta a 1440. Verifica negli screenshot del Task 10 (stato "resize").

---

### Task 1: Helper puri `spreadEvenly`, `splitState`, `phasingBalance`

**Boards:** `docs/superpowers/design/config-project/config_form_part1.jpg` (pill "Not split · 100% missing"),
`config_form_part2.jpg` (riga "… · balanced").

**Files:**
- Modify: `js/lib/config-form-calc.js` (nuovi export + bridge `window.*` in fondo)
- Test: `js/lib/config-form-calc.test.js`
- Modify: `project-config.html` (`config-form-calc.js?v=5` → `?v=6`)

**Interfaces:**
- Produces:
  - `spreadEvenly(months: string[]) → { [ym]: number }`
  - `splitState(distribution: object|null, months: string[]) → { sum: number, valid: boolean, label: string, tone: 'ok'|'warn'|'danger' }`
  - `phasingBalance(sum: number, total: number, decimals: number) → { balanced: boolean, diff: number }`
    (`diff = total − sum`, arrotondato a `decimals`)
  - tutti e tre su `window`.

- [ ] **Step 1: test che falliscono** in `config-form-calc.test.js`, `describe('spreadEvenly')`,
  `describe('splitState')`, `describe('phasingBalance')`:
  ```js
  expect(spreadEvenly([])).toEqual({});
  expect(spreadEvenly(['202601'])).toEqual({ '202601': 100 });
  expect(spreadEvenly(['202601','202602','202603'])).toEqual({ '202601': 33.33, '202602': 33.33, '202603': 33.34 });
  const m13 = Array.from({ length: 13 }, (_, i) => 'm' + i);
  const d13 = spreadEvenly(m13);
  expect(Object.values(d13).slice(0, 12).every(v => v === 7.69)).toBe(true);
  expect(d13[m13[12]]).toBe(7.72);
  // sum within 0.005 of 100 for n = 1..24
  for (let n = 1; n <= 24; n++) {
    const ms = Array.from({ length: n }, (_, i) => 'm' + i);
    const s = Object.values(spreadEvenly(ms)).reduce((a, b) => a + b, 0);
    expect(Math.abs(s - 100)).toBeLessThan(0.005);
  }
  const ms = ['202601', '202602'];
  expect(splitState({}, ms)).toMatchObject({ sum: 0, valid: false, label: 'Not split · 100% missing', tone: 'warn' });
  expect(splitState(null, ms).label).toBe('Not split · 100% missing');
  expect(splitState({ '202601': 50, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '100%', tone: 'ok' });
  expect(splitState({ '202601': 49.98, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '100%', tone: 'ok' });
  expect(splitState({ '202601': 49.6, '202602': 50 }, ms)).toMatchObject({ valid: true, label: '0.4% missing', tone: 'warn' });
  expect(splitState({ '202601': 51, '202602': 50 }, ms)).toMatchObject({ valid: false, label: '1.0% too much', tone: 'danger' });
  expect(splitState({ '202601': 50 }, ms)).toMatchObject({ valid: false, label: '50.0% missing', tone: 'warn' });
  expect(splitState({ '202601': 50, '209912': 50 }, ms).sum).toBe(50);   // only months in range count
  expect(phasingBalance(60020, 60020, 2)).toEqual({ balanced: true, diff: 0 });
  expect(phasingBalance(60019.996, 60020, 2).balanced).toBe(true);
  expect(phasingBalance(60019.99, 60020, 2)).toEqual({ balanced: false, diff: 0.01 });
  expect(phasingBalance(999, 1000, 0)).toEqual({ balanced: false, diff: 1 });
  expect(phasingBalance(1000.4, 1000, 0).balanced).toBe(true);
  expect(phasingBalance(1200, 1000, 2)).toEqual({ balanced: false, diff: -200 });
  ```
- [ ] **Step 2:** `npx vitest run js/lib/config-form-calc.test.js` → FAIL (`spreadEvenly is not a function`).
- [ ] **Step 3: implementare** i tre export (spec §4). `splitState`: somma dei soli mesi in `months`; `valid` =
  `|sum − 100| <= 0.5`; label con `toFixed(1)` della differenza; `'100%'` quando `|sum − 100| < 0.05`.
  `phasingBalance`: `balanced` = `|sum − total| < 0.5 × 10^−decimals`. Bridge `window.spreadEvenly = …` ecc.
  accanto agli esistenti. Bump `config-form-calc.js?v=6` in `project-config.html`.
- [ ] **Step 4:** `npx vitest run js/lib/config-form-calc.test.js` → PASS.
- [ ] **Step 5: commit** `feat(config-form-calc): spreadEvenly, splitState, phasingBalance`.

### Task 2: Quattro icone in `js/lib/icons.js`

**Boards:** `config_form_part1.jpg` (icone Download/Delete degli actuals), `config_form_part2.jpg` (Derive, Reforecast, cestino dei gruppi).

**Files:**
- Modify: `js/lib/icons.js` (`ICON_PATHS`)
- Test: `js/lib/icons.test.js`
- Modify: ogni `*.html` con `js/lib/icons.js?v=2` → `?v=3` (oggi 19 pagine)

**Interfaces:** Produces le chiavi `trash`, `eye`, `refresh`, `trend-up` di `ICON_PATHS` (16×16,
`stroke="currentColor"`, stesso stile delle chiavi `save`/`download`).

- [ ] **Step 1: test che fallisce** in `icons.test.js`:
  `it('has the project-config icons', () => { for (const n of ['trash','eye','refresh','trend-up']) { expect(ICON_PATHS[n]).toMatch(/stroke="currentColor"/); expect(ICON_PATHS[n]).not.toMatch(/#[0-9a-fA-F]{3,8}\b/); } });`
- [ ] **Step 2:** `npx vitest run js/lib/icons.test.js` → FAIL.
- [ ] **Step 3:** aggiungere i quattro path (cestino con coperchio; occhio; freccia circolare; linea a zig-zag
  ascendente con punta) e bumpare tutti i `icons.js?v=2` a `?v=3`.
- [ ] **Step 4:** `npx vitest run js/lib/icons.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS;
  `grep -rho "js/lib/icons.js?v=[0-9]*" --include=*.html . | sort | uniq -c` → una sola riga `?v=3`.
- [ ] **Step 5: commit** `feat(icons): trash, eye, refresh, trend-up`.

### Task 3: Regole Tags/card richiudibile da `costgrid.css` a `style.css`

**Boards:** nessuna tavola di project-config (Tags segue `costgrid.html`, brief §5); riferimento visivo: la
sezione Tags di `costgrid.html` a 1440 prima e dopo.

**Files:**
- Modify: `css/costgrid.css` (rimuovere le regole di `costgrid.css:142-177` e `:271-296`; resta, perché
  specifica del Cost Grid, `.cg-summary-bar .cg-section-chevron` a `:402` e il commento di `:222`)
- Modify: `css/style.css` (stesse regole, stessi valori, nuovo blocco "Collapsible section cards + Tags summary,
  shared by costgrid.html and project-config.html" vicino a `.tag-group*`, compreso il media query di
  `.cg-tag-groups`, che resta `max-width: 768px`: lo spostamento è a valori invariati)
- Modify: tutti i `css/style.css?v=27` → `?v=28` (19 pagine); `css/costgrid.css?v=8` → `?v=9` in `costgrid.html`
- Test: `js/lib/project-config-layout-guard.test.js` (**nuovo**)

**Interfaces:** Produces in `style.css` i selettori `.cg-section-header`, `.cg-section-header:focus-visible`,
`.cg-section-chevron`, `.cg-section-chevron--collapsed`, `.cg-section-title`, `.cg-section-toggle-label`,
`.cg-tag-groups`, `.cg-tag-summary`, `.cg-tag-summary-pill`.

- [ ] **Step 1: test che fallisce** — crea il guard con un primo `describe('shared tag rules')`: per ogni
  selettore dell'elenco sopra, `style.css` contiene `<selettore> {` e `costgrid.css` non lo contiene come inizio
  di regola (regex `^\.<sel>\s*\{` multilinea); `costgrid.css` contiene ancora `.cg-summary-bar .cg-section-chevron`.
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3:** spostare le regole a byte invariati (taglia/incolla) e bumpare i `?v=`.
- [ ] **Step 4:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/costgrid-guard.test.js js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js js/lib/content-surface-guard.test.js` → PASS.
- [ ] **Step 5: commit** `refactor(css): share the collapsible-section and tag-summary rules via style.css`.

### Task 4: `css/project-config.css`, page head, Save/Discard, `normalizeProject`

**Boards:** `config_form_part1.jpg` (header: back, eyebrow, titolo, badge, meta, Project Dashboard),
`config_form_tablet_smartphone.jpg` (header a 1024/390). La barra di salvataggio in alto/in basso delle tavole si ignora.

**Files:**
- Create: `css/project-config.css` (caricato con `<link rel="stylesheet" href="css/project-config.css?v=1">` dopo
  `controls.css`)
- Modify: `project-config.html` (righe 33-45 head e banner; 324-331 riga in fondo; `onSave` 858; `resolveProject`;
  nuovi `onDiscard`, `normalizeProject`, computed `headMeta`)
- Test: `js/lib/project-config-layout-guard.test.js`, `js/lib/config-form-calc.test.js`

**Interfaces:**
- Consumes: `isProjectDirty` (esistente), `headerBadge` (`js/core.js`), `window.formatMonthText(ym)` di
  `js/lib/dates.js` ("Dec 2025") per le due estremità del periodo.
- Produces: metodi `normalizeProject(p) → p` (le normalizzazioni oggi in `resolveProject`: `monthlyDistribution`,
  `description`, `entries` dei gruppi, ecc., spostate a corpo invariato), `onDiscard()`; computed `headMeta`
  (stringa "client · code · period · currency", parti vuote omesse); classe card `pc-card`.

- [ ] **Step 1: test che falliscono** nel guard, `describe('page head and save')`:
  - la slice fra `<div class="ph-actions">` e il suo `</div>` contiene `@click="onSave"`, `ph-btn-primary`,
    `@click="onDiscard"`, `goProjectDashboard`;
  - Save e Discard hanno `v-if="!isViewer"`; Discard ha `:disabled=` con `isDirty` o `isProjectDirty`;
  - la pagina non contiene `Back to Portfolio` né `💾`;
  - `.ph-back` punta a `/portfolio.html` con testo `Portfolio`, e la pagina contiene `class="ph-eyebrow"` con
    `Project configuration`;
  - la pagina carica `css/project-config.css?v=` e nessun'altra pagina lo carica;
  - `css/project-config.css` non contiene hex;
  - `onSave` inizia con `if (this.saving) return;` (prima riga del corpo).
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §6.1-6.2: page head completo, `jsonError` + banner viewer (senza 👁) +
  avviso `outOfPeriod` sotto il head (condizione e testo invariati, il guard task-period li fissa), rimozione
  della riga in fondo, `onDiscard` (confirm "Discard all unsaved changes?" via `this.showConfirm`, poi
  `this.project = this.normalizeProject(JSON.parse(this.savedSnapshot))`, reset di `phasingInvalid`/
  `ptcInvalid`/`rateInvalid` a `{}` e `openTaskIndex = null`), `if (this.saving) return;` in testa a `onSave`.
  `css/project-config.css`: `.pc-card` (fondo `--surface-white`/equivalente, bordo `--border-light`, raggio,
  ombra e padding da token) applicata insieme a `cfg-section` a ogni sezione; `.cfg-section` di `style.css` non si tocca.
- [ ] **Step 4: round-trip di `normalizeProject`** nel guard: estrarne il corpo con la stessa regex a 6 spazi dei
  guard esistenti, eseguirlo su `{ tasks: [{ monthlyDistribution: null }], groups: [] }` e attendersi
  `monthlyDistribution` uguale a `{}`; rieseguirlo sul risultato serializzato e attendersi lo stesso JSON.
- [ ] **Step 5:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/page-head-guard.test.js js/lib/project-config-task-period-guard.test.js js/lib/project-config-ptc-phasing-guard.test.js js/lib/project-config-rate-input-guard.test.js js/lib/content-surface-guard.test.js` → PASS.
- [ ] **Step 6:** aprire le tavole indicate e confrontare il page head; annotare gli scostamenti per il Task 10.
- [ ] **Step 7: commit** `feat(project-config): page head with Save/Discard, project-config.css`.

### Task 5: Indice, Totals, `sectionIssues`; Client & program, Project info, Actuals

**Boards:** `config_form_part1.jpg`.

**Files:**
- Modify: `project-config.html` (righe 48-118; nuovo `<nav class="pc-index">` + `.pc-layout`; data
  `activeSection`; computed `sectionIssues`, `sections`; metodi `scrollToSection(key)`, observer in
  `mounted`/`beforeUnmount`; stringhe JS ✅ ❌ ⏳ tolte a 724-853)
- Modify: `css/project-config.css`
- Test: `js/lib/project-config-layout-guard.test.js`

**Interfaces:**
- Consumes: `splitState`, `phasingBalance` (Task 1); `ph-icon` `lock`, `upload`, `download`, `trash`, `eye` (Task 2).
- Produces: ogni card ha `id="pc-sec-<key>"` e `data-section="<key>"` con `key` in
  `['client','info','actuals','tasks','phasing','ptc','groups','tags']`; computed `sections` →
  `[{ key, label, optional }]` (Tags solo se `!isNewProject`); computed `sectionIssues` → `{ tasks, phasing, ptc }`
  (stringa motivo o `null`); `scrollToSection(key)`; data `activeSection` (default `'client'`).

- [ ] **Step 1: test che falliscono** nel guard, `describe('section index')`: la pagina contiene `class="pc-index"`,
  `v-for="s in sections"`, `@click.prevent="scrollToSection(s.key)"`, `IntersectionObserver`, `window.scrollTo(`;
  non contiene `scrollIntoView`; contiene gli otto `id="pc-sec-…"`; non contiene i titoli numerati (`/>\s*\d\.\s/`
  dentro `cfg-section-title`); contiene `No program · standalone project`; nessuna emoji nella slice fra
  `id="pc-sec-client"` e `id="pc-sec-tasks"`; nessun `✅`, `❌`, `⏳` nel file.
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §6.3-6.5. Offset di scroll: altezza del breadcrumb/top bar letta da
  `getComputedStyle(document.documentElement)` se esiste un token, altrimenti dall'elemento della top bar di
  `nav.js`; più `var(--space-4)`. Currency bloccata: wrapper `.pc-locked` con `<ph-icon name="lock">`, il
  `<select v-model="project.currency" … :disabled="currencyLocked">` resta identico (project-rules-guard).
- [ ] **Step 4:** stessi comandi del Task 4 Step 5 + `js/lib/project-rules-guard.test.js js/lib/dates-guard.test.js` → PASS.
- [ ] **Step 5:** confrontare con `config_form_part1.jpg` (indice, Totals, tre card).
- [ ] **Step 6: commit** `feat(project-config): section index, totals, client/info/actuals cards`.

### Task 6: Tasks & resources in tabella

**Boards:** `config_form_part1.jpg` (tabella, task aperto), `config_form_tablet_smartphone.jpg` (solo come
riferimento per il Task 9).

**Files:**
- Modify: `project-config.html` (righe 119-205; data `openTaskIndex: null`; metodi `toggleTask(ti)`,
  `spreadTask(ti)`, `clearTaskSplit(ti)`, `spreadAllTasks()`; computed `splitWarning` → `{ n, m }`; `addTask`
  apre il nuovo task e mette il focus via `$nextTick` su `ref` `taskName-<ti>`; `distBadgeClass`/`distBadgeText`
  delegano a `splitState` restando subito dopo `rebuildTaskDist`; griglia con `monthLabel(ym)`)
- Modify: `css/project-config.css`
- Test: `js/lib/project-config-layout-guard.test.js`

**Interfaces:**
- Consumes: `spreadEvenly`, `splitState` (Task 1); `taskMonthRange` (esistente).
- Produces: `openTaskIndex`, `toggleTask(ti)`, `spreadTask(ti)`, `clearTaskSplit(ti)`, `spreadAllTasks()`,
  `isSplitReadonly(task)` = `taskMonthRange(task).length === 1 || task.completed || isViewer`.

- [ ] **Step 1: test che falliscono** nel guard, `describe('task table')`:
  - contiene `v-if="openTaskIndex === ti"` e `@click="toggleTask(ti)"` con `:aria-expanded="openTaskIndex === ti"`;
  - non contiene `monthLabel(ym, 'it-IT')`;
  - il pulsante `Spread all evenly`, `Spread evenly`, `Clear`, `+ Add role`, `Remove task` hanno ciascuno
    `v-if` che include `!isViewer`;
  - eseguendo il corpo estratto di `spreadAllTasks` su un `this` finto con tre task (uno valido, uno a un mese,
    uno completato, uno vuoto a tre mesi), cambia **solo** il task vuoto;
  - eseguendo `spreadTask` su un task con `isSplitReadonly` vero non cambia nulla;
  - le 4 `<cg-date-picker>` restano 4 (`dates-guard` lo verifica già: rilanciarlo).
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §6.6 (tabella `.pc-tasks`, riga Total, pill Excluded/Completed/Outside the
  project period — il testo `>Outside the project period</` resta, task-period-guard; warning unico con
  "phasing falls back to the task period."; riga aperta con campi, switch, griglia, risorse, Remove task).
  Gli input dell'hourly rate restano identici carattere per carattere (rate-input-guard).
- [ ] **Step 4:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/project-config-rate-input-guard.test.js js/lib/project-config-task-period-guard.test.js js/lib/dates-guard.test.js` → PASS.
- [ ] **Step 5:** confrontare con `config_form_part1.jpg` (riga chiusa, riga aperta, warning, totale).
- [ ] **Step 6: commit** `feat(project-config): task table with one open task, spread/clear split`.

### Task 7: Monthly phasing unico (Budget/Hours)

**Boards:** `config_form_part2.jpg`, `config_form_phasing_hours.jpg`.

**Files:**
- Modify: `project-config.html` (righe 206-254: le due sezioni diventano una `id="pc-sec-phasing"`; data
  `phasingMode: 'budget'`; computed `actualMonths` (Set `YYYYMM` da `actuals.exportRows[].date`), `currentYm`,
  `phasingBars` → `[{ ym, value, pct, past, current }]` per la serie del modo attivo, `phasingStatus` →
  `{ balanced, text }`)
- Modify: `css/project-config.css`
- Test: `js/lib/project-config-layout-guard.test.js`

**Interfaces:**
- Consumes: `phasingBalance` (Task 1); `window.currencyInfo(project.currency, currencies)` di `js/lib/money.js` per i
  decimali della valuta (aprire `money.js:21` per il nome esatto del campo); `ph-icon` `refresh`, `trend-up`, `check`.
- Produces: `phasingMode`, `actualMonths`, `phasingBars`, `phasingStatus`.

- [ ] **Step 1: test che falliscono** nel guard, `describe('monthly phasing')`:
  - `derivePhasing` e `runReforecast` sono ciascuno referenziati da **un solo** `@click` nella pagina;
  - contiene `v-show="phasingMode === 'budget'"` e `v-show="phasingMode === 'hours'"`;
  - non contiene `Monthly Budget Phasing` né `Monthly Hour Planning`;
  - contiene `Set Start and End month first.`;
  - gli input del phasing restano quelli fissati da `project-config-ptc-phasing-guard` (rilanciarlo);
  - eseguendo il corpo estratto di `actualMonths` su `actuals.exportRows = [{ date: '2026-01-15' }, { date: '20260203' }]`
    si ottiene `{'202601','202602'}` (prima aprire `loadActuals` e usare nel test i formati di
    `row.date` che produce davvero).
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §6.7.
- [ ] **Step 4:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/project-config-ptc-phasing-guard.test.js js/lib/money-guard.test.js` → PASS.
- [ ] **Step 5:** confrontare con le due tavole del phasing (barre, segmenti, legenda, bilancio).
- [ ] **Step 6: commit** `feat(project-config): one phasing card with Budget/Hours, bars, balance`.

### Task 8: PTC, Functional groups, Tags, modali; pagina senza emoji e senza hex

**Boards:** `config_form_part2.jpg` (PTC, gruppi; **non** il blocco Tags), la sezione Tags di `costgrid.html`.

**Files:**
- Modify: `project-config.html` (righe 255-321 e 337-389: PTC, gruppi, Tags con il markup di `costgrid.html:226-260`
  e data `tagsCollapsed: true` + `toggleTagsCollapsed()`, senza persistenza; modali `#actualsViewModal`, New
  client, New program, `#confirmModal` con titoli "Confirm"/"Info"; tutte le emoji rimaste e tutti gli
  `style=""` con hex)
- Modify: `css/project-config.css`
- Test: `js/lib/project-config-layout-guard.test.js`

**Interfaces:** Consumes le regole condivise del Task 3, `ph-icon` `trash`, `plus`, `close`.

- [ ] **Step 1: test che falliscono** nel guard, `describe('optional sections and page hygiene')`:
  - nessun match di `/\p{Extended_Pictographic}/u` nell'intero `project-config.html`;
  - nessun hex `/#[0-9a-fA-F]{3,8}\b/` in `project-config.html` fuori dagli `id`/`href="#"` (escludere `href="#"`
    e selettori `#id` nei `data-bs-target`: la regex deve cercare hex in `style=`/`:style=` e in stringhe colore);
  - la slice della sezione Tags contiene `cg-section-header`, `cg-section-chevron`, `cg-tag-summary`,
    `cg-tag-groups`, `tag-group`, `toggleTagsCollapsed`, e non contiene `Manage lists`;
  - contiene `Any task` e non `— any task —`; contiene `No pass-through costs`; non contiene la classe o lo
    style del vecchio totale giallo;
  - `+ Add PTC` e `+ Add group` hanno `v-if` con `!isViewer`.
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §6.8-6.9 (focus sul Title del nuovo PTC e sul nome del nuovo gruppo via
  `$nextTick` + `ref`).
- [ ] **Step 4:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/project-config-ptc-phasing-guard.test.js js/lib/content-surface-guard.test.js js/lib/costgrid-guard.test.js` → PASS.
- [ ] **Step 5:** confrontare con `config_form_part2.jpg` e con la sezione Tags di `costgrid.html`.
- [ ] **Step 6: commit** `feat(project-config): PTC, groups, Tags as on the cost grid, modals`.

### Task 9: Responsive (≤ 1023.98 tab, ≤ 767.98 una sezione + bottom sheet)

**Boards:** `config_form_tablet_smartphone.jpg` (la barra Save in basso si ignora).

**Files:**
- Modify: `project-config.html` (data `isPhone`, `mobileSection: 'client'`; `matchMedia('(max-width: 767.98px)')`
  con listener in `created`, rimosso in `beforeUnmount`; selettore "<i> / <n> · <label>"; `offcanvas
  offcanvas-bottom` `#pcSectionsSheet` sul modello di `pipeline.html:204`; ogni card `v-show="!isPhone ||
  mobileSection === '<key>'"`; scegliere una voce imposta `mobileSection` e chiude l'offcanvas con
  `bootstrap.Offcanvas.getOrCreateInstance(el).hide()`)
- Modify: `css/project-config.css` (media query `max-width: 1023.98px` e `max-width: 767.98px`)
- Test: `js/lib/project-config-layout-guard.test.js`

**Interfaces:** Consumes `sections`, `sectionIssues`, `activeSection` (Task 5).

- [ ] **Step 1: test che falliscono** nel guard, `describe('responsive')`: `project-config.css` contiene
  `@media (max-width: 1023.98px)` e `@media (max-width: 767.98px)`; la pagina contiene `offcanvas-bottom`,
  `matchMedia('(max-width: 767.98px)')`, `removeEventListener` dello stesso listener; ognuno degli otto
  `id="pc-sec-…"` sta su un elemento con `v-show` che include `mobileSection`; nessun `v-if` legato a
  `mobileSection`.
- [ ] **Step 2:** `npx vitest run js/lib/project-config-layout-guard.test.js` → FAIL.
- [ ] **Step 3: implementare** spec §9; input alti 44px sotto 768 solo in `project-config.css`.
- [ ] **Step 4:** `npx vitest run js/lib/project-config-layout-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → PASS.
- [ ] **Step 5:** confrontare con `config_form_tablet_smartphone.jpg`.
- [ ] **Step 6: commit** `feat(project-config): tablet tabs and phone one-section view with bottom sheet`.

### Task 10: Screenshot contro le tavole

**Boards:** tutte e quattro.

Esegue chi ha lo strumento: la sessione principale (non un subagent senza stack).

- [ ] **Step 1:** copiare `.env` dal checkout principale nel worktree (non committarlo); `scripts/test-branch.sh up`.
- [ ] **Step 2:** scegliere quattro progetti sullo stack di branch: uno con actuals, uno senza periodo, uno
  collegato a una proposta, uno condiviso in sola lettura con un utente viewer (credenziali in `.env`:
  `SHOOT_EMAIL`/`SHOOT_PASSWORD`; per il viewer, le credenziali che l'utente indica).
- [ ] **Step 3:** per ciascuno `node scripts/shoot.mjs --base http://localhost:8081 --url "/project-config.html?projectId=<id>" --out shots/pc-<stato> --widths 1440,1024,390 --settle 3000`
  (`--full` solo per il progetto con actuals a 1440). Stati interattivi con `--eval`: task aperto, segmento
  Hours, bottom sheet aperto a 390, e "resize" (a 390 si sceglie Tags, poi si riporta la finestra a 1440 e si
  verifica che tutte le otto card siano visibili — Review Focus 5).
- [ ] **Step 4:** rileggere ogni PNG con `Read` e confrontarlo con la tavola corrispondente.
- [ ] **Step 5:** presentare all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra
  e aspettare la decisione; i fix piccoli si fanno nella sessione principale con il test mirato; gli "accetta"
  vanno in `docs/pages/project-config.md` con il motivo (Task 11).
- [ ] **Step 6:** `scripts/test-branch.sh` resta su per il Gate 2 di `/finish-cycle` (non si smonta qui).

### Task 11: Documentazione e TEST_CASES

**Files:**
- Modify: `docs/pages/project-config.md` (nuova sezione "Redesign (2026-11-02)" con spec, layout, indice, tabella,
  Spread, phasing unito, Discard, Tags, responsive, scostamenti accettati del Task 10)
- Modify: `CLAUDE.md` (riga `css/` del blocco File structure: nove fogli, aggiungere `project-config.css`; riga
  `project-config.html` della tabella Pages: "own stylesheet `css/project-config.css`")
- Modify: `docs/css/stylesheets.md` (nuovo foglio; regole Tags condivise ora in `style.css`)
- Modify: `docs/pages/costgrid.md` (dove stanno le regole della sezione richiudibile)
- Modify: `docs/js/lib.md` (`spreadEvenly`, `splitState`, `phasingBalance`)
- Modify: `TEST_CASES.md` (casi PC nuovi dopo l'ultimo PC esistente: scroll dell'indice e pallini; apertura/chiusura
  task; Spread evenly / Spread all / Clear; Budget/Hours; Discard; parità Tags con Cost Grid; viewer; 1024 e 390)

- [ ] **Step 1:** scrivere le modifiche.
- [ ] **Step 2:** `npx vitest run scripts/ js/lib/test-cases-parse.test.js` → PASS (claude-md-guard,
  doc-paths-guard, architecture-guard, parser dei TEST_CASES).
- [ ] **Step 3: commit** `docs(project-config): redesign narrative, stylesheets, test cases`.
- [ ] **Step 4:** `/finish-cycle`.

## Criteri di accettazione

Quelli della Spec (`docs/superpowers/specs/2026-11-02-project-config-redesign-design.md`, sezione "Criteri di
accettazione"); questo piano non ne aggiunge.

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: i Task 4-9
   modificano tutti `project-config.html` in sequenza, quindi non sono indipendenti (PROCESS.md §6.1).
2. **`normalizeProject` si verifica eseguendone il corpo dal guard, non con un test vitest su un modulo.**
   Alternativa scartata: spostarlo in `js/lib/`. Perché: dipende dalla forma del progetto della pagina ed è lo
   stesso idioma che i guard di project-config usano già per `dropRateInvalid` e `onPhasingBlur`.
3. **Il media query di `.cg-tag-groups` si sposta a `768px` invariato.** Alternativa scartata: allinearlo a
   `767.98px`. Perché: lo spostamento in `style.css` è a valori invariati, così il Cost Grid non cambia a schermo.
4. **Tags parte chiuso e lo stato non si persiste.** Alternativa scartata: persistere come il Cost Grid
   (`PDash_cgSections:<id>`). Perché: una nuova chiave localStorage andrebbe aggiunta al `keep` Set di `core.js`
   (file condiviso) per un beneficio minimo; il default chiuso è quello del Cost Grid per una versione non bozza.
