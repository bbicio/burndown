# Master Data — Currencies (phase 2, page 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-05-master-data-currencies-design.md`
**Branch:** `master-data-currencies`
**Risk class:** high-risk — money o valute (modifica e attivazione dei tassi di cambio, `Api.currencies.updateRate`/`activate`)

**Goal:** `master-currencies.html` diventa la pagina "Currencies" delle tavole 10.6a–d: lista da leggere con modifica inline confermata, riga di attivazione con picker ricercabile, drawer della storia con grafico, layout tablet/phone; nessun modal Bootstrap.

**Architecture:** La logica pura (formato del tasso, inverso, parsing, delta, voci della storia, picker, date, punti del grafico) va nel nuovo `js/lib/master-currencies.js`, testata con vitest. La pagina resta una sola app Vue con CSS locale `.mdc-*`; drawer sul pattern `.mdr-drawer` di `master-roles.html`; dialogo di conferma e bottom sheet come overlay Vue locali. Nessuna API, nessun file condiviso modificato.

**Tech Stack:** HTML statico + Vue 3 da CDN, Bootstrap 5.3 CSS (JS solo per `nav.js`), vitest + jsdom, `scripts/shoot.mjs`.

**Tasks independent?** No: i Task 2–5 modificano tutti `master-currencies.html` uno sopra l'altro e consumano il modulo del Task 1.

## Global Constraints

- Copy in inglese, sentence case, testi esatti della spec §5–§9. Errori invariati: "Rate must be a positive number" (client); i messaggi del server mostrati come arrivano (`e.message`).
- Nessuna emoji, nessun `confirm(`/`alert(`, nessun `bootstrap.Modal`, nessun `class="modal`, nessun `form-card` nella pagina. Il `<script>` di `bootstrap.bundle.min.js` resta (lo usa `nav.js`).
- Nessun hex nella pagina: solo token di `css/tokens.css` (scrim `--overlay-scrim` con opacity `.5`; tinta EUR `--color-success-bg`; "no change" `--color-warning-text`; box grigi `--surface-light`; z-index da `--z-notification`).
- Icone solo `<ph-icon>` (esistono `info`, `pencil`, `chevron-down`, `close`, `search`).
- Mai `Intl.NumberFormat` (guard money); `toLocaleString('en', …)` ammesso solo per i tassi, dentro `js/lib/master-currencies.js`. Nella pagina niente `parseFloat`: si usa `parseRateText`.
- Mai `isNaN(new Date(` né `.replace(/-/g` (guard dates). `js/lib/master-currencies.js` importa `formatDayText` da `./dates.js?v=4` (stesso `?v=` del repo); la pagina non chiama funzioni di `dates.js` direttamente.
- `js/lib/master-currencies.js` caricato come `<script type="module" src="js/lib/master-currencies.js?v=1">` prima dello script dell'app.
- La pagina chiama solo `Api.currencies.*` (voce `api: ['currencies']` di `master-data-guard.test.js`).
- Breakpoint: tablet 768–1023.98px, phone < 768px; controlli 40px su tablet, ≥ 44px su phone.
- Durante i task solo i test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.
- Mai `docker compose` sul main stack: verifiche contro `scripts/test-branch.sh`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Doppio Enter / doppio click su Confirm o Activate** — una sola richiesta: `confirmRate` e `activateCurrency` escono subito se `saving`; guard nel Task 2 e nel Task 3.
2. **`current_rate` e `rate` arrivano come stringhe NUMERIC (`"1.300000"`)** — `formatRate`, `inverseRate`, `rateDelta`, `historyEntries` fanno `Number(...)`; "no change" confronta i numeri, non le stringhe (`"1.2"` vs `"1.200000"`); test nel Task 1.
3. **Tasso digitato con spazi o con il separatore in coda (`" 1,25 "`, `"1."`)** — `" 1,25 "` → `1.25`; `"1."` → `1`; `"1,2.3"`, `"1.2.3"`, `"abc"`, `"-1"` → `NaN` o non valido; test nel Task 1.
4. **History in errore per una valuta in lista** — la riga si mostra senza delta e senza utente, nessun banner; il drawer della stessa valuta mostra "Couldn't load the rate history." con Retry; guard nel Task 2 (catch per valuta in `loadHistories`).
5. **Esc con il dialogo di conferma aperto sopra un bottom sheet (phone) o con il picker aperto** — chiude solo lo strato più in alto: un solo handler `onKeydown` che chiude nell'ordine picker → dialogo → sheet → drawer → modifica inline; guard nel Task 2.

---

### Task 1: Modulo puro `js/lib/master-currencies.js`

**Files:**
- Create: `js/lib/master-currencies.js`
- Test: `js/lib/master-currencies.test.js`

**Interfaces:**
- Produces (export + `window.<name>` bridge per ciascuno):
  - `formatRate(rate: number|string) => string` — `Number(rate).toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 6, useGrouping: false })`; `''` se non finito.
  - `inverseRate(rate) => string` — `(1 / Number(rate))` con 4 decimali fissi `en`; `''` se `!isValidRate(Number(rate))`.
  - `parseRateText(text) => number|null` — `null` per vuoto/solo spazi; dopo trim deve combaciare `/^\d+([.,]\d*)?$/` (un solo separatore), altrimenti `NaN`; `,` → `.` poi `Number`.
  - `isValidRate(n) => boolean` — `typeof n === 'number' && isFinite(n) && n > 0`.
  - `editText(rate) => string` — testo iniziale dell'input di modifica: `formatRate(rate)`.
  - `rateDelta(rows: Array<{rate}>) => { pct: number, dir: 'up'|'down' } | null` — `rows[0]` più recente, `rows[1]` precedente; `pct = (r0 - r1) / r1 * 100`; `null` con < 2 righe o `Math.abs(pct) < 0.01`.
  - `formatDelta(d) => string` — `'▲ 8.3%'` / `'▼ 7.0%'` (`Math.abs(pct).toFixed(1)`).
  - `historyEntries(rows) => Array<{ id, rate: number, createdAt, updatedBy, delta: number|null, noChange: boolean, activated: boolean, newest: boolean }>` — `delta = rate - rows[i+1].rate` (`null` per l'ultima), `noChange = delta === 0`, `activated = i === last && rows.length < 100`, `newest = i === 0`.
  - `formatHistoryDelta(delta: number) => string` — `'+0.1000'` / `'−0.1000'` (segno meno U+2212, 4 decimali).
  - `pickableCurrencies(currencies, query = '') => currencies` — `!c.active && c.code !== 'EUR'`, ordine ricevuto; query trim lowercase su `code`, `name`, `symbol`.
  - `formatRateDate(ts) => string` — data **locale** di `new Date(ts)` composta come `YYYY-MM-DD` con `padStart` e passata a `formatDayText`; `'—'` per falsy.
  - `formatRateDateTime(ts) => string` — `formatRateDate(ts) + ', ' + HH:MM` locale 24h (`padStart`).
  - `sparklinePoints(rows, w: number, h: number) => string` — punti `"x,y x,y"` in ordine cronologico (rows sono newest-first: invertirli); x da 0 a `w` equispaziati; y scalato tra min e max con padding 4px, invertito (valore alto = y basso); un punto o tutti uguali → linea piatta a `h/2` da 0 a `w`; `''` senza righe.

- [ ] **Step 1: Scrivi i test** in `js/lib/master-currencies.test.js` (import da `./master-currencies.js`):
  - `formatRate`: `1.3` → `'1.3000'`; `'1.300000'` → `'1.3000'`; `0.857143` → `'0.857143'`; `0.93` → `'0.9300'`; `160.5` → `'160.5000'`; `1234.5` → `'1234.5000'` (niente separatore migliaia); `'x'` → `''`.
  - `inverseRate`: `0.8` → `'1.2500'`; `'1.300000'` → `'0.7692'`; `0` → `''`.
  - `parseRateText`: `'1,25'` → `1.25`; `' 1.25 '` → `1.25`; `'1.'` → `1`; `''` → `null`; `'   '` → `null`; `'1,2.3'`, `'1.2.3'`, `'abc'`, `'-1'` → `NaN`.
  - `isValidRate`: `1.2` true; `0`, `-1`, `NaN`, `null`, `Infinity` false.
  - `rateDelta`: `[{rate:'1.3'},{rate:'1.2'}]` → `{ dir: 'up' }` con `pct` ≈ `8.33`; `[{rate:'0.8'},{rate:'0.86'}]` → `dir: 'down'`; una riga → `null`; `[{rate:'1.20001'},{rate:'1.2'}]` → `null`. `formatDelta` → `'▲ 8.3%'`, `'▼ 7.0%'`.
  - `historyEntries` su `[1.3, 1.2, '1.200000', 1.3, 1.19, 1.09]` (newest first): deltas `[0.1, 0, -0.1, 0.11, 0.1, null]` (tolleranza `toBeCloseTo`), `noChange` solo sull'indice 1, `newest` solo 0, `activated` solo sull'ultima; con 100 righe nessuna `activated`. `formatHistoryDelta(0.1)` → `'+0.1000'`, `(-0.1)` → `'−0.1000'`.
  - `pickableCurrencies`: da `[EUR attiva, GBP attiva, AUD inattiva (A$), JPY inattiva (¥)]` → `['AUD','JPY']`; query `'yen'` → `['JPY']`; `'¥'` → `['JPY']`; `'aud'` → `['AUD']`; `'zzz'` → `[]`.
  - `formatRateDate(new Date(2026, 9, 3, 23, 30).toISOString())` → `'Oct 3, 2026'`; `null` → `'—'`. `formatRateDateTime(new Date(2026, 5, 26, 19, 29).toISOString())` → `'Jun 26, 2026, 19:29'`.
  - `sparklinePoints`: `[]` → `''`; una riga (w 200, h 60) → `'0,30 200,30'`; `[{rate:2},{rate:1}]` → primo punto con y maggiore dell'ultimo (il più vecchio è il più basso), x `0` e `200`.
- [ ] **Step 2: Lancia** `npx vitest run js/lib/master-currencies.test.js` — atteso FAIL (modulo assente).
- [ ] **Step 3: Implementa** `js/lib/master-currencies.js` con intestazione di commento come `js/lib/master-roles.js`, `import { formatDayText } from './dates.js?v=4';` e i bridge `window.<name> = <name>` in fondo.
- [ ] **Step 4: Lancia** `npx vitest run js/lib/master-currencies.test.js js/lib/dates-guard.test.js js/lib/money-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git add js/lib/master-currencies.js js/lib/master-currencies.test.js && git commit -m "feat(master-currencies): pure rate, history and picker helpers"`.

### Task 2: Lista, modifica inline e dialogo di conferma (10.6a)

Boards: `docs/superpowers/design/MD-Currencies/10.6a-currencies-list.jpg`, `MDCurrencies.dc.html` (stato default). Prima di chiudere apri la tavola e confronta testata della card, nota informativa, intestazioni, cella Currency (box simbolo, pill "Base"), tasso + simbolo + matita + delta, Inverse, Last updated con utente, link History. "Used in" e "⋯" **non** si riproducono (spec §3).

**Files:**
- Modify: `master-currencies.html` (riscrittura di `<style>`, del corpo della card e dello script dell'app)
- Create: `js/lib/master-currencies-page-guard.test.js`
- Modify: `js/lib/master-data-guard.test.js:94-96` (voce `master-currencies.html`)

**Interfaces:**
- Consumes: tutto il Task 1 via `window.*`.
- Produces (stato e metodi usati dai Task 3–5): `currencies`, `activeList` (computed, `active`), `histByCode: { [code]: { rows, error } }`, `loadAll()`, `loadHistories(codes?: string[])`, `edit = { code, text, error }`, `startEdit(cur)`, `cancelEdit()`, `saveEdit()`, `confirm = { show, code, symbol, oldRate, newRate, rate, error, saving }`, `confirmRate()`, `closeConfirm()`, `onKeydown(e)` (registrato su `document` in `mounted`, rimosso in `unmounted`), `symbolOf(code)`, `eurSymbol` (computed, `currencyInfo('EUR', currencies).symbol`).

- [ ] **Step 1: Scrivi il guard** `js/lib/master-currencies-page-guard.test.js` (stile di `master-roles-page-guard.test.js`, lettura LF + helper `between`):
  - la pagina non contiene `bootstrap.Modal`, `class="modal`, `confirm(`, `alert(`, `form-card`, `parseFloat(`, `crHistoryModal`, `crRateConfirmModal`, `globalError(msg)`, né emoji (`/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u`);
  - `updateRate(` compare una sola volta, dentro `between('async confirmRate()', 'closeConfirm()')`, che inizia con `if (this.confirm.saving) return;` e nel catch scrive `this.confirm.error` e non `globalError`;
  - `saveEdit()` chiama `window.parseRateText(` e `window.isValidRate(` e contiene `'Rate must be a positive number'`;
  - `loadHistories` ha un `catch` per valuta (contiene `error: true`) e non scrive `globalError`;
  - `onKeydown(e)` contiene `'Escape'` e controlla nell'ordine `act.pickerOpen`, `confirm.show`, `sheet`, `hist.code`, `edit.code` (indici crescenti delle sottostringhe).
- [ ] **Step 2: Aggiorna** `master-data-guard.test.js` voce Currencies a `must: ['class="mdc-dialog"', 'class="mdc-drawer"', 'this.edit']`, `api: ['currencies']` invariato.
- [ ] **Step 3: Lancia** `npx vitest run js/lib/master-currencies-page-guard.test.js js/lib/master-data-guard.test.js` — atteso FAIL.
- [ ] **Step 4: Implementa** in `master-currencies.html` spec §5, §6, §6.1: rimuovi CSS legacy (`.section-title`, `.form-card`, `.cfg-tabs`, `.team-sep`, `.rate-warn`, hex), aggiungi `.mdc-*` solo token; card head con descrizione nuova e "+ Activate currency" (il click apre `act`, implementato nel Task 3: per ora `act` esiste con `show: false`); nota con `<ph-icon name="info">`; tabella `.mdc-table`; modifica inline (input `ref` per focus+select, `@keydown.enter`); dialogo `.mdc-dialog` con scrim, `role="alertdialog"`, `aria-modal="true"`, focus su Confirm; stub vuoto `<aside class="mdc-drawer" v-if="hist.code">` con ✕ (completato nel Task 4) perché il `must` del guard lo pretende. Dopo `loadAll()` chiama `loadHistories()` senza `await` nel percorso di render. Carica `js/lib/master-currencies.js?v=1` prima dello script dell'app. Rimuovi il watcher `globalError` e lo stato `crf`/`crEdit`/`crHistory`/`crRateConfirm`; `globalError` si mostra come alert dentro la card.
- [ ] **Step 5: Lancia** `npx vitest run js/lib/master-currencies-page-guard.test.js js/lib/master-data-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js js/lib/money-guard.test.js js/lib/dates-guard.test.js` — atteso PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(master-currencies): read-first list, inline rate edit, confirm dialog"` (più `git add` del nuovo guard).

### Task 3: Riga di attivazione con picker (10.6b)

Boards: `docs/superpowers/design/MD-Currencies/10.6b-activate-currency.jpg`, `MDCurrencies.dc.html` (`adding=true`). Confronta riga grigia, trigger del picker, popover 320px con ricerca e tre colonne, input "e.g. 1.6500", "—"/inverso, hint "Starts the rate history.", Cancel + Activate disabilitato. Le scrollbar della cattura non fanno parte del design.

**Files:**
- Modify: `master-currencies.html`
- Modify: `js/lib/master-currencies-page-guard.test.js`

**Interfaces:**
- Consumes: Task 1 (`pickableCurrencies`, `parseRateText`, `isValidRate`, `inverseRate`); Task 2 (`loadAll`, `loadHistories`, `onKeydown`).
- Produces: `act = { show, code, text, error, saving, pickerOpen, query, activeIndex }`, `openActivate()`, `cancelActivate()`, `pickCurrency(code)`, `actRate` (computed, `parseRateText(act.text)`), `actValid` (computed, `!!act.code && isValidRate(actRate)`), `actOptions` (computed, `pickableCurrencies(currencies, act.query)`), `canActivate` (computed, `pickableCurrencies(currencies).length > 0`), `activateCurrency()`.

- [ ] **Step 1: Estendi il guard**: il bottone Activate porta `:disabled="!actValid || act.saving"`; `activateCurrency()` inizia con `if (!this.actValid || this.act.saving) return;`, chiama `Api.currencies.activate(` e nel catch scrive `this.act.error`; `act` iniziale ha `text: ''` (niente `rate: '1'`); "+ Activate currency" ha `v-if` con `canActivate` e `!act.show`.
- [ ] **Step 2: Lancia** il guard — atteso FAIL.
- [ ] **Step 3: Implementa** spec §7: riga `.mdc-act-row` prima delle righe di `activeList`; combobox locale (trigger button `aria-haspopup="listbox"`, popover assoluto 320px sotto il trigger, input ricerca `ref` con focus all'apertura, placeholder "Search code or name…", lista `role="listbox"` con `activeIndex`, frecce/Enter/Esc, chiusura su `mousedown` fuori); input del tasso con suffisso `symbolOf(act.code)`; inverso live `'1 ' + act.code + ' = ' + eurSymbol + ' ' + inverseRate(actRate)` o "—"; successo → `cancelActivate()`, `await loadAll()`, `loadHistories()`.
- [ ] **Step 4: Lancia** `npx vitest run js/lib/master-currencies-page-guard.test.js js/lib/master-data-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-currencies): inline activate row with searchable picker"`.

### Task 4: Drawer della storia (10.6c)

Boards: `docs/superpowers/design/MD-Currencies/10.6c-rate-history-usd.jpg`, `MDCurrencies.dc.html` (`history=true`). Confronta eyebrow, titolo, sottotitolo, tasso corrente grande, box del grafico con date agli estremi, "Changes · N", pallini, data+ora, utente con "· activated", delta / "no change" ambra, tasso a destra.

**Files:**
- Modify: `master-currencies.html`
- Modify: `js/lib/master-currencies-page-guard.test.js`

**Interfaces:**
- Consumes: Task 1 (`historyEntries`, `formatHistoryDelta`, `formatRateDateTime`, `formatRateDate`, `sparklinePoints`, `formatRate`); Task 2 (`histByCode`, `onKeydown`).
- Produces: `hist = { code, rows, loading, error }`, `openHistory(cur)`, `closeHistory()`, `reloadHistory()`, `histEntries` (computed), `histCurrency` (computed).

- [ ] **Step 1: Estendi il guard**: `openHistory(` chiama `Api.currencies.history(`; il template contiene `Couldn't load the rate history.`, `No rate history yet.`, `Every change is logged with date, time and user.`, `<polyline`; `closeHistory` è chiamato da scrim e ✕.
- [ ] **Step 2: Lancia** il guard — atteso FAIL.
- [ ] **Step 3: Implementa** spec §8 sul pattern `.mdr-drawer-wrap`/`.mdr-scrim`/`.mdr-drawer` di `master-roles.html` (rinominati `.mdc-`), 560px `min(560px, 100%)`; SVG `viewBox="0 0 <w> <h>"` con `preserveAspectRatio="none"` e `vector-effect="non-scaling-stroke"`; prima e ultima data = `formatRateDate` della riga più vecchia e più recente; apertura mostra subito `histByCode[code].rows` se presenti, poi ricarica e aggiorna anche `histByCode`.
- [ ] **Step 4: Lancia** `npx vitest run js/lib/master-currencies-page-guard.test.js js/lib/master-data-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-currencies): rate history side drawer with trend chart"`.

### Task 5: Responsive — tablet e smartphone (10.6d)

Boards: `docs/superpowers/design/MD-Currencies/10.6d-tablet-smartphone.jpg`. Confronta: tablet con box tasso stile input 40px e inverso sotto, niente Inverse/delta; phone con card per valuta, azioni Edit rate · History, bottom sheet "Edit rate · <CODE>". La nota informativa resta anche se la tavola tablet non la mostra (spec, ledger 9).

**Files:**
- Modify: `master-currencies.html`
- Modify: `js/lib/master-currencies-page-guard.test.js`

**Interfaces:**
- Consumes: Task 2 (`startEdit`, `saveEdit`, `confirm`), Task 3 (`act`, `actOptions`, `pickCurrency`, `activateCurrency`), Task 4 (`openHistory`).
- Produces: `sheet: null | 'edit' | 'activate'`, `isPhone` (data, da `matchMedia('(max-width: 767.98px)')` con listener `change`), `openEditSheet(cur)`, `openActivateSheet()`, `closeSheet()`.

- [ ] **Step 1: Estendi il guard**: il template contiene `Edit rate · `, `Save rate`, `applies to new proposal versions`; il sheet di modifica passa da `saveEdit()` (nessuna seconda chiamata a `updateRate(`, già pinnata dal Task 2); CSS con `@media (max-width: 767.98px)` e `@media (min-width: 768px) and (max-width: 1023.98px)`.
- [ ] **Step 2: Lancia** il guard — atteso FAIL.
- [ ] **Step 3: Implementa** spec §9: tablet via CSS (colonna Inverse e delta nascosti, inverso sotto il tasso, controlli 40px, riga di attivazione su due righe); phone con lista di card `.mdc-cards` mostrata al posto della tabella; su phone "Edit rate" e "+ Activate currency" aprono `sheet`; il sheet `activate` usa la stessa lista `actOptions` resa inline a tutta altezza (non popover); dialogo di conferma su phone reso come secondo sheet in fondo (CSS); drawer a schermo intero con head sticky; target ≥ 44px, input 48px, "Save rate" 46px.
- [ ] **Step 4: Lancia** `npx vitest run js/lib/master-currencies-page-guard.test.js js/lib/master-data-guard.test.js` — atteso PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(master-currencies): tablet and phone layouts with bottom sheets"`.

### Task 6: Verifica visiva, documentazione, caso manuale

Boards: tutte le tavole di `docs/superpowers/design/MD-Currencies/` (mappa nella spec §3).

**Files:**
- Modify: `docs/pages/config.md` (nuova sezione "Currencies (2026-11-05, Master Data phase 2)": lista, modifica inline con conferma, attivazione, drawer, delta da history, elementi delle tavole non riprodotti e deviazioni accettate con il motivo; aggiorna la riga della tabella che cita `#crHistoryModal`)
- Modify: `TEST_CASES.md` (caso `MD-17`: EUR non modificabile, modifica con "," e Esc, conferma con errore server riprovabile, Activate disabilitato senza tasso, ricerca del picker per simbolo, history con "no change", tablet e phone con sheet)
- Modify: `master-currencies.html` solo per i fix-ora decisi

- [ ] **Step 1: Stack del branch** — `scripts/test-branch.sh up` (worktree con `.env` copiato), poi `scripts/test-branch.sh status` → `up`.
- [ ] **Step 2: Shoot** (spec §12) con `--base http://localhost:8081 --settle 3000`, credenziali `SHOOT_EMAIL`/`SHOOT_PASSWORD`: a 1400 lista (`--full`), riga di attivazione con picker aperto, drawer della history, dialogo di conferma; a 1024 lista; a 390 lista, sheet Edit rate, sheet di conferma. Stati interattivi con `--eval`.
- [ ] **Step 3: Rileggi ogni PNG con `Read`** e confrontalo con la sua tavola; presenta all'utente gli scostamenti uno per uno con proposta fix-ora / accetta-e-registra e **aspetta la decisione**.
- [ ] **Step 4: Applica** i fix-ora, scrivi gli "accetta" con il motivo in `docs/pages/config.md`, aggiungi `MD-17` a `TEST_CASES.md`.
- [ ] **Step 5: Verifica** — `npx vitest run js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js js/lib/master-data-guard.test.js js/lib/master-currencies-page-guard.test.js js/lib/master-currencies.test.js`. Atteso: PASS.
- [ ] **Step 6: Commit** — `git add docs/pages/config.md TEST_CASES.md master-currencies.html && git commit -m "docs(master-currencies): Currencies notes, accepted deviations and manual test case"`. Lo stack del branch resta su per il Gate 2.

---

## Decisioni aperte

1. **Esecuzione nativa, non subagent-driven.** Alternativa scartata: subagent-driven. Perché: §6.1 richiede task indipendenti, e i Task 2–5 riscrivono lo stesso `master-currencies.html` uno sopra l'altro.
2. **`master-currencies.js` importa `formatDayText` da `./dates.js?v=4` invece di far caricare `dates.js` alla pagina.** Alternativa scartata: `<script type="module" src="js/lib/dates.js?v=4">` nella pagina. Perché: CLAUDE.md vuole un `import` nativo fra moduli `js/lib/`, e la pagina non chiama funzioni di date direttamente.
3. **Il marker `must` di `master-data-guard.test.js` diventa `class="mdc-dialog"`, `class="mdc-drawer"`, `this.edit`.** Alternativa scartata: nomi di componenti Vue registrati. Perché: dialogo e drawer sono markup locale, non componenti.
4. **Il guard sulla pagina è statico (stringhe nel sorgente), non un mount Vue in jsdom.** Alternativa scartata: montare l'app con le API mockate. Perché: è lo stile dei guard delle pagine sorelle e la logica testabile sta nel modulo del Task 1.
5. **Un solo handler Esc a livello di `document` che chiude lo strato più in alto.** Alternativa scartata: un handler per overlay. Perché: con sheet, dialogo e picker sovrapponibili, un ordine esplicito evita che un Esc chiuda due strati.
