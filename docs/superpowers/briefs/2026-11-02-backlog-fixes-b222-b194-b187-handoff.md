# Handoff — ciclo di correzioni prima del redesign: B-222, B-194, B-187 e righe stale del backlog

**Data:** 2026-11-02
**Decisione dell'utente (2026-11-02):** rinviati f4 (B-207, B-209, B-211, B-212) e B-225; prima del prossimo ciclo di redesign si chiude un ciclo breve di correzioni con le tre righe Medium ancora aperte in `docs/BACKLOG.md` e la pulizia delle righe che risultano `open` ma sono già risolte.
**Tipo proposto:** audit-fix (Scenario 3), un solo ciclo. B-187 è "magari": va dentro se resta piccolo, altrimenti resta aperta.
**Risk class proposta:** `standard`. C'è una migrazione (B-194) e un cambio a un messaggio d'errore e a Generate project (B-222); nessuna regola di dominio nuova.

Ogni affermazione qui sotto ha il comando che l'ha verificata il 2026-11-02. Vanno rieseguiti all'inizio del ciclo, prima del brief/spec: lo stato può essere cambiato.

## 1. B-194 — i POT speciali ("Unassigned", "New Biz") non si creano

- `POST /api/pots` accetta esattamente uno tra `clientGroupId`, `clientId`, `specialLabel` (`api/src/routes/pots.js` line 248) e inserisce `special_label` con i due id a NULL.
- Il vincolo `pots_target_xor` della migrazione 005 (`api/src/db/migrations/005_drafts_pipeline_year_pot.sql`) richiede esattamente uno tra `client_group_id` e `client_id`; la migrazione 010 (`api/src/db/migrations/010_pots_special_label.sql`) ha aggiunto la colonna senza allentarlo. `grep -rln "pots_target_xor" api/src/db/migrations/` → solo 005.
- **Più grave di quanto dica la riga del backlog:** la riga parla di "a DB built from the migrations", ma anche il DB principale ha lo stesso XOR: `docker exec pdash-db psql -U pdash -d pdash -Atc "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='pots_target_xor'"` → `CHECK ((((client_group_id IS NOT NULL) AND (client_id IS NULL)) OR ((client_group_id IS NULL) AND (client_id IS NOT NULL))))`; `select count(*) filter (where special_label is not null), count(*) from pots` → `0|4`. Da confermare nel browser su `master-pipelines.html` che la creazione dia davvero 500 anche oggi.
- Direzione probabile: migrazione `032` che sostituisce il vincolo con "esattamente uno dei tre" (`num_nonnulls(client_group_id, client_id, special_label) = 1`), annotata in `docs/db/migrations.md` e in `ARCHITECTURE.md` §6 se il guard lo richiede; test in `test-api.js` che crea un POT speciale.

## 2. B-222 — salvataggi che falliscono senza motivo, PTC perso da Generate project

Tre parti, da tenere distinte nella Spec:
1. **`MONEY_RULE` manca da `REASON_CODES`** (`js/lib/project-push-result.js` line 12: `new Set(['DATE_RULE', 'PROJECT_RULE', 'STRUCTURE_RULE'])`), quindi `project-config.html` mostra "Save failed" senza il motivo del server. Correzione piccola, con test in `js/lib/`.
2. **Generate project con un PTC di versione con troppi decimali:** la parte PTC fallisce in silenzio e il progetto nasce senza PTC (`js/costgrid.js`, `cgDoGenerateProject`). Da decidere: arrotondare prima di inviare, oppure segnalare il fallimento all'utente; in entrambi i casi il fallimento parziale non deve essere silenzioso.
3. **Phasing non-EUR con più decimali della valuta:** la migrazione 030 (`api/src/db/migrations/030_round_project_phasing.sql`) arrotonda solo EUR. `select count(*) from projects where currency <> 'EUR'` → `0`: oggi nessun dato colpito. Probabilmente basta generalizzare l'arrotondamento per valuta o documentare la decisione di non farlo.

## 3. B-187 (magari) — tariffe salvate come stringa nei progetti vecchi

- `PUT /api/projects/:id/tasks` rifiuta un `hourlyRate` stringa con `MONEY_RULE` (`api/src/routes/projects.js` line 439).
- Sul DB principale non ce n'è nessuno: `SELECT jsonb_typeof(r->'hourlyRate'), count(*) FROM project_tasks, jsonb_array_elements(resources) r GROUP BY 1` → `number|61`. Il caso è latente (backup vecchi, DB ricostruiti).
- Opzioni: una migrazione che converte le stringhe numeriche in numeri, oppure chiudere la riga come "nessun dato colpito, nessuna azione". Se la parte 1 di B-222 viene fatta, l'utente almeno vede il motivo del rifiuto.

## 4. Righe del backlog da chiudere (già risolte)

Ognuna si chiude con il comando nel `Verified how`, rieseguito nel ciclo:
- **B-096** (layout phone del page head solo in pipeline): le regole `.ph*` per telefono sono ora globali in `css/style.css` (`.ph-title { font-size: 20px; }` nel blocco `@media (max-width: 767.98px)`), e `grep -n "font-size: 20px" css/pipeline.css` → nessun risultato.
- **B-099** (`<span v-html>` vuoto per un badge `''`): `grep -n "headerBadge" costgrid.html portfolio.html` → ogni span ha ora un `v-if` sullo stesso `headerBadge(...)`.
- **B-100** (`.ph` a 24px mentre il contenuto è a 12px): la banda usa `--app-pad` (`css/style.css` lines 101-104), quindi segue il padding della pagina.
- **B-012** (parse rigido: `1234.56` in un campo it-IT letto come 123456): `parseMoney` non ha più chiamanti di produzione (`grep -rn "parseMoney(" --include=*.js --include=*.html .` esclusi test e `node_modules` → solo la definizione in `js/lib/money.js`); gli input usano `readMoneyInput`, che per `1234.56` in it-IT restituisce `NaN` (rifiuto con esempio) invece di 123456. Da confermare con un test esistente o nuovo in `js/lib/money.test.js`; poi valutare se rimuovere l'export `parseMoney`, ora morto.

Altre righe stale non sono state cercate in modo sistematico: le righe `open` (`grep -c "| open |" docs/BACKLOG.md`) non hanno quasi mai un livello di gravità e la maggior parte non è stata ricontrollata. Fuori scope per questo ciclo, salvo che il brief decida una passata più larga.

## 5. Fuori scope

- f4 e B-225: rinviati, restano `open` con la nota del 2026-11-02.
- I task fuori periodo (12/44 di cost grid, 9/28 di progetto al 2026-10-28), B-149, B-164/B-166, B-013, B-082, B-083, la UI mancante per rinominare/cancellare un Programma: noti, non in questo ciclo.
- Memorie non allineate al repo (header unification su B-116/B-117, custom controls "solo costgrid", descriptions-topics "non mergiato", ui-defects "tab Programs ripristinata"): si correggono fuori dal repo, non in questo ciclo.

## Prossimo passo

Seguire `docs/superpowers/PROCESS.md` per l'audit-fix: rieseguire i comandi sopra, scrivere brief e Spec con i criteri di accettazione (incluso il controllo nel browser della creazione di un POT speciale su `master-pipelines.html` e del messaggio di `project-config.html` su un `MONEY_RULE`), poi il Plan con la risk class, il worktree come da §6.1b e la chiusura con `/finish-cycle`. Prima di applicare la migrazione `032` al DB principale: `scripts/backup-db.sh` e conferma dell'utente.
