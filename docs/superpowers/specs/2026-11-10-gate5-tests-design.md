# Spec — Gate 5: un solo giro di test, proporzionato al diff

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-10-gate5-tests-brief.md` (Scenario 2, evoluzione).
Design concordato in chat il 2026-11-10 (una fermata, §6b).

## 1. Scope

Il Gate 5 scrive lo stesso contenuto e chiede le stesse conferme. Cambiano quattro cose:
- `/sync-docs` non lancia test quando gira dentro `/finish-cycle`;
- un diff che aggiunge ai `.md` solo file `scripts/**/*.test.js` lancia il subset, non `npm test`;
- un rosso allo step 3 si corregge e rientra dallo step 3, non dallo step 1;
- il report registra cosa lo step 3 ha lanciato.

Fuori scope (confermato nel Brief): Gate 1 e `scripts/run-tests.sh`; code review dei Gate 2 e 3; `test-api.js` scritto da `/sync-docs`; il contenuto di `/sync-docs`.

Base empirica, dal 2026-10-09: sui commit `docs: sync docs` del Gate 5, i path non `.md` sono `js/lib/test-cases-parse.test.js`, `scripts/claude-md-guard.test.js` e due guard di prodotto in `js/lib/`. Il comando che lo misura:

```bash
for c in $(git log --since=2026-10-09 --format=%h --grep="^docs: sync docs"); do git show --name-only --format= $c | grep -v '\.md$'; done | sort | uniq -c
```

## 2. `/sync-docs` — `.claude/skills/sync-docs/SKILL.md`, sezione 3

La frase "run `npm test` after editing this file" diventa:
- **dentro `/finish-cycle`:** non lanciare test; il Gate 5 step 3 li lancia sull'albero finale;
- **lanciato da solo:** `npx vitest run scripts/ js/lib/test-cases-parse.test.js`.

Il resto della sezione — conteggi esatti, mai allentare l'asserzione né togliere il caso — resta.

## 3. Terzo verdetto — `scripts/gate5-scope.mjs`

### 3.1 Regola

| Verdetto | Quando | Step 3 | Step 5 |
|---|---|---|---|
| `docs-only` | diff non vuoto; ogni path finisce in `.md` o è `js/lib/test-cases-parse.test.js` | subset | pre-autorizzabile |
| `docs-and-script-tests` | diff non vuoto; ogni path è come sopra o corrisponde a `scripts/**/*.test.js`; almeno uno di questi ultimi | subset | chiede sempre |
| `other` | ogni altro caso, errore dello script compreso | `npm test` | chiede sempre |

Il subset è `npx vitest run scripts/ js/lib/test-cases-parse.test.js`: esegue ogni `scripts/**/*.test.js`, quindi anche quello toccato.

`classifyGate5` vede solo i path, non lo stato git: un `scripts/**/*.test.js` cancellato dà `docs-and-script-tests`. Il push resta comunque una domanda.

### 3.2 Script

- La funzione pura `classifyGate5(paths)` restituisce uno dei tre token. Il contratto CLI resta: prima riga il verdetto, poi i path, exit 0; un errore git dà exit 1 e il chiamante lo tratta come `other`.
- L'header dello script descrive i tre verdetti e cita questa Spec accanto a quella del 2026-10-28.
- `mdReadingTests` e la sua guardia restano invariati.

### 3.3 Test — `scripts/gate5-scope.test.js`

- "the claude-md-guard pin is other" diventa `docs-and-script-tests`.
- Casi nuovi: solo `scripts/x.test.js` → `docs-and-script-tests`; `.md` + `scripts/lib/x.test.js` → `docs-and-script-tests`; `.md` + `scripts/x.mjs` → `other`; `.md` + `js/lib/altro.test.js` → `other`.
- I casi esistenti di `docs-only` e `other` restano.

## 4. Gate 5 — `.claude/commands/finish-cycle.md`

- **Step 3:** `docs-only` o `docs-and-script-tests` → subset; `other` o exit non zero → `npm test`.
- **Rosso allo step 3:** si corregge su `main` e si rientra dallo step 3 (verdetto ricalcolato, poi i test), non dallo step 1. `/sync-docs`, il report e le righe di `docs/BACKLOG.md` non si rifanno; la correzione, se tocca il report, si fa con l'Edit tool. Un rosso annulla la pre-autorizzazione, come oggi.
- **Step 5:** invariato — salta la domanda solo con `docs-only`, `<gate5-preauthorised>` vero e verde al primo run.
- **Template del report:** sotto `**Cycle counters:**` una riga

  ```markdown
  **Gate 5 tests:** <verdetto> → <comando> ×<N> (<green on first run | red, then green>)
  ```

  con il commento del template che ne dice il significato: un'esecuzione per ogni ingresso allo step 3.

## 5. Una regola in un solo file

- **`docs/superpowers/PROCESS.md`:** §1 (riga `/finish-cycle` della tabella), §4b punto 2 e §6.2 oggi ripetono il comando del subset e la condizione `docs-only`. Diventano un rinvio: lo step 3 del Gate 5 sceglie i test con `node scripts/gate5-scope.mjs`, la regola sta nello script e nel comando. §6.2 aggiunge che `/sync-docs` dentro `/finish-cycle` non lancia test.
- **`CLAUDE.md`:** la voce `scripts/gate5-scope.mjs` del blocco File structure passa da "`docs-only` vs `other`" ai tre verdetti, senza crescere oltre due righe; il pin di `scripts/claude-md-guard.test.js` si aggiorna nello stesso commit.
- **`ARCHITECTURE.md`:** la riga di `gate5-scope.mjs` nell'albero degli script, idem.

## Criteri di accettazione

1. **`/sync-docs`** — `grep -n "npm test" .claude/skills/sync-docs/SKILL.md` non trova più un'istruzione di lancio; la sezione 3 nomina il subset per il lancio da solo e il Gate 5 step 3 per `/finish-cycle`.
2. **Classificatore** — `npx vitest run scripts/gate5-scope.test.js` è verde con i casi di §3.3.
3. **CLI** — in un albero con una modifica non committata a `scripts/claude-md-guard.test.js` e a un `.md`, `node scripts/gate5-scope.mjs` stampa `docs-and-script-tests` come prima riga.
4. **Step 3** — `.claude/commands/finish-cycle.md` Gate 5 step 3 lancia il subset per `docs-only` e `docs-and-script-tests`, e dopo un rosso rientra dallo step 3.
5. **Step 5** — la condizione del percorso pre-autorizzato nomina ancora solo `docs-only`.
6. **Report** — il template porta la riga `**Gate 5 tests:**`.
7. **Una regola** — PROCESS.md §1, §4b e §6.2 non ripetono più il comando del subset; `CLAUDE.md` e `ARCHITECTURE.md` nominano tre verdetti.
8. **Suite** — `npm test` verde.

## Decisioni aperte

1. **Un terzo verdetto.** Alternativa scartata: allargare `docs-only`, oppure lasciare il classificatore com'è. Perché: allargare darebbe il push senza conferma su un pin, che la Spec del 2026-10-28 ha escluso; non toccarlo terrebbe `npm test` per un diff che il subset copre.
2. **`docs-and-script-tests` chiede il push.** Alternativa scartata: renderlo pre-autorizzabile. Perché: un file `scripts/*.test.js` è un guard, e la sua modifica va vista prima del push.
3. **`/sync-docs` lanciato da solo esegue il subset.** Alternativa scartata: nessun test fuori da `/finish-cycle`. Perché: lanciato a mano non ha un Gate 5 dopo di sé.
4. **Dopo un rosso il verdetto si ricalcola.** Alternativa scartata: riusare quello del primo run. Perché: la correzione può cambiare la classe del diff.
5. **La misura è un registro.** Alternativa scartata: un esperimento con decisione dopo tre cicli, come §6.4d. Perché: non c'è un passo che si potrebbe togliere; i test restano in ogni caso.
6. **PROCESS.md rinvia al comando.** Alternativa scartata: aggiornare le tre copie. Perché: una regola vive in un file.
7. **Un test cancellato sotto `scripts/` dà `docs-and-script-tests`.** Alternativa scartata: leggere lo stato git per mandarlo a `other`. Perché: `classifyGate5` resta una funzione dei soli path, e il push su quel verdetto chiede comunque. Nata scrivendo la Spec: in chat il design lo mandava a `other`.
