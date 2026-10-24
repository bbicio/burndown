# Spec — date, ciclo C1: regola condivisa e validazione di formato e ordine

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-24-dates-c1-shared-rule-brief.md` (Scenario 3, audit-fix).
**Audit:** `docs/superpowers/audits/2026-10-24-dates-form-validation-audit.md`, finding D-15, D-01, D-02, D-03, D-14, D-05, D-06, D-12 (parte periodo).
Design concordato in chat il 2026-10-24 (una fermata, §6b).

## 1. Scope

Un modulo date unico nel browser e il suo twin sul server. Validazione di formato e ordine su ogni route che scrive date. Chiusura dei due bypass di `cg-date-picker`. Una regola documentata in CLAUDE.md e pinnata da un guard test. Il comportamento attuale, con le citazioni, è nel Brief e nell'audit.

Fatti emersi nel brainstorming:
- Il container `api` monta solo `./api/src` (`docker-compose.yml`), quindi il server non può importare `js/lib/`.
- L'autosave di costgrid rimanda il periodo a ogni salvataggio (`js/api-sync.js:171-188`). Se il PATCH della versione fallisce, la funzione esce prima di salvare la struttura e lo registra solo con `console.warn`.
- `summarizePushResult` (`js/lib/project-push-result.js:14-22`) non riporta il messaggio del server.
- `date2ymd`, `ymd2date`, `ym2month` e `month2ym` di `js/core.js:162-174` non hanno chiamanti: project-config usa le proprie copie, definite nel suo modulo (`project-config.html:420-427`).

## 2. Comportamento atteso

### 2.1 I due moduli

**`js/lib/dates.js`**: modulo ES, `export function …`, con una riga di bridge `window.<name> = <name>` per ogni export. **`api/src/lib/dates.js`**: CommonJS. Le funzioni comuni hanno lo stesso nome e la stessa semantica:

| Funzione | Ingresso | Uscita |
|---|---|---|
| `isMonth(v)` | qualsiasi | `true` solo per `YYYYMM` con mese tra 01 e 12 |
| `isDay(v)` | qualsiasi | `true` solo per `YYYYMMDD` o `YYYY-MM-DD` di un giorno di calendario esistente |
| `toYmd(v)` | un giorno nei due formati | `YYYYMMDD`, oppure `null` se `!isDay(v)` |
| `toIso(v)` | un giorno nei due formati | `YYYY-MM-DD`, oppure `null` |
| `monthFirstDay(ym)` / `monthLastDay(ym)` | `YYYYMM` | ISO del primo e dell'ultimo giorno del mese, oppure `null` |
| `isOrdered(start, end)` | due mesi, oppure due giorni | `true` se un lato è vuoto (`''`, `null`, `undefined`), oppure se entrambi sono validi e `end ≥ start`; `false` se un lato non vuoto non è valido o se l'ordine è invertito |
| `periodError(start, end, { kind, label })` | `kind` = `'month'` o `'day'`, `label` per il messaggio | `null`, oppure un messaggio in inglese che nomina il campo e il valore |

- Messaggi di `periodError`, uguali nei due moduli:
  - forma o data inesistente: `Invalid <label> start date "<v>": expected <YYYYMM|YYYY-MM-DD>.` (lo stesso per `end`);
  - ordine: `<Label> end date (<end>) is before its start date (<start>).`
  I mesi sono mostrati come `YYYY-MM`, i giorni come `YYYY-MM-DD`.
- Il controllo di calendario sul server è uno solo: `api/src/lib/date-parse.js` importa `isValidCalendarDate` da `dates.js` invece di definirlo.

Solo nel modulo del browser, come unico punto del formato visualizzato e digitato (C2 lo cambierà da qui):
- `parseDayText(text)` → ISO o `null`, e `formatDayText(iso)` → testo;
- `parseMonthText(text)` → `YYYYMM` o `null`, e `formatMonthText(ym)` → testo.

In C1 il formato resta quello attuale, `dd/mm/yyyy` e `mm/yyyy`. Queste quattro funzioni sostituiscono `parseItDate`, `formatItDate`, `parseMonthInput` e `formatMonthInput` di `js/lib/cg-controls-calc.js`, che vengono rimosse insieme ai loro bridge. `cg-controls-calc.js` importa da `./dates.js` quello che gli serve.

### 2.2 Server

- **Codice d'errore.** `DATE_RULE`, esportato da `api/src/lib/dates.js`. Ogni rifiuto è `400 { error: <messaggio di periodError>, code: 'DATE_RULE' }` e avviene prima di qualsiasi scrittura.
- **Version POST** (`api/src/routes/cost-grids.js`, `POST /:id/versions`): `periodError(startDate, endDate, { kind: 'month', label: 'version' })`.
- **Version PATCH** (`PATCH /:id/versions/:vId`), quando il body contiene `startDate` o `endDate`:
  - si legge il periodo salvato e si normalizzano `''`/`null` e gli spazi;
  - se ogni data presente nel body è uguale a quella salvata, non si controlla niente (dati preesistenti tollerati);
  - altrimenti si applica `periodError` al periodo combinato (body sopra i valori salvati).
- **Project POST e PATCH** (`api/src/routes/projects.js`): la stessa regola, con `label: 'project'`. La colonna è `CHAR(6)`: il valore salvato va confrontato dopo `trim()`.
- **`PUT /:id/versions/:vId/structure`:**
  - ogni task si valida con `periodError(taskStartDate || start_date, taskEndDate || end_date, { kind: 'day', label: 'task "<titolo>"' })`, nello stesso ciclo di pre-validazione delle ore vendute, prima della transazione;
  - il lambda `normDate` viene sostituito da `toYmd(v) ?? ''`.
- **`PUT /:id/tasks` dei progetti:** la stessa validazione per task (`label: 'task "<nome>"'`) prima del `DELETE`, e il valore salvato è `toYmd(v)` oppure `null`.
- **Timesheet** (`api/src/routes/timesheets.js`, `formatDate`): il ramo ISO restituisce `toIso(s.slice(0, 10))`. Se il risultato è `null` lancia `"<s>" is not a valid calendar date`, che il chiamante trasforma già nel rifiuto dell'intero file con il numero di riga.

### 2.3 Client

- **`cg-date-picker`** (`js/cg-controls.js`):
  - Il picker ha un dato `error` e lo mostra con `<div class="cg-ctl-error" role="alert">` sotto il campo quando non è vuoto. L'`input` successivo o una scelta valida lo azzerano.
  - `commitTyped()`:
    - testo illeggibile → `error` = `Enter a date as dd/mm/yyyy.` (in modalità mese: `Enter a month as mm/yyyy.`). Il testo torna al valore precedente e non c'è emit;
    - valore fuori limite → `error` = `Must be on or after <min>.` oppure `Must be on or before <max>.`, con il limite formattato da `formatDayText`/`formatMonthText`. Il testo torna al valore precedente e non c'è emit.
  - "This month" e "Next month" hanno `:disabled` quando il mese che sceglierebbero cade fuori da `min`/`max`. Il calcolo è una funzione pura in `cg-controls-calc.js`, con lo stesso confronto di `monthGridYear`.
  - Lo stile di `.cg-ctl-error` va in `css/costgrid.css`, usando i token.
- **`js/api-sync.js`** (`_cgUpsertVersionToApi`):
  - un rifiuto `DATE_RULE` del PATCH della versione o della struttura mostra `showInfo` una sola volta per versione, con il messaggio del server seguito dalla frase già usata per `STRUCTURE_RULE`. L'insieme `_cgStructureRuleNotified` diventa l'insieme delle notifiche di regola per versione;
  - il comportamento di ritorno (`false`) non cambia.
- **`js/lib/project-push-result.js`:**
  - in `js/api-sync.js` (`_pushProjectToApiDetailed`) ogni elemento di `failed`, che oggi è `{ part, error: <messaggio> }`, porta in più `code: e.data?.code` e `reason: e.data?.error`;
  - quando `code` è `DATE_RULE`, `PROJECT_RULE` o `STRUCTURE_RULE`, il messaggio di `summarizePushResult` aggiunge `Reason: <reason>`.
- **`js/costgrid.js`, Generate project** (`:1256-1264`): se `isOrdered(projStart, projEnd)` è falso, il lato che non viene da `v.startDate`/`v.endDate` prende il valore dell'altro lato. Le conversioni `taskStartDate.replace(/-/g, '')` (`:1105-1106`, `:1240-1241`) passano per `toYmd(v) || ''`.
- **Pulizia:**
  - `cgItToIso` e `cgIsoToIt` escono da `js/costgrid.js` e dalla destrutturazione in `costgrid.html:1108`. `onTaskDateChange` (`:1689-1696`) usa `parseDayText` per il ramo evento;
  - in `project-config.html`, `itToYmd` diventa `toYmd(parseDayText(text)) || ''`. È più rigoroso (rifiuta `31/04/2026`) e su testo illeggibile restituisce `''` come oggi. Il campo testo e questo comportamento restano fino a C2;
  - `js/core.js` perde `ym2month`, `month2ym`, `ymd2date` e `date2ymd`.
- **Caricamento:** ogni pagina che usa una funzione del modulo carica `<script type="module" src="js/lib/dates.js?v=1">` prima dei moduli che lo importano o leggono i suoi bridge. Le pagine sono `costgrid.html`, `project-config.html` e `pipeline.html`, che carica `js/costgrid.js`.

### 2.4 Regola e guard

- **CLAUDE.md, nuova sezione "Dates"**, accanto a "Money formatting and parsing". Elenca le regole:
  - una sola implementazione, `js/lib/dates.js` più il twin `api/src/lib/dates.js`;
  - nessuna validazione o normalizzazione di date fuori da lì;
  - ogni route che scrive date valida con `periodError` e risponde `DATE_RULE`;
  - ogni campo data con un gemello passa `min`/`max`.

  I dettagli vanno in `docs/js/lib.md` e `docs/api/lib.md`, che rimandano alla sezione. La sezione nomina `js/lib/dates-guard.test.js` invece di ripeterne i controlli.
- **`js/lib/dates-guard.test.js`**, sul modello di `money-guard.test.js`:
  1. `isNaN(new Date(` e `.replace(/-/g` compaiono, nei `.js`/`.html` che non sono test, solo in `js/lib/dates.js` e `api/src/lib/dates.js`. Esenzione chiusa: `api/src/scripts/`, `api/src/restore-backup.js`, `api/src/db/`;
  2. ogni file in `api/src/routes/` che contiene `INSERT INTO` o `UPDATE … SET` sulle tabelle `cost_grid_versions`, `projects`, `tasks` o `project_tasks` contiene `require('../lib/dates')`;
  3. ogni pagina `.html` che carica `js/cg-controls.js` o chiama una funzione del modulo carica `js/lib/dates.js`;
  4. tutti i riferimenti a `js/lib/dates.js` portano lo stesso `?v=N`;
  5. una tabella di casi unica è eseguita sul modulo del browser e, via `createRequire`, sul twin del server, con risultati identici per `isMonth`, `isDay`, `toYmd`, `toIso`, `monthFirstDay`, `monthLastDay`, `isOrdered` e `periodError`.
- **`docs/BACKLOG.md`, B-030:** resta `open`. La descrizione dice che la terza parte (`commitTyped()` ignora `min`/`max`) è chiusa da questo ciclo, con il commit di merge, e il `Verified how` cita il test del picker.

### 2.5 Test

- `js/lib/dates.test.js`: casi limite per ogni funzione, tra cui `20260431`, `20260229`, `20240229`, `202613`, `202600`, `2026-05`, `''`, `null`, ` 202605`, e formati misti in `isOrdered`.
- `js/lib/dates-guard.test.js` (§2.4).
- `js/lib/cg-controls-calc.test.js`: casi della funzione delle scorciatoie. I test di `parseItDate`/`parseMonthInput` passano a `dates.test.js` con i nuovi nomi.
- `js/lib/cg-controls-ui.test.js`: con `min`/`max`, il testo digitato fuori limite e quello illeggibile non emettono e mostrano l'errore; le scorciatoie fuori limite sono disabilitate.
- `js/lib/project-push-result.test.js`: un codice di regola porta `Reason: …`.
- `api/src/lib/dates.test.js` (`node:test`): `periodError` e `DATE_RULE`.
- `test-api.js`, blocco `DT-xx`:
  - per version POST/PATCH, project POST/PATCH, `PUT …/structure` e `PUT /projects/:id/tasks`: data malformata, data inesistente e intervallo invertito danno 400 `DATE_RULE`, e il DB resta invariato;
  - un PATCH di solo `endDate` precedente allo start salvato dà 400;
  - una versione con il periodo già invertito nel DB accetta un PATCH che re-invia le stesse date con un'altra modifica;
  - un upload di timesheet con una data `2026-13-45` viene rifiutato con il numero di riga.

## 3. File toccati

`js/lib/dates.js` (nuovo), `api/src/lib/dates.js` (nuovo), `pipeline.html`, `api/src/lib/date-parse.js`, `api/src/routes/cost-grids.js`, `api/src/routes/projects.js`, `api/src/routes/timesheets.js`, `js/cg-controls.js`, `js/lib/cg-controls-calc.js`, `js/api-sync.js`, `js/lib/project-push-result.js`, `js/costgrid.js`, `js/core.js`, `css/costgrid.css`, `costgrid.html`, `project-config.html`, le pagine che caricano i file versionati toccati (aggiornamento dei `?v=N`), `CLAUDE.md`, `docs/js/lib.md`, `docs/api/lib.md`, `docs/BACKLOG.md`, `test-api.js` e i test elencati in §2.5.

## 4. Scope escluso

- Il cambio di formato visualizzato e digitato, la sostituzione dei campi nativi e testuali e i formattatori di sola lettura (`cgFmtMonth`, `pbFmtMonth`, `monthLabel` e simili): ciclo C2.
- Il vincolo "task dentro i mesi del periodo", la parte task di D-12, D-08 e D-11: ciclo C3.
- Le copie di `parseTaskDate` (`js/core.js`, `js/lib/config-form-calc.js`, `api/src/lib/planning-calendar.js`), che leggono dati già validi.
- Le prime due parti di B-030, gli item 3 e 5 del backlog e le note "Out of scope" dell'audit.
- Qualunque correzione di dati esistenti.

Un difetto nuovo scoperto durante l'esecuzione non si corregge in questo ciclo. Va isolato come Brief a sé, oppure come riga di `docs/BACKLOG.md`.

## Criteri di accettazione

1. **Moduli twin** — `js/lib/dates.js` e `api/src/lib/dates.js` esistono, e la tabella di casi unica di `dates-guard.test.js` dà risultati identici sui due.
2. **Guard** — `js/lib/dates-guard.test.js` passa, e fallisce se si aggiunge `isNaN(new Date(` a una pagina o si rimuove il `require('../lib/dates')` da `api/src/routes/projects.js`.
3. **Route** — i casi `DT-xx` di `test-api.js` passano: 400 `DATE_RULE` e DB invariato per date malformate, inesistenti e invertite su tutte e sei le route.
4. **Dati preesistenti** — un PATCH che re-invia le date invariate di una versione già invertita è accettato.
5. **Timesheet** — un upload con `2026-13-45` viene rifiutato con il numero di riga.
6. **Picker** — in costgrid, digitando un End precedente allo Start compare il messaggio sotto il campo e il valore non cambia. "Next month" è disabilitato quando supera l'End.
7. **Notifica in costgrid** — un rifiuto `DATE_RULE` dell'autosave mostra un avviso con il motivo, una volta per versione.
8. **Motivo in project-config** — un salvataggio rifiutato con `DATE_RULE` mostra `Reason:` con il messaggio del server.
9. **Generate project** — una versione con il solo Start in un mese successivo alla data di fine predefinita genera un progetto con End ≥ Start.
10. **Regola documentata** — CLAUDE.md ha la sezione "Dates", e `scripts/claude-md-guard.test.js` e `scripts/doc-paths-guard.test.js` passano.
11. **Suite** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Decisioni aperte

1. **Due moduli twin con una tabella di casi condivisa.** Alternativa scartata: il server che importa il modulo del browser. Perché: `js/` non è montato nel container `api`.
2. **Dati esistenti non validi tollerati: il controllo scatta solo quando una data cambia.** Alternativa scartata: una correzione una tantum della versione `ce702b4c`. Perché: correggerla imporrebbe una scelta arbitraria di quale lato cambiare, mentre quando l'utente la modificherà i limiti del picker lo costringeranno all'ordine giusto.
3. **Un lato vuoto è ammesso; l'ordine si controlla solo con entrambi i lati.** Alternativa scartata: pretendere entrambi o nessuno. Perché: rendere obbligatori i periodi è una regola nuova che il brief non chiede.
4. **Codice nuovo `DATE_RULE`.** Alternativa scartata: riusare `PROJECT_RULE`/`STRUCTURE_RULE`. Perché: il client lo deve riconoscere su versioni, progetti e struttura.
5. **Messaggio in linea sotto il picker; scorciatoie disabilitate.** Alternativa scartata: `showInfo` modale. Perché: un modale aperto al blur interrompe la digitazione.
6. **Generate project: il lato derivato si allinea a quello dato.** Alternativa scartata: rifiutare la generazione. Perché: l'utente non ha inserito il periodo derivato e non potrebbe correggerlo.
7. **Il guard copre validazione e normalizzazione dell'input, non i formattatori di visualizzazione né le copie di `parseTaskDate`.** Alternativa scartata: migrare ogni convertitore. Perché: la visualizzazione è la decisione 5 di C2, e quelle copie leggono dati già validi.
8. **La regola vive in una sezione di CLAUDE.md, e i doc dei moduli rimandano lì.** Alternativa scartata: regola in `docs/js/lib.md` con CLAUDE.md che la richiama, come dice alla lettera il brief. Perché: è il modello di Money, e chi scriverà i form futuri legge CLAUDE.md a ogni sessione.
9. **`summarizePushResult` mostra il motivo del server per i codici di regola.** Alternativa scartata: lasciare il messaggio generico. Perché: altrimenti il rifiuto in project-config non dice cosa correggere.
10. **B-030 resta `open`, con una nota che la terza parte è chiusa da C1.** Alternativa scartata: dividere la riga in tre. Perché: è il modo meno invasivo rispetto alle regole del file.
