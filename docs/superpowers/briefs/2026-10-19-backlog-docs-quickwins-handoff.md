# Handoff — backlog, ciclo 1: correzioni di sola documentazione

Selezione fatta il 2026-10-19 dalle righe aperte di `docs/BACKLOG.md`. Questo è il **ciclo 1** dei tre proposti (1 = documentazione, 2 = solo test, 3 = una pagina HTML); i cicli 2 e 3 non fanno parte di questo handoff.

## Perimetro

Sei righe, tutte correzioni di testo senza codice di prodotto:

- **B-017** — `TEST_CASES.md` dice ancora "moved to Config → Clients" e "14 pages".
- **B-018** — `docs/prd/pipeline.md` §4.9 chiama ancora l'editor un overlay.
- **B-019** — citazioni PRD appese: `§11.3` in `docs/prd/planning.md`, `§16.9a` in `docs/prd/administration.md`.
- **B-020** — `.claude/commands/finish-cycle.md` descrive ancora il PRD come file singolo condizionale.
- **B-066** — `docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md`, Task 4 Step 4 si aspetta un `diff` vuoto.
- **B-067** — stesso Piano, ledger: una citazione della spec che non esiste più e due conteggi contro la regola "niente numeri".

**Fuori perimetro:** B-115 (commento in `css/style.css`) — `style.css` è versionato e il bump `?v=` su 19 pagine farebbe di questo un ciclo con codice.

## Prima di toccare qualcosa

Il backlog è stato verificato il 2026-10-13/14. Rieseguire il comando di ogni riga prima di correggerla e chiudere (come "già a posto") quelle che non reggono più. Per B-019 la riga non dice quale sia la sezione giusta: leggere `docs/prd/planning.md` §11 e `docs/prd/administration.md` §16 e decidere se la citazione va corretta o tolta.

## Come eseguirlo

- **Modalità: nativa** — sei modifiche indipendenti e piccole, nessun sottoagente.
- **Classe di rischio: low-risk** (§6.1b di `docs/superpowers/PROCESS.md`), review a effort low.
- **Modello:** Sonnet basta per le correzioni; Opus per `/finish-cycle`.
- **Branch e worktree:** `git worktree add .claude/worktrees/backlog-docs-quickwins -b backlog-docs-quickwins` dal checkout principale, su `main`. Copiare `.env` solo se serve uno stack (qui no).
- **Brief e Spec:** non servono; il backlog è già l'elenco con le verifiche. Se `scripts/decision-ledger-guard.test.js` richiede un ledger per un Piano datato 2026-10-12 o dopo, scrivere un Piano minimo di una pagina con la riga `**Risk class:** low-risk`.

## Cose da sapere per `/finish-cycle`

- `TEST_CASES.md` conta come **codice** per `scripts/classify-cycle.mjs` (lo carica `test-cases.html`): il ciclo sarà quasi certamente `ordinary`, non `no-code`. Lanciare `node scripts/classify-cycle.mjs` e non presumere.
- Se resta `ordinary`, il Gate 2 chiede la verifica manuale nel browser: qui il solo effetto visibile è `test-cases.html` che rilegge `TEST_CASES.md`. Aprirla e controllare che i conteggi tornino.
- Dopo una modifica a `TEST_CASES.md`, `js/lib/test-cases-parse.test.js` pinna i conteggi esatti di casi e sezioni. Correggere un testo senza aggiungere o togliere righe di tabella non li cambia; se li cambia, aggiornare i due numeri nello stesso commit, mai ridurre l'asserzione a una soglia.
- B-020 modifica un comando di `/finish-cycle`: al Gate 5, `/sync-docs` deve rispondere **sì** alla condizione 3 del gate di `PROCESS.md` ("include una modifica a qualunque gate di `/finish-cycle`") se la correzione tocca un gate, e aggiornare `PROCESS.md` di conseguenza. Una correzione di sola dicitura sul PRD non è un cambio di gate: decidere leggendo il diff.
- Al Gate 1, il pre-check delle affermazioni si applica a tutti i `*.md` toccati: rieseguire il grep di ogni frase che le correzioni asseriscono.
- Chiudere le righe con il comando che le ha verificate, nella colonna `Verified how`, e non con la frase del report. Nessun file in `api/`: niente backup, migrazioni né restart.

## Dopo

Cicli 2 (B-114, B-097) e 3 (B-016, B-070, B-106) restano nel backlog; ripartire da `docs/BACKLOG.md`.
