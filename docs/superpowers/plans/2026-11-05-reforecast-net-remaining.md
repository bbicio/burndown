# Reforecast — residuo netto di progetto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-05-reforecast-net-remaining-design.md`
**Branch:** `reforecast-net-remaining`
**Risk class:** high-risk — money o valute (calcolo degli importi del phasing scritti nel progetto)

**Goal:** `reforecastDistribution` scrive gli actuals veri nei loro mesi e distribuisce nei mesi aperti il residuo netto di progetto, così che il phasing torni con i KPI del portfolio.

**Architecture:** Riscrittura della sola funzione pura `reforecastDistribution` in `js/lib/config-form-calc.js` (firma invariata, campi in più nel risultato), più il messaggio di conferma di `runReforecast` in `project-config.html`. Test vitest in `js/lib/config-form-calc.test.js`.

**Tech Stack:** ES module puro + vitest; pagina Vue 3 da CDN.

**Tasks independent?** No: il Task 2 riscrive la funzione pinnata dal Task 1, il Task 3 legge i campi nuovi del Task 2.

## Global Constraints

- Firma invariata: `reforecastDistribution(tasks, months, actualsRows, currentYm, digits = 2)`; `distError` resta nel risultato, sempre `null`.
- Normalizzazione di task e ruolo invariata: `s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()`.
- Ogni mese di `newPhasing` arrotondato con `round(v, digits)`; le ore dei mesi `>= currentYm` passano per `distributeHoursExact` (`./cfg-parse.js`).
- Testi utente in inglese.
- Cache-busting: `js/lib/config-form-calc.js?v=6` → `?v=7` in `project-config.html:516`, unico riferimento (`grep -rn "config-form-calc.js?v=" --include=*.html .`).
- `deriveDistribution`, PTC, portfolio e API non si toccano.
- Durante i task solo `npx vitest run js/lib/config-form-calc.test.js` (più i guard citati nel Task 3); la suite completa gira in `/finish-cycle`.
- Edit dei file HTML solo con Edit/`sed`/node, mai `Set-Content` di PowerShell (BOM).

## Review Focus

1. **Task senza risorse o con `soldHours` 0** — nessun `NaN` in `newPhasing`/`newPlanning`, il task non riceve quota; test nel Task 2 (`zero-resource task yields no NaN`).
2. **Distribuzione mensile valida con percentuali 0 su tutti i mesi aperti** — quota in parti uguali, non persa; test nel Task 2 (`distribution with zero open-month percentages splits evenly`).
3. **Riga senza `date`** — scartata come oggi, senza eccezioni; coperta nel test del Task 2 `ignores rows without a date`.
4. **Maiuscole/spazi diversi nel nome del task** (`Overall coordination` vs `Overall Coordination`) — la riga si abbina; coperto dallo scenario BERMITS del Task 2.
5. **Arrotondamento ore** — `distributeHoursExact` lancia se la somma diverge di oltre 0,05: va chiamato col totale calcolato dagli stessi valori; coperto dallo scenario BERMITS (87,25 h esatte).

---

### Task 1: Characterization test del comportamento che resta

**Files:**
- Test: `js/lib/config-form-calc.test.js` (dentro `describe('reforecastDistribution')`)

**Interfaces:**
- Consumes: `reforecastDistribution` attuale.
- Produces: il test `characterization: no overrun, no distribution, no current-month rows`, che deve restare verde dopo il Task 2.

- [ ] **Step 1: Scrivi il test**

Fixture: mesi `['202601','202602','202603','202604']`, `currentYm = '202603'`.
- Task `Dev`, `20260101`–`20260430`, `[{ role: 'Developer', soldHours: 40, hourlyRate: 100 }]`.
- Task `QA`, `20260201`–`20260430`, `[{ role: 'Tester', soldHours: 20, hourlyRate: 50 }]`.
- Righe: `Dev/Developer 2026-01-10 10h`, `Dev/Developer 2026-02-10 5h`, `QA/Tester 2026-02-12 4h`.

```js
expect(r.newPhasing).toEqual({ '202601': 1000, '202602': 700, '202603': 1650, '202604': 1650 });
expect(r.newPlanning).toEqual({ '202601': 10, '202602': 9, '202603': 20.5, '202604': 20.5 });
```

- [ ] **Step 2: Eseguilo sul codice attuale**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: PASS (fissa il comportamento di oggi). Se fallisce, correggi la fixture o i valori attesi, non il codice.

- [ ] **Step 3: Commit**

```bash
git add js/lib/config-form-calc.test.js
git commit -m "test(reforecast): characterization of the no-overrun case"
```

### Task 2: `reforecastDistribution` a residuo netto

**Files:**
- Modify: `js/lib/config-form-calc.js:86-201`
- Test: `js/lib/config-form-calc.test.js`

**Interfaces:**
- Consumes: `distributeHoursExact(total, rawValues)` da `./cfg-parse.js`; `round(v, digits)` locale.
- Produces: risultato `{ newPhasing, newPlanning, distError: null, remainingBudget, remainingHours, distributedRemainingHours, pastMonths, futureMonths, consumedBudget, consumedHours, soldBudget, soldHours, overBudget, overHours }`. `remainingBudget`/`remainingHours` = residuo netto (≥ 0); `overBudget` = `consumedBudget > soldBudget`, `overHours` = `consumedHours > soldHours`.

- [ ] **Step 1: Sostituisci i due test che cambiano significato e scrivi i nuovi**

Data riga: `{ task, role, date: 'YYYY-MM-15', hours }` salvo dove indicato. Tutti i task hanno `billable: true`.

- `caps past actuals…` → **`writes true actuals for an overrun task`**: fixture invariata (Dev 5h @100, riga 20h a gennaio, mesi `['202601']`, current `'202602'`). `newPlanning['202601']` = 20, `newPhasing['202601']` = 2000, `overBudget` true, `remainingBudget` 0.
- `returns a distError…` → **`distributes the share by the open-month percentages`**: Dev 100h @10, `20260101`–`20260331`, distribuzione `{202601:20, 202602:30, 202603:50}`, mesi 01–03, current `'202602'`, riga gennaio 10h. `distError` null; `newPhasing` = `{ '202601': 100, '202602': 337.5, '202603': 562.5 }`; `newPlanning['202602'] + newPlanning['202603']` = 90.
- **`nets an overrun against another task's margin`**: Dev 10h @100 e QA 20h @50, entrambi `20260101`–`20260331`, mesi 01–03, current `'202603'`. Righe: Dev gennaio 15h, QA febbraio 4h. `newPhasing` = `{ '202601': 1500, '202602': 200, '202603': 300 }`, `newPlanning['202603']` = 11, `remainingBudget` 300, `remainingHours` 11.
- **`splits the net remaining in proportion to each task's margin`**: mesi 01–03, current `'202602'`. A 40h @100 `20260101`–`20260228`; B 20h @100 `20260101`–`20260331`; C 10h @100 `20260101`–`20260131`. Righe gennaio: A 10h, B 10h, C 20h. Attesi: `newPhasing['202602']` = 2625, `newPhasing['202603']` = 375, `newPlanning['202602']` = 26.25, `newPlanning['202603']` = 3.75.
- **`project overrun leaves open months empty`**: Dev 10h @100, `20260101`–`20260228`, mesi 01–02, current `'202602'`, riga gennaio 15h. `newPhasing` = `{ '202601': 1500 }`, `overBudget` e `overHours` true, `consumedBudget` 1500, `soldBudget` 1000, `remainingBudget` 0.
- **`counts current-month actuals in their month`**: Dev 20h @100, `20260101`–`20260228`, mesi 01–02, current `'202602'`, riga febbraio 5h. `newPhasing` = `{ '202602': 2000 }`, `newPlanning` = `{ '202602': 20 }`, `remainingHours` 15.
- **`values a missing role at the task's first resource rate`**: Dev `[Developer 10h @100, Senior 5h @150]`, `20260101`–`20260228`, mesi 01–02, current `'202602'`, riga gennaio ruolo `Intern` 2h. `newPhasing['202601']` = 200, `consumedBudget` 200.
- **`moves an ended task's margin to the open tasks`**: mesi 01–02, current `'202602'`. A 10h @100 `20260101`–`20260131`, riga gennaio 4h; B 10h @100 `20260101`–`20260228`, nessuna riga. `newPhasing['202602']` = 1600, `newPlanning['202602']` = 16.
- **`spreads the net remaining over open project months when no task can receive it`**: solo A del caso precedente. `newPhasing['202602']` = 600, `newPlanning['202602']` = 6.
- **`counts rows outside the months without writing them`**: Dev 10h @100, `20260101`–`20260228`, mesi 01–02, current `'202601'`, riga `2025-12-10` 3h. `newPhasing` senza chiave `'202512'`; `consumedHours` 3; `newPlanning['202601'] + newPlanning['202602']` = 7.
- **`zero-resource task yields no NaN`**: aggiungi al caso `counts current-month actuals…` un task `Empty` con `resources: []` e una riga `Empty/x` 1h. Ogni valore di `newPhasing`/`newPlanning` è finito; `newPhasing` = `{ '202602': 2000 }` e `newPlanning` = `{ '202602': 20 }` (la sua ora conta nel consumato e nel mese, `remainingHours` scende a 14).
- **`distribution with zero open-month percentages splits evenly`**: Dev 100h @10, distribuzione `{202601:100, 202602:0, 202603:0}`, mesi 01–03, current `'202602'`, nessuna riga. `newPhasing` = `{ '202602': 500, '202603': 500 }`.
- **`ignores rows without a date`**: caso `counts current-month actuals…` più una riga `Dev/Developer` senza `date`, 50h. Risultato identico al caso senza quella riga.
- **`BERMITS Maintenance 2026: past = actuals, open = net remaining`**: mesi `202512`…`202612`, current `'202611'`, `digits` 2. Tutti i task `20251201`–`20261231`, distribuzione `{}`:
  - `Overall Coordination`: `[HWGACCSVS - DIRECTOR 20h @168]`
  - `Project Management`: `[HWGINTERN - ACCSVS 40h @130, HWGACCSVS - DIRECTOR 75h @130, HWGACCSVS - MARKETING COORDINATOR 5h @130]`
  - `Content Management`: `[HWGDEV - DEVELOPER 10h @115, CPROD - HWGCREAT - CONTENT SPECIALIST 282h @115]`
  - `FE / BE Development`: `[HWGDEV - DEVELOPER 32h @100]`
  - `Quality Assurance`: `[HWGINTERN - ACCSVS 7.5h @105, HWGACCSVS - DIRECTOR 24.5h @105]`
  - `Artwork for QR Code`: `[CPROD - HWGCRSVS - STUDIO DIRECTOR 8h @115]`

  Righe aggregate `[task, role, ym, hours]` (date `ym` → `YYYY-MM-15`), estratte dal DB il 2026-11-05:

  ```js
  const BERMITS_ROWS = [["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202512",0.5],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202602",1.25],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202604",0.75],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202606",1.5],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202607",1],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202608",2],["Artwork for QR Code","CPROD - HWGCRSVS - STUDIO DIRECTOR","202609",1],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202512",5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202601",10.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202602",8.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202603",20.25],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202604",26.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202605",33],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202606",24],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202607",14.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202608",21.75],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202609",7.5],["Content Management","CPROD - HWGCREAT - CONTENT SPECIALIST","202610",21],["Content Management","HWGDEV - DEVELOPER","202607",9],["FE / BE Development","HWGDEV - DEVELOPER","202512",2],["FE / BE Development","HWGDEV - DEVELOPER","202602",13],["FE / BE Development","HWGDEV - DEVELOPER","202603",9],["FE / BE Development","HWGDEV - DEVELOPER","202604",8.5],["FE / BE Development","HWGDEV - DEVELOPER","202605",7],["FE / BE Development","HWGDEV - DEVELOPER","202606",4],["FE / BE Development","HWGDEV - DEVELOPER","202607",9],["FE / BE Development","HWGDEV - DEVELOPER","202608",5],["FE / BE Development","HWGDEV - DEVELOPER","202609",2.5],["FE / BE Development","HWGDEV - DEVELOPER","202610",6],["Overall coordination","HWGACCSVS - DIRECTOR","202512",0.5],["Overall coordination","HWGACCSVS - DIRECTOR","202601",1.5],["Overall coordination","HWGACCSVS - DIRECTOR","202602",1],["Overall coordination","HWGACCSVS - DIRECTOR","202603",1.5],["Overall coordination","HWGACCSVS - DIRECTOR","202604",4],["Overall coordination","HWGACCSVS - DIRECTOR","202605",4],["Overall coordination","HWGACCSVS - DIRECTOR","202606",4],["Overall coordination","HWGACCSVS - DIRECTOR","202607",2],["Overall coordination","HWGACCSVS - DIRECTOR","202608",0.5],["Overall coordination","HWGACCSVS - DIRECTOR","202609",3],["Overall coordination","HWGACCSVS - DIRECTOR","202610",0.5],["Project Management","HWGACCSVS - DIRECTOR","202604",6],["Project Management","HWGACCSVS - DIRECTOR","202605",13.5],["Project Management","HWGACCSVS - DIRECTOR","202606",4.5],["Project Management","HWGACCSVS - DIRECTOR","202607",7.5],["Project Management","HWGACCSVS - DIRECTOR","202608",6.5],["Project Management","HWGACCSVS - DIRECTOR","202609",9.5],["Project Management","HWGACCSVS - DIRECTOR","202610",7],["Project Management","HWGACCSVS - MARKETING COORDINATOR","202607",2.5],["Project Management","HWGACCSVS - MARKETING COORDINATOR","202608",2],["Project Management","HWGINTERN - ACCSVS","202512",2.25],["Project Management","HWGINTERN - ACCSVS","202601",6.5],["Project Management","HWGINTERN - ACCSVS","202602",15],["Project Management","HWGINTERN - ACCSVS","202603",13],["Quality Assurance","HWGACCSVS - DIRECTOR","202606",13.5],["Quality Assurance","HWGACCSVS - DIRECTOR","202609",1],["Quality Assurance","HWGACCSVS - DIRECTOR","202610",0.5],["Quality Assurance","HWGINTERN - ACCSVS","202512",0.25],["Quality Assurance","HWGINTERN - ACCSVS","202601",3.75],["Quality Assurance","HWGINTERN - ACCSVS","202602",0.5],["Quality Assurance","HWGINTERN - ACCSVS","202603",3]];
  ```

  Attesi: somma di `newPhasing` sui mesi `< '202611'` ≈ 49340 (`toBeCloseTo(…, 2)`), somma di `newPlanning` sugli stessi = 416.75; `newPhasing['202611'] + newPhasing['202612']` ≈ 10680, `newPlanning['202611'] + newPlanning['202612']` = 87.25; `remainingBudget` ≈ 10680, `overBudget` false.

- [ ] **Step 2: Verifica che falliscano**

Run: `npx vitest run js/lib/config-form-calc.test.js`
Expected: FAIL sui test nuovi e sostituiti; il characterization del Task 1 resta PASS.

- [ ] **Step 3: Riscrivi `reforecastDistribution`**

Segui la Spec §2, punti 1–8. Gli unici punti che signature e test non decidono:
- il rateMap tiene per ogni task anche `first` = `resources[0]?.hourlyRate ?? 0`;
- ore ed euro usano due mappe di margine e due quote distinte;
- open months del task = `futureMonths` filtrati con `taskStartYM`/`taskEndYM` come oggi (`task.startDate.slice(0,6)`, fallback `months[0]` / `months[months.length-1]`);
- il blocco finale con `distributeHoursExact` si applica a tutti i `futureMonths` presenti in `newPlanning` (actuals del mese corrente inclusi), come a `:190-198`.

- [ ] **Step 4: Verifica che passino**

Run: `npx vitest run js/lib/config-form-calc.test.js js/lib/cfg-parse.test.js`
Expected: PASS, characterization compreso.

- [ ] **Step 5: Commit**

```bash
git add js/lib/config-form-calc.js js/lib/config-form-calc.test.js
git commit -m "fix(reforecast): true actuals in the past, project net remaining in open months"
```

### Task 3: Messaggio di conferma, cache-busting, caso di test manuale

**Files:**
- Modify: `project-config.html:516` (`?v=6` → `?v=7`), `project-config.html:1472-1478` (messaggio)
- Modify: `TEST_CASES.md` (nuova riga nella tabella `PC-*`, numero successivo all'ultimo `PC-` esistente)

**Interfaces:**
- Consumes: `consumedBudget`, `soldBudget`, `consumedHours`, `soldHours`, `overBudget`, `overHours`, `remainingBudget`, `distributedRemainingHours` dal Task 2.

- [ ] **Step 1: Riscrivi il messaggio**

Testo esatto (Spec §3), con `fmtB`/`fmtH` esistenti:

```
Phasing and planning grids will be fully overwritten:

Months with actuals — replaced with actual spend & hours from loaded XLS data
Current & future months (${futureCount}) — net remaining distributed per task settings ${distNote}:
  Remaining budget: ${fmtB(result.remainingBudget)}${overB}
  Remaining hours: ${fmtH(result.distributedRemainingHours)}${overH}
```

`distNote` = la parentesi di oggi (`(N task(s) use monthly distribution)` / `(even split)`); `overB` = `result.overBudget ? \` (over budget: ${fmtB(result.consumedBudget)} consumed of ${fmtB(result.soldBudget)} sold)\` : ''`; `overH` analogo con `over hours` e `fmtH`. `pastCount` non serve più: rimuovilo se resta inutilizzato.

- [ ] **Step 2: Bump e riga di test**

`project-config.html:516` → `js/lib/config-form-calc.js?v=7`. Riga `TEST_CASES.md`: "Reforecast nets overruns (2026-11-05)" — passi: su *BERMITS Maintenance 2026* clic su "Reforecast from actuals"; atteso: il messaggio dice Remaining budget 10.680,00 € e 87.25 h, e dopo la conferma i mesi dic–ott sommano 49.340 € / 416,75 h e nov + dic 10.680 € / 87,25 h; non salvare; colonna esito vuota.

- [ ] **Step 3: Verifica**

Run: `grep -rn "config-form-calc.js?v=" --include=*.html . | grep -v worktrees` → una sola riga, `?v=7`.
Run: `npx vitest run js/lib/project-config-ptc-phasing-guard.test.js js/lib/project-config-layout-guard.test.js js/lib/test-cases-parse.test.js js/lib/config-form-calc.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add project-config.html TEST_CASES.md
git commit -m "feat(project-config): Reforecast message shows the net remaining and project overrun"
```

## Decisioni aperte

1. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: tre task sequenziali su tre file, nessuna migrazione né API (§6.1, ciclo piccolo).
2. **Risk class `high-risk`.** Alternativa scartata: `standard`. Perché: la funzione calcola importi money scritti nel progetto; nel dubbio la classe più alta (§6.1b).
3. **Fixture BERMITS aggregata per task, ruolo e mese dentro il test.** Alternativa scartata: le 337 righe grezze. Perché: stesso totale per mese, test leggibile.
