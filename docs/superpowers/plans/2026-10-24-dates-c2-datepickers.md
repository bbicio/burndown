# Date C2 — un solo datepicker, formato non ambiguo: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni campo data editabile dei form (costgrid, project-config, Custom range del portfolio) usa `CgDatePicker`, e il testo digitato e mostrato è `Dec 1, 2025` / `Dec 2025`, prodotto e letto solo da `js/lib/dates.js`.

**Architecture:**
- I formattatori e i parser di testo di `js/lib/dates.js` cambiano formato; il componente non ha logica di data propria.
- `CgDatePicker` guadagna un prop `inlinePopover` per vivere dentro un dropdown Bootstrap.
- Gli stili della famiglia dei controlli passano in un nuovo `css/controls.css`, caricato dalle tre pagine.

**Tech Stack:** Vue 3 da CDN, script classici e moduli `js/lib/`, vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-24-dates-c2-datepickers-design.md`
**Branch:** `dates-c2-datepickers`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/lib/dates.js`, `js/cg-controls.js`, il nuovo `css/controls.css`).

**Esecuzione:**
- **Fondazione:** i Task 1 e 2, in quest'ordine.
- **Task indipendenti:** i Task 3 (project-config) e 4 (portfolio) dipendono solo dalle interfacce dei Task 1 e 2, non toccano gli stessi file e vanno in qualunque ordine.
- **Chiusura:** il Task 5 (guard) per ultimo.
- **Worktree:** `.claude/worktrees/dates-c2-datepickers` per §6.1b, con `.env` copiato dal checkout principale e `npm ci`.

## Global Constraints

- Il testo visibile all'utente è in inglese.
- Storage e API invariati: versione e progetto `YYYYMM`; task di project-config `YYYYMMDD`; in costgrid e nel portfolio i giorni sono ISO `YYYY-MM-DD`.
- Formato canonico: giorno `Dec 1, 2025` (mese abbreviato inglese, giorno senza zero iniziale, virgola); mese `Dec 2025`. Mai `Intl` né `toLocale*` per produrlo.
- Messaggi esatti: `Enter a date like Dec 1, 2025.`, `Enter a month like Dec 2025.`, `Must be on or after <min formattato>.`, `Must be on or before <max formattato>.`.
- Placeholder di default del picker: `Dec 1, 2025` (giorno), `Dec 2025` (mese).
- Ogni file versionato modificato ha i suoi riferimenti `?v=N` aggiornati in **tutto** il repo nello stesso task. Valori di arrivo: `js/lib/dates.js?v=3`, `js/cg-controls.js?v=5`, `css/costgrid.css?v=7`, `js/costgrid.js?v=49`, `css/portfolio.css?v=8`, `css/controls.css?v=1`; `js/lib/cg-controls-calc.js` resta `?v=2`.
- Modifiche agli HTML solo con l'Edit tool: mai `Get-Content`/`Set-Content` (aggiungono un BOM).
- Durante i task si lanciano solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Nessun colore esadecimale nei CSS: solo `var(--…)`.

## Review Focus

1. **Popover inline dentro `.dropdown-menu`.** Popper mette un `transform` sul menu, quindi un `position: fixed` lì dentro finisce fuori posto: in modalità inline il popover è `position: absolute` rispetto al `.cg-ctl`, non usa `cgPos`. Test nel Task 2.
2. **Click sul calendario dentro il dropdown.** Scegliere un giorno non deve chiudere il menu Period: il popover inline sta dentro `.dropdown-menu`, e il menu ha `data-bs-auto-close="outside"`. Verifica nello shot e nel criterio 5 al Gate 2 (Task 4).
3. **Digitazione libera e case.** `DEC 1 2025`, `  dec 1,   2025 ` e `1 december 2025` sono accettati e riscritti `Dec 1, 2025`. Test nel Task 1.
4. **Valore esterno che cambia mentre è mostrato un errore (B-137).** Il watcher di `modelValue` azzera `error`. Test nel Task 2.
5. **Date di task vuote in project-config.** Svuotare il campo salva `''`, non `null` né `'undefined'`; `toIso('')` restituisce `null`, quindi il binding passa `toIso(x) || ''`. Test statico nel Task 3.

---

### Task 1: formato nel modulo date

**Files:**
- Modify: `js/lib/dates.js` (le funzioni da `parseDayText` a `parseDateInput`)
- Test: `js/lib/dates.test.js` (righe 70-110 circa: i casi `dd/mm/yyyy` vanno sostituiti)
- Modify: `costgrid.html`, `pipeline.html`, `project-config.html` (`dates.js?v=2` → `?v=3`)

**Interfaces:**
- Produces (firme invariate, formato nuovo):
  - `formatDayText(iso: string): string` — `'2025-12-01'` → `'Dec 1, 2025'`; malformato → `''`.
  - `formatMonthText(ym: string): string` — `'202512'` → `'Dec 2025'`; non valido → `''`.
  - `parseDayText(text: string): string|null` → ISO `'YYYY-MM-DD'`.
  - `parseMonthText(text: string): string|null` → `'YYYYMM'`.
  - `parseDateInput(text, { mode, min, max }): { value } | { error }` — invariata salvo i messaggi.

- [ ] **Step 1: Scrivi i test che falliscono** in `js/lib/dates.test.js`, sostituendo i blocchi `dd/mm`:

```js
describe('text format', () => {
  it('formats days and months in the canonical English form', () => {
    expect(formatDayText('2025-12-01')).toBe('Dec 1, 2025');
    expect(formatDayText('2026-05-31')).toBe('May 31, 2026');
    expect(formatDayText('')).toBe('');
    expect(formatMonthText('202512')).toBe('Dec 2025');
    expect(formatMonthText('202613')).toBe('');
  });
  it.each([
    ['Dec 1, 2025'], ['Dec 1 2025'], ['1 Dec 2025'], ['December 1, 2025'], ['1 December 2025'],
    ['DEC 1 2025'], ['  dec 1,   2025 '], ['2025-12-01'],
  ])('parseDayText(%j) is 2025-12-01', t => expect(parseDayText(t)).toBe('2025-12-01'));
  it.each([['Dec 2025'], ['december 2025'], ['DEC  2025'], ['2025-12']])
    ('parseMonthText(%j) is 202512', t => expect(parseMonthText(t)).toBe('202512'));
  it.each([['03/04/2026'], ['3.4.2026'], ['03-04-2026'], ['Feb 30, 2026'], ['Foo 1, 2025'], ['Dec 2025'], ['abc'], ['']])
    ('parseDayText(%j) is null', t => expect(parseDayText(t)).toBeNull());
  it.each([['04/2026'], ['4.2026'], ['Foo 2025'], ['Dec 1, 2025'], ['2025-13'], ['']])
    ('parseMonthText(%j) is null', t => expect(parseMonthText(t)).toBeNull());
  it('round-trips to the canonical form', () => {
    expect(formatDayText(parseDayText('december 1 2025'))).toBe('Dec 1, 2025');
    expect(formatMonthText(parseMonthText('DECEMBER 2025'))).toBe('Dec 2025');
  });
});
```

E nei test di `parseDateInput`: `{ error: 'Enter a date like Dec 1, 2025.' }`, `{ error: 'Enter a month like Dec 2025.' }`, e `parseDateInput('Jan 2026', { mode: 'month', min: '202603' })` → `{ error: 'Must be on or after Mar 2026.' }`; `parseDateInput('Dec 31, 2026', { mode: 'day', max: '2026-12-30' })` → `{ error: 'Must be on or before Dec 30, 2026.' }`.

- [ ] **Step 2: Esegui** `npx vitest run js/lib/dates.test.js` — atteso FAIL sui casi nuovi.

- [ ] **Step 3: Implementa** in `js/lib/dates.js`. Un array `MONTHS` di nomi interi inglesi; l'abbreviazione è il prefisso di 3 lettere. Un nome di mese è riconosciuto se, in minuscolo, è uguale all'abbreviazione o al nome intero. Normalizza il testo con `trim()` e la sostituzione di `\s+` con uno spazio. Pattern giorno, provati in ordine: ISO `^\d{4}-\d{2}-\d{2}$` (passa da `isDay`); `^([a-z]+) (\d{1,2}),? (\d{4})$`; `^(\d{1,2}) ([a-z]+) (\d{4})$`. Pattern mese: ISO `^(\d{4})-(\d{2})$`; `^([a-z]+) (\d{4})$`. La validità finale passa sempre da `isDay`/`isMonth`. Aggiorna i commenti JSDoc dei quattro formattatori/parser.

- [ ] **Step 4: Esegui** `npx vitest run js/lib/dates.test.js js/lib/dates-guard.test.js` — atteso PASS.

- [ ] **Step 5: Aggiorna `?v=`**: `dates.js?v=2` → `?v=3` in `costgrid.html`, `pipeline.html`, `project-config.html`. Verifica con `grep -rn "dates.js?v=" --include=*.html .`: un solo valore, `3`.

- [ ] **Step 6: Commit** `feat(dates): unambiguous English text format for typed and shown dates`.

---

### Task 2: componente, `css/controls.css`, costgrid

**Files:**
- Modify: `js/cg-controls.js` (`CgDatePicker`, righe 103-276; mixin `cgPopover`, righe 29-80)
- Create: `css/controls.css`
- Modify: `css/costgrid.css` (righe 866-1077 circa: le regole `.cg-ctl*`, `.cg-pop*`, `.cg-month-*`, `.cg-day-*`, `.cg-opt*`, `.cg-person*` della famiglia dei controlli vanno spostate; `.cg-task-date …` e `.cg-rm-*` restano)
- Modify: `costgrid.html` (`<link>` a `css/controls.css?v=1` dopo `style.css` e prima di `costgrid.css?v=7`; `cg-controls.js?v=5`; `costgrid.js?v=49`)
- Modify: `pipeline.html` (`costgrid.js?v=49`)
- Modify: `js/costgrid.js:54-61` (`cgFmtMonth`)
- Test: `js/lib/cg-controls-ui.test.js`, `js/lib/content-surface-guard.test.js` (se una delle sue regole lette da `costgrid.css` si sposta), `js/lib/costgrid-guard.test.js`

**Interfaces:**
- Consumes: Task 1 (`formatDayText`, `formatMonthText`, `parseDateInput` via `window`).
- Produces:
  - `<cg-date-picker mode="day|month" :model-value :min :max :disabled aria-label inline-popover @update:model-value>` — `inlinePopover: Boolean` (default `false`).
  - `css/controls.css?v=1`, che contiene tutto lo stile del componente; una pagina che usa `CgDatePicker` carica `css/controls.css`, `js/lib/cg-controls-calc.js?v=2` e `js/cg-controls.js?v=5`, e registra `.component('cg-date-picker', window.CgDatePicker)`.

- [ ] **Step 1: Scrivi i test che falliscono** in `js/lib/cg-controls-ui.test.js`, lo stesso stile statico che già legge la sorgente del picker:
  - `it('the date picker placeholders are the unambiguous format')` — la sorgente contiene `'Dec 1, 2025'` e `'Dec 2025'` e non contiene `dd/mm/yyyy` né `mm/yyyy`.
  - `it('the date input is not numeric-only')` — nessun `inputmode="numeric"` nel template di `CgDatePicker`; `maxlength="20"` presente.
  - `it('the popover can render inline')` — il template di `CgDatePicker` contiene `<Teleport to="body" :disabled="inlinePopover">` e il prop `inlinePopover`.
  - `it('an inline popover is absolutely positioned, not by viewport coordinates')` — `css/controls.css` ha una regola `.cg-pop.cg-pop--inline` con `position: absolute`; il template applica la classe `cg-pop--inline` quando `inlinePopover`.
  - `it('the modelValue watcher also clears the error (B-137)')` — il corpo del watcher `modelValue` contiene `this.error = ''`.
  - Il test esistente `css/costgrid.css defines .cg-ctl-error with tokens only` legge `css/controls.css`.

- [ ] **Step 2: Esegui** `npx vitest run js/lib/cg-controls-ui.test.js` — atteso FAIL.

- [ ] **Step 3: Implementa il componente** (`js/cg-controls.js`):
  - `ph` di default `'Dec 1, 2025'` / `'Dec 2025'`; via `inputmode="numeric"`; `:maxlength="20"`; aggiorna il commento di `openFromButton` ("typed path", senza `dd/mm/yyyy`).
  - Prop `inlinePopover`. Con il prop attivo, `<Teleport :disabled>` lascia il popover nel `.cg-ctl`, il popover riceve la classe `cg-pop--inline` e niente `:style="cgPopStyle"`, e `cgReposition` non viene chiamato (esci presto se `this.inlinePopover`).
  - Watcher `modelValue`: anche `this.error = ''`.
  - `.cg-pop--inline` in `controls.css`: `position: absolute; top: calc(100% + 4px); right: 0;` con la larghezza del popover giorno (252px) o mese (272px), come le due classi esistenti.

- [ ] **Step 4: Sposta gli stili.** Taglia da `css/costgrid.css` le regole della famiglia dei controlli, con i loro commenti, e incollale invariate in `css/controls.css`, sotto un'intestazione di una riga ("Custom form controls of js/cg-controls.js; loaded by every page that uses them"). Restano in `costgrid.css` le regole con un antenato specifico di costgrid (`.cg-task-date …`, `.cg-rm-*`, ogni selettore che inizia con un contenitore della pagina). Aggiorna i test statici che leggevano quelle regole da `costgrid.css` perché leggano `controls.css`.

- [ ] **Step 5: costgrid.** Carica `css/controls.css?v=1` in `costgrid.html`. Allarga `.cg-task-date .cg-ctl` (oggi 84px) quanto serve perché `Dec 31, 2026` stia senza troncare: misura con `scripts/shoot.mjs --eval` (`document.querySelector('.cg-task-date .cg-ctl-input')`, confronta `scrollWidth` e `clientWidth`) sullo stack del branch, come in §6.6.5. `cgFmtMonth(isoDate)` restituisce `formatDayText(toIso(isoDate) || '')`; aggiorna il commento `en-GB`.

- [ ] **Step 6: Esegui** `npx vitest run js/lib/cg-controls-ui.test.js js/lib/costgrid-guard.test.js js/lib/content-surface-guard.test.js js/lib/dates-guard.test.js` — atteso PASS.

- [ ] **Step 7: Verifica visiva** (Boards: nessuna tavola di costgrid cambia; il riferimento sono gli shot prima e dopo). `scripts/test-branch.sh up`, poi shoot di `costgrid.html?cgId=…` a 1440 e 1024 con `--base http://localhost:8081 --settle 3000`, uno stato col calendario giorno aperto. Rileggi i PNG: Start/End `Dec 2025`, le date dei task non troncate, la banda delle fasi `May 11, 2026 – …`, il popover identico a prima.

- [ ] **Step 8: Aggiorna `?v=`**: `cg-controls.js?v=5`, `costgrid.css?v=7`, `costgrid.js?v=49` (anche in `pipeline.html`). Verifica con grep: un solo valore per file.

- [ ] **Step 9: Commit** `feat(cg-date-picker): unambiguous format, inline popover, shared controls.css`.

---

### Task 3: project-config

**Files:**
- Modify: `project-config.html` (righe 83-84, 144-149, 420-427, 482-489, 653-655, 938-942; `<head>`; script in fondo; `.component(...)` alla riga 1086)
- Test: `js/lib/dates-guard.test.js` (un `describe` nuovo, poi esteso dal Task 5)

**Boards:** `docs/superpowers/design/config-project/config_form_part1.jpg` (Start/End "Dec 2025", periodo del task "Dec 1, 2025"), `docs/superpowers/design/config-project/config_form_tablet_smartphone.jpg` (solo per confermare che il campo intervallo unico resta fuori, ledger 4).

**Interfaces:**
- Consumes: Task 2 (`<cg-date-picker>`, `css/controls.css`), Task 1, `toIso`/`toYmd` del modulo date.

- [ ] **Step 1: Scrivi i test che falliscono** in `js/lib/dates-guard.test.js`, `describe('project-config date fields')`:
  - `project-config.html` non contiene `type="month"`, `gg/mm`, `ymdToIt`, `itToYmd`, `month2ym`, `ym2month`, `onDateChange`;
  - contiene quattro `<cg-date-picker` e `.component('cg-date-picker', window.CgDatePicker)`;
  - ogni `<cg-date-picker` ha `:disabled="isViewer"`;
  - un binding del periodo del task ha la forma `toIso(task.startDate) || ''` (Review Focus 5).

- [ ] **Step 2: Esegui** `npx vitest run js/lib/dates-guard.test.js` — atteso FAIL.

- [ ] **Step 3: Implementa** come da Spec §2.4:
  - Start/End mese: `:model-value="project.startDate || ''"`, `@update:model-value="v => project.startDate = v"`, `:max="project.endDate || ''"` sullo Start, `:min="project.startDate || ''"` sull'End, `aria-label` "Start month"/"End month". Togli le computed `startMonthInput`/`endMonthInput`, `month2ym`, `ym2month`, `onDateChange`.
  - Periodo del task: `:model-value="toIso(task.startDate) || ''"`, `@update:model-value="v => { task.startDate = v ? toYmd(v) : ''; rebuildTaskDist(ti); }"`, `:max="toIso(task.endDate) || ''"` sullo Start, `:min="toIso(task.startDate) || ''"` sull'End, `aria-label` "Task start date"/"Task end date"; lo stesso per `endDate`. Esponi `toIso`/`toYmd` ai template come metodi che delegano a `window`, come fa oggi `itToYmd`. Togli `ymdToIt`, `itToYmd` e il placeholder `gg/mm/aaaa`. Il wrapper delle date dei task mantiene una larghezza che contiene `Dec 31, 2026` (circa 150px; verifica nello shot).
  - `<link rel="stylesheet" href="css/controls.css?v=1">` dopo `style.css`; `js/lib/cg-controls-calc.js?v=2` e `js/cg-controls.js?v=5` dopo `dates.js`, nello stesso ordine di `costgrid.html`; `.component('cg-date-picker', window.CgDatePicker)` prima di `.mount('#app')`.

- [ ] **Step 4: Esegui** `npx vitest run js/lib/dates-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` — atteso PASS.

- [ ] **Step 5: Verifica visiva.** Shot di `project-config.html?projectId=…` a 1440 e 390 (Project info e un task espanso), più uno stato col calendario mese aperto. Rileggi i PNG e confrontali con `config_form_part1.jpg`. Elenca gli scostamenti di formato e di campo; quelli di layout sono del redesign.

- [ ] **Step 6: Commit** `feat(project-config): date pickers for project and task periods (B-129)`.

---

### Task 4: portfolio

**Files:**
- Modify: `portfolio.html` (righe 549-556; `<head>`; script 684-704; `.component(...)` alla riga 1708)
- Modify: `css/portfolio.css:582-583` (`.pr-period-custom-row`)
- Modify: `program.html` (`portfolio.css?v=8`)
- Test: `js/lib/dates-guard.test.js` (`describe('portfolio custom range')`)

**Boards:** nessuna tavola del portfolio mostra il Custom range; il riferimento è lo shot prima e dopo.

**Interfaces:**
- Consumes: Task 2 (`<cg-date-picker inline-popover>`), Task 1.

- [ ] **Step 1: Scrivi i test che falliscono:** `portfolio.html` non contiene `type="date"`; contiene due `<cg-date-picker mode="day"` con `inline-popover`, `:max="filterEnd"` su From e `:min="filterStart"` su To; carica `js/lib/dates.js?v=3`, `js/lib/cg-controls-calc.js?v=2`, `js/cg-controls.js?v=5`, `css/controls.css?v=1`; registra `cg-date-picker`.

- [ ] **Step 2: Esegui** `npx vitest run js/lib/dates-guard.test.js` — atteso FAIL.

- [ ] **Step 3: Implementa**: i due picker su `filterStart`/`filterEnd`, `@update:model-value="v => { filterStart = v; filterMonth = ''; }"` (lo stesso per `filterEnd`), `aria-label` "From"/"To". Gli script si caricano prima di `nav.js`, con `cg-controls.js` dopo i due moduli; il `<link>` va dopo `style.css`. Adatta `.pr-period-custom-row` sostituendo il selettore `input` con `.cg-ctl`; aggiorna `portfolio.css?v=8` in `portfolio.html` e `program.html`.

- [ ] **Step 4: Esegui** `npx vitest run js/lib/dates-guard.test.js js/lib/nav-shell-guard.test.js` — atteso PASS.

- [ ] **Step 5: Verifica visiva.** Shot della vista di reporting di un progetto del portfolio a 1440, con `--eval` che apre il menu Period e poi il calendario di From. Rileggi il PNG: il popover è sotto il campo dentro il menu, non spostato e non tagliato. Controlla col DOM, con lo stesso `--eval` che clicca un giorno, che `.pr-period-menu` abbia ancora la classe `show` (Review Focus 2).

- [ ] **Step 6: Commit** `feat(portfolio): custom range uses the shared date picker`.

---

### Task 5: guard di chiusura

**Files:**
- Test: `js/lib/dates-guard.test.js`

**Interfaces:**
- Consumes: i Task 1-4 completati.

- [ ] **Step 1: Aggiungi** a `js/lib/dates-guard.test.js`:
  - `it('no page uses a native date or month input')` — nessun `.html` della root contiene `type="date"` o `type="month"`;
  - `it('no date placeholder is numeric')` — nessun attributo `placeholder="…"` dei `.html` della root, e nessuna stringa del componente in `js/cg-controls.js`, corrisponde a `/\b(dd|mm|gg)\/(mm|dd|yy|aa)|yyyy|aaaa/i`;
  - `it('every page that loads js/cg-controls.js loads css/controls.css')`;
  - `it('cg-controls.js, cg-controls-calc.js and controls.css each carry one ?v=N')` — come il test esistente su `dates.js`.

- [ ] **Step 2: Esegui** `npx vitest run js/lib/dates-guard.test.js` — atteso PASS. Poi una prova a mano: reintroduci temporaneamente `type="month"` in `project-config.html`, il test deve fallire, quindi annulla con `git checkout -- project-config.html`.

- [ ] **Step 3: Commit** `test(dates): guard against native date inputs and numeric placeholders`.

La suite completa, la documentazione (CLAUDE.md "Dates" e il blocco `css/`, `docs/css/stylesheets.md`, `docs/js/cg-controls.md`, `docs/js/lib.md`, `docs/pages/*`) e le righe B-129/B-134/B-137 di `docs/BACKLOG.md` sono del `/finish-cycle`.

## Decisioni aperte

1. **Il popover inline è `position: absolute`, allineato a destra del campo.** Alternativa scartata: tenere `position: fixed` con `cgPos`. Perché: Popper mette un `transform` sul `.dropdown-menu`, e un `fixed` lì dentro si posiziona rispetto al menu, non al viewport.
2. **Versioni `?v=` aggiornate nel task che modifica il file, non in un task finale.** Alternativa scartata: un solo task di bump come in C1. Perché: il guard sull'accordo `?v=` di `dates.js` esiste già e fallirebbe tra un task e l'altro.
