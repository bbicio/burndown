# Brief — valute nei form, ciclo 4: le baseline del cost grid usano il tasso della versione (B-183)

**Tipo:** audit-fix (Scenario 3). Raggruppamento confermato dall'utente il 2026-10-29.
**Origine:** `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`, finding **M-08**, che corrisponde a **B-183** in `docs/BACKLOG.md`.
**Perché è un ciclo a sé:** M-08 riguarda il *valore* di una tariffa, non il suo formato. Tocca gli stessi chiamanti di `resolveRoleRate` del ciclo 2, ma è un problema diverso. L'handoff dell'audit chiedeva di tenerlo come finding separato.
**Sequenza:** ciclo 1 → ciclo 2 → ciclo 3 → ciclo 4 (questo). È indipendente dagli altri e può anche anticiparli.

## Problema

In una versione non EUR, l'editor del cost grid calcola la baseline di ogni ruolo non sovrascritto con `eurRate × currencies.current_rate`, cioè con il cambio live. Ma la versione si converte in EUR con il proprio tasso, `draft.currencyRate`, deciso dal server (`api/src/lib/version-rate.js`). Quando i due tassi divergono, la baseline usa un tasso che non è quello della versione. Di conseguenza sono sbagliati:
- il flag "Custom" (`costgrid.html:1602`);
- il valore di reset;
- il badge del selettore ruoli.

## Comportamento attuale

Per evidenze e righe vale il report. Ecco dove si legge `current_rate`:
- `costgrid.html:1166` (`roleModalRoleRow`);
- `costgrid.html:1591` (`roleBaseline`);
- `js/costgrid.js:359-361` (`cgSyncRoleRatesToBaseline`);
- `js/costgrid.js:381-383` (`cgPreviewRateChange`).

I percorsi di cambio valuta (`costgrid.html:1838,1911`) lo leggono solo come valore provvisorio, in attesa della risposta del server. Questo uso non è in discussione.

**Causa:** `resolveRoleRate` è più vecchio dello snapshot del tasso per versione. Quando il server è diventato il proprietario del tasso (B-176), i suoi chiamanti non sono stati spostati su `draft.currencyRate`.

## Comportamento atteso

- Le baseline dei ruoli, il flag "Custom", il reset e il badge del selettore ruoli di una versione si calcolano con il tasso della versione (`draft.currencyRate`).
- Durante un cambio valuta, l'anteprima delle nuove tariffe (`cgPreviewRateChange`) usa il tasso che la versione avrà. Quale sia quel valore prima della risposta del server lo decide il brainstorming: per esempio il `current_rate` come oggi, oppure la richiesta al server del tasso che verrà applicato.
- Una versione EUR non cambia comportamento (tasso 1).

## Vincoli

- Non si rimette in discussione la decisione del tasso lato server (`version-rate.js`, `refresh-rate`).
- Se il ciclo 2 è già stato fatto, `resolveRoleRate` arrotonda già ai decimali della valuta: questo ciclo cambia solo il tasso che gli viene passato.
- `js/costgrid.js` e `js/lib/costgrid-calc.js`, se toccato, hanno il `?v=N`: tutti i riferimenti vanno aggiornati.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test verifica la baseline di un ruolo con tariffa EUR 100, in una versione USD con `currencyRate` 1.10 mentre il `current_rate` di USD è 1.20: la baseline è 110, non 120.
2. `grep -n "current_rate" costgrid.html js/costgrid.js` restituisce solo i percorsi di cambio valuta, oppure quelli che la Spec giustifica per nome.
3. B-183 è chiuso in `docs/BACKLOG.md`.
4. `npm test` passa.

## Scope escluso esplicitamente

- Formato e decimali delle tariffe (ciclo 2), validazione server (ciclo 1), rate card (ciclo 3).
- B-184.
- Le tariffe già salvate come `rate_override` nelle versioni esistenti: questo ciclo non le ricalcola. Se il brainstorming trova che andrebbero ricalcolate, diventa un Brief a sé.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
