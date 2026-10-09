# Classificazione del Gate 2 in uno script eseguibile — design spec (2026-10-09)

Ciclo del programma di ottimizzazione processi, successivo al Cycle 2 (merge `689992a`). Traduce la
regola di classificazione "ciclo senza codice" del Gate 2 di `/finish-cycle` da prosa inglese a uno
script eseguibile e pinnato da test.

Scenario **2** (evoluzione di una feature esistente), classificazione confermata dall'utente.

---

## 1. Problema

Il Cycle 2 ha prodotto **21 finding in 3 round di code review** (9 / 10 / 2). **Tutti** riguardavano
*come esprimere in inglese una regola meccanica* — gestione delle rinomine, colonna di stato di
`--name-status`, match di prefisso contro sottostringa, caso della lista vuota, guard `.md` su
`.claude/` e su `docs/`. **Nessuno** riguardava cosa la regola debba fare: su quello l'accordo era
fissato dal `/brainstorming` di quel ciclo. Quattro dei finding erano errori di fatto nel *razionale*,
non nella regola.

La causa è il medium: una regola di decisione meccanica scritta in prosa non è verificabile da nulla.
L'unico pin esistente è una tabella di dry-run a 8 righe in
`docs/superpowers/plans/2026-10-09-finish-cycle-no-code-gate2.md`, che è documentazione — nessuno la
esegue.

Il difetto più costoso di quel ciclo lo illustra: il gate prescriveva `git diff --name-only` mentre
richiedeva anche che "entrambi i path di una rinomina qualifichino", cosa che quel comando rende
impossibile. **Verificato empiricamente il 2026-10-09** su un repo di prova: rinominando
`api/src/foo.js` in `docs/foo.md`, `--name-only` stampa solo `docs/foo.md`, mentre
`--name-status --find-renames` stampa `R100  api/src/foo.js  docs/foo.md`. Un test di tre righe lo
avrebbe trovato; è stato trovato perché un revisore ci ha pensato.

## 2. Comportamento attuale

Letto in `.claude/commands/finish-cycle.md` su `main` (200 righe):

| Riga | Contenuto | Parole |
|---|---|---|
| `:29` | Comando, tre clausole di whitelist, rinomine, esclusione della colonna di stato, match di prefisso, caso vuoto, registrazione di `<no-code-cycle>` | **263** |
| `:30` | "Il test è la lista dei path"; perché il nome non è "process-only" | 34 |
| `:31` | Eccezioni nominate (oggi vuote) e il loro razionale: mount nginx, 66 file non-`.md` sotto `docs/`, `settings.json` tracciabile | **239** |
| `:32` | Conseguenze: step 0 si applica, step 1-5 saltati, nessun teardown, controllo out-of-scope del Gate 4 non scatta | 147 |

Totale **683 parole**, di cui `:29`+`:31` = **536** sono regola e razionale.

L'esito alimenta tre punti: la precondizione `:41`, il ramo `:58`-`:62` dello step 6, e
`PROCESS.md` §1 + §6 `4c`, che descrivono la **stessa regola una seconda volta**, in italiano.

**Toolchain:** `vitest.config.js` è tre righe, `include: ['js/**/*.test.js']`, `environment: 'jsdom'`;
`api/package.json` usa `node --test src/**/*.test.js` da dentro `api/`. **Nessun runner copre
`scripts/`**, che contiene già `shoot.mjs` e `planning-golden-capture.js` oltre ai `.sh`.

## 3. Comportamento atteso

### 3.1 Un solo artefatto

**`scripts/classify-cycle.mjs`** esporta la funzione pura **e** gira come eseguibile tramite
main-guard (`import.meta.url` confrontato con `process.argv[1]`). Node e non bash per due ragioni:
`scripts/` ha già JS come precedente, e una funzione esportata è importabile dal test senza spawn.

### 3.2 Contratto progettato per sbagliare dalla parte sicura

**Solo la stringa letterale `no-code` come prima riga dello stdout concede il ramo senza codice.**
Qualunque altra cosa è un ciclo ordinario: `ordinary`, uno stack trace, file assente, output vuoto,
exit non-zero, output non riconoscibile.

Il fail-closed non è quindi una clausola che l'agente deve ricordare — **è il parsing stesso**. È la
differenza rispetto alla prosa attuale, dove "se lo script fallisce degrada" sarebbe stata un'altra
frase da interpretare.

Righe successive: i path su cui la decisione è stata presa, che il ramo `:58` già mostra all'utente.

### 3.3 La regola non cambia

Identica a quella mergiata in `689992a`: ogni path (il campo dopo la lettera di stato, entrambi su un
record `R`) deve essere un `.md` sotto `.claude/`, un `.md` sotto `docs/`, o un `*.md` di root; match
di **prefisso**; lista vuota → ordinario; eccezioni nominate escluse. Questo ciclo cambia il **medium**,
non la regola.

### 3.4 Eccezioni nominate: costante nel modulo

Costante nominata in testa al file, oggi lista vuota. **Non** un file dati, **non** un parametro.

Motivo: il **Cycle 3 ha l'obbligo** di aggiungerci `TEST_CASES.md` nello stesso ciclo in cui introduce
`fetch('/TEST_CASES.md')`. Con la costante quel ciclo tocca una stringa e un caso di test, nello stesso
file, con il test che lo pinna. Un file dati aggiunge un formato da parsare; un parametro rimanderebbe
la lista nella prosa del gate, cioè nel problema che questo ciclo rimuove.

### 3.5 Il razionale rimosso va accanto ai guard

Mount nginx, i 66 file non-`.md` sotto `docs/`, `.claude/settings.json` tracciabile e non ignorato:
blocco di commento **adiacente ai guard che giustificano**, dove lo legge chi modifica la regola.
`PROCESS.md 4c` conserva la sintesi per gli umani. **Non** in `docs/scripts/`: separare la ragione dal
codice è come si è persa la prima volta, e la regola di routing di `CLAUDE.md` chiede di scorporare un
file che *ha accumulato* narrativa, non uno che nasce adesso.

### 3.6 Conseguenza sul servizio HTTP

`nginx.conf:68-69` nega i file di test con regole **ancorate a `^/js/`**, quindi
`scripts/classify-cycle.test.js` sarebbe servito (dietro auth, ma servito). Il ciclo aggiunge
`location ~ ^/scripts/.*\.test\.js$ { return 404; }`.

*Fuori scope e non toccato:* che i `scripts/*.sh` siano già serviti oggi è preesistente.

## 4. Test

Tutto in `scripts/classify-cycle.test.js`, eseguito estendendo l'`include` di `vitest.config.js` con
`'scripts/**/*.test.js'` — **una riga**, in un file già negato da `nginx.conf:72`, quindi zero impatto
sul runtime e nessun toolchain nuovo.

- **12 casi unit** sulla funzione pura, nella forma di `js/lib/status-rules.test.js` (31 righe,
  `import` + un `expect` per caso): le 8 righe della tabella di dry-run del piano del Cycle 2, più
  rinomina di file vivo in `docs/`, `api/docs/helper.md`, colonna di stato trattata come path, lista
  vuota.
- **3 casi di integrazione** su repo git costruiti dal test (`git init` + commit + `git mv`;
  **verificato il 2026-10-09 che funziona** in questo ambiente): una rinomina, un diff vuoto, un diff
  misto. Pinnano **il comando**, che è ciò che i 12 unit non possono coprire — e la ragione per cui
  l'opzione "solo funzione pura" è stata scartata.
- **Almeno un caso che fallisce se la whitelist viene allentata**, così che rimuovere un guard rompa
  la suite invece di passare in silenzio.

Il fail-closed si verifica **eseguendolo**: rinominato temporaneamente lo script, il Gate 2 deve
classificare `ordinary` e dichiararlo. Non per lettura.

## 5. Vincoli

- Comportamento classificatorio **identico** a `689992a`: questo ciclo traduce, non rinegozia.
- Deve funzionare **dentro un worktree** (è lì che `/finish-cycle` gira) e su **Git Bash su Windows**.
  Nota operativa verificata: in una sessione worktree la shell rifiuta i comandi composti contenenti
  `git` e l'hook RTK riscrive i comandi, per cui i comandi git vanno dati singoli, eventualmente con
  `RTK_DISABLED=1`.
- `PROCESS.md` §7 **condizione 3 triggerata** (modifica di un gate): §1 e `4c` nello stesso ciclo.
- **Non è un ciclo senza codice** (`scripts/` non è in whitelist): Gate 2 pieno, e la domanda sul
  browser su un diff di script e prosa sarà di nuovo una formalità, da gestire come **deroga §3**
  esplicita, annotata nel report e non ereditabile.
- Nessun linter nel progetto: non introdurne uno.
- `finish-cycle.md` e `PROCESS.md` sono **CRLF senza BOM**; i file sotto `docs/superpowers/specs/` sono
  LF. Applicare gli edit preservando le terminazioni e senza introdurre un BOM.

## 6. Criteri di accettazione

1. Lo script, eseguito sul branch di questo ciclo, stampa `ordinary` (il diff contiene `scripts/`).
2. La funzione pura, applicata all'output di
   `git diff --name-status --find-renames 689992a^1 689992a^2` (il diff del Cycle 2, verificato:
   `M .claude/commands/finish-cycle.md` e `M docs/superpowers/PROCESS.md`), restituisce `no-code`.
   Formulato così e non "eseguito su `689992a`" perché quello è un merge commit e lo script lavora su
   `main...HEAD`: un caso di regressione va espresso come input, non come commit.
3. I 12 casi unit e i 3 di integrazione passano; almeno uno **fallisce** se una delle tre clausole di
   whitelist viene allentata, dimostrato rompendola di proposito una volta.
4. `npm test` dalla root esegue anche il nuovo file, e la suite resta verde.
5. `:29`+`:31` scendono **sotto le 150 parole** complessive (da 536 misurate).
6. Rinominando lo script, il Gate 2 classifica `ordinary` e lo dichiara — **verificato eseguendolo**.
7. `nginx.conf` nega `scripts/*.test.js`.
8. `PROCESS.md` §1 e `4c` non contengono più la regola in forma normativa e non contraddicono lo script.
9. `finish-cycle.md` e `PROCESS.md` restano CRLF senza BOM.
10. `CLAUDE.md` cita il nuovo script nel File structure block, in una o due righe.

## 7. Scope escluso — confermato dall'utente (6 punti)

1. La **clausola su `:27`** (contraddizione preesistente con il `rebuild` dello step 1): follow-up a sé,
   è una decisione su una regola di sicurezza nata da due incidenti reali.
2. **Qualunque cambio alla regola** — whitelist, guard, eccezioni.
3. **Automatizzare altri gate** o altre parti di `/finish-cycle`.
4. Un **linter** o un runner generico per `scripts/`, oltre alla riga di `include` necessaria.
5. **Popolare** la lista delle eccezioni con `TEST_CASES.md`: obbligo del Cycle 3, che è il ciclo che
   introduce il `fetch`.
6. Il **ramo del Gate 2** (struttura dello step 6, degrado sul "no", `status` di sola lettura).
