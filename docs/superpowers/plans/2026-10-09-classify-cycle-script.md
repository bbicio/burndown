# Classificatore del Gate 2 come script eseguibile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** sostituire le 536 parole di regola e razionale in prosa del Gate 2 con `scripts/classify-cycle.mjs`, pinnato da 15 casi di test, lasciando nel gate solo il comando, i due esiti e la regola di fail-closed.

**Architecture:** un solo file `.mjs` esporta la funzione pura `classifyNameStatus()` e gira come eseguibile tramite main-guard. Il gate concede il ramo senza codice **solo** sul token letterale `no-code` come prima riga di stdout, così il fail-closed è il parsing stesso e non un'altra clausola da ricordare. La regola classificatoria resta identica a `689992a`: cambia il medium, non la semantica.

**Tech Stack:** Node ≥ 22 (host: 24), ES module, zero dipendenze. Test con vitest, estendendo `include` di una riga.

**Spec:** `docs/superpowers/specs/2026-10-09-classify-cycle-script-design.md` (commit `3a32029`)

## Global Constraints

- **La regola non cambia.** Ogni path deve essere un `.md` sotto `.claude/`, un `.md` sotto `docs/`, o un `*.md` di root (nessun `/`); match di **prefisso**; lista vuota → `ordinary`; eccezioni nominate escluse. Questo ciclo traduce, non rinegozia (spec §7.2).
- **Deviazione dalla spec, approvata in sede di piano:** il comando è `git diff --name-status --find-renames -z main...HEAD`. La spec §3.3 lo cita senza `-z`. Misurato il 2026-10-09: senza `-z` git **quota e fa escape** dei path non-ASCII (`"docs/caff\303\250.md"`) e usa `\t` come separatore, quindi un path accentato fallirebbe il controllo di prefisso e uno con spazi si spezzerebbe su uno split per spazi. Con `-z` i path arrivano UTF-8 grezzi separati da NUL. Cambio di **serializzazione**, non di regola. Va annotato nel report del ciclo.
- **Formato `-z` verificato byte per byte:** `A\0path\0` per `M`/`A`/`D`; `R100\0old\0new\0` per una rinomina — token di stato, poi **due** path. Regola di parsing: token che inizia per `R` o `C` consuma due path, altrimenti uno.
- **Fail-closed:** solo `no-code` come prima riga concede il ramo. `ordinary`, stack trace, file assente, stdout vuoto, exit non-zero, output non riconoscibile → ciclo ordinario.
- **Niente linter, niente dipendenze nuove.** `vitest.config.js` ha `environment: 'jsdom'`: resta così, i test girano comunque in Node.
- **`finish-cycle.md` e `PROCESS.md` sono CRLF senza BOM**; i file in `docs/superpowers/` sono LF. Applicare gli edit preservando le terminazioni e senza BOM, con un round trip Python o lo strumento Edit — **mai** `Get-Content`/`Set-Content` PowerShell. Verificare dopo ogni edit.
- **Fuori scope** (spec §7): la clausola su `:27`, qualunque modifica alla regola, l'automazione di altri gate, un linter o runner generico, popolare le eccezioni con `TEST_CASES.md` (obbligo del Cycle 3), il ramo dello step 6.

## Review Focus

Cinque classi di input che la spec implica e che nessun test coprirebbe per default. Le prime tre sono **misurate**, non ipotizzate.

1. **Path non-ASCII.** Senza `-z` git emette `"docs/caff\303\250.md"`: prefisso e suffisso falliscono entrambi, e un ciclo di sola documentazione con un nome accentato perderebbe il ramo. Con `-z` deve qualificare. *(Test: Task 1.)*
2. **Path con spazi.** `docs/due parole.md` arriva non quotato: uno split su whitespace lo spezza e il frammento fallisce. *(Test: Task 1.)*
3. **Record `R`/`C`.** Il token porta la similarità (`R100`, `R087`) e **due** path: entrambi devono qualificare perché il ciclo sia senza codice. Un parser che consuma un solo path disallinea tutto il resto dello stream. *(Test: Task 1.)*
4. **Invocazione da un worktree.** È dove `/finish-cycle` gira davvero, e `main...HEAD` va risolto lì, non nel checkout principale. *(Test: Task 2.)*
5. **`git` assente, directory non-repo, `main` inesistente.** Non deve mai stampare `no-code`; il messaggio d'errore va su stderr, non su stdout, per non inquinare la prima riga. *(Test: Task 2.)*

---

### Task 1: funzione pura, i suoi 12 casi, e i due file di configurazione

**Files:**
- Create: `scripts/classify-cycle.mjs` (solo la parte pura in questo task)
- Create: `scripts/classify-cycle.test.js`
- Modify: `vitest.config.js` (`include`)
- Modify: `nginx.conf` (nuova `location`, accanto alle righe 67-72)

**Interfaces:**
- Consumes: niente (primo task).
- Produces:
  - `export function classifyNameStatus(z, exceptions = RUNTIME_LOADED_ROOT_MD)` — `z` è lo stdout grezzo di `git diff --name-status --find-renames -z` (stringa, record separati da `\0`); `exceptions` è l'elenco dei `.md` di root che contano come codice, iniettabile **solo** per i test. Ritorna `{ kind, paths }` con `kind` che è `'no-code'` oppure `'ordinary'`, e `paths` l'array dei path estratti, nell'ordine di comparsa, duplicati inclusi.
  - `export const RUNTIME_LOADED_ROOT_MD = []` — le eccezioni nominate (spec §3.4): `.md` di root che l'app carica a runtime e che quindi contano come **codice**. Oggi vuota.

I due file di configurazione stanno qui e non in un task a parte perché servono a far girare il test di questo task (`include`) e a non servire via HTTP il file che questo task crea (`nginx.conf`).

- [ ] **Step 1: scrivere i 12 test che falliscono**

In `scripts/classify-cycle.test.js`, forma di `js/lib/status-rules.test.js` (`import { describe, it, expect } from 'vitest'`). Gli input sono stringhe NUL-separate; `Z` è un helper locale che unisce i campi con `\0` e chiude con `\0`.

| # | Input (campi) | `kind` atteso | Origine |
|---|---|---|---|
| 1 | `M`, `.claude/commands/finish-cycle.md`, `M`, `docs/superpowers/PROCESS.md` | `no-code` | tabella dry-run; criterio 2 della spec |
| 2 | `M`, `api/docs/helper.md` | `ordinary` | prefisso, non sottostringa |
| 3 | `M`, `docs/pages/pipeline.md`, `M`, `pipeline.html` | `ordinary` | diff misto |
| 4 | `D`, `CLAUDE.md`, `A`, `docs/architecture/x.md` | `no-code` | root `.md` + `docs/` |
| 5 | `R100`, `js/a.js`, `docs/a.md` | `ordinary` | **Review Focus 3**: rinomina, entrambi i lati |
| 6 | `R087`, `docs/a.md`, `docs/b.md` | `no-code` | **Review Focus 3**: similarità ≠ 100 |
| 7 | `M`, `TEST_CASES.md` | `no-code` | eccezioni vuote oggi |
| 8 | (stringa vuota) | `ordinary` | lista vuota non vale per vacuità |
| 9 | `M`, `scripts/gen.mjs`, `M`, `ARCHITECTURE.md` | `ordinary` | `scripts/` non in whitelist |
| 10 | `A`, `docs/caffè.md` | `no-code` | **Review Focus 1**: non-ASCII |
| 11 | `A`, `docs/due parole.md` | `no-code` | **Review Focus 2**: spazi |
| 12 | `M`, `.claude/settings.json` | `ordinary` | guard `.md` su `.claude/` |

Più un caso che pinna le eccezioni: `classifyNameStatus(Z('M', 'TEST_CASES.md'), ['TEST_CASES.md'])` dà `ordinary`, mentre il caso 7 con le eccezioni di default dà `no-code`. Si passa la lista come secondo argomento — mai mutando la costante esportata, che renderebbe i test dipendenti dall'ordine.

Più il caso del criterio 3 della spec: un test che **fallisce se una clausola viene allentata**. Il caso 12 lo è già (rimuovere il guard `.md` su `.claude/` lo fa passare da `ordinary` a `no-code`): annotarlo nel test con un commento, non aggiungere un test in più.

- [ ] **Step 2: eseguirli e verificare che falliscano**

Run: `npx vitest run scripts/classify-cycle.test.js`
Expected: FAIL — il file `scripts/classify-cycle.mjs` non esiste (errore di risoluzione dell'import).

- [ ] **Step 3: aggiungere `'scripts/**/*.test.js'` all'`include` di `vitest.config.js`**

Una riga. Senza di essa vitest non raccoglie il file (`include` è oggi `['js/**/*.test.js']`).

- [ ] **Step 4: implementare `classifyNameStatus(z)` e `RUNTIME_LOADED_ROOT_MD` in `scripts/classify-cycle.mjs`**

Parsing: split su `\0`, scartare l'ultimo campo vuoto; consumare un token di stato alla volta, due path se il token corrisponde a `/^[RC]/`, altrimenti uno. Qualificazione di un path: `.claude/` + suffisso `.md`, oppure `docs/` + suffisso `.md`, oppure nessun `/` + suffisso `.md`; e non appartenere a `RUNTIME_LOADED_ROOT_MD`. `kind` è `no-code` se `paths.length > 0` e tutti qualificano.

Nello stesso file, blocco di commento accanto ai guard con il razionale rimosso dal gate (spec §3.5): il mount della root del repo in nginx, i 66 file non-`.md` tracciati sotto `docs/` di cui `docs/OPERATIONAL_MANUAL.html` è verificabile solo in un browser, e `.claude/settings.json` tracciabile perché `.gitignore` ignora solo `settings.local.json`.

- [ ] **Step 5: eseguire i test e verificare che passino**

Run: `npx vitest run scripts/classify-cycle.test.js`
Expected: PASS, 13 test.

- [ ] **Step 6: negare il file di test in `nginx.conf`**

Aggiungere `location ~ ^/scripts/.*\.test\.js$ { return 404; }` nel blocco DEV-ONLY (righe 67-72). Le regole esistenti sono ancorate a `^/js/`, quindi non coprono `scripts/` (spec §3.6).

- [ ] **Step 7: suite completa e commit**

Run: `npm test`
Expected: PASS, 850+ test (849 prima di questo task).

```bash
git add scripts/classify-cycle.mjs scripts/classify-cycle.test.js vitest.config.js nginx.conf
git commit -m "feat: pure cycle classifier with its unit tests"
```

---

### Task 2: l'eseguibile e i 3 casi di integrazione

**Files:**
- Modify: `scripts/classify-cycle.mjs` (aggiunge `main()` e il main-guard)
- Modify: `scripts/classify-cycle.test.js` (aggiunge il blocco di integrazione)

**Interfaces:**
- Consumes: `classifyNameStatus(z)` e `RUNTIME_LOADED_ROOT_MD` dal Task 1.
- Produces: il **contratto CLI** su cui il Task 3 scrive il testo del gate — `node scripts/classify-cycle.mjs [<range>]`, default `main...HEAD`; prima riga di stdout `no-code` oppure `ordinary`; righe successive i path; errori su **stderr**; exit 0 in caso di classificazione riuscita, non-zero altrimenti.

- [ ] **Step 1: scrivere i 3 test di integrazione che falliscono**

Nello stesso file, un `describe` separato. Ogni test costruisce un repo usa-e-getta sotto la directory temporanea del sistema (`fs.mkdtemp`), con `git init`, commit via `git -c user.email=… -c user.name=…`, e lo rimuove in `afterEach`. **Verificato il 2026-10-09 che la creazione di repo di prova funziona in questo ambiente.** Lo script si invoca con `execFileSync(process.execPath, [<path assoluto dello script>, <range>], { cwd: <repo di prova> })`.

| # | Scenario nel repo di prova | Atteso | Perché |
|---|---|---|---|
| 1 | `git mv api/src/foo.js docs/foo.md` fra due commit | prima riga `ordinary`, stdout contiene **entrambi** i path | **pinna il comando**: con `--name-only` il lato `api/src/` sarebbe invisibile e il risultato diventerebbe `no-code`. È il difetto H1 del Cycle 2. |
| 2 | due commit il cui diff complessivo è vuoto (modifica + revert) | prima riga `ordinary` | lista vuota, che la prosa giustificava con una motivazione falsa (il pre-flight check 3 testa i commit, non i path) |
| 3 | un commit che tocca `docs/x.md` e `js/y.js` | prima riga `ordinary` | diff misto end-to-end |

Più i due casi di **Review Focus 4 e 5**:
- invocazione con `cwd` su un **worktree collegato** del repo di prova (`git worktree add`), che deve classificare il diff di quel worktree;
- `cwd` su una directory che **non è un repo** → la prima riga di stdout **non** è `no-code`, l'exit è non-zero e il messaggio è su stderr.

- [ ] **Step 2: eseguirli e verificare che falliscano**

Run: `npx vitest run scripts/classify-cycle.test.js`
Expected: FAIL — lo script non ha ancora un `main`, quindi non stampa nulla su stdout.

- [ ] **Step 3: aggiungere `main()` e il main-guard a `scripts/classify-cycle.mjs`**

`main()` legge il range da `process.argv[2]` (default `main...HEAD`), esegue `git diff --name-status --find-renames -z <range>` con `execFileSync` (array di argomenti, **non** una stringa di shell: i path possono contenere spazi), chiama `classifyNameStatus`, stampa `kind` e poi i path, uno per riga. In caso di eccezione: messaggio su `stderr`, exit non-zero, **niente** su stdout. Main-guard: confrontare `import.meta.url` con `pathToFileURL(process.argv[1]).href`, così l'import dal test non esegue `main()`.

- [ ] **Step 4: eseguire i test e verificare che passino**

Run: `npx vitest run scripts/classify-cycle.test.js`
Expected: PASS, 18 test.

- [ ] **Step 5: verificare i due criteri di accettazione eseguibili**

```bash
node scripts/classify-cycle.mjs            # sul branch di questo ciclo
node scripts/classify-cycle.mjs 689992a^1...689992a^2
```
Expected: `ordinary` sul primo (il diff contiene `scripts/`), `no-code` sul secondo (criteri 1 e 2 della spec). Riportare l'output verbatim.

- [ ] **Step 6: Commit**

```bash
git add scripts/classify-cycle.mjs scripts/classify-cycle.test.js
git commit -m "feat: runnable cycle classifier with integration tests"
```

---

### Task 3: il gate e le sue due copie documentali, nello stesso task

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (righe 29-32, blocco di classificazione del Gate 2)
- Modify: `docs/superpowers/PROCESS.md` (§1, riga della tabella `/finish-cycle`; §6 punto `4c`)
- Modify: `CLAUDE.md` (File structure block: una riga per il nuovo script)

**Interfaces:**
- Consumes: il contratto CLI del Task 2. Il testo del gate non deve descrivere la regola, solo invocare e leggere.
- Produces: niente (ultimo task).

I tre file stanno in **un solo task** deliberatamente: nel Cycle 2 il finding L4 era una divergenza fra §1 di `PROCESS.md` e il comando, nata dall'averli messi in due task separati. Tenerli insieme rende il disallineamento verificabile in un colpo.

- [ ] **Step 1: ridurre il blocco di classificazione del Gate 2**

Sostituire le righe 29 e 31 (536 parole misurate) con: il comando, il significato dei due esiti, la regola di fail-closed nella forma "solo `no-code` come prima riga concede il ramo; qualunque altra cosa — `ordinary`, errore, file assente, stdout vuoto, exit non-zero — è un ciclo ordinario", e il rimando a `scripts/classify-cycle.mjs` per la regola e a `PROCESS.md 4c` per il perché. **Non** ripetere le tre clausole di whitelist, **non** ripetere il razionale.

Le righe 30 e 32 restano: non sono regola, sono il principio ("il test è la lista dei path") e le conseguenze (step 0, step 1-5, teardown, controllo del Gate 4).

- [ ] **Step 2: verificare il criterio 5 misurando**

```bash
python -c "import io; L=io.open('.claude/commands/finish-cycle.md',encoding='utf-8').read().split('\n'); print(sum(len(L[n-1].split()) for n in (29,31)))"
```
Expected: **< 150** (536 prima). Se il numero non ci sta, il testo contiene ancora regola o razionale: togliere quelli, non comprimere la prosa.

- [ ] **Step 3: allineare `PROCESS.md` §1 e `4c`**

§1: la riga della tabella cita l'invocazione dello script, non le clausole. `4c`: resta la sintesi *per gli umani* — perché il ramo esiste, cosa non cambia, il razionale dei guard (mount nginx, i 66 file, `settings.json`) — ma **non** più la regola in forma normativa: quella sta nello script. Aggiungere che la regola è pinnata da `scripts/classify-cycle.test.js` e che un `/code-review` futuro deve guardare il test, non la prosa.

- [ ] **Step 4: una riga in `CLAUDE.md`**

Nel File structure block, accanto alle altre voci `scripts/`: cos'è e che è pinnato dal suo test. Una o due righe, nessuna narrativa, nessun file `docs/scripts/` (spec §3.5).

- [ ] **Step 5: verificare il fail-closed eseguendolo, non leggendolo**

```bash
mv scripts/classify-cycle.mjs scripts/classify-cycle.mjs.bak
node scripts/classify-cycle.mjs; echo "exit=$?"
mv scripts/classify-cycle.mjs.bak scripts/classify-cycle.mjs
```
Expected: errore su stderr, exit non-zero, **nessun** `no-code` su stdout — quindi il gate classifica `ordinary` (criterio 6 della spec). Riportare l'output verbatim.

- [ ] **Step 6: verificare byte e riferimenti**

```bash
python -c "
for f in ['.claude/commands/finish-cycle.md','docs/superpowers/PROCESS.md','CLAUDE.md']:
    b=open(f,'rb').read(); print(f, 'CRLF' if b'\r\n' in b else 'LF', 'strayLF', b.replace(b'\r\n',b'').count(b'\n'), 'BOM', b.startswith(b'\xef\xbb\xbf'))
"
grep -n "step 6 below\|step 1 below\|Gate 2 step 0\|If step 0 launched" .claude/commands/finish-cycle.md
```
Expected: tutti e tre CRLF/LF come prima, `strayLF 0`, nessun BOM; i quattro riferimenti incrociati del Gate 2 ancora presenti (criteri 8 e 9).

- [ ] **Step 7: suite completa e commit**

Run: `npm test`
Expected: PASS.

```bash
git add .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md CLAUDE.md
git commit -m "docs: Gate 2 invokes the classifier instead of describing the rule"
```

---

## Nota per chi chiude il ciclo

**Non è un ciclo senza codice** (`scripts/` non è in whitelist): il Gate 2 porrà la domanda sul browser su un diff di script e prosa, da gestire come **deroga §3** esplicita, annotata nel report e non ereditabile. E come nel Cycle 2, `/finish-cycle` carica il proprio testo dal checkout principale, non dal worktree: **la riduzione del gate non verrà esercitata da questo ciclo**, solo dal successivo. Il report deve dirlo invece di dichiararla verificata.
