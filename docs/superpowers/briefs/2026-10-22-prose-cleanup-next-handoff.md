# Handoff — dopo docs-prose-cleanup: tre punti aperti

Il ciclo `docs-prose-cleanup` è chiuso e mergiato: merge `99ffcf2`, report in `docs/superpowers/reports/2026-10-21-docs-prose-cleanup-finish-cycle.md`. In quel ciclo l'utente ha confrontato il processo con GitHub Spec Kit e ha deciso di non adottarlo, ma di prenderne due idee:
- **prosa di sole regole**, ottenuta pulendo i file dove sono, non con un terzo file di regole;
- **un controllo di coerenza prima dello sviluppo**.

`CLAUDE.md` e `PROCESS.md` sono già stati puliti. Restano tre punti. L'ordine consigliato è 1 → 2. Il punto 3 è piccolo e può entrare nel ciclo 1 o nel ciclo 2.

## 1. Pulizia della prosa di `.claude/commands/finish-cycle.md`

Si toglie la prosa che non comanda niente: date, origini, incidenti raccontati, motivazioni, conteggi. Tutte le regole restano.

**Metodo, lo stesso del ciclo precedente:**
1. Claude produce l'elenco del testo esatto da togliere o sostituire, a blocchi `ELIMINA` / `DA` → `A`, con i commenti marcati `#`.
2. L'utente cancella a mano.
3. Claude verifica: punteggiatura nei punti di taglio, test dei guard, ed estrazione dei frammenti cancellati che contengono parole normative (`must`, `never`, `only`, `do not`…) per controllare che nessuna regola sia uscita.

**Perché va fatto con più cura di `PROCESS.md`:** qui quasi ogni frase è un'istruzione che l'agente esegue alla lettera, durante merge, push, backup e restart. Un taglio sbagliato cambia un comportamento, non solo un testo.

**Le tre lezioni del ciclo precedente**, dalle Roadmap notes del suo report:
- **Prima di cancellare una motivazione, cercare nel repo vivo i rimandi che la promettono.** "§6.4c says why", "§6.4d says why" e "rest on two … anecdotes" sono rimasti orfani in un file che il branch non toccava, e hanno prodotto i round 2 e 3 della review.
- **Non trasformare una frase con un limite in una frase universale più corta.** "Every page", "all `js/*.js`" ed "every authenticated page" erano false, e sono stati la maggior parte dei difetti del Gate 1.
- **Una correzione può crearne un altro.** "§6.4c is the rule", la correzione del round 2, contraddiceva la riga in cui stava.

**Vincoli specifici di questo file:**
- **Non rinumerare passi né gate.** Altri file citano "Gate N step M": la lista di chi li cita è `grep -rlE "Gate [1-6] step [0-9]" --include=*.md .`, esclusi `docs/superpowers/{specs,plans,reports,audits,briefs}`. Il passo `2b` del Gate 5 si chiama così proprio per non rinumerare lo step 3.
- **Una regola sta in un file solo.** Dove `finish-cycle.md` ripete una motivazione che sta già in `PROCESS.md` (o il contrario), si tiene il rimando e si toglie la copia. Non vale per le istruzioni operative, che devono restare nel comando, perché è lì che vengono eseguite.
- **Da non toccare**:
  - la deroga sul `docker compose restart api` (Gate 4 step 7) con i suoi limiti ("never `down`, never `-v`");
  - il caveat sullo snapshot non bloccante;
  - le due frasi che autorizzano il teardown nel preambolo del Gate 2.
- **Righe aperte in `docs/BACKLOG.md` sullo stesso file.** Leggerle prima di iniziare e decidere se entrano nel ciclo, rieseguendo il loro `Verified how` per non chiuderle sulla parola:
  - **B-022**: il paragrafo di classificazione del Gate 2 si può dimezzare;
  - **B-062**: il Gate 5 step 2b dice due volte la stessa cosa;
  - **B-063**: "bare backticked path" sottostima ciò che il guard controlla.

**Trappola, già nota (`docs/handoff-findings-fix.md`):** `/finish-cycle` carica il proprio testo dal checkout principale, non dal worktree. Facendo il ciclo in un worktree (`PROCESS.md` §6.1b), a chiuderlo è la versione di `main`, non quella appena tagliata: è il modo più sicuro. La versione nuova si eserciterà al ciclo successivo.

**Classificazione attesa.** Se il diff tocca solo `.md` sotto `.claude/`, il classificatore dovrebbe dire `no-code` (`PROCESS.md` §6.4c): niente domanda sul browser, ma il Gate 3 non si salta. Se il ciclo include il punto 3, che tocca uno `scripts/*.test.js`, diventa `ordinary`, ed è il caso simmetrico del §6.4c (deroga §3). In tutti e due i casi lo decide `node scripts/classify-cycle.mjs`, non questa previsione. Classe di rischio: `standard`, perché il ciclo tocca file di processo.

## 2. Controllo di coerenza prima dello sviluppo

L'idea viene da `/speckit.analyze`: tra il Piano e l'Esecuzione, verificare che Spec e Piano si tengano.
- Ogni requisito e ogni criterio di accettazione della Spec ha almeno un task.
- Nessun task sta fuori dalla Spec.
- I file citati da Spec e Piano esistono, o sono dichiarati come nuovi.
- Il Piano non contraddice le regole di `CLAUDE.md`.

**È uno step nuovo, non uno spostamento del §6.4d.** Il §6.4d controlla le affermazioni nei `*.md` che il branch ha scritto, che prima dello sviluppo non esistono ancora. È anche un esperimento con una regola di uscita propria ("dopo tre cicli si guardano e si decide"), quindi resta dov'è. I cicli che lo hanno misurato sono i report con la riga `**Claims pre-check:**`: `grep -l "Claims pre-check" docs/superpowers/reports/*.md`.

**Il percorso è quello di uno Scenario 2 (evoluzione):** `/feature-brief` → `/brainstorming` → Spec → Piano. Domande che il brainstorming deve chiudere, e che questo handoff non decide:
- **Dove vive.** Nel passaggio di consegne di `/writing-plans`, che §6b vuole già come unica fermata; come skill a sé; o come guard meccanico sul solo sottoinsieme verificabile (per esempio "i path citati esistono", che `doc-paths-guard` copre già in parte).
- **Meccanico o di giudizio.** "Ogni requisito ha un task" è un giudizio. §6b vieta ai guard di giudicare il contenuto ("Il confine dei guard"), quindi la parte di giudizio non può diventare un test.
- **Nessuna fermata nuova.** Per §6b una fermata nuova si classifica tra A/B/C/D, non si inventa. Se il controllo trova qualcosa, il risultato va nel passaggio di consegne del Piano, non in una domanda in più.
- **Come si misura se serve.** Stesso spirito del §6.4d: un esperimento con una riga nel report e una decisione dopo alcuni cicli, senza formula.

**Rapporto con il backlog di processo.** Nella memoria di progetto il programma ufficiale ha ancora **M6** (il percorso "Light") come prossimo punto. Questi due cicli sono fuori lista, per decisione dell'utente del 2026-10-21. M6 resta aperto.

## 3. `§6b(d)` in `scripts/decision-ledger-guard.test.js`

Alla riga 18 il commento d'intestazione cita "§6b(d)", ma in `PROCESS.md` §6b non c'è un'etichetta "(d)", e non c'era nemmeno prima della pulizia. Il contenuto citato ("a guard may require the artefact to CARRY the information, never judge whether it is correct") è il paragrafo **«Il confine dei guard»** di §6b. Correzione proposta: "see also §6b, «Il confine dei guard»".

Prima di correggerlo, leggere **B-027** in `docs/BACKLOG.md` ("Three findings on the ledger guard and on §6b's parenthetical"): è `open`, con `Verified how: unverified`, e potrebbe comprendere questo stesso punto. In quel caso la correzione chiude, del tutto o in parte, B-027, e la riga va aggiornata con il comando che lo verifica.

Da valutare insieme, non verificato come difetto: `docs/js/nav.md` riga 53 dice "the wrapper every authenticated page has". `terms.html` è autenticata ma non ha la shell. La frase sta in una sezione storica datata di quel file, quindi potrebbe essere giusto lasciarla.
