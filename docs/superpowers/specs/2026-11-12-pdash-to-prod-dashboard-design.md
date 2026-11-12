# PDash To Prod: dashboard locale per l'export verso Bitbucket — design spec

**Date:** 2026-11-12
**Brief started:** unknown
**Brief:** nessuno (richiesta diretta dell'utente, dalle istruzioni manuali `PDASH_SCRIPT_BITBUCKET.txt`)
**Scenario:** 1 (nuova funzionalità)

Una pagina locale, brandizzata PDash, guida la sequenza manuale con cui, a fine ciclo, i file del sito passano da `burndown` al clone Bitbucket `it_hwg_pdash`: controllo del repo, elenco, controlli, prova a secco, copia, commit, push; più un pannello per lo stack Docker di verifica e uno storico delle operazioni. La dashboard vive in una cartella propria, `C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod\`, fuori da `burndown` e da `it_hwg_pdash`. In `burndown` cambia una sola cosa: `export:copy` impara `--yes --sha`.

Due consegne distinte: (1) il flag, con il processo normale del progetto; (2) la cartella `PDash_To_Prod`, costruita fuori dal repo, con `git init` locale e nessun remote.

## 1. Fatti verificati (a `ac84f26`)

- `scripts/site-export.mjs` espone `list [ref]` e `copy [ref] [--dest <dir>] [--dry-run]`; `parseArgs` è stretto: un flag sconosciuto, `--dest` senza valore o un secondo posizionale sono errori.
- `copy` chiede `Write these changes to the destination? [y/N]` e rifiuta senza terminale interattivo (`process.stdin.isTTY`/`stdout.isTTY`); `docs/scripts/site-export.md` dichiara «There is no `--yes`».
- `export:list` esce con 1 quando un file non è classificato; `copy` allora rifiuta.
- `list` stampa `commit <sha>`, poi `include`, `exclude`, `unclassified`; `copy --dry-run` stampa `commit <sha>`, `destination …`, `added: N`, `modified: N`, `deleted: N` con gli elenchi, e `warning:` / `Refusing to copy` nei casi di rifiuto.
- Nessun riferimento a `export-liste` nei file `.md`, `.mjs`, `.js` e `.rules` del repo: la cartella di lavoro dell'utente si può rinominare senza toccare file versionati.
- Su Windows, Node (≥ 20.12) non avvia i file `.cmd` senza shell: `npm` si lancia come `cmd.exe /d /s /c npm.cmd …`.
- La dashboard e il suo codice non sono nel repo: non entrano in `scripts/site-export.rules`, non sono visti dai guard e non arrivano al Bitbucket.

## 2. Il flag in `burndown` (consegna 1)

`scripts/site-export.mjs`, comando `copy`:

- `--yes` salta la domanda `y/N`; **richiede** `--sha <40 caratteri esadecimali minuscoli>`. `--yes` senza `--sha`, `--sha` senza `--yes` e `--sha` malformato sono errori di argomento.
- La copia procede solo se lo SHA risolto dal ref coincide con `--sha`; altrimenti rifiuta prima di scrivere, con un messaggio che riporta i due SHA.
- `--yes` non aggira nessuno degli altri rifiuti (file non classificati, voci non regolari, destinazione non valida, piano non applicabile). `--yes` insieme a `--dry-run` è accettato e non scrive.
- Il comportamento senza `--yes` non cambia, compreso il rifiuto senza terminale.
- `docs/scripts/site-export.md` sostituisce la frase «There is no `--yes`» con la regola nuova; i test stanno in `scripts/site-export.test.js` (`parseArgs`, il rifiuto per SHA diverso, la copia con `--yes --sha` giusto, i rifiuti che restano).

## 3. La dashboard (consegna 2)

### 3.1 Cartella

```
PDash_To_Prod/
  start-dashboard.cmd     lancia node dashboard/server.mjs e apre il browser
  config.json             percorsi dei due repo, porta, nome del progetto Docker
  dashboard/
    server.mjs  steps.mjs  parse.mjs  history.mjs  docker.mjs
    index.html  brand.css
    test/                 node:test, con i due file reali come dati di prova
  lists/                  elenco-<data>.txt, prova-<data>.txt (i file di oggi, spostati)
  history.jsonl           lo storico
  override-check.yml      override dello stack di verifica
  README.md
```

`export-liste` viene rinominata in `PDash_To_Prod`, il suo contenuto va in `lists/`. `config.json` contiene `burndownDir`, `cloneDir`, `port`. Niente percorsi nel codice.

### 3.2 Server

Moduli Node built-in, nessuna dipendenza. HTTP su `127.0.0.1` alla porta di `config.json`. Serve la pagina e le API; l'output dei processi arriva alla pagina con Server-Sent Events.

All'avvio controlla: Node ≥ 20, `config.json`, i due percorsi sono repository git, porta libera. In caso contrario non parte e dice cosa manca.

**Sicurezza**
1. Solo gli id dei passi dichiarati in `steps.mjs` sono eseguibili. Comando, argomenti e cartella sono costanti; dalla richiesta non arriva nessun parametro.
2. Il messaggio di commit è `export from GitHub burndown <sha>`, con lo SHA preso dal passo 5 e validato con `^[0-9a-f]{40}$`.
3. Rifiuta `Origin` e `Host` diversi dal proprio; un token casuale per sessione, passato alla pagina all'avvio, è richiesto a ogni richiesta che esegue qualcosa.
4. Copia, commit, push, `stack-stop` richiedono un click di conferma con il riepilogo di cosa verrà scritto.
5. Un solo passo alla volta.
6. Ogni passo ha un timeout (5 minuti; 15 per `stack-start`); allo scadere il server termina l'albero di processi.

### 3.3 Sequenza (schede)

| # | Scheda | Azione | Si ferma se |
|---|---|---|---|
| 1 | Repository check | legge branch e stato; se `main` e pulito, `git pull`; rilegge `status -sb` e `log -1` | branch diverso da `main`; modifiche; dopo il pull la riga non è esattamente `## main...origin/main`. Non esegue mai `git switch` |
| 2 | Export list | `npm run export:list` su `lists/elenco-<data>.txt` | codice di uscita ≠ 0 |
| 3 | Count by category | conta `include`/`exclude`/`unclassified` dal file | `unclassified` ≠ 0 |
| 4 | Process-file check | le tre ricerche del file di istruzioni, sullo stesso elenco | una qualsiasi trova righe (le mostra) |
| 5 | Dry run | `export:copy --dry-run --dest <clone>` su `lists/prova-<data>.txt` | `warning:` o `Refusing to copy`; lo SHA della prova ≠ quello dell'elenco |
| 6 | Copy | `export:copy --yes --sha <sha della prova> --dest <clone>` | errore del comando |
| 7a | Clone status | `git status --porcelain` nel clone, come lista A/M/D | il clone non è su `main`; la lista ≠ quella della prova |
| 7b | Commit | `git add -A`; `git commit -m "export from GitHub burndown <sha>"` | niente da committare (nessun commit vuoto) |
| 7c | Push | `git push origin main` | push rifiutato; l'output di git resta visibile |

Il passo successivo si abilita solo se il precedente è riuscito nella stessa sequenza. Se l'ultimo commit di `main` cambia fra due schede, i passi 2-5 si invalidano e la sequenza riparte dal 1. Lo stato è in memoria: a un riavvio del server si riparte dal passo 1. Chiudere la pagina a metà passo non lo interrompe: l'esito si registra e la pagina lo ritrova.

Una nota fissa in fondo alla pagina ricorda che dal 2026-11-30 Bitbucket blocca il vecchio Git Credential Manager.

### 3.4 Pannello Verification stack

Indipendente dalla sequenza. Progetto Compose, nomi dei container e porte fissi nel codice (`ithwg-check`; `ithwg-check-db|api|nginx|adminer`; 5440, 8190, 8191); la pagina non li può cambiare.

- **Prepare:** crea `.env` nel clone da `.env.example` con `POSTGRES_PASSWORD=prova123` e un `JWT_SECRET` casuale, e scrive `override-check.yml`. Non sovrascrive un `.env` esistente.
- **Start:** verifica che le tre porte siano libere, poi `docker compose -p ithwg-check --project-directory <clone> -f <clone>/docker-compose.yml -f override-check.yml up -d --build`. Stato da `compose ps`; link a `http://localhost:8190/login.html` quando i container sono sani.
- **Stop and remove:** conferma esplicita; prima verifica che `compose -p ithwg-check ps` elenchi solo container `ithwg-check-*`, poi `down -v`. Mai il progetto `burndown` e mai i container `pdash-*`.
- Fuori ambito: migrazioni e utente admin dello stack di verifica.

### 3.5 Storico

`history.jsonl`, una riga JSON per operazione, solo in aggiunta, scritta alla fine dell'operazione anche se fallita; una riga troncata si salta e si segnala.

Campi: `id`, `runId`, `ts` (ISO con fuso locale), `durationMs`, `op` (`repo-check`, `export-list`, `dry-run`, `copy`, `commit`, `push`, `stack-prepare`, `stack-start`, `stack-stop`), `ok`, `error`, `sourceSha`, `destSha` (commit, push), `counts` e `files` (`{status: A|M|D, path}`) per `dry-run` e `copy`, i conteggi di `export-list`, `artifact` (percorso relativo in `lists/`).

Un «export» è un `push` con `ok`; i record con lo stesso `runId` ne danno data, SHA e file. Le prove a secco restano nello storico come `dry run`.

Vista: banner «Last published» (data, SHA, numero di file); pannello «Pending» = lista A/M/D dell'ultima prova, mostrata solo se il suo `sourceSha` coincide con `main` attuale, altrimenti «run steps 1-5 to refresh»; tabella cronologica con filtri per operazione ed esito e righe espandibili (con link al file in `lists/`, o «file missing»); ricerca per file.

Verifica incrociata, in sola lettura e senza `git fetch`: `git log origin/main` del clone, messaggi `export from GitHub burndown <sha>`; segnala un commit senza record di push e un record di push con `destSha` assente dal log.

### 3.6 Identità visiva

Testata navy `#0B1840` con riga magenta di 3px in basso; logo come `.pd-logo` dell'app (`P` magenta + `Dash` bianco, peso 700, `letter-spacing: -.02em`) e, a destra, l'etichetta `To Prod` in maiuscoletto, bordo magenta, testo bianco. `<title>` «PDash To Prod»; favicon SVG con la `P`. `brand.css` è un sottoinsieme di `css/tokens.css` copiato a mano. Azioni primarie in navy con testo bianco, magenta solo come accento; stati verde/rosso/ambra. Tutti i testi in inglese.

### 3.7 Test (`node:test`, nessun Docker né rete)

- `parse.mjs` contro `elenco-2026-11-12-1741.txt` e `prova-2026-11-12-1744.txt`, più casi con `warning:`, `Refusing to copy` e file non classificati.
- `steps.mjs`: nessun passo accetta parametri dalla richiesta; il messaggio di commit viene dallo SHA della prova.
- Server con esecutore finto: `Origin`/`Host` diversi, token sbagliato, un passo alla volta, passo fuori sequenza, `main` cambiato.
- Storico: append, riga troncata, ricostruzione di un export, verifica incrociata su un repository git temporaneo.
- `docker.mjs`: nome progetto, container e porte fissi; rifiuto di `down -v` se `ps` mostra container con un altro prefisso. L'esecuzione reale di Docker è verifica manuale.
- Verifica visiva: render con Chrome headless a larghezza desktop e tablet, immagini lette a confronto con `login.html` dell'app.

## 4. Fuori ambito

Migrazioni e creazione dell'admin nello stack di verifica; importazione dei file già presenti in `lists/` nello storico; pulizia automatica di `lists/`; modifica o cancellazione di righe dello storico dalla pagina; `git fetch` del clone.

## 5. Consegna

1. Ciclo in `burndown` (branch, test, review, `/finish-cycle`): il flag `--yes --sha` e la doc.
2. Dopo il merge: costruzione di `PDash_To_Prod` fuori dal repo, `git init` locale, `README.md`, spostamento dei file di `export-liste` in `lists/`, aggiornamento di `PDASH_SCRIPT_BITBUCKET.txt` ai nuovi percorsi.

## Decisioni aperte

1. **Server Node con soli moduli built-in e pagina HTML/JS vanilla.** Alternativa scartata: Vue da CDN, oppure PowerShell con `HttpListener`. Perché: nessuna dipendenza da rete o da `npm install`, e si testa con `node:test`.
2. **La dashboard vive in `PDash_To_Prod`, fuori da `burndown` e da `it_hwg_pdash`.** Alternativa scartata: dentro `burndown/scripts/`. Perché: non deve finire sul Bitbucket né passare dai guard, e l'utente vuole una cartella sola per tutto.
3. **`--yes` richiede `--sha` e rifiuta se non coincide con lo SHA risolto.** Alternativa scartata: `--yes` da solo. Perché: chiude il caso in cui `main` cambia fra la prova e la copia.
4. **La sequenza controlla branch e stato prima di agire e non esegue mai `git switch main`.** Alternativa scartata: riprodurre alla lettera il passo 1 del file di istruzioni (switch, poi controllo). Perché: lo switch non deve cambiare branch al posto dell'utente.
5. **Il passo 7a confronta il clone con la lista della prova prima di `git add -A`.** Alternativa scartata: `git add -A` subito dopo la copia. Perché: intercetta i file estranei nel clone.
6. **«Pending» è l'ultima prova a secco, valida solo se il suo SHA è quello di `main`.** Alternativa scartata: un diff separato fra l'ultimo SHA pubblicato e `main`. Perché: è la stessa lista che la copia userebbe, quindi non può divergere.
7. **Lo storico è `history.jsonl` fuori dai repo, con verifica incrociata in sola lettura del `git log origin/main` del clone.** Alternativa scartata: solo il `git log` del clone, oppure un file dentro `burndown`. Perché: il log non conserva prove a secco, errori né liste di file; un file nel repo sparisce con un worktree nuovo.
8. **Il pannello Docker non include migrazioni né admin.** Alternativa scartata: includerli ora. Perché: il file di istruzioni li lascia a uno script a parte, che è un lavoro più lungo.
9. **Avvio di `npm` tramite `cmd.exe /d /s /c npm.cmd` con argomenti costanti.** Alternativa scartata: `shell: true`. Perché: gli argomenti non devono mai passare da una shell che interpreti stringhe della richiesta.
10. **La spec sta in `burndown`, il codice della dashboard fuori.** Alternativa scartata: spec e codice nella cartella nuova. Perché: il flag è in `burndown` e il processo del progetto (registro delle decisioni, criteri di accettazione) vive qui.

## Criteri di accettazione

1. **Flag `--yes --sha`** — `npm run export:copy -- --yes --sha <sha di main> --dest <clone>` copia senza chiedere conferma; con uno SHA diverso, o senza `--sha`, rifiuta prima di scrivere.
2. **Senza `--yes` nulla cambia** — `npm run export:copy` da terminale chiede ancora `y/N` e senza terminale rifiuta.
3. **Sequenza 1-5** — dalla dashboard, con il repo pulito su `main`, i passi 1-5 passano e producono `lists/elenco-*.txt` e `lists/prova-*.txt`; con un file di processo incluso o un file non classificato la sequenza si ferma sul passo giusto.
4. **Scrittura 6-7c** — copia, commit e push chiedono una conferma ciascuno e il commit ha il messaggio `export from GitHub burndown <sha completo>`; con nulla da committare non si crea un commit.
5. **Sicurezza del server** — una richiesta con `Origin` estraneo o token errato è rifiutata; nessun comando fuori dai passi dichiarati si può avviare.
6. **Storico** — ogni operazione, anche fallita, aggiunge una riga a `history.jsonl`; la tabella mostra data, operazione, esito, SHA e file A/M/D; il banner «Last published» e il pannello «Pending» riflettono l'ultimo push e l'ultima prova.
7. **Verifica incrociata** — un commit `export from GitHub burndown <sha>` fatto a mano nel clone compare come segnalazione.
8. **Pannello Docker** — Start porta su lo stack `ithwg-check` raggiungibile su `http://localhost:8190/login.html`; Stop rimuove solo quel progetto e lascia intatti `pdash-db`, `pdash-api`, `pdash-nginx` e i loro volumi.
9. **Brand** — la pagina mostra il logo `PDash` con l'etichetta `To Prod` su testata navy con riga magenta, in inglese.
10. **Cartella** — `PDash_To_Prod` contiene tutto, i file di `export-liste` sono in `lists/` e `PDASH_SCRIPT_BITBUCKET.txt` punta ai nuovi percorsi.
