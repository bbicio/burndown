# Brief — backlog, ciclo 0: chiusura del triage, senza codice

**Tipo:** processo (no-code). Raggruppamento confermato dall'utente il 2026-11-10.
**Origine:** `docs/BACKLOG.md`, voci B-396, B-397, B-400, B-409, B-178, B-179, B-108, B-146, B-148, B-281, B-286, B-295, B-008, B-014, B-021, B-026, B-027, B-028, B-053, B-056, B-065, B-227, B-229, B-284, B-298, B-301, B-354, triage del 2026-11-10.
**Sequenza concordata:** vedi `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## Problema

Il triage a livello di grep ha classificato una parte delle righe aperte come già risolte, obsolete o non decidibili. Finché restano `open` falsano ogni ciclo successivo. Alcune righe non sono state coperte dagli agenti di triage.

## Comportamento attuale

- Risolte secondo il triage: B-396, B-397, B-400, B-409, B-178, B-179, B-108, B-146, B-148.
- Obsolete secondo il triage, perché il comportamento è voluto dalla spec: B-281, B-286, B-295.
- Incerte: B-008, B-014, B-021, B-026, B-027, B-028, B-053, B-056, B-065, B-227, B-229, B-284, B-298, B-301, B-354.

## Comportamento atteso

- Ogni riga risolta o obsoleta passa a `closed` con, in `Verified how`, il comando eseguito (grep, test o lettura del file) e il suo esito, mai la sola frase del triage.
- Ogni riga incerta è risolta: chiusa, ridiretta al ciclo che la copre, oppure lasciata `open` con `Verified how: unverified — <cosa serve>`.
- Le righe aperte che il triage non ha coperto sono riverificate con lo stesso metodo e ripartite fra i cicli di `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.
- Le righe aperte B-009, B-010, B-024, B-127 e le altre di tooling non nominate dai cicli 1-14 sono verificate qui solo se il ciclo 13 non le copre.

Le sole modifiche sono a `docs/BACKLOG.md` (e alla tabella dell'indice). Nessun file di codice.

## Vincoli

- Per evidenze e righe vale la riga di `docs/BACKLOG.md`; i numeri di riga citati lì sono slittati, si cerca per pattern.
- Prima di toccare una voce il ciclo la riverifica sul codice: il triage del 2026-11-10 è a livello di grep. Una voce già risolta o non più sensata si chiude con il comando eseguito in `Verified how`, senza codice.
- Un file `js/*.js`, `js/lib/*.js` o `css/*.css` toccato richiede di aggiornare tutti i riferimenti `?v=N`.
- Una route modificata richiede `docker compose restart api` sullo stack principale: solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Nessuna riga resta in uno stato non deciso senza il testo `unverified — …`.
2. Per ogni riga chiusa il comando di `Verified how` è stato eseguito nella sessione del ciclo.
3. `scripts/doc-paths-guard.test.js` passa.

## Scope escluso esplicitamente

- Qualsiasi correzione di codice: le righe ancora aperte vanno ai cicli 1-14.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
