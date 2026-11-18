# Ciclo di processo 2: passi in parallelo, documentazione nei task, report generato, test di site-export mirati — design spec

**Date:** 2026-11-18
**Brief started:** 2026-11-18 10:27
**Brief:** `docs/superpowers/briefs/2026-11-18-process-speed-2-brief.md`
**Scenario:** 2 (evoluzione di processo e tooling)
**Classe di rischio:** standard (file di processo `.claude/`, `docs/superpowers/PROCESS.md`, `CLAUDE.md`, script e test sotto `scripts/`, `vitest.config.js`, `package.json`; nessuna categoria `high-risk`)
**Security surface:** no

Il ciclo accorcia il contorno di ogni ciclo di sviluppo in quattro modi:

1. fa girare in parallelo i passi indipendenti;
2. sposta la documentazione dentro i task;
3. genera le parti meccaniche del report;
4. fa girare i test dello strumento di export solo quando cambia.

## 1. Passi in parallelo

### 1.1 Revisione finale e Gate 3

- **Quando parte.** Appena l'ultimo task del Piano è committato, l'esecutore lancia in background la revisione finale di PROCESS.md §6.4: `/code-review` all'effort della classe, su `main...HEAD`, con la Review Focus del Piano. Subito dopo invoca `/finish-cycle`, senza aspettarne l'esito.
- **Niente fix pass dell'esecutore.** I finding della revisione si trattano al Gate 3 come round 1, con le regole di oggi: disposizione per destinazione, domanda all'utente, round successivi ristretti, tetto, regola text-only.
- **Gate 2 step 0.** Se la revisione finale è in corso o conclusa, lo step non ne lancia un'altra. La annota come la revisione del round 1 e ne registra l'HEAD come `<reviewed-sha>`. Se è morta o illeggibile vale "non revisionata", e il Gate 3 la rilancia (§6.4b).
- **Commit nati dopo.** Un commit nato dopo l'HEAD della revisione (fix del Gate 1, correzioni del Gate 2) si rivede con il round ristretto `<reviewed-sha>..HEAD`, come vuole già il Gate 3.
- **Test dei fix.** I fix del round 1 girano con i test dei file toccati. Il "Backend re-run" del Gate 3 copre il backend, come per ogni altro fix del Gate 3 (PROCESS.md §6.2).
- **Override.** La riga "Process override — final review and fix pass" di `CLAUDE.md` diventa: la revisione finale è quella di PROCESS.md §6.4, lanciata in background al commit dell'ultimo task; non c'è fix pass dell'esecutore; i finding vanno al Gate 3 di `/finish-cycle`.

### 1.2 Stack di branch durante il Gate 1

- **Pre-flight.**
  - Esegue `node scripts/classify-cycle.mjs` e registra `<no-code-cycle>`; la regola resta quella del Gate 2.
  - Su un ciclo ordinario lancia `scripts/test-branch.sh status`.
  - Se lo stack non è su chiede "Spin up an isolated test environment for this branch now?". Se è su chiede reuse/rebuild, con le stesse domande di oggi del Gate 2 step 1.
- **Avvio in parallelo.** Su "yes" o "rebuild", lo stack si avvia in background in parallelo al Gate 1.
  - `scripts/test-branch.sh up` e `scripts/run-tests.sh` possono girare insieme: lo stack di branch usa le porte fisse 5433/3001/8081/8082/8083, lo stack dei test nessuna porta sull'host.
  - Due `run-tests.sh`, o due suite complete, restano vietati in parallelo.
- **Gate 1 rosso.** Lo stack resta su per il rientro. Si smonta solo nei due punti di oggi: dopo il "yes" alla domanda del browser, o su "rebuild".
- **Gate 2 step 1.** Usa lo stack già avviato e non pone di nuovo la domanda. Se l'avvio in background è fallito lo dice, e chiede se riprovare.
- **Su un ciclo `no-code`** non si avvia niente, come oggi.

### 1.3 Bozza del report durante il Gate 2

Mentre l'utente verifica, l'agente scrive in `.superpowers/cycle-log/<branch-sanitized>.draft.md`, nel checkout principale, le parti di giudizio del report: Roadmap notes, follow-up già noti, rulings del ledger. Al Gate 5 la bozza entra nel report. Il file è gitignorato e non si committa mai.

## 2. Documentazione nei task

- **Override per `superpowers:writing-plans`.** Una riga "Process override — docs in the tasks" in `CLAUDE.md` dice che ogni task del Piano porta una riga `**Docs:**`.
  - La riga elenca i documenti che il task aggiorna nello stesso commit, oppure `none — <motivo>`.
  - I documenti sono quelli che descrivono il comportamento che il task cambia: `CLAUDE.md`, `docs/`, `handbook/restricted/ARCHITECTURE.md`, `PRD.md` e `docs/prd/`, `handbook/public/manual.md`, `handbook/restricted/TEST_CASES.md`.
  - Il task li aggiorna nel commit che cambia il comportamento.
- **Guard di forma.** `scripts/decision-ledger-guard.test.js` si estende. Un Piano fallisce se una sezione `### Task` non contiene una riga che inizia con `**Docs:**`. La regola vale per ogni Piano aggiunto da un commit che non è antenato del commit che ha aggiunto `docs/superpowers/plans/2026-11-18-process-speed-2.md`, l'ancora: cioè dal ciclo successivo a questo. L'ancora e i Piani precedenti sono esenti. Il controllo usa `git log --diff-filter=A` e `git merge-base --is-ancestor`, e se git non risponde il guard fallisce con un messaggio, non passa in silenzio. Il guard controlla solo la forma, mai se l'elenco è giusto (PROCESS.md §6b, "Il confine dei guard").
- **`/sync-docs` al Gate 5.**
  - Fa lo scope pass come oggi.
  - Per ogni sezione con "sì" controlla `git diff --name-only <merge>^1 <merge> -- <documento>`. Se il diff ha toccato il documento lo riporta come "already on branch" e non lo riscrive; altrimenti lo aggiorna come oggi.
  - Lo step di memoria non cambia.
  - Il testo sta in `.claude/skills/sync-docs/SKILL.md`, Process.

## 3. Report generato — `scripts/cycle-report.mjs`

- **`node scripts/cycle-report.mjs mark <evento> [--branch <nome>]`.**
  - Aggiunge `<ISO-8601 locale> <evento>` a `<root principale>/.superpowers/cycle-log/<branch-sanitized>.log`.
  - Gli eventi sono `preflight`, `gate1`, `gate2`, `gate3`, `gate4`, `merged`, `gate5`, `report`.
  - Il root principale è `git rev-parse --git-common-dir`/.. risolto, così un worktree scrive nel log del checkout principale.
  - Un evento già presente non si duplica: un rientro nello stesso gate non è una nuova entrata.
- **`node scripts/cycle-report.mjs render <branch>`.** Stampa le righe del report che oggi si scrivono a mano:
  - `**Execution started:**`, `**Merged at:**`, `**Gate durations:**` con il totale;
  - l'elenco dei commit del branch per "What was done", da `git log <merge>^1..<merge>^2`.
  - Un evento mancante dà `unknown`, mai una stima.
- **Restano a mano.** I contatori (dispatch, round, run della suite), la riga dei test del Gate 5 e tutto il giudizio.
- **`finish-cycle.md`.**
  - Il pre-flight step 6 e ogni ingresso di gate eseguono `mark`.
  - Il Gate 5 step 2 parte dall'output di `render` e dalla bozza del §1.3.
- **Test:** `scripts/cycle-report.test.js`, su un log e un repository git di prova:
  - parsing degli eventi;
  - durate in minuti;
  - `unknown` per un evento assente;
  - nessun duplicato al secondo `mark` dello stesso evento.

## 4. Test di site-export mirati

- **Esclusione.** `npm test` non esegue `scripts/site-export/**`.
- **Comando dedicato.** `npm run test:site-export` esegue solo quella cartella. Il meccanismo, config separata o variabile d'ambiente letta da `vitest.config.js`, lo sceglie il Piano: l'`exclude` di vitest si applica anche a un path passato esplicitamente.
- **Regola del Gate 1.** Dopo `npm test`, se `git diff --name-only main...HEAD` tocca `scripts/site-export*`, `scripts/lib/site-export*` o `scripts/site-export.rules`, il Gate 1 esegue `npm run test:site-export`. Un rosso lì è un rosso del Gate 1.
- **Gate 5.** Il sottoinsieme `npx vitest run scripts/ js/lib/test-cases-parse.test.js` non li esegue più, perché segue l'esclusione.
- **Test.** Un test in `scripts/` fallisce se l'esclusione colpisce un file fuori da `scripts/site-export/`. In particolare `scripts/site-export-guard.test.js` deve restare nella suite di default.
- **Documentazione.** `docs/scripts/site-export.md` dice quando girano i test.

## 5. Documentazione del ciclo

Il ciclo applica a sé stesso il §2: ogni task del Piano porta la sua riga `**Docs:**`.

- `docs/superpowers/PROCESS.md`:
  - §6.2: test di site-export;
  - §6.4: la revisione finale parte al commit dell'ultimo task ed è il round 1 del Gate 3;
  - §6.4b: lo step 0 trova la revisione già lanciata;
  - la tabella riassuntiva di `/finish-cycle`.
- `.claude/commands/finish-cycle.md`: pre-flight, Gate 1, Gate 2 step 0-1, Gate 5 step 2.
- `.claude/skills/sync-docs/SKILL.md`: il controllo "already on branch".
- `CLAUDE.md`: le due righe d'override. Il blocco File structure riceve la voce di `scripts/cycle-report.mjs` e il pin di `scripts/claude-md-guard.test.js` si aggiorna.
- `docs/scripts/site-export.md` e un file `docs/scripts/cycle-report.md`.

## Criteri di accettazione

1. **Revisione in parallelo** — PROCESS.md §6.4 e `CLAUDE.md` dicono che la revisione finale parte in background al commit dell'ultimo task, che l'esecutore non fa fix pass, e che il Gate 3 la tratta come round 1; `finish-cycle.md` Gate 2 step 0 non ne lancia un'altra quando ne trova una.
2. **Stack anticipato** — `finish-cycle.md` chiede lo stack al pre-flight su un ciclo ordinario, lo avvia in background durante il Gate 1, non lo smonta su un rosso del Gate 1, e il Gate 2 step 1 non ripete la domanda.
3. **Documentazione nei task** — `CLAUDE.md` ha la riga d'override sui `**Docs:**`; `scripts/decision-ledger-guard.test.js` fallisce su un Piano sintetico aggiunto dopo l'ancora con un task senza `**Docs:**`, passa con `**Docs:** none — <motivo>`, e non controlla l'ancora né un Piano aggiunto prima (test su un repository git di prova); `/sync-docs` descrive il controllo "already on branch".
4. **Report generato** — `scripts/cycle-report.mjs` con `mark` e `render` e `scripts/cycle-report.test.js` verde; `finish-cycle.md` lo usa al pre-flight, a ogni gate e al Gate 5.
5. **Site-export mirato** — `npm test` non esegue `scripts/site-export/`; `npm run test:site-export` esegue 60 casi; il test d'esclusione è verde; `finish-cycle.md` Gate 1 descrive la condizione.
6. **Durata misurata** — `npm test` prima e dopo, con lo stato di Docker identico nelle due misure, nel report.
7. **Guard verdi** — `npm test` passa, compresi `claude-md-guard`, `doc-paths-guard`, `decision-ledger-guard`, `site-export-guard`.

## Decisioni aperte

1. **La revisione finale diventa il round 1 del Gate 3 e l'esecutore non fa più un fix pass.** Alternativa scartata: lanciare la revisione presto ma lasciare il fix pass all'esecutore prima del Gate 1. Perché: la revisione e i test del Gate 1 girano in parallelo solo se nessuno aspetta i fix; i finding passano dalla decisione dell'utente come ogni altro finding del Gate 3.
2. **La domanda sullo stack di branch passa al pre-flight e lo stack si avvia durante il Gate 1.** Alternativa scartata: lasciarla al Gate 2, oppure riordinare i gate perché la verifica manuale parta prima di `run-tests.sh`. Perché: anticipare la sola preparazione guadagna il tempo dell'avvio senza riscrivere l'ordine dei gate.
3. **La documentazione nei task si impone con un override e con un guard di forma sui Piani.** Alternativa scartata: il solo override, o il solo guard. Perché: l'override dice cosa fare, il guard impedisce che un Piano lo dimentichi; nessuno dei due giudica il contenuto.
4. **I tempi dei gate vanno in un log gitignorato nel checkout principale, scritto da `scripts/cycle-report.mjs mark`.** Alternativa scartata: estendere `scripts/cycle-times.mjs`, oppure ricavare da git solo ciò che git conosce. Perché: i tempi dei gate esistono solo nella sessione, e il worktree sparisce al Gate 4; `cycle-times.mjs` legge cicli chiusi e resta com'è.
5. **I test di site-export si escludono dalla suite di default e girano con un comando dedicato, deciso dal Gate 1 sui path.** Alternativa scartata: `projects` di vitest. Perché: meno configurazione, e la regola sui path sta in un punto solo del Gate 1.
6. **Il guard sui `**Docs:**` vale dal ciclo successivo a questo, ancorato al commit che aggiunge il Piano di questo ciclo.** Alternativa scartata: una data di soglia (il 2026-11-19, o oggi). Perché: decisione dell'utente; una data mancherebbe un ciclo aperto lo stesso giorno, l'ancora no; il Piano di questo ciclo applica la regola a mano.
