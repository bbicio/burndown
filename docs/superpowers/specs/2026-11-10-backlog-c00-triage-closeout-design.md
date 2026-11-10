# Spec — Backlog, ciclo 0: chiusura del triage, senza codice

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-backlog-c00-triage-closeout-brief.md` (Scenario 3, processo, no-code).
Design concordato in chat il 2026-11-10 (una fermata, §6b). Esecuzione su branch in worktree, chiusa da `/finish-cycle`.

## 1. Scope

Misura del 2026-11-10, eseguendo un parser delle righe `| B-NNN |` di `docs/BACKLOG.md` e incrociandole con gli ID citati dai brief `2026-11-10-backlog-c*`:

- ogni riga con `State` leggibile e `open` è nominata da almeno un brief dei cicli 0-14;
- 12 righe non hanno una cella `State` leggibile, e nessun brief le nomina: B-302…B-312, a cui manca la colonna `State` (il `Verified how` occupa il suo posto), e B-057, spezzata in due righe da un newline letterale;
- i brief nominano righe già `closed` (B-070…B-077 nel ciclo 10, B-411 nel ciclo 13) e un ID inesistente, «B-36», nel ciclo 8;
- B-009, B-024, B-127 sono coperte dal ciclo 13 e B-010 dal ciclo 2: non si verificano qui.

Questo ciclo lavora quindi due insiemi di righe:

1. le 27 righe nominate dal brief (risolte, obsolete e incerte secondo il triage);
2. le 12 righe malformate.

Le modifiche toccano solo `docs/BACKLOG.md` e `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`.

## 2. Metodo per riga

Per ogni riga: si legge la cella `What`/`Where`, si esegue sul codice un comando (grep, test o lettura del file, cercando per pattern e non per numero di riga) e se ne scrive l'esito in `Verified how` con la data `2026-11-10`. Il verdetto è uno solo fra:

- **`closed 2026-11-10`** — il difetto non c'è più, o il comportamento è voluto da una spec che si cita; `Verified how` porta il comando e il suo esito;
- **`open`, ridiretta** — il difetto c'è; `Verified how` porta il comando e il suo esito, e l'assegnazione al ciclo va nell'indice (§4);
- **`open`, `unverified — <cosa serve>`** — nessun comando può decidere.

Mai una chiusura sulla sola frase del triage o di un report.

## 3. Riparazioni di formato

- B-302…B-312: si inserisce la cella `State` fra `Where` e `Verified how`.
- B-057: la riga si ricuce su una sola riga, sostituendo il newline letterale con il testo che lo descrive.

Il difetto descritto da B-057 (il comando del fence «Triage coverage») non si corregge: resta al ciclo 13.

## 4. Indice dei cicli

Nell'indice si aggiunge una sezione «Correzioni dal ciclo 0» con:

- le righe malformate ancora `open` dopo la verifica e il ciclo a cui vanno; ripartizione di partenza: B-302, B-303 → 8; B-304, B-305, B-309 → 9; B-306, B-310, B-311 → 11; B-307, B-308, B-312 → 12; B-057 → 13;
- le righe del brief del ciclo 0 rimaste `open` e il ciclo a cui vanno; B-014, B-053 (ciclo 10) e B-354 (ciclo 6) sono già nominate lì e vi restano;
- i riferimenti dei brief a righe già `closed` (B-070…B-077, B-411, più quelle chiuse da questo ciclo e nominate da altri brief);
- il refuso «B-36» del ciclo 8, da chiarire in quel ciclo.

La tabella esistente dell'indice e i brief dei cicli 1-14 non cambiano.

## Criteri di accettazione

1. **Nessuna riga indecisa** — ogni riga di `docs/BACKLOG.md` ha una cella `State` che si apre con `open` o `closed`; le righe `open` senza comando eseguito portano `unverified — …` in `Verified how`; lo prova lo script di parsing eseguito nella sessione.
2. **Comandi eseguiti** — per ogni riga chiusa o ridiretta da questo ciclo il comando in `Verified how` è stato eseguito nella sessione del ciclo e ne riporta l'esito.
3. **Copertura** — ogni riga `open` è nominata da un brief dei cicli 1-14 o dalla sezione «Correzioni dal ciclo 0» dell'indice; lo prova lo script di parsing.
4. **Guard documentale** — `npx vitest run scripts/doc-paths-guard.test.js` passa.

## Decisioni aperte

1. **Assegnazione ai cicli nell'indice, non nelle righe né nei brief.** Alternativa scartata: aggiornare la riga `Origine` dei brief 8-13. Perché: il brief limita le modifiche al backlog e alla tabella dell'indice.
2. **Si ripara il formato di B-057 e B-302…B-312, non il comando descritto da B-057.** Alternativa scartata: correggere anche il fence «Triage coverage». Perché: è una correzione, esclusa dallo scope del brief.
3. **Il refuso «B-36» resta da chiarire nel ciclo 8.** Alternativa scartata: indovinare l'ID inteso. Perché: il testo del brief non lo determina.
4. **Ripartizione delle 12 righe malformate per natura del difetto (gare → 8, a11y/focus → 9, pulizia → 11, CSS/z-index → 12, documenti → 13).** Alternativa scartata: un unico ciclo Master Data (7). Perché: il ciclo 7 copre bug di comportamento, mentre queste righe seguono le linee di taglio degli altri brief.
5. **Esecuzione nativa, senza subagent.** Alternativa scartata: subagent paralleli per gruppi di righe. Perché: un solo file, modifiche sequenziali, nessun task indipendente (§6.1).
