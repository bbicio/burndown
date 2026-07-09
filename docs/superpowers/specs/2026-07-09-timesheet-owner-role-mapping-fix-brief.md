# Brief — Correggere la mappatura owner/role nell'ingestion dei timesheet e i dati già corrotti (F1, F2)

**Fonte:** `docs/superpowers/audits/2026-07-09-planning-by-owner-name-audit.md`, finding F1, F2.
**Scenario:** 3 — Audit → fix.

## Problema

Resource Planning (`planning.html`, viste By Owner e By Project) mostra un codice ruolo/team (es. `HWGDEV - DEVELOPER`) al posto del nome reale della persona ovunque dovrebbe comparire l'owner. Non è un bug nelle viste stesse — entrambe leggono fedelmente `r.owner` dai dati timesheet in memoria (`js/planning.js:1326,1333,1440-1442` per By Owner; `:1032,1117-1118,1138` per By Project, stessa causa, seconda manifestazione confermata nell'audit).

- **F1** — ogni riga attualmente in DB ha `owner === role` (entrambi valgono lo stesso codice ruolo/team), riprodotto esattamente dal pattern "header ambiguo duplicato su entrambi i campi" che il fix del 2026-07-06 (`docs/superpowers/reports/2026-07-06-fix-timesheet-column-mapping-finish-cycle.md`) doveva prevenire. Tutti e 4 i caricamenti in DB sono precedenti al fix (23-29 giugno, fix shippato il 6 luglio) — zero caricamenti dopo. Il fix ha corretto il codice per i caricamenti futuri, ma non ha effetto retroattivo sulle righe già salvate.
- **F2** — confermato con un ricaricamento reale durante l'audit: anche oggi, con il codice già corretto dal fix del 6 luglio, il problema si ripresenta. La colonna reale da cui recuperare il nome della persona è **`Owner: name`** (fatto verificato con l'utente). Da sola, questa intestazione risolverebbe correttamente con le liste di keyword attuali (`'owner'` è una sotto-stringa, nessuna delle candidate di `role` — `'role'`, `'ruolo'`, `'resource'` — la intercetta) — quindi il fallimento riproducibile implica che **un'altra intestazione** nel file reale collide con un campo a priorità più alta (quasi certamente `role`, per l'evidenza di F1), non ancora diagnosticata perché manca l'elenco completo degli header reali.

## Comportamento attuale

```js
// api/src/routes/timesheets.js:192-209 — resolveColumnMap
function resolveColumnMap(headers) {
  const used = new Set();
  const findCol = (...candidates) => {
    const col = headers.find(k => !used.has(k) && candidates.some(c => k.toLowerCase().includes(c.toLowerCase())));
    if (col) used.add(col);
    return col;
  };
  return {
    colDate:     findCol('date', 'data'),
    colRole:     findCol('role', 'ruolo', 'resource'),
    colOwner:    findCol('owner', 'worker', 'name', 'nome'),
    ...
  };
}
```

`role` è risolto prima di `owner` nell'ordine di priorità dichiarato; un test esistente (`api/src/routes/timesheets.test.js:50-55`) documenta e blocca deliberatamente il comportamento per un file con solo una colonna tipo "Resource Name" (nessuna colonna Role separata): l'intera colonna va a `role`, e `owner` resta `undefined` — non più duplicato, ma nemmeno popolato con un nome reale.

## Comportamento atteso

- Un caricamento di un file timesheet reale (con la colonna `Owner: name` presente) produce `owner` popolato con il nome reale della persona, distinto da `role`, per ogni riga.
- Le righe già in DB (i 4 caricamenti esistenti, tutti pre-fix) vengono corrette — via ricaricamento dei file originali una volta che il codice gestisce correttamente l'header reale, o altro meccanismo di correzione da decidere in `/brainstorming`.
- Resource Planning (By Owner, By Project) mostra il nome reale della persona ovunque oggi mostra il codice ruolo — senza alcuna modifica a `js/planning.js`, che è già corretto e verificato dall'audit.

## Vincoli

- **Prerequisito non saltabile**: prima di modificare `resolveColumnMap`, va raccolto l'elenco completo degli header reali di almeno uno dei file XLS originali (non solo il nome della colonna owner) — l'audit segnala esplicitamente che senza questo elenco non si può diagnosticare con certezza quale altra intestazione collide con `role`. Questo va fatto in `/brainstorming`, non assunto o indovinato.
- Non toccare `js/planning.js` — la logica di consumo (`matchesTaskRole`, `computeResidual`, aggregazione per owner) è già stata verificata corretta dall'audit; il problema è interamente a monte, nei dati.
- Non toccare la duplicazione dei tre provider AI o altre aree fuori dal percorso di ingestion timesheet.
- Qualunque cambiamento al meccanismo di risoluzione colonne deve mantenere il comportamento già testato e corretto per gli altri campi (`date`, `hours`, `task`, `notes`, `projId`, `projName`) — non regredire `timesheets.test.js`.

## Criteri di accettazione

- [ ] L'elenco completo degli header del file XLS reale è stato raccolto e allegato alla Spec prodotta da `/brainstorming`.
- [ ] `resolveColumnMap` risolve correttamente `colOwner` alla colonna `Owner: name` (o equivalente) su un file con la struttura reale, senza duplicarla su `role` né lasciarla `undefined`.
- [ ] Un test che riproduce l'esatta struttura di header reale (non solo il singolo nome `Owner: name` isolato) viene aggiunto a `api/src/routes/timesheets.test.js`, a caratterizzare il fix.
- [ ] Le righe già in DB (i 4 caricamenti esistenti) mostrano `owner` corretto dopo la correzione — via ricaricamento o altro meccanismo deciso in `/brainstorming`.
- [ ] Resource Planning (By Owner, By Project) mostra nomi reali, verificato manualmente in browser dopo il fix.
- [ ] Nessuna regressione sugli altri campi mappati da `resolveColumnMap` (test esistenti in `timesheets.test.js` continuano a passare).

## Scope escluso esplicitamente

- Il cambio di schema della vista By Owner/By Project (Owner→Progetto→Task invece di Owner→Progetto→Ruolo) — gestito con un Brief separato via `feature-brief` (Scenario 2), non qui.
- Qualunque redesign più ampio della UI di upload timesheet oltre alla correzione della mappatura colonne.
- Migrazione di dati per progetti/timesheet diversi dai 4 caricamenti già identificati nell'audit, a meno che emerga come necessità esplicita in `/brainstorming`.

## Isolamento dei nuovi finding (guardia obbligatoria)

Se durante `/brainstorming` o l'esecuzione di questo ciclo emerge un finding **non previsto** da questo Brief (non citato come F1/F2 nell'audit `2026-07-09-planning-by-owner-name-audit.md`), va sempre isolato e proposto come Brief a sé stante per un ciclo futuro — mai risolto di straforo in questo ciclo. Questa è la guardia dello Scenario 3 (`PROCESS.md` §2).
