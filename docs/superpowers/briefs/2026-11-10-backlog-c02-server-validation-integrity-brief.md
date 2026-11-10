# Brief — backlog, ciclo 2: validazione e integrità dei dati lato server

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-042, B-236, B-334, B-207, B-209, B-212, B-223, B-191, B-192, B-189, B-193, B-297, B-292, B-280, B-378, B-010, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Più route scrivono o leggono senza il controllo che le consorelle hanno già: input non validato che arriva in query (500 invece di 400), letture di valuta separate dalla scrittura, vincoli mancanti. Radice comune: ogni route ha la propria copia del controllo.

## Comportamento attuale

- `pots.js`: B-042 (`clientId` non validato, 500 su UUID errato), B-236 (`specialLabel` accetta qualsiasi stringa).
- `config.js`: B-207 (rate card senza cliente), B-209 (sostituzione completa senza controllo di versione), B-212 (copia di `UUID_RE`, INSERT in ciclo, `roleId` duplicati).
- `projects.js`: B-189 e B-192 (SELECT di valuta separata dalla scrittura, nessun 404), B-191, B-010 (regex UUID inline).
- `currencies.js` B-334 (nessun intervallo su `DECIMAL(10,6)`), `money-rules.js` B-223 (tetto `DECIMAL(10,2)` su PTC e phasing), `db/client.js` B-193 (nessun parser per NUMERIC).
- B-297 (il 409 della cancellazione conta versioni Draft nascoste), B-292 (l'export del phasing moltiplica i giorni per 8), B-280 (subquery POT eseguita per ogni chiamante), B-378 (alias senza ore).

## Comportamento atteso

- Ogni route risponde 400/404 con la forma d'errore del progetto, mai 500, a input malformato o a risorsa assente.
- I controlli ripetuti vivono in un modulo di `api/src/lib/` con test `node:test`.
- B-292 usa l'unità dichiarata dal brief dell'export.

B-193 e B-223 possono cambiare il tipo restituito: il brainstorming misura prima i dati esistenti con `SELECT` in sola lettura.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test per ogni 400/404 nuovo, con DB invariato dopo il rifiuto.
2. Un test del modulo condiviso per UUID, intervallo decimale e etichetta speciale.
3. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- Le regole su date e periodi (ciclo 3).
- L'hardening di sessione (ciclo 1).
- B-235 e B-293 (ciclo 14).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
