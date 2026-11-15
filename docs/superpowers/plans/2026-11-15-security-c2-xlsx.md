# `xlsx` corretto e solo file `.xlsx` (S-02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il lettore dei timesheet usa `xlsx@0.20.3` (nessuna advisory) e accetta solo file `.xlsx` riconosciuti dalla firma ZIP; il browser carica la stessa versione.

**Architecture:** `api/package.json` punta alla tarball del fornitore; un modulo puro `api/src/lib/xlsx-file.js` rifiuta ciò che non è uno ZIP prima di `XLSX.read`; la route `POST /api/timesheets/upload` risponde `400` ai formati rifiutati e ai file illeggibili. Le due pagine che scrivono con SheetJS cambiano URL dello script; i tre input file accettano solo `.xlsx`.

**Tech Stack:** Node/Express, `xlsx` (SheetJS), `node:test` (backend), vitest (guard sui file del repo), `test-api.js` (integrazione).

**Spec:** `docs/superpowers/specs/2026-11-15-security-c2-xlsx-design.md`
**Branch:** `security-c2-xlsx`
**Risk class:** standard — modifica una route API e aggiunge un modulo in `api/src/lib/`; nessuna categoria `high-risk` (la riga in `docker-compose.yml` riguarda solo il servizio `test`, profilo isolato, mai lo stack principale)

**Indipendenza dei task:** i task non sono indipendenti (il 3 usa il modulo del 2, il 4 la dipendenza del 1, il 5 estende il guard del 1): esecuzione nativa (§6.1).

## Global Constraints

- Dipendenza esatta: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`; script browser esatto: `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`.
- Firma accettata: i primi 4 byte `PK\x03\x04`; messaggio e codice del rifiuto: `Only .xlsx files are accepted`, `code: 'FILE_FORMAT'`, status `400`.
- File ZIP illeggibile (eccezione di `XLSX.read`/`sheet_to_json`): `400 { error: 'File is empty or unreadable' }`.
- Invariati: gate ruoli/task, validazione date, nessuna scrittura parziale, limite 20 MB, opzione `cellDates: true`.
- Testo rivolto all'utente in inglese. Nessuna operazione Docker sullo stack principale; il worktree nuovo ha bisogno di `.env` copiato dal checkout principale e di `npm ci` (root e `api/`).
- `?v=N`: nessun `js/*.js`, `js/lib/*.js` o `css/*.css` versionato viene modificato da questo piano; se un task ne tocca uno, aggiorna tutti i riferimenti (`CLAUDE.md`, «Cache-busting»).

## Review Focus

1. Uno ZIP che non è un `.xlsx` (nessun foglio, es. un archivio con un solo file di testo) supera il gate: deve rispondere `400 File is empty or unreadable`, mai 500 (Task 3).
2. Un vero `.xlsx` con nome `ts.csv` e content-type `text/csv` viene accettato: conta la firma, non il nome (Task 3).
3. Un `.xlsx` con la sola riga di intestazione risponde `400 File is empty or unreadable`, come oggi (Task 3).
4. Una richiesta senza file risponde ancora `400 No file uploaded`, prima del gate (Task 3).
5. Un foglio chiamato `__proto__` non altera `Object.prototype` (Task 4).

## File Structure

- `api/package.json`, `api/package-lock.json` — dipendenza.
- `api/src/lib/xlsx-file.js` + `xlsx-file.test.js` — gate sul formato.
- `api/src/routes/timesheets.js` — applica il gate.
- `api/src/lib/xlsx-advisories.test.js` — prova dei due payload su `0.20.3`.
- `test-api.js`, `docker-compose.yml` (servizio `test`) — helper di upload `.xlsx` e casi di rifiuto.
- `portfolio.html`, `project-config.html`, `planning.html` — URL dello script, `accept`, etichette.
- `js/lib/xlsx-version-guard.test.js` — guard sui file del repo.

---

### Task 1: Dipendenza `xlsx@0.20.3` e guard

**Files:**
- Create: `js/lib/xlsx-version-guard.test.js`
- Modify: `api/package.json:22`, `api/package-lock.json`, `portfolio.html:798`, `project-config.html:503`

**Interfaces:**
- Produces: la dipendenza `xlsx@0.20.3` in `api/node_modules`, usata dai Task 2-4; il guard `js/lib/xlsx-version-guard.test.js`, esteso dal Task 5.

- [ ] **Step 1: Write the failing guard.** In `js/lib/xlsx-version-guard.test.js` (vitest; leggi i file con `readFileSync(join(process.cwd(), p), 'utf8')` come `js/lib/notification-url-guard.test.js`), tre test:
  - `'api/package.json pins xlsx to the vendor 0.20.3 tarball'`: `JSON.parse(read('api/package.json')).dependencies.xlsx === 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'`;
  - `'api/package-lock.json resolves xlsx to 0.20.3'`: `packages['node_modules/xlsx'].version === '0.20.3'` e `.integrity` inizia con `sha512-`;
  - `'pages load the same SheetJS 0.20.3 script and no 0.18.5'`: `portfolio.html` e `project-config.html` contengono esattamente una volta `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`, e nessuno dei file `*.html` della radice contiene `xlsx@0.18.5`.
- [ ] **Step 2: Run it to see it fail.** `npx vitest run js/lib/xlsx-version-guard.test.js` — Expected: 3 FAIL.
- [ ] **Step 3: Swap the dependency.** Da `api/`: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz --save-exact`; verifica che `package.json` riporti l'URL esatto senza `^`. Nelle due pagine sostituisci l'URL jsdelivr di `xlsx@0.18.5` con l'URL del fornitore (Global Constraints), mantenendo `defer`.
- [ ] **Step 4: Verify.** `npx vitest run js/lib/xlsx-version-guard.test.js` — Expected: 3 PASS. Da `api/`: `npm audit --omit=dev` — Expected: nessuna riga `xlsx` (criterio 2); `node --test src/routes/timesheets.test.js src/lib/phasing-export.test.js` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add js/lib/xlsx-version-guard.test.js api/package.json api/package-lock.json portfolio.html project-config.html && git commit -m "fix(deps): xlsx 0.20.3 from the vendor, server and browser (S-02)"`

### Task 2: Modulo `xlsx-file`

**Files:**
- Create: `api/src/lib/xlsx-file.js`, `api/src/lib/xlsx-file.test.js`

**Interfaces:**
- Produces: `xlsxFileError(buffer: unknown): string | null` — `null` se `buffer` è un `Buffer` di almeno 4 byte che inizia con `PK\x03\x04`, altrimenti `XLSX_FILE_ERROR`; `XLSX_FILE_ERROR = 'Only .xlsx files are accepted'`. CommonJS, `module.exports = { xlsxFileError, XLSX_FILE_ERROR }`.

- [ ] **Step 1: Write the failing test.** `xlsx-file.test.js` (`node:test`, `assert`): un test per caso, ciascuno con `assert.strictEqual(xlsxFileError(x), atteso)`:
  - `Buffer.from([0x50,0x4b,0x03,0x04,0x00])` → `null`;
  - `Buffer.from('date,hours\n2026-01-01,1\n')` (CSV) → `XLSX_FILE_ERROR`;
  - `Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])` (`.xls` BIFF) → `XLSX_FILE_ERROR`;
  - `Buffer.from('<html><body></body></html>')` → `XLSX_FILE_ERROR`;
  - `Buffer.alloc(0)` → `XLSX_FILE_ERROR`;
  - `Buffer.from([0x50,0x4b,0x03])` (3 byte) → `XLSX_FILE_ERROR`;
  - `undefined`, `null`, `'PK\u0003\u0004'` (stringa, non `Buffer`) → `XLSX_FILE_ERROR`.
- [ ] **Step 2: Run it to see it fail.** `cd api && node --test src/lib/xlsx-file.test.js` — Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implement** `xlsxFileError` in `api/src/lib/xlsx-file.js` con `Buffer.isBuffer` e un confronto dei primi 4 byte (`buffer.subarray(0, 4).equals(ZIP_SIGNATURE)`).
- [ ] **Step 4: Run it to see it pass.** `cd api && node --test src/lib/xlsx-file.test.js` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add api/src/lib/xlsx-file.js api/src/lib/xlsx-file.test.js && git commit -m "feat(timesheets): xlsx file signature gate (S-02)"`

### Task 3: Il gate nella route e i test di integrazione

**Files:**
- Modify: `api/src/routes/timesheets.js:3-5,125-131`, `test-api.js:113-125` (helper) e un blocco di casi nuovi accanto ai test di upload `MA-04` (`:2970-2980`), `docker-compose.yml:82` (servizio `test`)

**Interfaces:**
- Consumes: `xlsxFileError`, `XLSX_FILE_ERROR` (Task 2).
- Produces: in `test-api.js`, `uploadRaw(path, buffer, filename, contentType, cookie): Promise<{status, data}>`; `uploadCsv(path, csvText, cookie)` mantiene la firma e ora spedisce un `.xlsx` vero (nome `ts.xlsx`).

- [ ] **Step 1: Make `xlsx` available to the `test` container.** In `docker-compose.yml`, nel comando del servizio `test`, `npm install --prefix /tmp pg bcryptjs` diventa `npm install --prefix /tmp pg bcryptjs https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- [ ] **Step 2: Write the failing integration cases** in `test-api.js` (stesso stile `ok(cond, 'ID message')` dei test vicini; ID `XF-01..XF-08`; l'`xlsx` si carica con `require('/tmp/node_modules/xlsx')` come `pg`):
  - sostituisci `uploadCsv` con `uploadRaw` + una conversione: `XLSX.read(csvText, { type: 'string', raw: true })` → `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })`, nome `ts.xlsx`, content-type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  - `XF-01` CSV → `400`, `data.code === 'FILE_FORMAT'`;
  - `XF-02` buffer che inizia con `D0 CF 11 E0` → `400 FILE_FORMAT`;
  - `XF-03` `PK\x03\x04` + byte casuali → `400` con `data.error === 'File is empty or unreadable'`;
  - `XF-04` (Review Focus 1) uno ZIP con un solo file di testo (costruito con `zlib`/`Buffer`, o un `.xlsx` privato di `xl/workbook.xml`) → `400`, mai 500;
  - `XF-05` (Review Focus 2) un `.xlsx` valido spedito come `ts.csv` con `text/csv` → `201`;
  - `XF-06` (Review Focus 3) un `.xlsx` con la sola intestazione → `400 File is empty or unreadable`;
  - `XF-07` (Review Focus 4) richiesta multipart senza campo `file` → `400 No file uploaded`;
  - `XF-08` dopo `XF-01..XF-04`, `GET /api/timesheets/<codice del test>` non riporta righe nuove.
- [ ] **Step 3: Apply the gate** in `api/src/routes/timesheets.js`: importa `xlsx-file`; subito dopo `if (!req.file) …` rispondi `400 { error: XLSX_FILE_ERROR, code: 'FILE_FORMAT' }` se `xlsxFileError(req.file.buffer)` non è `null`; avvolgi `XLSX.read(...)` e `sheet_to_json(...)` in un `try/catch` che risponde `400 { error: 'File is empty or unreadable' }` (stesso messaggio del controllo `!raw.length` che segue). Il resto della funzione non cambia.
- [ ] **Step 4: Run the backend unit tests and the integration run once.** `cd api && node --test src/routes/timesheets.test.js` — Expected: PASS. Dalla radice del worktree: `scripts/run-tests.sh` (l'eccezione di §6.2: questo task ha per prodotto controlli di `test-api.js`) — Expected: verde, con `XF-01..XF-08` e tutti i casi che usano `uploadCsv` (`MA-*`, `PE-*`, `PJ-*`, `PM-*`, `PA-*`) passati.
- [ ] **Step 5: Commit.** `git add api/src/routes/timesheets.js test-api.js docker-compose.yml && git commit -m "fix(timesheets): reject non-.xlsx uploads, unreadable files answer 400 (S-02)"`

### Task 4: Prova dei payload delle due advisory

**Files:**
- Create: `api/src/lib/xlsx-advisories.test.js`

**Interfaces:**
- Consumes: `xlsx@0.20.3` (Task 1).
- Produces: due costruttori di payload dentro il file di test, `buildPollutionXlsx(): Buffer` e `buildRedosXlsx(): Buffer`, e il limite `STALL_LIMIT_MS = 2000`.

- [ ] **Step 1: Build the payloads from the advisories.** Leggi il testo di GHSA-4r6h-8v6p-xvw6 (prototype pollution) e GHSA-5pgg-2g8v-p4x9 (ReDoS) e costruisci un `.xlsx` per ciascuna.
- [ ] **Step 2: Prove each payload is effective on `0.18.5`** (misura una tantum, non committata): in una cartella di lavoro dello scratchpad, `npm i xlsx@0.18.5` e lancia `XLSX.read(payload, { type: 'buffer', cellDates: true })`. Registra nel report del ciclo il risultato: per la pollution `Object.prototype` alterato dopo la lettura, per il ReDoS il tempo impiegato (deve superare `STALL_LIMIT_MS` di un ordine di grandezza). **Se un payload non colpisce `0.18.5`, la spec dice cosa fare:** documenta in `docs/superpowers/reports/` perché la prova non è realizzabile, tieni il test dell'altra e ferma qui quel criterio.
- [ ] **Step 3: Write the tests on `0.20.3`** (`node:test`, `require('xlsx')`): 
  - `'a pollution payload leaves Object.prototype untouched'`: dopo `XLSX.read`, `Object.keys(Object.prototype).length === 0` e `({}).polluted === undefined` (adatta al nome della proprietà del payload); lo stesso per un foglio chiamato `__proto__` (Review Focus 5);
  - `'a ReDoS payload is read under STALL_LIMIT_MS'`: `Date.now()` prima e dopo la lettura, `< STALL_LIMIT_MS`;
  - `'a concurrent request is answered during the read'`: avvia un `http.createServer` che risponde `200`, lancia `fetch` verso di esso e, subito dopo, la lettura del payload ReDoS dello stesso processo; il `fetch` completa con `200` entro `STALL_LIMIT_MS` dalla partenza.
- [ ] **Step 4: Run.** `cd api && node --test src/lib/xlsx-advisories.test.js` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add api/src/lib/xlsx-advisories.test.js && git commit -m "test(timesheets): payloads of the two xlsx advisories are harmless on 0.20.3 (S-02)"`

### Task 5: Input, etichette e guard

**Files:**
- Modify: `portfolio.html:23`, `project-config.html:133`, `planning.html:25,47,199`, `js/lib/xlsx-version-guard.test.js`

**Interfaces:**
- Consumes: il guard del Task 1.

- [ ] **Step 1: Extend the guard (failing).** Aggiungi a `js/lib/xlsx-version-guard.test.js` il test `'the three actuals file inputs accept only .xlsx and the Load button says XLSX'`: in `portfolio.html`, `project-config.html` e `planning.html` ogni `<input type="file"` contiene `accept=".xlsx"` e nessun `accept=".xls,.xlsx"`; `planning.html` non contiene `Load XLS<` né `Load XLS ` seguito da non-`X`, e contiene `Load XLSX` due volte.
- [ ] **Step 2: Run it to see it fail.** `npx vitest run js/lib/xlsx-version-guard.test.js` — Expected: FAIL sul nuovo test.
- [ ] **Step 3: Edit the pages.** `accept=".xls,.xlsx"` → `accept=".xlsx"` nei tre input; `Load XLS` → `Load XLSX` nei due pulsanti di `planning.html` (`:47`, `:199`); il commento di `:88` resta com'è.
- [ ] **Step 4: Run it to see it pass.** `npx vitest run js/lib/xlsx-version-guard.test.js js/lib/nav-shell-guard.test.js` — Expected: PASS.
- [ ] **Step 5: Commit.** `git add portfolio.html project-config.html planning.html js/lib/xlsx-version-guard.test.js && git commit -m "fix(ui): actuals inputs accept only .xlsx (S-02)"`

---

## Decisioni aperte

1. **Per generare i `.xlsx` dei test si installa nel servizio `test` la stessa tarball `0.20.3`, e `uploadCsv` converte il CSV.** Alternativa scartata: scrivere a mano uno zip minimale nel test. Perché: una riga in `docker-compose.yml` e la libreria reale contro decine di righe di formato da mantenere.
2. **Il payload di ciascuna advisory si prova su `0.18.5` con una misura una tantum nello scratchpad; il test committato gira solo su `0.20.3`.** Alternativa scartata: dipendere da `xlsx@0.18.5` come devDependency di controllo. Perché: reintrodurrebbe nel lockfile la libreria vulnerabile che il ciclo toglie.
3. **«Una richiesta contemporanea risponde» si prova con un `http.createServer` nello stesso processo del test.** Alternativa scartata: una `GET` contro lo stack di `run-tests.sh` durante l'upload. Perché: i payload vivono nel file di test e il test non deve esporli in `api/src` né in `test-api.js`.
4. **Il guard sui file del repo vive in `js/lib/xlsx-version-guard.test.js` (vitest).** Alternativa scartata: un guard in `api/src/`. Perché: legge pagine e file del repo, come `notification-url-guard.test.js`.
5. **Modalità nativa e classe `standard`.** Alternativa scartata: subagent-driven e `high-risk`. Perché: task sequenziali (§6.1) e nessuna categoria `high-risk` di §6.1b; la riga in `docker-compose.yml` tocca solo il profilo `test`.
