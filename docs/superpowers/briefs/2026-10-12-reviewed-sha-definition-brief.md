# Brief — Ciclo 4: `<reviewed-sha>` ha una sola definizione (F3)

**Scenario 3 (audit → fix).** Fonte: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, finding **F3**.
Da solo: nessuna causa né file in comune con gli altri tre cicli. È l'unico difetto trovato nel macchinario di review, e la direzione del fallimento è fail-safe (review sprecata, non review mancata).

## Current behavior

`<reviewed-sha>` porta **due definizioni incompatibili** in `.claude/commands/finish-cycle.md`:

- **punto finale** — Gate 2 step 0: «Note the HEAD it covers as `<reviewed-sha>`» (`:37`);
- **punto iniziale** — la frase immediatamente successiva: «If an earlier review in this session already left a `<reviewed-sha>`, keep the **earlier** of the two: a scoped range must start at the oldest point not yet reviewed» (`:37`);
- il Gate 3 lo rilegge nel **primo** senso: «if HEAD has moved past the `<reviewed-sha>` that run covered … run step 0b's scoped review of `<reviewed-sha>..HEAD`» (`:67`).

**Percorso interamente dentro il flusso documentato:** il Gate 2 lancia la review whole-branch a HEAD=A e registra `<reviewed-sha>`=A; l'utente risponde «no» allo step 6, che conserva i finding e ferma il ciclo (`:62`); una correzione atterra come commit B; `/finish-cycle` viene rilanciato nella stessa sessione. Il secondo step 0 del Gate 2 prende il ramo 0b (`:36`) e lancia la review scoped di A..B — corretto. `<reviewed-sha>` resta A per la regola «keep the earlier». Il paragrafo di raccolta del Gate 3 (`:67`) trova HEAD(B) oltre `<reviewed-sha>`(A) e lancia **la stessa** review A..HEAD una seconda volta. La condizione a `:67` è di fatto `HEAD != <reviewed-sha>`, vera per costruzione su questo percorso; l'intento dichiarato («because a commit landed during Gate 2») è più stretto di ciò che la condizione verifica.

**Conseguenza:** review sprecata, non review mancata — il range duplicato è sempre un sottoinsieme di qualcosa già coperto, quindi nulla arriva al Gate 4 non revisionato. Ma è esattamente la doppia review che §6 punto 4 e il punto 0b esistono per impedire: il processo viola la propria regola di economia, in silenzio, a ogni ri-run.

**Causa radice:** il ciclo 1 ha tenuto deliberatamente minima la modifica sulla review parallela — tre frasi innestate su un gate scritto come checklist sincrona (`PROCESS.md:141`, «Niente macchina a stati»), scelta giusta dopo il primo tentativo da 4 round e 33 finding. Ma l'unica variabile introdotta dall'innesto ha ricevuto un secondo significato dalla singola frase che gestisce i ri-run, e i suoi due lettori stanno in gate diversi.

## Expected behavior

`<reviewed-sha>` ha **una sola** definizione, e i suoi due lettori la condividono. La decisione da prendere in `/brainstorming` è quale, con il vincolo che la forma tenuta resti **poche frasi** e non reintroduca variabili di stato:

- (a) tenere il senso «punto finale» (l'HEAD coperto dalla run più recente) e riformulare la regola dei ri-run in modo che non lo sovrascriva — se serve un punto iniziale per lo scoping, va nominato diversamente o derivato al momento;
- (b) tenere il senso «punto iniziale» e correggere la condizione del Gate 3 a `:67` perché non rilanci un range già coperto.

In entrambi i casi il comportamento richiesto è lo stesso: sul percorso descritto sopra, **la review scoped A..B gira una volta sola**, e nessun commit raggiunge il Gate 4 non revisionato.

## Constraints

- **Niente macchina a stati** (`PROCESS.md` §6 punto 4b, lezione registrata): la correzione vive in poche frasi dentro i gate esistenti, non in una riscrittura dei rami del Gate 3 intorno a variabili di stato. Un ampliamento del meccanismo passerebbe da una spec propria.
- Non si tocca il punto 0b nel merito, né lo skip check dello step 0, né la regola dei 3 round.
- Il comportamento fail-safe non va invertito: se la nuova formulazione lascia un dubbio, il risultato accettabile è «revisiona di nuovo», mai «considera revisionato».
- La «dead run clause» (`:67`, «A run that cannot be read is never a clean review») resta invariata.
- Solo prosa in `.claude/commands/finish-cycle.md`; `PROCESS.md` si aggiorna solo se il senso tenuto contraddice ciò che §6 4b oggi afferma (condizione §7.3).

## Acceptance criteria

- [ ] `<reviewed-sha>` è definito una volta sola, e `:37` e `:67` lo usano nello stesso senso.
- [ ] Tracciato a mano sul percorso del finding (review a A → «no» → commit B → ri-run), la review scoped A..B risulta lanciata **una** volta.
- [ ] Nessun percorso lascia un commit non revisionato prima del Gate 4 — verificato enumerando le tre vie d'ingresso del Gate 3, che l'audit ha trovato mutuamente esclusive ed esaustive.
- [ ] Nessuna variabile di stato nuova introdotta nel comando.
- [ ] `npm test` verde.

## Explicitly excluded scope

- Nessuna riscrittura del Gate 3, del Gate 2 o della meccanica della review in background.
- Non si tocca la tensione nota sul paragrafo di classificazione del Gate 2 (vicina a questo finding ma distinta, e presa come data dallo scope dell'audit).
- Niente modifiche ai campi durata né al report.
- Nessun lavoro sui guard (Cicli 1 e 3) né su `PROCESS.md` §1/§6 (Ciclo 2).

## Nuovi finding durante questo ciclo

Qualunque difetto scoperto durante `/brainstorming` o l'esecuzione va **isolato e proposto come Brief futuro**, mai incorporato in questo fix (`PROCESS.md` §2, Scenario 3). Il precedente conta: il primo tentativo del ciclo 1 su questo stesso punto è fallito proprio perché ogni round correggeva allargando lo scope.
