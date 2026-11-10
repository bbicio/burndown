# Brief — backlog, ciclo 13: documenti e igiene dei test

**Tipo:** documentazione e test, senza codice di prodotto. Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-011, B-035, B-039, B-172, B-211, B-231, B-322, B-025, B-058, B-059, B-060, B-061, B-064, B-123, B-336, B-361, B-362, B-382, B-413, B-411, B-009, B-024, B-127, B-023, B-054, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Documenti che descrivono ciò che non esiste più, test con etichette duplicate o commenti fuori posto, strumenti con difetti noti (`test-cases-parse.js`, `extract-source.mjs`, lo script `migrate`).

## Comportamento attuale

- Documenti: B-025, B-058, B-059, B-060, B-061, B-064, B-123, B-336, B-361, B-362, B-382, B-413, B-411.
- Test: B-011, B-035, B-039, B-172, B-211, B-231, B-322.
- Strumenti: B-009, B-127, B-023, B-054, B-024 (`migrate` rilancia tutti i file non idempotenti: va rimosso o reso sicuro).

## Comportamento atteso

- Ogni frase corretta o cancellata (di preferenza cancellata), ogni test con etichetta unica, ogni strumento con il suo difetto chiuso o dichiarato.

Si applicano le regole di "Writing documentation" di `CLAUDE.md`.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. `scripts/doc-paths-guard.test.js`, `scripts/claude-md-guard.test.js` e `scripts/architecture-guard.test.js` passano.
2. `npm test` passa.

## Scope escluso esplicitamente

- Il codice di prodotto.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
