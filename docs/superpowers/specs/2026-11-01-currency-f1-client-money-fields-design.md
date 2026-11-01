# Spec — finding valute, ciclo f1: i campi soldi lato client

**Brief started:** 2026-11-01 19:45
**Brief:** `docs/superpowers/briefs/2026-11-01-currency-f1-client-money-fields-brief.md` (audit-fix, F-04 di `docs/superpowers/audits/2026-11-01-currency-c1-c4-cold-review.md`; righe B-196, B-197, B-204, B-205, B-210, B-216 di `docs/BACKLOG.md`).
Design concordato in chat il 2026-11-01 (una fermata, §6b).

## 1. Scope

Probe del 2026-11-01 su `js/lib/money.js` (node, import diretto del modulo):
- `readMoneyInput(formatMoney(1234567.5,'INR'),'INR')` → `NaN`; EUR, USD, CHF, JPY rileggono il proprio `formatMoney`.
- `readMoneyInput('1 50','EUR')` e `readMoneyInput('15€0','EUR')` → `150`; in fr-FR `'12 34 567,5'` → `1234567.5` (gruppi non controllati).
- `formatMoneyInput(108.7654,'EUR')` → `108,77`.

Il DB principale non ha tariffe, override, POT o PTC con più decimali della valuta; ha 8 valori di `projects.phasing` su 68 con rumore float (es. `1120.304347826087`), scritti da `deriveDistribution`/`reforecastDistribution` (`js/lib/config-form-calc.js`). Quel difetto è B-217, fuori da questo ciclo (§8).

## 2. `readMoneyInput`: lettura stretta (B-196, B-197)

- Toglie il simbolo o il codice ISO della valuta **solo in testa o in coda**, con gli spazi adiacenti, e gli spazi esterni. Un simbolo o uno spazio fra le cifre (fuori dal separatore delle migliaia) dà `NaN`.
- Separatore delle migliaia dal locale, come oggi. Se è uno spazio, valgono come separatore lo spazio normale, U+00A0 e U+202F; il controllo dei gruppi si applica anche lì. Un apostrofo accetta `'` e `’`, come oggi.
- La dimensione del gruppo secondario si ricava da `Intl` (formato di 1234567, lunghezza dei gruppi). La parte intera è `\d+` oppure `\d{1,P}(?:G\d{P})*G\d{3}`: P=3 per i locali a gruppi da 3, P=2 per il raggruppamento indiano.
- Più decimali della valuta danno `NaN`, come oggi.
- `parseMoney` e `stripDecoration` non cambiano (B-012 fuori scope).

## 3. Lo 0 salvato: `keepZero` (B-205)

`formatMoneyInput(amount, code, currencies, { keepZero = false } = {})`: con `keepZero`, un importo finito uguale a 0 dà `'0'`; `null`/`''` danno `''` come oggi. I campi che oggi scrivono la regola a mano la chiamano con l'opzione:
- `costgrid.html` `onRateFocus` (solo per un ruolo custom, come oggi);
- `master-roles.html` `amountText`, `onMoneyFocus`;
- `master-pipelines.html` `amountText` del form POT e il focus del POT;
- `master-clients.html` `amountText`, `onRcFocus`.

## 4. Un valore non toccato resta com'è (B-204)

`readMoneyInput(text, code, currencies, { stored } = {})`: se la lettura dà un numero uguale a `stored` arrotondato ai decimali della valuta, restituisce `stored` invece del numero letto. Vale per il testo a riposo (`€ 108,77`) e per quello al focus (`108,77`). Al focus il campo mostra il valore arrotondato, come oggi.

I chiamanti passano `stored` dove oggi un salvataggio rinvia il valore arrotondato:
- `project-config.html`: tariffa risorsa (`onResRateBlur`), PTC e phasing (§5);
- `master-roles.html`: tariffa EUR e override, al focus/blur e al salvataggio — il form tiene gli importi salvati del ruolo aperto;
- `master-clients.html`: voci della rate card, al focus/blur e al salvataggio — ogni riga tiene gli importi salvati;
- `master-pipelines.html`: importo del POT.

`costgrid.html` scrive la tariffa e il PTC solo su `@input`, quindi non riceve `stored`.

## 5. PTC e phasing su `readMoneyInput` (B-216)

- **PTC del cost grid** (`costgrid.html`): stesso schema della cella tariffa della pagina — testo non valido segnalato (`is-invalid`, title `Format: <moneyFormatExample>`), `task.ptc` non scritto; al blur con testo non valido il campo torna al valore salvato; blank → 0. La lettura resta a ogni tasto (B-201 fuori scope). Il metodo `parseMoneyInput` sparisce.
- **PTC e phasing di `project-config.html`**: stesso schema di `onResRateBlur` — testo non valido conservato e segnalato, nulla scritto; blank → PTC 0, mese di phasing cancellato; il blocco del salvataggio che oggi controlla `rateInvalid` copre anche questi campi, con la stessa chiave che si sposta quando una riga PTC viene rimossa. Il metodo `parseMoney` della pagina sparisce.

## 6. Modale rate card (B-210)

- Il messaggio di successo porta un contatore: il timer di 3 secondi lo cancella solo se nessun salvataggio successivo l'ha sostituito.
- `loadAll` non carica più `Api.roles.list()` e non popola `this.roles`; si rimuove anche la proprietà `roles` dai dati, verificato che nessun altro punto della pagina la legga.

## 7. Cache-busting e test

- Ogni riferimento a `js/lib/money.js` passa a `?v=4`, compreso l'import in `js/lib/costgrid-calc.js` (B-200); i riferimenti a `js/lib/costgrid-calc.js` in `costgrid.html` e `pipeline.html` si aggiornano di conseguenza.
- `js/lib/money.test.js`: round-trip, rifiuti, `stored`, `keepZero` (criteri 1-3).
- `js/lib/money-guard.test.js`: niente regola dello 0 a mano nelle pagine, niente `parseMoney(` in `costgrid.html`/`project-config.html`, `moneyFormatExample` sui campi PTC e phasing (criteri 4-5).
- Documentazione: `docs/js/lib.md` (`money.js`) e la sezione "Money formatting and parsing" di `CLAUDE.md`, che oggi elenca PTC e phasing fra i campi ancora su `parseMoney`.

## 8. Scope escluso

- Validazione server di PTC e phasing (B-185, ciclo f2).
- **B-217** (nuovo, da questo brainstorming): Derive e Reforecast scrivono il phasing senza arrotondarlo ai decimali della valuta. Va in `docs/BACKLOG.md` e nel brief f2, che deve deciderne il trattamento prima di validare il phasing.
- B-201, B-203, B-206, B-199, B-198, B-209, B-012 (come nel brief).

## Criteri di accettazione

1. **Round-trip** — un test verifica che `readMoneyInput(formatMoney(x, c), c)` restituisca `x` per EUR, USD, CHF, JPY e INR, con valori sopra 1,00,000.
2. **Rifiuti** — un test verifica che `1 50` e `15€0` in EUR diano `NaN` e che `12 34 567,5` in fr-FR dia `NaN`.
3. **Valore non toccato** — un test verifica che `readMoneyInput` con `stored: 108.7654` restituisca `108.7654` sia per il testo di `formatMoneyInput` sia per quello di `formatMoney`, e un numero diverso per un testo diverso.
4. **Regola dello 0 in un punto** — un test pinna che nessuna pagina contenga la regola dello 0 scritta a mano e che `formatMoneyInput(0, …, { keepZero: true })` dia `'0'`.
5. **PTC e phasing** — un test pinna che `costgrid.html` e `project-config.html` non chiamino `parseMoney(` e che i campi PTC e phasing mostrino `moneyFormatExample` su testo non valido.
6. **Verifica nel browser** — in `project-config.html`, un testo illeggibile nel phasing o nel PTC resta segnalato e blocca il salvataggio; nel PTC del cost grid torna al valore salvato al blur; in `master-roles.html` una tariffa INR sopra 1,00,000 si salva senza essere riscritta.
7. **Backlog** — le righe B-196, B-197, B-204, B-205, B-210 e B-216 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
8. **Suite** — `npm test` passa.

## Decisioni aperte

1. **B-204 con un confronto di valore (`stored`), il valore arrotondato mostrato al focus.** Alternativa scartata: mostrare al focus tutti i decimali salvati, o tracciare "testo modificato" in ogni pagina. Perché: una cella di phasing mostrerebbe `1120,304347826087`, e lo stato per pagina ripeterebbe in 5 pagine quello che una regola di `money.js` fa una volta; chi riscrive a mano il valore arrotondato mantiene quello salvato.
2. **Il valore preservato non viene arrotondato in f1.** Alternativa scartata: arrotondarlo al salvataggio. Perché: una tariffa con decimali in eccesso (0 righe oggi) prende `MONEY_RULE` se rinviata, il phasing rumoroso è accettato fino a f2, che decide insieme a B-217.
3. **`keepZero` è un'opzione di `formatMoneyInput`.** Alternativa scartata: `'0'` sempre. Perché: dove 0 vuol dire "nessuno" (tariffa risorsa, PTC, phasing, ruolo costgrid non custom) il campo deve restare vuoto.
4. **Il PTC del cost grid continua a leggere a ogni tasto.** Alternativa scartata: leggere al blur. Perché: è B-201, fuori scope; cambia solo il parser.
5. **Testo non valido nel PTC del cost grid: al blur torna al valore salvato.** Alternativa scartata: conservarlo segnalato come in `project-config.html`. Perché: il cost grid si salva da solo, non c'è un salvataggio da bloccare, e la cella tariffa della stessa pagina fa già così.
6. **B-217 solo in backlog e nel brief f2.** Alternativa scartata: arrotondare l'uscita di Derive/Reforecast qui. Perché: è un finding nuovo (PROCESS.md, Scenario 3).
