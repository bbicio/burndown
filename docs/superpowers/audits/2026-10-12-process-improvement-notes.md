<!-- ARCHIVED NOTES — not an audit, and superseded. Written 2026-10-12 (dated from its own reference to
     PROCESS.md §4b, which exists only since b96b0a0 that day), so it is NEWER than the
     2026-10-10 process-cost audit next to it. Committed unchanged apart from this header.
     Three of its proposals were measured false by that audit and must not be re-proposed:
       - deduplicating npm test for speed (Gate 1 is 1-2 min across 7 cycles);
       - plans being too long (measured 1.14-1.72x the spec);
       - backup/migrations/restart being worth optimising (seconds, each with a documented incident).
     Its surviving areas are folded into the merged backlog recorded in the project memory. -->

Interverrei in quattro punti, con priorità diversa:
1. §6.2 — Test: evitare esecuzioni duplicate e separare i controlli locali dal lavoro di Claude.
2. §1 e /finish-cycle — Gate di chiusura: rendere esplicito quali operazioni sono automatiche e quali richiedono ragionamento dell'agente.
3. §6.4 e §6.4b — Code review: contenere le analisi ripetute e il contesto passato alla review, mantenendo la copertura del diff finale.
4. §6.1 — Modello e modalità di esecuzione: usare Sonnet per le attività implementative già previste, senza moltiplicare le chiamate a Opus.
C'è poi un quinto intervento trasversale: misurare il consumo di Claude separatamente dal tempo dei gate. Senza questa distinzione rischieremmo di ottimizzare un passaggio che rallenta il ciclo, ma che incide poco sul limite del piano Pro.
1. §6.2 — Test: qui vedo la prima opportunità concreta
La sezione contiene già due indicazioni utili: durante i task si eseguono i test mirati e la suite completa viene eseguita a fine esecuzione. Ma il testo dice anche che la suite completa gira «una volta a fine esecuzione [...] e poi al Gate 1».
Questo significa che la suite completa viene eseguita almeno due volte nel percorso descritto. Inoltre, §4b prevede un ulteriore npm test al Gate 5, per proteggere i guard documentali.
Non eliminerei automaticamente quest'ultimo controllo: il Gate 5 modifica documentazione e pin, quindi ha una finalità diversa. Verificherei invece se le prime due esecuzioni sono entrambe necessarie.
Dove intervenire: §6.2, alla voce «Test».
La regola che proporrei di valutare è:
- test mirati durante l'implementazione;
- una suite completa al punto di verifica pre-merge previsto dal processo;
- nessuna seconda esecuzione identica, salvo modifica del codice dopo il test, fallimento precedente o necessità specifica del gate;
- controlli documentali al Gate 5 mantenuti, con verifica successiva alle modifiche che possono invalidare i pin.
Prima di modificare il testo, confronterei queste regole con l'implementazione reale di /finish-cycle: il documento da solo non permette di stabilire quali test siano già deduplicati nel comando.
L'esecuzione manuale serve?
Sì, ma non è necessario che tu esegua ogni test personalmente. Puoi lanciare i comandi in un terminale separato, mentre Claude continua a lavorare, purché il test sia eseguito sul checkout corretto e su un albero stabile.
Il vantaggio maggiore non è «manuale contro automatico»: è un'esecuzione verificabile invece di due o tre esecuzioni equivalenti.
2. §1 e /finish-cycle — Separare esecuzione e interpretazione
Il tuo §1 dice già che «solo test/preflight sono automatici». È una buona base, ma non esplicita ancora una distinzione utile per il consumo del piano Pro:
- un controllo automatico che produce un esito;
- un agente AI che interpreta quell'esito;
- un agente AI che ripete il controllo o ne rilegge l'intero output.
Sono tre attività diverse e solo la seconda e la terza richiedono necessariamente token AI.
Dove intervenire: subito dopo la descrizione di /finish-cycle in §1, oppure in §6.2 con un rinvio da §1.
Aggiungerei una regola operativa di questo tipo, da validare sul repository:
I controlli deterministici devono essere eseguiti dagli script o dai comandi già previsti dal progetto. Il loro risultato deve essere registrato in forma sintetica, con esito, commit verificato ed eventuali errori. Claude interviene per interpretare i fallimenti e prendere decisioni, senza ripetere controlli già validi sullo stesso stato del codice. Se il codice cambia, i risultati interessati devono essere invalidati e verificati nuovamente.

Questa regola non autorizza a saltare un gate. Serve a evitare che il modello faccia lavoro meccanico e costoso.
Un possibile miglioramento successivo
Realizzare uno script come scripts/verify-cycle.ps1 che richiami i controlli esistenti e produca un report compatto. Lo farei però in un ciclo dedicato, dopo aver verificato gli script e le dipendenze reali. Non introdurrei subito un nuovo orchestratore che duplichi la logica di /finish-cycle.
3. §4 — Docker: mantenere le protezioni, ottimizzare il riuso
La tua sezione 4 è una guardia di sicurezza fondamentale. Non la indebolirei per guadagnare tempo o token: gli incidenti descritti giustificano chiaramente la prudenza.
Le opportunità sono altrove:
- riutilizzare lo stack isolato già attivo quando appartiene al worktree corretto;
- evitare build e avvii ripetuti se non sono necessari;
- non leggere a ogni esecuzione log Docker completi se il servizio è sano;
- in caso di errore, raccogliere prima lo stato sintetico e poi soltanto i log pertinenti;
- non riutilizzare uno stack quando non è possibile dimostrare che corrisponda al codice da verificare.
Dove intervenire: aggiungerei una breve regola di efficienza alla fine di §4, senza cambiare le tre regole vincolanti esistenti.
Il punto da non confondere è questo: mantenere Docker acceso può ridurre sensibilmente il tempo dei gate, ma non riduce necessariamente il consumo di Claude Pro. Per quello serve anche limitare le chiamate AI e l'elaborazione dei log.
4. §6.4 e §6.4b — Code review: evitare la revisione duplicata
Hai già implementato due ottimizzazioni valide:
- /code-review parte in background all'apertura del Gate 2;
- il Gate 3 non ripete la revisione completa se il diff è già coperto, e usa la revisione scoped per le correzioni successive.
Non modificherei queste regole senza misurazioni. La revisione del codice è uno dei punti in cui una riduzione indiscriminata può compromettere la qualità.
Interverrei invece su due aspetti.
Primo: dimensione dell'input. Verificare che la review riceva il diff pertinente, il contesto architetturale necessario e i risultati dei test, senza rileggere inutilmente interi documenti o log.
Secondo: costo del modello. Oggi §6.1 mantiene Opus per brainstorming, spec, debugging e code review. Questo è un candidato per un esperimento misurato, non per una modifica generalizzata.
Si potrebbe confrontare Sonnet e Opus su un piccolo campione di revisioni a rischio basso o medio, verificando se individuano gli stessi difetti significativi. Per modifiche ad alto rischio manterrei Opus finché non esistano evidenze sufficienti per cambiare strategia.
Dove intervenire: §6.1, nel paragrafo «Modello», e §6.4, senza modificare le condizioni che garantiscono la copertura del diff finale.
5. §6.1 — Modalità nativa e subagent: contenere le chiamate AI
Hai già introdotto una distinzione sensata tra esecuzione nativa e subagent-driven e hai assegnato Sonnet agli implementatori.
Per il limite Pro, la domanda più importante non è soltanto quanti minuti dura un task: è quante chiamate AI vengono attivate e quanto contesto deve elaborare ciascuna.
La tua retrospettiva segnala 38 esecuzioni di test e revisioni ripetute. Il primo problema è stato affrontato in §6.2; il secondo in §6.4. Ora eviterei di aggiungere altri agenti o fasi di controllo, a meno che non riducano un costo già misurato.
Per ogni ciclo registrerei:
- numero di dispatch a subagent;
- numero di revisioni AI;
- eventuali ripetizioni di test;
- tempo totale dei gate;
- eventuali interruzioni per limite di utilizzo.
Il numero di dispatch non equivale al consumo di token, ma aiuta a identificare i cicli in cui il costo potrebbe essere sproporzionato.

6. Aggiungerei una sezione nuova: misurazione del costo AI
Questo è il miglioramento trasversale che manca nel documento. §6 misura già diversi tempi e riporta esperienze concrete, ma non misura in modo sistematico il consumo del piano Claude Pro.
Inserirei una nuova sezione, per esempio §8 — Misurazione dell'efficienza del processo, dopo §7 oppure in un documento separato di retrospettiva.
La terrei minimale:
Misura	Scopo
Durata totale del ciclo	Misurare il tempo end-to-end
Durata per gate	Individuare i colli di bottiglia
Numero di chiamate/revisioni AI	Individuare il lavoro ripetitivo
Utilizzo Claude disponibile, prima e dopo il ciclo	Stimare il costo sul piano Pro
Finding reali e difetti sfuggiti	Proteggere la qualità
Interruzioni per quota	Separare il costo ordinario dagli eventi anomali
Per il consumo Pro, non attribuirei al singolo ciclo una precisione che i dati di Usage non consentono. Le percentuali disponibili possono essere influenzate da altri task o da una finestra di utilizzo più ampia. Registrerei quindi il valore come indicatore comparativo, non come misura esatta dei token del ciclo.
Il criterio di successo dovrebbe essere: meno utilizzo AI e meno tempo, senza aumento dei difetti sfuggiti, delle regressioni o delle review che richiedono ripetizioni.