# Brief — Sicurezza ciclo 2: `xlsx` vulnerabile e parsing di file non fidati (S-02)

**Tipo:** **evoluzione con decisione di design aperta** (Scenario 2), non un audit-fix meccanico. Finding coperto: **S-02**.
**Perché è diverso dagli altri cicli:** `npm audit` segnala `xlsx` con `fixAvailable: false` — non esiste un aggiornamento da applicare; bisogna scegliere come uscirne. Il Brief non prescrive la soluzione: la fase `/brainstorming` propone le alternative e l'utente decide.
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato il 2026-11-15; ampliato lo stesso giorno con l'uso lato browser. Ordine: 2 di 6.

## Problema

La libreria SheetJS `xlsx@0.18.5` ha prototype pollution (GHSA-4r6h-8v6p-xvw6) e ReDoS (GHSA-5pgg-2g8v-p4x9) e il registro npm non ha versioni corrette. Il server la usa per leggere file caricati da **qualunque utente autenticato**, nell'unico processo API; il browser ne carica la stessa versione da CDN.

## Comportamento attuale

- Server: `api/package.json` `"xlsx": "^0.18.5"`; `router.post('/upload', requireAuth, upload.single('file'), …)` e `XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true })` (`api/src/routes/timesheets.js:123-129`); limite 20 MB (`:14`).
- Browser: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` in `portfolio.html` e `project-config.html`. **Cosa ne fa il codice delle due pagine non è stato verificato nell'audit** (se legge file dell'utente, se solo scrive): è il primo punto da chiarire.
- Un ReDoS ferma l'event loop per tutti gli utenti; la pollution agisce durante il parsing, e quali letture successive di proprietà ne risentano non è stato tracciato.
- Il formato accettato dal caricamento (`.xls` binario legacy, `.xlsx`, o entrambi) non è stato stabilito: ne dipende la scelta della libreria sostitutiva.

## Comportamento atteso

Un file costruito per sfruttare le due vulnerabilità non può né alterare lo stato del processo né bloccarlo, e il caricamento dei timesheet continua a leggere i file legittimi come oggi. Come ottenerlo è la decisione aperta.

## Alternative da portare in `/brainstorming` (non scelte)

- **A. Build corretta di SheetJS fuori da npm** (tarball del sito del fornitore, versione fissata in `package.json`/lockfile): minimo cambio di codice; dipendenza fuori dal registro, da fissare con hash.
- **B. Altra libreria** (ExcelJS è già usata dal browser per gli export): da verificare se legge i formati realmente caricati, in particolare `.xls` legacy.
- **C. Isolare il parsing** (processo figlio o worker con timeout e limite di memoria, controllo di firma del file, limite di dimensione più basso): contiene ReDoS e pollution senza cambiare libreria; non elimina la vulnerabilità.
- **D. Combinazioni** (es. A + C).
- Per il lato browser: stessa scelta, oppure rimozione se non legge file non fidati.

## Vincoli

- Il comportamento del caricamento (gate ruoli/task, validazione date, nessuna scrittura parziale: `timesheets.js:189`) non cambia.
- Il formato accettato oggi non si restringe senza decisione esplicita dell'utente.
- Nessuna build; se una libreria passa a un file servito dal repo, `nginx.conf` ne serve solo i percorsi in allowlist (`scripts/nginx-serve.test.js`).
- Una modifica a `package.json`/lockfile segue le regole del ciclo 4 sulle dipendenze (versioni fissate, `npm ci`).
- Misurare, non supporre: se si sceglie C, il tempo di stallo di un payload ReDoS sugli altri utenti si verifica con una prova.

## Criteri di accettazione

1. Decisione tra le alternative registrata nella spec, con le ragioni.
2. `npm audit --omit=dev` non riporta più `xlsx`, oppure la spec documenta perché la mitigazione scelta lo rende non sfruttabile.
3. Un file XLS/XLSX legittimo di prova (stesso set dei test timesheet esistenti) viene letto con lo stesso risultato di prima.
4. Un file malevolo di prova per ciascuna delle due advisory non altera `Object.prototype` e non fa superare un tempo limite dichiarato, mentre un'altra richiesta contemporanea risponde.
5. Il lato browser è trattato: corretto, aggiornato o rimosso, con la verifica di cosa legge.
6. Suite frontend e backend verdi.

## Scope escluso esplicitamente

- Gli altri risultati di `npm audit` (ciclo 4) e il rinforzo generale dei CDN (SRI, versione di Vue: ciclo 4).
- Una revisione della logica di validazione dei timesheet.

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
