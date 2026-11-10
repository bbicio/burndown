# Brief — backlog, ciclo 12: CSS, token e badge

**Tipo:** tidy con tre bug minori. Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-038, B-104, B-113, B-119, B-139, B-143, B-173, B-265, B-266, B-339, B-373, B-408, B-380, B-381, B-142, B-093, B-094, B-095, B-121, B-120, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Valori letterali al posto dei token, regole CSS duplicate o morte, e `headerBadge` che non ha un ripiego per valori non elencati.

## Comportamento attuale

- Token e letterali: B-038, B-104, B-113, B-139, B-143.
- Duplicazioni e CSS morto: B-173, B-265, B-266, B-339, B-373, B-121.
- Responsive e layout: B-119, B-380, B-381, B-408, B-142.
- Badge: B-093, B-094 (nessun ripiego per Draft o valori diversi), B-095.
- B-120: test del page head con indice fragile.

## Comportamento atteso

- Ogni colore e misura viene da un token; `headerBadge` mostra sempre qualcosa di sensato.

`css/tokens.css` ha una soglia di contrasto: `js/lib/tokens.test.js` resta verde.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. `npm test` passa.
2. Verifica con `scripts/shoot.mjs` delle pagine toccate e lettura dei PNG.

## Scope escluso esplicitamente

- I componenti `pd-` condivisi (ciclo 14, B-376).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
