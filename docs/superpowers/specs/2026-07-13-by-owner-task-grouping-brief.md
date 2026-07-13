# Brief — By Owner: raggruppare per Task invece che per Ruolo

**Scenario:** 2 — Evoluzione di una feature esistente.

## Comportamento attuale

La vista By Owner di Resource Planning (`planning.html`, `js/planning.js`, `renderPortfolioPlanningByOwnerContent`) struttura i dati come **Owner → Progetto → Ruolo**:

- Il pivot a tre livelli viene costruito in `js/planning.js:1298-1401`. Il terzo livello raggruppa per `res.role` (`:1380-1382`):
  ```js
  if (!pm.roles[res.role]) pm.roles[res.role] = { sold: 0, actuals: 0, tbp: 0, weekData: {} };
  const rm = pm.roles[res.role];
  rm.sold += ownerSold; rm.actuals += ownerActuals; rm.tbp += ownerTbpH;
  ```
- Il render della riga di terzo livello mostra solo il nome del ruolo (`:1476-1487`), mai il nome del task:
  ```js
  Object.entries(pm.roles).sort((a, b) => a[0].localeCompare(b[0])).forEach(([role, rm]) => {
    ...
    <td ...>${esc(role)}</td>
    ...
  ```
- Il testo di aiuto in-app dichiara esplicitamente questa struttura (`:1505-1510`): *"The table is structured as **Owner → Project → Role**."*
- L'header di export CSV conferma lo stesso schema (`:1434`): `['Owner', 'Project', 'Role', 'Sold', 'From actuals', 'To be planned', ...]`.
- **Vincolo strutturale rilevante**: un singolo task può avere più risorse/ruoli assegnati (`task.resources[]`, iterato a `:1307`) — oggi ogni combinazione owner+task+ruolo confluisce nello stesso bucket "ruolo" del progetto, perdendo l'informazione su quale task specifico genera quelle ore.

Verificato durante l'audit del 2026-07-09 (`docs/superpowers/audits/2026-07-09-planning-by-owner-name-audit.md`, sezione "Ruled out"): questa struttura è comportamento intenzionale e documentato, non un bug.

## Comportamento atteso

La vista By Owner raggruppa il terzo livello per **Task** invece che per **Ruolo** — struttura **Owner → Progetto → Task** — per dare un'informazione più azionabile alla pianificazione: sapere su quale task specifico un owner sta spendendo ore, non il suo ruolo (che è un dato anagrafico già noto una volta identificata la persona).

## Vincoli

- **Un task può avere più ruoli assegnati** (`task.resources[]`): la nuova struttura deve decidere come rappresentare questo caso quando si raggruppa per task invece che per ruolo — questa è una decisione di design aperta, da risolvere in `/brainstorming`, non prescritta qui.
- Il cambiamento riguarda solo `renderPortfolioPlanningByOwnerContent` (vista By Owner) — non tocca `renderPortfolioPlanningByProjectContent` (vista By Project), che ha già la struttura Project→Task→Role→Owner corretta e verificata dall'audit.
- L'export CSV/dati (`exportRows`, header a `js/planning.js:1434`) deve restare coerente con la nuova struttura della tabella a schermo.
- Nessuna modifica alla logica di calcolo ore (sold/actuals/to-be-planned) o alla fonte dati (`timesheetData`) — solo alla chiave di raggruppamento del terzo livello.

## Criteri di accettazione

- [ ] La vista By Owner mostra, per ciascun owner e progetto, righe raggruppate per task invece che per ruolo.
- [ ] Il testo di aiuto in-app (`js/planning.js:1505-1510`) viene aggiornato per riflettere la nuova struttura "Owner → Project → Task".
- [ ] L'header di export CSV (`js/planning.js:1434`) riflette la nuova struttura.
- [ ] La decisione su come rappresentare un task con più ruoli è esplicitamente documentata nella Spec prodotta da `/brainstorming`, con motivazione.
- [ ] Nessuna regressione sui totali (sold/actuals/to-be-planned) a livello owner e progetto — devono continuare a quadrare con la somma dei nuovi raggruppamenti per task.

## Scope escluso esplicitamente

*(confermato con l'utente)*

- La vista By Project (`renderPortfolioPlanningByProjectContent`) — già corretta, non toccata.
- Il fix owner/role già completato in questo ciclo (mergiato su `main`, commit `6f48a12`) — non rientra qui.
- Qualunque redesign più ampio della UI di Resource Planning oltre al cambio della chiave di raggruppamento nella vista By Owner.
- Migrazione o modifica dei dati timesheet — questo Brief riguarda solo come i dati esistenti vengono aggregati/visualizzati, non come vengono raccolti.

## Domande aperte per `/brainstorming`

- Come rappresentare un task con più ruoli assegnati: elencare i ruoli come sotto-righe sotto il task, sommare le ore di tutti i ruoli in un'unica riga task, o altro?
- Il quarto livello implicito (ruolo, se un task ne ha più di uno) va comunque mostrato da qualche parte, o l'informazione ruolo si perde deliberatamente a favore della semplicità?

Brief ready. Next step: /brainstorming.
