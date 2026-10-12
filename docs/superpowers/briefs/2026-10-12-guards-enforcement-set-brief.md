# Brief — Ciclo 1: chiudere l'enforcement dei guard sull'insieme (F1 + F2 + F4)

**Scenario 3 (audit → fix).** Fonte: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, finding **F1**, **F2**, **F4** + addendum §2 e §3.
**Causa radice comune** (addendum §3): l'enforcement è stato scritto un ciclo per volta, mai calcolato sull'insieme dei guard. Stessi due file (`scripts/architecture-guard.test.js`, `scripts/claude-md-guard.test.js`) più `.claude/commands/finish-cycle.md`.

## Current behavior

**F1 — Gate 5 pusha su `main` senza gate di test, ed è lo step che edita i numeri pinnati.**
`npm test` compare **una sola volta** in tutto il comando, al Gate 1 (`finish-cycle.md:16`). Il Gate 5 fa: `/sync-docs` (`:143`) → report (`:144`) → diff (`:182`) → domanda (`:183`) → `git add`/`commit`/`push origin main` (`:185`). Nessuna verifica tra gli edit di `/sync-docs` e il push. E ciò che `/sync-docs` edita a quel punto è esattamente ciò che i guard pinnano: il commit `3edd128` ha cambiato `CLAUDE.md` **e** `claude-md-guard.test.js` (pin da 12.538 a 12.758 byte) nello stesso commit non testato.

**F2 — `architecture-guard` inverte l'ordine di documentazione che il processo prescrive.**
Il guard asserisce `expect(undocumented).toEqual([])` su ogni route handler (`:151`), ogni tabella creata da una migrazione (`:188`) e ogni colonna aggiunta da un `ALTER TABLE` (`:203`): un branch che aggiunge un endpoint o una migrazione fa **fallire `npm test`** finché `ARCHITECTURE.md` §5/§6 non lo documenta. Il Gate 1 è bloccante (`:16`). Ma lo step che aggiorna `ARCHITECTURE.md` è `/sync-docs` §1, invocato al **Gate 5, post-merge** (`:143`). `sync-docs` §2 (CLAUDE.md) ha un paragrafo esplicito sul proprio guard (SKILL.md:24); §1 (ARCHITECTURE.md) non ha la frase equivalente, `PROCESS.md` non nomina né `architecture-guard` né `claude-md-guard`, e `finish-cycle.md` non nomina nessun guard (`grep -c guard` = 0). Il guard non è mai stato esercitato su un ciclo così (`git diff --name-only 660ae1e..HEAD -- api/` è vuoto).

**F4 — i path citati dai documenti non sono coperti da nessun guard.**
`claude-md-guard` dichiara il proprio limite (`:35-39`) e cammina solo `docs/` e `.claude/` (`:180`), cercando puntatori verso sezioni di `CLAUDE.md`. `architecture-guard` non controlla citazioni. L'addendum ha misurato: la forma «nome di sezione tra apici dopo il nome del documento» ha **0 occorrenze** per `ARCHITECTURE.md` e `PRD.md` — estendere *quel* check non guarderebbe nulla di esistente. Quello che è davvero non guardato sono i **path di file citati**: 199 distinti sui 13 documenti, da nessun test.

**Addendum §2 — quattro affermazioni al presente su file cancellati il 2026-07-27** (`2d4446f`): `ARCHITECTURE.md:1025`, `docs/prd/project-config.md:40` e `:72` (`js/config-form.js`), `docs/pages/portfolio.md:9` (`js/dashboard.js` «is now fully orphaned dead code», mentre è cancellato). Sono **path citati che non esistono**: senza correggerli il guard di F4 nasce rosso. Non è un finding adiacente, è un prerequisito tecnico.

## Expected behavior

1. **F1** — un `npm test` bloccante al Gate 5, tra lo step 2 (report scritto) e lo step 3 (diff mostrato), con la stessa semantica del Gate 1: se fallisce si ferma, mostra l'output verbatim, niente commit e niente push. È il rimedio economico; **non** si spostano i pin fuori da `CLAUDE.md`.
   - Conseguenza gratuita da dichiarare: la quarta pin esatta fuori dai sei file auditati (`js/lib/test-cases-parse.test.js`, i cui numeri `/sync-docs` §3 aggiusta proprio a quel punto) rientra automaticamente in quel `npm test`, perché `vitest.config.js` include `js/**/*.test.js`. Nessuna azione aggiuntiva.
2. **F2** — due frasi di prosa, nessun riordino di gate:
   - in `sync-docs` SKILL.md §1, la frase speculare a quella che §2 già ha: `architecture-guard.test.js` fa fallire `npm test` su una route/tabella/colonna non documentata, quindi §5/§6 si aggiornano **sul branch**, non al Gate 5;
   - in `finish-cycle.md` Gate 1, una riga che dice cosa significa un rosso di quel guard e che il fix appartiene al branch.
3. **F4** — un solo check nuovo: **ogni path di file citato nei documenti vivi risolve**. Per restare snello riusa la camminata che `claude-md-guard` già fa (`docs/` + `.claude/`) più i documenti di root già pinnati; nessuna nuova dipendenza, nessun nuovo traversal.
4. **Addendum §2** — correggere le 4 affermazioni portandole al passato/rimuovendo il riferimento, in modo che il check al punto 3 sia verde.

## Constraints

- Nessun riordino dei gate di `/finish-cycle`, nessuna modifica allo scope di `/sync-docs`, nessun pin esistente rilassato o alzato.
- I guard restano in `npm test`; non si introduce un runner, uno script o un hook nuovo.
- Il check di F4 non deve essere un controllo di *contenuto*: solo esistenza del path.
- **Se il check di F4 trova path mancanti oltre al cluster dell'addendum §2**, quelli extra si **isolano come finding nuovi** (vedi sotto) e non si correggono in questo ciclo: si decide in `/brainstorming` se restringere lo scope del walk o aprire un ciclo separato.
- `PROCESS.md` §7 condizione 3 si applica (si modificano i gate di `/finish-cycle`): l'aggiornamento di `PROCESS.md` è parte del ciclo — ma solo per i guard, **non** per §1 e §6, che sono del Ciclo 2.

## Acceptance criteria

- [ ] Il Gate 5 esegue `npm test` prima di mostrare il diff, ed è bloccante come il Gate 1.
- [ ] `sync-docs` §1 nomina `architecture-guard.test.js` e dice che §5/§6 si aggiornano sul branch.
- [ ] Il Gate 1 di `finish-cycle.md` spiega il rosso da guard e dove appartiene il fix.
- [ ] Esiste un test che fallisce se un path di file citato nei documenti vivi non esiste, e passa sul repo corrente.
- [ ] Le 4 affermazioni dell'addendum §2 non asseriscono più l'esistenza di `js/config-form.js` / `js/dashboard.js`.
- [ ] `npm test` verde.
- [ ] `PROCESS.md` nomina i guard dove serve (condizione §7.3).

## Explicitly excluded scope

- Non si spostano i pin esatti fuori dai file che `/sync-docs` edita (alternativa valutata e scartata in favore del gate al punto 1).
- Non si tocca la precisione dei matcher dei guard (F5, F6) — Ciclo 3.
- Non si tocca `PROCESS.md` §1 né la numerazione di §6 (F7, F8) — Ciclo 2.
- Non si tocca `<reviewed-sha>` (F3) — Ciclo 4.
- Nessun ceiling di dimensione per `ARCHITECTURE.md` (sollevato dentro F4, ma fuori scope: toccherebbe un documento che l'audit ha escluso).
- Non si apre un secondo audit sui documenti: l'addendum ha concluso che non è giustificato.

## Nuovi finding durante questo ciclo

Qualunque difetto scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief futuro**, mai incorporato in questo fix (`PROCESS.md` §2, Scenario 3). Vale in particolare per i path mancanti che il nuovo check potrebbe far emergere oltre al cluster dell'addendum §2.
