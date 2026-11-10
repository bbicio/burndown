# Brief — backlog, ciclo 10: portfolio e planning: refactor del breakdown e calcoli di report

**Tipo:** audit-fix (Scenario 3) con un punto di design (B-262, B-013). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-068, B-069, B-070, B-071, B-072, B-073, B-074, B-075, B-076, B-077, B-078, B-079, B-246, B-247, B-248, B-249, B-250, B-251, B-252, B-253, B-254, B-255, B-256, B-257, B-258, B-259, B-260, B-261, B-262, B-082, B-084, B-316, B-013, B-049, B-050, B-014, B-053, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Il breakdown di `portfolio.html` regge il suo stato in un registro con chiavi a stringa (B-262), da cui discendono duplicazioni, calcoli nel template e chiavi spezzate su `|`. I calcoli di report confrontano nomi con normalizzazioni diverse.

## Comportamento attuale

- Breakdown: B-068, B-078, B-079, B-251, B-252, B-253, B-254, B-255, B-256, B-257, B-259, B-261, B-262.
- Planning: B-246, B-247, B-248, B-249, B-250 (se non già del ciclo 9).
- Calcoli: B-082, B-084, B-316 (normalizzazione dei nomi), B-049, B-050 (burndown di programma), B-013 (totali con valute miste).
- B-014, B-053: verifica pendente dal ciclo 0.

## Comportamento atteso

- Un modello di stato esplicito per le voci del breakdown; un unico confronto di nomi normalizzati nei calcoli di report.

**Punto di design.** B-262 è L e cambia la struttura; B-013 richiede una scelta di prodotto (convertire o mostrare per valuta). Il brainstorming li decide per primi.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test vitest su calcolo e modello di stato.
2. `npm test` passa.
3. Verifica con `scripts/shoot.mjs` delle viste Entries e By area.

## Scope escluso esplicitamente

- B-250 se già coperto dal ciclo 9.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
