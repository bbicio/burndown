# Brief — backlog, ciclo 5: fallimenti del Generate project, salvataggi silenziosi e difetti dell'editor

**Tipo:** audit-fix (Scenario 3) con un punto di design (B-225). Raggruppamento confermato dall'utente il 2026-11-10; il brainstorming può dividerlo in due.
**Origine:** `docs/BACKLOG.md`, voci B-163, B-164, B-165, B-166, B-168, B-171, B-230, B-232, B-233, B-234, B-237, B-238, B-242, B-225, B-201, B-202, B-218, B-220, B-228, B-240, B-241, B-244, B-083, B-085, B-102, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Quando un salvataggio o un Generate project fallisce in parte, la memoria, il server e l'avviso all'utente divergono. Radice comune: `js/api-sync.js` e `js/costgrid.js` decidono per ogni sezione in modo diverso cosa notificare e cosa scartare. Le voci dell'editor (`costgrid.html`, `project-config.html`) sono validazioni e salvataggi per battitura.

## Comportamento attuale

- Fallimento parziale: B-163, B-234, B-232, B-233, B-237, B-242, B-238.
- Avvisi: B-164, B-165, B-166, B-168, B-171.
- Tariffe: B-230, B-228, B-201, B-202, B-218. Viewer e sezioni: B-220, B-240, B-241, B-244.
- B-225: gara fra callback `onServerRate`/`onPatched` e insieme a livello di modulo. B-083, B-085, B-102: data dell'actual in UTC, `cgImportAll` rotto e senza chiamanti, accoppiamento al pulsante.

## Comportamento atteso

- Un solo percorso di esito, per ogni sezione: ciò che il server rifiuta non resta nella memoria e l'utente ne è informato.
- La tariffa si valida a fine digitazione e `rateIsCustom` guida l'export.

**Punto di design (B-225, L).** Il ridisegno della gara fra salvataggi può essere un ciclo a sé: il brainstorming lo dice e, se sì, lo isola come Brief.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test vitest per esito parziale per sezione (tasks, PTC, link).
2. Un test per B-083 su giorni di calendario in fusi diversi.
3. `npm test` passa; una verifica manuale per B-201/B-218 sulla cost grid.

## Scope escluso esplicitamente

- Le regole di periodo (ciclo 3).
- L'overlay di salvataggio (ciclo 6).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
