# Ramo "ciclo senza codice" nel Gate 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare al Gate 2 di `/finish-cycle` un ramo "ciclo senza codice" che conferma una classificazione meccanica invece di porre una domanda di verifica browser che su quel diff non ha risposta onesta.

**Architecture:** tre edit chirurgici al solo Gate 2 di `.claude/commands/finish-cycle.md` — un paragrafo **non numerato** di classificazione dopo il preambolo del teardown, una riga di precondizione prima dello step 1, un sotto-punto di ramo nello step 6 — più due aggiunte a `docs/superpowers/PROCESS.md` (§1 e nuovo §6 punto 4c) richieste da §7 condizione 3. Nessuna rinumerazione: i numeri degli step del Gate 2 sono citati da quattro punti.

**Tech Stack:** Markdown. Nessun codice eseguibile, nessuna dipendenza, nessun test automatico (non esiste alcuna infrastruttura di test sulla prosa di `.claude/commands/`, e questo ciclo non la introduce — fuori scope per spec §6).

**Spec:** `docs/superpowers/specs/2026-10-09-finish-cycle-no-code-gate2-design.md` (commit `18cc87a`)

## Global Constraints

- **Modificare solo il Gate 2** in `.claude/commands/finish-cycle.md`. Pre-flight, Gate 1, Gate 3, Gate 4, Gate 5 sono fuori scope (spec §7.2).
- **Nessuna rinumerazione degli step del Gate 2.** I numeri sono citati da `finish-cycle.md:27` (→ step 6 e step 1), `:44` (→ step 6), `:50` (→ step 0) e `:55` (Gate 3 → "Gate 2 step 0").
- **Step 0 e il preambolo `:27` restano invariati al carattere** (spec §4.2).
- **`finish-cycle.md` e `PROCESS.md` sono CRLF senza BOM.** Preservare le terminazioni di riga e non introdurre un BOM: applicare gli edit con lo strumento Edit o con un round trip Python, **mai** via `Get-Content`/`Set-Content` PowerShell. Verifica dopo ogni edit.
- **Testo del comando in inglese** (`finish-cycle.md` è interamente in inglese); **`PROCESS.md` in italiano**, ma deve portare **entrambi** i nomi — "ciclo senza codice" e "no-code cycle" — per il criterio di accettazione 7.
- **Il criterio è meccanico**: confronto di path, mai un giudizio su "di cosa parla il ciclo".
- **Il nome è "ciclo senza codice" / "no-code cycle"**, mai "process-only".
- **Fuori scope, da non aggiungere nemmeno se sembra utile** (spec §7): nessuno script e nessun hook che automatizzi la classificazione; nessun formato `*-fast.md` e nessun collasso Brief+Spec+Piano (la *fast lane* è stata rifiutata); nessuna estensione della whitelist oltre i tre path (es. `scripts/`, `*.sql`); il Gate 3 non diventa saltabile.

## Review Focus

Non esistendo test automatici, queste cinque condizioni sono quelle che il testo deve rendere **non ambigue da solo**; ciascuna ha la sua riga nel dry-run del Task 1, Step 3.

1. **Match di prefisso, non di sottostringa.** `api/docs/helper.md` contiene `docs/` ma non è documentazione: deve risultare *ordinario*. Se il testo dice "matches `docs/`" senza ancorarlo all'inizio del path, il gate si auto-salta su un file dentro `api/`. È la più pericolosa delle cinque.
2. **Diff misto.** Un ciclo di sola documentazione che però bumpa un `?v=N` in una pagina HTML ha un path fuori whitelist: deve risultare *ordinario*, senza discussione della classificazione.
3. **Rinomine e cancellazioni.** Cycle 4 e Cycle 6 sono interamente spostamenti di prosa, e `git diff --name-only` emette sia il path vecchio sia quello nuovo: **entrambi** devono stare nella whitelist perché il ciclo sia senza codice (`CLAUDE.md` → `docs/x.md` lo è; `js/a.js` → `docs/a.md` non lo è).
4. **Root `*.md` caricato a runtime.** Dopo il Cycle 3, `TEST_CASES.md` sarà caricato dall'app: il testo deve rendere riconoscibile il caso e dire chi aggiorna la lista delle eccezioni, altrimenti un cambio di rendering passa come senza codice.
5. **Lista di path vuota.** "ogni path corrisponde" su zero path è vero per vacuità: deve risultare *ordinario*.

---

### Task 1: il ramo nel Gate 2 di `finish-cycle.md`

**Files:**
- Modify: `.claude/commands/finish-cycle.md` — tre edit, tutti dentro `## Gate 2`
- Test: nessuno (non esiste infrastruttura di test sulla prosa dei comandi; la verifica è lo Step 3)

**Interfaces:**
- Consumes: niente (primo task)
- Produces: il nome della variabile `<no-code-cycle>` e i termini "no-code cycle" / "ciclo senza codice", che il Task 2 cita in `PROCESS.md`. Il Task 2 non deve inventare sinonimi.

I tre edit formano un solo meccanismo: un revisore non può accettarne uno e rifiutarne un altro senza lasciare il gate incoerente. Per questo sono un unico task.

- [ ] **Step 1: inserire il paragrafo di classificazione**

Subito **dopo** il paragrafo del preambolo teardown (`finish-cycle.md:27`) e **prima** di `0. **Launch the code review now...`. Testo esatto:

```markdown
**Classification — is this a no-code cycle? (mechanical, before anything else below.)** Run `git diff --name-only main...HEAD`. This is a **no-code cycle** when **every** path returned starts with `.claude/`, starts with `docs/`, or is a root-level `*.md` (no `/` anywhere in the path) — except for the named exceptions below. Match on the **start** of the path, never anywhere inside it: `api/docs/helper.md` contains `docs/` but is a file under `api/`, so it is code. A rename shows both the old and the new path and **both** must qualify. An empty path list does not qualify (it cannot normally occur — pre-flight check 3 stops the command when there are no commits — and "every path qualifies" must not be vacuously true). A single path outside makes this an ordinary cycle: go through the gate below unchanged and do not raise the classification at all. Record the result as `<no-code-cycle>`.
- **The test is the path list, never a judgment about what the cycle is "about".** The name is deliberately "no-code cycle", not "process-only": `PRD.md` and `docs/prd/` are product documentation, which "process-only" would misclassify.
- **Named exceptions — root `*.md` files the running app loads at runtime: none at present.** Such a file counts as **code** here, because changing it changes what a page renders; `nginx.conf`'s `location /` already serves root `*.md` over HTTP. The cycle that makes the app fetch one adds its filename to this list, in that same cycle — if you are implementing such a cycle, this list is yours to update. The same rule covers a tracked executable or configuration file under `.claude/`: none exists today, since git tracks only `*.md` there and `settings.local.json` is gitignored.
- **On a no-code cycle:** step 0 below **still runs** — a prose-only diff is exactly where review earns its keep (one doc-split cycle produced 10 of its 16 findings on prose) — steps 1-5 are skipped, and step 6 takes its no-code branch. No test environment is ever created, so `<branch-env-active>` stays false and the teardown rule above has nothing to act on.
```

- [ ] **Step 2: inserire la riga di precondizione e il ramo dello step 6**

Due inserimenti, nello stesso file:

**(a)** Immediatamente prima di `1. Run \`scripts/test-branch.sh status\`.`:

```markdown
**Steps 1-5 apply only when `<no-code-cycle>` is false; on a no-code cycle go straight to step 6.**
```

**(b)** Come ultimo sotto-punto dello step 6, dopo la riga che inizia `- If "yes": if \`<branch-env-active>\` is true...` (`:51`):

```markdown
   - **No-code cycle branch (`<no-code-cycle>` true).** Do not ask the browser question: on this diff it has no honest answer — "yes" would be false and "no" stops the cycle — and a "yes" given as a formality erodes the very gate the two 2026-09-15 incidents created. Instead show `git diff --stat main...HEAD` **and** the full path list (the `--stat` alone elides paths once there are many, and it is the classification being checked, not the content), then ask explicitly: "Every path in this diff is in `.claude/`, `docs/` or a root `*.md`, so there is nothing to verify in a browser — confirm this is a no-code cycle? [yes/no]"
     - If the answer is "no", or anything other than a clear yes: **stop and wait. Do not proceed.** Exactly as the code branch above. There is no environment to leave running.
     - If "yes": proceed to Gate 3. The review launched at step 0 still has to be collected there and its findings handled — a no-code cycle does not skip Gate 3.
     - Record in the Gate 5 report's "What was done" section that this gate took the no-code branch and the browser question was not asked. That report is the only persistent trace of it; do not add a new field to the report template, and do not write `0m (skipped)` for this gate — it is reserved for a gate that self-skips, and this one does ask a question.
```

- [ ] **Step 3: verificare il testo col dry-run del criterio**

Non c'è un test da eseguire: la verifica è applicare il paragrafo appena scritto, **leggendolo**, a queste liste di path e controllare che dia la risposta attesa. Se una riga è dubbia, il testo è ambiguo e va corretto, non interpretato.

| Lista di path in `git diff --name-only main...HEAD` | Atteso | Review Focus |
|---|---|---|
| `.claude/commands/finish-cycle.md`, `docs/superpowers/PROCESS.md` | senza codice | — (questo ciclo) |
| `api/docs/helper.md` | **ordinario** | 1 |
| `docs/pages/pipeline.md`, `pipeline.html` | **ordinario** | 2 |
| `CLAUDE.md` (cancellato), `docs/architecture/x.md` (aggiunto) | senza codice | 3 |
| `js/a.js` (cancellato), `docs/a.md` (aggiunto) | **ordinario** | 3 |
| `TEST_CASES.md` | senza codice **oggi**; ordinario dopo che il Cycle 3 lo aggiunge alle eccezioni | 4 |
| (lista vuota) | **ordinario** | 5 |
| `scripts/gen-architecture.mjs`, `ARCHITECTURE.md` | **ordinario** | 2 |

- [ ] **Step 4: verificare integrità e byte**

```bash
grep -n "step 6 below\|step 1 below\|Gate 2 step 0\|If step 0 launched" .claude/commands/finish-cycle.md
grep -ni "no-code" .claude/commands/finish-cycle.md
git diff --numstat .claude/commands/finish-cycle.md
python -c "b=open('.claude/commands/finish-cycle.md','rb').read(); print('CRLF' if b'\r\n' in b else 'LF', 'BOM' if b.startswith(b'\xef\xbb\xbf') else 'no BOM')"
```

Atteso: i quattro riferimenti incrociati ancora presenti e ancora corretti; `no-code` trovato; `numstat` con **0 righe rimosse** — i tre edit sono inserzioni pure, quindi qualunque rimozione significa che si è riscritto del testo esistente e va indagata; `CRLF no BOM`.

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/finish-cycle.md
git commit -m "feat: no-code cycle branch in finish-cycle Gate 2"
```

---

### Task 2: `PROCESS.md` — §1 e nuovo §6 punto 4c

**Files:**
- Modify: `docs/superpowers/PROCESS.md` — §1 (riga `/finish-cycle` della tabella) e §6 (nuovo punto `4c`, subito dopo `4b`)
- Test: nessuno

**Interfaces:**
- Consumes: dal Task 1, il nome `<no-code-cycle>` e i termini "no-code cycle" / "ciclo senza codice". Usare **gli stessi**, non sinonimi.
- Produces: niente (ultimo task)

Task separato dal 1 perché separatamente rifiutabile: un revisore può accettare la modifica al gate e volere il 4c formulato diversamente. L'aggiornamento è **obbligatorio in questo stesso ciclo** — §7 condizione 3 ("modifica dei gate di `/finish-cycle`") è triggerata.

- [ ] **Step 1: §1 — riga `/finish-cycle` della tabella**

Nella descrizione della verifica manuale, dopo il passaggio su `scripts/test-branch.sh status`, aggiungere che il gate ha un ramo per il **ciclo senza codice (no-code cycle)**: se ogni path del diff inizia per `.claude/`, `docs/` o è un `*.md` di root, il gate chiede di confermare la classificazione invece della verifica browser, e il Gate 3 non si salta. Una frase, dentro la cella esistente, senza riscrivere il resto della riga.

- [ ] **Step 2: §6 — nuovo punto `4c`, subito dopo `4b`**

Nuovo punto in grassetto `**4c. Il Gate 2 ha un ramo per i cicli senza codice (2026-10-09).**` seguito da bullet che coprono, senza aggiungere altro:

- il criterio meccanico (whitelist dei tre path, match di **prefisso**, eccezioni nominate oggi vuote, lista vuota = ordinario) e il termine inglese **no-code cycle**, perché il criterio di accettazione 7 richiede che il `grep` lo trovi anche qui;
- **perché esiste**: su quel diff la domanda del browser non ha risposta onesta, e il programma di ottimizzazione processi contiene 4 cicli senza codice su 6 — quattro occasioni di rispondere "yes" per formalità allo stesso gate nato dai due incidenti del 2026-09-15. **Non è una misura di risparmio di tempo**: i 2-5 minuti di spin-up Docker non la giustificherebbero;
- **cosa NON cambia**: step 0 (lancio review) gira in entrambi i rami, il Gate 3 non è saltabile, il preambolo del teardown e la domanda del browser sul ramo ordinario sono invariati, `npm test` al Gate 1 resta in ogni ciclo;
- il nome è "ciclo senza codice", non "process-only", e il perché (`PRD.md`/`docs/prd/` è documentazione di prodotto);
- che un root `*.md` caricato a runtime dall'app conta come codice, con il caso pendente `TEST_CASES.md` del Cycle 3 nominato esplicitamente.

- [ ] **Step 3: verificare**

```bash
grep -ni "no-code\|senza codice" docs/superpowers/PROCESS.md
grep -n "4b\.\|4c\.\|^\*\*5\." docs/superpowers/PROCESS.md
git diff --numstat docs/superpowers/PROCESS.md
python -c "b=open('docs/superpowers/PROCESS.md','rb').read(); print('CRLF' if b'\r\n' in b else 'LF', 'BOM' if b.startswith(b'\xef\xbb\xbf') else 'no BOM')"
```

Atteso: **entrambi** i termini presenti (criterio 7); `4c` esiste e sta fra `4b` e `5`; `CRLF no BOM`.

- [ ] **Step 4: rilettura dei 9 criteri di accettazione della spec**

Leggere §5 della spec e spuntare i 9 criteri uno per uno contro i due file modificati. Il criterio 2 ("nessuna modifica testuale agli step 1-6 sul ramo ordinario") si verifica col `git diff`: a parte le inserzioni previste, nessuna riga esistente deve risultare modificata.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/PROCESS.md
git commit -m "docs: PROCESS.md section 1 + 4c for the no-code cycle gate branch"
```

---

## Nota per chi chiude il ciclo

Questo ciclo **non può esercitare la propria modifica**: `/finish-cycle` carica il testo del comando dal checkout principale, non dal worktree (lezione del Cycle 1, dove lo stesso effetto ha fatto girare il flusso *pre-edit*). Al suo Gate 2 verrà quindi percorso il **ramo ordinario**, pur essendo questo ciclo un ciclo senza codice per la definizione che introduce. Il report del Gate 5 deve dirlo, non dichiarare il ramo verificato.
