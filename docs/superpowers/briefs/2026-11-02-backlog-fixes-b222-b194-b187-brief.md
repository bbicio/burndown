# Brief — correzioni prima del redesign: B-194, B-222, B-187 e righe stale del backlog

**Brief started:** 2026-11-02 15:15
**Tipo:** audit-fix (Scenario 3). Un solo ciclo, raggruppamento confermato dall'utente il 2026-11-02, compreso l'indice unico dei POT speciali dentro la migrazione `032`.
**Origine:** handoff `docs/superpowers/briefs/2026-11-02-backlog-fixes-b222-b194-b187-handoff.md`. Righe di `docs/BACKLOG.md`: **B-194, B-222, B-187, B-096, B-099, B-100, B-012**.
**Perché insieme:** sono le righe Medium ancora aperte prima del redesign, più le righe già risolte che risultano `open`. B-222 parti 1-2 hanno la stessa causa (il motivo del rifiuto del server non arriva all'utente); B-222 parte 3 e B-187 sono la stessa natura (dati salvati prima delle regole money, nessun dato colpito oggi); B-194 ha causa propria, nello schema.

## Problema

- I POT speciali ("Unassigned / To be Identified", "New Biz") di `master-pipelines.html` non si possono creare.
- Alcuni salvataggi falliscono senza che l'utente veda il motivo, e Generate project può creare un progetto senza PTC senza dirlo.
- Quattro righe del backlog risultano aperte ma sono già risolte.

## Comportamento attuale

Ricontrollato il 2026-11-02:
- **B-194:** `POST /api/pots` accetta esattamente uno tra `clientGroupId`, `clientId`, `specialLabel` (`api/src/routes/pots.js`, `router.post('/'`) e inserisce `special_label` con i due id a NULL. Il vincolo `pots_target_xor` (migrazione 005) pretende esattamente uno tra `client_group_id` e `client_id`, anche sul DB principale: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pots_target_xor'`. Sul DB principale: 4 POT, nessuno speciale.
- **B-194, finding nuovo incluso per decisione dell'utente:** `pots` ha indici unici parziali solo su `(client_group_id, year)` e `(client_id, year)` (`SELECT indexdef FROM pg_indexes WHERE tablename='pots'`). Allentato il vincolo, due POT "New Biz" dello stesso anno sarebbero accettati e il `409` della route non scatterebbe mai.
- **B-222 parte 1:** `REASON_CODES` in `js/lib/project-push-result.js` non contiene `MONEY_RULE`, quindi `project-config.html` mostra "Save failed" senza il motivo.
- **B-222 parte 2:** `cgDoGenerateProject` (`js/costgrid.js`) segnala all'utente solo il fallimento della parte `project` e della parte `tasks`; una PTC rifiutata non viene segnalata e il progetto nasce senza PTC. `tasks.ptc` è `NUMERIC(…,2)` e la structure `PUT` valida la PTC nella valuta della versione dal ciclo f2, quindi il caso nasce solo da dati precedenti.
- **B-222 parte 3:** la migrazione 030 arrotonda il phasing solo dei progetti EUR. `select currency, count(*) from projects group by 1` → solo `EUR|15`.
- **B-187:** `PUT /api/projects/:id/tasks` rifiuta un `hourlyRate` stringa con `MONEY_RULE`. Sul DB principale `SELECT jsonb_typeof(r->'hourlyRate'), count(*) FROM project_tasks, jsonb_array_elements(resources) r GROUP BY 1` → `number|61`.
- **B-096:** `grep -n "font-size: 20px" css/pipeline.css` → nessun risultato; la regola `.ph-title { font-size: 20px; }` è nel blocco `@media (max-width: 767.98px)` di `css/style.css`.
- **B-099:** `grep -n "headerBadge" costgrid.html portfolio.html` → ogni `<span v-html>` ha un `v-if` sullo stesso `headerBadge(...)`.
- **B-100:** `.app-container > .ph` usa `--app-pad` per il padding laterale (`css/style.css`).
- **B-012:** `grep -rn "parseMoney(" --include=*.js --include=*.html . | grep -v node_modules | grep -v "\.test\.js"` → solo la definizione in `js/lib/money.js`; `js/lib/money.test.js` verifica che `readMoneyInput('107.5', 'EUR', C)` dia `NaN`.

## Comportamento atteso

- Un POT speciale si crea, una volta per etichetta e anno; un duplicato risponde `409`.
- Un rifiuto `MONEY_RULE` mostra il motivo del server in `project-config.html`.
- Generate project segnala ogni parte non salvata, PTC compresa.
- Per B-222 parte 3 e B-187 il brainstorming decide fra migrazione e "nessuna azione, documentata".
- Le righe B-096, B-099, B-100, B-012 sono chiuse con il comando rieseguito; il brainstorming decide se rimuovere l'export `parseMoney`.

## Vincoli

- Migrazione `032` annotata in `docs/db/migrations.md`; `scripts/architecture-guard.test.js` deve restare verde.
- Prima di applicare la `032` al DB principale: `scripts/backup-db.sh` e conferma dell'utente (lo fa il Gate 4 di `/finish-cycle`).
- Le route toccate hanno il loro test in `test-api.js`.
- Tutto il testo visibile all'utente è in inglese.

## Criteri di accettazione

1. Un test in `test-api.js` crea un POT speciale, riceve `409` sul duplicato con la stessa etichetta e lo stesso anno.
2. Nel browser, su `master-pipelines.html`, la creazione di un POT "New Biz" riesce.
3. Un test in `js/lib/` verifica che un fallimento con `code: 'MONEY_RULE'` porti il motivo nel messaggio.
4. Nel browser, `project-config.html` mostra il motivo di un rifiuto `MONEY_RULE`.
5. Generate project con una parte PTC rifiutata lo dice all'utente.
6. Le righe B-194, B-222, B-187, B-096, B-099, B-100, B-012 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
7. `npm test`, i test `node:test` di `api/` e `scripts/run-tests.sh` passano.

## Scope escluso esplicitamente

- f4 (B-207, B-209, B-211, B-212) e B-225: rinviati.
- I task fuori periodo, B-149, B-164/B-166, B-013, B-082, B-083, la UI per rinominare/cancellare un Programma.
- Una passata sistematica sulle altre righe `open` del backlog.
- Le memorie non allineate al repo elencate nell'handoff.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione di questo ciclo non va corretto qui. Va isolato e proposto come Brief a sé, oppure come riga di `docs/BACKLOG.md` (PROCESS.md, Scenario 3).
