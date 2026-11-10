# Brief — backlog, ciclo 8: gare, doppio invio ed errori sulle pagine admin

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-343, B-364, B-365, B-367, B-369, B-375, B-398, B-384, B-385, B-393, B-394, B-395, B-402, B-405, B-125, B-036, B-345, B-389, B-391, B-337, B-338, B-340, B-341, B-342, B-363, B-366, B-370, B-371, B-374, B-383, B-387, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Le pagine admin, team, attribute-lists, timesheets, profile e pipeline condividono lo stesso schema di difetti: nessuna guardia di invio in corso, risposte fuori ordine che sovrascrivono lo stato, errori di rete non distinti, `fetch` diretto senza il comportamento di `apiFetch`.

## Comportamento attuale

- Gare e doppio invio: B-343, B-364, B-367, B-384, B-394, B-395, B-125, B-385.
- Errori e stati: B-365, B-369, B-375, B-398, B-393, B-383, B-374.
- Dati: B-402, B-405, B-338, B-342, B-363, B-370.
- Porting a `apiFetch`: B-345, B-389, B-391. Altre: B-36, B-337, B-340, B-341, B-366, B-371, B-387.

## Comportamento atteso

- Ogni scrittura ha una guardia di invio in corso, ogni risposta tardiva è scartata, ogni errore HTTP ha un testo corretto e passa per `apiFetch`.

Le correzioni nate dallo stesso schema usano un solo idioma condiviso, non una variante per pagina.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test vitest sull'idioma condiviso e sulle funzioni pure toccate.
2. `npm test` passa.
3. Verifica manuale per ogni pagina toccata.

## Scope escluso esplicitamente

- Il focus e l'accessibilità (ciclo 9).
- L'hardening della sessione (ciclo 1).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
