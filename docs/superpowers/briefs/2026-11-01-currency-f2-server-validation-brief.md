# Brief — finding valute, ciclo f2: la validazione server residua

**Brief started:** 2026-11-01 19:45
**Tipo:** audit-fix (Scenario 3). Raggruppamento e ordine confermati dall'utente il 2026-11-01.
**Origine:** follow-up del ciclo c1, raggruppati per tema nell'handoff `docs/superpowers/briefs/2026-11-01-currency-c4-and-findings-handoff.md` (punto 3), corretto dalla cold review `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md` (F-04: B-185 appartiene a questo gruppo, non a quello client). Righe di `docs/BACKLOG.md`: **B-185, B-186, B-188**.
**Perché insieme:** tutti e tre sono importi scritti dal server senza passare per `amountError` (`api/src/lib/money-rules.js`), oppure passandoci con un limite che manca. Il rifiuto è lo stesso: `400 { error, code: 'MONEY_RULE' }`. B-207, che l'handoff metteva qui, è passato al ciclo f4, perché decidere cosa sia una rate card senza cliente è una scelta di design.
**Sequenza:** f1 campi client → f2 (questo) → f3 custom-ness e tasso della versione → f4 rate card.

## Problema

Il ciclo c1 ha messo sotto `amountError` le tariffe e gli importi POT. Restano fuori:
- gli altri importi (PTC dei task del cost grid, PTC e phasing del progetto);
- la seconda forma del body della structure `PUT`.

E `amountError` non ha un limite superiore: un valore troppo grande per la colonna risponde 500 invece di `MONEY_RULE`.

## Comportamento attuale

Evidenze e comandi stanno nelle righe del backlog; vanno rieseguiti prima della Spec.
- **B-185:** la structure `PUT` scrive `tk.ptc || 0` (`api/src/routes/cost-grids.js` righe 823 e 827, al 2026-11-01). `PATCH /api/projects/:id/phasing` e `PATCH /api/projects/:id/ptc` scrivono `JSON.stringify(...)` di quello che arriva (`api/src/routes/projects.js` righe 525 e 537): negativi, stringhe, troppi decimali.
- **B-186:** la seconda forma del body della structure `PUT` (`tasks[].roles[]` con `roleId`/`rateOverride`) scrive `tr.rateOverride || null` senza controllo, e trasforma uno 0 in `NULL`. Nessun client la usa; la usa solo `test-api.js`.
- **B-188:** `amountError` non ha limite superiore. Una tariffa ≥ 1e8 (`DECIMAL(10,2)`, `api/src/db/migrations/001_initial.sql`) o un POT ≥ 1e12 (`NUMERIC(14,2)`, migrazione 005) supera la colonna e dà 500.

**Causa:** la decisione 8 della Spec c1 ha limitato il ciclo a tariffe e POT; la seconda forma del body è stata vista solo durante il Piano; il limite superiore è emerso in Gate 3.

## Comportamento atteso

- Ogni PTC e ogni valore di phasing scritto dal server è un importo valido nella valuta del suo contesto (la versione per la PTC dei task, il progetto per PTC e phasing di progetto), altrimenti `400 MONEY_RULE` prima di qualsiasi scrittura.
- La seconda forma del body della structure `PUT` o applica la stessa regola delle tariffe della prima forma (uno 0 resta 0), oppure viene rimossa. Lo decide il brainstorming dopo aver letto `test-api.js`.
- Un importo oltre la capienza della colonna risponde `400 MONEY_RULE`, non 500.

## Vincoli

- Le regole di CLAUDE.md, "Money formatting and parsing", restano valide: solo un numero JS è un importo, il client manda numeri.
- Prima di rifiutare dati già salvati, misurare sul DB principale (`SELECT` in sola lettura) quanti PTC/phasing esistenti violerebbero la regola. Un progetto che non si può più salvare è lo stesso rischio già accettato per B-187.
- Le route toccate hanno il loro test in `test-api.js`: il ciclo li estende lì.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test in `test-api.js` verifica che structure `PUT`, `PATCH …/ptc` e `PATCH …/phasing` rifiutino con `MONEY_RULE` un negativo, una stringa e un importo con troppi decimali, e accettino un importo valido.
2. Un test verifica il comportamento scelto per la seconda forma del body (0 conservato e valore validato, oppure forma rifiutata).
3. `api/src/lib/money-rules.test.js` verifica che `amountError` rifiuti un valore oltre il limite della colonna.
4. Le righe B-185, B-186 e B-188 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
5. `npm test`, i test `node:test` di `api/` e il profilo di integrazione (`scripts/run-tests.sh`) passano.

## Scope escluso esplicitamente

- I campi client di PTC e phasing (B-216, ciclo f1).
- B-189 (valuta letta fuori dal lock), B-191 (risorsa `null`), B-192 (404 invece di 400 per un id inesistente), B-193 (type parser NUMERIC), B-194 (vincolo `pots_target_xor`).
- B-207 e tutta la rate card (ciclo f4).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
