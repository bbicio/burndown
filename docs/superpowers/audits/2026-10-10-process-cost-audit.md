<!-- ARCHIVED SNAPSHOT — do not read as current state.
     Written 2026-10-10 (dated from its own baseline: "Tier 0 + Cicli 1-5 mergiati", with programme
     cycle 6 still open). Committed unchanged on 2026-10-12, apart from this header.
     Re-baselined 2026-10-12 in conversation; what changed since it was written:
       - F1 (two Superpowers installs) is CLOSED — .claude/settings.local.json no longer has enabledPlugins.
       - CLAUDE.md is 62 KB, not 89.5 KB (programme cycle 6 merged 639f57a, 2026-10-10).
       - Gate 5 now runs a blocking npm test (cold-review fix cycle 1, b96b0a0, 2026-10-12).
       - Every line number it cites has shifted (PROCESS.md +4 KB, finish-cycle.md +1.7 KB).
       - Its §2 duration table covered 5 cycles; 7 now have duration fields.
       - F4's "60-70% self-inflicted findings" is no longer the current rate (17% in the latest cycle).
       - F8 got worse, not better: sync-docs/SKILL.md grew from 18.4 to 20.7 KB.
     The merged backlog that supersedes its ordered proposal is recorded in the project memory. -->

Questo audit non apre il tema: lo riprende a programma quasi concluso. Il programma di ottimizzazione processi, approvato il 2026-10-08, è organizzato in un Tier 0 più sei cicli, ciascuno con un bersaglio distinto:

- Tier 0 (2 commit diretti, 2026-10-08) — strumentazione: /finish-cycle cattura il wall-clock per gate e lo scrive nel report, per sostituire i due aneddoti ricostruiti a posteriori su cui poggiavano §6 e §6.6. Più la correzione del puntatore di /sync-docs §1 (la regola era data per morta: era viva e già violata).
- Ciclo 1 (merge 3524c65) — /code-review lanciato in background all'apertura del Gate 2: il suo tempo esce dal percorso critico della verifica umana.
- Ciclo 2 (merge 689992a) — ramo no-code del Gate 2: su un diff che non contiene file caricati dall'app si conferma la classificazione invece di chiedere una verifica browser che non avrebbe risposta onesta. Motivo dichiarato: integrità del gate, non risparmio di tempo.
- Ciclo 3 (merge ba4ffc3) — test-cases.html da 2.988 a 404 righe: gli ~800 casi vivono una sola volta, in TEST_CASES.md, reso a runtime.
- Ciclo 4 (merge 02bec81) — PRD.md da 968 a 77 righe, split in nove file d'area: abilita l'audit documentale incrementale invece che tutto-o-niente.
- Ciclo 5 (3 commit diretti, 2026-10-10) — scripts/architecture-guard.test.js: le sezioni §5/§6 di ARCHITECTURE.md non sono generabili meccanicamente (misurato), quindi la deriva si previene con un test, non con un generatore. Ha trovato 9 difetti reali al primo giro.
- Ciclo 6 — l'unico aperto: phase 3 dello split di CLAUDE.md, il solo documento caricato a ogni sessione.

Fuori numerazione: scripts/classify-cycle.mjs (la regola del Gate 2 tradotta da 536 parole di prosa a 148 più un test — risposta alla domanda "tre round di review significano un problema strutturale"), e la fast lane, respinta il 2026-10-09 su tre fatti misurati.

Il filo conduttore dei sei cicli è uno: misurare prima di tagliare, e spostare le regole eseguibili dalla prosa al codice verificabile. Questo audit riparte da lì — con, per la prima volta, dati di durata reali a disposizione.




Audit del processo di sviluppo — stato post-Cicli 1-5

Scope negoziato: stato attuale come baseline (Tier 0 + Cicli 1-5 mergiati); gli elementi "protetti" sono in scope per esplicita scelta dell'utente; nessun file modificato; nessuna skill Superpowers modificata.

Metodo: letti integralmente CLAUDE.md, docs/superpowers/PROCESS.md (204 righe / 39 KB), .claude/commands/finish-cycle.md (199 righe / 33 KB), .claude/skills/sync-docs/SKILL.md, .claude/skills/feature-brief/SKILL.md; letti dalla versione installata brainstorming, requesting-code-review, executing-plans, estratti di subagent-driven-development, writing-plans; confrontate le due copie di Superpowers presenti su disco; misurati i campi durata dei 5 report che li hanno (Tier 0.1) e i rapporti spec/piano degli ultimi 6 cicli.

---

1. Flusso effettivo

                    ┌─ feature-brief: domanda di classificazione (scen. 1/2/3)   [gate umano #1]
   richiesta ──────>│
                    └─ Brief (file, committato prima di aprire il ciclo)  §6.5

   /brainstorming ──> classificazione path (spike/bounded/architectural)   [gate umano #2]
                 └──> domande 1-a-1 ─> 2-3 approcci ─> design a sezioni    [gate per sezione]
                 └──> Spec in docs/superpowers/specs/ + commit             [gate umano #3]
                 └──> spec self-review ─> revisione utente della Spec      [gate umano #4]

   /writing-plans ─> Piano in docs/superpowers/plans/ + commit             [gate umano #5]
                     (+ scelta modalità esecuzione: nativa / subagent)     [gate umano #6]

   Esecuzione ─────> worktree + npm ci + copia .env
                     nativa: executing-plans (ledger, TDD, 1 review finale)
                     subagent: implementer+reviewer per task, review finale
                     (+ §6.6 se ci sono tavole di design: Boards: per task)

   /finish-cycle ──> pre-flight 1-6 (branch, tree pulito, commit, timing)
                     Gate 1  npm test  [+ run-tests.sh se diff tocca api/]   automatico
                     Gate 2  classify-cycle.mjs ─┬─ no-code ─> conferma classificazione
                             step 0: /code-review│            (step 1-5 saltati)
                             in BACKGROUND       └─ ordinary ─> stack isolato + ricerca
                                                                spec/piano + domanda browser
                     Gate 3  raccoglie la review di fondo = round 1, max 3 round
                     Gate 4  riepilogo + merge --no-ff + push + backup-db.sh
                             + migrazioni + restart api + cleanup worktree
                     Gate 5  /sync-docs (7 sezioni, incl. memoria) + report + push
                     Gate 6  report in chat

Gate umani prima di scrivere una riga di codice: 6 (classificazione scenario, path, design per sezioni, spec approvata, piano approvato, modalità). Gate umani nel closeout: 4 (Gate 2, Gate 3 se findings, Gate 4 merge + branch delete + restart, Gate 5 push).

---

2. Dove va il tempo — misurato, non stimato

Questa sezione del report esiste perché Tier 0 ha funzionato, e i findings F2 (percorso Light) e F3 (fase pre-closeout non misurata) sono precisamente i due bersagli che il programma non ha coperto — il primo perché la fast lane, respinta, ne occupava lo spazio con un criterio diverso; il secondo perché Tier 0 è stato scopato sul solo /finish-cycle.

I campi durata introdotti da Tier 0.1 ora esistono in 5 report. Questo è il dato che cambia le priorità dell'audit:

┌──────────────────────────┬─────┬─────┬─────────┬─────┬─────────┬────────┐
│      Ciclo (report)      │ G1  │ G2  │   G3    │ G4  │   G5    │ totale │
├──────────────────────────┼─────┼─────┼─────────┼─────┼─────────┼────────┤
│ gate3-parallel           │ 2m  │ 3m  │ 46m     │ 2m  │ 6m      │ 59m    │
├──────────────────────────┼─────┼─────┼─────────┼─────┼─────────┼────────┤
│ classify-cycle           │ 2m  │ 9m  │ 17m     │ 18m │ 4m      │ 50m    │
├──────────────────────────┼─────┼─────┼─────────┼─────┼─────────┼────────┤
│ test-cases-from-markdown │ 2m  │ 3m  │ 28m     │ 7m  │ 7m      │ 47m    │
├──────────────────────────┼─────┼─────┼─────────┼─────┼─────────┼────────┤
│ prd-slim-split           │ 1m  │ 4m  │ unknown │ 1m  │ unknown │ ~194m  │
├──────────────────────────┼─────┼─────┼─────────┼─────┼─────────┼────────┤
│ no-code-gate2            │ 1m  │ 2m  │ 443m¹   │ 5m  │ 4m      │ 456m   │
└──────────────────────────┴─────┴─────┴─────────┴─────┴─────────┴────────┘

¹ dominato da un'interruzione per limite d'uso di diverse ore — non comparabile, come il report stesso dichiara.

Evidenze che ne derivano:

- Gate 1 costa 1-2 minuti. PROCESS.md §6 ("non è lì che va il tempo") è ora confermato da misura, non da congettura. Qualunque proposta di condizionare npm test è priva di beneficio.
- Gate 2 costa 2-9 minuti, dopo il Ciclo 1. La parallelizzazione ha già incassato il suo guadagno: il tempo umano di verifica non è più sul percorso critico.
- Gate 3 è il 34-78% del closeout nei tre cicli puliti. È l'unico costo rilevante rimasto dentro /finish-cycle.
- G1+G2+G4+G5 ≈ 13-33 minuti in tutto. Il margine totale estraibile da tutti gli altri gate, anche eliminandoli, è inferiore a mezz'ora per ciclo. Questa è la ragione principale per cui il resto del report non propone di toccarli.
- Il 70-80% del wall-clock di un ciclo non è misurato da nulla. I due aneddoti su cui poggiano §6 e §6.6 sono cicli interi da 3h28 e 4h30; lo strumento introdotto misura solo il closeout (~50-60m). Brief, brainstorming, spec, piano ed esecuzione non hanno alcun timestamp.

---

3. Findings

F1 — Due installazioni di Superpowers abilitate contemporaneamente, con writing-plans divergente

Tipo: indeterminatezza di configurazione · Severità: media · Evidenza

- ~/.claude/settings.json → "enabledPlugins": { "superpowers@superpowers-marketplace": true }, installPath …/superpowers/6.4.2, plugin.json version 6.4.2.
- .claude/settings.local.json (progetto) → "enabledPlugins": { "superpowers@claude-plugins-official": true }, installPath …/superpowers/5bf4e7801107, plugin.json version 6.4.1.
- installed_plugins.json: la marketplace installata 2026-10-05T20:36, la official 2026-10-05T22:31 — 3 ore dopo, scope local, projectPath = questo repo.
- diff -rq tra i due skills/: identici tranne writing-plans/SKILL.md (più un plan-document-reviewer-prompt.md presente solo in 6.4.1). La differenza non è cosmetica: 6.4.2 sostituisce la sezione "No Placeholders" con "What a Step Contains" e aggiunge al self-review il punto 5. Proportion ("un piano più lungo della spec che implementa è una trascrizione del programma, non un piano").

Causa radice: una seconda installazione aggiunta alla configurazione locale del progetto e mai rimossa. La premessa del brief ("Superpowers è alla 6.4.2") non è verificabile da dentro la sessione: la risoluzione del nome superpowers:writing-plans non è determinata da niente nel repo.

Ipotesi da non sovrastimare: ho misurato il rapporto piano/spec degli ultimi 6 cicli — 1.30× (prd-slim-split), 1.58× (test-cases), 1.72× (classify-cycle), 1.14× (no-code-gate2), 1.26× (program-dashboard), 1.30× (portfolio-cycle1). Nessuno sarebbe segnalato dalla regola Proportion di 6.4.2. Il guadagno in token dall'allineamento è quindi probabilmente piccolo; il problema reale è la determinatezza, non la dimensione dei piani.

F2 — PROCESS.md §1 scavalca il percorso leggero che la skill già possiede

Tipo: conflitto regola-repo vs skill · Severità: alta (è il maggior margine non sfruttato) · Evidenza

- PROCESS.md:11 — "Ogni intervento sul codice, a prescindere dallo scenario, attraversa la stessa sequenza" → Brief → brainstorming → Spec committata → writing-plans → Piano committato → Esecuzione → /finish-cycle.
- brainstorming/SKILL.md (installata), sezione Three Paths: bounded = "a well-scoped change to code that already exists in this repo: a new flag, a small endpoint, a one-file fix… present a short design IN CHAT… No spec file, no implementation plan document", con <HARD-GATE> che mantiene l'approvazione umana obbligatoria, "when in doubt between two paths, take the heavier one" e un cricchetto a senso unico ("hidden complexity discovered mid-task upgrades the path").

Classificazione: la catena universale di §1 è una regola personalizzata del repository, non un obbligo della skill. La skill impone l'approvazione del design, non l'esistenza di due file.

Perché questo non è la "fast lane" già respinta. La fast lane usava il criterio "≤2 file di produzione", previsto al tempo del Brief: si è dimostrato un pronostico (un bump ?v=N condiviso tocca 10-18 pagine) e scattava su 2 cicli su 36. Il criterio bounded è strutturale e verificabile al momento della classificazione — "bounded means the flow you are changing is already here to read" — e la skill definisce già l'uscita d'emergenza a metà percorso. Sono due proposte diverse con due criteri diversi; i tre fatti misurati che hanno affossato la prima non si applicano alla seconda.

Rischio residuo, concreto: senza file di piano, il controllo out-of-scope del Gate 4 (finish-cycle.md:93, "if Gate 2 identified exactly one plan file") non scatta — esattamente la perdita già documentata per il ramo no-code (:32, :149). Vedi F9.

F3 — Tutta la strumentazione misura il closeout; la fase dove sta il tempo non è misurata

Tipo: lacuna di misura · Severità: alta · Evidenza: finish-cycle.md:12 registra <started-at> e i confini dei soli Gate 1-5. Nessun artefatto registra quando è iniziato il Brief, quando la Spec è stata approvata, quanto è durata l'esecuzione. I totali misurati (47-59m nei cicli puliti) vanno confrontati con i cicli interi da 3h28 (§6) e 4h30 (§6.6).

Causa radice: Tier 0.1 è stato scoperto su /finish-cycle perché lì esiste un comando da editare. Brief/brainstorming/piano non hanno un contenitore equivalente — il timestamp naturale sarebbe l'header della Spec e del Piano, che oggi portano solo la data.

Conseguenza per questo audit: continuare a ottimizzare i gate significa lavorare sul 20% misurato. Qualunque intervento sul 80% restante va prima strumentato, altrimenti si ripete il vizio che Tier 0.1 esisteva per chiudere (ricostruire durate a posteriori).

F4 — Il costo del Gate 3 è alimentato da difetti che il ciclo stesso produce

Tipo: causa radice del costo dominante · Severità: alta · Evidenza (dai report, non da memoria):

┌──────────────────────────┬───────┬──────────┬─────────────────────────────────────────────────────────────────────────────────────────────┐
│          Ciclo           │ round │ findings │                          quota auto-inflitta dichiarata nel report                          │
├──────────────────────────┼───────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ gate3-parallel           │ 5     │ 37       │ prima versione scartata: asincronia in un comando sincrono                                  │
├──────────────────────────┼───────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ no-code-gate2            │ 3     │ 21       │ "several round-2 findings were created by round-1's own fixes"                              │
├──────────────────────────┼───────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ test-cases-from-markdown │ 3     │ 9        │ "4 were stale prose this cycle had itself created"                                          │
├──────────────────────────┼───────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ classify-cycle           │ 3     │ 7        │ "every one of the last three was a claim in a commit message that the tree did not support" │
├──────────────────────────┼───────┼──────────┼─────────────────────────────────────────────────────────────────────────────────────────────┤
│ prd-slim-split           │ 2     │ 13       │ "close eight Gate 3 findings, six of them claims this cycle created"                        │
└──────────────────────────┴───────┴──────────┴─────────────────────────────────────────────────────────────────────────────────────────────┘

Causa radice (già nominata nel repo come lezione, mai tradotta in un controllo): riscrivere/comprimere prosa fabbrica affermazioni non verificate — nel documento e nel messaggio di commit. Il Gate 3 le trova, una per una, a 3 round.

Implicazione: il risparmio più grande non è togliere un gate, è togliere la classe di difetti che lo alimenta. Un controllo meccanico pre-Gate-3 sulle affermazioni verificabili (conteggi, path, file:line, nomi di costanti, claim nei messaggi di commit) costa minuti e attacca il 60-70% dei findings di un ciclo documentale.

F5 — Contraddizione :27 ↔ :49 ancora aperta dentro il Gate 2

Tipo: contraddizione interna · Severità: bassa in pratica, alta come precedente · Evidenza: finish-cycle.md:27 — "scripts/test-branch.sh down … may run ONLY at the exact point step 6 below says so"; finish-cycle.md:49 — "If rebuild: run scripts/test-branch.sh down, then scripts/test-branch.sh up". Un agente che legge :27 alla lettera deve rifiutare :49.

Causa radice: il preambolo :27 è stato scritto dopo i due incidenti del 2026-09-15 come divieto assoluto; il ramo rebuild dello step 1 è stato aggiunto dopo, senza eccettuarlo. Il Ciclo 2 ha deliberatamente evitato di risolverlo da un bullet a valle (registrato come follow-up). Resta aperto.

F6 — Tre domande di classificazione per ciclo, su tre assi diversi

Tipo: approvazione ripetuta · Severità: bassa · Evidenza: feature-brief/SKILL.md:14-38 (scenario 1/2/3, "never inferred", tabella anti-razionalizzazione, "no exceptions"); brainstorming/SKILL.md Three Paths ("say the classification out loud … so your human partner can override it"); finish-cycle.md:29 (classify-cycle.mjs + conferma). Le prime due sono entrambe poste prima di leggere codice, consecutive, e la risposta a feature-brief determina solo se il Brief ha la sezione "Current behavior" (SKILL.md:44-52).

Nota di cautela: la regola di feature-brief è scritta come gate duro con tabella di razionalizzazioni. Indebolirla è il tipo di erosione contro cui questo repo si protegge per scelta. Proposta minima, non rimozione (vedi §6).

F7 — La regola di aggiornamento di PROCESS.md esiste in due copie, con liste divergenti

Tipo: duplicazione + deriva · Severità: bassa · Evidenza: PROCESS.md:200 → "(feature-brief, domain-audit, audit-to-brief)"; sync-docs/SKILL.md:68 → "(feature-brief, the audit skill, audit-to-brief)". Le altre due condizioni sono identiche parola per parola nei due file. Nessuna delle due liste cita operational-manual, che PROCESS.md:108 documenta come quarta skill di processo e di cui /sync-docs §5b mantiene il riferimento inlineato.

Causa radice: §5 ha guadagnato la quarta skill il 2026-09-16; la condizione 1 di §7 è stata scritta quando erano tre e non è mai stata riallineata.

F8 — Il costo di sync-docs sta nella prosa di routing, non nei suoi controlli

Tipo: costo operativo / forma, non sostanza · Severità: media (token) · Evidenza: sync-docs/SKILL.md = 18.4 KB. Le sezioni 1-2 (routing ARCHITECTURE.md/CLAUDE.md) sono le più lunghe: la riga 24 è un singolo paragrafo che elenca a prosa le destinazioni raggruppate (docs/js/shared-libs.md con dieci sorgenti, docs/js/cg-controls.md, docs/api/services.md, docs/api/users.md). Nello stesso file, la §5 esprime lo stesso tipo di mappatura come tabella (righe 42-52, 9 righe leggibili).

Per rispettare il vincolo 6 del brief: non propongo di togliere un controllo perché le istruzioni sono lunghe. Propongo che la stessa regola passi dalla prosa a una tabella, come già fatto nella §5 del medesimo file — invariante il contenuto e verificabile a diff.

F9 — Il controllo out-of-scope del Gate 4 è condizionato a passi che oggi si saltano

Tipo: controllo che non scatta · Severità: media · Evidenza: finish-cycle.md:93 condiziona il controllo a "if Gate 2 identified exactly one plan file"; :32 e :149 registrano che sul ramo no-code gli step 2-5 non girano, quindi nessun piano è identificato e il controllo non scatta — ed è già accaduto su un branch intero (prd-slim-split). 4 dei 6 cicli del programma erano no-code. Se si adotta F2, il buco si allarga ai cicli bounded.

Causa radice: la lista dei file dichiarati è letta solo dal Piano, mentre su quei due percorsi il Piano non esiste; la Spec, che quando esiste dichiara lo scope escluso, non è mai consultata da questo controllo.

F10 — L'effort della code review è una costante, la classe di rischio no

Tipo: verifica non proporzionata · Severità: media · Evidenza: finish-cycle.md:37 e :71 fissano /code-review at medium effort in tutti i casi; nessuna condizione lega l'effort al contenuto del diff (migrazioni, auth, money, file condivisi). È l'unico gate dove il repo ha regole di proporzionalità sull'esecuzione (§6.1 modalità, §6.2 test) ma non sulla verifica.

---

4. Tabella ridondanze / passaggi condizionabili / rischi

Classificazione: [S] obbligo di skill standard · [R] regola personalizzata del repo · [I] protezione nata da incidente documentato · [H] ipotesi di ottimizzazione da verificare.

┌─────┬────────────────────────────────────┬─────────┬───────────────────────────┬───────────────────────────────────────┬─────────────────────────────┐
│  #  │             Passaggio              │ Classe  │    Decisione proposta     │                Motivo                 │       Rischio residuo       │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │                           │ misurato 1-2m; nessun overlap con     │                             │
│ 1   │ npm test completo al Gate 1        │ [R]+[I] │ Mantenere                 │ /code-review (verificato: la skill    │ nessuno                     │
│     │                                    │         │                           │ non lancia la suite)                  │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Mantenere condizionale    │                                       │                             │
│ 2   │ Suite backend run-tests.sh         │ [R]     │ (già lo è: diff tocca     │ —                                     │ nessuno                     │
│     │                                    │         │ api/)                     │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 3   │ Gate 2 verifica umana browser      │ [R]+[I] │ Mantenere                 │ misurato 2-9m; è il gate dei due      │ nessuno                     │
│     │                                    │         │                           │ incidenti 2026-09-15                  │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 4   │ Gate 2 step 1 stack isolato        │ [R]     │ Mantenere; chiudere F5    │ contraddizione :27/:49                │ un agente letteralista      │
│     │                                    │         │                           │                                       │ blocca il rebuild           │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Accorpare: usare l'header │ 3 comandi + walk con gap residuo noto │ lista candidati incompleta  │
│ 5   │ Gate 2 step 2-4 archeologia git    │ [R]     │  del Brief/Spec invece di │  (:52) per produrre una lista di      │ → già oggi dichiarato non   │
│     │ spec/piano                         │         │  tre git log euristici    │ candidati che lo step 6 non usa       │ pericoloso                  │
│     │                                    │         │                           │ comunque per decidere                 │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 6   │ /code-review in background al Gate │ [R]     │ Mantenere                 │ guadagno ora visibile: Gate 2 = 2-9m  │ run morta = non revisionata │
│     │  2                                 │         │                           │                                       │  (già scritto)              │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Mantenere il gate,        │ il 60-70% dei findings dei cicli      │ un pre-check che "passa"    │
│ 7   │ Gate 3, max 3 round                │ [R]     │ aggiungere un pre-check   │ documentali è auto-inflitto           │ non garantisce assenza di   │
│     │                                    │         │ (F4)                      │                                       │ difetti reali               │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 8   │ Gate 3 effort fisso medium         │ [R]     │ Rendere condizionale alla │ risparmia sui Light, protegge gli     │ mis-classificazione del     │
│     │                                    │         │  classe di rischio (F10)  │ High-risk                             │ rischio                     │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 9   │ Gate 4 riepilogo + conferma merge  │ [R]     │ Mantenere                 │ 1-18m, è la porta sul main            │ nessuno                     │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 10  │ Gate 4 backup-db.sh                │ [R]+[I] │ Mantenere                 │ secondi, non bloccante, non chiede    │ nessuno                     │
│     │                                    │         │                           │ conferma                              │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 11  │ Gate 4 apply migrazioni            │ [R]+[I] │ Mantenere condizionale    │ incidente migrazione 020              │ nessuno                     │
│     │                                    │         │ (già lo è)                │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 12  │ Gate 4 restart pdash-api           │ [R]+[I] │ Mantenere condizionale    │ nessun hot-reload                     │ nessuno                     │
│     │                                    │         │ (già lo è)                │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Estendere alla Spec       │ oggi non scatta su no-code né su      │                             │
│ 13  │ Gate 4 controllo out-of-scope      │ [R]     │ quando il Piano non       │ bounded                               │ nessuno: aggiunge copertura │
│     │                                    │         │ esiste (F9)               │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Mantenere i gate;         │ il costo è prosa di lookup, non       │ riscrittura che perde una   │
│ 14  │ Gate 5 /sync-docs 7 sezioni        │ [R]     │ tabellarizzare §1-§2 (F8) │ controllo                             │ destinazione → verificabile │
│     │                                    │         │                           │                                       │  a diff                     │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 15  │ Gate 5 memoria di progetto         │ [R]+[I] │ Mantenere                 │ nessun diff la copre; origine         │ nessuno                     │
│     │                                    │         │                           │ documentata 2026-09-29                │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 16  │ Gate 6 riga finale fissa           │ [R]     │ Mantenere                 │ costo nullo                           │ nessuno                     │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Rendere condizionale      │ la skill offre già il percorso        │ perde Piano → F9; mitigato  │
│ 17  │ Catena Brief+Spec+Piano universale │ [R]     │ adottando il path bounded │ leggero; §1 lo scavalca               │ da #13                      │
│     │                                    │         │  della skill (F2)         │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Mantenere, consentendo    │                                       │                             │
│ 18  │ feature-brief domanda di           │ [S]     │ una sola interazione con  │ due domande consecutive su assi       │ nessuno se restano entrambe │
│     │ classificazione                    │         │ la classificazione di     │ diversi                               │  poste                      │
│     │                                    │         │ path                      │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 19  │ Spec: approvazione design +        │ [S]     │ Mantenere                 │ sono due gate della skill             │ —                           │
│     │ approvazione file                  │         │                           │ (<HARD-GATE>), non del repo           │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Mantenere condizionale    │                                       │                             │
│ 20  │ §6.6 "leggere TUTTE le tavole"     │ [R]+[I] │ (già lo è: solo cicli con │ nato dal ciclo da 4h30                │ nessuno                     │
│     │                                    │         │  tavole)                  │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 21  │ §4 guardie Docker main stack       │ [R]+[I] │ Mantenere                 │ vietano, non aggiungono passi         │ nessuno                     │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│ 22  │ Due install Superpowers            │ —       │ Risolvere (F1)            │ quale writing-plans vige non è        │ [H] guadagno token          │
│     │                                    │         │                           │ determinato                           │ probabilmente piccolo       │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │                                    │         │ Accorpare: PROCESS.md §7  │ già divergenti, e manca               │                             │
│ 23  │ Regola PROCESS.md in due file      │ [R]     │ rinvia a sync-docs §6, o  │ operational-manual (F7)               │ nessuno                     │
│     │                                    │         │ viceversa                 │                                       │                             │
├─────┼────────────────────────────────────┼─────────┼───────────────────────────┼───────────────────────────────────────┼─────────────────────────────┤
│     │ executing-plans termina su         │ [S] vs  │ Mantenere l'override,     │ il nodo terminale della skill punta a │ va risolto a ogni           │
│ 24  │ finishing-a-development-branch     │ [R]     │ documentarlo come         │  una skill vietata da CLAUDE.md       │ esecuzione                  │
│     │                                    │         │ conflitto permanente      │                                       │                             │
└─────┴────────────────────────────────────┴─────────┴───────────────────────────┴───────────────────────────────────────┴─────────────────────────────┘

---

5. I tre percorsi, con criteri di selezione

Il criterio è strutturale e verificabile alla classificazione, mai un pronostico sul numero di file (è esattamente lì che la fast lane è caduta).

Light — path bounded della skill

Criteri (tutti veri): il flusso che si modifica esiste già nel repo e si può leggere; una sola pagina o un solo modulo; nessuna migrazione; nessuna nuova route API né cambio di requireAuth/requireAdmin; nessun file condiviso con fan-out ?v=N; nessuna tavola di design; nessuna regola di money/currency o di permessi.
Cosa cambia: Brief in chat (non file), design breve in chat approvato dall'utente, nessuna Spec e nessun Piano su file, esecuzione nativa, /finish-cycle invariato con Gate 3 a effort low.
Cricchetto obbligatorio: qualunque complessità emersa a metà → stop, dichiarazione, risalita a Standard. Mai il contrario (regola della skill, non del repo).

Standard — processo attuale

Criteri: tutto ciò che non è chiaramente Light né High-risk. È il default, e resta il default anche in caso di dubbio.
Cosa cambia: nulla, salvo gli interventi #5, #7, #13 proposti sopra.

High-risk — Standard + supplementi

Criteri (uno basta): migrazione DB; auth/permessi/ruoli; money/currency; file condiviso su ≥3 pagine; infra (Docker, nginx, script di stack); i file di processo stessi (finish-cycle.md, sync-docs, classify-cycle.mjs, PROCESS.md).
Cosa cambia: Gate 3 a effort high, skip del Gate 3 vietato in ogni caso; pg_dump prima di qualunque operazione sul main stack (già §4, qui reso obbligo di classe); migrazione provata su stack isolato prima del merge; Spec obbligatoria anche se il diff è piccolo.

---

6. Modifiche suggerite, file per file

Nessuna tocca le skill standard di Superpowers. Nessuna applicata.

.claude/settings.local.json

┌─────┬───────────────────────────────────────────────────────────┬────────────────────────────────┬────────────────────────────────────────────────────┐
│  #  │                         Modifica                          │           Beneficio            │                      Rischio                       │
├─────┼───────────────────────────────────────────────────────────┼────────────────────────────────┼────────────────────────────────────────────────────┤
│     │ Rimuovere "enabledPlugins":                               │ determinatezza: le regole di   │ basso. Verificare dopo la rimozione che            │
│ A1  │ {"superpowers@claude-plugins-official": true}, lasciando  │ writing-plans diventano quelle │ superpowers:* risolvano ancora (il file è          │
│     │ attiva la sola 6.4.2 di user scope                        │  dichiarate nel brief          │ gitignored, quindi la modifica non entra in nessun │
│     │                                                           │                                │  diff: da annotare nel report del ciclo)           │
└─────┴───────────────────────────────────────────────────────────┴────────────────────────────────┴────────────────────────────────────────────────────┘

docs/superpowers/PROCESS.md

┌─────┬─────────────────────────────────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────────────────────┐
│  #  │                          Modifica                           │            Beneficio             │                     Rischio                     │
├─────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│     │ §1: la catena a 7 fasi diventa il percorso Standard;        │ atteso: −2 commit, −2 documenti, │ medio. Un ciclo mis-classificato Light perde    │
│ B1  │ aggiungere §1b con i tre percorsi e i criteri di §5 di      │  −2 gate sui cicli qualificanti. │ Spec e Piano. Mitigazioni: criteri strutturali, │
│     │ questo report, dichiarando che Light = path bounded della   │  Non misurato: va validato (vedi │  default Standard in caso di dubbio, cricchetto │
│     │ skill installata, non un'invenzione del repo                │  §7)                             │  a senso unico, + modifica D3                   │
├─────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│     │ §7 condizione 1: allineare la lista a quella di sync-docs   │                                  │                                                 │
│ B2  │ §6 e aggiungere operational-manual; oppure sostituire le    │ chiude F7 e la deriva futura     │ basso                                           │
│     │ tre condizioni con un rinvio esplicito a sync-docs §6 come  │                                  │                                                 │
│     │ unica copia                                                 │                                  │                                                 │
├─────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│     │ §6 nuovo punto: classe di rischio dichiarata al passaggio   │ abilita D4 e il Gate 3           │                                                 │
│ B3  │ Piano → Esecuzione, con la stessa forma del punto 1         │ proporzionato                    │ basso                                           │
│     │ ("dichiarata, non dedotta", confermata dall'utente)         │                                  │                                                 │
├─────┼─────────────────────────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────┤
│     │ §6 nuovo punto: misurare la fase pre-closeout — timestamp   │ chiude F3: senza questo ogni     │                                                 │
│ B4  │ di inizio Brief, Spec committata, Piano committato, inizio  │ ottimizzazione futura torna agli │ basso; costo 4 righe per ciclo                  │
│     │ e fine esecuzione, scritti nell'header della Spec e del     │  aneddoti                        │                                                 │
│     │ Piano                                                       │                                  │                                                 │
└─────┴─────────────────────────────────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────────────────────┘

.claude/commands/finish-cycle.md

┌─────┬────────────────────────────────────────────────────────────────────────┬────────────────────────────┬────────────────────────────────────────────┐
│  #  │                                Modifica                                │         Beneficio          │                  Rischio                   │
├─────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────┼────────────────────────────────────────────┤
│     │ :27 → eccettuare esplicitamente il ramo rebuild dello step 1 (una sola │                            │ basso, ma tocca un preambolo nato da       │
│ D1  │  clausola, come il follow-up del Ciclo 2 già indicava)                 │ chiude F5                  │ incidente: va fatto come clausola di :27,  │
│     │                                                                        │                            │ non da un bullet a valle                   │
├─────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────┼────────────────────────────────────────────┤
│     │ Gate 2 step 2-4: sostituire i tre git log euristici con la lettura del │ −3 comandi e −1 walk con   │                                            │
│ D2  │  riferimento Spec/Piano dichiarato nel Brief, mantenendo i git log     │ gap noto per ciclo; lo     │ basso: lo step 6 è invariato, il peggior   │
│     │ come fallback                                                          │ step 6 chiede comunque     │ caso resta "lista candidati incompleta"    │
│     │                                                                        │ conferma                   │                                            │
├─────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────┼────────────────────────────────────────────┤
│     │ Gate 4 controllo out-of-scope: se nessun Piano è identificato, usare   │ chiude F9 e copre il       │                                            │
│ D3  │ la Spec (sezione scope escluso); se non esiste nessuna delle due,      │ rischio di B1              │ basso: aggiunge copertura, non la toglie   │
│     │ dichiararlo nel report invece di non scattare in silenzio              │                            │                                            │
├─────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────┼────────────────────────────────────────────┤
│     │ Gate 3 (:37, :71): effort low / medium / high secondo la classe di     │ risparmia sui Light,       │ basso-medio: dipende dalla correttezza     │
│ D4  │ rischio dichiarata (B3), con divieto di skip in classe High-risk       │ aumenta la protezione      │ della classe; il divieto di skip è un      │
│     │                                                                        │ sugli High-risk            │ irrigidimento, non un allentamento         │
├─────┼────────────────────────────────────────────────────────────────────────┼────────────────────────────┼────────────────────────────────────────────┤
│     │ Gate 3 nuovo step 0c — pre-check delle affermazioni, prima di mostrare │ attacca la causa misurata  │ basso. Non sostituisce la review: la       │
│ D5  │  i findings: per ogni claim numerica, path, file:line, nome di         │ del 60-70% dei findings    │ precede. Da scrivere come passo breve, non │
│     │ costante o affermazione nei messaggi di commit introdotti dal branch,  │ dei cicli documentali (F4) │  come macchina a stati (lezione del primo  │
│     │ eseguire il comando che la verifica; correggere prima del round 1      │                            │ tentativo del Ciclo 1)                     │
└─────┴────────────────────────────────────────────────────────────────────────┴────────────────────────────┴────────────────────────────────────────────┘

.claude/skills/sync-docs/SKILL.md

┌─────┬───────────────────────────────────────────────────────────────────────────────┬───────────────────────────┬─────────────────────────────────────┐
│  #  │                                   Modifica                                    │         Beneficio         │               Rischio               │
├─────┼───────────────────────────────────────────────────────────────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│     │ §1-§2: convertire la prosa di routing (in particolare la riga 24) in una      │ riduzione token a ogni    │ basso, a condizione di dimostrare a │
│ E1  │ tabella pattern-sorgente → file di destinazione, sullo stesso modello della   │ Gate 5, invariati i       │  diff che nessuna destinazione si   │
│     │ tabella già presente in §5                                                    │ controlli                 │ perde                               │
├─────┼───────────────────────────────────────────────────────────────────────────────┼───────────────────────────┼─────────────────────────────────────┤
│ E2  │ §6: diventare l'unica copia delle tre condizioni, con PROCESS.md §7 che       │ chiude F7                 │ basso                               │
│     │ rinvia qui (o l'inverso)                                                      │                           │                                     │
└─────┴───────────────────────────────────────────────────────────────────────────────┴───────────────────────────┴─────────────────────────────────────┘

.claude/skills/feature-brief/SKILL.md

┌─────┬─────────────────────────────────────────────────────────────────────────┬────────────────┬───────────────────────────────────────────────────────┐
│  #  │                                Modifica                                 │   Beneficio    │                        Rischio                        │
├─────┼─────────────────────────────────────────────────────────────────────────┼────────────────┼───────────────────────────────────────────────────────┤
│     │ Step 1: consentire di porre la domanda di scenario nello stesso turno   │ −1 round-trip  │ basso. Da non trasformare in inferenza: la regola     │
│ C1  │ della classificazione di path di brainstorming, restando due domande    │ per ciclo      │ "never inferred" resta. Se c'è dubbio, non farlo: il  │
│     │ distinte con risposta esplicita                                         │                │ beneficio è un round-trip                             │
└─────┴─────────────────────────────────────────────────────────────────────────┴────────────────┴───────────────────────────────────────────────────────┘

CLAUDE.md

Nessuna modifica proposta da questo audit. Il Ciclo 6 già in programma (phase 3 dello split) attacca l'unico costo rilevante di questo file — 89.5 KB caricati ogni sessione, il maggiore singolo costo fisso in token dell'intero processo. Non duplicarlo qui.

---

7. Piano di validazione su un ciclo reale

Pre-requisito (ciclo 0, nessuna modifica di processo): applicare A1, B2/E2, D1 — le tre a rischio più basso e senza effetto sul flusso. Verificare che npm test resti verde e che superpowers:* risolvano.

Ciclo 1 — strumentazione prima di tutto: applicare B4 e D5. Chiudere un ciclo Standard ordinario. Dati da raccogliere: le 5 durate pre-closeout nuove; numero di findings del Gate 3 e quanti sarebbero stati intercettati da 0c; durata del pre-check stesso.
Criterio di successo: il pre-check costa < 10 minuti e intercetta ≥ 1/3 dei findings che il round 1 avrebbe prodotto. Se no: D5 va rimosso, non raffinato.

Ciclo 2 — proporzionalità della verifica: applicare B3 e D4 su un ciclo classificato Standard, poi su uno High-risk. Confrontare durata Gate 3 e findings per classe.
Criterio di successo: la classe High-risk produce findings che l'effort medium non produceva; la classe Light/Standard non perde findings rispetto ai 5 cicli già misurati.

Ciclo 3 — il percorso Light, su un solo ciclo e dichiarato tale: applicare B1 + D2 + D3 su un candidato Light reale (una modifica a una pagina esistente, nessuna migrazione, nessun file condiviso). Deroga §3 annotata nel report, non ereditata.
Criteri di successo, tutti e tre: (a) il controllo out-of-scope scatta via Spec o dichiara di non poter scattare; (b) il Gate 3 non trova nulla che Spec+Piano avrebbero prevenuto; (c) il cricchetto non è servito — se è servito, il criterio di classificazione è sbagliato e va corretto prima di un secondo ciclo Light.
Soglia di abbandono: due cicli Light su tre che risalgono a Standard a metà ⇒ B1 va ritirato, come la fast lane.

Ciclo 4 — forma, non sostanza: applicare E1 e C1. Verificare a diff che la tabella copra tutte le destinazioni della prosa precedente.

Cosa non va messo nello stesso ciclo: B1 e D5 (confonderebbero le due misure); B1 e D4 (la classe di rischio e la classe di percorso sono due assi, vanno validati separatamente).

---

8. Ruled out — esaminato, nessuna modifica proposta

- npm test completo al Gate 1 — misurato 1-2m su 5 cicli. Verificato che /code-review non lancia la suite: non c'è sovrapposizione da sfruttare.
- Verifica umana del Gate 2 — misurata 2-9m dopo la parallelizzazione. In scope per scelta dell'utente, esaminata, nessuna proposta: è cheap e protetta.
- backup-db.sh, apply migrazioni, restart pdash-api — tutti e tre già condizionali o di costo in secondi, tutti e tre con un incidente documentato alle spalle (finish-cycle.md:97, :116, :124).
- §4 guardie Docker — sono divieti: non aggiungono passi al percorso normale, quindi non hanno costo da ridurre.
- §6.6 "leggere TUTTE le tavole" — già condizionale ai soli cicli con tavole di design; il costo (24 letture immagine) è la contropartita di un ciclo da 4h30 fallito al Gate 2.
- Report del Gate 5 e riga finale del Gate 6 — 4-7m misurati, inclusivi di /sync-docs.
- Fast lane — respinta 2026-10-09 con tre fatti misurati. Non riproposta: F2 è una proposta diversa, con un criterio diverso, e il report lo dice esplicitamente perché non venga confusa con essa.
- Dimensione dei piani — misurata: 1.14-1.72× la spec. Nessun piano è una "trascrizione" secondo la soglia di 6.4.2. L'ipotesi "i piani sono troppo lunghi" è smentita dai dati.

9. Fuori scope / note di roadmap

- Ciclo 6 (CLAUDE.md phase 3) — già scopato e concordato. CLAUDE.md è 89.5 KB caricati a ogni sessione: è il maggiore costo fisso in token del processo, e nessuna delle modifiche di questo audit lo tocca.
- ARCHITECTURE.md 75.5 KB e TEST_CASES.md 201.7 KB — non caricati per sessione (il primo per scelta registrata nel Ciclo 5, il secondo perché è ora codice servito a runtime). Non sono costo di sessione; non toccarli per ragioni di token.
- Conflitto permanente skill ↔ repo: il nodo terminale di executing-plans e di subagent-driven-development è superpowers:finishing-a-development-branch, che CLAUDE.md vieta. Risolto correttamente dalla precedenza di CLAUDE.md, ma va ri-risolto a ogni esecuzione. Nessuna modifica possibile senza toccare le skill standard — che il brief vieta.
- js/api-sync.js: le forme degli oggetti client-side non sono più documentate da nessuna parte — follow-up aperto dal Ciclo 4, non un rilievo di questo audit.

---

10. Proposta ordinata, da approvare

┌────────┬───────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────┐
│ Ordine │                           Modifiche                           │                          Perché in questa posizione                           │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 1      │ A1 (una sola install Superpowers)                             │ prerequisito di determinatezza; nessun effetto sul flusso                     │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 2      │ B2 + E2 (una sola copia della regola PROCESS.md, con          │ rischio minimo, chiude una deriva già in atto                                 │
│        │ operational-manual)                                           │                                                                               │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 3      │ D1 (clausola :27/:49)                                         │ contraddizione aperta dentro il gate più protetto                             │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 4      │ B4 (strumentare la fase pre-closeout)                         │ senza questo le modifiche 6-8 non sono valutabili                             │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 5      │ D5 (pre-check delle affermazioni)                             │ attacca la causa misurata del costo dominante                                 │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 6      │ B3 + D4 (classe di rischio → effort del Gate 3)               │ primo intervento che cambia la verifica: dopo che si misura                   │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 7      │ D3 (out-of-scope via Spec)                                    │ va prima di B1: è la sua mitigazione                                          │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 8      │ B1 + D2 (percorso Light)                                      │ la modifica a maggior beneficio e maggior rischio: ultima, su un solo ciclo,  │
│        │                                                               │ deroga annotata                                                               │
├────────┼───────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────┤
│ 9      │ E1 + C1 (tabella di routing, domande accorpate)               │ forma, non sostanza: quando il resto è stabile                                │
└────────┴───────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────┘

Da non approvare in blocco. 1-4 sono indipendenti e si possono applicare insieme. 5, 6, 7+8 e 9 vanno un ciclo per volta, con i criteri di successo e la soglia di abbandono di §7 fissati prima di iniziare.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.

✻ Churned for 9m 22s · done 1:35 PM

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯