# Date C1 — regola condivisa e validazione: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un modulo date unico, nel browser e come twin sul server, validazione di formato e ordine su ogni scrittura di date, chiusura dei bypass di `cg-date-picker`, e una regola documentata e pinnata da un guard.

**Architecture:**
- `js/lib/dates.js` è un modulo ES con bridge su `window`; `api/src/lib/dates.js` è il suo twin CommonJS, con una tabella di casi in comune.
- Le route chiamano `periodError`/`periodChangeError` e rifiutano con `DATE_RULE`.
- Il picker delega a `parseDateInput` lettura e controllo dei limiti.
- La regola sta in CLAUDE.md, e `js/lib/dates-guard.test.js` la pinna.

**Tech Stack:** Vue 3 da CDN, script classici e moduli `js/lib/`, Express + PostgreSQL, vitest + jsdom, `node:test`, `test-api.js`.

**Spec:** `docs/superpowers/specs/2026-10-24-dates-c1-shared-rule-design.md`
**Branch:** `dates-c1-shared-rule`
**Risk class:** high-risk — file condivisi caricati da più pagine (`js/core.js`, `js/api-sync.js`, `js/costgrid.js`).

**Esecuzione:**
- **Fondazione:** i Task 1 e 2 vanno eseguiti per primi e in quest'ordine.
- **Task indipendenti:** i Task 3, 4, 5 e 6 dipendono solo dalle interfacce dei Task 1 e 2, non toccano gli stessi file e possono andare in qualunque ordine.
- **Chiusura:** il Task 7 (versioni `?v=`) e il Task 8 (guard e documentazione) vengono per ultimi.
- **Worktree:** `.claude/worktrees/dates-c1-shared-rule` per §6.1b, con `.env` copiato dal checkout principale e `npm ci`.

## Global Constraints

- Il testo visibile all'utente è in inglese.
- Rifiuto lato server: `400 { error, code: 'DATE_RULE' }`, prima di qualunque scrittura. Il codice `DATE_RULE` è esportato da `api/src/lib/dates.js`.
- Formati di storage invariati:
  - versione e progetto: `YYYYMM`;
  - task: `YYYYMMDD`;
  - in memoria in costgrid i task sono ISO `YYYY-MM-DD`.
- Formato digitato e visualizzato in C1: `dd/mm/yyyy` e `mm/yyyy`, come oggi.
- Messaggi esatti, copiati dalla Spec §2.1 e §2.3:
  - `Invalid <label> start date "<v>": expected YYYYMM.` oppure `… expected YYYY-MM-DD.` (lo stesso per `end`);
  - `<Label> end date (<end>) is before its start date (<start>).`, con i mesi mostrati come `YYYY-MM` e i giorni come `YYYY-MM-DD`; `<Label>` è `label` con l'iniziale maiuscola;
  - picker: `Enter a date as dd/mm/yyyy.`, `Enter a month as mm/yyyy.`, `Must be on or after <min>.`, `Must be on or before <max>.`;
  - project-config: `Reason: <server error>`.
- Durante i task si lanciano solo i test toccati:
  - frontend: `npx vitest run <file>`;
  - backend `lib/` puri: `node --test src/lib/<file>` da `api/`;
  - `test-api.js` solo su stack isolato con `scripts/run-tests.sh`, mai sul main stack.
- Nessuna migration. Nessun comando Docker di ciclo di vita sul main stack.
- Versioni di partenza:

  | File | Versione | Riferimenti |
  |---|---|---|
  | `js/core.js` | `?v=14` | 19 |
  | `js/api-sync.js` | `?v=25` | 6 |
  | `js/costgrid.js` | `?v=47` | 2 |
  | `js/cg-controls.js` | `?v=2` | 1 |
  | `js/lib/cg-controls-calc.js` | `?v=1` | 1 |
  | `js/lib/project-push-result.js` | `?v=1` | 1 |
  | `css/costgrid.css` | `?v=5` | 1 |

  Si aggiornano tutti nel Task 7. I Task 1-6 non toccano i `?v=`, a parte l'aggiunta dei nuovi tag di `dates.js`.

## Review Focus

1. **L'autosave re-invia un periodo vuoto** (`startDate: null` contro un `NULL`, `''` o `'      '` del DB, perché `CHAR(6)` aggiunge spazi): deve risultare "invariato" e non essere rifiutato. Test in `periodChangeError` (Task 2) e `DT-08` (Task 3).
2. **Un PATCH di un progetto che non tocca le date** (solo `name`) su un progetto con il periodo salvato: nessun controllo date. Test `DT-09` (Task 3).
3. **Task con una sola data** (Start senza End) in `PUT …/structure` e in `PUT /projects/:id/tasks`: accettato. Test `DT-10` (Task 3).
4. **Campo del picker svuotato** con `min`/`max` impostati: emette `''` e non mostra errori. Test `parseDateInput('', …)` (Task 1).
5. **Valore digitato uguale al limite** (`min` o `max`): accettato, perché i limiti sono inclusivi. Test `parseDateInput` (Task 1).

---

### Task 1: `js/lib/dates.js`, il modulo del browser

**Files:**
- Create: `js/lib/dates.js`, `js/lib/dates.test.js`
- Modify: `js/lib/cg-controls-calc.js` (rimuove `parseItDate`, `formatItDate`, `parseMonthInput`, `formatMonthInput` e i loro bridge), `js/lib/cg-controls-calc.test.js` (i casi di quelle quattro funzioni si spostano in `dates.test.js` con i nuovi nomi), `js/cg-controls.js` (le chiamate `window.parseItDate`/`formatItDate`/`parseMonthInput`/`formatMonthInput` diventano `window.parseDayText`/`formatDayText`/`parseMonthText`/`formatMonthText`), `costgrid.html` (aggiunge `<script type="module" src="js/lib/dates.js?v=1"></script>` subito prima di `js/lib/cg-controls-calc.js`)

**Interfaces:**
- Produces, tutte esportate e con il bridge `window.<name>`:
  - `isMonth(v): boolean`, `isDay(v): boolean`, `toYmd(v): string|null`, `toIso(v): string|null`, `monthFirstDay(ym): string|null`, `monthLastDay(ym): string|null`, `isOrdered(start, end): boolean`, `periodError(start, end, { kind: 'month'|'day', label: string }): string|null`. La semantica è nella tabella della Spec §2.1;
  - `parseDayText(text): string|null` (ISO), `formatDayText(iso): string`, `parseMonthText(text): string|null` (YYYYMM), `formatMonthText(ym): string`, con la stessa semantica delle quattro funzioni rimosse;
  - `parseDateInput(text, { mode: 'day'|'month', min?: string, max?: string }): { value: string } | { error: string }`. Testo vuoto → `{ value: '' }`. Illeggibile → `{ error: 'Enter a date as dd/mm/yyyy.' }` (in modalità mese: `'Enter a month as mm/yyyy.'`). Sotto `min` → `{ error: 'Must be on or after ' + formatDayText(min) + '.' }` (in modalità mese con `formatMonthText`). Sopra `max` → `Must be on or before …`. Altrimenti `{ value }`. I limiti sono inclusivi;
  - `isWithin(value, min, max): boolean`: `true` se `value` è dentro i limiti inclusivi, ignorando i limiti vuoti. I tre valori sono dello stesso tipo (tutti `YYYYMM` o tutti ISO).

- [ ] **Step 1: Scrivi `js/lib/dates.test.js`**, con almeno questi casi:
  - `isDay('20260431') === false`, `isDay('20260229') === false`, `isDay('20240229') === true`, `isDay('2026-04-30') === true`, `isDay('15/03/20') === false`;
  - `isMonth('202613') === false`, `isMonth('202600') === false`, `isMonth('2026-05') === false`, `isMonth(' 202605') === false`, `isMonth('202605') === true`;
  - `toYmd('2026-04-30') === '20260430'`, `toYmd('2026-04-31') === null`, `toIso('20260430') === '2026-04-30'`;
  - `monthFirstDay('202602') === '2026-02-01'`, `monthLastDay('202602') === '2026-02-28'`, `monthLastDay('202402') === '2024-02-29'`;
  - `isOrdered('202609', '202607') === false`, `isOrdered('202607', '202607') === true`, `isOrdered('', '202607') === true`, `isOrdered(null, undefined) === true`, `isOrdered('202613', '') === false`, `isOrdered('2026-03-02', '20260301') === false` (formati misti di giorno);
  - `periodError('202609', '202607', { kind: 'month', label: 'version' }) === 'Version end date (2026-07) is before its start date (2026-09).'`;
  - `periodError('2026-05', '', { kind: 'month', label: 'version' }) === 'Invalid version start date "2026-05": expected YYYYMM.'`;
  - `periodError('2026-04-31', '', { kind: 'day', label: 'task "T1"' }) === 'Invalid task "T1" start date "2026-04-31": expected YYYY-MM-DD.'`;
  - `parseDateInput('', { mode: 'day', min: '2026-03-01' })` → `{ value: '' }` (Review Focus 4);
  - `parseDateInput('01/03/2026', { mode: 'day', min: '2026-03-01', max: '2026-03-31' })` → `{ value: '2026-03-01' }`, e `'31/03/2026'` → `{ value: '2026-03-31' }` (Review Focus 5);
  - `parseDateInput('28/02/2026', { mode: 'day', min: '2026-03-01' })` → `{ error: 'Must be on or after 01/03/2026.' }`;
  - `parseDateInput('31/04/2026', { mode: 'day' })` → `{ error: 'Enter a date as dd/mm/yyyy.' }`;
  - `parseDateInput('08/2026', { mode: 'month', max: '202607' })` → `{ error: 'Must be on or before 07/2026.' }`;
  - `isWithin('202608', '', '202607') === false`, `isWithin('202607', '202601', '202607') === true`.
  - Inoltre i casi esistenti di `parseItDate`/`formatItDate`/`parseMonthInput`/`formatMonthInput`, spostati dal file di `cg-controls-calc` con i nuovi nomi.
- [ ] **Step 2: Lancia `npx vitest run js/lib/dates.test.js`.** Atteso: FAIL, modulo assente.
- [ ] **Step 3: Implementa `js/lib/dates.js`.** Il controllo di calendario usa `Date.UTC`, come `cg-controls-calc.js`. Le quattro funzioni di testo si spostano qui; poi aggiorna `cg-controls-calc.js`, `cg-controls.js` e `costgrid.html` come elencato in **Files**.
- [ ] **Step 4: Lancia `npx vitest run js/lib/dates.test.js js/lib/cg-controls-calc.test.js js/lib/cg-controls-ui.test.js`.** Atteso: PASS.
- [ ] **Step 5: Commit** — `feat(dates): js/lib/dates.js, the single browser date module`.

### Task 2: `api/src/lib/dates.js`, il twin del server, e il test di parità

**Files:**
- Create: `api/src/lib/dates.js`, `api/src/lib/dates.test.js`, `js/lib/dates-guard.test.js` (per ora solo il blocco di parità)
- Modify: `api/src/lib/date-parse.js` (importa `isValidCalendarDate` da `./dates` invece di definirlo, e continua a riesportarlo)

**Interfaces:**
- Consumes: la semantica del Task 1.
- Produces (`module.exports`):
  - `isMonth`, `isDay`, `toYmd`, `toIso`, `monthFirstDay`, `monthLastDay`, `isOrdered`, `periodError`, identici al Task 1;
  - `isValidCalendarDate(year, month, day): boolean`;
  - `DATE_RULE = 'DATE_RULE'`;
  - `periodChangeError(body, stored, { kind, label }): string|null`. `body = { start, end }`, dove `undefined` vuol dire che il campo non è nel body; `stored = { start, end }` come letto dal DB. Normalizzazione: `null`, `''` e soli spazi valgono vuoto, e si applica `trim()`. Se ogni campo presente nel body, normalizzato, è uguale allo stored normalizzato → `null`. Altrimenti → `periodError(body.start ?? stored.start, body.end ?? stored.end, …)`, sui valori normalizzati.

- [ ] **Step 1: Scrivi `api/src/lib/dates.test.js`** (`node:test`):
  - `periodChangeError({ start: '202609', end: '202607' }, { start: '202609', end: '202607' }, { kind: 'month', label: 'version' }) === null` (dato preesistente tollerato, criterio 4 della Spec);
  - `periodChangeError({ start: null, end: null }, { start: '      ', end: null }, …) === null` (Review Focus 1);
  - `periodChangeError({ end: '202607' }, { start: '202609', end: '202612' }, …)` → il messaggio d'ordine;
  - `periodChangeError({}, { start: '202609', end: '202607' }, …) === null`;
  - `DATE_RULE === 'DATE_RULE'`.
- [ ] **Step 2: Scrivi in `js/lib/dates-guard.test.js` il blocco "twins agree".** Una tabella di casi `[fnName, args]` che copre ogni caso del Task 1 Step 1 per le otto funzioni comuni. Viene eseguita su `import * as web from './dates.js'` e su `createRequire(import.meta.url)('../../api/src/lib/dates.js')`, con `expect(server[fn](...args)).toEqual(web[fn](...args))`.
- [ ] **Step 3: Lancia `node --test src/lib/dates.test.js` da `api/` e `npx vitest run js/lib/dates-guard.test.js`.** Atteso: FAIL.
- [ ] **Step 4: Implementa `api/src/lib/dates.js` e aggiorna `date-parse.js`.**
- [ ] **Step 5: Lancia i due comandi dello Step 3 e `node --test src/lib/date-parse.test.js`.** Atteso: PASS.
- [ ] **Step 6: Commit** — `feat(dates): server twin api/src/lib/dates.js + parity test`.

### Task 3: Route di versioni, progetti e task

**Files:**
- Modify: `api/src/routes/cost-grids.js` (`POST /:id/versions` `:386-418`, `PATCH /:id/versions/:vId` `:421-…`, `PUT …/structure` `:633-…`), `api/src/routes/projects.js` (`POST /` `:154-…`, `PATCH /:id` `:204-…`, `PUT /:id/tasks` `:381-416`), `test-api.js` (nuova `testDateRule()`, chiamata dal main subito dopo `testStructureRule()`)

**Interfaces:**
- Consumes: `periodError`, `periodChangeError`, `toYmd`, `DATE_RULE` (Task 2).

Comportamento, dalla Spec §2.2:
- **Version POST:** `periodError(startDate, endDate, { kind: 'month', label: 'version' })`, subito dopo il controllo di `label` e prima di `versionCreationError`.
- **Version PATCH:** se `startDate` o `endDate` sono nel body, si legge `start_date, end_date` (la `SELECT` esistente a `:427` si estende con queste colonne) e si applica `periodChangeError`.
- **Project POST:** `label: 'project'`.
- **Project PATCH:** `periodChangeError` sul periodo salvato del progetto.
- **`PUT …/structure`:** nel ciclo di pre-validazione delle ore vendute, `periodError(tk.taskStartDate || tk.start_date, tk.taskEndDate || tk.end_date, { kind: 'day', label: \`task "${titolo}"\` })`. Il lambda `normDate` diventa `v => toYmd(v) ?? ''`.
- **`PUT /:id/tasks`:** la stessa validazione prima del `DELETE`, poi `toYmd(t.startDate) ?? null`.
- Ogni rifiuto è `res.status(400).json({ error, code: DATE_RULE })`.

- [ ] **Step 1: Scrivi `testDateRule()` in `test-api.js`**, con setup come `testStructureRule` (anno `TEST_YEAR_C`, proposta e versione, progetto collegato con `cgVersionId`). Le etichette:
  - `DT-01` su una proposta nuova senza versioni (`__test_dt_cg2__`), version POST con `startDate: '202609', endDate: '202607'` → 400 `DATE_RULE`, e `GET /api/cost-grids/:id/versions` resta vuoto;
  - `DT-02` version PATCH `{ startDate: '2026-05' }` → 400 `DATE_RULE`;
  - `DT-03` version PATCH `{ startDate: '202602', endDate: '202612' }` → 200; poi `{ endDate: '202601' }` → 400 `DATE_RULE`, e `GET` mostra ancora `202612`;
  - `DT-04` project PATCH `{ startDate: '202609', endDate: '202607' }` → 400 `DATE_RULE`;
  - `DT-05` `PUT …/structure` con un task `{ title: 'T1', taskStartDate: '2026-04-31' }` → 400 `DATE_RULE`, e la struttura `GET` è invariata;
  - `DT-06` lo stesso con `taskStartDate: '2026-05-10', taskEndDate: '2026-05-01'` → 400;
  - `DT-07` `PUT /api/projects/:id/tasks` con `[{ name: 'X', startDate: '20260510', endDate: '20260501' }]` → 400, e i task del progetto sono invariati;
  - `DT-08` version PATCH che re-invia lo stesso periodo valido con `startDate: null` e `endDate: null` su una versione senza periodo → 200 (Review Focus 1);
  - `DT-09` project PATCH `{ name: '…' }` su un progetto con periodo → 200 (Review Focus 2);
  - `DT-10` `PUT …/structure` con un task che ha solo `taskStartDate: '2026-05-10'` → 200, e `PUT /projects/:id/tasks` con solo `startDate` → 200 (Review Focus 3).

  Il progetto si crea come admin, collegato alla versione. Se il PATCH del progetto viene rifiutato da `PROJECT_RULE` per un altro motivo, usa `sysadminCookie` come fanno i test PR.
- [ ] **Step 2: Lancia `scripts/run-tests.sh` dal worktree.** Atteso: i `DT-*` falliscono, gli altri passano.
- [ ] **Step 3: Implementa le route.**
- [ ] **Step 4: Lancia di nuovo `scripts/run-tests.sh`.** Atteso: tutto PASS.
- [ ] **Step 5: Commit** — `feat(api): DATE_RULE on version, project and task date writes`.

### Task 4: Ingest dei timesheet

**Files:**
- Modify: `api/src/routes/timesheets.js` (`formatDate` `:412-421`), `test-api.js` (in `testDateRule()`)

**Interfaces:**
- Consumes: `toIso` (Task 2).

- [ ] **Step 1: Aggiungi `DT-11`.** Un `uploadCsv('/api/timesheets/upload', …)` con l'header di MA-04 (`projectId,date,task,role,owner,hours`) e una riga con data `2026-13-45` → 400. Il messaggio contiene `row 2`.
- [ ] **Step 2: `scripts/run-tests.sh`.** Atteso: `DT-11` FAIL.
- [ ] **Step 3: Nel ramo ISO**, `const iso = toIso(s.slice(0, 10)); if (!iso) throw new Error(\`"${s}" is not a valid calendar date\`); return iso;`.
- [ ] **Step 4: `scripts/run-tests.sh`.** Atteso: PASS.
- [ ] **Step 5: Commit** — `fix(timesheets): reject impossible ISO dates`.

### Task 5: `cg-date-picker`, errore in linea e scorciatoie limitate

**Files:**
- Modify: `js/cg-controls.js` (`CgDatePicker`, `:103-276`), `css/costgrid.css` (classe `.cg-ctl-error`), `js/lib/cg-controls-ui.test.js`, `docs/BACKLOG.md` (B-030)

**Interfaces:**
- Consumes: `window.parseDateInput`, `window.isWithin`, `window.formatDayText`, `window.formatMonthText` (Task 1).

Comportamento, dalla Spec §2.3:
- `data()` aggiunge `error: ''`.
- `commitTyped()` chiama `parseDateInput(this.text, { mode, min, max })`:
  - con `{ error }`: imposta `this.error`, il testo torna a `this.display` e non c'è emit;
  - con `{ value }`: azzera l'errore, poi segue la logica attuale (emit se diverso, testo vuoto incluso).
- L'evento `@input` e `pick()` azzerano `error`.
- Nel template, sotto `.cg-ctl-field`: `<div v-if="error" class="cg-ctl-error" role="alert">{{ error }}</div>`.
- "This month" e "Next month": `:disabled="!isWithin(<ym calcolato>, min, max)"`. Il calcolo del mese esce da `pickRelativeMonth` in un metodo `relativeMonth(offset)`, così pulsante e scelta condividono lo stesso valore.
- `.cg-ctl-error`: testo `var(--text-xs)`, colore `var(--color-danger-text)`, margine superiore piccolo. Solo token, nessun hex.
- B-030: la descrizione aggiunge "Third part (`commitTyped()` ignores `min`/`max`) closed by `dates-c1-shared-rule`". `State` resta `open`. `Verified how` cita `js/lib/cg-controls-ui.test.js` e `js/lib/dates.test.js`.

- [ ] **Step 1: In `js/lib/cg-controls-ui.test.js` aggiungi un test statico** (stesso stile del file):
  - `commitTyped` chiama `parseDateInput(` e non chiama più `parseItDate(`/`parseMonthInput(`;
  - il template contiene `class="cg-ctl-error"` con `role="alert"`;
  - entrambi i pulsanti scorciatoia hanno un `:disabled=` che contiene `isWithin(`;
  - `css/costgrid.css` definisce `.cg-ctl-error` senza `#` esadecimali nella regola.
- [ ] **Step 2: `npx vitest run js/lib/cg-controls-ui.test.js`.** Atteso: FAIL.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4: `npx vitest run js/lib/cg-controls-ui.test.js js/lib/dates.test.js`.** Atteso: PASS.
- [ ] **Step 5: Commit** — `fix(cg-date-picker): typed values and shortcuts honour min/max, inline error (B-030 part 3)`.

### Task 6: Notifiche, motivo del rifiuto, Generate project, pulizia

**Files:**
- Modify: `js/api-sync.js` (`_cgUpsertVersionToApi` `:155-210`, `_pushProjectToApiDetailed`), `js/lib/project-push-result.js`, `js/lib/project-push-result.test.js`, `js/lib/api-sync-upsert.test.js`, `js/costgrid.js` (`:64-77`, `:1105-1106`, `:1240-1241`, `:1256-1264`), `costgrid.html` (`:1108`, `:1689-1696`), `project-config.html` (`:937-949`, e aggiunge `<script type="module" src="js/lib/dates.js?v=1"></script>` prima di `js/lib/project-push-result.js`), `pipeline.html` (aggiunge lo stesso tag prima di `js/costgrid.js`), `js/core.js` (rimuove `:162-174`)

**Interfaces:**
- Consumes: `window.toYmd`, `window.isOrdered`, `window.parseDayText` (Task 1); `DATE_RULE` come stringa `'DATE_RULE'`.
- Produces:
  - `summarizePushResult(failed)`: ogni elemento può portare `code` e `reason`. Quando `code ∈ {'DATE_RULE', 'PROJECT_RULE', 'STRUCTURE_RULE'}` e `reason` non è vuoto, il messaggio diventa quello attuale seguito da ` Reason: ${reason}`;
  - una funzione pura `cgGeneratedPeriod(v, selTasks, now)` estratta da `js/costgrid.js:1256-1264`, che restituisce `{ projStart, projEnd }`.

Comportamento:
- **`_cgUpsertVersionToApi`:**
  - `_cgStructureRuleNotified` diventa `_cgRuleNotified`;
  - nel `catch` del PATCH della versione, quando `e.data?.code === 'DATE_RULE'`, c'è lo stesso `showInfo` una volta per versione già usato per `STRUCTURE_RULE`, prima del `return false`;
  - il `catch` della struttura notifica sia `STRUCTURE_RULE` sia `DATE_RULE`.
- **`_pushProjectToApiDetailed`:** ogni `failed.push({ part, error })` aggiunge `code: e.data?.code, reason: e.data?.error`. Lo stesso vale per i rami `updateErr`.
- **Generate project:** se `!isOrdered(projStart, projEnd)`, il lato che non viene da `v.startDate`/`v.endDate` prende il valore dell'altro lato. I `.replace(/-/g, '')` di `:1105-1106` e `:1240-1241` diventano `toYmd(x) || ''`.
- **`cgIsoToIt`/`cgItToIso`:** escono da `js/costgrid.js` e dalla destrutturazione `costgrid.html:1108`. Il ramo evento di `onTaskDateChange` usa `parseDayText(valueOrEvent.target.value) || ''`.
- **project-config:** `itToYmd(it)` restituisce `toYmd(parseDayText(it)) || ''`.
- **`js/core.js`:** rimuove `ym2month`, `month2ym`, `ymd2date`, `date2ymd`. `parseTaskDate` resta.

- [ ] **Step 1: Scrivi i test.**
  - `project-push-result.test.js`: `summarizePushResult([{ part: 'project', error: 'x', code: 'DATE_RULE', reason: 'Project end date (2026-07) is before its start date (2026-09).' }]).message` termina con ` Reason: Project end date (2026-07) is before its start date (2026-09).`; con `code: 'OTHER'` il messaggio è invariato.
  - `api-sync-upsert.test.js`: con il PATCH della versione rifiutato `{ data: { code: 'DATE_RULE', error: 'E' } }`, `showInfo` viene chiamato una volta su due chiamate consecutive per la stessa versione, e il messaggio contiene `E`.
  - Un nuovo `js/lib/costgrid-generate-period.test.js`, con l'estrattore `scripts/lib/extract-source.mjs` su `cgGeneratedPeriod`, iniettando `isOrdered` da `./dates.js` nel `new Function`: con `v = { startDate: '202812', endDate: '' }`, nessun task datato e `now = new Date(2026, 9, 24)` → `{ projStart: '202812', projEnd: '202812' }`; con `v = { startDate: '202602', endDate: '202612' }` → invariato.
  - Un test statico (in `js/lib/costgrid-editor-followups.test.js`): `js/core.js` non definisce più `date2ymd`/`ym2month`, e `js/costgrid.js` non definisce più `cgItToIso`.
- [ ] **Step 2: `npx vitest run` sui quattro file.** Atteso: FAIL.
- [ ] **Step 3: Implementa.**
- [ ] **Step 4: `npx vitest run` sui quattro file più `js/lib/nav-shell-guard.test.js` e `js/lib/foundations-guard.test.js`.** Atteso: PASS.
- [ ] **Step 5: Commit** — `fix(dates): DATE_RULE notices, push reason, generated period, drop duplicate converters`.

### Task 7: Versioni `?v=`

**Files:** ogni `.html` che referenzia un file versionato toccato.

- [ ] **Step 1: Porta tutti i riferimenti alle nuove versioni:**
  - `js/core.js?v=15` (19 riferimenti);
  - `js/api-sync.js?v=26` (6);
  - `js/costgrid.js?v=48` (2);
  - `js/cg-controls.js?v=3`;
  - `js/lib/cg-controls-calc.js?v=2`;
  - `js/lib/project-push-result.js?v=2`;
  - `css/costgrid.css?v=6`.

  Per gli `.html` usa lo strumento Edit o `sed`, mai `Set-Content` (BOM).
- [ ] **Step 2: Verifica.**
  - `grep -rhoE "(core|api-sync|costgrid|cg-controls|cg-controls-calc|project-push-result)\.js\?v=[0-9]+|costgrid\.css\?v=[0-9]+" --include=*.html . | sort | uniq -c` mostra una sola versione per file;
  - `npx vitest run js/lib/foundations-guard.test.js js/lib/nav-shell-guard.test.js` passa.
- [ ] **Step 3: Commit** — `chore: bump ?v= for the files touched by dates C1`.

### Task 8: Guard completo e documentazione

**Files:**
- Modify: `js/lib/dates-guard.test.js` (aggiunge i controlli 1-4 della Spec §2.4), `CLAUDE.md` (nuova sezione `### Dates`, subito dopo `### Money formatting and parsing`), `docs/js/lib.md` (voce `dates.js`), `docs/api/lib.md` (voce `dates.js`)

- [ ] **Step 1: Aggiungi i controlli a `dates-guard.test.js`**, con la stessa `walk` di `money-guard.test.js`:
  1. `isNaN(new Date(` e `.replace(/-/g` compaiono, nei file `.js`/`.html` che non sono test, solo in `js/lib/dates.js` e `api/src/lib/dates.js`. Esenzione chiusa: prefissi `api/src/scripts/` e `api/src/db/`, più il file `api/src/restore-backup.js`;
  2. ogni file `api/src/routes/*.js` il cui testo corrisponde a `/INSERT INTO (cost_grid_versions|projects|tasks|project_tasks)\b|UPDATE (cost_grid_versions|projects|tasks|project_tasks) SET/` contiene `require('../lib/dates')`;
  3. ogni `.html` alla radice che contiene `js/cg-controls.js` o una chiamata `\b(parseDayText|formatDayText|parseMonthText|formatMonthText|parseDateInput|isWithin|toYmd|toIso|isOrdered)\(` contiene `js/lib/dates.js` (anche `pipeline.html`, per via di `js/costgrid.js`: il test elenca nella regex anche il tag `js\/costgrid\.js`);
  4. tutti i riferimenti `dates.js?v=N` hanno lo stesso `N`.
- [ ] **Step 2: Lancia `npx vitest run js/lib/dates-guard.test.js`.** Atteso: PASS. Verifica a mano che fallisca davvero:
  - aggiungendo `isNaN(new Date('x'))` a `project-config.html`;
  - togliendo il `require` da `api/src/routes/projects.js`.

  Ripristina subito dopo (criterio 2 della Spec).
- [ ] **Step 3: Scrivi la sezione `### Dates` di CLAUDE.md**, nello stile di "Money formatting and parsing". Contenuto:
  - una sola implementazione, `js/lib/dates.js` più il twin `api/src/lib/dates.js`;
  - nessuna validazione o normalizzazione di date fuori da lì, e il nome del guard invece dei suoi controlli;
  - ogni route che scrive date usa `periodError`/`periodChangeError` e risponde `400 { error, code: 'DATE_RULE' }`;
  - ogni campo data con un gemello passa `min`/`max`, e il picker legge il testo solo con `parseDateInput`;
  - i dati preesistenti non validi sono tollerati finché le date non cambiano;
  - il link "Full detail" a `docs/js/lib.md` e `docs/api/lib.md`.

  Nessuna motivazione, nessun numero in prosa (regole "Writing documentation" di CLAUDE.md).
- [ ] **Step 4: Scrivi le voci `dates.js` in `docs/js/lib.md` e `docs/api/lib.md`**: elenco degli export e rimando alla sezione di CLAUDE.md per le regole.
- [ ] **Step 5: Lancia `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js js/lib/dates-guard.test.js`, poi `npm test`, poi da `api/` `npm test`.** Atteso: tutto PASS.
- [ ] **Step 6: Commit** — `docs+test: Dates rule in CLAUDE.md, full dates guard`.

## Decisioni aperte

1. **Lettura e controllo dei limiti del testo digitato in `dates.js` (`parseDateInput`), non nel componente.** Alternativa scartata: logica nel metodo `commitTyped`. Perché: così è testabile come funzione pura e resta nell'unico punto che C2 cambierà.
2. **La logica "invariato → nessun controllo" è una funzione pura del twin (`periodChangeError`) e il caso "periodo già invertito" è pinnato a livello unitario.** Alternativa scartata: provarlo in `test-api.js`. Perché: dopo questo ciclo l'API non può più creare un periodo invertito e `test-api.js` non accede al DB. La versione reale `ce702b4c` si può verificare al Gate 2 sullo stack di branch, che clona i dati del main.
3. **`cg-controls-calc.js` non importa `dates.js`; il componente legge i bridge `window.*`.** Alternativa scartata: un `import` tra moduli `js/lib/`. Perché: le funzioni spostate non servono più a `cg-controls-calc.js`, e un import senza `?v=` creerebbe una seconda istanza del modulo con una chiave di cache non versionata.
