# Brief — Ciclo 2: allineare `PROCESS.md` a sé stesso (F7 + F8), come ristrutturazione a frasi preservate

**Scenario 3 (audit → fix).** Fonte: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, finding **F7** e **F8**.
**Perché insieme:** stesso file, stessa natura (il documento descrive sé stesso in modo inesatto), un solo passaggio editoriale.

**Il Ciclo 1 è chiuso** (merge `b96b0a0`, 2026-10-12, report `docs/superpowers/reports/2026-10-12-worktree-worktree-guards-enforcement-set-finish-cycle.md`): ha aggiunto a `PROCESS.md` la sezione **§4b** sui guard, e al Gate 5 di `/finish-cycle` un `npm test` bloccante. Sono i due fatti che la riga `/finish-cycle` di §1 deve ora riassumere, oltre ai tre step di F7.

**Scope allargato su decisione dell'utente (2026-10-12), rispetto alla prima stesura di questo Brief.** L'utente ha chiesto se non convenisse riscrivere `PROCESS.md` da zero «beneficiando dell'esperienza attuale». Risposta data e accettata: **no a una riscrittura, sì a una ristrutturazione a frasi preservate**. Le ragioni, misurate e da non ri-litigare in `/brainstorming`:
- Tre cicli consecutivi che hanno toccato questo file hanno chiuso rispettivamente **9, 10 e 5 finding** di review, e un commit si intitola `fix: correct the stale prose this cycle created`. Il costo di editare questo documento scala con il **volume** di modifica, e nessun test può giudicarne la prosa.
- Le **22 righe datate** del file sono il registro degli incidenti (i due teardown del 2026-09-15, il ciclo da 3h28m, i subagent in serie del Cost Grid A, la macchina a stati da 33 finding). Sono il meccanismo di applicazione delle regole: una riscrittura pulita tiene la regola e perde la cicatrice che la giustifica, e la sessione successiva discute con una regola che non porta più la propria ragione.
- Il momento è però favorevole come non lo sarà più: l'audit a freddo ha appena stabilito la ground truth di tutti e sei gli artefatti.

## Current behavior

**F7 — §1 omette tre step del Gate 4, due dei quali scritti dopo incidenti reali.**
La riga `/finish-cycle` di §1 (`PROCESS.md:26`) descrive la coda della sequenza come «… → merge `--no-ff` con riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito». Il Gate 4 esegue invece, in ordine: riepilogo pre-merge → merge → **`scripts/backup-db.sh`** (`finish-cycle.md:97`, automatico) → **applicazione delle nuove migrazioni** (`:116`) → **restart del backend** (`:124`, gate umano che può lasciare codice backend mergiato ma non vivo) → pulizia worktree → cancellazione branch. `grep -c "backup-db\|pdash-api\|migrazion"` su `PROCESS.md` dà cinque hit, **nessuna in §1 e nessuna sul Gate 4**.
Origine: gli step arrivano da `bf95d9f`, `bc561d0` e `41bab43`, nessuno dei quali tocca `PROCESS.md`; la condizione 3 di §7 li copriva già allora e non fu applicata. Il risultato è un documento asimmetrico — §1 descrive il ramo più recente (no-code cycle, 2026-10-09) in una clausola propria, mentre tre step più vecchi mancano.

**F8 — §6 usa due schemi di numerazione contemporaneamente, ed entrambi sono citati.**
Dentro `## 6.` (`:112`) le suddivisioni sono punti in grassetto `1, 2, 3, 4, 4b, 4c, 5` (`:116`, `:134`, `:153`), citati come `§6.1` (`PROCESS.md:117`) e `§6.4` (`finish-cycle.md:35`, `:36`, `:69`). Ma `## 6.6` (`:159`) è un **heading di primo livello**, fratello di `## 6.`, con i propri punti 1-5, citato come «PROCESS.md 6.6.5» (commit `eb36f2a`). `finish-cycle.md:12` cita i due schemi nella stessa frase: «PROCESS.md §6/§6.6». Quindi `§6.4` significa «punto 4 dentro §6» mentre `§6.6` significa «la sezione dopo §6», e `§6.5` sarebbe irrisolvibile. Tutte le citazioni esistenti risolvono oggi: il difetto è che lo schema non è seguibile da un lettore a freddo.

## Expected behavior

1. **F7** — la riga `/finish-cycle` di §1 nomina i tre step mancanti del Gate 4 nella loro posizione reale (backup DB automatico, applicazione migrazioni, restart backend come gate umano), **più i due fatti nuovi del Ciclo 1**: il `npm test` bloccante al Gate 5 e l'esistenza di §4b. Una clausola, non un paragrafo: §1 resta un sommario. **Si ri-deriva trascrivendo i gate reali di `finish-cycle.md`, non riassumendo a memoria** — F7 esiste perché tre step furono aggiunti al comando senza che nessuno riaprisse §1.
2. **F8** — lo schema di §6 diventa univoco **con la modifica minima**. Opzione raccomandata, da confermare in `/brainstorming`: promuovere i punti in grassetto di §6 a heading `### 6.1 … 6.5` (con `6.4b`/`6.4c`) e degradare `## 6.6` a `### 6.6` dentro §6 — così `§6.1…§6.6` sono coerenti e **tutte le citazioni oggi esistenti continuano a risolvere senza essere toccate**, incluso «6.6.5». Il Ciclo 1 ha aggiunto `## 4b.`: va riconciliata con lo schema scelto nello stesso passaggio, non lasciata come terza convenzione.
3. **La disciplina che rende questo una ristrutturazione e non una riscrittura.** Ogni paragrafo esistente riceve una destinazione sotto il nuovo schema e **viene spostato, non riformulato**: una frase o sopravvive identica, o il suo cambiamento compare in un elenco esplicito e numerato, con una riga di motivazione ciascuno. Nessuna regola «detta meglio», nessun passaggio datato compresso, nessuna lezione dell'esperienza corrente aggiunta — quell'esclusione *è* la differenza fra le due operazioni.
4. **La disciplina al punto 3 va dimostrata, non dichiarata.** Uno script usa-e-getta confronta l'insieme (multiset) delle righe non vuote prima e dopo: deve risultare identico a meno dell'elenco al punto 3. Nessun test può giudicare la prosa di `PROCESS.md`, ma **può provare che niente è stato riformulato di nascosto** — che è esattamente il modo in cui i cicli precedenti su questo file hanno prodotto 9, 10 e 5 finding. Senza questo controllo «a frasi preservate» resta un'intenzione.

## Constraints

- **Niente rinumerazione di §7 e oltre**, e nessun numero di sezione esistente cambia significato: `sync-docs` SKILL.md:55 stabilisce che i numeri di sezione sono stabili e mai rinumerati, perché altri documenti li citano.
- Nessuna citazione esterna va invalidata; se la variante scelta ne sposta qualcuna, va aggiornata nello stesso commit (`finish-cycle.md:12`, `:35`, `:36`, `:69` e `PROCESS.md:117` sono l'elenco completo misurato dall'audit).
- Solo prosa: nessun file di codice, **nessun test nuovo committato**. Lo script di verifica del punto 4 è usa-e-getta, vive nello scratchpad e non entra nel repo — altrimenti sarebbe un test di prosa, che è ciò che l'audit ha stabilito non esistere.
- Nessun contenuto nuovo di processo: si descrive ciò che i gate **già fanno**, non si cambia cosa fanno.
- **Il ciclo è `no-code`** se tocca solo `PROCESS.md` e le citazioni in `.claude/` (lo decide `node scripts/classify-cycle.mjs`, mai questa frase): il Gate 2 prenderà il suo ramo breve.

## Acceptance criteria

- [ ] §1 nomina backup DB, applicazione migrazioni e restart backend nella riga `/finish-cycle`, nell'ordine reale del Gate 4.
- [ ] Dentro §6 un riferimento `§6.N` ha un solo significato possibile, e `§6.6` non è più ambiguo tra «punto 6 di §6» e «sezione dopo §6».
- [ ] Ogni citazione di `§6.x` in `finish-cycle.md` e `PROCESS.md` risolve.
- [ ] Nessun numero di sezione `## N` oltre il 6 è cambiato.
- [ ] `## 4b.` è riconciliata con lo schema di numerazione scelto.
- [ ] L'insieme delle righe non vuote di `PROCESS.md` è invariato a meno di un elenco esplicito di modifiche, ciascuna con la sua motivazione (punti 3 e 4 sopra), e quell'elenco è nel report del ciclo.
- [ ] `npm test` verde — `claude-md-guard` cammina anche `docs/`, e dal Ciclo 1 lo fa anche `doc-paths-guard`, quindi ogni path citato da `PROCESS.md` deve risolvere.

## Explicitly excluded scope

- **Non si riscrive `PROCESS.md` da zero.** Valutato esplicitamente dall'utente il 2026-10-12 e scartato per le ragioni misurate in testa a questo Brief; non è una domanda aperta per `/brainstorming`.
- Non si riscrive §6 nel merito, non si accorpano né si tagliano i suoi punti: solo la forma della numerazione.
- Non si tocca §7 né le sue condizioni.
- Niente guard nuovo sui puntatori `§N` interni a `PROCESS.md` (l'audit nota che nessuno li controlla; resta debito dichiarato, non lavoro di questo ciclo).
- Niente riallineamento degli altri documenti di processo.

## Nuovi finding durante questo ciclo

Qualunque difetto scoperto durante `/brainstorming` o l'esecuzione va **isolato e proposto come Brief futuro**, mai incorporato in questo fix (`PROCESS.md` §2, Scenario 3) — in particolare altre divergenze §1-vs-gate che emergessero rileggendo `finish-cycle.md` per intero.

**Già isolato dal Ciclo 1, da non risolvere qui:** il Gate 3 di `finish-cycle.md` non ha un ramo che copra un commit che contiene *solo* i fix della review ma non è stato ri-revisionato — lo step 0 chiede entrambe le condizioni, lo step 0b presuppone il caso opposto. Chiuso quel giorno usando comunque la forma scoped di 0b. Appartiene al **Ciclo 4**, che possiede già `<reviewed-sha>` (F3).
