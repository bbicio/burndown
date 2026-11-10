# Brief — backlog, ciclo 6: overlay di salvataggio, logout e pulizia della navigazione

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-346, B-347, B-348, B-349, B-350, B-351, B-352, B-353, B-354, B-355, B-356, B-357, B-358, B-359, B-360, B-015, B-052, B-103, B-399, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

L'overlay di salvataggio di `js/nav.js` e `js/api.js` ha difetti di conteggio, focus, z-index e inerting che condividono lo stesso meccanismo.

## Comportamento attuale

- Conteggio: B-355, B-356 (ogni GET conta mentre un salvataggio è aperto), B-360 (il logout lo attiva).
- Focus e inert: B-347, B-348, B-351, B-352 (il blur lancia i salvataggi su testo a metà), B-357.
- Livelli e layout: B-346, B-358, B-359. Salvataggi in background all'uscita: B-353, B-354 (verifica pendente).
- Pulizia: B-349, B-350, B-015, B-052, B-103, B-399.

## Comportamento atteso

- L'overlay conta solo le scritture, ripristina il focus senza scorrere la pagina, e nessun salvataggio parte su un campo che l'overlay ha disattivato.

Il `/brainstorming` rilegge `docs/js/nav.md` prima di toccare l'ordine di show/hide.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test vitest per il conteggio, per `show()`/`hide()` e per il ripristino del focus.
2. `js/lib/nav-shell-guard.test.js` e `js/lib/nav-layout-guard.test.js` passano.
3. Verifica con `scripts/shoot.mjs` e lettura dei PNG.

## Scope escluso esplicitamente

- I salvataggi parziali (ciclo 5).
- L'accessibilità delle altre pagine (ciclo 9).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
