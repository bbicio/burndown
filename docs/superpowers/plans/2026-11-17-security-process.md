# Sicurezza nel processo di sviluppo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/finish-cycle` esegue `/security-review` in background e `npm audit` al Gate 1 solo quando uno script sui path del diff lo richiede, e Brief e Spec dichiarano la loro superficie di sicurezza.

**Architecture:** `scripts/security-scope.mjs` (funzione pura + CLI, sul modello di `classify-cycle.mjs`) decide `review`/`skip` e i pacchetti da sottoporre ad audit. `finish-cycle.md` lo legge al Gate 1 (audit) e al Gate 2 step 0 (seconda run in background), e il Gate 3 fonde i finding nel round 1. `decision-ledger-guard` pretende la riga `Security surface` nelle Spec; `feature-brief` la porta nei Brief.

**Tech Stack:** Node 24 (ESM, `node:child_process`), vitest 4, git, npm.

**Spec:** `docs/superpowers/specs/2026-11-17-security-process-design.md`
**Branch:** `security-process`
**Risk class:** standard — file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`), nessuna categoria `high-risk`

**Task indipendenti:** no. Il Task 3 consuma il contratto CLI del Task 1; il Task 4 documenta lo stato dei Task 1-3.

## Global Constraints

- Contratto CLI (Spec §2), alla lettera: prima riga `review` o `skip`; seconda riga `audit: api`, `audit: .`, `audit: api .` oppure `audit: none`; poi i path che hanno fatto scattare il verdetto; errori solo su stderr con exit non zero e stdout vuoto.
- Chi legge il comando: qualunque prima riga diversa dal letterale `skip` vale `review`; una seconda riga illeggibile vale `audit: api .`.
- `npm audit`: `cd api && npm audit --omit=dev --audit-level=high` bloccante; `npm audit --audit-level=high` alla radice solo riportato; un audit che non gira è `not run — <motivo>`, mai `clean`.
- Mappatura gravità: HIGH → Important, MEDIUM → Important, LOW → Minor; prefisso `[security]`.
- La lista delle superfici vive solo in `scripts/security-scope.test.js`; nessun documento la ripete.
- Nessun guard nuovo che legga codice JS/HTML con regex.
- File in UTF-8 senza BOM, scritti con Edit/Write (mai `Get-Content`/`Set-Content`, mai codice con `\` via `node -e`).
- Mai `docker compose` sullo stack principale: questo ciclo non ne ha bisogno.
- Worktree: `.claude/worktrees/security-process` (PROCESS.md §6.1b); `npm ci` una volta nella radice del worktree.

## Review Focus

1. **Un file di superficie cancellato** (`D api/src/routes/x.js`) deve dare `review`: una route tolta cambia la superficie quanto una aggiunta. → test nel Task 1.
2. **Solo il lockfile cambia** (`M api/package-lock.json`, `package.json` intatto): `review` e `audit: api`. È il caso tipico di un `npm audit fix`. → test nel Task 1.
3. **`.html` fuori dalla radice** (`docs/x.html`, `handbook/x.html`) dà `skip`: nginx serve solo le pagine alla radice (`scripts/nginx-serve.test.js`). Una pagina `admin.html` alla radice dà `review`. → test nel Task 1.
4. **Range vuoto o senza commit** (`HEAD...HEAD`): `skip`, `audit: none`, exit 0. Diverso da un errore, che lascia stdout vuoto. → test CLI nel Task 1.
5. **`docker-compose.<qualcosa>.yml`** e `api/Dockerfile` danno `review`; un `Dockerfile` altrove (`scripts/Dockerfile`) dà `skip`. → test nel Task 1.

---

### Task 1: `scripts/security-scope.mjs` + test

**Files:**
- Create: `scripts/security-scope.mjs`
- Create: `scripts/security-scope.test.js`
- Read: `scripts/classify-cycle.mjs` (parser e CLI da imitare), `scripts/classify-cycle.test.js:136-200` (helper `repo`/`git`/`write`/`run` per i test end-to-end)

**Interfaces:**
- Consumes: `audienceOf(path)` e `classifyNameStatus(z)` da `scripts/classify-cycle.mjs` (il secondo solo nel test incrociato).
- Produces:
  - `export function classifySecurityScope(z: string): { kind: 'review'|'skip', audit: string[], paths: string[] }` — `audit` ordinato `['api', '.']` (sottoinsieme), `paths` = i path che hanno fatto scattare `review`.
  - `export function main(argv = process.argv)` con range di default `main...HEAD`; stessa invocazione git di `classify-cycle.mjs` (`--name-status --find-renames -C -C -z`, stderr catturato).
  - Output: `[kind, 'audit: ' + (audit.length ? audit.join(' ') : 'none'), ...paths].join('\n') + '\n'`.

- [ ] **Step 1: Scrivi i test unit (`describe('classifySecurityScope')`)** con `const Z = (...f) => f.join('\0') + '\0'` come in `classify-cycle.test.js`. Un `it` per riga; ogni riga `review` ha il suo vicino `skip`:

| Path (status `M` salvo dove indicato) | kind | audit |
|---|---|---|
| `api/src/routes/x.js` / `api/src/routes/x.test.js` | review / skip | none |
| `api/src/services/email.js`, `api/src/lib/a.js`, `api/src/index.js` | review | none |
| `api/src/db/migrations/040_x.sql` | review | none |
| `D api/src/routes/x.js` (Review Focus 1) | review | none |
| `admin.html` / `docs/x.html`, `handbook/x.html` (Review Focus 3) | review / skip | none |
| `js/pages/a.js`, `js/lib/a.js`, `js/nav.js` / `js/lib/a.test.js`, `css/a.css` | review / skip | none |
| `nginx.conf` / `docs/nginx.conf.md` | review / skip | none |
| `api/Dockerfile`, `docker-compose.yml`, `docker-compose.test.yml` / `scripts/Dockerfile` (Review Focus 5) | review / skip | none |
| `api/package.json` | review | `['api']` |
| `api/package-lock.json` da solo (Review Focus 2) | review | `['api']` |
| `package.json` / `package-lock.json` | review | `['.']` |
| `api/package.json` + `package-lock.json` | review | `['api', '.']` |
| `handbook/manifest.json` / `handbook/public/a.md`, `handbook/public/img/a.png` | review / skip | none |
| `R100 handbook/public/a.md handbook/restricted/a.md` | review | none |
| `D handbook/public/a.md` + `A handbook/restricted/a.md` | review | none |
| `test-api.js`, `scripts/run-tests.sh`, `scripts/x.mjs`, `.claude/commands/finish-cycle.md`, `docs/a.md`, `CLAUDE.md` | skip | none |
| `docs/api/src/x.md` (prefisso, non sottostringa) | skip | none |
| `R100 js/a.js docs/a.md` (rename su entrambi i lati) | review; `paths` contiene `js/a.js` | none |
| stringa vuota | skip | none |
| `Z('M')` (stream troncato) | review | `['api', '.']` |

  Più un `it('every no-code diff is a skip')`: per ciascuno di almeno sei diff presi dai casi `no-code` di `classify-cycle.test.js` (docs/.claude/root `.md`, `handbook/` `.md`/`.png`), `expect(classifyNameStatus(z).kind).toBe('no-code')` e `expect(classifySecurityScope(z).kind).toBe('skip')`.

- [ ] **Step 2: Scrivi i test end-to-end (`describe('security-scope.mjs end to end')`)** con gli stessi helper di `classify-cycle.test.js` (repository in `mkdtempSync`, `E2E_TIMEOUT`):
  - commit che tocca `api/src/a.js` e `api/package-lock.json` → stdout `review\naudit: api\napi/src/a.js\napi/package-lock.json\n` (ordine dei path = ordine di git);
  - commit che tocca solo `docs/a.md` → stdout `skip\naudit: none\n`;
  - range `HEAD...HEAD` → `skip\naudit: none\n`, exit 0 (Review Focus 4);
  - fuori da un repository → exit non zero, stdout `''`, stderr che inizia con `security-scope:`.

- [ ] **Step 3: Esegui e verifica il rosso**

Run: `npx vitest run scripts/security-scope.test.js`
Expected: FAIL, `Failed to load url ./security-scope.mjs` (o equivalente: modulo assente).

- [ ] **Step 4: Implementa `scripts/security-scope.mjs`.** Header di commento come quello di `classify-cycle.mjs`: cosa decide, chi lo legge (`finish-cycle.md` Gate 1 e Gate 2 step 0), che la lista normativa è il test, che un errore vale `review` per chi legge, il rimando alla Spec. Lettura dei record uguale a `classifyNameStatus` (due path per R/C, solo il destinatario per C, stream troncato → `{ kind: 'review', audit: ['api', '.'], paths }`). Spostamento fra pubblici (R/C con `audienceOf` diversi, oppure D+A dello stesso basename in pubblici diversi) → `review`, con i path coinvolti in `paths`. Match sempre per prefisso o per path esatto, mai per sottostringa. CLI e blocco `if (process.argv[1] && import.meta.url === …)` come in `classify-cycle.mjs`, messaggio d'errore `security-scope: …`.

- [ ] **Step 5: Esegui e verifica il verde**

Run: `npx vitest run scripts/security-scope.test.js scripts/classify-cycle.test.js`
Expected: PASS, entrambi i file.

- [ ] **Step 6: Prova a secco sul repository vero**

Run: `node scripts/security-scope.mjs 1efbff5^1...1efbff5` (merge del ciclo password-policy, tocca `api/`)
Expected: prima riga `review`, seconda `audit: none`, path sotto `api/src/`.
Run: `node scripts/security-scope.mjs main...HEAD`
Expected: `skip` e `audit: none` (finora il branch tocca solo `scripts/`).

- [ ] **Step 7: Commit**

```bash
git add scripts/security-scope.mjs scripts/security-scope.test.js
git commit -m "feat(process): security-scope.mjs decides when a cycle needs a security review"
```

### Task 2: riga `Security surface` — guard, `feature-brief`, §6b

**Files:**
- Modify: `scripts/decision-ledger-guard.test.js` (nuova regola accanto a `BRIEF_CUTOFF`/`checkBriefStarted`, `:170-187`, e il suo `describe` live accanto a `:458-466`; aggiorna il commento d'intestazione con la quarta regola)
- Modify: `.claude/skills/feature-brief/SKILL.md` (Step 3, voce **Constraints**; Output)
- Modify: `docs/superpowers/PROCESS.md` §6b, paragrafo "Header della Spec (dal 2026-10-14)"

**Interfaces:**
- Produces: `const SECURITY_CUTOFF = '2026-11-17'`, `const SECURITY_EXEMPT = new Set(['docs/superpowers/specs/2026-11-17-password-policy-design.md'])`, `function securityInScope(relPath): boolean` (stesso filtro di `briefInScope` + cutoff/esenzione propri), `function checkSecuritySurface(markdown): boolean`.

- [ ] **Step 1: Scrivi i test di `checkSecuritySurface`** (stile di `describe('checkBriefStarted')`):
  - true: `'# S\n**Security surface:** no\n'`, `'# S\r\n**Security surface:** yes — route, input\r\n'`;
  - false: `'**Security surface:** maybe\n'`, `'**Security surface:** yes\n'` (manca la superficie), `'**Security surface:** yes — \n'`, `'# S\n**Date:** 2026-11-17\n'`.
  - `securityInScope`: false per la Spec esente, per una Spec del `2026-11-16`, per un `-brief.md`; true per `docs/superpowers/specs/2026-11-17-security-process-design.md`.
  - `describe('live specs: Security surface')`: ogni Spec in scope porta la riga; messaggio di errore che cita `PROCESS.md 6b`.

Regex della riga: `^\*\*Security surface:\*\* (no|yes — \S.*)\s*$`.

- [ ] **Step 2: Esegui e verifica il rosso**

Run: `npx vitest run scripts/decision-ledger-guard.test.js`
Expected: FAIL, `checkSecuritySurface is not defined`.

- [ ] **Step 3: Implementa costanti e funzioni**, poi riesegui: PASS (la Spec di questo ciclo porta già `**Security surface:** no`).

- [ ] **Step 4: `feature-brief`.** Nella voce **Constraints** dello Step 3 aggiungi che la sezione porta sempre la riga `**Security surface:** yes — <input | route | permissions | rendering of user data | dependencies> | no`, decisa dal codice letto, altrimenti chiesta all'utente. Nell'Output: la riga compare anche quando la risposta è `no`.

- [ ] **Step 5: PROCESS.md §6b.** Nel paragrafo "Header della Spec", una frase: dal 2026-11-17 l'header porta anche `**Security surface:** yes — <superficie>` oppure `**Security surface:** no`, con la stessa riga del Brief; con `yes` la Spec ha almeno un criterio di accettazione su quella superficie; la pretende `scripts/decision-ledger-guard.test.js`.

- [ ] **Step 6: Verifica**

Run: `npx vitest run scripts/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/decision-ledger-guard.test.js .claude/skills/feature-brief/SKILL.md docs/superpowers/PROCESS.md
git commit -m "feat(process): Briefs and Specs declare their security surface; the ledger guard pins it"
```

### Task 3: `/finish-cycle` — audit, seconda run, round 1, report

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — Gate 1 (nuovo step tra 1 e 2; il rientro dopo un rosso), Gate 2 step 0, Gate 3 (paragrafo "First, collect the background review", step 3 round successivi), Gate 5 (template del report: riga `**Security review:**` e riga audit), introduzione del comando (una frase).

**Interfaces:**
- Consumes: il contratto CLI del Task 1 (Global Constraints).
- Produces: i nomi `<security-scope>` (verdetto + path) e `<security-reviewed-sha>`, usati solo dentro `finish-cycle.md`.

- [ ] **Step 1: Verifica il diff del built-in.** Nel worktree invoca la skill `security-review` e leggi il prompt espanso: annota quale riferimento usa per il diff (`origin/HEAD`, merge-base o altro). Interrompi la revisione dopo averlo letto. Se usa `origin/HEAD`, il prompt dell'agente al Gate 2 lo dice e chiede `git rev-parse origin/HEAD main`; se divergono, l'agente rivede `git diff main...HEAD`. Scrivi il riferimento osservato nel messaggio di commit dello Step 6.

- [ ] **Step 2: Gate 1.** Nuovo step, numerato come `1b` per non spostare i rimandi esistenti ("Gate 1 step 3"): esegue `node scripts/security-scope.mjs` e applica le Global Constraints sull'audit. Un advisory `high`+ su `api` è un rosso, con lo stesso rientro dello step 1 (re-entry allo step 0 scoped). Il risultato viene registrato per il report. `<security-scope>` si registra qui e il Gate 2 lo riusa. Se HEAD si è mosso dopo il Gate 1 verde, il Gate 2 riesegue lo script.

- [ ] **Step 3: Gate 2 step 0.** Una sotto-voce dopo quella che lancia `/code-review`: su `review` lancia il secondo agente in background (prompt: invoca `/security-review`, scope `main...HEAD`, controllo del riferimento dello Step 1, restituisce i finding con gravità e confidenza), registra `<security-reviewed-sha>`. Skip solo se in questa sessione una `/security-review` ha già coperto l'HEAD corrente. Lo skip di Gate 3 step 0 non lo tocca. Su `skip` nessuna run. Vale la stessa regola "non mostrare i finding, nessun fix" e lo stesso fallback se il background non è disponibile. Il ramo no-code non ha una regola propria.

- [ ] **Step 4: Gate 3.**
  - Nel paragrafo di raccolta: raccoglie anche la run di sicurezza. Se è morta, scaduta o illeggibile, la dichiara non revisionata e rilancia `/security-review` in primo piano prima dello step 2. I finding entrano nel round 1 con prefisso e mappatura (Global Constraints).
  - Se HEAD si è mosso e `node scripts/security-scope.mjs <security-reviewed-sha>..HEAD` non stampa `skip`, il `/code-review` scoped già previsto porta anche la consegna di sicurezza.
  - Nella voce dei round successivi: se il round chiuso ha corretto finding `[security]`, il prompt del `/code-review` scoped li porta con la consegna di verificare che i fix li chiudano senza aprirne altri. Nessuna seconda `/security-review`, il tetto dei round non cambia.

- [ ] **Step 5: Gate 5, template del report.** Aggiungi `**Security review:** <ran — <security-scope> paths… · N findings (disposizione) | skipped — <motivo>>` accanto alla riga del pre-check. Nella riga del Gate 1 in "Gate outcomes" va l'esito dell'audit: `clean`, `N advisory high+`, `not run — <motivo>` oppure `none`. Aggiungi un esempio nella lista di esempi (`:237`).

- [ ] **Step 6: Verifica e commit**

Run: `npx vitest run scripts/` e `grep -n "security-scope\|security-review\|npm audit" .claude/commands/finish-cycle.md`
Expected: PASS. Il grep mostra Gate 1 step 1b, Gate 2 step 0, Gate 3 (raccolta, round successivi) e Gate 5 (template).

```bash
git add .claude/commands/finish-cycle.md
git commit -m "feat(process): finish-cycle runs npm audit and /security-review when security-scope asks"
```

### Task 4: PROCESS.md §6.4e, CLAUDE.md, verifica finale

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — nuova `### 6.4e` dopo §6.4d. Riletture di `:62` e `:121`, da cambiare solo se diventano false.
- Modify: `CLAUDE.md` — blocco File structure, una voce `scripts/security-scope.mjs` subito dopo `scripts/classify-cycle.mjs` (`:201`), nella stessa forma.

- [ ] **Step 1: §6.4e.** Titolo `### 6.4e Revisione di sicurezza e audit delle dipendenze, decisi dai path`. Contenuto, in punti:
  - il principio: la decide `scripts/security-scope.mjs`, la regola è il test, mai un giudizio sul contenuto;
  - gira in background al Gate 2 con i vincoli di §6.4b e i finding vanno nel round 1 del Gate 3;
  - un fallimento dello script vale `review`;
  - una volta per ciclo, e i round successivi passano dal `/code-review` scoped;
  - l'audit delle dipendenze al Gate 1;
  - il report lo dichiara.

  Rimanda a `finish-cycle.md` per il comportamento e a §6b per la riga `Security surface`. Non elencare le superfici.

- [ ] **Step 2: CLAUDE.md.** Voce: `scripts/security-scope.mjs — decides for `/finish-cycle` whether a branch needs `/security-review` and which packages get `npm audit`; the rule is pinned by its own `.test.js`.` In inglese, su due righe come le voci vicine.

- [ ] **Step 3: Verifica finale**

Run: `npm test`
Expected: PASS, guard documentali inclusi (`claude-md-guard`, `doc-paths-guard`, `decision-ledger-guard`, `architecture-guard`).
Run: `grep -rn "api/src/\*\*\|docker-compose\*" docs/superpowers/PROCESS.md .claude/commands/finish-cycle.md`
Expected: nessuna occorrenza: la lista delle superfici non è ripetuta.
Run: `node scripts/security-scope.mjs main...HEAD`
Expected: `skip`, `audit: none`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/PROCESS.md CLAUDE.md
git commit -m "docs(process): PROCESS.md 6.4e and CLAUDE.md point at security-scope.mjs"
```

## Decisioni aperte

1. **Cutoff della riga `Security surface` al 2026-11-17 con esenzione chiusa della Spec password-policy.** Alternativa scartata: cutoff al giorno dopo il merge. Perché: copre ogni Spec scritta dopo questa, anche nello stesso giorno, con un'esenzione di un solo file.
2. **Lo step audit del Gate 1 si numera `1b`.** Alternativa scartata: rinumerare gli step 2-4. Perché: "Gate 1 step 3" è citato altrove, e il Gate 5 usa già `2b` per la stessa ragione.
3. **Il diff del built-in si verifica leggendone il prompt espanso (Task 3 Step 1).** Alternativa scartata: una run completa di prova. Perché: basta il riferimento del diff, e il branch stesso dà `skip`.
4. **Una run di sicurezza illeggibile si rilancia in primo piano al Gate 3.** Alternativa scartata: di nuovo in background. Perché: al Gate 3 il round 1 la aspetta comunque, come per `/code-review` allo step 1.
