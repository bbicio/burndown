# Brief — backlog, ciclo 14: decisioni di design, una per volta

**Tipo:** evoluzione (Scenario 2): non sono difetti meccanici. Questo brief non si esegue come un ciclo: ogni voce va a `/brainstorming` da sola. Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-235, B-293, B-294, B-013, B-376, B-379, B-377, B-245, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Voci la cui correzione dipende da una scelta di prodotto non ancora presa.

## Comportamento attuale

- B-235: i POT speciali non sono mai abbinati alle proposte.
- B-293: `COALESCE(pipeline_year, current)` conserva un anno forse inattivo. B-294: l'anno chiuso resta selezionabile (voluto dalla spec §3.2).
- B-013: totali di programma con valute miste, cifre grezze etichettate EUR.
- B-376: i componenti `pd-` sono usati solo da `team.html`. B-379: design del telefono non costruito per Team.
- B-377: nessun annulla sui banner di Team. B-245: i figli del ruolo non portano l'elenco dei proprietari.

## Comportamento atteso

- Per ciascuna voce un'alternativa scelta, oppure la decisione esplicita di non farla.
- Una voce decisa "no" si chiude con il motivo in `Verified how`.

Ogni voce propone alternative, non un fix unico. Per B-013 vale anche il ciclo 10.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Per ogni voce: una decisione scritta in `docs/BACKLOG.md` o un Brief dedicato.

## Scope escluso esplicitamente

- Qualsiasi implementazione prima della decisione.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
