# Brief — `/finish-cycle` Gate 5 più leggero

**Tipo:** evoluzione (Scenario 2), confermato dall'utente il 2026-10-28.
**Brief started:** unknown
**Origine:** analisi misurata del 2026-10-26 (memoria di progetto `project_gate5_optimization_cycle.md`, sette opzioni ordinate), più la misura del ciclo `dates-c4-saves-period` del 2026-10-28. Opzioni tenute dall'utente: 1 (variante piena), 3, 4, 5, 6, 7. Scartata: 2.

## Problema

Il Gate 5 costa più di quanto il report dichiara, e il costo è soprattutto attesa e passi sequenziali, non lavoro che cambia il contenuto.
- Il report misura il Gate 5 fino alla scrittura del report, non fino al commit. Nel ciclo `dates-c4-saves-period` il report dice `Gate 5 7m`, mentre dal merge `8e9b76d` (13:52:27) al commit docs `8b588d0` (14:07:19) sono passati 15 minuti.
- Sugli ultimi 14 cicli, misurati con i tempi d'autore di git, il tratto merge → commit `docs:` va da 4 a 20 minuti, mediana circa 9.
- La voce singola più grande è l'attesa umana alla domanda del passo 5: 14,5 minuti nel ciclo acceptance-criteria.
- Il `npm test` del passo 3 ha preso 304 s nel ciclo `dates-c4-saves-period`, contro i 58-65 s misurati il 26-10.

## Comportamento attuale

Verificato sui file il 2026-10-28.

- **Orologio:** pre-flight step 6 registra i tempi fino a "when Gate 5's report is written" (`.claude/commands/finish-cycle.md` line 12). Il template del report porta `Gate durations` con il Gate 5 misurato così (line 194, commento a line 199). `scripts/cycle-times.mjs` si ferma al merge: `MOMENTS` finisce con `'merge'` (`scripts/cycle-times.mjs` line 120). Nessuno strumento misura il Gate 5 fino al commit.
- **Domanda del Gate 4:** una sola, "Proceed with merge? [yes/no]" (`.claude/commands/finish-cycle.md` line 137).
- **Sequenza del Gate 5:**
  1. `/sync-docs` (line 184);
  2. report (line 185);
  3. 2b, le righe di `docs/BACKLOG.md` (line 239);
  4. `npm test` completo e bloccante (line 243);
  5. il diff (line 245);
  6. "Commit and push these doc/report changes to main? [yes/no]" (line 246);
  7. commit e push (line 248).

  `docs/superpowers/PROCESS.md` riporta la stessa sequenza: §1 (line 28), §4b punto 2 (line 108) e §6.2 (line 164), dove la suite completa del Gate 5 step 3 è uno dei due punti bloccanti.
- **Natura del push:** `docs/superpowers/PROCESS.md` §6b classifica merge e push come cancelli di classe A, "il no è l'uscita sicura".
- **Follow-up accettati:** al Gate 3 un finding accettato entra in `code_review_followups` con il numero di round, senza altro (`.claude/commands/finish-cycle.md` line 116). La cella `Verified how` della riga di BACKLOG si scrive solo al Gate 5 step 2b, rieseguendo grep sul codice. L'intestazione di `docs/BACKLOG.md` (line 14, line 23, line 27) dice che quella cella vale quanto il comando eseguito.
- **`/sync-docs`:** il suo Process comincia con "Read the current state of each file before editing" (`.claude/skills/sync-docs/SKILL.md` line 111). Non prevede un passaggio iniziale di perimetro (`git diff --stat`) né un sì/no esplicito per sezione: ogni sezione si valuta leggendo.
- **Modifiche ai file:** nessuna regola su come applicarle. Nel ciclo `dates-c4-saves-period` la prima scrittura di `docs/BACKLOG.md` con `node -e` è fallita su un `|` dentro una cella; l'analisi del 26-10 aveva già visto fallimenti di quoting e CRLF.
- **Test che leggono la documentazione:** i file di test sotto `scripts/` sono sei:
  - `scripts/architecture-guard.test.js`
  - `scripts/claude-md-guard.test.js`
  - `scripts/doc-paths-guard.test.js`
  - `scripts/decision-ledger-guard.test.js`
  - `scripts/classify-cycle.test.js`
  - `scripts/cycle-times.test.js`

  A questi si aggiunge `js/lib/test-cases-parse.test.js`. Altri 46 file `js/lib/*.test.js` leggono file dal disco: nessuno ha ancora verificato quali leggano file che il Gate 5 modifica.

## Comportamento atteso

1. **Opzione 7, orologio fino al commit.** Il Gate 5 si misura fino al commit `docs:` del passo 6. Il report, scritto prima di quel commit, dichiara in che modo la misura copre l'intervallo che resta. Vale dai report futuri.
2. **Opzione 1, variante piena, pre-autorizzazione al Gate 4.**
   - Accanto a "Proceed with merge?" il Gate 4 fa una seconda domanda, che pre-autorizza commit e push del Gate 5.
   - Con la pre-autorizzazione, il Gate 5 committa e pusha senza chiedere solo se `npm test` è verde e il diff tocca soltanto i path attesi del Gate 5. Altrimenti si ferma e chiede come oggi.
   - Senza pre-autorizzazione, il Gate 5 resta com'è.
   - Il diff si mostra comunque.
3. **Opzione 4, `Verified how` al Gate 3.** Quando un finding è accettato come follow-up, il Gate 3 registra già il comando che ne verifica lo stato. Al passo 2b la riga di BACKLOG lo riusa, invece di ricostruirlo.
4. **Opzione 6, subset di test.** Il passo 3 lancia solo i test che leggono i file che il Gate 5 può modificare. L'insieme si ricava da una regola o da un comando, non da una lista scritta a mano. Il passo resta bloccante.
5. **Opzione 3, passaggio di perimetro.** `/sync-docs` comincia con un solo `git diff --stat` e dichiara per ogni sua sezione sì o no prima di leggerla. Le letture si raggruppano.
6. **Opzione 5, niente edit via shell.** Le modifiche ai file del Gate 5 si fanno con il tool Edit o con uno script in un file, mai con `node -e` o con il quoting della shell.

## Vincoli

- **Nessun impatto sul contenuto:** cosa `/sync-docs` scrive e in quali file non cambia, ed è lo stesso per il report e per le righe di `docs/BACKLOG.md`. Cambia solo come e quando il Gate 5 lavora.
- **Il push su `main` resta un cancello di classe A** (`docs/superpowers/PROCESS.md` §6b): la pre-autorizzazione è una risposta data dall'utente, mai dedotta, e il "no" resta l'uscita sicura.
- **Il Gate 5 non resta mai rosso**, come oggi: con un test rosso non si committa e non si pusha, pre-autorizzazione o no.
- **Una modifica a un gate di `/finish-cycle` fa scattare la condizione 3 del gate `PROCESS.md` di `/sync-docs`** (`.claude/skills/sync-docs/SKILL.md`, sezione 6): `docs/superpowers/PROCESS.md` va aggiornato nello stesso ciclo, dove descrive il Gate 5 e la suite del passo 3.
- **Classe di rischio:** è un ciclo di processo, che tocca `.claude/` e `scripts/` (`docs/superpowers/PROCESS.md` §6.1b). La classe la dichiara il Piano.

## Criteri di accettazione

1. **Orologio** — `.claude/commands/finish-cycle.md` misura il Gate 5 fino al commit `docs:`, e il template del report dichiara in che modo copre l'intervallo dopo la scrittura del report.
2. **Pre-autorizzazione** — il Gate 4 fa una seconda domanda esplicita sul commit e push del Gate 5. Con un "sì" e un diff dentro i path attesi, il Gate 5 committa senza chiedere; con un diff fuori da quei path, o con un "no", il Gate 5 chiede come oggi.
3. **Test rosso** — con la pre-autorizzazione data e un test rosso al passo 3, niente commit e niente push.
4. **Follow-up** — il Gate 3 registra il comando di verifica di ogni follow-up accettato, e il passo 2b lo riusa.
5. **Subset di test** — il passo 3 lancia un insieme di test derivato da una regola o da un comando, e un file letto da un test escluso non può essere modificato dal Gate 5 senza che quel test giri.
6. **Perimetro di `/sync-docs`** — `.claude/skills/sync-docs/SKILL.md` apre con il passaggio `git diff --stat` e il sì/no per sezione.
7. **Edit** — il testo del Gate 5 vieta `node -e` e il quoting della shell per modificare i file.
8. **PROCESS.md allineato** — §1, §4b e §6.2 descrivono il Gate 5 come il comando lo esegue.

## Scope escluso

Confermato dall'utente il 2026-10-28.
- **Il contenuto di `/sync-docs`:** quali file aggiorna e cosa ci scrive.
- **L'opzione 2:** nessuna regola su `/fast`.
- **I report già committati:** non si rimisurano e non si correggono.

Non escluso dall'utente, e non proposto dal Brief: cambiare i Gate 1-4 oltre la domanda del Gate 4 (opzione 1) e lo step del Gate 3 che accetta i follow-up (opzione 4). Se il design ne ha bisogno, lo dichiara.

## Domande aperte per `/brainstorming`

1. **Path attesi del Gate 5:** quale insieme definisce il "diff dentro i path attesi" della pre-autorizzazione? Va ricavato dalla tabella di routing di `/sync-docs` (CLAUDE.md, ARCHITECTURE.md, TEST_CASES.md, `docs/`, `.claude/skills/operational-manual/SKILL.md`, …), più il report e `docs/BACKLOG.md`. Che cosa succede se `/sync-docs` tocca un file di test, come `js/lib/test-cases-parse.test.js` in questo ciclo?
2. **Seconda domanda del Gate 4:** in quale forma? Una seconda domanda nella stessa `AskUserQuestion` del merge, oppure un'opzione combinata ("merge e pre-autorizza", "solo merge", "no")?
3. **Orologio:** il report si scrive prima del commit, quindi non può contenere l'ora del commit. Le alternative:
   - una durata `Gate 5` che arriva fino a un istante noto, più `scripts/cycle-times.mjs` esteso al commit `docs:`;
   - una riga del report completata da un secondo commit (che costa un commit in più);
   - la misura lasciata soltanto a `scripts/cycle-times.mjs`.
4. **Subset di test:** con quale regola si deriva? I sei test di `scripts/` più `js/lib/test-cases-parse.test.js` sono un punto di partenza, non una regola. Va deciso come trattare i 46 file `js/lib/*.test.js` che leggono dal disco, cioè chi stabilisce quali leggono file del Gate 5. Va anche verificato se basta e se il tempo risparmiato vale il rischio: 304 s oggi, contro i 58-65 s del 26-10.
5. **Il comando di verifica del Gate 3:** dove si conserva tra il Gate 3 e il Gate 5? Nella sola sessione, come `code_review_followups`, o scritto da qualche parte? Va poi deciso se il passo 2b lo riesegue (`docs/BACKLOG.md`, regola 3) o lo copia.
6. **Opzioni 3 e 5:** sono regole scritte (nel testo di `/sync-docs` e del Gate 5) o abitudini registrate altrove? Il Brief le mette nel testo; è la scelta da confermare.

Brief ready. Next step: /brainstorming.
