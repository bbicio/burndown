# Spec — POT: una proposta conta una volta sola, tasso fisso delle versioni

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-pot-reference-version-and-version-rate-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-10-29 (una fermata, §6b).

## 1. Scope

- B-175: in tutte le route POT ogni proposta conta una volta sola, attraverso la sua versione di riferimento, anno compreso.
- B-174: le proposte con versione di riferimento Canceled escono dalla lista Proposals di `GET /api/pots/:id/details`.
- B-176: il tasso di una versione è fisso e lo calcola solo il server; una versione EUR ha tasso 1.
- B-177: `master-pipelines.html` formatta gli importi in valuta inattiva con il loro locale e il loro simbolo.
- B-182: la subquery di fee si calcola una volta per versione in ogni route POT; l'oggetto con i totali a zero di `/year-totals` è scritto una volta.
- `api/src/routes/pipeline-years.js`: `offers` usa la stessa regola della versione di riferimento.

Fuori scope: le esclusioni confermate del Brief, tranne la creazione di una versione in valuta inattiva, che entra (§5, decisione 4).

## 2. La versione di riferimento — `api/src/lib/pot-fee-sql.js`

Il modulo esporta due nuovi generatori di CTE, con lo stesso stile di `feeSql` (SQL letterale, alias interni con prefisso fisso):

- **`referenceVersionsCte()`** → il testo di un CTE `ref_v`:
  ```sql
  ref_v AS (
    SELECT DISTINCT ON (rv.cost_grid_id) rv.*
    FROM cost_grid_versions rv
    WHERE rv.pipeline <> 'Draft'
    ORDER BY rv.cost_grid_id,
             (EXISTS (SELECT 1 FROM cg_version_projects rv_c WHERE rv_c.cost_grid_version_id = rv.id)
              OR EXISTS (SELECT 1 FROM projects rv_p WHERE rv_p.cg_version_id = rv.id)) DESC,
             rv.created_at DESC
  )
  ```
  "Ha progetti" è la stessa condizione di `versionHasProjects` (`api/src/routes/cost-grids.js`).
- **`potVersionsCte()`** → `ref_v` seguito da un CTE `pot_v`: ogni riga di `ref_v` con `fee_original` (la fee di `feeSql(alias, '')`, calcolata una volta con `CROSS JOIN LATERAL`) e `fee_eur = fee_original / COALESCE(NULLIF(currency_rate, 0), 1)`.
- `feeEurSql`/`feeOriginalSql`: oggi le usa solo `pots.js`; dopo il ciclo non le usa nessuno. Si tolgono dall'export, e `feeSql` resta interna al modulo.

## 3. Le route POT — `api/src/routes/pots.js`

Ogni route apre con `WITH ${potVersionsCte()}` e legge `pot_v cgv` invece di `cost_grid_versions cgv`. I filtri esistenti su stage, `pipeline_year` e client restano, ma ora si applicano alla riga di riferimento. Lo stage, l'anno, il cliente e il valore di una proposta sono quindi quelli della sua versione di riferimento.

- **`/pipeline-summary`:** `COUNT(*)` per stage (proposte, non versioni) e `SUM(fee_eur)`. Restano i cinque stage, Canceled compreso.
- **`/year-totals`:** una riga per proposta, `fee_eur`. L'oggetto con i totali a zero viene scritto da una sola funzione o costante locale.
- **`/summary`:** la lista usa `fee_eur AS value` e perde il `DISTINCT`. I totali usano `SUM(fee_eur) FILTER (WHERE pipeline = '…')`.
- **`GET /`:** il `LATERAL` per POT legge `pot_v` con `SUM(fee_eur) FILTER (…)`.
- **`/:id/details`:** `fee_eur AS value` e `fee_original AS value_original`; si aggiunge `AND cgv.pipeline NOT IN ('Draft', 'Canceled')` e si toglie il `DISTINCT ON (cgv.id)`.
- La forma delle risposte non cambia. `pbPotView` (`js/lib/pipeline-calc.js`), il tab POT di `pipeline.html` e `master-pipelines.html` non si toccano per B-175.
- `pots.js` resta senza il letterale `currency_rate`: il test esistente `pots.js has no fee expression of its own` non cambia.

## 4. `api/src/routes/pipeline-years.js`

Il CTE `disp` viene sostituito da `referenceVersionsCte()`. Il filtro di visibilità resta sulla proposta (`JOIN cost_grids cg ON cg.id = ref_v.cost_grid_id` più la clausola esistente). `offers` per anno = `COUNT(*)` delle proposte la cui versione di riferimento non è Canceled, raggruppate per `ref_v.pipeline_year`. Sparisce il `JOIN` sugli anni di una versione non Draft qualunque.

## 5. Il tasso della versione

**Regola pura — nuovo `api/src/lib/version-rate.js`** (`node:test`):
- `versionRate(currency, currencyRow)` → `{ rate }` oppure `{ error }`. `currencyRow` è la riga di `currencies` della valuta, `{ active, current_rate }` oppure `null`.
  - `'EUR'` → `{ rate: 1 }`, qualunque sia la riga;
  - valuta attiva → `{ rate: parseFloat(current_rate) }`;
  - valuta inattiva o sconosciuta → `{ error: 'Currency <code> is not active' }`.
- Esporta `CURRENCY_RULE_CODE = 'CURRENCY_RULE'`.

**`api/src/routes/cost-grids.js`:**
- **`PATCH /:id/versions/:vId`:** il `currencyRate` del body viene **ignorato**. Si scrive `currency_rate` solo quando il body porta `currency`, e:
  - la valuta è diversa da quella salvata → tasso da `versionRate`; in caso di errore `400 { error, code: 'CURRENCY_RULE' }` e niente scrittura;
  - la valuta è uguale a quella salvata ed è `'EUR'` → tasso 1 (una versione EUR con tasso ≠ 1 viene corretta al primo salvataggio);
  - la valuta è uguale a quella salvata e non è EUR → il tasso non cambia, anche se quella valuta è stata disattivata nel frattempo.

  Il controllo avviene dentro il `withVersionLock` già usato quando il body porta `currency`, insieme a `versionCurrencyChangeError`.
- **`POST /:id/versions`:** il `currencyRate` del body viene ignorato; tasso da `versionRate(currency || 'EUR', …)`; in caso di errore `400 { error, code: 'CURRENCY_RULE' }`.
- **`POST …/duplicate`:** invariato, copia il tasso della versione sorgente.
- **`POST …/refresh-rate`:** per EUR salva 1 prima di rispondere. Per le altre valute il comportamento non cambia (salva il tasso attivo, 404 se la valuta non è attiva).

**`js/api-sync.js` `_cgUpsertVersionToApi`:**
- `serverMeta` non contiene più `currencyRate`.
- Un rifiuto `CURRENCY_RULE` della `PATCH` viene notificato con `notifyRefusal(e, false)`, come `DATE_RULE`, e non viene riprovato come `POST`.
- Bump di `?v=N` su ogni riferimento a `js/api-sync.js`.

**`costgrid.html`:** `onCurrencyChange` continua a impostare `draft.currencyRate` al tasso corrente della nuova valuta, solo per la visualizzazione. È lo stesso valore che calcola il server.

## 6. B-177 — `master-pipelines.html`

`window.__currencies = await Api.currencies.list()` (`GET /api/currencies`, `requireAdmin`; la pagina è già riservata ad admin/sysadmin) al posto di `Api.currencies.active()`. `activeCurrencies` riceve la stessa lista: nella pagina serve solo come argomento di `formatMoney`.

## 7. Test

- **`api/src/lib/version-rate.test.js`:** EUR con riga attiva, inattiva e `null`; valuta attiva; valuta inattiva; valuta sconosciuta.
- **`api/src/lib/pot-fee-sql.test.js`:**
  - `referenceVersionsCte()` esclude Draft, ordina per "ha progetti" con **entrambe** le condizioni e poi per `created_at DESC`;
  - `potVersionsCte()` contiene la subquery di fee una sola volta;
  - nessuna route di `pots.js` legge `cost_grid_versions` direttamente;
  - `pipeline-years.js` usa `referenceVersionsCte`.
- **`test-api.js`, POT-18 e seguenti** (setup come sysadmin, dati costruiti nel test):
  - proposta con v1 Expected e v2 Committed: conta una volta, in Committed, in `/year-totals`, `GET /`, `/summary`, `/:id/details`, `/pipeline-summary`;
  - v1 collegata solo tramite `projects.cg_version_id` contro una v2 più recente: la versione di riferimento è v1, sia nei POT sia in `offers`;
  - due versioni in anni diversi: la proposta conta solo nell'anno della versione di riferimento;
  - versione di riferimento Canceled: assente da `proposals` di `/:id/details`;
  - `PATCH` senza `currency` e con `currencyRate`: tasso invariato;
  - `PATCH` con la stessa valuta non EUR, dopo averla disattivata: tasso invariato e 200;
  - `PATCH` a `'EUR'`, con o senza `currencyRate`: tasso 1;
  - `PATCH` verso un'altra valuta attiva: il suo `current_rate`;
  - `PATCH` o `POST` verso una valuta inattiva: `400 CURRENCY_RULE`;
  - `refresh-rate` su una versione EUR con tasso ≠ 1: salva 1.
- **`js/lib/api-sync-upsert.test.js`:** il body della `PATCH` non contiene `currencyRate`; un rifiuto `CURRENCY_RULE` non viene riprovato come `POST`.
- **`TEST_CASES.md`:** un caso manuale per B-177 (POT Details con una proposta in valuta inattiva) e l'aggiornamento del pin del numero di casi.

## Criteri di accettazione

1. **Una proposta, un conteggio** — una proposta con v1 Expected e v2 Committed (v2 di riferimento) entra solo in `committed_total` in `/year-totals`, `GET /`, `/summary`, `/:id/details`; `/summary` e `/:id/details` la elencano una volta; `/pipeline-summary` dà `count` 1 per Committed e 0 per Expected.
2. **"Ha progetti" con entrambi i link** — una v1 collegata solo tramite `projects.cg_version_id` è la versione di riferimento rispetto a una v2 più recente non collegata, sia nei POT sia in `offers` di `GET /api/pipeline-years`.
3. **Anno della versione di riferimento** — con due versioni non Draft in anni diversi, la proposta conta solo nell'anno della versione di riferimento, nei totali POT e in `offers`.
4. **Canceled fuori dal modal** — una proposta con versione di riferimento Canceled non compare in `proposals` di `/:id/details`.
5. **Tasso fisso** — una `PATCH` senza `currency`, anche con un `currencyRate` diverso nel body, lascia invariato `currency_rate`; una `PATCH` con la stessa valuta non EUR, anche se disattivata, lo lascia invariato e risponde 200.
6. **Autosave senza tasso** — il payload di `_cgUpsertVersionToApi` non contiene `currencyRate`.
7. **EUR vale 1** — una `PATCH` a `'EUR'` imposta `currency_rate = 1`, con o senza `currencyRate`; `refresh-rate` su una versione EUR con tasso ≠ 1 salva 1.
8. **Cambio valuta** — una `PATCH` verso un'altra valuta attiva imposta il suo `current_rate`; una `PATCH` o un `POST` verso una valuta inattiva risponde `400 { code: 'CURRENCY_RULE' }` e non scrive nulla.
9. **Valute inattive in Master Data** — il modal POT Details di `master-pipelines.html` formatta un importo in una valuta inattiva con il suo locale e il suo simbolo.
10. **Fee una volta** — `potVersionsCte()` contiene la subquery di fee una sola volta e nessuna route di `pots.js` legge `cost_grid_versions` direttamente (`pot-fee-sql.test.js`).
11. **Non regressione** — POT-01..POT-17, il resto di `test-api.js`, `npm test` e `node --test` di `api/` passano.

## Decisioni aperte

1. **Una regola SQL condivisa in `pot-fee-sql.js`, che calcola anche la fee una volta per versione.** Alternativa scartata: un `DISTINCT ON` scritto in ogni route. Perché: chiude B-175 e B-182 con un solo punto di verità.
2. **`pbGetDisplayVersion` resta com'è e legge solo `linkedProjects`.** Alternativa scartata: estenderlo a `projects.cg_version_id`, esponendo quel link nel `GET /api/cost-grids`. Perché: il 2026-10-29 le due regole divergevano su 0 progetti su 15; la divergenza residua va in `docs/BACKLOG.md`.
3. **Il server ignora il `currencyRate` del body.** Alternativa scartata: rifiutarlo con 400. Perché: le pagine HTML non hanno versione e restano in cache, quindi un client vecchio continuerebbe a mandarlo a ogni autosave e i suoi salvataggi fallirebbero.
4. **Valuta inattiva in `PATCH` (solo sul cambio valuta) e in `POST` → `400 CURRENCY_RULE`.** Alternativa scartata: 1.0 in silenzio, come fa oggi la creazione. Perché: è proprio l'errore silenzioso di B-176. Rientra così l'esclusione del Brief sulla creazione in valuta inattiva, che il Brief ammetteva se legata al criterio 6.
5. **Il divieto di `currency_rate` in `pots.js` (`pot-fee-sql.test.js`) resta com'è.** Alternativa scartata: restringerlo, come chiedeva il criterio 8 del Brief. Perché: con `pot_v` le route non hanno più bisogno di `currency_rate`, quindi il divieto non è più troppo severo.
6. **Il tasso cambia solo con `currency`, e lo calcola il server.** Alternativa scartata: rispettare il `currencyRate` del body quando cambia la valuta. Perché: un solo punto decide il tasso, e coincide con quanto mostra già `costgrid.html`.
