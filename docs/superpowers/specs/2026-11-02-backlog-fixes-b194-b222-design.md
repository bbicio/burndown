# Spec — correzioni prima del redesign: POT speciali (B-194), motivi dei rifiuti (B-222), righe stale

**Brief started:** 2026-11-02 15:15
**Brief:** `docs/superpowers/briefs/2026-11-02-backlog-fixes-b222-b194-b187-brief.md` (audit-fix, Scenario 3; B-194, B-222, B-187, B-096, B-099, B-100, B-012 di `docs/BACKLOG.md`).
Design concordato in chat il 2026-11-02 (una fermata, §6b).

## 1. B-194 — migrazione `032`

`api/src/db/migrations/032_pots_special_target.sql`, in una transazione, rieseguibile:
- `ALTER TABLE pots DROP CONSTRAINT IF EXISTS pots_target_xor;`
- `ALTER TABLE pots DROP CONSTRAINT IF EXISTS pots_target_one;` poi `ALTER TABLE pots ADD CONSTRAINT pots_target_one CHECK (num_nonnulls(client_group_id, client_id, special_label) = 1);`
- `CREATE UNIQUE INDEX IF NOT EXISTS idx_pots_special_year ON pots(special_label, year) WHERE special_label IS NOT NULL;`

`api/src/routes/pots.js` non cambia: accetta già esattamente un bersaglio e risponde `409` su `23505`.

## 2. B-222 parte 1 — `MONEY_RULE` nei motivi mostrati

`REASON_CODES` in `js/lib/project-push-result.js` diventa `DATE_RULE`, `PROJECT_RULE`, `STRUCTURE_RULE`, `MONEY_RULE`. Un codice fuori da questo insieme continua a non mostrare il testo del server.

## 3. B-222 parte 2 — Generate project segnala ogni parte non salvata

- Nuovo export puro `summarizeGenerateResult(projectName, failed)` in `js/lib/project-push-result.js`, con il suo bridge `window.summarizeGenerateResult`. `failed` è la lista di `_pushProjectToApiDetailed()` (`js/api-sync.js`).
- Ignora la parte `project` (la gestisce `pushedOk` in `cgDoGenerateProject`). Senza altre parti restituisce `''`. Altrimenti restituisce `Project "<nome>" was created, but its <parti> <was|were> not saved.`, con le etichette di `PART_LABELS` e la stessa concordanza singolare/plurale di `summarizePushResult`, seguito da ` Reason: <motivo>` quando una parte ha un codice in `REASON_CODES` e un motivo.
- `cgDoGenerateProject` (`js/costgrid.js`): il blocco `if (tasksFailed) { showInfo(...) }` diventa `const generateMsg = summarizeGenerateResult(projectName, pushResult.failed)`, mostrato con `showInfo` e seguito da `return` quando non è vuoto. Restano come sono il ramo `!pushedOk` e lo svuotamento dei task collegati quando fallisce la parte `tasks`.
- Nessun arrotondamento della PTC prima dell'invio.
- `costgrid.html` e `pipeline.html` caricano `js/lib/project-push-result.js` come `<script type="module">` prima di `js/costgrid.js`; tutti i riferimenti `?v=` al file passano a `4`.

## 4. B-222 parte 3 e B-187 — nessuna migrazione

Nessun dato colpito sul DB principale (comandi nel Brief). La migrazione 030 si ferma già con un'eccezione su un progetto non-EUR con rumore, e dal ciclo f2 il server rifiuta un phasing con troppi decimali. Un `hourlyRate` stringa resta rifiutato con `MONEY_RULE`, e con il §2 l'utente ne vede il motivo. Le due righe si chiudono con questa motivazione e i comandi rieseguiti.

## 5. B-012 — rimozione di `parseMoney`

`parseMoney` esce da `js/lib/money.js` (export, bridge `window` e le due menzioni nei commenti), il suo `describe` da `js/lib/money.test.js`, la sua voce da `docs/js/lib.md`. `readMoneyInput` non lo usa. Il gemello server `api/src/lib/money-format.js` non si tocca, restano i due guard test che ne verificano l’assenza dalle pagine (`js/lib/costgrid-ptc-input-guard.test.js`, `js/lib/project-config-ptc-phasing-guard.test.js`), e `js/lib/money-guard.test.js` perde `parseMoney` dalla regex delle funzioni money.

## 6. Test

- `test-api.js`: POT-08 crea un POT `specialLabel: 'New Biz'` per l'anno 2099 (`201`, cancellato a fine run) e un duplicato con la stessa etichetta e lo stesso anno riceve `409`. Il commento "a specialLabel POT cannot be created" sopra MR-13 viene corretto.
- `js/lib/project-push-result.test.js`: un fallimento `MONEY_RULE` porta il motivo; `summarizeGenerateResult` restituisce `''` senza parti o con la sola `project`, nomina la PTC con il motivo, e concorda il verbo con più parti.

## 7. Documentazione

- `docs/db/migrations.md`: riga per la `032`. `ARCHITECTURE.md` §6 se `scripts/architecture-guard.test.js` lo richiede.
- `docs/BACKLOG.md`: chiuse B-194, B-222, B-187, B-096, B-099, B-100, B-012, ciascuna con il comando rieseguito.

## 8. Scope escluso

Quello del Brief: f4 e B-225, i task fuori periodo, B-149, B-164/B-166, B-013, B-082, B-083, la UI dei Programmi, una passata larga sulle righe `open`, le memorie non allineate. Un finding nuovo dell'esecuzione va in `docs/BACKLOG.md` o in un Brief a sé.

## Criteri di accettazione

1. **POT speciale via API** — POT-08 in `test-api.js`: creazione `201`, duplicato stessa etichetta e anno `409`.
2. **POT speciale nel browser** — su `master-pipelines.html` la creazione di un POT "New Biz" riesce e compare nella lista come "General".
3. **Motivo MONEY_RULE, test** — `js/lib/project-push-result.test.js` verifica che un fallimento `MONEY_RULE` porti il motivo del server nel messaggio.
4. **Motivo MONEY_RULE nel browser** — `project-config.html` mostra `Reason: …` per un salvataggio rifiutato con `MONEY_RULE`.
5. **Generate project, PTC rifiutata** — `js/lib/project-push-result.test.js` verifica che `summarizeGenerateResult` nomini la PTC e il motivo, e `cgDoGenerateProject` mostra quel messaggio.
6. **`parseMoney` rimosso** — `grep -rn "parseMoney" js/ *.html --exclude=*.test.js` → nessun risultato.
7. **Backlog** — B-194, B-222, B-187, B-096, B-099, B-100, B-012 chiuse in `docs/BACKLOG.md`, ciascuna con il comando rieseguito.
8. **Suite** — `npm test`, i test `node:test` di `api/` e `scripts/run-tests.sh` passano.

## Decisioni aperte

1. **Vincolo "esattamente uno dei tre" con `num_nonnulls`.** Alternativa scartata: XOR esplicito su tre colonne. Perché: equivalente e più leggibile.
2. **Indice unico parziale su `(special_label, year)`.** Alternativa scartata: controllo nella route. Perché: decisione dell'utente, e la route mappa già `23505` su `409`.
3. **Generate project segnala la PTC fallita e non arrotonda.** Alternativa scartata: arrotondare ai decimali della valuta prima dell'invio. Perché: dal ciclo f2 la versione non può più contenere quel valore; arrotondare cambierebbe un importo senza dirlo.
4. **Messaggio di Generate in una funzione pura di `js/lib/`, caricata da `costgrid.html` e `pipeline.html`.** Alternativa scartata: messaggio inline in `js/costgrid.js`. Perché: testabile, e condivide le etichette con project-config.
5. **Nessuna migrazione per B-222 parte 3 e B-187.** Alternativa scartata: una migrazione `033`. Perché: nessun dato colpito, la 030 si ferma già sui non-EUR, e il motivo del rifiuto ora si vede.
6. **Rimozione di `parseMoney`.** Alternativa scartata: lasciarlo come codice morto. Perché: nessun chiamante di produzione, ed è lui il rischio di B-012.
