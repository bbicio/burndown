# Spec — valute nei form, ciclo 3: la rate card del cliente

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-currency-c3-ratecard-brief.md` (misto: M-01, M-02, M-03 di `docs/superpowers/audits/2026-10-29-currency-forms-audit.md` per `master-clients.html` come audit-fix; M-06 in forma Scenario 2).
Design concordato in chat il 2026-10-30 (una fermata, §6b).

## 1. Scope

- **M-06:** una tariffa EUR vuota nella rate card del cliente è "default dell'agenzia", mai 0; un ruolo i cui campi sono tutti vuoti non ha più una voce (§2, §3).
- **M-01/M-02:** ogni campo tariffa della modale "Rate Card" di `master-clients.html` è `type="text"`, formattato al focus e al blur nella valuta della propria colonna e letto con `readMoneyInput` (§4).
- **M-03:** "Agency default" e i placeholder passano per `formatMoney` nella valuta della colonna (§4).
- L'editor modale di `js/ratecards.js` viene cancellato; resta `loadRatecardsForDropdown` (§5).
- La guardia `js/lib/money-guard.test.js` perde l'esenzione `PENDING_CYCLE_3` (§6).

## 2. Schema — migrazione `029_ratecard_entry_rate_nullable.sql`

```sql
ALTER TABLE ratecard_entries ALTER COLUMN hourly_rate DROP NOT NULL;
```

`NULL` significa "nessuna tariffa EUR del cliente per questo ruolo": vale il default dell'agenzia. Nessun consumatore cambia, perché già cadono su `roles.hourly_rate` quando il valore manca: `COALESCE((SELECT re.hourly_rate …), ro.hourly_rate, 0)` in `api/src/lib/pot-fee-sql.js`, `api/src/routes/reporting.js`, `api/src/routes/exports.js`; `if (!isNaN(rate))` in `js/costgrid.js` (`parseFloat(null)` è `NaN`); l'export CSV delle rate card scrive `''` per un valore `null`. Applicata a mano come ogni migrazione; `docs/db/migrations.md` riceve la sua riga.

## 3. API — `PATCH /api/ratecards/:id/entries` (`api/src/routes/config.js`)

- **Sostituzione completa, in una transazione:** il body è l'insieme intero delle voci della rate card. Dentro una transazione si cancellano le voci della rate card il cui `role_id` non è nel body, poi si fa l'upsert di quelle inviate. Un array vuoto cancella tutte le voci (è già l'intento dichiarato di `RC-06` in `test-api.js`).
- **Validazione, prima di ogni scrittura**, con una funzione pura nuova in `api/src/lib/money-rules.js`, `ratecardEntryError(entry, label)`:
  - `hourlyRate` è `null` oppure passa `amountError(…, 'EUR', …)`;
  - `rateOverrides` passa `overridesError`;
  - una voce con `hourlyRate` `null` e nessun override è rifiutata: non esprime nulla.
  Rifiuto: `400 { error, code: 'MONEY_RULE' }`, nessuna scrittura.
- Le altre route delle rate card non cambiano.

## 4. Form — `master-clients.html`

- La modale `#clientRcModal` si sposta dentro `#app` e il corpo diventa un template Vue al posto della stringa HTML. Lo stato è un array reattivo di righe (ruolo, testo EUR, testo per ogni valuta non EUR, default per colonna), riempito da `openClientRatecard`.
- Ogni campo è `type="text"`, con `@focus`/`@blur` che usano `formatMoneyInput`/`readMoneyInput` nella valuta della colonna (EUR per la colonna base), come in `master-roles.html` dopo il ciclo 2; uno 0 salvato si riapre come `0`.
- **"Agency default"** viene solo da `roles.hourly_rate` (EUR) e, per le colonne non EUR, dagli override di valuta del ruolo (`rateOverrides`), come nel cost grid. Il ramo che cercava una rate card senza cliente viene eliminato. Formattato con `formatMoney` nella valuta della colonna; il placeholder è `<default formattato> (agency)`, oppure `agency default` quando il ruolo non ne ha uno.
- **Salvataggio:** per ogni ruolo con almeno un campo pieno si invia `{ roleId, hourlyRate, rateOverrides }`, con `hourlyRate: null` se il campo EUR è vuoto e i soli override pieni. Un ruolo tutto vuoto non viene inviato, e la sostituzione completa (§3) ne cancella la voce. Un campo non valido (`NaN`) blocca il salvataggio con `Enter a valid amount in <code>, e.g. <moneyFormatExample>.`
- L'intestazione "Client custom (€/h)" usa il simbolo dalla valuta (`currencyInfo('EUR').symbol`), come le colonne non EUR.

## 5. Codice morto — `js/ratecards.js`

Si cancellano `_injectRatecardsModal`, `_rcLoad`, `_rcPopulateClientSelect`, `_rcRenderList`, `_rcRowHtml`, `_rcCreate`, `_rcClonePrompt`, `_rcDelete`, `_rcOpenEdit`, `_rcRenderEntries`, `_rcBack`, `_rcSaveName`, `_rcSaveEntries`, `openRatecardsModal` e lo stato che usano solo loro. Resta `loadRatecardsForDropdown`. Ogni `?v=` che cita `js/ratecards.js` viene aggiornato.

## 6. Guardia

`js/lib/money-guard.test.js`: `PENDING_CYCLE_3` e il suo uso scompaiono, quindi la regola "nessun campo soldi `type="number"`" copre anche `master-clients.html` e `js/ratecards.js`.

## 7. Test

- **Caratterizzazione, prima del cambio** (`test-api.js`): un ruolo senza voce nella rate card del cliente fa usare `roles.hourly_rate` nei budget del cost grid (`/budgets`).
- `test-api.js`:
  - override USD e EUR vuoto salvati → la voce ha `hourly_rate` `NULL`, nessuna voce EUR 0 per quel ruolo, e i budget usano `roles.hourly_rate`;
  - una voce salvata, poi il ruolo omesso dal body → la voce non esiste più;
  - una voce con `hourlyRate: null` e override vuoti → `400 MONEY_RULE`, nessuna scrittura;
  - `hourlyRate: 0` → salvato come 0 (decisione M-04 del ciclo 1);
  - `RC-06` (array vuoto) verifica davvero che non resti nessuna voce.
- `api/src/lib/money-rules.test.js`: `ratecardEntryError` su `null` + override, `null` senza override, `0`, negativo, decimali in eccesso.
- `scripts/shoot.mjs` della modale aperta su un cliente, leggendo i PNG.

## 8. Documentazione

- `docs/api/config.md`: la `PATCH` delle voci come sostituzione completa in transazione, e `hourlyRate` nullable.
- `docs/db/migrations.md`: la riga di `029`.
- `docs/api/lib.md`: `ratecardEntryError`.
- `docs/BACKLOG.md`, finding nuovo: `POST /api/ratecards` senza `clientId` e `POST /api/ratecards/clone` possono ancora creare una rate card senza cliente, che nessun consumatore legge come default.

## 9. Scope escluso

- Le altre pagine (ciclo 2), B-183 (ciclo 4), le regole server non legate alla rate card (ciclo 1).
- I limiti `DECIMAL(10,2)`.
- Le route `POST /api/ratecards` senza cliente e `/ratecards/clone` (BACKLOG, §8).

## Criteri di accettazione

1. **Nessun `type="number"` nella rate card** — nessun campo della modale in `master-clients.html` né in `js/ratecards.js` è `type="number"`, e `js/lib/money-guard.test.js` non ha più l'esenzione `PENDING_CYCLE_3` (`npm test`).
2. **EUR vuoto non diventa 0** — `test-api.js`: dopo il salvataggio di una voce con override e EUR vuoto, `hourly_rate` è `NULL` e i budget del cost grid usano la tariffa del ruolo.
3. **Una voce svuotata sparisce** — `test-api.js`: una voce salvata e poi omessa non restituisce più la tariffa precedente.
4. **Editor morto cancellato** — `openRatecardsModal` e le funzioni `_rc*` non esistono più in `js/ratecards.js`; `loadRatecardsForDropdown` sì.
5. **Formato nella valuta della colonna** — nella modale, un valore EUR scritto `1234,5` diventa `1.234,50` al blur, uno USD scritto `1234.5` diventa `1,234.50`, e "Agency default" è formattato nella valuta della colonna (verifica manuale con `scripts/shoot.mjs` o browser).
6. **Suite verdi** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Decisioni aperte

1. **M-06 con `hourly_rate` nullable, `NULL` = default dell'agenzia.** Alternativa scartata: EUR obbligatorio con un override (B) o override fuori da `ratecard_entries` (C). Perché: B costringe a scrivere una tariffa non voluta, C sposta dati senza alcun guadagno.
2. **La `PATCH` delle voci è una sostituzione completa in transazione.** Alternativa scartata: un flag di cancellazione per ogni voce. Perché: obbliga il client a inviare ogni ruolo e lascia la route senza transazione.
3. **Una voce senza EUR e senza override è rifiutata con 400.** Alternativa scartata: ignorarla in silenzio. Perché: un payload privo di senso deve fallire.
4. **La modale entra in `#app` e diventa un template Vue.** Alternativa scartata: listener sulla stringa HTML. Perché: la tecnica del ciclo 2 avrebbe una seconda forma.
5. **L'editor di `js/ratecards.js` viene cancellato, non allineato.** Alternativa scartata: allinearlo. Perché: non ha chiamanti.
6. **"Agency default" viene solo dal ruolo, e il ramo "rate card senza cliente" del form viene eliminato.** Alternativa scartata: ricopiarlo nel template e mettere il finding in BACKLOG. Perché: quelle righe vengono riscritte comunque e il ramo contraddice il cost grid; in BACKLOG vanno solo le route che possono ancora creare una rate card senza cliente.
