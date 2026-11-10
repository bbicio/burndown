# Brief — backlog, ciclo 7: Master Data, bug

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-268, B-270, B-271, B-272, B-275, B-276, B-277, B-278, B-279, B-283, B-287, B-288, B-327, B-328, B-329, B-330, B-180, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Le pagine `master-clients.html`, `master-pipelines.html` e `master-currencies.html` hanno difetti reali di integrità, gara e messaggi nati dal redesign.

## Comportamento attuale

- Integrità: B-270, B-271, B-275, B-279, B-288.
- Gara e ricarico: B-276, B-328, B-329.
- Messaggi e stati: B-268, B-272, B-277, B-278, B-283, B-180.
- Numeri: B-287, B-327, B-330.

## Comportamento atteso

- Ogni voce ha il comportamento descritto nella sua riga, senza cambiare i layout confermati dalle board.

B-275 (creazione di una rate card all'apertura) e B-270 (rimozione e riassegnazione con rollback best-effort) vanno decisi a livello di API prima del Vue.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test per ogni voce che si può fissare con vitest.
2. `js/lib/master-data-guard.test.js` passa.
3. Verifica visiva con `scripts/shoot.mjs` per B-268, B-272, B-277, B-283.

## Scope escluso esplicitamente

- Le pulizie e l'accessibilità di Master Data (cicli 9 e 11).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
