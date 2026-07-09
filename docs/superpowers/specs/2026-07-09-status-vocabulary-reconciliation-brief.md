# Brief — Ciclo 1: Riconciliare il vocabolario di stato progetto in `cfgApplyPipelineRules` (F1, F2, F3)

**Fonte:** `docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`, finding F1, F2, F3.
**Scenario:** 3 — Audit → fix.

## Problema

`cfgApplyPipelineRules` (`js/core.js:391-421`) è l'unica funzione che decide quali status siano selezionabili nel dropdown Status di `project-config.html` per ciascuno stage pipeline, e sovrascrive interamente le opzioni statiche dell'HTML (`project-config.html:65`) ogni volta che viene eseguita — al caricamento del form (`js/config-form.js:105`) e a ogni cambio pipeline (`js/main.js:137`). Tre difetti indipendenti convivono nella stessa costruzione (`js/core.js:393-402`):

- **F1** — la lista per `Committed` (`['Started', 'Put on hold', 'Complete']`) esclude `Started At Risk`, mentre `Expected` e `Anticipated` lo includono entrambi. Nessuna decisione documentata in `PRD.md` giustifica l'asimmetria — verificato esplicitamente, non assunto.
- **F2** — ogni lista prodotta da questa funzione termina con `'Complete'` (senza "d"), ma `statusBadge`/`statusBadgeLarge` (`js/core.js:330-349`) e il filtro "progetti eleggibili" della vista Resource Planning (`js/planning.js:471`) cercano entrambi `'Completed'`. Conseguenza reale: un progetto marcato completo tramite questo dropdown non riceve mai il colore badge corretto (cade nello stile di default, uguale a "Not started yet") e non viene mai escluso dalla vista Planning.
- **F3** — la mappa `allowed` contiene chiavi (`'Started'`, `'Started at risk'`, `'On Hold'`) che non corrispondono a nessuno dei 5 pipeline stage validi (`SIP`/`Expected`/`Anticipated`/`Committed`/`Canceled`, `CLAUDE.md:231`) — voci morte, mai raggiungibili dal parametro `pipeline` reale. La somiglianza tra la chiave morta `'Started at risk'` e il valore di stato `'Started At Risk'` è la prova più forte di come sia nata l'asimmetria di F1: chi ha scritto la mappa sembra aver confuso il vocabolario degli stati con quello degli stage pipeline.

## Comportamento attuale

```js
// js/core.js:393-402
const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Complete'];
const allowed = {
  'SIP':              [],
  'Expected':         ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
  'Anticipated':      ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
  'Committed':        ['Started', 'Put on hold', 'Complete'],
  'Started':          ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
  'Started at risk':  ['Started', 'Started At Risk', 'Put on hold', 'Complete'],
  'On Hold':          ['Not started yet', 'Started At Risk', 'Put on hold', 'Complete'],
  'Canceled':         null, // keep value, disable
};
```

## Comportamento atteso

- `Committed` include `Started At Risk` tra le opzioni selezionabili, coerentemente con `Expected`/`Anticipated`.
- Ogni lista prodotta dalla funzione usa `'Completed'` (non `'Complete'`), allineata a `statusBadge`/`statusBadgeLarge` (`js/core.js:330-349`), al filtro di `js/planning.js:471`, e alla marcatura statica originale in `project-config.html:65`.
- La mappa `allowed` contiene solo chiavi corrispondenti ai 5 pipeline stage validi — le tre chiavi morte (`'Started'`, `'Started at risk'`, `'On Hold'`) vengono rimosse.
- Un progetto già salvato con status `'Complete'` (dato legacy, scritto prima del fix) continua a essere gestito in modo sensato — vedi Criteri di accettazione.

## Vincoli

- Nessuna modifica al comportamento di `SIP` (dropdown disabilitato, nessuna opzione) o `Canceled` (dropdown disabilitato, valore preservato) — entrambi verificati come intenzionali e corretti nell'audit (sezione "Ruled out").
- La funzione resta l'unica sorgente delle opzioni dinamiche del dropdown — non introdurre una seconda fonte di verità parallela.
- Tutto il testo user-facing deve restare in inglese (vincolo di progetto).

## Criteri di accettazione

- [ ] Con pipeline `Committed`, il dropdown Status include `Started At Risk` tra le opzioni.
- [ ] Selezionando/salvando "Completed" tramite il dropdown, il valore salvato è `'Completed'` — non `'Complete'`.
- [ ] Un progetto con `status: 'Completed'` mostra il badge navy corretto (`statusBadge`/`statusBadgeLarge`) ed è escluso dalla lista progetti eleggibili della vista Resource Planning (`js/planning.js:471`).
- [ ] La mappa `allowed` non contiene più le chiavi `'Started'`, `'Started at risk'`, `'On Hold'`.
- [ ] Caratterizzato esplicitamente (test o verifica manuale documentata) il comportamento per un progetto con dato legacy `status: 'Complete'` già salvato — deciso e verificato in `/brainstorming`/esecuzione, non lasciato implicito: come minimo, il dropdown deve gestire quel valore senza rompersi (oggi `sel.value = list.includes(currentStatus) ? currentStatus : ''` lo azzererebbe silenziosamente se `'Complete'` non è più nella lista).
- [ ] Nessuna regressione sul comportamento di `SIP`/`Canceled`.

## Scope escluso esplicitamente

- F4 (lock di "Generate Project" su versioni multi-progetto) — Ciclo 2, causa e file diversi.
- Qualunque redesign più ampio del vocabolario di stato oltre alla riconciliazione `Complete`/`Completed` e all'aggiunta di `Started At Risk` a `Committed`.
- Migrazione dati storici in massa (es. uno script che converte ogni `status: 'Complete'` esistente in DB a `'Completed'`) — a meno che emerga come necessità esplicita durante `/brainstorming` e venga isolata come proprio Brief.

## Isolamento dei nuovi finding (guardia obbligatoria)

Se durante `/brainstorming` o l'esecuzione di questo ciclo emerge un finding **non previsto** da questo Brief (non citato come F1/F2/F3 nell'audit `2026-07-09-proposal-project-status-lock-audit.md`), va sempre isolato e proposto come Brief a sé stante per un ciclo futuro — mai risolto di straforo in questo ciclo. Questa è la guardia dello Scenario 3 (`PROCESS.md` §2).
