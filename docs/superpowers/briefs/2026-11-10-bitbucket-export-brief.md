# Brief — Export del solo sito verso Bitbucket

**Tipo:** nuova feature (Scenario 1), confermata dall'utente il 2026-11-10.
**Origine:** richiesta in chat del 2026-11-10: pubblicare il codice su GitHub (tutto, come oggi) e su Bitbucket (solo i file che fanno funzionare il sito, senza i file di processo e dei cicli). L'utente ha scartato lo spostamento dei file in una `webfolder/` + `git subtree` e ha accettato un commit per export su Bitbucket. Il ciclo non è in programma subito.

## Contesto (stato di oggi, per chi progetta)

- Un solo remote: `origin` → GitHub (`git remote -v`).
- File di processo e file del sito stanno insieme: i `*.test.js` sono accanto ai sorgenti in `js/`, `js/lib/`, `api/src/`; nella root ci sono `CLAUDE.md`, `PRD.md`, `test-api.js`, `vitest.config.js`, `package.json`; i documenti del viewer stanno sotto `handbook/` (`ARCHITECTURE.md`, `TEST_CASES.md`, la checklist di produzione) e la pagina è `help.html` (updated 2026-11-11, handbook viewer).
- `docker-compose.yml` fa servire a nginx tutta la root del repo (`./:/usr/share/nginx/html:ro`); il servizio `test` (profilo `test`) monta `./test-api.js`. I file dev non vengono serviti solo grazie alle regole `return 404` in `nginx.conf` (blocco "DEV-ONLY TOOLCHAIN").
- `api/package.json` ha gli script `dev` (nodemon) e `test` (`node --test src/**/*.test.js`) e `nodemon` in `devDependencies`. `api/Dockerfile` copia tutto `src/`.
- `.env.example` contiene una sezione per le porte di `scripts/test-branch.sh`.

## Comportamento atteso

1. Un comando lanciato a mano (script + voce eseguibile da VS Code, per esempio `npm run` o un task) esporta un commit di `main` verso il repo Bitbucket.
2. L'export contiene **solo** i file elencati in un elenco unico e versionato, con regole di inclusione ed esclusione per path:
   - **Inclusi:** le pagine `*.html` dell'app (`help.html` compresa); `handbook/`; `js/` (`js/lib/test-cases-parse.js` compreso), `css/` (`assets/` was deleted on 2026-11-11, B-448); `api/` (`Dockerfile`, `package.json`, `package-lock.json`, `src/` con routes, services, lib, middleware, db/migrations, `create-admin.js`, `promote-sysadmin.js`); `nginx.conf`, `docker-compose.yml` (vedi domande aperte), `.env.example`, `.gitignore`.
   - **Esclusi:** `docs/`, `.claude/`, `.superpowers/`, `scripts/` (compreso `backup-db.sh`), `CLAUDE.md`, `PRD.md`, `test-api.js`, `vitest.config.js`, i `package.json`/`package-lock.json` della root, ogni `*.test.js`/`*.spec.js`, `api/src/scripts/`, `api/nodemon.json`.
3. Su Bitbucket ogni export produce **un commit**, il cui messaggio riporta l'hash del commit GitHub di partenza. Un export senza differenze rispetto al precedente non crea un commit vuoto.
4. I file eliminati dal sito tra un export e l'altro spariscono anche su Bitbucket: l'export rispecchia l'elenco, non si limita ad aggiungere.
5. L'export parte da un commit, non dal working tree: modifiche non committate e file gitignored (`.env`, `backups/`, `node_modules/`) non possono finire su Bitbucket.
6. Un guard test fallisce quando un file tracciato non è coperto da nessuna regola dell'elenco: un file nuovo va classificato come sito o come processo, non entra o resta fuori in silenzio.
7. Il push su GitHub resta quello di oggi, senza nessun cambiamento.
8. **Accettato dall'utente (2026-11-11, handbook viewer):** architettura e checklist di produzione, sotto `handbook/restricted/`, sono visibili a chi accede al repo Bitbucket.

## Vincoli

- **Il repo GitHub non cambia struttura:** nessun file del sito viene spostato, nessun percorso esistente cambia.
- **Il runtime resta senza build step** (`CLAUDE.md` → "Testing & tooling"): l'export copia i file così come sono, senza bundling né trasformazioni del contenuto.
- **Un'unica definizione dell'elenco:** lo script e il guard test leggono lo stesso file; la regola vive in un posto (`CLAUDE.md` → "Writing documentation").
- **Classificazione per path, mai per contenuto**, come per `scripts/classify-cycle.mjs` e `scripts/gate5-scope.mjs`.
- **Lo script gira su questo host Windows** (Git Bash) e da VS Code; i file `.sh` con fine riga LF (`.gitattributes`).
- **Le credenziali Bitbucket non entrano nel repo** né nell'export.
- **Il push verso un remote esterno è un'azione rivolta all'esterno:** lo script mostra cosa esporterà (commit di partenza, file aggiunti, modificati ed eliminati) e chiede conferma prima del push.

## Criteri di accettazione

- Su un clone di prova del repo Bitbucket, l'export di `main` produce un albero il cui elenco di file (`git ls-files`) coincide esattamente con le regole di inclusione: nessun file di `docs/`, `.claude/`, `scripts/` e nessun `*.test.js`.
- Un secondo export dello stesso commit non crea nessun commit.
- Dopo l'eliminazione di un file del sito su GitHub, l'export successivo lo elimina su Bitbucket.
- Il messaggio del commit su Bitbucket contiene l'hash completo del commit GitHub esportato.
- Un file non committato o gitignored presente nel working tree non compare nell'export.
- Il guard test è rosso quando si aggiunge un file tracciato fuori da ogni regola, verde quando l'elenco lo classifica; è incluso in `npm test`.
- Lo stack avviato dal solo contenuto esportato (con un `.env` compilato da `.env.example`) si avvia e la pagina di login risponde su `http://localhost`.
- Lo script non fa push senza la conferma esplicita dell'utente.

## Scope esplicitamente escluso (confermato dall'utente il 2026-11-10)

- Ristrutturare il repo (`webfolder/` o simili).
- La storia commit per commit su Bitbucket.
- L'export automatico (git hook, GitHub Action, CI).
- La sincronizzazione inversa da Bitbucket a GitHub.
- La pulizia dei commenti nel codice che citano `docs/` o file di processo: vengono esportati così come sono.
- Bitbucket Pipelines o deploy da Bitbucket.
- La creazione del repo Bitbucket e dei suoi accessi: li gestisce l'utente fuori dal ciclo.

## Domande aperte per `/brainstorming`

1. **`docker-compose.yml`:** la versione su Bitbucket non deve montare `./test-api.js` e dovrebbe servire solo i file del sito invece dell'intera root. Le strade possibili: un compose dedicato a Bitbucket, il file condiviso ripulito (con il servizio `test` spostato in un override solo GitHub), oppure un file generato dall'export.
2. **`nginx.conf`:** su Bitbucket il blocco "DEV-ONLY TOOLCHAIN" e il suo commento non servono. Si esporta così com'è (innocuo) o lo si separa?
3. **`api/package.json`:** gli script `dev`/`test` e `nodemon` in `devDependencies` puntano a file esclusi. Si esporta così com'è o lo si riduce?
4. **`.env.example`:** la sezione delle porte di `scripts/test-branch.sh` riguarda un file escluso. Si tiene o la si toglie dall'export?
5. **`js/lib/test-cases-parse.js`:** chiusa (2026-11-11, handbook viewer): il suo consumatore è `help.html`, che è incluso, quindi il file è incluso.
6. **Meccanismo dell'export:** clone di lavoro del repo Bitbucket fuori dal repo, oppure ramo orfano locale (per esempio `bitbucket-export`) con push `ramo:main`. Dove vive il clone e come si chiama il remote.
7. **Formato dell'elenco:** un file dedicato (stile gitignore) oppure `export-ignore` in `.gitattributes` + `git archive`. Il guard deve poter leggere lo stesso formato.
8. **Da quale commit si esporta:** sempre `HEAD` di `main` oppure un ref a scelta (tag di rilascio). Si crea un tag su GitHub a ogni export?
9. **Classe di rischio (§6.1b):** tocca `scripts/` e il compose, e fa un push esterno.

Brief ready. Next step: /brainstorming.
