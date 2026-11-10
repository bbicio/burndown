# Brief — Gate 5: un solo giro di test, proporzionato al diff

**Tipo:** evoluzione di una feature esistente (Scenario 2), confermata dall'utente il 2026-11-10.
**Origine:** riepilogo in chat del 2026-11-10 sulle ripetizioni di test e revisioni in `/finish-cycle`; l'utente ha scelto di partire dal Gate 5.

## Problema

Il Gate 5 può testare lo stesso albero più di una volta, e lancia la suite completa anche quando il subset copre già ogni file cambiato. Un rosso rifà da capo `/sync-docs`. Il report non registra cosa il gate ha lanciato, quindi nessuna di queste ripetizioni è misurabile.

## Comportamento attuale

- **`/sync-docs` lancia `npm test` per conto suo.** `.claude/skills/sync-docs/SKILL.md:48` (sezione 3, `TEST_CASES.md`): "run `npm test` after editing this file". `/sync-docs` gira dentro il Gate 5 step 1 (`.claude/commands/finish-cycle.md:190`), prima dello step 3 che ritesta.
- **Lo step 3 sceglie i test con `gate5-scope`.** `.claude/commands/finish-cycle.md:251`: `docs-only` → `npx vitest run scripts/ js/lib/test-cases-parse.test.js`; `other` o exit non-zero → `npm test`.
- **`docs-only` = ogni path finisce in `.md` o è `js/lib/test-cases-parse.test.js`.** `scripts/gate5-scope.mjs`, `classifyGate5` e `GATE5_TEST_FILE`. Un file `scripts/*.test.js` toccato da `/sync-docs` (es. il pin di `scripts/claude-md-guard.test.js`, abbassato nel ciclo `2026-11-10-two-step-c1-profile-page`) rende il diff `other`, benché `scripts/` sia già nel subset.
- **`other` toglie anche il push pre-autorizzato.** `.claude/commands/finish-cycle.md:254`: lo step 5 salta la domanda solo con `docs-only`, `<gate5-preauthorised>` vero e step 3 verde al primo run.
- **Un rosso allo step 3 rientra dallo step 1.** `.claude/commands/finish-cycle.md:252`: "then re-enter this gate from its step 1", cioè `/sync-docs`, report e righe di `docs/BACKLOG.md` di nuovo.
- **Il report non registra il Gate 5.** `.claude/commands/finish-cycle.md:201` e `:213`: un solo contatore `full test-suite runs` per tutto il ciclo, senza il verdetto di `gate5-scope` né quale comando lo step 3 ha lanciato. Il report `2026-11-10-two-step-c1-profile-page-finish-cycle.md` conta un solo `npm test` al Gate 5: la doppia esecuzione è prevista dalle istruzioni, non misurata.
- **La stessa regola è ripetuta in PROCESS.md** in tre punti: §1 (tabella, riga `/finish-cycle`), §4b punto 2, §6.2.

## Comportamento atteso

1. Dentro `/finish-cycle` i test del Gate 5 girano **una sola volta**, allo step 3: `/sync-docs` non li lancia e lo dichiara. Lanciato da solo, `/sync-docs` lancia il subset, non `npm test`.
2. Un diff fatto solo di `.md`, di `js/lib/test-cases-parse.test.js` e di file `scripts/**/*.test.js` lancia il subset, non `npm test`.
3. Dopo un rosso allo step 3 si corregge e si rilancia **solo lo step 3**; il push, dopo un rosso, chiede sempre (come oggi).
4. Il report registra, per il Gate 5: il verdetto di `gate5-scope`, il comando lanciato dallo step 3 e quante volte.

## Vincoli

- **Il classificatore decide sui path, mai sul contenuto** (PROCESS.md §6.4c, principio ripreso da `gate5-scope`). La nuova classe si definisce per path.
- **Concessione solo su un token letterale:** un output diverso, vuoto o un errore restano `npm test` e domanda di push.
- **`scripts/gate5-scope.test.js` pinna la regola:** ogni cambio di classe passa da lì, compresa la guardia `mdReadingTests` sulla sicurezza del subset.
- **Regole di scrittura dei documenti di `CLAUDE.md`:** una regola vive in un file; le tre ripetizioni in PROCESS.md vanno ridotte o allineate, non moltiplicate.
- **File di processo** (`.claude/`, `scripts/`, PROCESS.md): classe di rischio almeno `standard` (§6.1b).
- Mai rendere verde la suite allentando un'asserzione o alzando un pin (`.claude/commands/finish-cycle.md:252`): resta.

## Criteri di accettazione

- `.claude/skills/sync-docs/SKILL.md` non chiede più `npm test` quando gira dentro `/finish-cycle`, e da solo chiede il subset; `grep -n "npm test" .claude/skills/sync-docs/SKILL.md` non trova un'istruzione di lancio.
- `scripts/gate5-scope.test.js` ha casi che danno il subset per `.md` + `scripts/x.test.js`, e `npm test` per `.md` + `scripts/x.mjs`, `.md` + `js/lib/altro.test.js`, diff vuoto.
- `.claude/commands/finish-cycle.md` Gate 5 step 3: dopo un rosso si rilancia lo step 3, non lo step 1.
- Il template del report in `.claude/commands/finish-cycle.md` ha un campo per verdetto, comando e numero di esecuzioni del Gate 5.
- PROCESS.md §1, §4b e §6.2 dicono la stessa cosa del comando, o rimandano a esso.
- `npm test` verde.

## Scope escluso (confermato dall'utente)

- Gate 1 e `scripts/run-tests.sh`: ciclo successivo.
- Code review dei Gate 2 e 3 (round, skip, scoping, cascata dei fix): ciclo a parte.
- `test-api.js` scritto da `/sync-docs` (sezione 4), che nessuna suite del Gate 5 esegue: lacuna nota, non trattata qui.
- Il contenuto di `/sync-docs` (routing, memoria, `TEST_CASES.md`): si tocca solo il suo lancio dei test.

## Domande aperte per `/brainstorming`

- La nuova classe (`.md` + `scripts/**/*.test.js`) mantiene anche il **push pre-autorizzato**, o abbassa solo i test e la domanda di push resta? Un pin abbassato è una modifica a un guard.
- Nuovo token (es. `docs-and-guards`) o allargamento di `docs-only`? Il primo lascia distinte le due concessioni (subset, push).
- Il subset copre davvero ogni `scripts/**/*.test.js`? `npx vitest run scripts/` li prende tutti oggi; va pinnato che resti vero.
- Dopo un rosso, la correzione rilancia lo step 3 con lo stesso verdetto o ricalcola `gate5-scope` (la correzione può cambiare la classe del diff)?
- Il criterio 4 (misura) basta come esperimento, o va fissato quando si decide sui numeri, come in §6.4d?
