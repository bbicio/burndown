# Brief — POT: una proposta conta una volta sola, tasso fisso delle versioni (B-174, B-175, B-176, B-177, B-182)

**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-10-29.
**Brief started:** 2026-10-29
**Origine:** righe B-174..B-177 e B-182 di `docs/BACKLOG.md`, follow-up del ciclo B (`ba82f99`). Handoff: `docs/superpowers/briefs/2026-10-29-pot-versions-rates-and-forms-audit-handoff.md`.
**Perimetro confermato dall'utente il 2026-10-29:** B-175 + B-176, più B-174, B-177, B-182 e l'allineamento del CTE `disp` di `api/src/routes/pipeline-years.js`.

## Verified how, rieseguito il 2026-10-29

- `grep -n "pipeline != 'Draft'" api/src/routes/pots.js` → righe 115, 132, 152, 164, 315, 333: invariato rispetto a B-175.
- `grep -n 'fields.push(`currency_rate' api/src/routes/cost-grids.js` → riga 450: invariato rispetto a B-176.
- `grep -n 'Api.currencies.active()' master-pipelines.html` → riga 738: invariato rispetto a B-177.
- `grep -n "feeOriginalSql('cgv')" api/src/routes/pots.js` → righe 308, 326: invariato rispetto a B-182.
- Main stack: `SELECT count(*), count(DISTINCT cost_grid_id) FROM cost_grid_versions WHERE pipeline <> 'Draft'` → `11|11`, quindi nessuna proposta ha più di una versione non Draft. `SELECT count(*) … WHERE (currency = 'EUR' AND currency_rate <> 1) OR currency_rate = 0` → `0`. Valute attive: solo EUR (1.0) e USD (1.3). Versioni: 14 EUR a 1.0 e 1 USD a 1.3.

## Comportamento attuale

### B-175 — ogni versione non Draft conta come una proposta

`api/src/routes/pots.js`: tutte le route leggono `cost_grid_versions` riga per riga, senza scegliere una versione per proposta.
- `GET /pipeline-summary` (riga 11): `COUNT(DISTINCT cgv.id)` (riga 20) conta le versioni, non le proposte. Filtra su `cgv.pipeline_year` e su `pipeline IN ('SIP','Expected','Anticipated','Committed','Canceled')` (riga 24). Alimenta le card per stage di `master-pipelines.html` (righe 243, 399).
- `GET /year-totals` (riga 43): una riga per versione, `pipeline IN ('Committed','Anticipated','Expected','SIP')` (riga 53), sommata in JS per `pipeline_year`. Alimenta la riga anno di `master-pipelines.html` (righe 157-172).
- `GET /summary` (riga 79, `requireAuth`): lista delle proposte (`SELECT DISTINCT` per versione, righe 103-132) e totali C/A/E/S (righe 139-164), entrambi con `pipeline != 'Draft'`. Lo consuma il tab POT di `pipeline.html` (riga 954) attraverso `pbPotView` (`js/lib/pipeline-calc.js` riga 267), che ricalcola solo le percentuali e divide le righe in `contributing` (C/A) e `other` (SIP/Expected). Le Canceled arrivano nella lista ma `pbPotView` non le mostra in nessuno dei due gruppi.
- `GET /` (riga 182): un `LATERAL` per POT con `pipeline IN (C, A, E, SIP)` (riga 220).
- `GET /:id/details` (riga 268): `DISTINCT ON (cgv.id)` (righe 302, 320), che deduplica per versione e non per proposta; `pipeline != 'Draft'` (righe 315, 333). I totali sono somme JS sulle righe (riga 343).
- **L'anno** viene sempre da `cgv.pipeline_year` della singola versione, quindi due versioni della stessa proposta possono ricadere in anni diversi.
- **Esempio del difetto:** con v1 Expected e v2 Committed, la proposta entra sia in `expected_total` sia in `committed_total`, e il modal la elenca due volte.

**Le due regole esistenti di "versione di riferimento":**
- `pbGetDisplayVersion` (`pipeline.html` riga 553): fra le versioni non Draft vince la più recente per `createdAt` tra quelle con `linkedProjects`, altrimenti la più recente in assoluto. Se non ci sono versioni non Draft, prende la più recente in assoluto.
- CTE `disp` (`api/src/routes/pipeline-years.js` righe 27-35): `DISTINCT ON (cg.id)` fra le versioni non Draft, ordinato per `EXISTS(cg_version_projects)` e poi per `v.created_at DESC`. Non guarda `projects.cg_version_id`, mentre la regola "version has projects" di CLAUDE.md ("Project currency lock") li considera **entrambi**. L'anno lo prende da *qualunque* versione non Draft della proposta (righe 37-39, `JOIN (SELECT DISTINCT cost_grid_id, pipeline_year …)`), non da quella di riferimento. Esclude le proposte la cui versione di riferimento è Canceled (riga 40).

### B-174 — Canceled nel modal POT Details

`GET /:id/details` filtra solo `pipeline != 'Draft'` (righe 315, 333), quindi le versioni Canceled stanno nella lista `proposals`. Restano fuori dai totali solo perché nessuno dei quattro filtri JS (riga 343 e seguenti) le seleziona. `openPotDetails` in `master-pipelines.html` le mostra nella tabella Proposals.

### B-176 — il tasso della versione

- **Creazione** (`POST /:id/versions`, `api/src/routes/cost-grids.js` riga 387): usa `currencyRate` se arriva nel body. Altrimenti mette 1.0 per EUR e il `current_rate` della valuta se è **attiva**, oppure **1.0 in silenzio** se non lo è (righe 401-411).
- **Modifica** (`PATCH /:id/versions/:vId`, riga 425): scrive `currency_rate` solo se il body lo contiene (riga 450), senza verificarlo rispetto a `currency`. Un `PATCH` a `'EUR'` senza `currencyRate` lascia il tasso precedente.
- **refresh-rate** (`POST …/refresh-rate`, riga 1092): per EUR risponde `1.0` **senza salvarlo** (riga 1102); per una valuta non attiva risponde 404 `Currency not active`; negli altri casi salva il `current_rate` attivo. La UI lo presenta come "Update the exchange rate snapshot?" (`pipeline.html` `confirmRefreshRate`, riga 970), mostrato da `rateStale` (riga 799) agli admin quando il tasso salvato è diverso da quello corrente.
- **Autosave**: `_cgUpsertVersionToApi` (`js/api-sync.js` riga 200) manda a **ogni** salvataggio `currencyRate = current_rate` della valuta presa da `window.__currencies`, o `1.0` se non la trova. `window.__currencies` contiene solo le valute **attive** (`loadCurrenciesFromApi`, riga 75). Due conseguenze, dedotte dal codice e non ancora provate su uno stack:
  - (a) il tasso salvato non resta fisso: ogni modifica della versione lo riporta al tasso corrente, in contraddizione con `rateStale`/refresh-rate;
  - (b) una versione in una valuta poi disattivata viene salvata a 1.0, e il suo valore EUR diventa sbagliato senza nessun avviso.
- `costgrid.html` `onCurrencyChange` (righe 1838, 1911) aggiorna `draft.currencyRate` al cambio valuta, ma il valore che arriva al server è comunque quello dell'autosave.
- **Chi legge `currency_rate` per convertire in EUR:** `api/src/lib/pot-fee-sql.js` (`feeEurSql`, `COALESCE(NULLIF(rate,0),1)`), `api/src/routes/reporting.js` (righe 217, 282, 303, 346, 362, 374), `js/lib/pipeline-calc.js` (righe 22-68, 120), `master-pipelines.html` phasing (righe 601, 626, 679, 699), `pipeline.html` (righe 316, 801, 842, 972).

### B-177 — valute inattive in `master-pipelines.html`

La pagina carica `window.__currencies = await Api.currencies.active()` (riga 738). Il modal POT Details (riga 1008) e la tabella phasing formattano `value_original` con quella lista, quindi una proposta in una valuta inattiva prende il locale di fallback e il codice grezzo come simbolo. Esiste `Api.currencies.list()` (`js/api.js` riga 194, `GET /api/currencies`, `requireAuth, requireAdmin`) e la pagina è riservata agli admin.

### B-182 — fee calcolata più volte

- `GET /:id/details` calcola due volte per riga la stessa subquery di fee: una per l'EUR (`valueExpr`) e una per l'originale (`feeOriginalSql`, righe 308 e 326).
- `GET /` e `/summary` la ripetono nei quattro rami `CASE` (righe 141-144, 153-156, 214-218).
- L'oggetto con i totali a zero di `/year-totals` è scritto due volte (riga 59 e riga 62).
- `api/src/lib/pot-fee-sql.test.js` vieta il letterale `currency_rate` ovunque in `pots.js`: è più severo della regola che vuole far rispettare.

### Test esistenti

`test-api.js` POT-01..POT-17; `TEST_CASES.md` cita POT-08, 12, 13, 17.

## Comportamento atteso

1. **Una proposta, una versione di riferimento (B-175).** In tutte le route POT (`/pipeline-summary`, `/year-totals`, `/summary`, `GET /`, `/:id/details`) ogni proposta compare con **una sola** versione, quella di riferimento. Lo stage, il valore, il cliente e l'anno usati per totali, conteggi e liste sono quelli di quella versione. Nel caso v1 Expected + v2 Committed la proposta conta solo nello stage della versione di riferimento e il modal la elenca una volta.
2. **Una sola regola, condivisa.** La versione di riferimento si calcola in un solo punto lato server, usato da `pots.js` e dal CTE `disp` di `pipeline-years.js`. "Ha progetti" significa una riga `cg_version_projects` **o** un `projects.cg_version_id`, come nella regola "version has projects".
3. **`pipeline-years.js` allineato.** `offers` per anno usa la stessa regola, anno compreso.
4. **Canceled fuori dal modal (B-174).** Una proposta la cui versione di riferimento è Canceled non entra nei totali e non compare nella lista Proposals del modal POT Details. La card Canceled di `/pipeline-summary` resta.
5. **Tasso fisso (B-176), deciso dall'utente il 2026-10-29.** Il `currency_rate` di una versione cambia solo in tre casi:
   - alla creazione;
   - quando cambia la valuta della versione;
   - con `refresh-rate`.

   L'autosave non lo invia più, e un `PATCH` che non cambia la valuta non lo modifica.
6. **EUR vale sempre 1.** Una versione EUR ha `currency_rate = 1`, garantito dal server in creazione, nel `PATCH` e in `refresh-rate`.
7. **Valute inattive (B-177).** `master-pipelines.html` formatta ogni importo con il locale e il simbolo della sua valuta anche se è inattiva.
8. **Fee calcolata una volta (B-182).** Ogni route POT calcola la subquery di fee una sola volta per versione. L'oggetto dei totali a zero di `/year-totals` è scritto una volta. Il divieto in `pot-fee-sql.test.js` viene ristretto a quello che la regola vuole davvero vietare.

## Vincoli

- **Classe di rischio:** probabilmente `high-risk` (money/valute, PROCESS.md §6.1b); la dichiara il Piano.
- Tocca `api/`: Gate 1 lancia `scripts/run-tests.sh`, e al merge `pdash-api` viene riavviato (Gate 4).
- I totali restano in EUR. Solo Committed e Anticipated contano; Expected e SIP sono informativi (regole del ciclo B).
- La fee in EUR passa solo da `api/src/lib/pot-fee-sql.js`: il test `pot-fee-sql.test.js` lo pinna.
- Il difetto B-175 va provato con dati costruiti in `test-api.js`: il main stack non ha proposte con più versioni non Draft. I nuovi id partono da POT-18 (`grep -n "POT-1\|POT-2" test-api.js TEST_CASES.md`).
- Le regole del "Project currency lock" restano valide: la valuta di una versione con progetti collegati non cambia, quindi neanche il suo tasso, salvo `refresh-rate`.
- `js/api-sync.js` non deve riprovare come `POST` un `PATCH` rifiutato (`js/lib/api-sync-upsert.test.js`).
- Cache-busting: ogni file `js/`/`css/` modificato porta il suo `?v=N`, aggiornato in tutti i riferimenti.
- Interfaccia in inglese.

## Criteri di accettazione

1. Con una proposta che ha v1 Expected e v2 Committed (v2 di riferimento), `/year-totals`, `GET /`, `/summary` e `/:id/details` la contano solo in `committed_total`, e `/:id/details` e `/summary` la elencano una volta.
2. Con la stessa proposta, `/pipeline-summary` restituisce `count` 1 per Committed e 0 per Expected.
3. Con v1 Committed collegata a un progetto **solo** tramite `projects.cg_version_id` e v2 più recente non collegata, la versione di riferimento è v1, sia in `pots.js` sia in `pipeline-years.js` (`offers`).
4. Con due versioni non Draft in anni diversi, la proposta entra solo nell'anno della versione di riferimento, sia nei totali POT sia in `offers`.
5. Una proposta la cui versione di riferimento è Canceled non compare nella lista `proposals` di `/:id/details`.
6. Un `PATCH` di una versione non EUR che non contiene `currency` lascia invariato `currency_rate`, anche se il body porta un `currencyRate` diverso oppure se la valuta è stata disattivata.
7. Un salvataggio nell'editor del cost grid (autosave) non modifica `currency_rate` di una versione esistente.
8. Un `PATCH` che porta la valuta a `'EUR'` imposta `currency_rate = 1`, con o senza `currencyRate` nel body. Un `PATCH` che cambia la valuta in un'altra valuta attiva imposta il `current_rate` di quella valuta.
9. `refresh-rate` su una versione EUR con un tasso diverso da 1 lo salva a 1.
10. Il modal POT Details e la tabella phasing di `master-pipelines.html` formattano un importo in una valuta inattiva con il locale e il simbolo di quella valuta.
11. `/:id/details` contiene la subquery di fee una volta per riga (verificabile con un test su `pots.js`, nello stile di `pot-fee-sql.test.js`).
12. I test esistenti POT-01..POT-17 e `npm test` passano.

## Escluso esplicitamente (confermato dall'utente il 2026-10-29)

- **Conversione delle tariffe dei ruoli con il tasso corrente.** `costgrid.html` (righe 1166 e 1591, `roleBaseline`) e `js/costgrid.js` (righe 360, 382) convertono le tariffe EUR dei ruoli con il `current_rate` corrente, non con il tasso della versione. È una regola diversa da quella del tasso salvato. Finding nuovo, registrato come B-183 in `docs/BACKLOG.md`.
- **Creazione di una versione in una valuta inattiva**, che oggi prende 1.0 in silenzio (`cost-grids.js` righe 408-410), e il 404 di `refresh-rate` per una valuta inattiva. Entra solo se il brainstorming lo lega al criterio 6.
- **Riparazione dei dati esistenti:** oggi nessuna versione ha un tasso incoerente (verificato sopra). Non serve una migrazione dei dati.
- **`/summary` senza filtro di visibilità.** I totali calcolati "across ALL proposals" restano come sono.
- **Colori hex di `master-pipelines.html`** fuori dal modal (righe 1079, 1083 e la tabella POT): appartengono al restyling di Master Data.
- **`pbGetDisplayVersion` lato client:** cambia solo se il brainstorming decide di allinearlo alla regola server (vedi domanda 1).
- **Audit della validazione dei form, item 5 compreso:** è il passo successivo dell'handoff.

## Domande aperte per `/brainstorming`

1. **La regola della versione di riferimento:** deve seguire esattamente `pbGetDisplayVersion`, con "ha progetti" esteso a `projects.cg_version_id`? E in quel caso `pbGetDisplayVersion` (che legge `linkedProjects`) va allineato, oppure le due regole possono restare diverse sul caso `projects.cg_version_id`?
2. **Dove sta la regola:** un helper SQL in `api/src/lib/` sul modello di `pot-fee-sql.js` (CTE o `LATERAL`), con il suo `node:test`?
3. **Il tab POT di `pipeline.html`:** cambia solo attraverso `/summary`, o anche `pbPotView` va toccato?
4. **Il tasso fisso nell'autosave:** si toglie `currencyRate` dal payload di `_cgUpsertVersionToApi` e il server lo ricava al cambio valuta, oppure il client continua a mandarlo solo al cambio valuta? Il server deve ignorare un `currencyRate` inviato senza cambio valuta, oppure rifiutarlo con `400 { error, code }`?
5. **Cambio valuta verso una valuta inattiva** nel `PATCH`: rifiutarlo, o fissare 1.0 come fa la creazione?
6. **B-182:** la regola di `pot-fee-sql.test.js` diventa "nessuna divisione per `currency_rate` fuori dall'helper"? Quale forma esatta?

Brief ready. Next step: /brainstorming.
