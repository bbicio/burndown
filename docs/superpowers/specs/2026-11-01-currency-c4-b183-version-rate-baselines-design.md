# Spec — valute nei form, ciclo 4: le baseline del cost grid usano il tasso della versione (B-183)

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-currency-c4-b183-version-rate-baselines-brief.md` (audit-fix, M-08 di `docs/superpowers/audits/2026-10-29-currency-forms-audit.md` = B-183).
Design concordato in chat il 2026-11-01 (una fermata, §6b).

## 1. Scope

In una versione non EUR, la baseline di ogni ruolo non sovrascritto, il flag "Custom", il valore di reset e il badge del selettore ruoli si calcolano con il tasso della versione (`draft.currencyRate`), non con il `current_rate` live della valuta.

Stato al 2026-11-01 (`grep -n "current_rate" costgrid.html js/costgrid.js`):
- `costgrid.html` — `roleModalRoleRow` e `roleBaseline` leggono `current_rate`; i due rami di `onCurrencyChange` lo leggono come valore provvisorio di `draft.currencyRate`.
- `js/costgrid.js` — `cgSyncRoleRatesToBaseline` e `cgPreviewRateChange` leggono `current_rate`.

`versionRate` (`api/src/lib/version-rate.js`) dà a una valuta nuova il suo `current_rate`: il valore provvisorio del client è quello che il server salverà.

## 2. I tre chiamanti passano al tasso della versione

`roleModalRoleRow` e `roleBaseline` (`costgrid.html`) e `cgSyncRoleRatesToBaseline` (`js/costgrid.js`) passano a `resolveRoleRate` `parseFloat(draft.currencyRate) || 1.0` (in `js/costgrid.js`, `_cgDraft.currencyRate`). `resolveRoleRate` non cambia; una versione EUR esce prima con tasso 1.

## 3. L'anteprima del cambio valuta

`cgPreviewRateChange(targetCurrency)` continua a leggere il `current_rate` della valuta di destinazione, con un commento che dice che è il tasso che `versionRate` applicherà alla versione.

## 4. L'ordine nel cambio valuta

In entrambi i rami di `onCurrencyChange` (versione senza ruoli e conferma della modale) `draft.currencyRate` si imposta **prima** di `cgSyncRoleRatesToBaseline(true)`, che ora legge il tasso della versione.

## 5. Cache-busting

`js/costgrid.js` passa da `?v=53` a `?v=54` in ogni riferimento (`costgrid.html`, `pipeline.html`).

## 6. Test

Con `extractBlock` (`scripts/lib/extract-source.mjs`), come `js/lib/costgrid-clone.test.js` e `js/lib/costgrid-currency-change.test.js`:
- ruolo EUR 100, versione USD con `currencyRate` 1.10, `current_rate` USD 1.20: `cgSyncRoleRatesToBaseline`, `roleBaseline` e `roleModalRoleRow` danno 110;
- `cgPreviewRateChange('USD')` sulla stessa versione dà 120;
- `onCurrencyChange` (entrambi i rami) ha già impostato `draft.currencyRate` al tasso della nuova valuta quando chiama `cgSyncRoleRatesToBaseline`;
- guardia: in `costgrid.html` e `js/costgrid.js`, `current_rate` compare solo dentro `cgPreviewRateChange` e `onCurrencyChange`.

## 7. Documentazione

`docs/BACKLOG.md`: B-183 chiusa. `docs/pages/costgrid.md` e `docs/js/costgrid.md`: la baseline dei ruoli usa il tasso della versione.

## 8. Scope escluso

- Formato e decimali delle tariffe (ciclo 2), validazione server (ciclo 1), rate card (ciclo 3), B-184.
- Nessun ricalcolo massivo delle tariffe salvate; nessuna migrazione.
- La decisione del tasso lato server (`version-rate.js`, `refresh-rate`).

## Criteri di accettazione

1. **Baseline al tasso della versione** — un test verifica che, con EUR 100, `currencyRate` 1.10 e `current_rate` USD 1.20, la baseline del ruolo è 110 in `cgSyncRoleRatesToBaseline`, `roleBaseline` e `roleModalRoleRow`.
2. **`current_rate` solo dove giustificato** — `grep -n "current_rate" costgrid.html js/costgrid.js` restituisce solo righe dentro `onCurrencyChange` e `cgPreviewRateChange`, e un test lo pinna.
3. **Ordine del cambio valuta** — un test verifica che `cgSyncRoleRatesToBaseline(true)` vede già il tasso della nuova valuta.
4. **Cache-busting** — ogni riferimento a `js/costgrid.js` porta `?v=54`.
5. **Verifica nel browser** — su una versione non EUR il cui `currencyRate` differisce dal tasso live, il badge del selettore ruoli e la baseline (reset di una tariffa custom) mostrano EUR × `currencyRate`.
6. **B-183 chiuso** — la riga B-183 di `docs/BACKLOG.md` è chiusa.
7. **Suite** — `npm test` passa.

## Decisioni aperte

1. **L'anteprima del cambio valuta usa il `current_rate` caricato con la pagina.** Alternativa scartata: un endpoint di dry-run che chieda al server il tasso. Perché: `versionRate` legge la stessa colonna, la divergenza richiede un admin che cambi il tasso a editor aperto, e il valore salvato resta quello del server.
2. **Le versioni esistenti con lo scarto si riallineano da sole all'apertura**: le tariffe dei ruoli non custom si ricalcolano col tasso della versione (sincronizzazione già esistente in `cgUpdateActiveRatecardMap`) e si salvano al primo autosave. Alternativa scartata: congelare le tariffe salvate togliendo la sincronizzazione al caricamento. Perché: è la correzione che il bug chiede; il Brief esclude solo il ricalcolo massivo.
3. **L'editor non rilegge il tasso dalla risposta del server dopo un cambio valuta.** Alternativa scartata: aggiornare `draft.currencyRate` dalla risposta. Perché: il Brief esclude quell'uso.
