# Spec — finding valute, ciclo f3: tariffe Custom persistite e tasso della versione nell'editor

**Brief started:** 2026-11-01 19:45
**Brief:** `docs/superpowers/briefs/2026-11-01-currency-f3-custom-rate-and-version-rate-brief.md` (evoluzione, Scenario 2; F-01 e F-05 di `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md`, B-195, B-213, B-215 di `docs/BACKLOG.md`).
Design concordato in chat il 2026-11-02 (una fermata, §6b).

## 1. La regola

Una versione salvata non si riprezza mai da sola. Le tariffe dei ruoli cambiano solo per un'azione esplicita dell'utente nell'editor:
- **cambio di rate card**, anche quando lo provoca un cambio di cliente che annulla la rate card: ricalcola i ruoli non Custom e lascia i Custom;
- **cambio di valuta**: ricalcola tutti i ruoli, Custom compresi, come oggi (l'anteprima mostra "custom → reset");
- **reset del singolo ruolo**.

Un aggiornamento dell'anagrafica ruoli, di una rate card o del tasso di una valuta non tocca le versioni salvate. Il refresh rate di `pipeline.html` cambia solo il tasso salvato della versione.

**Custom** vuol dire che la tariffa l'ha scritta una persona con un valore diverso dalla baseline (`costgrid.html`, `onRateBlur`: `role.rateIsCustom = v !== baseline`). La definizione non cambia; cambia che sopravvive al salvataggio.

## 2. Dati

Migrazione `api/src/db/migrations/031_task_role_rate_is_custom.sql`:

```sql
ALTER TABLE task_roles ADD COLUMN IF NOT EXISTS rate_is_custom BOOLEAN NOT NULL DEFAULT false;
```

Nessun backfill: i dati esistenti sono di test e partono tutti non Custom. `rate_override` resta lo snapshot della tariffa di ogni ruolo con ore: i calcoli fee lato server (`/budgets`, `api/src/lib/pot-fee-sql.js`, `exports.js`, `reporting.js`) non cambiano.

## 3. Server (`api/src/routes/cost-grids.js`)

- **Structure `PUT`:** accanto a `rateByCode` costruisce `customByCode[r.roleCode] = r.rateIsCustom === true` dai ruoli del body; ogni `INSERT INTO task_roles` scrive `rate_is_custom`. Il ramo `tk.roles` (array) legge `tr.rateIsCustom === true`.
- **Structure `GET`:** la `SELECT` su `task_roles` restituisce `tr.rate_is_custom`.
- **"+ New version":** la copia `INSERT … SELECT` di `task_roles` copia anche `rate_is_custom`.

## 4. Caricamento (`js/api-sync.js`, `cgLoadStructureFromApi`)

- `isCustom = (tr.rate_is_custom ?? tr.rateIsCustom) === true`, al posto di `override != null`.
- La ricostruzione di `ver.roles` dipende da "ogni ruolo ha `rate_override`", non più da "ogni ruolo è Custom". Il commento che spiega la condizione si aggiorna.

## 5. Niente riprezzamento silenzioso (`js/costgrid.js`, `costgrid.html`)

`cgUpdateActiveRatecardMap()` carica le mappe della rate card e chiama `cgSyncRoleRatesToBaseline()`. Diventa `cgUpdateActiveRatecardMap({ syncRates = false } = {})`: la sincronizzazione parte solo con `syncRates: true`.

| Chiamante (`costgrid.html`) | `syncRates` |
|---|---|
| apertura della versione | no |
| apertura del modal di selezione ruoli | no |
| `onRatecardChange` | sì |
| `refreshRatecards`, quando ha annullato una rate card non più valida per il cliente | sì |
| `refreshRatecards`, altrimenti | no |

`cgSyncRoleRatesToBaseline` non cambia: salta i Custom, e con `force` li azzera.

## 6. B-195 (`js/lib/costgrid-calc.js`)

`cgRateIsMissing(role)` = tariffa non > 0 **e** ruolo non Custom. Il parametro della baseline sparisce dalla firma e dai chiamanti (`costgrid.html`); il commento che citava la custom-ness inaffidabile va tolto.

## 7. B-215 (`pipeline.html`, `confirmRefreshRate`)

Il testo della conferma descrive il comportamento della §1:

> Budget amounts and role rates remain in `<cur>`. Only the EUR equivalent changes. In the editor, a change of ratecard or a rate reset uses the new rate.

Il test in `js/lib/costgrid-version-rate.test.js` e il suo commento cambiano di conseguenza.

## 8. B-213 (editor e DB sullo stesso tasso)

Il `PATCH` della versione restituisce la riga aggiornata (`RETURNING *`), quindi anche `currency_rate`.
- `_cgUpsertVersionToApi` accetta in `opts` un callback `onServerRate(rate)`, chiamato dopo un `PATCH` riuscito quando `currency_rate` della risposta differisce da `meta.currencyRate`.
- `cgAutoSave` passa il callback. Il callback imposta `_cgDraft.currencyRate` e aggiorna la copia nello store.
- Se il salvataggio segue un cambio di valuta (flag impostato dalla conferma di `onCurrencyChange` e azzerato dal callback o dal salvataggio successivo), il callback chiama anche `cgSyncRoleRatesToBaseline()`, rinfresca la vista e programma un altro autosave. Fuori da un cambio di valuta adotta solo il tasso: le tariffe salvate non si toccano (§1).

## 9. Cache-busting

Ogni riferimento a `js/costgrid.js` (`?v=54`), `js/api-sync.js` (`?v=30`) e `js/lib/costgrid-calc.js` (`?v=14`) sale di uno, in tutti i file che lo citano.

## 10. Documentazione

- `docs/db/migrations.md`: voce della `031`.
- `ARCHITECTURE.md`: la colonna `rate_is_custom` di `task_roles` (`scripts/architecture-guard.test.js`).
- `docs/pages/costgrid.md`, `docs/js/costgrid.md`, `docs/js/api-sync.md`: la regola della §1 e la sincronizzazione solo su azione esplicita.
- `docs/BACKLOG.md`: B-195 (con F-01), B-213 e B-215 chiuse, ciascuna con il comando rieseguito.

## 11. Scope escluso

- Il ricalcolo massivo delle tariffe salvate; un'azione "riprezza ai valori attuali" per i ruoli non Custom.
- Il ricalcolo lato server delle tariffe al refresh rate.
- Formato e decimali delle tariffe (f1), validazione server (f2), rate card (f4), B-184, l'export CSV della rate card.

## Criteri di accettazione

1. **Flag dopo il ricaricamento** — un test verifica che una versione salvata con un ruolo non Custom e uno Custom, ricaricata con `cgLoadStructureFromApi`, ha `rateIsCustom` falso sul primo e vero sul secondo.
2. **Round-trip server** — un test di integrazione verifica che la structure `PUT` con `rateIsCustom` vero su un ruolo e falso sull'altro restituisce, nella structure `GET`, `rate_is_custom` vero e falso; e che "+ New version" lo copia.
3. **Niente riprezzamento all'apertura** — un test verifica che, con una baseline diversa dalla tariffa salvata, `cgUpdateActiveRatecardMap()` senza `syncRates` lascia invariata la tariffa del ruolo non Custom; con `syncRates: true` la riallinea e lascia invariato il Custom.
4. **Chiamanti** — un test verifica che l'apertura della versione e del modal ruoli chiamano `cgUpdateActiveRatecardMap` senza `syncRates`, e `onRatecardChange` con `syncRates: true`.
5. **`cgRateIsMissing`** — un test verifica: 0 non Custom → mancante; 0 Custom → non mancante; tariffa > 0 → non mancante.
6. **Conferma del refresh rate** — il test di `pipeline.html` verifica il testo della §7.
7. **B-213** — un test verifica che, dopo un cambio di valuta, un `PATCH` che restituisce un `currency_rate` diverso porta `draft.currencyRate` al valore del server e riallinea i ruoli non Custom; e che fuori da un cambio di valuta il tasso si adotta e le tariffe restano.
8. **Cache-busting** — ogni riferimento a `js/costgrid.js`, `js/api-sync.js` e `js/lib/costgrid-calc.js` porta il nuovo `?v=N`.
9. **Backlog** — B-195, B-213 e B-215 di `docs/BACKLOG.md` sono chiuse con il comando rieseguito; la chiusura di B-195 cita F-01.
10. **Verifica nel browser** — su una versione non EUR salvata con un ruolo scritto a mano: dopo il ricaricamento solo quel ruolo mostra "Custom · reset"; un cambio di rate card ricalcola gli altri ruoli e lascia quello.
11. **Suite** — `npm test`, i test `node:test` di `api/` e il profilo di integrazione (`scripts/run-tests.sh`) passano.

## Decisioni aperte

1. **Il flag Custom si persiste in `task_roles.rate_is_custom`.** Alternativa scartata: Custom dedotto confrontando la tariffa con la baseline, o `rate_override` scritto solo per i Custom. Perché: la deduzione torna a marcare tutto Custom appena la baseline si sposta, e la seconda cambierebbe i totali storici e obbligherebbe a convertire ogni lettore server del fallback.
2. **La decisione 2 della Spec c4 (riallineamento all'apertura) è ritirata; F-01 si chiude come decisione superata.** Alternativa scartata: renderla vera riallineando i ruoli non Custom all'apertura. Perché: l'utente ha fissato che le proposal salvate non si riprezzano quando cambia il costo delle risorse.
3. **Il refresh rate cambia solo il tasso salvato.** Alternativa scartata: ricalcolare lato server i ruoli non Custom. Perché: il calcolo della baseline esiste solo nel browser e portarlo sul server è un ciclo a sé.
4. **I dati esistenti partono tutti non Custom, senza backfill.** Alternativa scartata: valore sconosciuto dedotto all'apertura, o tutti Custom. Perché: i dati esistenti sono di test.
5. **Il cambio di valuta continua ad azzerare anche i Custom.** Alternativa scartata: conservare i Custom. Perché: un importo scritto a mano in una valuta non ha un equivalente ovvio nell'altra, e l'anteprima lo segnala già.
6. **Anche l'apertura del modal ruoli smette di sincronizzare.** Alternativa scartata: togliere la sincronizzazione solo all'apertura della versione. Perché: è un riprezzamento silenzioso dello stesso tipo.
7. **B-213 si risolve rileggendo `currency_rate` dalla risposta del `PATCH`; le tariffe si riallineano solo dopo un cambio di valuta.** Alternativa scartata: accettare la divergenza (decisione 3 della Spec c4), oppure riallineare a ogni differenza. Perché: la risposta contiene già il tasso, e riallineare fuori da un cambio di valuta riprezzerebbe una versione dopo un refresh rate fatto altrove.
8. **B-213 resta in questo ciclo.** Alternativa scartata: staccarlo, come il Brief permetteva. Perché: tocca lo stesso `onCurrencyChange` e la stessa sincronizzazione.
