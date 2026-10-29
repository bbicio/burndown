# POT in Master Data — valuta originale, Expected/SIP, tasso a zero (ciclo B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-10-29-cycle-b-pot-currency-design.md`
**Branch:** `cycle-b-pot-currency`
**Risk class:** high-risk — money o valute (conversione EUR / valuta originale, totali POT)

**Goal:** Il modal POT Details di `master-pipelines.html` mostra l'importo in valuta originale; tabella POT, riga anno e modal mostrano Expected/SIP come informativi; le route POT non falliscono con `currency_rate = 0`.

**Architecture:** Un helper SQL puro (`api/src/lib/pot-fee-sql.js`) diventa l'unica espressione della fee per le cinque route di `pots.js`; tre route estendono la loro risposta con campi nuovi; `master-pipelines.html` li rende. **I task non sono indipendenti**: ognuno consuma i nomi prodotti dal precedente, quindi vanno eseguiti in ordine.

**Tech Stack:** Express + PostgreSQL (`node:test` per `api/src/lib/`, `test-api.js` via `scripts/run-tests.sh`), Vue 3 da CDN senza build, vitest + jsdom.

## Global Constraints

- Solo Committed e Anticipated entrano in totali, percentuali e gap; Expected e SIP sono informativi; Draft escluso; il valore EUR è sempre visibile ed è l'unico sommato.
- Ogni importo con `formatMoney(v, code, currencies)` e il codice della propria riga; mai `Intl.NumberFormat`/`toLocaleString` su un importo (`js/lib/money-guard.test.js`).
- Nel modal (stringa `innerHTML`) ogni campo testuale passa da `esc()`.
- Nessun hex nuovo; nessun token nuovo in `css/tokens.css`.
- HTML modificato solo con l'Edit tool (mai `Set-Content`: aggiunge un BOM).
- Testo utente in inglese.
- I campi esistenti delle risposte API mantengono nome e significato.
- Durante i task si lanciano solo i test toccati; la suite completa gira in `/finish-cycle`.
- Worktree: `git worktree add .claude/worktrees/cycle-b-pot-currency -b cycle-b-pot-currency`, poi copia di `.env` dal checkout principale e `npm ci` (PROCESS.md §6.1b, §6.2).

## Review Focus

1. **Collisione di alias SQL** quando l'helper è incluso in una query che usa già `ph`/`tk`/`tr`/`ro` (es. `/pipeline-summary`, `/:id/details`) → il risultato deve restare la fee della versione esterna; pinnato da POT-13/POT-14 (valori attesi da giorni × tariffa) e dal test unitario che vieta gli alias corti nell'helper.
2. **Versione non EUR con tasso ≠ 1 nei totali** → `committed_total` resta la somma degli EUR, non degli originali; pinnato da POT-14.
3. **POT senza proposte Expected/SIP, o anno con solo un POT** → `expected_total`/`sip_total` valgono `0` (numero), non `null`/`undefined`; pinnato da POT-16 (anno `TEST_YEAR_B`, che ha un POT e nessuna proposta).
4. **`p.currency` nullo o `'EUR'` nel modal** → una sola riga EUR, nessun `(…)`; pinnato dal test vitest del Task 4 (la condizione è `p.currency && p.currency !== 'EUR'`).
5. **`currency_rate = 0`** → 200 e valore a tasso 1; pinnato dal test unitario (`NULLIF`) e dal controllo manuale PP-48.

---

### Task 1: Helper SQL della fee e adozione nelle cinque route

**Files:**
- Create: `api/src/lib/pot-fee-sql.js`
- Create: `api/src/lib/pot-fee-sql.test.js`
- Modify: `api/src/routes/pots.js:16-38` (`/pipeline-summary`), `:62-82` (`/year-totals`), `:125-137` (`/summary` `feeFor`), `:239-251` (`GET /` `feeExpr`), `:340-352` (`/:id/details` `valueExpr`)

**Interfaces:**
- Produces: `feeEurSql(alias: string) → string` e `feeOriginalSql(alias: string) → string`, CommonJS (`module.exports = { feeEurSql, feeOriginalSql }`). Ognuna restituisce un'espressione SQL scalare `COALESCE((SELECT SUM(…) … FROM phases … WHERE <ph>.version_id = <alias>.id), 0)`. La tariffa è quella attuale: `COALESCE(tr.rate_override, (SELECT re.hourly_rate FROM ratecard_entries re WHERE re.ratecard_id = <alias>.ratecard_id AND re.role_id = tr.role_id LIMIT 1), ro.hourly_rate, 0)`. `feeEurSql` divide la somma per `COALESCE(NULLIF(<alias>.currency_rate, 0), 1)`; `feeOriginalSql` non divide.
- Gli alias interni sono `pf_ph`, `pf_tk`, `pf_tr`, `pf_ro`, `pf_re`.

- [ ] **Step 1: Scrivere il test che fallisce** — `api/src/lib/pot-fee-sql.test.js` (`node:test`, `assert/strict`), quattro test:
  - `feeEurSql('cgv')` contiene `NULLIF(cgv.currency_rate, 0)` e `cgv.id` e `cgv.ratecard_id`;
  - `feeOriginalSql('cgv')` non contiene `currency_rate` e contiene `cgv.id`;
  - nessuna delle due contiene un alias corto in uso nelle route: `assert.doesNotMatch(sql, /\b(ph|tk|tr|ro|re|ph2|tk2)\./)`;
  - `readFileSync(path.join(__dirname, '../routes/pots.js'), 'utf8')` non contiene `currency_rate`.
- [ ] **Step 2: Lanciarlo e vederlo fallire** — `docker exec pdash-api node --test src/lib/pot-fee-sql.test.js` (oppure `node --test src/lib/pot-fee-sql.test.js` da `api/`: il file non richiede dipendenze). Atteso: FAIL, `Cannot find module './pot-fee-sql'`.
- [ ] **Step 3: Implementare `pot-fee-sql.js`** con le firme sopra.
- [ ] **Step 4: Usare l'helper in `pots.js`** — `const { feeEurSql, feeOriginalSql } = require('../lib/pot-fee-sql');`:
  - `/pipeline-summary`: `COALESCE(SUM(${feeEurSql('cgv')}), 0) AS total`.
  - `/year-totals`: `${feeEurSql('cgv')} AS fee` (sparisce `feeSubq`).
  - `/summary`: `feeFor(a)` sostituita da `feeEurSql(a)`.
  - `GET /`: `feeExpr` = `feeEurSql('cgv2')`.
  - `/:id/details`: `valueExpr` = `feeEurSql('cgv')`. Le risposte di questo task non cambiano.
- [ ] **Step 5: Lanciare il test** — stesso comando dello Step 2. Atteso: PASS, 4 test.
- [ ] **Step 6: Commit** — `git add api/src/lib/pot-fee-sql.js api/src/lib/pot-fee-sql.test.js api/src/routes/pots.js && git commit -m "refactor(pots): one fee expression for every POT route, zero rate safe"`

### Task 2: Campi nuovi nelle risposte API

**Files:**
- Modify: `api/src/routes/pots.js` (`/year-totals`, `GET /`, `/:id/details`)
- Test: `test-api.js` (nuova funzione `testPotMasterDataFields()` chiamata in fondo a `testPotSummaryExtended()`)

**Interfaces:**
- Consumes: `feeEurSql`, `feeOriginalSql` (Task 1).
- Produces:
  - `GET /api/pots/:id/details` → ogni elemento di `proposals` ha in più `currency: string` e `value_original: number`; la risposta ha in più `expected_total: number`, `sip_total: number`.
  - `GET /api/pots` → ogni POT ha in più `expected_total: number`, `sip_total: number`.
  - `GET /api/pots/year-totals` → ogni anno ha in più `expected_total: number`, `sip_total: number`.

- [ ] **Step 1: Scrivere i test** — in `test-api.js`, `testPotMasterDataFields()`. Setup sul modello di `testPotSummaryExtended`: anno corrente, un client `__test_pot_md_client__`, un POT client da 1.000.000, un ruolo `makeTestRole`, quattro proposte pubblicate con `rateOverride: 100`:
  - EUR Committed, 4 giorni, `currencyRate: 1`;
  - CHF Committed, 10 giorni, `currency: 'CHF'`, `currencyRate: 0.8` (con `currencyRate` esplicito la route non consulta `currencies.active`, `cost-grids.js` riga 403; il CHF è seminato inattivo);
  - EUR Expected, 2 giorni;
  - EUR SIP, 1 giorno.

  Generalizzare `makeProposal` con parametri `currency`/`rate` oppure scrivere un helper locale. Ogni risorsa creata va registrata con `later(...)`, come fanno i test esistenti. Asserzioni (verificare prima che gli id siano liberi: `grep -n "POT-1[3-9]" test-api.js TEST_CASES.md`):
  - **POT-13** `/:id/details`: ogni riga ha `typeof currency === 'string'` e `typeof value_original === 'number'`; la riga EUR Committed ha `value_original === value` (400).
  - **POT-14** riga CHF: `value_original` ≈ 1000 e `value` ≈ 1250 (|Δ| < 0.01); `committed_total` ≈ somma dei `value` delle righe Committed (≈ 1650).
  - **POT-15** `/:id/details`: `expected_total` ≈ 200, `sip_total` ≈ 100.
  - **POT-16** `GET /api/pots?year=<anno>`: il POT ha `expected_total` ≈ 200, `sip_total` ≈ 100, `achieved_total` ≈ `committed_total + anticipated_total`. `GET /api/pots?year=${TEST_YEAR_B}`: il POT di `testPots` ha `expected_total === 0` e `sip_total === 0`.
  - **POT-17** `GET /api/pots/year-totals`: `data[<anno>].expected_total` e `.sip_total` numerici e ≥ 200 / ≥ 100; `achieved_total` ≈ C+A.
- [ ] **Step 2: Implementare**:
  - `/:id/details`: nelle due query, `cgv.currency` e `${feeOriginalSql('cgv')} AS value_original`; nel `map`, `value_original: parseFloat(r.value_original || 0)`; `expected_total`/`sip_total` sommati in JS come `committedTotal`.
  - `GET /`: le due subquery diventano una `LEFT JOIN LATERAL (SELECT SUM(CASE WHEN cgv2.pipeline = 'Committed' THEN ${fee} ELSE 0 END) AS committed_total, … 'Anticipated' …, … 'Expected' …, … 'SIP' … FROM cost_grid_versions cgv2 WHERE cgv2.pipeline_year = p.year AND ${scopeFilter}) t ON true`; il `map` aggiunge `expected_total`/`sip_total` con `parseFloat(...) || 0`.
  - `/year-totals`: `pipeline IN ('Committed', 'Anticipated', 'Expected', 'SIP')`; l'oggetto di ogni anno parte con `expected_total: 0, sip_total: 0` in entrambi i rami di inizializzazione; il ciclo accumula `Expected` e `SIP`.
- [ ] **Step 3: Lanciare la suite di integrazione** — dal worktree: `scripts/run-tests.sh`. Atteso: exit 0, POT-13..POT-17 e POT-01..POT-12 verdi.
- [ ] **Step 4: Aggiornare `TEST_CASES.md` e `docs/BACKLOG.md`**:
  - **`TEST_CASES.md`**, sezione 10:
    - riga **PP-46**: "`/api/pots` details/list/year-totals extended fields (test-api POT-13..POT-17)", ✓;
    - riga **PP-48**, manuale: "Zero currency rate" — sul branch stack `docker exec -i <db del branch> psql -U pdash -d pdash -c "UPDATE cost_grid_versions SET currency_rate = 0 WHERE id = '<versione nel perimetro di un POT>'"`; poi `GET /api/pots/:id/details?year=`, `GET /api/pots?year=`, `GET /api/pots/year-totals`, `GET /api/pots/pipeline-summary?year=` → tutte 200, il valore della versione è la fee a tasso 1.
  - **`docs/BACKLOG.md`**: riga **B-174**, fonte `2026-10-29-…-cycle-b-pot-currency`. Testo: "the POT Details modal still lists Canceled proposals (not in totals); left as is by the cycle B Brief". File: `master-pipelines.html`, `api/src/routes/pots.js`. Stato: `open`. Verified how: `grep -n "pipeline != 'Draft'" api/src/routes/pots.js`.
- [ ] **Step 5: Commit** — `git add api/src/routes/pots.js test-api.js TEST_CASES.md docs/BACKLOG.md && git commit -m "feat(pots): original currency and Expected/SIP totals in details, list and year totals"`

### Task 3: Tabella POT e riga anno in `master-pipelines.html`

**Files:**
- Modify: `master-pipelines.html:160-170` (riga anno), `:328-348` (intestazione e righe della tabella POT)
- Create: `js/lib/master-pipelines-pot-details.test.js`
- Modify: `TEST_CASES.md` (PP-42, PP-43)

**Interfaces:**
- Consumes: `pot.expected_total`, `pot.sip_total`, `yearTotals[year].expected_total`, `yearTotals[year].sip_total` (Task 2).

- [ ] **Step 1: Scrivere il test che fallisce** — `js/lib/master-pipelines-pot-details.test.js` (vitest, `readFileSync` come `js/lib/master-data-guard.test.js`), `describe('master-pipelines POT table and year row')`:
  - l'intestazione della tabella POT contiene, in quest'ordine, `>Anticipated</th>`, `>Expected</th>`, `>SIP</th>`;
  - la pagina contiene `formatMoney(+pot.expected_total || 0, 'EUR', activeCurrencies)` e `formatMoney(+pot.sip_total || 0, 'EUR', activeCurrencies)`;
  - la pagina contiene `yearTotals[py.year].expected_total` e `yearTotals[py.year].sip_total`;
  - `Total (C+A)` usa ancora `achieved_total`.
- [ ] **Step 2: Lanciarlo** — `npx vitest run js/lib/master-pipelines-pot-details.test.js`. Atteso: FAIL.
- [ ] **Step 3: Implementare**:
  - tabella: due `<th class="text-end">` `Expected` e `SIP` dopo `Anticipated`; due `<td class="text-end text-muted">` con i valori dello Step 1;
  - riga anno: dopo `A: …` aggiungere `<span class="text-muted mx-1">·</span><span class="text-muted">E: {{ formatMoney(yearTotals[py.year].expected_total || 0, 'EUR', activeCurrencies) }}</span>` e lo stesso per `S:` con `sip_total`.
- [ ] **Step 4: Lanciare il test** — atteso PASS. Lanciare anche `npx vitest run js/lib/money-guard.test.js js/lib/master-data-guard.test.js`: atteso PASS.
- [ ] **Step 5: `TEST_CASES.md`** — PP-42: cinque colonne "Total (C+A) / Committed / Anticipated / Expected / SIP"; Expected e SIP attenuati e non in Total. PP-43: la riga secondaria mostra "C: €X · A: €Y · E: €Z · S: €W"; E e S attenuati; percentuale e C+A invariati.
- [ ] **Step 6: Commit** — `git add master-pipelines.html js/lib/master-pipelines-pot-details.test.js TEST_CASES.md && git commit -m "feat(master-pipelines): Expected and SIP columns in the POT table and year row"`

### Task 4: Modal POT Details

**Files:**
- Modify: `master-pipelines.html:965-1063` (`openPotDetails`)
- Modify: `js/lib/master-pipelines-pot-details.test.js` (nuovo `describe`)
- Modify: `TEST_CASES.md` (PP-21, PP-44; nuove PP-45, PP-47)

**Interfaces:**
- Consumes: `d.proposals[].currency`, `d.proposals[].value_original`, `d.expected_total`, `d.sip_total` (Task 2).

- [ ] **Step 1: Scrivere i test che falliscono** — `describe('openPotDetails')`. Il corpo si estrae con `page.slice(page.indexOf('async openPotDetails('), page.indexOf('stageColor(pipeline) {'))`. Asserzioni:
  - `expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)`;
  - `body` non contiene `this.stageBg(` né `this.stageColor(`;
  - `body` contiene `p.currency && p.currency !== 'EUR'`, `p.value_original` e `Not in total`;
  - `body` contiene `d.expected_total` e `d.sip_total`;
  - `body` contiene `var(--pipeline-committed-color)` e `var(--pipeline-anticipated-color)`.
- [ ] **Step 2: Lanciarlo** — `npx vitest run js/lib/master-pipelines-pot-details.test.js`. Atteso: FAIL sul nuovo `describe`.
- [ ] **Step 3: Implementare in `openPotDetails`**:
  - **cella Value:** se `p.currency && p.currency !== 'EUR'`, `${window.formatMoney(p.value_original, p.currency, window.__currencies)}<br><span style="font-size:.7rem;color:var(--text-muted)">(${window.formatMoney(p.value, 'EUR', window.__currencies)})</span>`; altrimenti com'è oggi. Aggiungere `white-space:nowrap` alla cella.
  - **riga informativa** dopo la `row g-3` delle card: `<div class="mb-4" style="font-size:.8rem;color:var(--text-muted)">Not in total · Expected ${formatMoney(d.expected_total || 0, 'EUR', …)} · SIP ${formatMoney(d.sip_total || 0, 'EUR', …)}</div>`. Togliere `mb-4` dalla `row g-3`, mantenendo la spaziatura attuale prima di Change History.
  - **colori:**
    - Committed → `var(--pipeline-committed-color)`;
    - Anticipated → `var(--pipeline-anticipated-color)`;
    - `#1a1a2e` → `var(--text-primary)`;
    - `#6b7280` → `var(--text-muted)`;
    - badge tipo → `background:var(--indigo-50);color:var(--brand-navy)`;
    - badge di stadio → `var(--pipeline-${p.pipeline.toLowerCase()}-bg)` / `-color`, con `p.pipeline` passato da `esc()` come oggi.
- [ ] **Step 4: Lanciare i test** — `npx vitest run js/lib/master-pipelines-pot-details.test.js js/lib/money-guard.test.js`. Atteso: PASS.
- [ ] **Step 5: `TEST_CASES.md`**:
  - **PP-21:** card con bordi e testi dai token di stadio.
  - **PP-44:** Anticipated con l'arancio di stadio.
  - **PP-45**, nuova: "View Details — original currency". Passi: POT con una proposta CHF Committed. Atteso: la cella Value mostra l'importo CHF nel formato `de-CH` e sotto "(€ …)"; le proposte EUR mostrano un solo importo; card e totali invariati, in EUR.
  - **PP-47**, nuova: "View Details — Expected/SIP line". Passi: POT con proposte Expected e SIP. Atteso: sotto le card "Not in total · Expected €X · SIP €Y"; Total (C+A) e le percentuali non cambiano.
- [ ] **Step 6: Commit** — `git add master-pipelines.html js/lib/master-pipelines-pot-details.test.js TEST_CASES.md && git commit -m "feat(master-pipelines): original currency and Expected/SIP line in POT Details, colours from tokens"`

---

La documentazione narrativa (`docs/pages/config.md`, `docs/api/lib.md` per `pot-fee-sql.js`) la scrive `/sync-docs` al Gate 5 di `/finish-cycle`. Il controllo manuale PP-48 (tasso a zero) si esegue al Gate 2 sul branch stack.

## Decisioni aperte

1. **Esecuzione in quattro task sequenziali, in ordine API → pagina.** Alternativa scartata: un task per l'API e uno per la pagina. Perché: tabella/riga anno e modal sono rifiutabili separatamente da un revisore, e l'helper è un refactor con un suo test.
2. **Il Task 3 introduce il file di test e il Task 4 lo estende.** Alternativa scartata: due file di test. Perché: pinnano la stessa pagina e lo stesso dominio.
3. **Id nuovi: PP-45..PP-48 e B-174.** Alternativa scartata: riusare le righe esistenti. Perché: PP-21/42/43/44 descrivono comportamento che resta, e vengono solo aggiornate.
