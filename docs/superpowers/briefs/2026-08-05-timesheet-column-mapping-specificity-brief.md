# Brief — XLS timesheet column-mapping matching specificity

**Data:** 2026-08-05
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** `docs/superpowers/audits/2026-08-05-timesheet-column-mapping-ambiguity-audit.md`, finding F1 (Severity: High) e F2 (Severity: Medium)

**Nota sulla forma di questo Brief:** a differenza del tipico ciclo audit→fix (dove l'audit ha già stabilito un comportamento corretto noto da ripristinare), F1 e F2 non hanno un "comportamento corretto" definito da restaurare — il codice attuale non ha mai specificato come `resolveColumnMap()` debba comportarsi quando più header di uno stesso file possono soddisfare le keyword di più campi. Serve una vera decisione di design (quale criterio di specificità adottare), non un fix meccanico — per questo il Brief segue la forma Scenario 2 (comportamento attuale + comportamento atteso + vincoli), non lo schema a finding-singolo del ciclo audit-fix standard.

## Current behavior

`resolveColumnMap(headers)` (`api/src/routes/timesheets.js:198-215`), chiamata da `POST /api/timesheets/upload` (`api/src/routes/timesheets.js:97-101`) per determinare quale colonna del file XLS caricato corrisponde a ciascuno degli 8 campi noti (`colDate`, `colRole`, `colOwner`, `colHours`, `colTask`, `colNotes`, `colProjId`, `colProjName`).

Ogni campo è risolto tramite una chiamata sequenziale a `findCol(...)` (`:200-204`), in un ordine fisso determinato solo dall'ordine di scrittura nell'object literal restituito (`:206-213`):

```
colDate → colRole → colOwner → colHours → colTask → colNotes → colProjId → colProjName
```

`findCol` scansiona la lista di header e restituisce il *primo* (in ordine di posizione nell'array) che soddisfa *una qualsiasi* delle keyword candidate del campo, tramite semplice substring case-insensitive (`k.toLowerCase().includes(c.toLowerCase())`, `:201`), poi lo rimuove dalla lista disponibile (`used.add(col)`, `:202`) così che non venga riassegnato ad un altro campo.

**F1 — collisione tra campi**: `colOwner` (candidati: `'owner', 'worker', 'name', 'nome'`, `:208`) è risolto al 3° posto, prima di `colTask` (5°, candidati `'task', 'attività', 'activity'`, `:210`) e `colProjName` (ultimo, candidati `'projectname', 'project name', 'project_name', 'progetto'`, `:213`). Le sue keyword generiche `'name'`/`'nome'` corrispondono a qualunque header che le contenga come sottostringa — non solo header riferiti a una persona. Verificato empiricamente (audit F1): un header comune come `"Project Name"` viene catturato da `colOwner` invece che da `colProjName`, quando precede nell'ordine del file l'eventuale colonna owner reale; `"Task Name"` lascia `colTask` completamente non risolto; in italiano, `"Nome Progetto"` prima di `"Nome Risorsa"` fa perdere del tutto la colonna owner reale (nessuna delle due viene assegnata correttamente).

**F2 — ambiguità entro lo stesso campo**: anche quando un solo campo ha più header candidati nello stesso file, `findCol` non preferisce un match esatto (`"Data"` === `'data'`) a uno parziale (`'data'` dentro `"Data Chiusura"`) — vince semplicemente l'header che appare prima nell'array. Verificato empiricamente (audit F2): `"Data Chiusura"` prima di `"Data"` fa sì che `colDate` catturi la colonna sbagliata.

In entrambi i casi **non viene mai sollevato un errore** — l'upload sembra riuscire, ma il campo interessato risulta popolato con dati sbagliati o `null` per ogni riga, senza segnale visibile all'utente. Confermato (audit, sezione "Ruled out") che l'header set reale attualmente in produzione (`Date | Job | Role: Name | Hour Type | Owner: Name | Hours | Task/Issue | Notes | D365 Project ID | WF Project Name`) risolve correttamente oggi — ma solo per un caso fortunato nell'ordine delle colonne, non perché la logica di matching sia solida.

## Expected behavior

Il matching deve preferire, in ordine di priorità (l'ordine esatto è la decisione di design da esplorare in `/brainstorming`, non prescritta qui):
1. Un match esatto (whole-string) rispetto a un match parziale (substring), per lo stesso campo — risolve F2.
2. Una corrispondenza più specifica rispetto a una generica, indipendentemente dall'ordine di dichiarazione dei campi — risolve F1 (es. `"Project Name"` deve preferire `colProjName`'s keyword specifica `'project name'` rispetto alla keyword generica `'name'` di `colOwner`, anche se `colOwner` è processato prima).

Il comportamento per l'header set reale attualmente in produzione (citato sopra, coperto da `api/src/routes/timesheets.test.js:91-127`) non deve regredire — deve continuare a risolversi esattamente come oggi.

## Constraints

- Nessuna nuova dipendenza esterna.
- Il contratto esterno di `resolveColumnMap(headers)` — riceve un array di stringhe già trimmate, restituisce un oggetto con le stesse 8 chiavi (`colDate`, `colRole`, ecc.), ciascuna `string | undefined` — non deve cambiare, per non richiedere modifiche ai call site esistenti (`api/src/routes/timesheets.js:99-101`).
- Deve restare compatibile con l'header set reale già verificato (vedi sopra) e con lo scenario già coperto dal test esistente `"Resource Name" is claimed by role, not duplicated onto owner"` (`api/src/routes/timesheets.test.js:58-63`) — quel comportamento (role vince su owner per `"Resource Name"`) è documentato come intenzionale nell'audit (sezione "Ruled out") e non va invertito senza una decisione esplicita in `/brainstorming`.
- Qualunque nuova euristica deve restare descrivibile e testabile in modo deterministico (niente scoring probabilistico/fuzzy non riproducibile).

## Acceptance criteria

- Riproduce F1 e F2 come test di regressione (nuovi casi in `api/src/routes/timesheets.test.js`, gli scenari esatti sono documentati nell'audit): `"Project Name"` con o senza una colonna Owner separata; `"Task Name"` da sola; `"Nome Progetto"` + `"Nome Risorsa"`; `"Data Chiusura"` + `"Data"` — tutti devono risolversi al campo corretto dopo il fix.
- L'header set reale in produzione (sopra) continua a risolversi esattamente come oggi — nessuna regressione sul test esistente `trimRowKeys + resolveColumnMap: real header list resolves every field correctly` (`api/src/routes/timesheets.test.js:91-127`).
- Il test esistente su `"Resource Name"` (`:58-63`) continua a passare, a meno che `/brainstorming` non decida esplicitamente di cambiarne il comportamento atteso (in tal caso il test va aggiornato consapevolmente, non silenziosamente rotto).
- Nessun nuovo errore/eccezione introdotto per header list che oggi si risolvono correttamente.

## Explicitly excluded scope

- `formatDate()`/`parseFlexibleDate()` e la validazione riga per riga (data/ore) — esplicitamente fuori perimetro anche nell'audit di origine.
- Qualunque modifica al comportamento di `"Resource Name"` → `colRole` (audit, "Ruled out") a meno che non emerga come necessaria durante `/brainstorming` — in tal caso va segnalata esplicitamente, non modificata di straforo.
- Migrazione/re-upload di dati storici — non applicabile, nessun dato reale risulta oggi affetto (vedi audit, "Ruled out": l'header set reale è sicuro oggi).

## Promemoria — isolamento di nuovi finding

Se durante `/brainstorming` o l'esecuzione di questo ciclo emerge un nuovo finding non previsto da questo Brief (una terza collisione di keyword non ancora identificata, un comportamento inatteso su un header set diverso, ecc.), va isolato e proposto come Brief separato — mai risolto di straforo in questo stesso ciclo.

Brief ready. Next step: /brainstorming.
