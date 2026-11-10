# Brief — backlog, ciclo 11: pulizia di js/lib, pipeline board e Master Data

**Tipo:** tidy, nessun cambiamento di comportamento. Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-198, B-199, B-200, B-219, B-221, B-134, B-126, B-098, B-260, B-041, B-264, B-269, B-033, B-034, B-032, B-038, B-184, B-031, B-037, B-299, B-296, B-055, B-181, B-203, B-206, B-263, B-273, B-274, B-282, B-285, B-289, B-290, B-300, B-331, B-332, B-333, B-344, B-392, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Codice morto, duplicazioni, costruzioni ripetute di `Intl.NumberFormat`, test deboli e copie locali di idiomi condivisi.

## Comportamento attuale

- `money.js` e `costgrid-calc.js`: B-198, B-219, B-221, B-199, B-200, B-126, B-134.
- Codice morto e duplicati: B-098, B-260, B-041, B-264, B-033, B-299, B-289, B-331, B-344, B-282.
- Test deboli: B-034, B-269, B-206.
- Pipeline board: B-032, B-038, B-184, B-031, B-037, B-296, B-055.
- Master Data: B-181, B-203, B-263, B-273, B-274, B-285, B-290, B-300, B-332, B-333, B-392.

## Comportamento atteso

- La stessa funzione di prima con meno codice, test più stretti e nessun comportamento visibile cambiato.

B-184 è latente e senza casi nei dati: il brainstorming può chiuderla come non necessaria.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. `npm test` passa senza test modificati se non quelli resi più stretti.
2. I guard `js/lib/money-guard.test.js` e `js/lib/foundations-guard.test.js` passano.

## Scope escluso esplicitamente

- Qualsiasi correzione di bug (cicli 5-10).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
