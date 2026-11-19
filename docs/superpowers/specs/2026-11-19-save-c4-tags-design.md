# Contratto di salvataggio, ciclo 4: tag di versioni e progetti — design spec

**Date:** 2026-11-19
**Brief started:** 2026-11-17 17:32
**Brief:** `docs/superpowers/briefs/2026-11-17-save-c4-tags-brief.md`
**Audit:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md` (SY-11)
**Scenario:** 3 (audit-fix)
**Classe di rischio:** high-risk (file condivisi caricati da più pagine: `js/api.js`, `js/lib/save.js`; nessuna migrazione) — il Brief diceva standard, §6.1b decide
**Security surface:** no

Spuntare o togliere un tag scrive solo quel tag. Una lettura fallita è "sconosciuto", mai "nessun tag". Una scrittura fallita si vede, e la checkbox torna allo stato del server. Dopo ogni scrittura la pagina adotta la lista che il server restituisce.

## 1. Fatti verificati

- `PUT /api/projects/:id/tags` (`api/src/routes/projects.js`) e `PUT /api/cost-grids/:id/versions/:vId/tags` (`api/src/routes/cost-grids.js`) fanno `DELETE` più `INSERT` della lista intera in una transazione e rispondono `{ ok: true }`.
- I loro unici chiamanti sono:
  - `toggleTag` di `js/pages/project-config.js` e di `js/pages/costgrid.js`, tramite `Api.projects.tags.replace` e `Api.costGrids.versions.tags.replace`;
  - `test-api.js` (casi `TAG-*`);
  - `js/lib/save-overlay-trigger.test.js`.
- `loadTags` (project-config) e `openVersion` (costgrid) mettono la lista a `[]` quando il `GET` fallisce.
- I due toggle passano `background: true`, così nessun overlay copre la pagina. `apiSave` (`js/lib/save.js`) non ha modo di inoltrare questa opzione.
- Le due scritture sono in `CLIENT_EXEMPT` di `scripts/save-contract-guard.test.js`.
- I tag non sono entità registrate: niente `versionedWrite` e niente `change_log`.
- `copyVersionTagsToProject`, la copia dei tag in "+ New version" e quella in duplicate non usano le route di sostituzione completa.

## 2. Server

### 2.1 Tag di un progetto

- `PUT /api/projects/:id/tags/:itemId` assegna il tag (`INSERT … ON CONFLICT DO NOTHING`).
- `DELETE /api/projects/:id/tags/:itemId` toglie il tag.
- Entrambe sono idempotenti: assegnare un tag già assegnato o togliere un tag assente risponde 200.
- Rispondono `200` con la lista completa, nella stessa forma e nello stesso ordine di `GET /api/projects/:id/tags`.
- Permessi ed errori:
  - `canEdit` → 403;
  - progetto inesistente → 404;
  - `itemId` non UUID → 400 `itemId must be a valid UUID`;
  - item inesistente (`23503`) → 400 `Tag item does not exist`.
- `enqueueProjectCode` parte solo quando una riga è stata davvero inserita o cancellata.
- Si accetta qualunque item esistente, anche un item disattivato, come oggi.

### 2.2 Tag di una versione

- `PUT /api/cost-grids/:id/versions/:vId/tags/:itemId` assegna il tag, `DELETE` sulla stessa route lo toglie. Valgono la stessa idempotenza e la stessa risposta di §2.1, con la lista di `GET …/versions/:vId/tags`.
- Errori:
  - `canEdit` sulla grid → 403;
  - versione non appartenente alla grid → 404 `Version not found`;
  - versione bloccata → 400 `Version is locked`;
  - UUID non valido e item inesistente come in §2.1.

### 2.3 Rimozioni

- Le due route `PUT …/tags` di sostituzione completa vengono cancellate.
- La lettura della lista diventa una funzione per file (`listProjectTags`, `listVersionTags`), condivisa tra il `GET` e le due scritture.

## 3. Client

### 3.1 `js/lib/save.js`

- La firma diventa `apiSave(method, path, body, opts)`. `opts.background === true` arriva ad `apiFetch` come `background: true`.
- Senza `opts`, il comportamento resta quello di oggi.

### 3.2 `js/api.js`

`Api.projects.tags.replace` e `Api.costGrids.versions.tags.replace` vengono cancellati. `list` resta.

### 3.3 Nuovo modulo `js/lib/tag-toggle.js`

`export async function tagToggle({ basePath, rows, itemId })`:

- `basePath` è `/projects/<id>/tags` oppure `/cost-grids/<cgId>/versions/<vId>/tags`.
- Se `rows` contiene `itemId`, fa `DELETE <basePath>/<itemId>`; altrimenti `PUT <basePath>/<itemId>`. In entrambi i casi passa per `window.apiSave` con `{ background: true }`.
- Restituisce `{ rows }` (la lista del server) quando l'outcome è `ok`, altrimenti `{ message }`, cioè il `message` dell'outcome; per `unknown` è `UNKNOWN_MESSAGE`.
- È un modulo ES con il bridge `window.tagToggle` per le pagine. Il nome è diverso da quello del metodo Vue `toggleTag`, che resta, così i due non si confondono.

### 3.4 Stato dei tag nelle due pagine

- **Stato:** `tagsState` vale `'loading' | 'ok' | 'unknown'`. Le righe stanno in `projectTags` (project-config) e in `versionTagRows` (costgrid). In costgrid `versionTagItemIds` diventa una computed derivata da `versionTagRows`.
- **Lettura fallita:**
  - `tagsState = 'unknown'` e le righe restano quelle precedenti, mai `[]`;
  - le checkbox sono disabilitate (`tagsState !== 'ok'` si aggiunge al `:disabled` attuale) e nessuna scrittura parte;
  - nella sezione aperta compare un messaggio inline, *"Tags could not be loaded."*, con un pulsante **Retry** che rilegge la lista;
  - il sommario chiuso mostra *"Unavailable"* al posto di *"None selected"*.
- **Scrittura riuscita:** la pagina adotta `rows` e il messaggio di errore della sezione scompare.
- **Scrittura fallita:**
  - la sezione mostra `message` inline;
  - la pagina rilegge la lista dal server: se la rilettura riesce, la checkbox torna allo stato reale; se fallisce, `tagsState = 'unknown'`;
  - la checkbox nativa viene subito riallineata (`event.target.checked`) allo stato delle righe adottate.
- **Guardie che restano:**
  - `tagSaving` blocca un secondo clic durante una scrittura;
  - i viewer e le versioni bloccate restano in sola lettura;
  - i tag disattivati assegnati restano visibili e rimovibili;
  - in costgrid un risultato si adotta solo se `verId` non è cambiato nel frattempo.

## 4. Guard — `scripts/save-contract-guard.test.js`

Escono da `CLIENT_EXEMPT` le voci `js/pages/costgrid.js: costGrids.versions.tags.replace` e `js/pages/project-config.js: projects.tags.replace`. Il commento sopra la lista non cita più il ciclo 4.

## 5. Cache-busting

Il `?v=N` va aumentato in ogni pagina che carica il file. I file toccati sono:

- `js/api.js` e `js/lib/save.js`;
- `js/pages/costgrid.js` e `js/pages/project-config.js`.

`js/lib/tag-toggle.js` entra in `costgrid.html` e `project-config.html` con `?v=1`, prima dello script di pagina.

## 6. Documentazione

- `docs/api/attribute-lists.md`: le route di assegnazione dei tag (§2) e la sparizione delle due route di sostituzione completa.
- `docs/pages/costgrid.md` e `docs/pages/project-config.md`: lo stato `unknown`, il Retry, l'errore inline e l'adozione della lista del server.
- `docs/js/lib.md`: `tag-toggle.js` e il nuovo argomento `opts` di `apiSave`.
- `handbook/restricted/TEST_CASES.md`: i casi `TAG-*` cambiati.

## 7. Verifica

- **`test-api.js`:**
  - i casi `TAG-*` che usano la sostituzione completa si portano sulle route puntuali;
  - nuovi casi:
    - due client: A assegna X, poi B (che non ha riletto) assegna Y → il `GET` contiene X e Y;
    - assegnazione ripetuta e rimozione di un tag assente → 200;
    - versione bloccata → 400;
    - viewer → 403;
    - item inesistente → 400;
    - la risposta contiene la lista completa.
- **vitest:**
  - `js/lib/tag-toggle.test.js` (`tagToggle`): la scelta tra `PUT` e `DELETE`, il path, `background`, i tre outcome;
  - `js/lib/save.test.js`: `opts.background` inoltrato;
  - `js/lib/save-overlay-trigger.test.js` aggiornato ai nuovi chiamanti.
- **A mano (Gate 2):** le due schede, la lettura fallita (route bloccata da DevTools) e la scrittura fallita, su entrambe le pagine.

## Criteri di accettazione

1. **Due schede** — A aggiunge X, poi B (aperta prima) aggiunge Y; sul server ci sono X e Y (`test-api.js`; a mano su entrambe le pagine).
2. **Lettura fallita** — le checkbox non sono modificabili, compaiono il messaggio e Retry, il sommario dice "Unavailable", e nessuna scrittura parte (a mano; vitest dove il codice è puro).
3. **Scrittura fallita** — compare un messaggio inline e la checkbox torna allo stato del server, su entrambe le pagine (vitest su `tag-toggle.js`; a mano).
4. **Adozione** — dopo una scrittura la pagina mostra la lista restituita dal server (`test-api.js` sulla risposta; a mano).
5. **Guard** — le voci dei tag sono uscite da `CLIENT_EXEMPT` e `scripts/save-contract-guard.test.js` passa.
6. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
7. **Documentazione** — i documenti di §6 sono aggiornati; `scripts/doc-paths-guard.test.js` passa.
8. **Backlog** — le voci aperte di `docs/BACKLOG.md` sui tag sono rilette; quelle superate si chiudono al Gate 5 con il controllo eseguito.

## Scope escluso

- Gestione di liste e voci (`attribute-lists.html`): ciclo 6.
- Registro delle modifiche per i tag.
- Copia dei tag in "Clone proposal".
- `js/tags.js` che usa `fetch` diretto (già in BACKLOG).
- Una regola che rifiuti l'assegnazione di un item disattivato.

## Finding nuovi (da proporre come Brief futuri, non in questo ciclo)

Nessuno.

## Decisioni aperte

1. **Endpoint puntuali per un singolo tag (`PUT`/`DELETE …/tags/:itemId`) che rispondono con la lista completa.** Alternativa scartata: il `PUT` della lista intera con una versione. Perché: servirebbe una colonna di versione, cioè una migrazione, esclusa dal Brief.
2. **Assegnazione con `PUT`, idempotente.** Alternativa scartata: `POST`. Perché: assegnare due volte lo stesso tag è un no-op naturale, non un errore.
3. **Le route di sostituzione completa e i metodi `Api.*.replace` vengono cancellati.** Alternativa scartata: tenerli per altri usi. Perché: non hanno altri chiamanti, e la regola del progetto elimina un metodo `Api.*` senza chiamanti.
4. **`apiSave` riceve un `{ background }` facoltativo.** Alternativa scartata: l'overlay a ogni spunta. Perché: il toggle è volutamente senza overlay, e un test lo fissa.
5. **Dopo una scrittura fallita la lista si rilegge dal server.** Alternativa scartata: il ripristino locale dello stato precedente. Perché: con l'outcome `unknown` la scrittura può essere avvenuta, e solo la rilettura dà lo stato reale.
6. **Una lettura fallita mostra un messaggio inline con Retry, e "Unavailable" nel sommario.** Alternativa scartata: un messaggio che chiede di ricaricare la pagina. Perché: Retry costa poco e non fa perdere le modifiche non salvate del form.
7. **Un modulo condiviso, `js/lib/tag-toggle.js`.** Alternativa scartata: la stessa logica duplicata nelle due pagine. Perché: i criteri sui fallimenti si testano in un punto solo.
8. **Nessuna regola nuova sugli item disattivati: il server accetta qualunque item esistente.** Alternativa scartata: rifiutare l'assegnazione di un item inattivo. Perché: sarebbe una regola nuova, fuori dallo scope.
