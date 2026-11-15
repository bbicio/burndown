# `xlsx` corretto e solo file `.xlsx` (S-02) — design spec

**Date:** 2026-11-15
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c2-xlsx-brief.md`
**Scenario:** 2 (evoluzione con decisione di design aperta), finding S-02 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

Il lettore dei timesheet passa da `xlsx@0.18.5` (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9, nessun fix su npm) alla build `0.20.3` di SheetJS scaricata dal sito del fornitore, e accetta solo file `.xlsx`, riconosciuti dalla firma ZIP. Lo stesso aggiornamento vale per la copia caricata dal browser.

## 1. Fatti verificati

- L'unico punto di lettura è `XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true })` in `api/src/routes/timesheets.js:127`; limite 20 MB a `:14`. `api/src/routes/exports.js:317` usa `xlsx` solo per scrivere.
- Il browser usa `xlsx@0.18.5` solo per scrivere (`aoa_to_sheet`, `writeFile`: `portfolio.html:1659-1661`, `:1764-1766`, `:2065-2067`; `project-config.html:1092-1097`). Nessuna lettura: i tre `<input type="file">` (`portfolio.html:23`, `project-config.html:133`, `planning.html:25`) mandano il file a `Api.timesheets.upload` (`js/api.js:221`, `js/upload.js:34`).
- SheetJS riconosce il formato dal contenuto, non dall'estensione; `test-api.js:113` carica buffer CSV, quindi CSV è oggi accettato di fatto.
- `xlsx@0.20.3` si installa da `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, `npm audit --omit=dev` riporta 0 vulnerabilità, il lockfile registra `integrity: sha512-…`. Lo script browser `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` risponde 200.
- In `xlsx@0.20.3`, `_inflateRawSync` usa `_processChunk` senza limite di output e ignora la dimensione dichiarata `usz` (`xlsx.js:2258-2264`): un controllo sulle dimensioni dichiarate nello zip non protegge da una zip-bomb con header falsificato.
- `api/Dockerfile` copia solo `package.json` e lancia `npm install --omit=dev`: nell'immagine l'hash del lockfile non è verificato. Lo risolve il ciclo 4.
- ExcelJS non entra nel ciclo: gli export con stile (`js/costgrid.js`, `planning.html`, `project-config.html`, `timesheets.html`) restano com'è.

## 2. Dipendenza

- `api/package.json`: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`; `api/package-lock.json` aggiornato con `npm install` dentro `api/`.
- `portfolio.html` e `project-config.html`: il `<script defer src>` passa a `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`.

## 3. Gate sul formato

Nuovo modulo `api/src/lib/xlsx-file.js` (CommonJS, puro, `node:test`):

- `xlsxFileError(buffer)` restituisce `null` se `buffer` è un `Buffer` di almeno 4 byte che inizia con `PK\x03\x04`; altrimenti `'Only .xlsx files are accepted'`.

`POST /api/timesheets/upload`:

- Subito dopo il controllo `!req.file`, prima di `XLSX.read`: se `xlsxFileError` non è `null` risponde `400 { error, code: 'FILE_FORMAT' }`. CSV, `.xls` BIFF, HTML e file vuoti non raggiungono il parser.
- `XLSX.read` e `sheet_to_json` stanno in un `try/catch` interno: un'eccezione risponde `400 { error: 'File is empty or unreadable' }` (il messaggio già usato per il file vuoto), invece del 500 di oggi.
- Il resto non cambia: gate ruoli/task, validazione date, nessuna scrittura parziale, limite 20 MB.

## 4. Interfaccia

I tre `<input type="file">` (`portfolio.html:23`, `project-config.html:133`, `planning.html:25`) passano da `accept=".xls,.xlsx"` ad `accept=".xlsx"`. Il pulsante "Load XLS" di `planning.html` (due punti) diventa "Load XLSX". Un rifiuto `FILE_FORMAT` arriva alle pagine come un errore d'upload già gestito (`err.message`).

## 5. Test

- Unità su `xlsx-file.js`: firma valida; CSV; `.xls` BIFF (`D0 CF 11 E0`); HTML; buffer vuoto; buffer di 3 byte; `Buffer` assente.
- `test-api.js`: l'helper `uploadCsv` converte il CSV in un `.xlsx` vero (con la libreria `xlsx` già nella suite) e lo spedisce con lo stesso nome di campo, così i punti d'uso non cambiano; in più `FILE_FORMAT` per un CSV e per un `.xls` BIFF, e `400` per uno zip corrotto.
- Prova delle advisory (criterio 4): per ciascuna si costruisce un payload e lo si misura **prima** su `xlsx@0.18.5` per provare che è efficace (pollution: `Object.prototype` alterato; ReDoS: tempo di stallo misurato). Poi lo stesso payload su `0.20.3`: `Object.prototype` intatto, tempo sotto il limite dichiarato nel test, e una `GET` contemporanea risponde. Se un payload non riesce a colpire `0.18.5`, la spec documenta perché la prova non è realizzabile e il criterio 4 si ferma a quella nota.
- Guard (`api/src/routes/xlsx-guard.test.js` o `js/lib/…`, deciso dal Piano): `api/package.json` non contiene `0.18.5`; nessuna pagina referenzia `xlsx@0.18.5`; le due pagine usano lo stesso URL.
- Bump dei `?v=N` di ogni file versionato toccato, in tutti i riferimenti.
- Una modifica a `package.json`/lockfile rigira la suite backend con `scripts/run-tests.sh` (regola del ciclo 4).

## 6. Fuori scope

- Difesa dalle zip-bomb (decompressione non limitata di `0.20.3`): finding nuovo, da proporre come Brief a sé.
- SRI e CSP sui CDN (cicli 4 e 5; la CSP dovrà ammettere `cdn.sheetjs.com`); `npm ci` nel Dockerfile (ciclo 4).
- Unificare ExcelJS e SheetJS: Brief a sé, richiede prima la decisione sugli stili degli export.
- Gli altri risultati di `npm audit` e la logica di validazione dei timesheet.

## Decisioni aperte

1. **Approccio A+C: SheetJS `0.20.3` dal sito del fornitore, server e browser.** Alternativa scartata: ExcelJS ovunque, e la sola mitigazione senza aggiornare. Perché: cambio minimo e stessa lettura dei dati; deciso dall'utente.
2. **Solo `.xlsx`: CSV e `.xls` rifiutati con `400 FILE_FORMAT`.** Alternativa scartata: restare permissivi. Perché: deciso dall'utente, e riduce il codice del parser raggiungibile.
3. **Il controllo è la firma ZIP, non l'estensione del nome file.** Alternativa scartata: fidarsi di `.xlsx` nel nome. Perché: il nome lo sceglie il chiamante.
4. **Zip-bomb fuori da questo ciclo.** Alternativa scartata: un controllo sulle dimensioni dichiarate dello zip. Perché: gli header sono falsificabili e `0.20.3` non limita l'output, quindi darebbe una falsa sicurezza.
5. **Un `.xlsx` corrotto risponde `400`, non 500.** Alternativa scartata: lasciare il 500. Perché: è un errore del chiamante, come `DATE_RULE`.
6. **I test CSV diventano `.xlsx` generati nell'helper `uploadCsv`.** Alternativa scartata: tenere un percorso CSV solo per i test. Perché: i test devono usare il formato reale.
7. **Il Dockerfile resta com'è (ciclo 4).** Alternativa scartata: copiare il lockfile qui. Perché: è già nel Brief del ciclo 4 e allargherebbe il ciclo; fino ad allora la versione è fissata dall'URL.
8. **Etichetta "Load XLS" → "Load XLSX" e `accept=".xlsx"` nelle tre pagine.** Alternativa scartata: lasciare i testi. Perché: dichiarano il formato che il server ora accetta.

## Criteri di accettazione

1. **Decisione registrata** — la sezione "Decisioni aperte" riporta l'approccio scelto e le alternative scartate con le ragioni.
2. **Audit pulito** — `npm audit --omit=dev` in `api/` non riporta più `xlsx`.
3. **File legittimo** — un `.xlsx` legittimo (lo stesso set dei test timesheet esistenti) si carica con `201` e le stesse righe di prima; la suite `test-api.js` con l'helper `.xlsx` è verde.
4. **Formati rifiutati** — un CSV, un `.xls` BIFF, un file vuoto e uno zip corrotto rispondono `400` (`FILE_FORMAT` i primi tre, `File is empty or unreadable` lo zip corrotto) e non scrivono righe in `timesheets`.
5. **Payload delle advisory** — per ciascuna advisory un payload efficace su `0.18.5` non altera `Object.prototype` e non supera il tempo limite dichiarato su `0.20.3`, mentre una richiesta contemporanea risponde.
6. **Browser** — `portfolio.html` e `project-config.html` caricano `0.20.3`; gli export `.xlsx` che usano (Data, Tasks & Resources) si scaricano e si aprono (verifica manuale al Gate 2); i tre input file accettano solo `.xlsx`.
7. **Suite** — `npm test` e la suite backend (`scripts/run-tests.sh`) verdi; `/security-review` sul branch non trova più S-02 né ne introduce.
