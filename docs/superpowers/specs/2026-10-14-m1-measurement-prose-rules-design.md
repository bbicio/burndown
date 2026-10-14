# M1 — misurazione dei cicli + regole di scrittura della prosa

**Date:** 2026-10-14
**Brief started:** 2026-10-14 11:17
**Brief:** `docs/superpowers/briefs/2026-10-14-m1-measurement-prose-rules-brief.md`
**Scenario:** 1 (script di misurazione) + 2 (header della Spec, report del Gate 5, `CLAUDE.md`)

## 1. Perimetro

Gli interventi, tutti nel Brief:

1. script `scripts/cycle-times.mjs`, lanciato a mano;
2. riga `**Brief started:**` nell'header di ogni Spec, con guard;
3. riga `**Cycle counters:**` nel report del Gate 5;
4. sottosezione `### Writing documentation` in `CLAUDE.md`;
5. spostamento verbatim di `### Cost grid editor ↔ pipeline board integration` da `CLAUDE.md` a
   `docs/pages/costgrid.md`.

Fuori perimetro: vedi il Brief, sezione «Explicitly excluded scope».

## 2. `scripts/cycle-times.mjs`

**Uso:** `node scripts/cycle-times.mjs`. Non scrive file, non è eseguito da nessun gate. Le istruzioni
d'uso stanno nel commento d'header dello script.

**Elenco dei cicli.** Un ciclo per ogni file `docs/superpowers/reports/*-finish-cycle.md`. Dal report
si legge il branch dalla riga `**Branch:** <branch> → main` (il testo dopo `→ main` è ignorato).

**Merge.** Fra i merge di `git log --merges --first-parent main`, quello il cui soggetto è
`Merge branch '<branch>'`, da solo o seguito da `: <descrizione>`, confrontato come testo letterale.
Nessun risultato, o più di uno → tutti i campi git del ciclo sono `unknown`.

**Commit di esecuzione.** `git log --no-merges M^1..M^2`, esclusi i commit il cui unico contenuto è un file
sotto `docs/superpowers/specs/`, `docs/superpowers/plans/` o `docs/superpowers/briefs/`. Primo e
ultimo per author date.

**Spec e Piano.** Fra i file in `docs/superpowers/specs/` (risp. `plans/`) con nome
`YYYY-MM-DD-<slug>-design.md` (risp. `YYYY-MM-DD-<slug>.md`) e `<slug>` contenuto nel nome del
branch: quello il cui `<slug>` è uguale al nome del branch, con o senza i suoi prefissi `worktree-`.
Altrimenti, fra quelli aggiunti (`git log --diff-filter=A --format=%aI -- <file>`) dopo il merge
precedente su `main` e non oltre il merge del ciclo, quello con lo slug più lungo. Nessuno, o due
slug più lunghi a pari lunghezza → `unknown`.

**Brief started.** Letto dalla riga `**Brief started:**` della Spec trovata; assente → `unknown`.

**Output.** Una riga per ciclo, ordinata per data di merge: branch, i momenti (Brief, Spec, Piano,
primo commit di esecuzione, ultimo commit, merge) e gli intervalli fra momenti consecutivi in
minuti. Un intervallo con un estremo `unknown` è `unknown`. Mai stime.

**Struttura.** Funzioni pure esportate e un involucro sottile che chiama `git` via
`execFileSync`. Stesso schema di `scripts/classify-cycle.mjs`.

**Test.** `scripts/cycle-times.test.js` (vitest, già incluso da `vitest.config.js`) copre le
funzioni pure: branch con e senza testo dopo `→ main`; slug con zero, una e due corrispondenze;
intervallo con un estremo `unknown`; ordinamento. Nessun test esegue `git`.

## 3. Riga `Brief started` nell'header della Spec

**Formato:** `**Brief started:** YYYY-MM-DD HH:MM`, oppure `**Brief started:** unknown`. È l'ora di
inizio di `/feature-brief`, o di `/brainstorming` quando il ciclo non ha Brief.

**Dove sta la regola:** `docs/superpowers/PROCESS.md` §6b, sottosezione «Il ledger», un paragrafo
che nomina la riga, il suo formato e `scripts/cycle-times.mjs` come suo lettore.

**Guard.** `scripts/decision-ledger-guard.test.js` riceve un secondo controllo: ogni Spec in
`docs/superpowers/specs/`, nome datato dal **2026-10-14** in poi, non `-brief.md`, porta una riga che
corrisponde a `^\*\*Brief started:\*\* (\d{4}-\d{2}-\d{2} \d{2}:\d{2}|unknown)\s*$`. Solo le Spec,
non i Piani. Il commento d'header del guard dichiara il nuovo controllo e il suo limite: verifica che
la riga ci sia, non che il valore sia giusto (§6b, «Il confine dei guard»).

## 4. Contatori nel report del Gate 5

In `.claude/commands/finish-cycle.md`, template del report: una riga nuova sotto `Gate durations`:

```markdown
**Cycle counters:** subagent dispatches <N> · review rounds <N> · full test-suite runs <N>
```

- **subagent dispatches:** le chiamate al tool Agent dall'inizio dell'esecuzione del Piano al Gate 5.
- **review rounds:** i round del Gate 3.
- **full test-suite runs:** le esecuzioni complete di `npm test` e della suite backend
  (`node --test` su `api/`); le esecuzioni mirate a singoli file non contano.

Un valore che la sessione non ha osservato per intero è `unknown`. Il pre-flight step 6 nomina i
contatori accanto ai timestamp che già raccoglie.

## 5. Regole di scrittura in `CLAUDE.md`

Nuova sottosezione `### Writing documentation`, ultima di `## Development` (dopo
`### Testing & tooling`):

- State a rule without its justification.
- No numbers or counts in prose: cite the command or test that measures them.
- A rule lives in one file; other files link to it.
- When review finds a false sentence, consider deleting it before rewording it.

Nessun rimando da altri file.

## 6. Spostamento verbatim

`### Cost grid editor ↔ pipeline board integration` (`CLAUDE.md`, dall'intestazione alla riga prima
di `### Invariants`) diventa `## Cost grid editor ↔ pipeline board integration` in
`docs/pages/costgrid.md`, inserita prima di `## Base state`. Il corpo è byte-identico; cambia solo il
livello dell'intestazione. Unica eccezione, decisa al Gate 3 round 1: il link a `docs/pages/costgrid.md`
nel quarto punto, che dal nuovo file puntava a se stesso, diventa `see "New Proposal / Clone" above`. Nessun puntatore residuo in `CLAUDE.md`: la riga `costgrid.html` della
tabella Pages punta già a `docs/pages/costgrid.md`.

Prima dello spostamento: verificare che fra l'intestazione e `### Invariants` ci sia solo il blocco
voluto, e che nessun file vivo citi la sezione per nome
(`grep -rn "Cost grid editor ↔ pipeline board integration" --include=*.md .`).

## 7. Verifica

- `npm test` verde, incluso `scripts/claude-md-guard.test.js` senza alzare il tetto.
- `tr -d '\r' < CLAUDE.md | wc -c` rimisurato a HEAD, dopo l'ultima modifica.
- `node scripts/cycle-times.mjs` stampa una riga per ogni report; controllo a mano di un ciclo con
  Spec e Piano (`backlog-follow-up`) e di uno senza (`m3-m2-process-dedup`).
- Corpo spostato: `diff` fra il blocco estratto da `CLAUDE.md` a `main` e quello in
  `docs/pages/costgrid.md`, escluse le intestazioni: l'unica differenza è la riga dell'eccezione di §6.

## Decisioni aperte

1. **Ciclo↔Spec/Piano per slug uguale al nome del branch; altrimenti slug più lungo contenuto nel nome, aggiunto fra il merge precedente su `main` e quello del ciclo** (Gate 3, 2026-10-14: la sola sottostringa attribuiva a un ciclo documenti di cicli più vecchi, round 1; la sola finestra scartava Spec e Piano propri quando un altro ciclo era entrato nel frattempo, round 2). Alternativa scartata: leggere i path dal report, o un file di mappatura a mano. Perché: i report li citano in modo incoerente e un file di mappatura è un'altra cosa da mantenere.
2. **Esecuzione = `M^1..M^2` meno i commit di sola Spec/Piano/Brief.** Alternativa scartata: `Execution started` del report. Perché: quel campo segna l'inizio del closeout, non dell'esecuzione.
3. **Guard sulla riga `Brief started`, nelle sole Spec, dal 2026-10-14.** Alternativa scartata: nessun guard. Perché: lo skill di brainstorming è un plugin che non conosce la regola.
4. **«Ripetizioni dei test» = esecuzioni complete della suite.** Alternativa scartata: contare anche quelle mirate. Perché: le esecuzioni mirate sono la disciplina di §6.2, non un costo.
5. **Lo script non entra nell'indice `File structure` di `CLAUDE.md`.** Alternativa scartata: aggiungerlo. Perché: costa byte e richiede di alzare il pin del blocco.
6. **Blocco spostato: Cost grid ↔ pipeline, verso `docs/pages/costgrid.md`.** Alternativa scartata: Script loading order o Cache-busting. Perché: contengono regole che devono restare in contesto.
7. **`Brief started` di M1 = ora di creazione del file del Brief.** Alternativa scartata: `unknown`. Perché: è un valore misurato sul filesystem, non stimato.
8. **Il guard di `Brief started` vive in `scripts/decision-ledger-guard.test.js`.** Alternativa scartata: un file guard nuovo. Perché: stesso perimetro di file e stessa logica di data; nata scrivendo la Spec.
