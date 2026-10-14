# Brief — M4: verifica proporzionata alla classe di rischio

**Brief started:** 2026-10-14 13:39 (ora di scrittura del file; l'avvio di `/feature-brief` è di pochi minuti prima e non è stato catturato)
**Classificazione (dichiarata dall'utente, 2026-10-14):** Scenario 2 (evoluzione).
Fonte: `docs/superpowers/briefs/2026-10-14-m4-handoff.md`, voce M4 del backlog di processo unificato
(memoria di progetto), che riprende F10, B3, D2 e D4 di
`docs/superpowers/audits/2026-10-10-process-cost-audit.md`.

## Current behavior

- **Effort della review: costante.** `.claude/commands/finish-cycle.md` riga 48 (Gate 2 step 0, lancio
  in background) e riga 86 (Gate 3 step 1) eseguono `/code-review` a **medium**, scope `main...HEAD`;
  riga 94: i round successivi rigirano sullo stesso scope. Nessuna condizione lega effort o scope al
  contenuto del diff (audit, F10).
- **Skip e scope ridotto dipendono solo dalle review precedenti.** Gate 3 step 0 (riga 84, skip
  completo per §6.4) e step 0b (riga 85, scoped `<reviewed-sha>..HEAD`) scattano per la storia delle
  review nella sessione, mai per il tipo di diff. Gate 2 step 0 (righe 46-47) li rispecchia.
- **Nessuna classe di rischio esiste.** `docs/superpowers/PROCESS.md` §6.1 dichiara solo modalità e
  modello: «dichiarata, non dedotta», con la regola citata, dentro il passaggio di consegne di
  `/writing-plans` (§6.1 primo punto; §6b «Dove si applica»). Il report del Gate 5
  (`finish-cycle.md` righe 162-170) non porta classe né effort.
- **Path target di `/code-review`: mai usato.** Ogni invocazione in `finish-cycle.md` è sul diff del
  branch o su un range di commit (righe 47-48, 78, 85-86, 94).
- **Contesto dei file nei dispatch.** Il repo non ha template di dispatch propri: `.claude/` contiene
  solo `commands/finish-cycle.md` e le skill di progetto; i prompt di implementer e reviewer sono
  quelli dei plugin `superpowers`. L'unica regola di repo sul contenuto di un dispatch è §6.6.2 di
  `PROCESS.md` (path delle tavole di design, per implementer e revisore).
- **Spec/Piano al Gate 2: tre euristiche.** `finish-cycle.md` righe 61-63 (step 2: file aggiunti nel
  branch; step 3: path nei messaggi di commit; step 4: walk dal merge-base sui pattern
  `docs: brief + design spec for <topic>` / `docs: implementation plan for <topic>`); step 5 combina,
  step 6 chiede comunque la verifica. Su M1 lo step 4 non ha riconosciuto
  `docs: brief and design spec for M1 …` (handoff). Sul ramo no-code gli step 2-5 sono saltati
  (riga 42). Il Brief oggi non porta alcun riferimento a Spec o Piano (es.
  `docs/superpowers/briefs/2026-10-14-m1-measurement-prose-rules-brief.md`, header).
- **Collegamento ciclo↔Spec/Piano in `scripts/cycle-times.mjs`:** per slug contenuto nel nome del
  branch (righe 10-13, 51-90).
- **Guard:** `scripts/decision-ledger-guard.test.js` pretende ledger e `**Brief started:**` nella
  Spec; confine §6b: un guard può pretendere la presenza di un'informazione, mai giudicarne la
  correttezza.

## Expected behavior

1. **B3.** Una classe di rischio, dichiarata (non dedotta) e confermata dall'utente, viaggia nel
   passaggio di consegne di `/writing-plans` insieme alla dichiarazione di §6.1, con la stessa forma
   (classe + regola che la giustifica), senza un turno a sé (§6b).
2. **D4.** L'effort di `/code-review` al Gate 2 step 0 e al Gate 3 step 1 segue la classe
   (low / medium / high); in classe High-risk lo skip della review è vietato.
3. **Path scope.** Le invocazioni di `/code-review` usano il path target secondo una regola scritta.
4. **Contesto dei file nei dispatch.** Una regola di repo impone che i prompt di dispatch di
   implementer e reviewer nominino esplicitamente i file su cui lavorare/rivedere.
5. **D2.** Gate 2 steps 2-4: prima si legge il riferimento Spec/Piano dichiarato; le tre ricerche
   `git log` restano come fallback. Step 5-6 invariati nel comportamento verso l'utente.

## Constraints

- Classe di rischio e classe di percorso (Light, M6) sono assi distinti: nessun elemento di M4 dipende
  dal percorso Light.
- Regole di `CLAUDE.md` `### Writing documentation`: regola senza motivazione, niente conteggi in
  prosa, una sola sede per regola, cancellare prima di riformulare.
- Se `CLAUDE.md` viene toccato: rimisurare con `tr -d '\r' < CLAUDE.md | wc -c` contro il tetto di
  `scripts/claude-md-guard.test.js`.
- Un eventuale guard sulla classe ne pretende la **presenza**, mai la correttezza (§6b).
- Le regole stanno in `PROCESS.md` e `finish-cycle.md`; i plugin `superpowers` non si modificano
  (stesso schema di §6.6.2).
- Nessuna regressione su §6.4 (niente review doppie), §6.4b (review in background al Gate 2) e sul
  ramo no-code.
- `npm test` verde; i guard di §4b (`doc-paths`, `claude-md`, `decision-ledger`, `architecture`)
  restano verdi.

## Acceptance criteria

1. `PROCESS.md` §6 contiene un punto che definisce le classi di rischio, il criterio di assegnazione e
   la forma della dichiarazione; §6b «Dove si applica» la include nell'unica fermata di
   `/writing-plans`.
2. `finish-cycle.md` Gate 2 step 0 e Gate 3 step 1 non fissano più `medium` incondizionato: l'effort è
   ricavato dalla classe dichiarata, con un comportamento scritto per il caso «classe non trovata».
3. `finish-cycle.md` Gate 3 step 0 (e il suo rispecchiamento al Gate 2 step 0) dichiara che in classe
   High-risk lo skip non si applica.
4. Esiste una regola scritta, in una sola sede, su quando e come `/code-review` riceve un path target.
5. Esiste una regola scritta, in una sola sede, sul contenuto «file espliciti» dei prompt di dispatch
   di implementer e reviewer.
6. Gate 2 steps 2-4 leggono prima il riferimento dichiarato e ricorrono ai tre `git log` solo come
   fallback; lo step 6 resta invariato.
7. Il Piano di M4 stesso dichiara la propria classe di rischio nel passaggio di consegne.
8. `npm test` verde alla chiusura.

## Explicitly excluded scope (confermato dall'utente)

- Percorso Light (B1, D3 — ciclo M6).
- Modifiche ai plugin `superpowers` (skill e loro template di prompt).
- La validazione dell'audit (Ciclo 2: un ciclo Standard e uno High-risk a confronto): avviene sui cicli
  successivi, non dentro M4.

## Open questions for /brainstorming

1. Quali classi, con quali nomi e con quale criterio si assegnano (migrazioni, auth, money, file
   condivisi — F10). L'audit chiama «Light» una classe di D4, ma «Light» è anche il nome del percorso
   di M6: serve un nome che non confonda i due assi.
2. Dove la classe viaggia dal Piano a `/finish-cycle` (header del Piano? riga dedicata?) e cosa fa il
   Gate se non la trova.
3. «Divieto di skip» in High-risk: copre solo lo skip completo (Gate 3 step 0) o anche lo scope ridotto
   dello step 0b?
4. Il path scope vale per tutte le classi o solo per le inferiori; e come convive con la review scoped
   per range di commit (0b).
5. La classe incide solo sull'effort del round 1 o anche su round successivi e sul cap di 3 round?
   (Non escluso dall'utente: da decidere.)
6. Un classificatore automatico che *suggerisce* la classe è in scope? (Non escluso dall'utente; §6b
   vieta solo che un guard ne giudichi la correttezza.)
7. D2: il Brief precede Spec e Piano, quindi non può contenerne il path alla scrittura. Chi dichiara il
   riferimento e dove (Brief aggiornato, header del Piano, riga nel passaggio di consegne)? Lo stesso
   riferimento può sostituire il collegamento per slug di `scripts/cycle-times.mjs`?
8. Il report del Gate 5 deve registrare classe ed effort usati, così che la validazione sui cicli
   successivi possa confrontare round e finding per classe?
9. Contesto file nei dispatch: chi compila la lista (il Piano per task, o il coordinatore al dispatch) e
   se vale anche in esecuzione nativa.
