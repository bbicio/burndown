# Brief — valute nei form, ciclo 2: tariffe e importo POT sotto `money.js` nelle pagine Vue

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-10-29.
**Origine:** `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`, finding **M-01, M-02, M-03** per `costgrid.html`, `project-config.html`, `master-roles.html` e `master-pipelines.html`. La rate card di `master-clients.html` è nel ciclo 3.
**Decisione già presa (handoff `2026-10-29-currency-forms-audit-handoff.md`):** l'eccezione di CLAUDE.md per gli input tariffa `type="number"` si toglie. Le tre direzioni dell'handoff sono state confermate dall'utente in apertura dell'audit:
1. ogni tariffa è formattata nella valuta del proprio contesto;
2. i decimali ammessi sono quelli della valuta;
3. l'importo del POT è in EUR.

**Sequenza:** ciclo 1 server → ciclo 2 (questo) → ciclo 3 rate card → ciclo 4 B-183.

## Problema

Le tariffe e l'importo del POT sono gli unici importi modificabili che non passano per `js/lib/money.js` (M-01). I loro decimali sono scelti campo per campo (M-02). I valori mostrati accanto a questi campi hanno `€` scritto fisso, oppure un numero non formattato (M-03). Causa unica: le tariffe sono rimaste fuori dalla regola money quando il ciclo `f963069` ha convertito gli importi.

## Comportamento attuale

Per evidenze e righe vale il report (tabella "Field inventory"). In sintesi:
- **M-01:** `type="number"` con `parseFloat` in:
  - `costgrid.html:336` (`onRateChange`, `:1596-1603`);
  - `master-roles.html:128,133-136`;
  - `project-config.html:182` (`v-model.number`);
  - `master-pipelines.html:301-302`.
- **M-02:** i passi sono disomogenei:
  - `step="1"` in costgrid, nella tariffa EUR di master-roles e in project-config;
  - `step="0.01"` negli override di master-roles;
  - `step="1000"` nel POT.

  `resolveRoleRate` arrotonda sempre a 2 decimali (`js/lib/costgrid-calc.js:100`), e `fmtRate` di master-roles a 0 (`:349-351`). Nel DB ci sono già 7 tariffe con decimali in campi `step="1"`.
- **M-03:** valori non formattati o con `€` fisso:
  - `master-roles.html:127,170`;
  - `costgrid.html:337,338,479,594`, dove si legge `135 EUR/h` mentre la board 5.16 prevede `135.00 EUR/h`;
  - `master-pipelines.html:298`.

## Comportamento atteso

- Ogni campo tariffa e l'importo POT si comportano come gli input di riferimento (PTC di costgrid, phasing e PTC di project-config): `formatMoneyInput` al focus, `parseMoney` al blur, poi `formatMoney`, con il locale della valuta del contesto. Le valute di contesto sono queste:
  - in costgrid, la valuta della versione;
  - in project-config, la valuta del progetto;
  - in master-roles, EUR per la tariffa base e la valuta del campo per ogni override;
  - per il POT, EUR.
- I decimali ammessi e mostrati sono quelli della valuta. `resolveRoleRate` arrotonda la tariffa convertita ai decimali della valuta di destinazione, non a 2 fissi.
- Ogni tariffa mostrata accanto a questi campi passa per `formatMoney`/`currencyInfo`: baseline, badge, nota "Custom · reset", tooltip, tabella dei ruoli, etichette con il simbolo.
- **Vuoto, 0 e "mancante" restano distinti.** `formatMoneyInput` restituisce `''` per ≤ 0 e `parseMoney('')` restituisce 0. Il testo vuoto va quindi controllato prima del parsing, come `onRateChange` fa già oggi (`costgrid.html:1598`). Cosa significhino 0 e vuoto lo stabilisce la scelta del ciclo 1 su M-04.
- La sezione "Money formatting and parsing" di CLAUDE.md non contiene più l'eccezione per le tariffe.
- Una guardia, l'estensione di `js/lib/money-guard.test.js` o un test nuovo, fallisce quando un campo tariffa o importo torna a essere `type="number"` o viene letto con `parseFloat` fuori da `money.js`. Cosa esattamente riconosce lo fissa la Spec.

## Vincoli

- **Dipende dal ciclo 1:** la semantica di 0 (M-04) e i codici d'errore del server sono decisi lì.
- `master-roles.html` tiene le valute in `this.currencies` e non imposta `window.__currencies`: la Spec decide quale delle due usare.
- Il parsing di `money.js` è rigido: un testo nella convenzione dell'altra valuta dà 0. Il brainstorming decide se questo comportamento va bene per le tariffe o se serve un messaggio all'utente.
- L'autosave di costgrid deve continuare a funzionare mentre si digita. Il PTC lo ottiene facendo il parsing su `@input`, ed è una soluzione già accettata.
- `?v=N`: ogni `js/*.js` e `js/lib/*.js` toccato, `costgrid-calc.js` incluso, richiede di aggiornare tutti i riferimenti. Pinnano l'accordo `js/lib/foundations-guard.test.js` e `js/lib/money-guard.test.js`.
- Verifica visiva con `scripts/shoot.mjs` delle quattro pagine toccate, leggendo i PNG.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Nessun campo tariffa né l'importo POT in `costgrid.html`, `project-config.html`, `master-roles.html` e `master-pipelines.html` è `type="number"`. Ciascuno formatta al focus e al blur con la valuta del contesto. La guardia del punto 4 lo pinna.
2. Un test di `resolveRoleRate` verifica 0 decimali per JPY e 2 per USD.
3. In una versione USD, scrivere `175.5` in una tariffa salva 175.5 e mostra `$ 175.50`. In una versione EUR, `107,5` salva 107.5 e mostra `€ 107,50`. Va verificato a mano, o con un test se la Spec lo rende possibile.
4. La guardia di `money-guard.test.js`, o un test nuovo, fallisce su un campo tariffa `type="number"` reintrodotto.
5. CLAUDE.md non contiene più l'eccezione per le tariffe `type="number"`.
6. `npm test` e i test `node:test` di `api/` passano.

## Scope escluso esplicitamente

- La rate card di `master-clients.html` e `js/ratecards.js` (ciclo 3).
- La validazione server (ciclo 1) e B-183 (ciclo 4).
- Ore, tassi di cambio di `master-currencies.html`, percentuali della distribuzione mensile.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
