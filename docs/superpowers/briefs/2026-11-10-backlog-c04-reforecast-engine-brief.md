# Brief — backlog, ciclo 4: motore di reforecast e distribuzione del phasing

**Tipo:** audit-fix (Scenario 3) con due punti di design (B-319, B-320). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-313, B-314, B-315, B-316, B-317, B-318, B-319, B-320, B-321, B-323, B-324, B-325, B-326, B-152, B-239, B-318, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Il calcolo di spalmatura e riporto in `js/lib/config-form-calc.js` ha più difetti che nascono dalla stessa struttura: serie separate per ore e denaro, chiavi per nome normalizzato, arrotondamenti per mese senza ripresa del resto.

## Comportamento attuale

- B-313, B-314, B-324, B-325, B-321: ripartizione e arrotondamento (margine zero, ore grezze, chiavi diverse, resto perso, ore passate non arrotondate).
- B-315, B-317, B-326: chiavi per nome e ruoli vuoti, consumato contato prima del controllo del mese.
- B-319, B-320: il riporto è per serie e non assorbe un residuo negativo.
- B-152, B-239, B-318: controlli di distribuzione che saltano la parte fuori periodo o sommano solo `months`, e un errore sempre nullo.

## Comportamento atteso

- Il totale distribuito è uguale al totale richiesto per ogni serie, con il resto ripreso dall'ultimo mese aperto.
- Ore e denaro seguono la stessa regola di ripartizione.

**Punto di design (B-319, B-320).** Il riporto per serie e il residuo negativo cambiano il comportamento visibile: il `/brainstorming` sceglie con l'utente prima di ogni modifica. Le altre voci non dipendono da questa scelta e si fanno dopo di essa.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test vitest che, per ogni voce, fallisce sul vecchio calcolo e passa sul nuovo.
2. Una proprietà: somma distribuita = somma richiesta per input con margine zero, residuo negativo e mesi passati.
3. `npm test` passa.

## Scope escluso esplicitamente

- Le regole di periodo (ciclo 3).
- Il salvataggio parziale (ciclo 5).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
