# Experience profile — livello task nella tabella Roles — design spec

**Date:** 2026-11-09
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-08-team-roles-task-level-brief.md`
**Scenario:** 2 (evoluzione di una feature esistente)

Nel pannello risorsa di `team.html`, tab Experience profile, la tabella Roles diventa ruolo → progetto → task. Le ore di
progetto e di task sono quelle della persona **in quel ruolo**; ogni task mostra i chip dei topic approvati, sia nei
Roles sia nell'albero delle dimensioni. Fatti di partenza e scope escluso: il Brief.

## 1. Aggregazione — `api/src/lib/resource-profile.js`

- `buildContributions`: ogni contributo riceve `roleTasks: { [role]: { [taskKey]: { name, hours } } }`, alimentato dalle
  stesse righe che alimentano `roles` e `tasks` (solo righe con ruolo non vuoto), arrotondato con `round2`. `roles` e
  `tasks` restano invariati.
- `aggregateProfile` scrive `version: 3`.
- Ogni voce di `roles[]` riceve `byProject: { [code]: { hours, tasks: [{ name, hours, topicIds }] } }`:
  - `hours` = `c.roles[role]` del codice;
  - `tasks` da `c.roleTasks[role]`, ordinati per ore decrescenti poi per nome;
  - `topicIds` = `info.taskTopics[taskKey]` (array vuoto se assente).
  - Un contributo salvato prima di questo ciclo (senza `roleTasks`) produce `tasks: []`.
- Ogni voce di `projects[code].tasks[]` riceve `topicIds` con la stessa regola. Per farlo `tasks` passa da
  `Object.values` a `Object.entries`, perché serve la chiave.
- Gli altri campi di `roles[]` (`code`, `hours`, `share`, `projects`, `last`, `projectCodes`) e di `projects[].tasks[]`
  (`name`, `hours`) non cambiano: `api/src/lib/team-scoring.js` resta invariato.
- Le righe di actuals senza ruolo restano escluse dai Roles, come oggi.

Il Rebuild di `profile-jobs.html` rimette in coda ogni codice e passa da `processCode`, che riscrive
`resource_project_contributions`: dopo il Rebuild ogni contributo ha `roleTasks`. Nessuna migrazione.

## 2. Lettura — `api/src/lib/topic-extract.js`, `api/src/routes/resources.js`

- Nuova funzione pura esportata `resolveTaskTopics(ids, topicsById)` → `[{ id, name }]`: segue le merge con `finalTopic`,
  tiene solo `status === 'approved'`, toglie i duplicati per id finale, ordina per nome.
- `GET /api/resources/:id/profile` applica una funzione pura (in `topic-extract.js`, nome `resolveProfileTaskTopics`) che
  restituisce una copia del profilo dove ogni task di `projects[].tasks` e di `roles[].byProject[].tasks` ha
  `topics: [{ id, name }]` al posto di `topicIds`. Un task senza `topicIds` (profilo v2) riceve `topics: []`. Il profilo
  salvato non viene modificato.

## 3. UI — `js/lib/team-ui.js`, `team.html`, `css/team.css`

- `buildProfileTree`:
  - i task dei nodi progetto portano `topics` (array vuoto se assente);
  - un nodo progetto sotto un ruolo, quando `r.byProject` ha il codice, prende `hours` e `tasks` da lì;
  - altrimenti (profilo v2) resta il nodo progetto di oggi senza task: ore totali del progetto, `tasks: []`.
  - L'ordinamento dei progetti sotto un ruolo usa le ore del ruolo.
- `team.html`, Roles:
  - la riga progetto con almeno un task è un `<button>` con chevron e `aria-expanded`, chiave `role:<code>:<projectCode>`,
    stesso markup e stesse classi della riga progetto dell'albero delle dimensioni;
  - senza task resta la riga statica di oggi;
  - righe task con le classi `tm-dim-row--task`/`tm-dim-task` delle dimensioni.
- Righe task, nei Roles e nelle dimensioni: dopo il nome, i chip dei topic in un contenitore `.tm-topic-chips` con chip
  `.tm-chip`; nessun contenitore se `topics` è vuoto. Una regola CSS solo se serve ad allineare i chip nella cella del
  task.
- Bump di ogni `?v=` di `js/lib/team-ui.js`, e di `css/team.css` se toccato.

## 4. Test

- `api/src/lib/resource-profile.test.js`: v3; due ruoli sullo stesso progetto (criteri 1-2); `topicIds` sui task;
  contributo senza `roleTasks`.
- `api/src/lib/topic-extract.test.js`: `resolveTaskTopics` e `resolveProfileTaskTopics` (criterio 3, profilo v2).
- `js/lib/team-ui.test.js`: albero v3 con task e topic sotto ruolo → progetto e nelle dimensioni; albero v2 (criterio 4).
- `api/src/lib/team-scoring.test.js` invariato (criterio 5).

## Criteri di accettazione

1. **Ore per ruolo sul progetto** — una persona con due ruoli sullo stesso progetto: sotto ogni ruolo la riga progetto mostra solo le ore di quel ruolo, e le due cifre sommano al totale del progetto (test su `aggregateProfile` e `buildProfileTree`).
2. **Task per ruolo** — sotto ruolo → progetto compaiono i task con le ore di quel ruolo; la loro somma è uguale alle ore del progetto in quel ruolo, a meno di 0,01 di arrotondamento (test).
3. **Chip dei topic** — un task con un topic approvato mostra il chip, nei Roles e nell'albero delle dimensioni; un topic `proposed` o `rejected` non compare; un topic merged compare col nome del target (test sulla risoluzione in lettura e su `buildProfileTree`).
4. **Profilo v2** — prima del Rebuild il pannello si apre senza errori e mostra ruolo → progetto senza task (test).
5. **Scoring invariato** — `api/src/lib/team-scoring.test.js` e il resto della suite passano senza modifiche allo scoring.
6. **Verifica manuale** — dopo il Rebuild da `profile-jobs.html`, su Fabrizio Fortini: Roles → ruolo → BERMITS Maintenance 2026 → task con ore e topic approvati; gli stessi topic sulle righe task dell'albero delle dimensioni.

## Decisioni aperte

1. **Ruolo × task salvato in `roles[].byProject`.** Alternativa scartata: una mappa separata `roleProjects[role][code]` in cima al profilo. Perché: resta additiva per `team-scoring` e tiene il dato accanto al ruolo.
2. **Riga progetto sotto un ruolo espandibile con chevron.** Alternativa scartata: task sempre visibili. Perché: è il comportamento dell'albero delle dimensioni e un ruolo con molti progetti resta leggibile.
3. **Topic per task salvati come id e risolti in lettura.** Alternativa scartata: salvarli risolti. Perché: è l'unico modo di avere rinomina, approvazione e merge visibili senza ricalcolo.
4. **Righe di actuals senza ruolo escluse dai Roles, come oggi.** Alternativa scartata: un gruppo «(no role)». Perché: cambierebbe share e conteggi dei ruoli, e il Brief non lo chiede.
5. **Profilo v2: la riga progetto sotto un ruolo mostra ancora il totale del progetto.** Alternativa scartata: nascondere le ore. Perché: nessuna regressione rispetto a oggi fino al Rebuild.
