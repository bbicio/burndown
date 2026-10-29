# Brief — valute nei form, ciclo 1: il server valida tariffe e importi, e 0 è una tariffa

**Tipo:** audit-fix (Scenario 3) con un punto di design (M-04, vedi sotto). Raggruppamento confermato dall'utente il 2026-10-29.
**Origine:** `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`, finding **M-05, M-04, M-07**.
**Sequenza concordata:** ciclo 1 (questo) → ciclo 2 form Vue (`2026-10-29-currency-c2-vue-rate-inputs-brief.md`) → ciclo 3 rate card (`2026-10-29-currency-c3-ratecard-brief.md`) → ciclo 4 B-183 (`2026-10-29-currency-c4-b183-version-rate-baselines-brief.md`).

## Problema

Le route che scrivono tariffe e importi si fidano del controllo `type="number"` del client. Non verificano che il valore sia un numero finito ≥ 0 (M-05). In più, due di esse confondono "tariffa 0" con "nessuna tariffa" scrivendo `|| null` (M-04, M-07). La creazione di un ruolo perde inoltre le tariffe di default per valuta (M-07).

## Comportamento attuale

Per evidenze e righe vale il report. In sintesi:
- **M-05:** nessuna di queste route controlla tipo e segno:
  - roles `POST`/`PATCH` (`api/src/routes/config.js:223-229,238-248`);
  - rate card entries `PATCH` (`config.js:392-404`);
  - structure `PUT` (`api/src/routes/cost-grids.js:716-720`);
  - tasks `PUT` di progetto (`api/src/routes/projects.js:418-428,479-485`), dove le risorse sono un blob JSON e solo `soldHours` è validato.

  Un valore non numerico diventa un errore Postgres, quindi un 500. I POT (`api/src/routes/pots.js:243-257,377-388`) fanno `parseFloat` senza controllare `NaN` e si affidano al `CHECK (amount >= 0)`, quindi anche lì l'errore è un 500. Lato client, solo `master-roles.html:302` e `master-pipelines.html:882` controllano `< 0`. Oggi nel DB non c'è nessuna tariffa negativa.
- **M-04:** `rateByCode[r.roleCode] = parseFloat(r.rate) || null` (`cost-grids.js:719`). Una tariffa 0 diventa `NULL`, e le query dei budget (`cost-grids.js:32,281`) ripiegano su `roles.hourly_rate`, cioè la tariffa EUR del ruolo, in qualsiasi valuta. Al ricaricamento `js/api-sync.js:104-107` mostra la stessa tariffa EUR come non custom. Oggi le righe `NULL` sono 0.
- **M-07:** `master-roles.html:319` crea il ruolo senza `rateOverrides`, e `POST /roles` (`config.js:225-229`) li ignorerebbe comunque. Scrive anche `hourlyRate || null`.

## Il punto di design (M-04)

M-04 non ha un fix meccanico unico. Il `/brainstorming` sceglie, con l'utente, una di queste alternative:
- **A.** 0 è una tariffa valida (per esempio un ruolo non fatturato). Viene salvata come 0 e il budget la usa. Nell'editor l'avviso "Missing rate" resta visibile oppure cambia: da decidere.
- **B.** 0 non è ammesso come tariffa. Il server lo rifiuta con 400, e il client lo segnala prima del salvataggio.
- **C.** Altro, proposto in brainstorming.

La stessa scelta vale per `roles.hourly_rate` (M-07 `POST`) e va tenuta coerente con il ciclo 3, dove un campo vuoto della rate card significa "default dell'agenzia".

## Comportamento atteso

- Le route elencate in M-05 rifiutano con `400 { error, code }`, senza scrivere nulla, una tariffa o un importo che non sia un numero finito, oppure che sia negativo. La forma del codice (uno nuovo o uno già esistente) la decide il brainstorming.
- Il server arrotonda, o rifiuta, i decimali oltre quelli della valuta della riga, usando `api/src/lib/money-format.js` per sapere quanti sono. La scelta tra arrotondare e rifiutare la fa il brainstorming. Una tariffa EUR di ruolo o della rate card è in EUR. Un override per valuta segue la sua valuta. La tariffa di una versione segue la valuta della versione, e quella delle risorse di un progetto la valuta del progetto.
- Una tariffa 0 è trattata secondo la scelta di M-04, mai trasformata in silenzio in "nessuna tariffa".
- `POST /roles` accetta e salva `rateOverrides`, validato come al punto precedente, e `master-roles.html` lo invia anche alla creazione.
- I POT rispondono 400 e non 500 a un importo assente, non numerico o negativo.

## Vincoli

- Le regole server stanno in un modulo puro sotto `api/src/lib/` con test `node:test`, sul modello di `project-rules.js` e `dates.js`. Le route lo chiamano.
- Non si rimette in discussione il tasso della versione deciso dal server (`api/src/lib/version-rate.js`).
- Prima di decidere, il brainstorming misura i dati esistenti con `SELECT` in sola lettura, se la regola scelta potrebbe rifiutare un salvataggio di dati già presenti. Il report ne ha già misurati alcuni, per esempio 6 `rate_override` con decimali e 0 negativi. L'autosave di costgrid rimanda tutte le tariffe a ogni salvataggio: un dato esistente che violasse la regola bloccherebbe ogni salvataggio di quella versione (precedente: C1 delle date).
- Le route modificate richiedono `docker compose restart api` sullo stack principale. Si fa solo nella deroga del Gate 4 step 7 di `/finish-cycle`.
- Un file `js/*.js` o `*.html` toccato con riferimenti `?v=N` richiede di aggiornarli tutti.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un modulo in `api/src/lib/` con test `node:test` copre: numero valido, 0, negativo, `NaN`, stringa non numerica, `null`/assente, e i decimali di EUR e di una valuta senza decimali (JPY).
2. `test-api.js` verifica che roles `POST`/`PATCH`, rate card entries `PATCH`, `PUT …/structure`, `PUT /api/projects/:id/tasks` e POT `POST`/`PUT` rispondano 400 a un valore negativo e a uno non numerico, e che dopo il rifiuto il DB sia invariato.
3. Un test copre la scelta fatta per M-04: un salvataggio della structure con una tariffa 0 produce il risultato deciso (0 salvato e usato dal budget, oppure 400). In nessun caso `/budgets` usa la tariffa EUR del ruolo.
4. Un ruolo creato con override per valuta li ha salvati: `GET` dopo `POST` restituisce `rate_overrides`.
5. `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Scope escluso esplicitamente

- La formattazione e il parsing nei form (cicli 2 e 3), compreso il lato client di M-05 oltre ai controlli già esistenti.
- La semantica di "campo vuoto" nella rate card e la colonna `NOT NULL` (ciclo 3, M-06).
- B-183 (ciclo 4).
- Le note "Out of scope" del report: transazione mancante nel `PATCH` delle rate card, limiti `DECIMAL(10,2)`, codice morto di `js/ratecards.js`.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
