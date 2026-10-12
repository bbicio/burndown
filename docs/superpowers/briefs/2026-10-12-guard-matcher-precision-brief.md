# Brief — Ciclo 3: precisione dei matcher vs onestà degli header (F5 + F6)

**Natura diversa dagli altri tre Brief di questa serie, e va detto subito.** F5 e F6 non sono divergenze meccaniche con un fix determinato: in entrambi i casi esistono **due rimedi legittimi e opposti** — stringere il matcher, oppure rendere onesta la limits list dell'header — e la scelta è una decisione di design, non una correzione. Questo Brief è quindi in forma **Scenario 2 (evoluzione)**: descrive il comportamento attuale misurato e porta la decisione aperta a `/brainstorming`, non un fix da eseguire.
Fonte: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, finding **F5** e **F6**.
**Perché insieme:** stessa causa radice — un match permissivo generalizzato da un caso genuino, con la limits list dell'header non aggiornata di conseguenza. Entrambi falliscono in direzione permissiva: non possono far diventare `main` rosso a torto, possono solo non accorgersi di una divergenza.

## Current behavior

**F5 — `architecture-guard`: i check «mentions» sono un match di parola nuda su tutto §5.**
Entrambi i blocchi `it(…)` (`scripts/architecture-guard.test.js:188-215`) fanno `new RegExp(`\b${name}\b`).test(s5)`, dove `s5` è **tutto** §5: 20.036 caratteri, righe 173-610 di `ARCHITECTURE.md`. Una colonna soddisfa il check se il suo *nome* compare in quel testo da qualsiasi parte — sotto qualunque tabella, in un commento, o in prosa. La limits list dell'header (`:19-31`) nomina tre cose non controllate (colonna `Auth`, prosa/Description, *tipi* di colonna). Questa è una quarta, ed è un falso negativo **dentro** l'unica cosa che l'header dichiara coperta («Presence is checked; type is not»).
Misurato, non ipotizzato: `locale` compare esattamente una volta in §5, a riga 261, nel blocco `currencies`. Un futuro `ALTER TABLE projects ADD COLUMN locale` passerebbe il guard con §5 che non lo menziona mai — la classe esatta del finding #9 dell'audit 2026-09-17 (`projects.code` mancante), uno dei sette per cui il guard è stato scritto.
**Nessuna divergenza viva oggi:** delle quattro colonne il cui nome compare in §5 fuori dal proprio `CREATE TABLE`, tutte quattro sono effettivamente documentate (`clients.group_id` a `:518`, `resources.role_id` a `:282`, `resources.profile` e `resources.profile_computed_at` a `:343-344`).

**F6 — `claude-md-guard`: accetta tutti i 65 span in grassetto di `CLAUDE.md` come target di puntatore, non i suoi 25 heading.**
`targets` è l'unione di `/^#{2,4} (.+)$/gm` e `/\*\*([^*]{3,120})\*\*/g` (`:174-177`): misurati sul file corrente, 25 heading e 65 grassetti. L'header (`:28-36`) spiega il ramo grassetto con **un** caso — «Infrastructure safety …», citato per nome da più file e che non deve diventare un check solo-heading — ma l'implementazione ammette ogni grassetto, incluso `"Snapshot before touching it."`, `"Treat it as a risky, confirm-first action."` e `"This is the ordinary branch only"`. Un puntatore che nomini uno di quelli risolve pur non nominando nessuna sezione. Insieme al prefix match `startsWith` che l'header *dichiara* (`:35-36`), il check prova parecchio meno di «la sezione nominata esiste».

## Decisione aperta da risolvere in `/brainstorming`

Per ciascuno dei due, quale delle due direzioni:

**F5** — (a) rendere il check table-scoped, che richiede il parser di §5 che il ciclo 5 ha **deliberatamente rifiutato** di scrivere (header `:11-14`: «a generator would have to rewrite §5's 104 hand-written semantic comments»); oppure (b) lasciare il match com'è e **aggiungere questo limite alla limits list**, perché quella lista è ciò che un lettore futuro usa per decidere se il guard copre il suo caso. L'audit giudica difendibile la scelta tecnica, non difendibile l'omissione dalla lista.

**F6** — (a) enumerare le eccezioni in grassetto realmente citate invece di ammettere l'intera classe; oppure (b) dichiarare il limite nell'header. Esiste una terza via intermedia (restringere il ramo grassetto ai soli grassetti che aprono un blocco, non a ogni span inline) che va valutata solo se non costa un parser.

In entrambi i casi la domanda da porre all'utente è la stessa: **questo guard deve diventare più forte, o deve solo smettere di promettere più di quanto fa?** Il costo di (a) e il valore atteso vanno messi a confronto esplicito prima di scegliere; «più rigore è meglio» non è una risposta.

## Constraints

- Un matcher più stretto **non deve introdurre falsi positivi**: nessuna variante accettabile se fa diventare rosso il repo corrente senza una divergenza vera (oggi, misurato, non ce ne sono — vedi sopra).
- Nessun parser nuovo di `ARCHITECTURE.md` §5 senza una decisione esplicita dell'utente: il rifiuto del ciclo 5 è una scelta registrata, non una dimenticanza.
- Nessuna modifica a `ARCHITECTURE.md` o `CLAUDE.md` per far passare un check: se un check nuovo trova una divergenza reale, quella diventa un finding isolato (vedi sotto).
- Il Ciclo 1 va chiuso prima: tocca gli stessi due file.

## Acceptance criteria

- [ ] Per F5 e per F6, la direzione scelta è dichiarata nella Spec con il motivo, incluso il costo scartato.
- [ ] Alla fine, per entrambi i guard, la limits list dell'header **corrisponde** a ciò che il codice fa — qualunque delle due direzioni sia stata scelta.
- [ ] `npm test` verde senza aver modificato `ARCHITECTURE.md` o `CLAUDE.md` per compiacere un check.
- [ ] Se un matcher è stato stretto, un test ne dimostra il nuovo potere su un caso che prima passava a vuoto (es. `locale` su `projects` per F5).

## Explicitly excluded scope

- Nessun generatore di §5/§6 (rifiutato dal ciclo 5 e confermato dall'audit).
- Nessun allargamento dello scope dei guard a file nuovi (il walk dei path è del Ciclo 1).
- Niente controllo dei *tipi* di colonna né della colonna `Auth` (limiti dichiarati e accettati).
- Niente ceiling per `ARCHITECTURE.md`.

## Nuovi finding durante questo ciclo

Un matcher più stretto può far emergere divergenze reali tra codice e `ARCHITECTURE.md`/`CLAUDE.md`. Ognuna va **isolata e proposta come Brief futuro**, mai corretta dentro questo ciclo (`PROCESS.md` §2, Scenario 3): questo ciclo cambia i guard, non il contenuto dei documenti.
