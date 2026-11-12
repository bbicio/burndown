# Brief — Classificazione sito/processo e copia verso la cartella Bitbucket

**Tipo:** nuova feature (Scenario 1), primo dei due cicli in cui si divide l'export verso Bitbucket.
**Origine:** conversazione del 2026-11-12. Il brief `2026-11-10-bitbucket-export-brief.md` resta il riferimento per l'intero export; questo ne estrae la parte che **non dipende** dalla risposta dell'amministratore del workspace Bitbucket. Il secondo ciclo (commit con l'hash di partenza, conferma, push) è rinviato a dopo quella risposta.

## Contesto (stato di oggi, per chi progetta)

- Un solo remote nel repo: `origin` → GitHub. Il repo Bitbucket non è un remote di questo repo.
- Il repo Bitbucket di destinazione, `HealthwareGroup/it_hwg_pdash`, è già clonato in locale fuori dal repo, in `C:\Users\Fabrizio.Fortini\Progetti\it_hwg_pdash`. Su `main` ha solo un commit di prova e la sua rimozione: non contiene file. Esiste ancora sul server un branch di prova che solo un amministratore può togliere.
- L'accesso in lettura e scrittura da questo PC è stato provato il 2026-11-12. L'utente ha il permesso di scrittura sul repo, non quello di amministrazione.
- Git Credential Manager su questo PC è vecchio e Bitbucket Cloud lo bloccherà dal 2026-11-30; l'aggiornamento richiede l'IT. Non riguarda questo ciclo, perché non fa push.
- Il modello operativo di Bitbucket (push diretto su `main` o pull request, restrizioni sui branch) è da concordare con l'amministratore.
- L'utente non ha diritti di amministratore sul PC.

## Comportamento atteso

1. **Un elenco unico e versionato di regole per path**, con regole di inclusione ed esclusione, che dice per ogni file tracciato se è del sito o di processo. Le regole di partenza sono quelle del brief del 2026-11-10 (sezione "Comportamento atteso", punto 2), con le decisioni di classificazione qui sotto.
2. **Un comando di sola lettura** che stampa, per un commit scelto, i file inclusi e quelli esclusi, e per ognuno la regola che lo ha deciso.
3. **Un comando che copia i file inclusi** da un commit di `main` nella cartella del clone Bitbucket:
   - parte da un commit, non dal working tree: modifiche non committate e file gitignored non possono finire nella copia;
   - aggiunge e aggiorna i file inclusi e **cancella** quelli che non lo sono più, così la cartella rispecchia l'elenco;
   - non tocca mai la cartella `.git` della destinazione;
   - mostra cosa farà (aggiunti, modificati, eliminati) e aspetta il sì dell'utente prima di scrivere; ha anche una modalità che non scrive;
   - **non fa commit e non fa push**: il passo successivo resta a mano finché non c'è il secondo ciclo;
   - la prima volta non ha una procedura a parte: con una destinazione senza file, tutto risulta da aggiungere.
4. **Un guard test**, incluso in `npm test`, che fallisce quando un file tracciato non è coperto da nessuna regola, o quando un file di processo risulta incluso. Un file nuovo va classificato: non entra e non resta fuori in silenzio.
5. Il push su GitHub e la struttura del repo restano quelli di oggi.

## Decisioni di classificazione già prese (2026-11-12)

I file del brief precedente restano come lì. Per i file che quel brief non nomina, la scelta di partenza è questa. **Quelle contrassegnate con * possono andare diversamente** e vanno riconfermate in `/brainstorming`.

| File | Scelta | Motivo |
|---|---|---|
| `api/src/db/reset-dev.sql` | escluso | cancella dati di sviluppo e contiene un indirizzo email personale scritto nel codice |
| `api/src/trust-device.js` | escluso | lo usano solo `test-api.js`, `scripts/shoot.mjs` e lo script di seed, già esclusi |
| `api/src/two-step-code.js` e `api/src/cli-env.js` * | inclusi | codice di accesso di emergenza su uno stack già installato; `cli-env.js` è il supporto che quel file e `trust-device.js` caricano |
| `api/src/db/migrate.js` | incluso | è lo script `migrate` di `api/package.json`, che è incluso |
| `.gitattributes` | escluso | contiene solo la regola sui fine riga dei file `.sh`, tutti esclusi |
| `_db-reset.html`, `_terms-editor.html` | inclusi | pagine sysadmin dell'app, coperte dalla regola `*.html` |
| `docker-compose.yml`, `nginx.conf`, `api/package.json`, `.env.example` * | inclusi **così come sono** | nessuna trasformazione dei contenuti; la pulizia dei riferimenti a file esclusi è rinviata (domande 1-4 del brief precedente) |

Formato dell'elenco: un file dedicato con regole ordinate per path, letto sia dai comandi sia dal guard test. Non si usa `export-ignore` con `git archive`, che legherebbe la classificazione a un meccanismo di export ancora non scelto.

## Vincoli

- **Il repo GitHub non cambia struttura:** nessun file del sito viene spostato, nessun percorso esistente cambia.
- **Il runtime resta senza build step** (`CLAUDE.md` → "Testing & tooling"): la copia porta i file così come sono, senza bundling né trasformazioni.
- **Un'unica definizione dell'elenco:** i comandi e il guard test leggono lo stesso file (`CLAUDE.md` → "Writing documentation").
- **Classificazione per path, mai per contenuto**, come per `scripts/classify-cycle.mjs` e `scripts/gate5-scope.mjs`.
- **Lo script gira su questo host Windows** (Git Bash) e da VS Code; i file `.sh` con fine riga LF (`.gitattributes`).
- **La destinazione è fuori dal repo e non si scrive mai nel repo stesso:** il comando rifiuta una destinazione che non sia un clone git separato, e non la cancella né la sovrascrive in blocco.
- **Nessuna credenziale** entra nel repo né nella copia.
- **La verifica non tocca lo stack principale:** lo stack avviato dai file copiati usa un progetto Compose e porte propri (Infrastructure safety in `CLAUDE.md`).

## Criteri di accettazione

- Il comando di sola lettura elenca per un commit i file inclusi ed esclusi, con la regola di ciascuno; nessun file di `docs/`, `.claude/`, `scripts/`, nessun `*.test.js` e nessun file escluso dalla tabella sopra risulta incluso.
- Dopo la copia in una cartella senza file, il suo elenco di file (`git ls-files` più i file non tracciati, escluso `.git`) coincide esattamente con le regole di inclusione.
- Una seconda copia dello stesso commit non cambia nulla.
- Dopo l'eliminazione di un file del sito, la copia successiva lo elimina anche nella destinazione.
- Un file non committato o gitignored presente nel working tree non compare nella copia.
- Il guard test è rosso quando si aggiunge un file tracciato fuori da ogni regola, verde quando l'elenco lo classifica; è incluso in `npm test`.
- Lo stack avviato dal solo contenuto copiato (con un `.env` compilato da `.env.example`), su un progetto Compose isolato, si avvia e la pagina di login risponde.
- Il comando non scrive niente senza il sì dell'utente e non esegue mai `git commit` né `git push`.

## Scope esplicitamente escluso

- Il commit su Bitbucket, il messaggio con l'hash di partenza, il push e la conferma prima del push: secondo ciclo, dopo la risposta dell'amministratore.
- La scelta del commit di partenza come tag di rilascio.
- Ripulire i contenuti di `docker-compose.yml`, `nginx.conf`, `api/package.json`, `.env.example` o i commenti che citano file di processo.
- Ristrutturare il repo, la storia commit per commit, l'export automatico, la sincronizzazione inversa, Bitbucket Pipelines.
- L'aggiornamento di Git Credential Manager, il Main branch e la rimozione del branch di prova su Bitbucket: li gestisce l'utente con l'IT e l'amministratore.

## Domande aperte per `/brainstorming`

1. **Dove sta il percorso della destinazione:** argomento del comando, variabile d'ambiente o file locale non versionato. Il percorso dell'utente non deve finire nel repo.
2. **Destinazione con modifiche non committate:** il comando rifiuta, oppure procede e le mostra nel riepilogo.
3. **Da quale commit si copia per default:** `HEAD` di `main` oppure un ref a scelta; con un working tree sporco o un branch diverso da `main` cosa fa.
4. **Le scelte con * nella tabella:** riconferma.
5. **Cosa conta come "tracciato e non classificato":** i file con nome fuori da ogni regola, ma anche le cartelle nuove di primo livello.
6. **Classe di rischio (§6.1b):** tocca `scripts/` e scrive fuori dal repo, ma non fa push e non tocca lo stack principale.

Brief ready. Next step: /brainstorming.
