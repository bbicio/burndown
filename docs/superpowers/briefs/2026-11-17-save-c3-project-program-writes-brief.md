# Brief — Contratto di salvataggio, ciclo 3: scritture di progetti e programmi

**Tipo:** correzione di divergenza (audit-fix, Scenario 3) con una scelta di design (SY-10). Finding coperti: **SY-03**, **SY-04**, **SY-08**, **SY-10**, **SY-19** (solo condivisione del programma: il loop di upsert).
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Presuppone i cicli 1 e 2; tocca lo stesso `js/costgrid.js` del ciclo 2.
**Criterio di raggruppamento:** tutti i percorsi passano da `_pushProjectToApiDetailed` (`js/api-sync.js:299-363`) o dal link versione↔progetto (`linkedProjects.add`).
**Natura:** SY-03, SY-04 e SY-08 sono divergenze di correttezza. SY-10 (salvataggio a catena e non atomico) è una scelta di design, lasciata a `/brainstorming` (scelta aperta 1).
**Classe di rischio:** high-risk (permessi di progetto; regole del currency lock; file condivisi; operazioni che creano o ricreano progetti).
**Security surface:** yes — `POST /api/projects` oggi raggiungibile come fallback da chi non può più modificare il progetto (SY-04); condivisione dei programmi.

## Problema

Il salvataggio di un progetto:
- può ricreare un progetto cancellato;
- nasconde la causa vera degli errori;
- si ferma a metà lasciando un salvataggio parziale.

Da costgrid, "Add tasks" ripubblica una copia vecchia dell'intero progetto. Generate e Add tasks ignorano l'errore del link ai task, che così risultano di nuovo liberi.

## Comportamento attuale

- **SY-04.** Un `PATCH` fallito che non sia `PROJECT_RULE` o `DATE_RULE` diventa `Api.projects.create({ ...meta, id })` (`js/api-sync.js:324-338`). Il server inserisce con lo stesso id, con proprietario chi salva, e ricopia i tag dalla versione (`api/src/routes/projects.js:156-200`). Il `404` (`:350`) o il `403` di `canEdit` su un progetto cancellato portano quindi alla sua ricreazione. Su un progetto vivo, un 500 diventa un errore di chiave duplicata, e quello è il messaggio mostrato.
- **SY-10.** Prima il `PATCH` dei metadati, poi `PUT /tasks` (con il periodo), poi `PATCH` di phasing, ptc, planning e groups. Ogni passo è una transazione a sé (`api-sync.js:346-361`). Se il `PUT /tasks` fallisce, phasing, ptc e planning vengono validati sul periodo vecchio (`projects.js:549,588,623`).
- **SY-03.** `cgDoAddTasksToProject` aggiunge i task alla copia di `config.projects` letta all'apertura di costgrid (`js/pages/costgrid.js:1194`) e chiama `_pushProjectToApiDetailed(proj, { skipEmpty: true })` (`js/costgrid.js:1183-1185`). `skipEmpty` protegge solo le sezioni vuote (`api-sync.js:313-318`).
- **SY-08.** Generate: `linkedProjects.add` sta in un `try` il cui `catch` scrive solo un log, e il link viene comunque aggiunto in memoria con "✓ Project created" (`js/costgrid.js:1411-1432`). Add tasks: `.catch(e => console.warn(…))` (`:1214-1217`). Il server sostituisce le liste `task_ids`/`task_names` per intero (`api/src/routes/cost-grids.js:938-942`).
- **Programmi.**
  - Creazione: `Api.programs.create` da `project-config.js:686` e da `js/pages/costgrid.js:439-461`.
  - Condivisione: `POST /api/programs/:id/share` (`api/src/routes/config.js:163-171`), un loop di `ON CONFLICT … DO UPDATE SET permission` senza transazione.
  - `Api.programs.update/delete` non hanno chiamanti.
- Salvataggio di project-config (`js/pages/project-config.js:595-653`): aspetta l'esito e mostra le parti fallite. In caso di successo naviga verso il portfolio.

## Comportamento atteso

1. **Niente fallback POST.** Un `PATCH` fallito restituisce il suo esito. "Progetto non trovato" è un esito esplicito che l'interfaccia mostra; il progetto non viene mai ricreato.
2. **Salvataggio di project-config** tramite l'helper del ciclo 1:
   - invia la versione del progetto;
   - su conflitto mostra il motivo e offre la ricarica;
   - su successo adotta la risposta del server;
   - il server registra la fotografia del progetto con le sue sezioni.
3. **Atomicità (SY-10):** un salvataggio di progetto riesce tutto o niente (scelta aperta 1).
4. **Add tasks (SY-03):** invia solo l'operazione "aggiungi questi task al progetto X", con la versione del progetto, e mai la copia intera del progetto letta all'apertura di costgrid.
5. **Link versione↔progetto (SY-08):**
   - Generate e Add tasks aspettano l'esito del link;
   - se fallisce, l'utente lo vede e la memoria non segna i task come assegnati;
   - il link non sostituisce più le liste intere partendo da una copia vecchia: aggiunge o rimuove i singoli task, oppure porta la versione.
6. **Programmi:** creazione e condivisione passano dall'helper e dal registro. La condivisione di un programma è atomica e non abbassa un permesso già più alto (scelta aperta 3).

## Vincoli

- Le regole del currency lock restano invariate (CLAUDE.md "Project currency lock"): `PROJECT_RULE`, `DIRECT_PROJECT_CREATION_ENABLED`, `PROJECT_REMOVAL_ENABLED`, il lock di versione (`api/src/lib/version-lock.js`). Un rifiuto `PROJECT_RULE` o `DATE_RULE` non viene mai ritentato.
- Le regole di date (`periodError`/`taskDatesError`) e di money (`amountError`) restano prima di ogni scrittura.
- `test-api.js` `PR-01..PR-14` restano verdi.
- Nessun build step; cache-busting di ogni file modificato.
- Testi utente in inglese.

## Criteri di accettazione

- [ ] Salvare un progetto cancellato nel frattempo dà "not found" e il progetto non riappare nel DB (`test-api.js`).
- [ ] Un 500 simulato sul `PATCH` mostra quell'errore, non un errore di chiave duplicata.
- [ ] Due salvataggi dello stesso progetto dalla stessa versione: il secondo riceve 409 e i dati del primo restano (`test-api.js`).
- [ ] Un salvataggio con una sezione rifiutata non lascia scritte le altre sezioni (o vale la garanzia scelta in 1), verificato con `test-api.js`.
- [ ] Dopo una modifica in project-config, "Add tasks" da una costgrid aperta prima non riporta nome, stato, periodo né sezioni ai valori vecchi (`test-api.js` più una verifica a mano su due schede).
- [ ] Un fallimento di `linkedProjects.add` in Generate e in Add tasks viene mostrato; dopo il reload i task risultano coerenti con il server.
- [ ] La condivisione di un programma a un editor esistente come viewer non lo abbassa (o vale la scelta 3), ed è atomica.
- [ ] Ogni salvataggio riuscito di progetto o programma lascia una riga nel registro.
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano.
- [ ] Documentazione: `docs/js/api-sync.md`, `docs/pages/project-config.md`, `docs/api/` per le route toccate; la tabella "Key sync functions" di CLAUDE.md riflette la nuova forma.
- [ ] Regole del progetto: `project-config`, le funzioni di progetto di `js/api-sync.js` e le route di progetti e programmi sono tolti dalla lista delle eccezioni del guard; il guard passa. Nella tabella "Key sync functions" di CLAUDE.md non compaiono più `_pushProjectToApi`, il fallback POST né `skipEmpty`.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` su `js/api-sync.js`, `project-config` e `routes/projects.js` sono rilette; quelle superate vengono chiuse al Gate 5 con il controllo eseguito, compresi i residui di design D6/D7 del 2026-10-01 citati in testa al backlog.

## Scope escluso

- Tag del progetto: ciclo 4.
- Condivisioni singole di progetti e cost grid (cambio permesso via upsert): ciclo 7.
- Eliminazione e scollegamento dei progetti (ciclo futuro dedicato; `PROJECT_REMOVAL_ENABLED` resta `false`).
- Upload delle actuals da project-config: atomicità nel ciclo 5.
- Validazione di `PATCH /projects/:id/groups` (nota fuori scope del report).

## Scelte aperte per /brainstorming

1. **Atomicità del progetto:** un endpoint unico che salva metadati e sezioni in una transazione; oppure le sezioni separate, ciascuna con la propria versione, e un esito che dica cosa è stato salvato.
2. **Add tasks:** un endpoint dedicato "append tasks", oppure il `PUT /tasks` con la versione del progetto dopo una rilettura fresca.
3. **Condivisione del programma:** non abbassare mai un permesso esistente, oppure applicare il permesso scelto solo ai progetti non ancora condivisi, e come mostrarlo.
4. **Link versione↔progetto:** operazioni di aggiunta e rimozione puntuali, oppure liste intere con versione.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
