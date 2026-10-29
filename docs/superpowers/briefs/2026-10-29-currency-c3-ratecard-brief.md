# Brief — valute nei form, ciclo 3: la rate card del cliente

**Tipo:** misto. La parte formato (M-01, M-02, M-03 su `master-clients.html`) è un audit-fix. La parte M-06 ha la **forma evolutiva** (Scenario 2): il comportamento atteso di "campo vuoto" non è deciso, e probabilmente richiede uno schema diverso (`ratecard_entries.hourly_rate` è `NOT NULL`, `001_initial.sql:61`). Il brainstorming parte quindi da alternative, non da un fix. Raggruppamento confermato dall'utente il 2026-10-29.
**Origine:** `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`, finding **M-06**, **M-01/M-02/M-03** per `master-clients.html`, e la nota "Out of scope" sul codice morto di `js/ratecards.js`.
**Sequenza:** ciclo 1 server → ciclo 2 form Vue → ciclo 3 (questo) → ciclo 4 B-183.

## Problema

Nella rate card del cliente le tariffe non passano per `money.js` e mescolano `step="1"` e `step="0.01"` (M-01, M-02). L'"agency default" accanto è formattato in inglese con `€` scritto fisso (M-03). Il salvataggio non sa esprimere "nessuna tariffa per questo cliente" (M-06):
- un EUR vuoto accanto a un override diventa 0, e il cost grid usa quello 0 come tariffa del cliente;
- un campo svuotato non cancella la voce salvata.

## Comportamento attuale

Per evidenze e righe vale il report. In sintesi:
- **M-06 (a):** `hourlyRate: rateMap[rid] ?? 0` (`master-clients.html:445`), salvato da `config.js:392-404`. Poi `if (!isNaN(rate)) _cgActiveRatecardMap[rid] = rate` (`js/costgrid.js:343`) prende 0 come tariffa EUR del cliente. Il form lo ricarica vuoto (`master-clients.html:346`). Oggi nel DB ci sono 0 voci con `hourly_rate = 0`.
- **M-06 (b):** il payload contiene solo i campi non vuoti e la route fa solo upsert, quindi una voce svuotata resta.
- **M-01/M-02:** input `type="number"` costruiti come stringa HTML (`master-clients.html:374,386`), letti con `parseFloat` (`:425-437`).
- **M-03:** `defFmt` con `toLocaleString('en', …)} €/h` (`:366`), e il placeholder con il valore grezzo (`:372`).
- **Codice morto:** l'editor modale di `js/ratecards.js` (`openRatecardsModal`, `_rcRenderEntries`, `_rcSaveEntries`, `:243-393`) non ha chiamanti e duplica questi input, M-06 compreso. Si usa solo `loadRatecardsForDropdown` (`:404`).

## Alternative per M-06 (da decidere in `/brainstorming`)

- **A.** "Vuoto" significa che il cliente non ha una tariffa per quel ruolo. La voce viene cancellata quando tutti i suoi campi sono vuoti. Quando resta solo un override, `hourly_rate` diventa nullable (migrazione) e `NULL` significa "default dell'agenzia". Il cost grid tratta `NULL` come assente.
- **B.** Una voce con un override richiede anche la tariffa EUR. Il form lo impone e il server lo rifiuta altrimenti. Nessuna migrazione, ma l'utente deve inserire un EUR che forse non usa.
- **C.** Gli override per valuta si spostano fuori da `ratecard_entries`, oppure si sceglie un'altra forma proposta in brainstorming.

La scelta deve restare coerente con quella del ciclo 1 su M-04 (0 è una tariffa valida o no).

## Comportamento atteso

- Ogni campo tariffa della rate card formatta al focus e al blur con `money.js`, nella valuta della propria colonna: EUR per la colonna base, la valuta della colonna per ogni override. I decimali sono quelli della valuta.
- L'"agency default" e i placeholder sono formattati con `formatMoney`/`currencyInfo` della valuta della colonna.
- Salvare la rate card non produce mai una tariffa che l'utente non ha scritto. Svuotare un campo riporta quel ruolo al default dell'agenzia, nel modo che il brainstorming sceglie tra le alternative.
- L'editor morto di `js/ratecards.js` viene cancellato, oppure allineato se il brainstorming trova una ragione per tenerlo. `loadRatecardsForDropdown` resta.

## Vincoli

- **Dipende dai cicli 1 e 2:** la validazione server delle rate card (ciclo 1) e la tecnica e la guardia per i campi money (ciclo 2) sono già fissate quando questo ciclo parte.
- Il markup è una stringa HTML, non un template Vue. Agganciare focus e blur richiede listener, oppure la riscrittura della tabella come template: la Spec sceglie.
- Una migrazione, se scelta, è un file numerato in `api/src/db/migrations/`, applicato a mano. Prima del Gate 4 serve un `pg_dump` (`scripts/backup-db.sh`). Lo stack di branch non riceve la migrazione da solo (CLAUDE.md, "DB migrations").
- Il `PATCH` delle voci della rate card non usa una transazione (nota "Out of scope" del report). Se questo ciclo riscrive quella route, il brainstorming decide se aggiungerla qui o lasciarla in `docs/BACKLOG.md`.
- Le route modificate richiedono `docker compose restart api` solo nella deroga del Gate 4 step 7. `?v=N` aggiornati per ogni `js/*.js` toccato. Verifica visiva con `scripts/shoot.mjs`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Nessun campo della rate card in `master-clients.html` è `type="number"`, e la guardia del ciclo 2 lo copre.
2. `test-api.js` verifica che, dopo il salvataggio di una voce con override e EUR vuoto, nessuna tariffa EUR 0 esista per quel ruolo e che il cost grid usi il default del ruolo. La forma esatta dipende dall'alternativa scelta.
3. `test-api.js` verifica che una voce svuotata e salvata non restituisca più la tariffa precedente.
4. `openRatecardsModal` e le funzioni di editing di `js/ratecards.js` non esistono più, oppure sono allineate (decisione documentata nella Spec).
5. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- Le altre pagine (ciclo 2), B-183 (ciclo 4) e le regole server non legate alla rate card (ciclo 1).
- I limiti `DECIMAL(10,2)` delle colonne (nota "Out of scope" del report).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
