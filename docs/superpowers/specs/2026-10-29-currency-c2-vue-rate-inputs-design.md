# Spec — valute nei form, ciclo 2: tariffe e importo POT sotto `money.js` nelle pagine Vue

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-currency-c2-vue-rate-inputs-brief.md` (Scenario 3, audit-fix, finding M-01, M-02, M-03 di `docs/superpowers/audits/2026-10-29-currency-forms-audit.md` per `costgrid.html`, `project-config.html`, `master-roles.html`, `master-pipelines.html`).
Design concordato in chat il 2026-10-29 (una fermata, §6b).

## 1. Scope

- **M-01:** ogni campo tariffa e l'importo POT delle quattro pagine diventa `type="text"`, formattato al focus e al blur con la valuta del contesto, e letto con `readMoneyInput` (§2).
- **M-02:** i decimali ammessi e mostrati sono quelli della valuta; `resolveRoleRate` arrotonda la tariffa convertita ai decimali della valuta di destinazione.
- **M-03:** ogni tariffa mostrata accanto a questi campi passa per `formatMoney`/`currencyInfo`.
- L'avviso "Missing rate" del cost grid non compare per uno 0 custom (input dal ciclo 1, decisione 9).
- La regola "Money formatting and parsing" di CLAUDE.md perde l'eccezione per le tariffe `type="number"`, e una guardia la pinna.

Fuori scope: le esclusioni del Brief (rate card di `master-clients.html` e `js/ratecards.js`: ciclo 3; validazione server: ciclo 1; B-183: ciclo 4; ore, tassi di cambio, percentuali) e il passaggio del PTC e del phasing a `readMoneyInput` (decisione 4).

## 2. `js/lib/money.js` — `readMoneyInput`

Export nuovo, puro, con bridge `window.readMoneyInput`. `parseMoney` non cambia.

`readMoneyInput(text, code, currencies)`:
- `null` se `String(text ?? '').trim()` è vuoto;
- `NaN` se il testo non è valido per il locale di `code`;
- altrimenti il numero.

Un testo è valido quando, tolti simbolo, codice ISO e spazi come in `parseMoney`:
- contiene solo cifre, il separatore delle migliaia e il separatore decimale del locale (`separators(locale)`), con al più un separatore decimale;
- non è negativo (un `-` lo rende non valido);
- se contiene separatori delle migliaia, ognuno sta nella parte intera ed è seguito da esattamente 3 cifre, e il primo gruppo ha da 1 a 3 cifre;
- ha al più `currencyInfo(code).digits` cifre dopo il separatore decimale.

Così `107.5` in EUR (it-IT) e `175,5` in USD (en-US) sono `NaN`, non 1075 e 1755. `1.075` in EUR resta valido e vale 1075: il blur lo riformatta in `€ 1.075,00`.

## 3. I campi

L'esempio di formato usato in tutti i messaggi (`<esempio>`) è `formatMoney(1234.5, code, currencies)` senza il prefisso `${currencyInfo(code).symbol} `: `1.234,50` in EUR, `1,234.50` in USD (decisione 13).

### 3.1 `costgrid.html` — tariffa del ruolo (valuta: `draft.currency || 'EUR'`)

Sul modello del PTC (`ptcFocusedTask`/`ptcRaw`), con `rateFocusedRole`/`rateRaw`/`rateInvalid` nel `data`:
- `:value` mostra `rateRaw` quando il campo ha il focus, altrimenti `formatMoney(r.rate, …)`;
- **focus:** `rateRaw = formatMoneyInput(r.rate, …)` (per una tariffa 0 il testo è vuoto);
- **input:** `rateRaw = testo`; `v = readMoneyInput(testo, …)`. Se `v` è un numero: `role.rate = v`, `role.rateIsCustom = v !== roleBaseline(role).effectiveRate`, `rateInvalid = false`, `cgScheduleAutoSave()`. Se `v` è `NaN`: `rateInvalid = true`, nessuna scrittura. Se `v` è `null`: `rateInvalid = false`, nessuna scrittura;
- **blur:** testo vuoto → `resetRoleRate(role)` (comportamento di oggi); poi `rateFocusedRole = null`, `rateRaw = ''`, `rateInvalid = false`, così il campo torna a mostrare l'ultimo valore valido.
- Mentre `rateInvalid` è vero, l'input porta `is-invalid` e lo slot della nota (`cg-rate-note`) mostra `Format: <esempio>` al posto di "Custom · reset"/"Missing rate".
- `onRateChange` viene sostituito da questi handler.

### 3.2 `project-config.html` — `hourlyRate` delle risorse (valuta: `project.currency`)

Sul modello del phasing (handler inline su `e.target.value`), con lo stato di invalidità nel `data` del componente (`rateInvalid`, un oggetto con chiave `` `${ti}-${ri}` ``), mai sull'oggetto risorsa che viene inviato all'API:
- `:value` mostra `formatMoney(res.hourlyRate, …)` se > 0, altrimenti `''`;
- **focus:** `e.target.value = moneyInput(res.hourlyRate)`;
- **blur:** `v = readMoneyInput(...)`. `null` → `res.hourlyRate = 0` (decisione 6 del ciclo 1). Numero → `res.hourlyRate = v`. `NaN` → nessuna scrittura e `is-invalid` con `title="Format: <esempio>"`, finché il campo non viene corretto. In ogni caso valido il testo è riformattato con `formatMoney`.

### 3.3 `master-roles.html` (base: EUR; override: la valuta del campo)

Il form tiene il testo: `rf.rateText` e `rf.overrideTexts[code]`, inizializzati in `openRoleForm` con `formatMoneyInput`. Focus/blur riformattano il testo (`formatMoneyInput` al focus, `formatMoney` al blur se valido). In `saveRole`:
- base: `readMoneyInput(rf.rateText, 'EUR', this.currencies)`; `null` → `rf.error = 'Default rate is required.'`; `NaN` → `rf.error = 'Enter a valid amount in EUR, e.g. <esempio>.'`;
- ogni override: `null` → nessun override; `NaN` → stesso messaggio con il codice della valuta; un numero (0 compreso) → `rateOverrides[code] = v`;
- le valute sono `this.currencies` (decisione 11).
- Etichette: `Default rate ({{ symbol }}/h)` con `currencyInfo('EUR', currencies).symbol`; placeholder degli override: `'e.g. ' + formatMoneyInput(rate × current_rate, code, currencies)` dove `rate` è la base letta da `rf.rateText`.
- Tabella dei ruoli: `formatMoney(r.rate, 'EUR', currencies) + '/h'`; `fmtRate` viene eliminato. "⚠️ Not set" resta per `null` e 0.

Oggi un override 0 viene scartato (`if (v > 0)`); dal ciclo 1 il server accetta 0, e uno 0 scritto apposta diventa un override 0. Un override vuoto resta "nessun override".

### 3.4 `master-pipelines.html` — importo POT (EUR)

`potf.amountText` al posto di `potf.amount` nel form, inizializzato con `formatMoneyInput`; focus/blur come in §3.3. In `savePot`: `null` o `NaN` → `potf.error = 'Enter a valid amount in EUR, e.g. <esempio>.'`; un numero (0 compreso) va all'API come oggi. Etichetta `Target ({{ symbol }})`.

## 4. Valori mostrati in `costgrid.html` (M-03)

`formatMoney(…, draft.currency || 'EUR', currencies)` per: la nota "Custom · reset", il `title` dell'input, la voce di menu "Reset rate to", il badge del selettore dei ruoli (`row.effectiveRate`, ora `€ 135,00/h` — decisione 8). Il valore numerico in `:data-rate` resta il numero.

## 5. "Missing rate"

Nel cost grid la classe `is-zero` (cella della tariffa, header della colonna), la nota "Missing rate" della cella e quella dell'header compaiono solo per `(!r.rate || r.rate === 0) && !r.rateIsCustom`. Il badge del selettore dei ruoli non cambia (mostra il baseline del registro, non una tariffa custom).

## 6. `js/lib/costgrid-calc.js` — `resolveRoleRate`

`import { currencyInfo } from './money.js?v=N';` (stesso `N` di ogni altro riferimento, pinnato da `money-guard`). La tariffa convertita diventa `Number((eurRate * (currencyRate || 1)).toFixed(currencyInfo(currency).digits))`. Gli override del ratecard e del ruolo restano come sono. `money.js` e `costgrid-calc.js` cambiano, quindi ogni `?v=` che li cita viene aggiornato.

## 7. Guardia — `js/lib/money-guard.test.js`

Test nuovo: per ogni sorgente `*.html` e `js/**/*.js` non di test, ogni tag `<input …>` che contiene `type="number"` e, ignorando maiuscole, una delle parole `rate`, `amount`, `ptc`, `price`, `fee`, è un offender. Esenzione chiusa: `master-clients.html` e `js/ratecards.js`, con un commento che la assegna al ciclo 3. Il tag va letto fino al `>` di chiusura anche su più righe. Il commento del test dichiara il limite: `parseFloat` non è pinnato (decisione 9). Il test va visto fallire su un `type="number"` con `rate` reintrodotto prima di essere considerato valido.

## 8. Documentazione

- CLAUDE.md, "Money formatting and parsing": la regola sugli input dice di usare `readMoneyInput` per leggere il testo (vuoto, non valido, numero) e che le ore non ne fanno parte; l'eccezione per le tariffe `type="number"` scompare.
- `docs/js/lib.md`: `readMoneyInput` sotto `money.js`; `resolveRoleRate` arrotonda ai decimali della valuta.
- Le pagine toccate che hanno un file `docs/pages/` ricevono la loro nota da `/sync-docs`.

## 9. Test e verifica

- `js/lib/money.test.js`: `readMoneyInput` su vuoto/spazi (`null`), `abc`, `-5`, `12,345` in EUR (decimali in eccesso), `107.5` in EUR e `175,5` in USD (`NaN`), `1.234,50` in EUR (1234.5), `0` (0), `175.5` in USD e `107,5` in EUR, più `formatMoney` di questi ultimi (`$ 175.50`, `€ 107,50`), e `12.5` in JPY (`NaN`).
- `js/lib/costgrid-calc.test.js`: JPY con 0 decimali, USD con 2.
- La guardia del §7.
- `scripts/shoot.mjs` sulle quattro pagine, leggendo i PNG.

## Criteri di accettazione

1. **Nessun campo soldi `type="number"`** — nessun campo tariffa né l'importo POT in `costgrid.html`, `project-config.html`, `master-roles.html`, `master-pipelines.html` è `type="number"` (guardia del §7, `npm test`).
2. **Decimali della valuta** — `resolveRoleRate` dà 0 decimali per JPY e 2 per USD (`js/lib/costgrid-calc.test.js`).
3. **Parsing per locale** — `readMoneyInput('175.5', 'USD')` è 175.5 e `formatMoney` dà `$ 175.50`; `readMoneyInput('107,5', 'EUR')` è 107.5 e dà `€ 107,50`; `readMoneyInput('107.5', 'EUR')` è `NaN` (`js/lib/money.test.js`).
4. **Salvataggio nel cost grid** — in una versione USD, scrivere `175.5` in una tariffa e ricaricare mostra `$ 175.50`; in una versione EUR, `107,5` mostra `€ 107,50`; `107.5` in EUR mostra `Format: 1.234,50` e non cambia la tariffa (manuale).
5. **La guardia funziona** — un `type="number"` con `rate` reintrodotto fa fallire `js/lib/money-guard.test.js`.
6. **CLAUDE.md** — la sezione "Money formatting and parsing" non contiene più l'eccezione per le tariffe `type="number"`.
7. **0 voluto non è "mancante"** — nel cost grid una tariffa custom 0 su un ruolo con default > 0 mostra "Custom · reset" e non "Missing rate", senza lo sfondo rosso (manuale).
8. **Suite** — `npm test` e i test `node:test` di `api/` passano.

## Decisioni aperte

1. **Un helper puro in `money.js` e handler inline per pagina.** Alternativa scartata: un componente Vue `<money-input>` condiviso. Perché: master-roles e master-pipelines non caricano `cg-controls.js`, gli input di riferimento sono inline e i tre momenti di scrittura (input, blur, salvataggio) differiscono per pagina.
2. **Il testo nella convenzione dell'altra valuta è rifiutato con un messaggio.** Alternativa scartata: tenere la lettura rigida di `parseMoney`. Perché: `parseMoney('107.5', 'EUR')` dà 1075, un ×10 silenzioso su una tariffa.
3. **Troppi decimali sono rifiutati, non arrotondati.** Alternativa scartata: arrotondare come `parseMoney`. Perché: il server li rifiuta già (decisione 3 del ciclo 1).
4. **PTC e phasing non passano a `readMoneyInput` in questo ciclo.** Alternativa scartata: allinearli ora. Perché: fuori dallo scope del Brief; diventa un follow-up di `docs/BACKLOG.md`.
5. **Il cost grid legge la tariffa su `@input`.** Alternativa scartata: al blur/`@change` come oggi. Perché: è quello che il Brief chiede per l'autosave mentre si digita, sul modello del PTC.
6. **master-roles e master-pipelines leggono il testo al salvataggio.** Alternativa scartata: al blur. Perché: Enter salva prima del blur.
7. **"Missing rate" e `is-zero` solo per uno 0 non custom.** Alternativa scartata: lasciarli anche per uno 0 voluto. Perché: dal ciclo 1 uno 0 custom è una tariffa salvata e usata dal budget.
8. **Il badge del selettore dei ruoli usa il simbolo (`€ 135,00/h`), non il codice ISO della board 5.16.** Alternativa scartata: un formatter del solo numero in `money.js`. Perché: una sola funzione di formattazione; il codice ISO resta nell'header della colonna.
9. **La guardia pinna `type="number"`, non `parseFloat`.** Alternativa scartata: riconoscere anche `parseFloat` sulle tariffe. Perché: nel testo non si distingue dal `parseFloat` dei tassi di cambio (`current_rate`) e delle ore.
10. **La guardia copre tutti i sorgenti con un'esenzione chiusa per il ciclo 3.** Alternativa scartata: limitarla alle quattro pagine. Perché: il predicato copre anche le pagine future.
11. **master-roles usa `this.currencies`.** Alternativa scartata: impostare `window.__currencies`. Perché: `money.js` prende la lista come argomento.
12. **In master-roles un override 0 scritto apposta è salvato come override 0.** Alternativa scartata: scartarlo come oggi (`v > 0`). Perché: è emersa scrivendo la Spec, e segue la decisione M-04 del ciclo 1 (0 è una tariffa); vuoto resta "nessun override".
13. **L'esempio di formato nei messaggi è `formatMoney(1234.5)` senza il simbolo.** Alternativa scartata: un esempio fisso. Perché: segue il locale della valuta del campo. Emersa scrivendo la Spec.
