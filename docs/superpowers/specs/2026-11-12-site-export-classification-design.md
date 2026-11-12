# Export del sito: classificazione sito/processo e copia verso il clone Bitbucket — design spec

**Date:** 2026-11-12
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-12-bitbucket-export-classification-brief.md`
**Scenario:** 1 (nuova funzionalità)

Un elenco unico di regole per path dice, per ogni file tracciato, se è del sito o di processo. Un comando di sola lettura lo mostra per un commit; un secondo comando copia i file del sito di quel commit nel clone locale del repo Bitbucket, fuori dal repo, dopo conferma. Un guard test, in `npm test`, fallisce su file non classificati o su file di processo inclusi. Nessun commit, nessun push: sono il secondo ciclo.

## 1. Fatti verificati nel codice (a `c89fef2`)

- Un solo remote, `origin` → GitHub. Il clone di destinazione sta fuori dal repo.
- `docker-compose.yml` usa `container_name` fissi (`pdash-db`, `pdash-api`) e porte fisse: un progetto Compose isolato da solo non evita le collisioni con lo stack principale.
- Il `package.json` di root ha solo gli script `test` e `test:watch` (vitest, `include`: `js/**/*.test.js`, `scripts/**/*.test.js`). Un test sotto `scripts/` non richiede configurazione.
- `scripts/classify-cycle.mjs` e `scripts/gate5-scope.mjs` sono il modello: modulo puro in `scripts/lib/` o `.mjs` con test accanto, classificazione per path.
- File tracciati senza test accanto che il brief colloca fuori dal sito: `api/src/trust-device.js`, `api/src/db/reset-dev.sql`, `api/src/scripts/`, `api/nodemon.json`, `.gitattributes`, `test-api.js`, `vitest.config.js`, `package.json` e `package-lock.json` di root.

## 2. Design

### 2.1 Elenco `scripts/site-export.rules`

Una regola per riga, `include <glob>` oppure `exclude <glob>`; righe vuote e `#` ignorate. Vince la **prima** regola che combacia, quindi le eccezioni stanno sopra le regole generali (`exclude **/*.test.js` prima di `include js/**`). Non esiste una regola di chiusura: un file che nessuna regola copre è `unclassified`. Ogni scelta non ovvia della tabella del brief porta un commento di una riga.

### 2.2 Libreria `scripts/lib/site-export.mjs` (pura)

- `parseRules(text)` → regole con numero di riga; errore su una direttiva sconosciuta.
- `classify(paths, rules)` → per ogni path `{ path, verdict: 'include' | 'exclude' | 'unclassified', rule }`.
- `planCopy(included, destState)` → `{ added, modified, deleted }`.

Test accanto (`scripts/lib/site-export.test.js`).

### 2.3 CLI `scripts/site-export.mjs`

Esposta come `npm run export:list` e `npm run export:copy` nel `package.json` di root.

- **`list [ref]`** — sola lettura. Stampa lo SHA completo, poi i file inclusi ed esclusi con la regola di ciascuno. Legge l'albero con `git ls-tree -r`, quindi non vede working tree né file gitignored.
- **`copy [ref] [--dest <dir>] [--dry-run]`**
  1. Risolve il ref (default `main` locale) e legge i blob dei soli file inclusi.
  2. Risolve la destinazione e la valida (2.4).
  3. Confronta con il working tree della destinazione e stampa aggiunti, modificati, eliminati.
  4. `--dry-run` si ferma qui.
  5. Chiede `y/N`. Senza terminale interattivo rifiuta. Non esiste `--yes`.
  6. Scrive i file e cancella quelli non più inclusi.
  7. Non esegue mai `git commit`, `git push`, né scrive in `.git`.
- I contenuti si scrivono come byte del blob, senza conversioni di fine riga; il confronto è sui byte. Una seconda copia dello stesso commit non produce differenze.
- Se lo SHA non è contenuto in `origin/main`, avvisa senza rifiutare.

### 2.4 Destinazione

Da `--dest`, altrimenti dalla variabile d'ambiente `PDASH_EXPORT_DEST`; se mancano entrambi, errore. Il percorso non entra mai nel repo. Il comando rifiuta una destinazione che:

- non sia la radice di un clone git;
- coincida con il repo di origine o ne sia dentro;
- (percorsi confrontati dopo `realpath`).

Non rifiuta una destinazione con modifiche non committate: dopo ogni copia è sporca finché il secondo ciclo non committa; le modifiche compaiono nel riepilogo. L'insieme dei file della destinazione è `git ls-files -co --exclude-standard`: i file ignorati lì (`node_modules`, `.env`) non si toccano; i file non tracciati e non ignorati che non sono inclusi si cancellano, e compaiono nel riepilogo prima della conferma.

### 2.5 Guard `scripts/site-export-guard.test.js`

Legge `git ls-files` e `scripts/site-export.rules`. Fallisce quando:

- un file tracciato è `unclassified` (una cartella nuova di primo livello senza regola è un caso di questo);
- un file che combacia con l'insieme dei **mai inclusi** risulta incluso. L'insieme, scritto nel test, è: `docs/`, `.claude/`, `scripts/`, `*.test.js`/`*.spec.js`, `test-api.js`, `vitest.config.js`, `CLAUDE.md`, `PRD.md`, `.gitattributes`, `package.json` e `package-lock.json` di root, `api/nodemon.json`, `api/src/scripts/`, `api/src/trust-device.js`, `api/src/db/reset-dev.sql`.

Prova anche le regole su un elenco sintetico: un path fuori dalle regole è rosso, uno classificato verde.

**Limite dichiarato (intestazione del guard):** un file nuovo sotto un percorso incluso in blocco (`js/**`, `css/**`) entra senza decisione esplicita, a meno che combaci con un "mai incluso". Il guard controlla un'invariante, non la correttezza della classificazione.

### 2.6 Verifica dello stack dal contenuto copiato

Manuale, non un prodotto del ciclo: dopo una copia in una cartella temporanea, un override Compose con nomi di container, progetto e porte propri (come `scripts/test-branch.sh`), un `.env` compilato da `.env.example`, e la pagina di login che risponde. Non tocca lo stack principale.

## 3. Verifica automatica

- `scripts/lib/site-export.test.js`: regole (prima corrispondenza, glob, direttive errate), `planCopy`.
- Test d'integrazione con due repo git temporanei, sorgente e destinazione: copia in destinazione vuota (l'elenco coincide con le regole); seconda copia senza differenze; file eliminato nel sito eliminato anche nella destinazione; file non committato o gitignored assente dalla copia; `.git` della destinazione intatto; nessun commit creato; rifiuto di destinazioni non valide.
- `scripts/site-export-guard.test.js` come sopra.

## 4. Classe di rischio

`high-risk` — operazioni distruttive: il comando cancella file in una cartella esterna al repo. Tocca anche `scripts/`.

## Decisioni aperte

1. **Elenco in `scripts/site-export.rules`, regole ordinate con prima-corrispondenza-vince, senza regola di chiusura.** Alternativa scartata: `export-ignore` con `git archive`, e un elenco di soli file. Perché: il brief chiede regole per path, e "non classificato" deve restare rilevabile.
2. **Destinazione da `--dest` o `PDASH_EXPORT_DEST`.** Alternativa scartata: un file locale non versionato. Perché: una variabile d'ambiente non lascia tracce nel repo né richiede un file da gitignorare.
3. **Una destinazione con modifiche non committate non viene rifiutata.** Alternativa scartata: rifiutare quando è sporca. Perché: dopo una copia è sempre sporca finché il secondo ciclo non committa, e il rifiuto bloccherebbe la seconda copia.
4. **Default `main` locale; un altro ref solo se passato; avviso, non rifiuto, se lo SHA non è in `origin/main`.** Alternativa scartata: rifiutare un branch diverso da `main`. Perché: leggendo dal commit, il working tree è irrilevante.
5. **Riconferma delle scelte con asterisco: `two-step-code.js` e `cli-env.js` inclusi; `docker-compose.yml`, `nginx.conf`, `api/package.json`, `.env.example` inclusi così come sono.** Alternativa scartata: escludere i due file del codice di emergenza. Perché: `cli-env.js` è il supporto che `two-step-code.js` carica, e la pulizia dei contenuti è rinviata dal brief.
6. **Conferma `y/N` interattiva, senza `--yes`.** Alternativa scartata: `--yes` per l'uso scriptato. Perché: nessun uso scriptato è in programma e una scrittura fuori dal repo resta una scelta esplicita dell'utente.
7. **Cancella i file non più inclusi, anche non tracciati nella destinazione, ma non quelli ignorati da git lì.** Alternativa scartata: cancellare solo i tracciati. Perché: il criterio del brief è che `git ls-files` più i non tracciati coincidano con le regole.
8. **Il guard porta un insieme di "mai inclusi" scritto nel test.** Alternativa scartata: etichettare i file di processo dentro l'elenco. Perché: l'elenco resta l'unica definizione e il guard verifica solo un'invariante.
9. **Classe `high-risk`, per operazioni distruttive fuori dal repo.** Alternativa scartata: `standard`. Perché: nel dubbio vale la classe più alta.
10. **Verifica dello stack dal contenuto copiato manuale, con override Compose isolato.** Alternativa scartata: un test automatico. Perché: richiede Docker e build, e non vale la complessità per un controllo da fare una volta.

## Criteri di accettazione

1. **Elenco per commit** — `npm run export:list` stampa per un commit i file inclusi ed esclusi con la regola di ciascuno; nessun file di `docs/`, `.claude/`, `scripts/`, nessun `*.test.js` e nessun file escluso dal brief risulta incluso.
2. **Copia in cartella vuota** — dopo `export:copy` in una cartella senza file, `git ls-files` più i non tracciati (escluso `.git`) coincide con le regole di inclusione.
3. **Copia idempotente** — una seconda copia dello stesso commit non cambia nulla.
4. **Eliminazioni** — dopo l'eliminazione di un file del sito, la copia successiva lo elimina nella destinazione.
5. **Solo dal commit** — un file non committato o gitignored nel working tree non compare nella copia.
6. **Guard** — il guard è rosso quando si aggiunge un file tracciato fuori da ogni regola, verde quando l'elenco lo classifica, ed è eseguito da `npm test`.
7. **Stack** — lo stack avviato dal solo contenuto copiato (con `.env` da `.env.example`), su un progetto Compose isolato, si avvia e la pagina di login risponde.
8. **Nessuna scrittura non autorizzata** — il comando non scrive senza il sì dell'utente e non esegue mai `git commit` né `git push`.
