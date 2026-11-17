# Brief — Contratto di salvataggio, ciclo 4: tag di versioni e progetti

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperto: **SY-11**.
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Presuppone il ciclo 1 (helper lato client).
**Criterio di raggruppamento:** stesso endpoint di sostituzione completa (`PUT …/tags`), stesso difetto su due pagine (costgrid e project-config).
**Natura:** divergenza di correttezza. I tag non sono tra le entità registrate (decisione dell'utente), quindi niente registro.
**Classe di rischio:** standard (route API e file condivisi `js/tags.js`/`js/api.js`; nessuna migrazione prevista).
**Security surface:** no.

## Problema

Spuntare un tag riscrive l'intera lista dei tag partendo da quella in memoria. Così si cancellano i tag aggiunti altrove. Se il caricamento dei tag fallisce, la lista in memoria diventa vuota e il clic successivo cancella tutti i tag sul server. Un fallimento non viene mostrato.

## Comportamento attuale

- **project-config** (`js/pages/project-config.js:337-374`):
  - `loadTags` mette `this.projectTags = []` quando la lettura fallisce;
  - `toggleTag` costruisce `newIds` da `projectTags` e chiama `Api.projects.tags.replace(…)`;
  - un errore va solo in `console.warn`, e la checkbox resta probabilmente spuntata su uno stato mai salvato (dedotto, non riprodotto).
- **costgrid** (`js/pages/costgrid.js:707-737`): sostituisce la lista intera `versionTagItemIds` letta in `openVersion`. Su errore torna indietro, senza messaggio.
- **Server:** `PUT /api/projects/:id/tags` fa `DELETE` più `INSERT` in una transazione (`api/src/routes/projects.js:816-821`); `PUT …/versions/:vId/tags` fa lo stesso (`api/src/routes/cost-grids.js:1239-1243`).

## Comportamento atteso

1. Spuntare o togliere un tag invia **solo quel tag** (aggiungi o rimuovi) e non tocca gli altri.
2. Una lettura dei tag fallita è "sconosciuto": l'interfaccia lo mostra e non permette modifiche finché la lettura non riesce. Non equivale mai a "nessun tag".
3. Un fallimento della scrittura è visibile, e la checkbox torna allo stato reale.
4. Dopo la scrittura, la pagina adotta la lista restituita dal server.

## Vincoli

- Le regole esistenti restano: il permesso di modifica, la sola lettura per i viewer, i tag disattivati assegnati che restano visibili e rimovibili.
- La copia dei tag dalla versione alla creazione del progetto (`copyVersionTagsToProject`) resta invariata.
- Nessun build step; cache-busting dei file modificati in tutte le pagine che li caricano.
- Testi utente in inglese.

## Criteri di accettazione

- [ ] Due schede: A aggiunge il tag X, poi B (aperta prima) aggiunge Y; sul server ci sono X e Y (`test-api.js` sulle route, più una verifica a mano).
- [ ] Con la lettura dei tag fallita, le checkbox non sono modificabili e c'è un messaggio; nessuna scrittura parte.
- [ ] Una scrittura fallita mostra un messaggio e la checkbox torna allo stato del server, su entrambe le pagine.
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano.
- [ ] Documentazione: `docs/api/attribute-lists.md` o la doc delle route toccate, `docs/pages/costgrid.md` e `docs/pages/project-config.md`.
- [ ] Regole del progetto: le scritture dei tag sono tolte dalla lista delle eccezioni del guard; il guard passa.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` sui tag sono rilette; quelle superate vengono chiuse al Gate 5 con il controllo eseguito.

## Scope escluso

- Gestione delle liste e delle voci (`attribute-lists.html`): ciclo 6.
- Registro delle modifiche per i tag.
- Copia dei tag in "Clone proposal" (voce già nota, ciclo a sé).

## Scelte aperte per /brainstorming

1. Endpoint puntuali (`POST`/`DELETE …/tags/:itemId`) oppure il `PUT` della lista intera con una versione.
2. Se mantenere il `PUT` di sostituzione per altri usi o rimuoverlo.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
