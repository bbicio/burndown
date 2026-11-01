# Brief — finding valute, ciclo f3: tariffe Custom persistite e tasso della versione nell'editor

**Brief started:** 2026-11-01 19:45
**Tipo:** evoluzione (Scenario 2), nato da un audit. **Perché non è un audit-fix come f1/f2:** il difetto non si corregge riallineando del codice a una regola esistente. Manca una decisione di design: dove e come si memorizza che una tariffa di ruolo è una scelta Custom. Le alternative sono sotto; la scelta spetta al `/brainstorming`.
**Raggruppamento e ordine** confermati dall'utente il 2026-11-01.
**Origine:** cold review `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md` (**F-01**, **F-05** e la nota fuori perimetro sul calcolo fee lato server), più le righe di `docs/BACKLOG.md` **B-195, B-213, B-215**.
**Perché insieme:**
- F-01 e B-195 hanno la stessa causa.
- Il testo corretto di B-215 dipende da come questo ciclo risolve F-01.
- Il fallback del calcolo fee diventa raggiungibile proprio con questa modifica.
- B-213 ha una causa diversa ma tocca lo stesso `onCurrencyChange` e la stessa domanda: il tasso dell'editor è quello del server? È il punto più facile da staccare, se il ciclo risulta troppo grande.

**Sequenza:** f1 campi client → f2 validazione server → f3 (questo) → f4 rate card.

## Problema

Il server non memorizza se una tariffa di ruolo di un cost grid è una scelta Custom. La structure `PUT` salva un `rate_override` per ogni ruolo con ore, e al ricaricamento ogni `rate_override` presente marca il ruolo Custom. Di conseguenza:
- **F-01:** la decisione 2 della Spec c4 (le versioni salvate si riallineano da sole all'apertura) non vale per nessuna versione salvata. Una versione le cui tariffe sono state calcolate con un tasso diverso da quello della versione lo tiene finché l'utente non resetta ogni ruolo o non cambia valuta.
- **B-195:** ogni ruolo di una versione ricaricata mostra "Custom · reset". `cgRateIsMissing` deve quindi leggere la baseline per distinguere uno 0 voluto da una tariffa mancante.
- **B-215 / F-05:** la conferma del refresh del tasso su `pipeline.html` dice che i valori di "reset to" dell'editor seguono il nuovo tasso. Non è vero per un ruolo con override per valuta (rate card o ruolo). Un test (`js/lib/costgrid-version-rate.test.js`) fissa quel testo sbagliato.
- **B-213:** `onCurrencyChange` imposta `draft.currencyRate` dalle valute caricate con la pagina. Il `PATCH` della versione applica invece il tasso in vigore al momento del salvataggio, e l'editor non lo rilegge. Un cambio del tasso fatto da un admin a editor aperto lascia editor e DB su tassi diversi fino al ricaricamento.

## Comportamento attuale

Va riletto nel codice prima del brainstorming; le righe sono quelle del report.
- Salvataggio: `rateOverride: rateByCode[code] ?? null`, con `rateByCode` popolato da ogni ruolo del body (`api/src/routes/cost-grids.js`, structure `PUT`).
- Caricamento: `const isCustom = override != null;` (`js/api-sync.js`, `cgLoadStructureFromApi`).
- Sincronizzazione all'apertura: `if (r.rateIsCustom && !force) return;` (`js/costgrid.js`, `cgSyncRoleRatesToBaseline`).
- Dati del 2026-11-01: 0 righe di `task_roles` senza `rate_override` su 86; una sola versione non EUR (USD), già allineata (tasso salvato 1,3 = live).
- Calcolo fee lato server: `COALESCE(tr.rate_override, <tariffa EUR della rate card>, <tariffa EUR del ruolo>, 0)` (in `/budgets` senza il passo della rate card), senza conversione nella valuta della versione (`api/src/lib/pot-fee-sql.js`, `api/src/routes/cost-grids.js` `/budgets`, `api/src/routes/exports.js`, `api/src/routes/reporting.js`). Oggi non si raggiunge mai, perché ogni riga ha un `rate_override`.

## Alternative da valutare nel brainstorming

1. **Flag persistito** (per esempio `task_roles.rate_is_custom`, o un flag per ruolo a livello di versione), con migrazione. Il `rate_override` resta lo snapshot e i calcoli server non cambiano. Da decidere il valore iniziale dei dati esistenti (oggi tutto è "Custom").
2. **Custom derivato al caricamento**, confrontando la tariffa salvata con la baseline. Nessuna migrazione, ma fallisce proprio nel caso di F-01: quando la baseline si è spostata, ogni ruolo sembra Custom.
3. **`rate_override` solo per i ruoli Custom**, con la tariffa dei ruoli non Custom calcolata al bisogno. Rende vero F-01 senza flag, ma obbliga a convertire nella valuta della versione ogni lettore server del fallback (la nota fuori perimetro del report), e cambia i totali storici quando la baseline si muove.

Per B-213 le alternative restano quelle scartate dalla Spec c4 (decisioni 1 e 3):
- rileggere `currency_rate` dalla risposta del `PATCH` della versione;
- accettare la divergenza e documentarla.

## Comportamento atteso

- Una tariffa di ruolo è Custom dopo il ricaricamento se e solo se l'utente l'ha resa tale.
- Ricaricata, una versione non Custom segue la baseline al tasso della versione, cioè la decisione 2 della Spec c4 diventa vera.
- `cgRateIsMissing` torna a poter leggere la sola custom-ness, se l'alternativa scelta lo consente.
- La conferma del refresh del tasso descrive quello che succede davvero dopo questo ciclo, e il suo test cambia di conseguenza.
- Editor e DB non restano su tassi diversi dopo un cambio valuta, oppure la divergenza è una scelta scritta nella Spec.

## Vincoli

- Non si rimette in discussione chi decide il tasso della versione (`api/src/lib/version-rate.js`, `refresh-rate`).
- I totali delle versioni già salvate non devono cambiare senza una decisione esplicita della Spec: sono gli importi delle offerte.
- Una migrazione va numerata in `api/src/db/migrations/`, applicata a mano, e annotata in `docs/db/migrations.md`. Prima di applicarla al DB principale: backup (`scripts/backup-db.sh`) e conferma dell'utente (CLAUDE.md, Infrastructure safety).
- `js/costgrid.js`, `js/api-sync.js`, `js/lib/costgrid-calc.js` e `pipeline.html`: ogni `?v=N` toccato va aggiornato in tutti i riferimenti.
- Le scritture sotto `/api/cost-grids` invalidano già la cache del planning (`PLANNING_WRITE_PREFIXES`).
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

Da rifinire nella Spec in base all'alternativa scelta. Come minimo:
1. Un test verifica che una versione salvata con un ruolo non Custom e uno Custom, ricaricata, abbia `rateIsCustom` falso sul primo e vero sul secondo.
2. Un test verifica che, ricaricata con un `currencyRate` diverso da quello con cui le tariffe erano state calcolate, la versione riallinei il ruolo non Custom e lasci invariato quello Custom.
3. Il testo della conferma del refresh del tasso e il suo test descrivono il comportamento nuovo, anche per un ruolo con override per valuta.
4. B-213 è risolto oppure è chiuso come divergenza accettata, con la motivazione nella Spec.
5. Le righe B-195, B-213 e B-215 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito. F-01 è citato nella chiusura di B-195.
6. Verifica nel browser su una versione non EUR: un ruolo non Custom ricaricato non mostra "Custom · reset".
7. `npm test`, i test `node:test` di `api/` e il profilo di integrazione passano.

## Scope escluso esplicitamente

- Il ricalcolo massivo delle tariffe salvate, a meno che la Spec non lo decida esplicitamente come conseguenza dell'alternativa scelta.
- Formato e decimali delle tariffe (ciclo f1), validazione server (ciclo f2), rate card (ciclo f4).
- B-184.
- L'export CSV della rate card (nota fuori perimetro del report): `/api/exports/*` non ha UI.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
