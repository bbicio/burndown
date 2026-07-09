# Brief — Ciclo 2: Granularità del lock "Generate Project" su versioni multi-progetto (F4)

**Fonte:** `docs/superpowers/audits/2026-07-09-proposal-project-status-lock-audit.md`, finding F4.

**Perché questo Brief è diverso dal Ciclo 1:** F1-F3 (Ciclo 1) sono divergenze di correttezza/consistenza — il codice si comporta in modo diverso da un pattern già corretto altrove (o da se stesso), risolvibili con una riconciliazione meccanica. F4 non lo è: l'audit ha verificato esplicitamente che il codice attuale corrisponde **esattamente** a quanto documentato in `PRD.md:155-156` ("A version is locked when... a Committed linked project exists... Locked versions... are read-only"). Non c'è un comportamento "sbagliato" da correggere — c'è una decisione di design mai presa su cosa succede ai task non ancora mappati quando quel lock scatta prima che tutti i task di una versione siano stati assegnati a un progetto. Questo Brief segue quindi la struttura da **evoluzione di feature** (Scenario 2 di `PROCESS.md` §2: lettura del comportamento attuale + alternative da risolvere in `/brainstorming`), non lo schema meccanico "problema → fix" del Ciclo 1.

## Comportamento attuale (letto dal codice e da PRD.md, non modificato)

In `js/costgrid.js:376-387`, il bottone "Generate Project" è nascosto se **una qualsiasi** di tre condizioni è vera:

```js
const genBtn = document.getElementById('btnCgGenerateProject');
if (genBtn) genBtn.style.display = (isLocked || isDraft || !hasFreeTasks) ? 'none' : '';
```

`isLocked` proviene da `cgGetVersionLockState` (`js/costgrid.js:105-130`), che imposta `locked: true` non appena **un solo** progetto collegato alla versione raggiunge pipeline `Committed`:

```js
// js/costgrid.js:118-127
const hasCommitted = (thisVer?.linkedProjects || []).some(lp => {
  const proj = (config.projects || []).find(p => p.id === lp.projectId);
  return proj?.pipeline === 'Committed';
});
if (hasCommitted) return { locked: true, reason: 'committed', message: 'This version is locked — the linked project has been committed.' };
```

Poiché `isLocked` è in OR con `hasFreeTasks`, il lock **prevale sempre** sul controllo "ci sono ancora task non mappati" — anche se una versione ha 3 task e solo 1 è stato mappato a un progetto ora Committed, il bottone sparisce per tutti e 3, impedendo di generare un secondo progetto per i 2 task rimanenti.

Questo corrisponde esattamente a `PRD.md:155-156`, che documenta il lock ma non affronta il caso di task ancora non mappati al momento in cui scatta. L'audit ha verificato: il tracciamento dell'assegnazione task↔progetto (`cgGetAssignedTaskIds`/`cgGetAssignedTaskNames`, `js/costgrid.js:2810-2824`) gestisce correttamente sia "più task → un progetto" sia "un task ciascuno → più progetti" — il problema è isolato al cortocircuito di `isLocked`, non alla logica di assegnazione.

## Alternative di design (da risolvere in `/brainstorming`, non prescritte qui)

1. **Lock a livello di task, non di versione.** Il bottone resta visibile finché esistono task non mappati, indipendentemente dallo stato Committed di altri task già mappati; il lock blocca solo la modifica dei task già mappati a un progetto Committed, non l'intera versione. Effetto: supporta pienamente il workflow "una versione, più progetti nel tempo", ma richiede ridefinire `cgGetVersionLockState` da lock booleano per-versione a un concetto per-task, con impatto su tutta la UI che oggi assume "versione lockata = tutta read-only" (banner, altri bottoni toolbar — `js/costgrid.js:388-393` usano `isDraft`, non `isLocked`, quindi l'impatto su Publish/New Version/Delete Version è da verificare separatamente).
2. **Mantenere il lock a livello di versione, ma richiederlo solo quando TUTTI i task sono mappati.** Cioè: il lock "committed" scatta solo se `!hasFreeTasks` è già vero al momento in cui un progetto collegato diventa Committed — se restano task liberi, la versione resta editabile per quelli, pur mostrando che il progetto generato è ormai committed. Effetto: cambiamento più contenuto (si aggiunge una condizione a `hasCommitted`, non si ridisegna il modello di lock), ma serve decidere se il messaggio/banner di lock debba comunque comparire in forma parziale.
3. **Nessun cambiamento al lock; invece, la UI guida esplicitamente l'utente a mappare tutti i task PRIMA di generare il primo progetto**, così il caso "un progetto già Committed con altri task ancora liberi" diventa un errore di processo da prevenire a monte, non da correggere a valle. Effetto: zero modifiche alla lock logic, ma cambia il workflow atteso e potrebbe non essere compatibile con scenari legittimi in cui i progetti vengono generati in tempi diversi (es. task con date di inizio molto distanti).

La scelta tra queste (o una quarta opzione emersa in `/brainstorming`) è la decisione aperta che questo ciclo deve risolvere.

## Vincoli

- Qualunque soluzione deve restare coerente con `PRD.md:155-156}` — se la scelta finale cambia la regola di lock, `PRD.md` va aggiornato di conseguenza (via `/sync-docs`, non in questo Brief).
- Non toccare F1/F2/F3 (Ciclo 1) — file e causa diversi.
- Il tracciamento dell'assegnazione task↔progetto (`cgGetAssignedTaskIds`/`cgGetAssignedTaskNames`), già verificato corretto dall'audit, non va ridisegnato — solo eventualmente consumato in modo diverso dalla nuova logica di lock.

## Criteri di accettazione

- [ ] La decisione di design (una delle alternative sopra o una nuova) è esplicitamente documentata nella Spec prodotta da `/brainstorming`, con motivazione.
- [ ] Una versione con task ancora non mappati continua a permettere la generazione di un nuovo progetto per quei task, anche se un altro progetto già collegato è Committed — nella misura consentita dalla decisione di design scelta.
- [ ] `PRD.md:155-156` viene aggiornato se la regola di lock cambia rispetto a quanto oggi documentato.
- [ ] Nessuna regressione sul comportamento verificato corretto dall'audit (assegnazione task↔progetto, banner Draft, bottoni Publish/New Version/Delete Version se non esplicitamente in scope della soluzione scelta).

## Scope escluso esplicitamente

- F1, F2, F3 (Ciclo 1) — ciclo separato, non toccare qui.
- Qualunque redesign della UI del cost grid editor oltre alla logica di lock/visibilità di Generate Project.
- Migrazione di versioni già lockate sotto la regola attuale — comportamento retroattivo da decidere solo se emerge come necessità esplicita in `/brainstorming`.

## Isolamento dei nuovi finding (guardia obbligatoria)

Se durante `/brainstorming` o l'esecuzione di questo ciclo emerge un finding **non previsto** da questo Brief (non citato come F4 nell'audit `2026-07-09-proposal-project-status-lock-audit.md`), va sempre isolato e proposto come Brief a sé stante per un ciclo futuro — mai risolto di straforo in questo ciclo, anche se la decisione di design qui presa potrebbe sembrare correlata. Questa è la guardia dello Scenario 3 (`PROCESS.md` §2), applicabile anche quando il ciclo stesso ha natura di evoluzione.
