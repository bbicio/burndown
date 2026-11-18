# Ciclo di processo 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accorciare il contorno di ogni ciclo con quattro interventi: passi indipendenti in parallelo, documentazione nei task, parti meccaniche del report generate da uno script, test di site-export solo quando cambia lo strumento.

**Architecture:**
- Due script nuovi con i loro test: `scripts/cycle-report.mjs` e una seconda config vitest.
- Una regola in più in `scripts/decision-ledger-guard.test.js`.
- Il resto è testo di processo: `finish-cycle.md`, `PROCESS.md`, `/sync-docs`, `CLAUDE.md`.

**Tech Stack:** Node 24 (ESM), vitest 4, git.

**Spec:** `docs/superpowers/specs/2026-11-18-process-speed-2-design.md`
**Branch:** `process-speed-2`
**Risk class:** standard — file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), nessuna categoria high-risk

**Task indipendenti:** sì. Il Task 4 cita i nomi prodotti dai Task 1-3 (`npm run test:site-export`, `scripts/cycle-report.mjs mark|render`) ma non ne consuma il codice.

## Global Constraints

- **Ogni task porta una riga `**Docs:**`.** Il task aggiorna quei documenti nello stesso commit (Spec §2; questo Piano è l'ancora del guard e applica la regola a mano).
- **Nessun caso di test esistente cambia.** I test di site-export restano 60, e `npm run test:site-export` li esegue tutti.
- **Misura:** `npm test` prima (Task 1, passo 1) e dopo, con lo stato di Docker identico, ed entrambi i valori nel report.
- **Nomi alla lettera:**
  - comando `npm run test:site-export`;
  - script `scripts/cycle-report.mjs` con i sottocomandi `mark` e `render`;
  - log `<root principale>/.superpowers/cycle-log/<branch-sanitized>.log`;
  - bozza `<root principale>/.superpowers/cycle-log/<branch-sanitized>.draft.md`;
  - eventi `preflight gate1 gate2 gate3 gate4 merged gate5 report`;
  - ancora del guard `docs/superpowers/plans/2026-11-18-process-speed-2.md`;
  - righe d'override `**Process override — docs in the tasks:**` (nuova) e `**Process override — final review and fix pass:**` (riscritta).
- **Scrittura dei documenti:** regole di `CLAUDE.md` "Writing documentation".
- **Nessun `docker compose` sul main stack.**

## Review Focus

1. **Lancio della suite di site-export da Windows:** il comando deve funzionare su Windows (niente `VAR=1 cmd` nello script npm) — lo pinna il Task 1, che usa una config vitest separata.
2. **Esclusione troppo larga:** un pattern come `scripts/site-export*` escluderebbe `scripts/site-export-guard.test.js` — lo pinna il test d'esclusione del Task 1.
3. **`mark` chiamato da un worktree:** deve scrivere nel log del checkout principale, che sopravvive al Gate 4 — lo pinna il test del Task 2 con un worktree di prova.
4. **Il guard sui `**Docs:**` senza git funzionante** (shallow clone, ancora non trovata): deve fallire con un messaggio, mai passare — lo pinna il Task 3.
5. **Stack di branch su un rosso del Gate 1:** non va smontato — lo pinna il testo del Task 4 (passo 2) e il rimando al preambolo del Gate 2.

---

### Task 1: test di site-export solo quando servono

**Files:**
- Create: `vitest.site-export.config.js`, `scripts/site-export-scope.test.js`
- Modify: `vitest.config.js`, `package.json`
**Docs:** `docs/scripts/site-export.md` (sezione Tests: quando girano), `docs/superpowers/PROCESS.md` §6.2 (una frase sui test di site-export)

- [ ] **Step 1: Baseline** — `npm test > <ws>/npm-before.log 2>&1`; annota `Duration` e il totale dei test.
- [ ] **Step 2: Scrivi il test che fallisce** `scripts/site-export-scope.test.js`:
  - `it('the default suite excludes scripts/site-export/ and nothing else of scripts/')`: importa la config di default e verifica che `test.exclude` contenga `'scripts/site-export/**'` e che nessun pattern di `test.exclude` corrisponda (`path.matchesGlob`) a `scripts/site-export-guard.test.js`, `scripts/lib/site-export.test.js` o `scripts/classify-cycle.test.js`.
  - `it('the site-export config runs only that folder')`: importa `vitest.site-export.config.js` e verifica che `test.include` sia `['scripts/site-export/**/*.test.js']` e che `test.exclude` non contenga `'scripts/site-export/**'`.
  - `it('package.json has test:site-export')`: verifica che lo script valga `vitest run --config vitest.site-export.config.js`.
- [ ] **Step 3: Esegui** `npx vitest run scripts/site-export-scope.test.js`. Expected: FAIL (config mancante).
- [ ] **Step 4: Implementa.**
  - `vitest.config.js` aggiunge `exclude: [...configDefaults.exclude, 'scripts/site-export/**']`.
  - `vitest.site-export.config.js` riprende `environment` e `setupFiles` di quella di default (import, o `mergeConfig`) con il proprio `include`.
  - `package.json` aggiunge lo script.
- [ ] **Step 5: Verifica.**
  - Run: `npx vitest run scripts/site-export-scope.test.js`. Expected: PASS.
  - Run: `npm run test:site-export`. Expected: 8 file, 60 test, PASS.
  - Run: `npm test > <ws>/npm-after.log 2>&1`. Expected: totale = baseline − 60, `Duration` più bassa.
- [ ] **Step 6: Docs** (righe sopra). Run: `npx vitest run scripts/doc-paths-guard.test.js scripts/claude-md-guard.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** `test: run site-export tests only through npm run test:site-export` (con i file e i documenti del task).

---

### Task 2: `scripts/cycle-report.mjs`

**Files:**
- Create: `scripts/cycle-report.mjs`, `scripts/cycle-report.test.js`
**Docs:** `docs/scripts/cycle-report.md` (nuovo: uso, eventi, dove sta il log), `CLAUDE.md` (una voce di due righe nel blocco File structure, accanto alle altre `scripts/*.mjs`) + il pin di `scripts/claude-md-guard.test.js` aggiornato con il suo commento datato

**Interfaces:**
- Produces:
  - `mainRoot(cwd) → string`: root del checkout principale, da `git rev-parse --git-common-dir`.
  - `logPath(root, branch) → string`.
  - `sanitize(branch) → string`, che sostituisce `/` con `-`.
  - `parseLog(text) → Map<event, Date>`, dove vince la prima occorrenza.
  - `durations(events) → { gate1..gate5, total }`, in minuti interi o `'unknown'`.
  - `renderLines(events, commits) → string[]`.
  - CLI `mark <event> [--branch b]` e `render [--branch b]`. Il branch di default è quello corrente.

- [ ] **Step 1: Scrivi i test che falliscono** (vitest, su repository git e log di prova in una cartella temporanea):
  - `parseLog` ignora le righe malformate e tiene la prima occorrenza di un evento;
  - `durations` restituisce i minuti tra gli ingressi consecutivi (gate5 → report) e `'unknown'` quando un capo manca;
  - `mark gate1` due volte → una riga sola;
  - `mark` da un worktree scrive in `<main>/.superpowers/cycle-log/<sanitized>.log`;
  - un evento non tra gli otto → exit ≠ 0 con messaggio;
  - `render` stampa `**Execution started:**`, `**Merged at:**`, `**Gate durations:** Gate 1 Nm · … — total Nm` e una riga per commit di `git log <merge>^1..<merge>^2 --format='%h %s'` (dal merge trovato tramite il subject `Merge branch '<branch>'`), e `unknown` dove manca.
- [ ] **Step 2: Esegui** `npx vitest run scripts/cycle-report.test.js`. Expected: FAIL (modulo mancante).
- [ ] **Step 3: Implementa** le funzioni dell'Interfaces block; intestazione con i limiti nello stile di `scripts/cycle-times.mjs`.
- [ ] **Step 4: Esegui** il test. Expected: PASS.
- [ ] **Step 5: Docs** (righe sopra). Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(scripts): cycle-report mark/render for the finish-cycle report's mechanical lines`.

---

### Task 3: documentazione nei task

**Files:**
- Modify: `scripts/decision-ledger-guard.test.js` (sesta regola), `.claude/skills/sync-docs/SKILL.md` (Process)
**Docs:** `CLAUDE.md` (riga `**Process override — docs in the tasks:**` accanto agli altri override), `docs/superpowers/PROCESS.md` (§6b o la sezione dei Piani: un rimando alla regola)

- [ ] **Step 1: Scrivi i test che falliscono** in `scripts/decision-ledger-guard.test.js`. Sono unit test della funzione nuova `checkDocsLines(markdown)`, più un test d'ambito su un repository git di prova:
  - un task senza `**Docs:**` → elencato;
  - `**Docs:** none — motivo` → ok;
  - un `**Docs:**` dentro un blocco di codice non conta;
  - un Piano aggiunto dopo il commit dell'ancora → in ambito; l'ancora e un Piano precedente → esenti;
  - un'ancora non trovata → errore esplicito.
- [ ] **Step 2: Esegui** `npx vitest run scripts/decision-ledger-guard.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementa** la sesta regola: `checkDocsLines` più `docsInScope(relPath)` via `git log --diff-filter=A --format=%H -- <plan>` e `git merge-base --is-ancestor`. Aggiungi la regola sul repository, che fallisce elencando i Piani e i task in difetto. Aggiorna l'intestazione con la regola e i suoi limiti.
- [ ] **Step 4: Esegui** il test. Expected: PASS (nessun Piano oltre l'ancora oggi).
- [ ] **Step 5: `/sync-docs`.** Nel Process, dopo lo scope pass: per ogni sezione con "yes", `git diff --name-only <merge>^1 <merge> -- <file>`. Un file già toccato si riporta come "already on branch" e non si riscrive; si aggiorna solo ciò che manca. Lo step di memoria resta invariato.
- [ ] **Step 6: Docs** (righe sopra). Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js scripts/decision-ledger-guard.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(process): docs inside the tasks — Docs line guard on new plans, sync-docs checks the branch first`.

---

### Task 4: `/finish-cycle` e PROCESS.md — passi in parallelo, script del report, site-export al Gate 1

**Files:**
- Modify: `.claude/commands/finish-cycle.md`, `docs/superpowers/PROCESS.md`, `CLAUDE.md`
**Docs:** questo task È documentazione di processo; nessun altro documento (`none — the task's files are the process documents themselves`)

- [ ] **Step 1: Revisione finale (Spec §1.1).**
  - PROCESS.md §6.4: la revisione finale parte in background al commit dell'ultimo task; l'esecutore invoca subito `/finish-cycle`, non fa un fix pass, e il Gate 3 la tratta come round 1.
  - PROCESS.md §6.4b e `finish-cycle.md` Gate 2 step 0: se trova quella revisione, in corso o conclusa, non ne lancia un'altra e ne registra l'HEAD come `<reviewed-sha>`.
  - `CLAUDE.md`: riscrivi la riga `**Process override — final review and fix pass:**` come da Spec §1.1.
- [ ] **Step 2: Stack anticipato (Spec §1.2).**
  - `finish-cycle.md` pre-flight: un nuovo passo esegue `classify-cycle`; su un ciclo ordinario chiede dello stack, e su yes o rebuild lo avvia in background.
  - Gate 2 step 1: usa lo stack già avviato, e su un avvio fallito chiede se riprovare.
  - Il preambolo sul teardown resta invariato e vale anche per lo stack avviato al pre-flight. Un rosso del Gate 1 non lo smonta.
- [ ] **Step 3: Script del report (Spec §1.3, §3).**
  - Il pre-flight step 6 e ogni ingresso di gate eseguono `node scripts/cycle-report.mjs mark <evento>`, e il merge esegue `mark merged`.
  - Gate 2: durante l'attesa si scrive la bozza.
  - Gate 5 step 2: il report parte da `render` e dalla bozza; i contatori restano a mano.
- [ ] **Step 4: Site-export al Gate 1 (Spec §4).** Dopo `npm test`, se `git diff --name-only main...HEAD` tocca `scripts/site-export*`, `scripts/lib/site-export*` o `scripts/site-export.rules`, si esegue `npm run test:site-export`. Un rosso lì vale come un rosso dello step 1.
- [ ] **Step 5: Tabella riassuntiva di PROCESS.md (riga 28)** allineata ai passi 1-4.
- [ ] **Step 6: Verifica.** Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js scripts/decision-ledger-guard.test.js scripts/architecture-guard.test.js`. Expected: PASS.
- [ ] **Step 7: Commit** `docs(process): final review in parallel to Gate 1, branch stack from pre-flight, cycle-report marks, site-export tests at Gate 1`.

## Decisioni aperte

1. **La suite di site-export si lancia con una config vitest separata (`vitest.site-export.config.js`), non con una variabile d'ambiente.** Alternativa scartata: una variabile letta da `vitest.config.js`, impostata nello script npm. Perché: `VAR=1 vitest` non funziona da `cmd`/PowerShell e il progetto non usa `cross-env`.
2. **Il merge del branch, in `render`, si trova dal subject `Merge branch '<branch>'`.** Alternativa scartata: passare lo sha del merge a mano. Perché: `/finish-cycle` usa sempre quel subject, e così `render` non chiede argomenti.
3. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: quattro task indipendenti e piccoli; un implementatore e un reviewer per task costerebbero più del lavoro.
