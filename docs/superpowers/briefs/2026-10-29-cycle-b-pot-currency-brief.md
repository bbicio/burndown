# Brief — POT in Master Data: valuta originale, Expected/SIP, tasso a zero (ciclo B)

**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-10-29.
**Brief started:** unknown
**Origine:** finding del test manuale del 2026-10-01 (memoria di progetto `project_manual_test_findings_money_cleanup.md`), raggruppamento "Cycle B — pipeline detail panel e POT": item 4, 6, 8. Handoff: `docs/superpowers/briefs/2026-10-29-cycle-b-pot-currency-handoff.md`.

## Item già chiusi

- **Item 4** ("≈ €" nel pannello di dettaglio della pipeline): consegnato da `aea1745` (`eurEquivalent`, caso P-73). Fuori dal ciclo.
- **Item 6, lato `pipeline.html`**: Expected e SIP sono già nella barra, nella legenda e nella lista "OTHER PROPOSALS · NOT IN TOTAL" del tab POT (casi P-75, P-76). L'utente ha confermato che basta. Il ciclo copre solo il residuo in Master Data.

## Comportamento attuale

Verificato sui file il 2026-10-29.

**API — `api/src/routes/pots.js`:**
- `GET /:id/details` (riga 314, `requireAuth, requireAdmin`) restituisce `{ pot, history, committed_total, anticipated_total, proposals }`. Ogni proposta ha `version_id, cg_id, pipeline, created_at, proposal_name, client_name, owner_name, value`. `value` (`valueExpr`, righe 340-352) è la sola fee divisa per `COALESCE(cgv.currency_rate, 1)`. Non restituisce `cgv.currency` né l'importo nella valuta originale. Non calcola Expected/SIP: i totali C/A sono somme JS sulle righe restituite (righe 396-397). Filtra `pipeline != 'Draft'`, quindi le Canceled sono nella lista ma non nei totali.
- `GET /` (riga 221) restituisce per ogni POT `committed_total`, `anticipated_total`, `achieved_total`. Niente Expected/SIP. `feeExpr` divide per `COALESCE(cgv2.currency_rate, 1)` (riga 245).
- `GET /year-totals` (riga 56) restituisce per anno `pot_total, committed_total, anticipated_total, achieved_total`; la query filtra `pipeline IN ('Committed','Anticipated')` (riga 80). Divide per `COALESCE(cgv.currency_rate, 1)` (riga 69).
- `GET /pipeline-summary` (riga 10) divide per `COALESCE(cgv.currency_rate, 1)` (riga 28).
- `GET /summary` (riga 104) è l'unica che usa `COALESCE(NULLIF(…currency_rate, 0), 1)` (riga 131) e restituisce `expected_total`/`sip_total`.
- `cost_grid_versions.currency_rate` è `DECIMAL(10,6) NOT NULL DEFAULT 1.0` (`012_currencies.sql` riga 54): il `COALESCE` senza `NULLIF` non protegge da un valore 0. `cost_grid_versions.currency` è `VARCHAR(10) NOT NULL DEFAULT 'EUR'` (riga 53).

**Frontend — `master-pipelines.html`:**
- Riga anno della tabella pipeline years (righe 156-170): target, percentuale e importo C+A, sotto-riga `C: …` · `A: …` da `yearTotals` (`Api.pots.yearTotals()`).
- Tabella POT (righe 338-360): colonne Target, Total (C+A), Committed, Anticipated, tutte `formatMoney(…, 'EUR', activeCurrencies)`. Colori hex inline (`#198754`, `#fd7e14`, `#e8edff`/`#1a1a6e` nel badge tipo).
- Modal `#potDetailsModal` (riga 483), riempito da `openPotDetails(pot)` (riga 965) come stringa HTML in `innerHTML`: badge tipo, quattro card (Target, Total (C+A), Committed, Anticipated) con percentuale sul target, tabella Change History, tabella Proposals con colonna Value = `window.formatMoney(p.value, 'EUR', window.__currencies)`. I campi testuali passano da `esc()`. Colori hex inline in tutte le card e nelle etichette.
- Precedente nella stessa pagina: la tabella phasing (righe 617-630 e 690-703) mostra per una proposta non EUR l'importo locale e sotto, piccolo e grigio, `(importo EUR)`, con `isNonEur = p.currency && p.currency !== 'EUR'`.

**Test:** `test-api.js` POT-06 (righe 502-512) copre `/:id/details`: 200, campi `pot`/`history`/`proposals`/`committed_total`, 400 senza `year`. POT-01..POT-12 sono già usati. `TEST_CASES.md` P-76 cita POT-08..POT-12.

## Comportamento atteso

1. **Item 8 — valuta originale nel modal POT Details.** `GET /:id/details` aggiunge a ogni proposta la valuta della versione e l'importo della fee nella valuta originale, cioè senza la divisione per il tasso. Nel modal, per una proposta non EUR la cella Value mostra l'importo originale, formattato con il codice della sua valuta, e sotto, piccolo e grigio, `(importo EUR)`: la stessa forma della tabella phasing. Una proposta EUR mostra una sola riga, come oggi. Il valore EUR resta sempre visibile ed è l'unico che entra nei totali e nelle percentuali.
2. **Item 6 — Expected e SIP in Master Data, solo informativi:**
   - **Modal POT Details:** `GET /:id/details` restituisce anche `expected_total` e `sip_total`. Il modal li mostra, distinti da Committed/Anticipated, senza farli entrare in Total (C+A) né nelle percentuali sul target.
   - **Tabella POT:** `GET /` restituisce per ogni POT anche `expected_total` e `sip_total`. La tabella mostra due colonne Expected e SIP, fuori da Total (C+A).
   - **Riga anno:** `GET /year-totals` restituisce per anno anche `expected_total` e `sip_total`. La sotto-riga `C: … · A: …` mostra anche Expected e SIP. La percentuale e l'importo C+A restano invariati.
3. **Tasso a zero:** `GET /:id/details`, `GET /`, `GET /year-totals` e `GET /pipeline-summary` dividono per `COALESCE(NULLIF(currency_rate, 0), 1)`, come `/summary`. Una versione con `currency_rate = 0` non fa più fallire la route: il suo valore conta come tasso 1.
4. **Colori del modal:** i colori hex letterali del modal POT Details passano a token di `css/tokens.css` (`var(--…)`).

## Vincoli

- **Money:** ogni importo con `formatMoney(v, code, currencies)` e il codice della propria riga, mai `Intl.NumberFormat` (`js/lib/money-guard.test.js`); nessuna valuta implicita.
- **Valori:** solo Committed e Anticipated entrano nei totali, nelle percentuali e nel gap del POT; Expected e SIP sono solo informativi; Draft resta fuori; il valore EUR è sempre visibile e l'unico sommato.
- **`innerHTML`:** il modal resta una stringa HTML, quindi ogni nuovo campo testuale passa da `esc()`, compreso il codice valuta.
- **Token:** nessun hex nuovo; i colori del modal usano token esistenti di `css/tokens.css`. Un token nuovo deve rispettare il contrasto ≥ 4.5:1 (`js/lib/tokens.test.js`) e fa scattare il bump di `?v=` di `tokens.css` su tutte le pagine (`js/lib/foundations-guard.test.js`).
- **API:** si estendono risposte esistenti, nessuna route nuova; i campi esistenti mantengono nome e significato (`pipeline.html` usa `/summary`, invariata).
- **Cache-busting:** un file `js/`/`css/` modificato richiede il bump di ogni suo `?v=N`.
- **Test:** i nuovi casi in `test-api.js` partono da POT-13 (`grep -n "POT-1" test-api.js TEST_CASES.md` prima di sceglierli). Il ciclo tocca `api/`: Gate 1 esegue `scripts/run-tests.sh`, e al merge `pdash-api` va riavviato.
- **Documentazione:** il racconto della pagina va in `docs/pages/config.md`; `pots.js` non ha un file `docs/api/`.
- **Lingua:** testo visibile all'utente in inglese.
- **Classe di rischio:** da dichiarare nel Piano (money/valute, PROCESS.md §6.1b).

## Criteri di accettazione

1. `GET /api/pots/:id/details` restituisce per ogni proposta il codice valuta della versione e l'importo nella valuta originale; per una proposta EUR l'importo originale è uguale a `value`.
2. Per una proposta CHF con tasso ≠ 1, l'importo originale diviso per il tasso è uguale a `value`, con tolleranza di arrotondamento.
3. Nel modal POT Details, una proposta non EUR mostra l'importo originale con il formato della sua valuta e sotto `(…)` in EUR; una proposta EUR mostra un solo importo.
4. `committed_total` e `anticipated_total` di `/:id/details` restano uguali alla somma dei `value` EUR delle righe Committed/Anticipated, anche con proposte non EUR.
5. `GET /api/pots/:id/details` restituisce `expected_total` e `sip_total` numerici, uguali alla somma dei `value` delle righe Expected/SIP.
6. `GET /api/pots` restituisce per ogni POT `expected_total` e `sip_total` numerici; `achieved_total` resta `committed_total + anticipated_total`.
7. `GET /api/pots/year-totals` restituisce per anno `expected_total` e `sip_total` numerici; `achieved_total` resta C+A.
8. La tabella POT di `master-pipelines.html` mostra le colonne Expected e SIP; Total (C+A) è invariato.
9. La sotto-riga di ogni anno mostra Expected e SIP accanto a C e A; percentuale e importo C+A sono invariati.
10. Il modal mostra Expected e SIP; Total (C+A) e le percentuali sul target non li includono.
11. Con una versione a `currency_rate = 0`, `GET /api/pots/:id/details`, `GET /api/pots`, `GET /api/pots/year-totals` e `GET /api/pots/pipeline-summary` rispondono 200 e il suo valore è la fee con tasso 1.
12. Il markup che `openPotDetails` scrive in `#potDetailsModalBody` non contiene colori hex letterali.
13. `npm test` e `scripts/run-tests.sh` passano.

## Perimetro escluso

Confermato dall'utente il 2026-10-29.

- **Valuta originale nel tab POT di `pipeline.html`** (liste contributing e "not in total"): resta solo EUR; `/summary` invariata.
- **Item 6 in `pipeline.html`:** la soluzione attuale basta, nessuna modifica.
- **Proposte Canceled nella lista del modal:** restano come oggi (nella lista, non nei totali). Va in `docs/BACKLOG.md`.
- **Hex della tabella POT, della riga anno e del resto di `master-pipelines.html`:** restano, in attesa del restyling di Master Data. Il ciclo tocca solo il modal POT Details.
- **PTC nel valore della proposta:** `value` resta la sola fee.
- **Righe di backlog vicine, tutte ancora `open` al 2026-10-29:** B-013 (`commonCurrency` ancora in `js/lib/portfolio-calc.js`), B-031, B-039 (nessun test su Canceled in `/summary`; l'unico test POT con "Canceled" è POT-05, su `/pipeline-summary`), B-041 (`pbFmtMonth` e `pbComputePotPercentages` ancora in `js/lib/pipeline-calc.js`, il secondo non usato da `pipeline.html`), B-042 (nessuna validazione UUID in `pots.js`).
- **Finding nuovi** emersi durante brainstorming o esecuzione vanno in `docs/BACKLOG.md` o in un Brief a parte.

## Domande aperte per `/brainstorming`

1. **Expected/SIP nel modal:** due card in più accanto alle quattro esistenti, oppure una riga informativa separata sotto le card? Con quale indicazione che non entrano nel totale?
2. **Colonne Expected/SIP nella tabella POT:** stile visivo che le distingua dalle colonne che contano (es. testo attenuato), visto che gli hex della tabella restano.
3. **Calcolo Expected/SIP in `GET /` e `/year-totals`:** due subquery in più con lo stesso `feeExpr`, oppure una query riscritta con `SUM(CASE …)` per stadio come `/summary`? Il costo pesa su una route chiamata a ogni caricamento della pagina.
4. **Nome dei campi nuovi** di `/:id/details` per valuta e importo originale (es. `currency`, `value_original`) e coerenza con i nomi già usati nella tabella phasing (`currency`, `currencyRate`).
5. **Token del modal:** quali token esistenti corrispondono a `#198754`, `#fd7e14`, `#1a1a2e`, `#6b7280`, `#e8edff`/`#1a1a6e`, e se ne serve uno nuovo.
6. **Test del tasso a zero:** come preparare una versione con `currency_rate = 0` in `test-api.js`, dato che l'API potrebbe rifiutare 0 in scrittura (da verificare) e servire un `UPDATE` diretto.
