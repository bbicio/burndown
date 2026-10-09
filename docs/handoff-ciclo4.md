Il ciclo 3 (`test-cases.html` da `TEST_CASES.md`) è chiuso: merge `ba4ffc3`, docs
`4502bec`, report `docs/superpowers/reports/2026-10-09-worktree-test-cases-from-markdown-finish-cycle.md`.
`main` è pulito e pushato. Niente worktree aperti.

## Dove sono le cose

- Checkout principale: `C:\Users\Fabrizio.Fortini\Progetti\burndown`, branch `main` a `4502bec`.
- Memoria: la riga "Process optimization plan" di `MEMORY.md` → `project_process_optimization_plan.md`,
  bullet **Cycle 4** + il suo sotto-bullet "Input added 2026-10-08 from Tier 0.2". Leggi quel file
  prima di tutto: contiene le decisioni blindate del programma e i tre cicli già chiusi.
- Non esiste ancora `docs/prd/`.

## Cosa deve fare il ciclo (dal programma approvato il 2026-10-08)

1. **Snellire `PRD.md`** (968 righe, 18 sezioni) togliendo ciò che duplica altre fonti:
   - §12 Data Model (righe 651-725, ~75 righe) → duplica `ARCHITECTURE.md` §5 Database Schema (437 righe);
   - §14 Design System (740-755, ~16 righe) → duplica `css/tokens.css`;
   - §3 Views and Navigation (25-46, ~22 righe) → duplica la Pages table di `CLAUDE.md` + il modello `NAV_MAIN`/`NAV_GROUPS` di `js/nav.js`.
   Totale ~113 righe (il programma diceva "~110": verificato oggi, torna).
2. **Split per area** in `docs/prd/<area>.md`.
3. **Invertire la sezione PRD di `/sync-docs`**: un file della Pages table più un controllo visibile
   aggiunto/rimosso è user-visible **per definizione** → si aggiorna, non si chiede.
4. ⚠ **Nello stesso ciclo**, obbligatorio: aggiornare la "PDash detail-content reference" inlinata in
   `.claude/skills/operational-manual/SKILL.md` (righe 66-210 di 225, "as of 2026-09-16") e la
   sezione §5b di `/sync-docs` che la governa. Se PRD.md si sposta e quella resta ferma, va stale
   esattamente come PRD.md stesso prima dell'audit del 2026-09-16 (14 gap trovati).
5. **Input ereditato da Tier 0.2:** snellire anche l'albero `### Directory structure` di
   `ARCHITECTURE.md` (§7 Docker Compose, riga 933, **154 righe**). Duplica il File structure block di
   `CLAUDE.md` (che lo split 2026-10-08 ha portato da 38 KB a ~11 KB) ed è **già in violazione della
   regola di routing della §1 di `/sync-docs`**: narrativa multi-riga datata in `api/src/services/`,
   `css/style.css`, `css/pipeline.css`, `css/portfolio.css`, `js/portfolio.js`, `portfolio.html`,
   `program.html`. Va in questo ciclo, non nel 5 (il 5 genera §5/§6 e non tocca §7).
   Nota: l'albero è cresciuto di 5 righe proprio nel `/sync-docs` del ciclo 3 — due voci nuove
   (`test-cases.html`, `test-cases-parse.js`), scritte da me stasera: verifica che rispettino la regola
   invece di assumerlo.

## I numeri di sezione sono cambiati ieri — non fidarti della prosa

Il ciclo 3 ha **eliminato la §4** di `.claude/skills/sync-docs/SKILL.md` e rinumerato. Oggi:
§4 test-api.js, **§5 PRD.md**, **§5b operational-manual**, §6 PROCESS.md, §7 project memory.
Il programma in memoria parlava di "§6" e "§6b": corretto stasera, ma qualunque altro documento
che citi quei numeri è potenzialmente stale. **Leggi gli heading del file, non un numero in prosa.**

## Classificazione prevista: no-code cycle — e sarebbe la prima volta

Tutti i path previsti (`PRD.md`, `docs/prd/*.md`, `ARCHITECTURE.md`, i due `.claude/**/*.md`)
qualificano, quindi `node scripts/classify-cycle.mjs` dovrebbe dire `no-code`. Due conseguenze:

- Il **ramo no-code del Gate 2 non è mai stato percorso**: i cicli 1, 2 e il classificatore non hanno
  potuto esercitarlo, il ciclo 3 era `ordinary`. Questo sarebbe il primo. Trattalo come non verificato.
  Sul ramo no-code il Gate 2 mostra il diff e chiede di **confermare la classificazione** invece di
  chiedere la verifica in browser; non smonta nessuno stack; e il **controllo out-of-scope del Gate 4
  non scatta** (va annotato nel report).
- **Un solo file non-`.md` ribalta tutto.** In particolare: NON rigenerare
  `docs/OPERATIONAL_MANUAL.html` in questo ciclo — è `.html` sotto `docs/`, non qualifica, e il ciclo
  diventa ordinario con verifica browser obbligatoria. La rigenerazione del manuale resta
  on-request, come dice la §5b.

## Da decidere con l'utente PRIMA di iniziare

1. **Branch + worktree + `--no-ff`, oppure commit diretti su `main`?** Decisione blindata il
   2026-10-08: **nessuna regola fissa, si chiede ogni volta**. Input per questa scelta: un commit
   diretto non prende il Gate 3, e su uno spostamento di prosa il Gate 3 rende — un ciclo di split
   documentale ha prodotto 10 finding su 16 proprio sulla prosa, e il ciclo 3 ne ha prodotti 4 su 7
   della stessa specie. Tier 0 andò bene in diretta, ma erano 9 righe su 2 file.
2. **Se lo spostamento sia davvero verbatim**, o se l'utente vuole anche riscrivere. Il programma dice
   **move verbatim**: vedi la memoria `feedback_doc_split_prose_claims.md`. Riscrivere prosa compressa
   fabbrica affermazioni universali false — è il modo documentato in cui questi cicli sbagliano.
3. Quali aree per lo split (`docs/prd/<area>.md`): va derivato dalle 18 sezioni attuali, non inventato.

## Trappole note

- `PRD.md` e `ARCHITECTURE.md` sono CRLF. Non editarli con PowerShell `Get-Content`/`Set-Content`
  (aggiunge un BOM): usa gli strumenti Edit/Write o un round trip che preserva i line ending, e
  verifica con `numstat` + un check dei primi byte. Vedi `feedback_powershell_bom_html_edits.md`.
- `TEST_CASES.md` è **codice** da ieri: se il ciclo lo tocca, `npm test`, e il blocco di
  caratterizzazione pretende i conteggi **esatti** (806 casi / 35 sezioni), non una soglia —
  aggiungere un caso significa alzare quei due numeri di proposito nello stesso commit.
- `/finish-cycle` carica il testo del comando dal checkout principale, non dal worktree: una modifica
  al comando non si esercita nel ciclo che la introduce, ma nel successivo.
- Il Gate 3 non si salta su un diff di sola prosa, e le round successive vanno **scoped** ai soli
  commit di fix (§6.4 di PROCESS.md vieta la doppia review dello stesso diff).

## Aperti, adiacenti, NON in scope salvo decisione contraria

- I due follow-up del ciclo 2, entrambi no-code: la contraddizione preesistente `:27`-vs-`:49` in
  `finish-cycle.md` (il preambolo sul teardown dice "solo allo step 6", ma il ramo `rebuild` dello
  step 1 lo esegue pure), e la riduzione di prosa del paragrafo di classificazione del Gate 2
  (~1.200 parole per una regola a tre clausole, metà già in PROCESS.md 4c).
- I tre low rinviati dal ciclo 3 (parser: commenti multi-riga e badge `node:test`; `formatCell` dentro
  `data-id`) — sono nella sezione "Code review follow-ups" del report del ciclo 3.
- Ciclo 5 (`ARCHITECTURE.md` §5/§6 generati da uno script: 437 + 231 righe) e ciclo 6 (`CLAUDE.md`
  phase 3) sono indipendenti da questo: nessun file condiviso.