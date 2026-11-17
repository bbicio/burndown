# Ciclo di processo: test e revisioni più veloci — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tagliare da ogni ciclo il file di test che tiene ferma la suite, il run d'integrazione ripetuto, la doppia revisione dell'intero branch e la suite completa del fix pass, senza perdere copertura.

**Architecture:** `scripts/site-export.test.js` si divide in più file sotto `scripts/site-export/`, con gli helper in `scripts/lib/site-export-fixture.mjs`; i casi restano identici. Il resto è testo di processo: `finish-cycle.md` (Gate 1, Gate 3), `PROCESS.md` §6.1/§6.2/§6.4 e una riga "Process override" in `CLAUDE.md`.

**Tech Stack:** vitest 4 + jsdom, Node 24, git; Markdown di processo.

**Spec:** `docs/superpowers/specs/2026-11-18-process-speed-design.md`
**Branch:** `process-speed`
**Risk class:** standard — file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), nessuna categoria high-risk

**Task indipendenti:** sì — il Task 2 non consuma nulla del Task 1 (cita soltanto il path della cartella nuova nella doc).

## Global Constraints

- **Nessun caso di test cambia:** testo, asserzioni e fixture dei casi spostati restano identici; il conteggio dei test della suite è lo stesso prima e dopo.
- **jsdom resta l'ambiente di default:** `vitest.config.js` non si modifica.
- **Misura:** la durata di `npm test` si misura prima e dopo sulla stessa macchina, con lo stato di Docker identico nelle due misure (vedi Decisioni aperte 1); i due valori vanno nel report.
- **Soglia per file:** nessun file di `scripts/site-export/` oltre circa 40 s nel reporter JSON.
- **Nome dello sha:** `<backend-green-sha>`, alla lettera.
- **Riga d'override:** inizia con `**Process override — final review and fix pass:**`.
- **Scrittura dei documenti:** regole di `CLAUDE.md` "Writing documentation" (regola senza giustificazione, nessun numero in prosa, una regola in un file solo).
- **Infrastruttura:** nessun `docker compose` sul main stack.

## Review Focus

1. **Un caso spostato dipende da un helper definito in un altro blocco** (es. `SHA`, `ALLOW`, `withOrigin`, `headOf` alle righe 422-426, definiti a metà file): il file nuovo deve importarlo, o il caso fallisce con ReferenceError — lo pinna il conteggio dei casi del Task 1 (passo 5) più il run verde.
2. **Pulizia delle cartelle temporanee per file:** il registro `made` e l'`afterAll` che lo svuota devono valere in ogni file nuovo, o le cartelle `site-export-*` restano in `%TEMP%` — lo pinna il Task 1 (passo 3, `afterAll(cleanupMade)` in ogni file).
3. **Un riferimento al vecchio path rimasto in un documento vivo** (oggi `docs/BACKLOG.md` riga B-474 cita `scripts/site-export.test.js`): `scripts/doc-paths-guard.test.js` fallisce — lo pinna il Task 1 (passo 6).
4. **Nessun `<backend-green-sha>` nella sessione** (prima esecuzione di `/finish-cycle` senza run precedenti): il Gate 1 deve lanciare `run-tests.sh`, mai saltarlo — lo pinna il testo del Task 2 (passo 1, condizione "se esiste").
5. **Un run verde seguito da una modifica a `test-api.js` soltanto:** lo skip non deve scattare — lo pinna il path `test-api.js` nel `git diff` del Task 2 (passo 1).

---

### Task 1: `site-export.test.js` diviso in file paralleli

**Files:**
- Create: `scripts/lib/site-export-fixture.mjs`
- Create: `scripts/site-export/*.test.js` (un file per gruppo di `describe`)
- Delete: `scripts/site-export.test.js`
- Modify: `docs/BACKLOG.md` (riga B-474: path e comando), `docs/scripts/site-export.md` (dove stanno i test)
- Eventuale (solo se la misura del passo 7 lo chiede): `scripts/classify-cycle.test.js`, `scripts/security-scope.test.js`

**Interfaces:**
- Produces: `scripts/lib/site-export-fixture.mjs` esporta, con gli stessi corpi di oggi (`scripts/site-export.test.js` righe 11-41, 97-123, 422-426): `git(dir, ...args)`, `put(dir, files)`, `makeRepo(files)`, `lines()`, `makeEmptyClone()`, `listFiles(dir)`, `SITE`, `INCLUDED`, `copy(repo, dest, extra)`, `SHA`, `ALLOW`, `withOrigin(repo)`, `headOf(repo)`, più `cleanupMade()` che svuota il registro `made`.

- [ ] **Step 1: Baseline**

Run: `npx vitest run scripts/site-export.test.js --reporter=json --outputFile=<scratch>/before.json` e `npm test > <scratch>/npm-before.log 2>&1`
Expected: tutti verdi; annota il numero di test di `site-export.test.js` (75 tra `it`/`describe` contati a grep, il numero vero è nel JSON), il totale della suite e la `Duration` di `npm test`.

- [ ] **Step 2: Crea `scripts/lib/site-export-fixture.mjs`** con gli export dell'Interfaces block; i corpi si spostano così come sono, gli `import` di `node:*` e di `../site-export.mjs` seguono.

- [ ] **Step 3: Crea i file sotto `scripts/site-export/`**, ognuno con uno o più blocchi `describe` interi di oggi (15 in tutto, righe 42-fine), gli import dalla fixture e da `../site-export.mjs` che quei blocchi usano, e `afterAll(cleanupMade)`. Raggruppa usando le durate del passo 1 per restare sotto ~40 s a file; nomi per contenuto (es. `run-list.test.js`, `run-copy.test.js`, `run-copy-edge.test.js`, `parse-args.test.js`, `review-rounds.test.js`, `cli.test.js`).

- [ ] **Step 4: Cancella `scripts/site-export.test.js`.**

- [ ] **Step 5: Verifica casi e soglia**

Run: `npx vitest run scripts/site-export/ --reporter=json --outputFile=<scratch>/after.json`, poi confronta con `node` sui due JSON: stesso numero di assertion results, stessi titoli (`ancestorTitles + title`), tutti `passed`; durata per file.
Expected: insiemi di titoli uguali, nessun file oltre ~40 s.

- [ ] **Step 6: Riferimenti vivi**

Aggiorna B-474 in `docs/BACKLOG.md` (cella Where e comando: `grep -rc -i "staged\|no HEAD" scripts/site-export/` con il risultato e la data di oggi) e una frase in `docs/scripts/site-export.md` che dice che i test stanno in `scripts/site-export/` e la fixture in `scripts/lib/site-export-fixture.mjs`.
Run: `npx vitest run scripts/doc-paths-guard.test.js scripts/site-export-guard.test.js scripts/claude-md-guard.test.js`
Expected: PASS.

- [ ] **Step 7: Misura dopo, e decisione su classify-cycle / security-scope**

Run: `npm test > <scratch>/npm-after.log 2>&1` con lo stesso stato di Docker del passo 1.
Expected: stesso totale di test, tutti verdi, `Duration` più bassa. Se nel reporter (un run `--reporter=json` su `scripts/`) il file più lento della suite è `classify-cycle.test.js` o `security-scope.test.js`, dividilo con lo stesso criterio (cartella `scripts/classify-cycle/` o `scripts/security-scope/`, helper in `scripts/lib/`, stessi controlli dei passi 5-6); altrimenti ledger: `Ruling: classify-cycle/security-scope not split — <file più lento> is the floor`.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/site-export-fixture.mjs scripts/site-export/ docs/BACKLOG.md docs/scripts/site-export.md
git rm scripts/site-export.test.js
git commit -m "test: split site-export tests into parallel files (same cases)"
```

---

### Task 2: testo di processo — skip del Gate 1, revisione finale riusabile, override

**Files:**
- Modify: `.claude/commands/finish-cycle.md` (Gate 1 step 2-4 righe 34-38; Gate 3 "Backend re-run" riga 144)
- Modify: `docs/superpowers/PROCESS.md` (§6.1 punto "Modello" riga 136; §6.2 riga 166; §6.4 riga 177)
- Modify: `CLAUDE.md` (dopo la riga "Process override — execution worktree")

**Interfaces:**
- Consumes: nulla dal Task 1.

- [ ] **Step 1: `finish-cycle.md`, Gate 1 e Gate 3**

  - Prima del Gate 1, nel Pre-flight o in testa al Gate 1: definizione di `<backend-green-sha>` come da Spec §3 (HEAD dell'ultimo run verde di `scripts/run-tests.sh` nella sessione, da un task del piano, dal Gate 1 o dal Gate 3; un run rosso, interrotto o illeggibile non registra niente).
  - Gate 1 step 3: se esiste un `<backend-green-sha>` e `git diff --name-only <backend-green-sha>..HEAD -- api/ test-api.js` non stampa niente, non lancia lo script e lo dichiara in una riga con lo sha; nel report la riga del Gate 1 dice `run-tests.sh skipped — green at <sha>, no api/ or test-api.js change since`. Un run verde registra `<backend-green-sha>`.
  - Gate 3 "Backend re-run": il `git diff --name-only` parte da `<backend-green-sha>` invece che da `<gate1-green-HEAD>`.
  - Lascia `<gate1-green-HEAD>` dove serve ancora (Gate 1 step 4) o toglilo se non ha più lettori: `grep -n "gate1-green-HEAD" .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md`.

- [ ] **Step 2: `PROCESS.md`**

  - §6.2: "`scripts/run-tests.sh` gira al Gate 1" → "gira al Gate 1, salvo un run verde nella sessione senza modifiche successive a `api/` o `test-api.js` (`/finish-cycle`, Gate 1)".
  - §6.4: la revisione finale dell'intero branch è un `/code-review` all'effort della classe di rischio (§6.1b), con scope `main...HEAD`, eseguito da un agente Opus in background che riceve la Review Focus del Piano; il Gate 3 la riusa con le regole 0/0b.
  - §6.1, punto "Modello": la revisione finale rimanda a §6.4.

- [ ] **Step 3: `CLAUDE.md`, la riga di override** dopo "Process override — execution worktree":

  `**Process override — final review and fix pass:**` per `superpowers:executing-plans` e `superpowers:subagent-driven-development`: (1) la revisione finale dell'intero branch è quella di `PROCESS.md` §6.4; (2) dopo il fix pass si lanciano solo i test dei file toccati, la suite completa la fa il Gate 1 (`PROCESS.md` §6.2).

- [ ] **Step 4: Verifica**

Run: `npx vitest run scripts/claude-md-guard.test.js scripts/doc-paths-guard.test.js scripts/decision-ledger-guard.test.js scripts/architecture-guard.test.js`
Expected: PASS; `CLAUDE.md` sotto il tetto di 64,000 B (se il guard del blocco File structure o del tetto cambia valore, la riga d'override non sta nel blocco: nessun pin da toccare).

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/finish-cycle.md docs/superpowers/PROCESS.md CLAUDE.md
git commit -m "docs(process): skip a repeated run-tests at Gate 1, final review as /code-review, fix pass runs touched tests only"
```

## Decisioni aperte

1. **La misura prima/dopo si fa con lo stato di Docker identico nelle due misure, non obbligatoriamente spento.** Alternativa scartata: spegnere il main stack per misurare, come dice la lettera del criterio 2 della Spec. Perché: fermare il main stack richiede la conferma dell'utente (Infrastructure safety, regola 3) e non serve allo scopo del criterio, che è un confronto alle stesse condizioni; se l'utente preferisce Docker spento, lo spegne lui prima dei due passi di misura.
2. **I file nuovi si raggruppano per durata misurata, non uno per `describe`.** Alternativa scartata: 15 file, uno per blocco. Perché: i blocchi brevi non guadagnano nulla da un file proprio, e meno file restano leggibili.
3. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: due task, il primo meccanico e il secondo solo testo; un implementatore e un reviewer per task costerebbero più del lavoro.
