# Brief — backlog, ciclo 9: accessibilità, focus e controlli dei selettori

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-368, B-372, B-386, B-388, B-390, B-291, B-335, B-250, B-040, B-243, B-030, B-144, B-145, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Menu, dialog e selettori di data non gestiscono il focus in modo uniforme: nessun ripristino o trap, tastiera incompleta, listener globali per istanza.

## Comportamento attuale

- Focus e trap: B-368, B-386, B-388, B-390, B-291, B-335.
- Tastiera e ruoli: B-372, B-040, B-243, B-250.
- Selettori: B-030, B-144 (listener per istanza, Home/End), B-145 (popover inline).

## Comportamento atteso

- Ogni dialog e menu sposta il focus all'apertura e lo riporta alla chiusura; ogni selettore ha un solo gestore tastiera.

Il brainstorming decide se introdurre un helper condiviso di focus trap in `js/` invece di una copia per pagina.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Test jsdom per apertura, chiusura e Tab ciclico sui dialog toccati.
2. `npm test` passa.
3. Verifica manuale da tastiera.

## Scope escluso esplicitamente

- Le gare e il doppio invio (ciclo 8).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
