# Spec — finding valute, ciclo f2: la validazione server residua

**Brief started:** 2026-11-01 19:45
**Brief:** `docs/superpowers/briefs/2026-11-01-currency-f2-server-validation-brief.md` (audit-fix; righe B-185, B-186, B-188 e, per decisione di questo brainstorming, B-217 di `docs/BACKLOG.md`).
Design concordato in chat il 2026-11-01 (una fermata, §6b); trattamento di B-217 scelto dall'utente.

## 1. Misure del 2026-11-01 (DB principale, sola lettura)

- `tasks.ptc`: 44 righe (versioni EUR e USD), nessuna negativa, nessuna con decimali oltre la valuta.
- `projects.ptc`: array di `{note, month, title, amount}`; 4 importi, tutti numeri, tutti validi.
- `projects.phasing`: oggetto `{YYYYMM: importo}`; 68 valori, tutti numeri, nessuna chiave malformata; **8 con rumore float**, tutti dello stesso progetto (`ce54e0a8-…`), tutti in mesi passati.
- Tutti i 15 progetti sono in EUR.
- La seconda forma del body della structure `PUT` è usata da 6 setup di `test-api.js` (righe 626, 689, 733, 935, 3595-3596), da nessun client e da nessuno script di seed.

Origine del rumore: `deriveDistribution` arrotonda già ogni mese a 2 decimali; `reforecastDistribution` arrotonda solo i mesi futuri, e scrive i mesi passati (spesa effettiva × `spendScale`) senza arrotondarli. Entrambe arrotondano a 2 decimali fissi, anche per una valuta senza decimali (JPY).

## 2. Limite superiore (B-188)

- `amountError(value, currencyCode, label, { max })`: oltre ai controlli di oggi, rifiuta `value > max` con un messaggio che nomina il massimo.
- `api/src/lib/money-rules.js` esporta due limiti, uno per tipo di colonna: `MAX_DECIMAL_10_2 = 99999999.99` (`DECIMAL(10,2)`) e `MAX_NUMERIC_14_2 = 999999999999.99` (`NUMERIC(14,2)`).
- `max` è obbligatorio: senza, `amountError` lancia un errore di programmazione (nessun default nascosto).
- Chi usa quale limite:
  - `DECIMAL(10,2)`: tariffe di ruolo e override (`config.js`), voci della rate card (`ratecardEntryError`, `overridesError`), tariffe della structure `PUT`, `tasks.ptc`, e gli importi JSONB del progetto: tariffe delle risorse (`PUT /api/projects/:id/tasks`), PTC, phasing.
  - `NUMERIC(14,2)`: importi POT (`pots.js`).

## 3. PTC dei task del cost grid (B-185)

Nel ciclo di pre-controllo della structure `PUT`, prima di `DELETE FROM phases`, con la valuta della versione già letta da `locked`:
- `ptc` assente o `null` → 0, come oggi;
- altrimenti `amountError(tk.ptc, currency, 'PTC of task "<titolo>"', { max: MAX_DECIMAL_10_2 })`; un errore → `400 { error, code: 'MONEY_RULE' }` e nessuna scrittura.

L'`INSERT` scrive il valore validato invece di `tk.ptc || 0`. La copia completa di versione (`cost-grids.js`, la `INSERT INTO tasks` del duplicato) copia valori già salvati e non cambia.

## 4. PTC e phasing del progetto (B-185)

`PATCH /api/projects/:id/ptc` e `PATCH /api/projects/:id/phasing`, dopo `canEdit` e prima dell'`UPDATE`, leggono la valuta del progetto e controllano:
- **PTC:** un array; ogni elemento un oggetto il cui `amount` passa `amountError` (label `PTC row N`); gli altri campi non si controllano.
- **Phasing:** un oggetto non array; ogni valore passa `amountError` (label `Phasing <YYYYMM>`); le chiavi non si controllano.
- Una forma sbagliata o un importo non valido → `400 { error, code: 'MONEY_RULE' }`, nessuna scrittura.

Le regole di forma vivono in `money-rules.js` come funzioni pure (`ptcRowsError`, `phasingError`), testate con `node:test`.

## 5. Seconda forma del body della structure `PUT` (B-186)

Resta, con la regola delle tariffe della prima forma: `rateOverride` assente o `null` → `NULL`; uno 0 resta 0; ogni altro valore passa `amountError` nella valuta della versione con `MAX_DECIMAL_10_2`, nel pre-controllo, prima di qualsiasi scrittura. Sparisce `tr.rateOverride || null`.

## 6. Phasing arrotondato alla fonte (B-217)

- `deriveDistribution` e `reforecastDistribution` (`js/lib/config-form-calc.js`) ricevono i decimali della valuta (`digits`, ultimo parametro) e arrotondano **ogni** mese del phasing a quei decimali, compresi i mesi passati del reforecast.
- `project-config.html` passa `currencyInfo(this.project.currency, window.__currencies).digits`.
- Ogni riferimento a `js/lib/config-form-calc.js` passa a `?v=5`.
- Migrazione `030_round_project_phasing.sql`: arrotonda a 2 decimali i valori di phasing dei progetti EUR. È idempotente e non tocca i progetti di altre valute: prima dell'`UPDATE` fallisce se un progetto non EUR ha un valore di phasing con più di 2 decimali (0 oggi), così una misura cambiata si vede invece di restare rumore.

## 7. Test e documentazione

- `api/src/lib/money-rules.test.js`: `amountError` sopra e al limite di ciascuna colonna, `max` mancante; `ptcRowsError` e `phasingError` (criterio 3).
- `test-api.js`: structure `PUT` (PTC del task e seconda forma), `PATCH …/ptc`, `PATCH …/phasing` — negativo, stringa, troppi decimali, oltre il limite, forma sbagliata, valido; dopo un rifiuto il dato salvato è invariato (criteri 1-2).
- `js/lib/config-form-calc.test.js`: Derive e Reforecast con 2 e con 0 decimali, mesi passati compresi (criterio 4).
- Documentazione: `docs/api/lib.md` (`money-rules.js`), `docs/js/lib.md` (`config-form-calc.js`), `docs/db/migrations.md` (030), la riga di "Money formatting and parsing" di `CLAUDE.md` che elenca le route sotto `amountError` se va estesa.

## 8. Scope escluso

- Le chiavi del phasing (`YYYYMM`) e i campi non monetari delle righe PTC.
- Rumore di phasing in progetti non EUR: oggi non ce ne sono.
- Le ore del planning (non sono importi).
- B-189, B-191, B-192, B-193, B-194, B-207 e la rate card (come nel brief).

## Criteri di accettazione

1. **Rifiuti del PTC e del phasing** — un test in `test-api.js` verifica che structure `PUT`, `PATCH …/ptc` e `PATCH …/phasing` rifiutino con `MONEY_RULE` un negativo, una stringa, un importo con troppi decimali e uno oltre il limite, lascino invariato il dato salvato, e accettino un importo valido.
2. **Seconda forma** — un test in `test-api.js` verifica che la seconda forma del body salvi un `rateOverride` 0 come 0 e rifiuti con `MONEY_RULE` un negativo.
3. **Limite di colonna** — `api/src/lib/money-rules.test.js` verifica che `amountError` rifiuti un valore oltre `MAX_DECIMAL_10_2` e oltre `MAX_NUMERIC_14_2`, accetti il valore al limite, e lanci senza `max`.
4. **Phasing arrotondato** — `js/lib/config-form-calc.test.js` verifica che ogni mese del phasing di Derive e di Reforecast, mesi passati compresi, abbia al massimo i decimali passati (2 e 0).
5. **Dati esistenti** — dopo la migrazione 030, `docker exec pdash-db psql -U pdash -d pdash -Atc "select count(*) from projects, jsonb_each_text(coalesce(phasing,'{}')) as e(k,v) where v::numeric <> round(v::numeric,2)"` dà `0`.
6. **Verifica nel browser** — in `project-config.html`, Reforecast su un progetto con actuals e poi Save riesce; un phasing inviato con un valore negativo via `fetch` dalla console riceve `400` con `code: 'MONEY_RULE'`.
7. **Backlog** — le righe B-185, B-186, B-188 e B-217 di `docs/BACKLOG.md` sono chiuse, ciascuna con il comando rieseguito.
8. **Suite** — `npm test`, i test `node:test` di `api/` e il profilo di integrazione (`scripts/run-tests.sh`) passano.

## Decisioni aperte

1. **Seconda forma del body tenuta e validata.** Alternativa scartata: rimuoverla. Perché: nessun guadagno di prodotto, e 6 setup di `test-api.js` andrebbero riscritti nella forma `hours`/`roles` per codice.
2. **Un limite per tipo di colonna, passato esplicitamente da ogni chiamante.** Alternativa scartata: un solo limite, o un default. Perché: un solo limite lascerebbe passare un POT fra 1e8 e 1e12 come errore, o una tariffa oltre 1e8 come 500; un default nasconderebbe al prossimo chiamante quale colonna sta proteggendo.
3. **Gli importi JSONB del progetto usano il limite `DECIMAL(10,2)`.** Alternativa scartata: nessun limite (JSONB non va in overflow) o `NUMERIC(14,2)`. Perché: tariffe e PTC del progetto rispecchiano le colonne `DECIMAL(10,2)` della proposta da cui vengono.
4. **B-217 in questo ciclo: arrotondamento alla fonte più una migrazione** (scelta dell'utente). Alternativa scartata: arrotondare sul server, lasciare i dati, o lasciare B-217 fuori. Perché: il server resta rigoroso (i decimali in più si rifiutano, non si arrotondano) e il progetto rumoroso resta salvabile.
5. **Ogni mese si arrotonda da solo; il totale non viene ricompensato sull'ultimo mese.** Alternativa scartata: far assorbire i centesimi all'ultimo mese, come diceva l'opzione presentata in chat. Perché: Derive arrotonda già così e mostra come totale la somma dei mesi arrotondati; il Reforecast calcola il budget residuo dai totali grezzi, non dal phasing. La compensazione aggiungerebbe codice per una differenza di mezzo centesimo al mese.
6. **Forma di PTC e phasing controllata solo dove porta importi.** Alternativa scartata: validare anche le chiavi `YYYYMM` e i campi delle righe PTC. Perché: il brief chiede la validità degli importi; le chiavi oggi sono tutte ben formate, e un controllo in più è un finding a parte.
7. **La migrazione arrotonda solo i progetti EUR, a 2 decimali.** Alternativa scartata: ricavare i decimali di ogni valuta in SQL. Perché: il DB non conosce i decimali di una valuta (vengono da `Intl`), e tutti i progetti di oggi sono EUR; il controllo iniziale fa fallire la migrazione se nel frattempo è comparso rumore in un progetto non EUR.
