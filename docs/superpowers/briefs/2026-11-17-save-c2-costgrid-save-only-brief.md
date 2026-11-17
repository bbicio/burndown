# Brief — Contratto di salvataggio, ciclo 2: editor cost grid con solo Save

**Tipo:** evoluzione (Scenario 2) con correzioni di divergenza. Finding coperti: **SY-02**, **SY-05**, **SY-06**, **SY-07**, **SY-09**, **SY-14** (structure save della nuova grid, `js/costgrid.js:944`).
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Presuppone il ciclo 1 (`2026-11-17-save-c1-foundations-brief.md`).
**Criterio di raggruppamento:** stessa funzione (`cgAutoSave` → `_cgUpsertVersionToApi`) e stessa causa: si salva l'intera bozza in background.
**Natura — perché è in forma Scenario 2:** l'utente ha deciso di togliere l'autosave (2026-11-17), e questo cambia il comportamento visibile dell'editor. Decidere cosa succede ai punti che oggi salvano prima di un'azione è una scelta di design. SY-09 richiede di scegliere chi alimenta `projects.pipeline`.
**Classe di rischio:** high-risk (file condivisi `js/costgrid.js`/`js/api-sync.js` caricati da `pipeline.html` e `costgrid.html`; money: valuta e tasso).
**Security surface:** no.

## Problema

Mentre l'editor delle cost grid è aperto, ogni autosave rimanda tutti i campi della testata e l'intera struttura, presi dalla copia letta all'apertura. Così:
- si annullano le modifiche di altri utenti;
- gli errori finiscono quasi sempre in console;
- le modifiche in attesa si perdono navigando.

Lo stage cambiato nell'editor non arriva mai a `projects.pipeline` sul server.

## Comportamento attuale

- **SY-02.** `_cgUpsertVersionToApi` (`js/api-sync.js:200-243`) invia tutti i campi della testata (`label, pipeline, startDate, endDate, currency, note, status, projectName, linkedProjects, ratecardId, clientId`) e fa il `PUT` dell'intera struttura. La bozza è letta una sola volta in `openVersion` (`js/pages/costgrid.js:531-538`). Il server applica ogni campo presente (`api/src/routes/cost-grids.js:445-464`).
- **SY-05.** Solo `DATE_RULE`, `CURRENCY_RULE`, `STRUCTURE_RULE` e `MONEY_RULE` producono un avviso (`api-sync.js:228,249`); tutto il resto va solo in `console.warn`. Il debounce (`js/costgrid.js:755-765`) mostra il toast solo se il salvataggio riesce, e altrimenti non mostra niente.
- **SY-06.**
  - `goBack` aspetta 500 ms fissi (`js/pages/costgrid.js:663-668`).
  - `openLinkedProject` naviga subito (`:793`).
  - `switchVersion` non aspetta il salvataggio (`:658-662`).
  - Publish ignora l'esito del salvataggio e poi ricarica la pagina (`js/costgrid.js:801,822`).
  - costgrid non ha `beforeunload`.
- **SY-07.** `cgAutoSave` (`js/costgrid.js:729-752`) non ha una coda. Chiamate dirette arrivano da `onPipelineChange`/`onCurrencyChange` (`:744-749`, `:1098`, `:1172`) e da `cgDoGenerateProject` (`:1442`). La risposta `onServerRate` → `cgAdoptServerRate` (`:708-727`) aggiorna il tasso.
- **SY-09.**
  - `cgPropagatePipelineToProjects` (`js/costgrid.js:425-437`) scrive solo in memoria, perché `persistConfig()` non fa nulla.
  - Il server ignora `status` e `linkedProjects` nel `PATCH` della versione (`cost-grids.js:445`).
  - Chi legge lo stage da `projects.pipeline` lo trova vecchio: `api/src/services/planning-data.js:18`, `api/src/routes/exports.js:61`.
- **SY-14.** Il `PUT` della struttura di una nuova grid finisce in `.catch(() => {})` (`js/costgrid.js:944`).

## Comportamento atteso

1. **Niente autosave** (decisione dell'utente): si toglie la chiamata del debounce. Il codice di `cgScheduleAutoSave`/`cgAutoSave` resta, ma non viene più invocato a ogni modifica. Si salva solo con **Save**.
2. **Save** usa l'helper del ciclo 1:
   - invia la versione di partenza e solo i campi della testata cambiati;
   - invia la struttura con la versione;
   - aspetta l'esito e lo mostra in modo visibile e persistente finché resta vero: "Saved", "Saving…" oppure "Not saved: motivo";
   - su successo adotta la risposta del server;
   - su conflitto offre la ricarica senza perdere la bozza a video.

   Il server registra la fotografia (testata e struttura) nel registro del ciclo 1.
3. **Modifiche non salvate:**
   - l'editor sa quando la bozza è diversa dall'ultima versione salvata;
   - Indietro, cambio di versione, link al progetto, sidebar e chiusura o ricarica della scheda avvisano prima di uscire;
   - non si fanno salvataggi impliciti.
4. **Punti che oggi salvano prima di un'azione:** per generate project, publish, new version, clone, cambio di stage e cambio di valuta si decide uno per uno (scelta aperta 1). Publish e generate non partono mai da una bozza non salvata.
5. **Stage e progetti (SY-09):** il cambio di stage di una versione arriva a `projects.pipeline` dei progetti collegati lato server, nella stessa transazione. In alternativa `projects.pipeline` smette di essere una fonte separata (scelta aperta 2).
6. **Payload morto:** `linkedProjects` e `status` non viaggiano più nel `PATCH` della versione. Ciò che oggi sembra persistito tramite quei campi diventa una scrittura esplicita (il link è del ciclo 3) oppure si toglie.
7. **Nuova grid:** un fallimento del salvataggio della struttura viene mostrato.

## Vincoli

- Non si cancella il codice dell'autosave; si toglie solo la chiamata (decisione dell'utente).
- Nessun build step. Cache-busting di `js/costgrid.js`, `js/api-sync.js` e di ogni file modificato, in tutte le pagine che li caricano.
- `cgAdoptServerRate` e la regola valuta/tasso restano corrette senza il salvataggio implicito dopo il cambio di valuta: il comportamento della valuta non deve regredire (CLAUDE.md "Money formatting" e "Project currency lock").
- Le regole lato server (`DATE_RULE`, `STRUCTURE_RULE`, `MONEY_RULE`, `CURRENCY_RULE`, `PROJECT_RULE`) restano e vengono mostrate come rifiuti dall'helper.
- Il componente del Pipeline board (`pipeline.html`) carica gli stessi file e non deve regredire.
- Verifica visiva con `scripts/shoot.mjs` su branch stack (CLAUDE.md, `scripts/shoot.mjs`).
- Testi utente in inglese.

## Criteri di accettazione

- [ ] Modificare un'ora e aspettare non genera alcuna richiesta di scrittura; Save la genera (test vitest sul modulo, più una verifica a mano).
- [ ] Due editor sulla stessa versione: B salva dopo A e riceve il conflitto; lo stage scelto da A resta sul server (`test-api.js` sul server, verifica a mano sull'interfaccia).
- [ ] Un 500 o un timeout al Save mostrano "Not saved" con il motivo e la bozza resta a video.
- [ ] Con modifiche non salvate, Indietro, cambio di versione, link al progetto e chiusura della scheda chiedono conferma; senza modifiche non chiedono.
- [ ] Publish e generate non partono con modifiche non salvate (secondo la scelta 1).
- [ ] Dopo un cambio di stage salvato, `projects.pipeline` dei progetti collegati è uguale al nuovo stage (`test-api.js`), oppure la scelta 2 alternativa è verificata.
- [ ] Il `PATCH` della versione non contiene più `linkedProjects` né `status`.
- [ ] Ogni Save riuscito lascia una riga nel registro con la fotografia di testata e struttura.
- [ ] Il cambio di valuta mantiene il comportamento attuale del tasso (test esistenti verdi, più un caso nuovo se la scelta 1 lo cambia).
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano; screenshot dell'editor letti.
- [ ] Documentazione: `docs/pages/costgrid.md`, `docs/js/api-sync.md`, `docs/js/costgrid.md`; il paragrafo "Pipeline stage" di CLAUDE.md non dice più che planning è "safe because of the propagation"; l'intestazione di `js/api-sync.js` non dice più che tutto è fire-and-forget.
- [ ] Regole del progetto: i file migrati in questo ciclo e le route delle cost grid sono tolti dalla lista delle eccezioni del guard introdotto dal ciclo 1; il guard passa. CLAUDE.md descrive il Save dell'editor secondo il contratto, e le sezioni "Data strategy" e "Pipeline stage" non contraddicono più il codice.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` su `js/costgrid.js`, `js/pages/costgrid.js` e `js/api-sync.js` sono rilette; quelle superate dalla rimozione dell'autosave vengono chiuse al Gate 5 con il controllo eseguito.

## Scope escluso

- "Add tasks to project", Generate (le sue scritture) e il link versione↔progetto: ciclo 3.
- Tag della versione: ciclo 4.
- Ciclo di vita della grid già corretto (delete, duplicate, refresh-rate: sezione "Ruled out" del report).
- Rimozione di `_cgStore` e del codice dell'autosave.

## Scelte aperte per /brainstorming

1. Per ognuna di generate project, publish, new version, clone, cambio di stage e cambio di valuta: azione bloccata finché ci sono modifiche non salvate, oppure una domanda "Save first?", oppure un salvataggio esplicito prima di procedere.
2. SY-09: propagazione lato server nella stessa transazione, oppure `projects.pipeline` letto dalla versione collegata (con un join) ed eliminato come copia.
3. Indicatore dello stato di salvataggio: dove e come, coerente con il page head dell'editor.
4. Su conflitto, cosa si offre: solo la ricarica, oppure la ricarica conservando la bozza locale da rivedere.
5. Se il Save della testata e quello della struttura diventano una sola richiesta transazionale o restano due richieste con versione.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
