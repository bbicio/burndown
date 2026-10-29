# Spec — valute nei form, ciclo 1: il server valida tariffe e importi, e 0 è una tariffa

**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-10-29-currency-c1-server-rate-validation-brief.md` (Scenario 3, audit-fix, finding M-05, M-04, M-07 di `docs/superpowers/audits/2026-10-29-currency-forms-audit.md`).
Design concordato in chat il 2026-10-29 (una fermata, §6b). Decisione dell'utente su M-04: una tariffa 0 è accettata, salvata come 0 e usata dal budget.

## 1. Scope

- **M-05:** le route che scrivono tariffe e l'importo POT rifiutano con `400 { error, code: 'MONEY_RULE' }`, prima di qualsiasi scrittura, un valore che non è un numero finito ≥ 0 con al massimo i decimali della sua valuta.
- **M-04:** una tariffa 0 nella structure di una versione viene salvata come 0, non come `NULL`, e `/budgets` la usa.
- **M-07:** `POST /api/roles` salva `rateOverrides`, e `master-roles.html` lo invia anche alla creazione. `hourlyRate: 0` resta 0.

Fuori scope: le esclusioni del Brief (formato nei form: cicli 2 e 3; semantica del campo vuoto nella rate card: ciclo 3; B-183: ciclo 4) e gli importi PTC e phasing (§6, decisione 8, riga B-185 in `docs/BACKLOG.md`).

## 2. Il modulo — `api/src/lib/money-rules.js`

Puro, senza accesso al DB, testato con `node:test` in `api/src/lib/money-rules.test.js`.

- **`MONEY_RULE_CODE = 'MONEY_RULE'`.**
- **`amountError(value, currencyCode, label)`** → `null` se il valore è valido, altrimenti un messaggio in inglese che nomina `label`. È valido un valore che:
  - è di tipo `number` (decisione 4) e `Number.isFinite`;
  - è ≥ 0, 0 compreso;
  - non ha più decimali di `currencyDigits(currencyCode)`. Il controllo è `Number(value.toFixed(digits)) === value`, perché la rappresentazione binaria non permetta di contare i caratteri.
- **`overridesError(overrides, label)`** → `null` per `undefined`, `null` o un oggetto semplice i cui valori passano tutti `amountError(v, key, …)`. Altrimenti restituisce il messaggio del primo valore non valido, oppure "must be an object" per un array o un non-oggetto. Le chiavi non sono validate (decisione 7).
- **`currencyDigits(code)`** si sposta da funzione interna a export di `api/src/lib/money-format.js`, con firma `currencyDigits(locale, code)` invariata, così la regola dei decimali ha una definizione sola sul server. Il modulo la chiama con `'en'` come locale, perché i decimali di una valuta non dipendono dal locale. Un codice che `Intl` non riconosce vale 2, come in `js/lib/money.js`.

Messaggio, una forma sola: `` `${label} must be a number ≥ 0 with at most ${digits} decimal(s) for ${code}.` ``

## 3. Le route

Ogni route valida prima di aprire transazioni o scrivere. Una richiesta rifiutata lascia il DB invariato.

| Route | Valore | Valuta | Assente / `null` |
|---|---|---|---|
| `PUT /api/cost-grids/:id/versions/:vId/structure` (`api/src/routes/cost-grids.js`) | `roles[].rate` | `cost_grid_versions.currency`, letta nella stessa query di `locked` (oggi `cost-grids.js` line 682) | ammesso: nessuno snapshot, `rate_override` `NULL` come oggi (decisione 5) |
| `PUT /api/projects/:id/tasks` (`api/src/routes/projects.js`) | `tasks[].resources[].hourlyRate` | `projects.currency` del progetto | `""`, `null` o assente salvato come `0` nel JSON della risorsa (decisione 6) |
| `POST /api/roles`, `PATCH /api/roles/:id` (`api/src/routes/config.js`) | `hourlyRate`; `rateOverrides` | EUR; la chiave | `hourlyRate` assente o `null` → `NULL` (colonna nullable) |
| `PATCH /api/ratecards/:id/entries` | `entries[].hourlyRate`; `entries[].rateOverrides` | EUR; la chiave | `hourlyRate` assente → 400 (colonna `NOT NULL`) |
| `POST /api/pots`, `PATCH /api/pots/:id` (`api/src/routes/pots.js`) | `amount` | EUR | 400 come oggi ("amount is required") |

Il `label` nomina il campo, e dove serve la riga: per esempio `Rate for role "PM"`, `Hourly rate of "HWGDEV - DEVELOPER" on task "Build"`, `POT amount`.

**M-04 (`cost-grids.js` line 719):** `rateByCode[r.roleCode] = parseFloat(r.rate) || null` diventa `rateByCode[r.roleCode] = r.rate` per ogni ruolo con `r.rate != null`, che a quel punto è già un numero validato. Lo 0 arriva così in `task_roles.rate_override` come 0. Le query dei budget (`cost-grids.js` lines 32, 281) non cambiano: `COALESCE(0, …)` è 0. Al ricaricamento `js/api-sync.js` lines 104-107 legge `rate_override` 0 come tariffa custom 0, cioè quello che l'utente ha scritto.

**M-07:**
- `POST /roles` legge `rateOverrides` e lo salva in `rate_overrides`, con `'{}'` se assente.
- `hourlyRate || null` diventa `hourlyRate ?? null`.
- `master-roles.html` line 319 passa `rateOverrides` a `Api.roles.create`, e il push locale alla riga successiva usa lo stesso oggetto invece di `{}`.
- `Api.roles.create` (`js/api.js` line 87) inoltra già tutto il body: `js/api.js` non cambia.

**I POT:** `parseFloat(amount)` sparisce. Il valore validato si usa così com'è, e il `CHECK (amount >= 0)` resta l'ultima difesa, non più la prima.

## 4. Client

L'unica modifica client è quella di M-07 in `master-roles.html`. Gli altri form inviano già numeri, oppure `""` per un campo risorsa svuotato, che il server tollera (decisione 6). La formattazione resta ai cicli 2 e 3.

L'avviso "Missing rate" del cost grid (`costgrid.html` lines 339, 353) continua a comparire anche per uno 0 voluto. Distinguere "0 voluto" da "tariffa mancante" è una questione di visualizzazione, e va segnalata come input al Brief del ciclo 2 (decisione 9).

## 5. Test

- **`api/src/lib/money-rules.test.js`:** `amountError` con 0, 150, 175.5 e 175.55 EUR (validi), 175.555 EUR, -1, `NaN`, `Infinity`, `"150"`, `null`, 1.5 JPY (non validi), 1500 JPY (valido) e un codice sconosciuto (2 decimali). `overridesError` con `undefined`, `{}`, `{ USD: 9999 }`, `{ USD: -1 }`, `{ JPY: 1.5 }`, `[]` e `"x"`.
- **`api/src/lib/money-format.test.js`:** `currencyDigits('en', 'EUR')` vale 2, `currencyDigits('en', 'JPY')` vale 0.
- **`test-api.js`, blocco nuovo `MR-01..`:**
  - per ogni route del §3: un 400 con `code: 'MONEY_RULE'` su un valore negativo e su una stringa, e un `GET` che dopo il rifiuto mostra il valore precedente;
  - la structure con una tariffa 0 su un ruolo con default > 0: `rate_override` è 0 e il fee di `/budgets` per quella versione è 0;
  - la structure di una versione USD con `175.555`: 400;
  - `PUT /tasks` con `hourlyRate: ""`: 200, e la risorsa letta ha `hourlyRate: 0`;
  - `POST /roles` con `rateOverrides: { USD: 120 }` e `hourlyRate: 0`: la lettura restituisce `rate_overrides.USD = 120` e `hourly_rate = 0`;
  - POT `POST` con `amount: -5` e `PATCH` con `amount: "abc"`: 400 con `MONEY_RULE`, non 500.

## 6. Dati esistenti

Misurati il 2026-10-29 con `SELECT` in sola lettura sullo stack principale:
- nessuna tariffa o importo negativo;
- le 6 `rate_override` con decimali sono EUR o USD a 2 decimali;
- le 61 tariffe delle risorse di progetto sono tutte `number`;
- l'unico override di ruolo è `{"USD": 9999}`;
- nessuna versione JPY.

L'autosave di costgrid e il salvataggio di project-config, che rimandano tutto il contenuto, quindi non vengono bloccati da dati già presenti.

## Criteri di accettazione

1. **Modulo** — `api/src/lib/money-rules.js` esiste, ed esporta `MONEY_RULE_CODE`, `amountError` e `overridesError`. `money-rules.test.js` e `money-format.test.js` coprono i casi del §5 e passano.
2. **Rifiuto senza scrittura** — `test-api.js` verifica per ogni route del §3 un 400 `MONEY_RULE` su un valore negativo e su una stringa, con il DB invariato.
3. **Zero è una tariffa** — una structure salvata con una tariffa 0, su un ruolo con default > 0, ha `rate_override` 0, e il fee di `/budgets` per quella versione è 0 (`test-api.js`).
4. **Decimali della valuta** — `175.555` nella structure di una versione USD risponde 400 (`test-api.js`).
5. **Risorsa vuota** — `PUT /api/projects/:id/tasks` con `hourlyRate: ""` risponde 200 e salva 0 (`test-api.js`).
6. **Override alla creazione** — un ruolo creato da `master-roles.html` con un override USD lo mostra dopo un ricaricamento della pagina (manuale) e in `test-api.js` (`POST` poi `GET`).
7. **POT** — un importo negativo o non numerico risponde 400 `MONEY_RULE`, non 500 (`test-api.js`).
8. **Suite** — `npm test`, i test `node:test` di `api/` e `test-api.js` passano.

## Decisioni aperte

1. **Un modulo di regole puro chiamato dalle route.** Alternativa scartata: un middleware che valida il body per percorso. Perché: la valuta va letta dal DB per ogni route, e `project-rules.js` e `dates.js` fanno già così.
2. **Codice nuovo `MONEY_RULE`.** Alternativa scartata: riusare `CURRENCY_RULE`. Perché: `CURRENCY_RULE` riguarda la scelta della valuta della versione, non il valore di un importo.
3. **Troppi decimali vengono rifiutati, non arrotondati.** Alternativa scartata: arrotondare in silenzio ai decimali della valuta. Perché: segue il precedente delle ore vendute ("No automatic rounding", `cost-grids.js` line 687), e dal ciclo 2 `parseMoney` arrotonda già lato client. Una versione JPY con tariffe convertite a 2 decimali non salverebbe fino al ciclo 2: JPY è inattiva e le versioni JPY sono 0.
4. **Solo `number`, niente stringhe numeriche.** Alternativa scartata: accettare anche `"150"`. Perché: ogni client invia già numeri e le tariffe salvate sono numeri, quindi una stringa che arriva oggi è un bug.
5. **Una tariffa assente o `null` resta ammessa nella structure e nei ruoli, e significa "non impostata".** Alternativa scartata: renderla obbligatoria. Perché: `parseFloat` di un `hourly_rate` NULL dà `NaN`, che in JSON diventa `null`. Rifiutarlo bloccherebbe l'autosave.
6. **Nelle risorse di progetto `""`, `null` o un `hourlyRate` assente vengono salvati come 0.** Alternativa scartata: rifiutarli con 400. Perché: `v-model.number` invia `""` quando si svuota il campo, e rifiutarlo bloccherebbe il salvataggio di project-config fino al ciclo 2. Una risorsa non ha un ripiego, quindi vuoto e 0 hanno già lo stesso effetto (`resolveFee` fa `|| 0`).
7. **Le chiavi di `rateOverrides` non vengono validate**: si controlla solo il valore, con i decimali della chiave. Alternativa scartata: ammettere solo i codici presenti in `currencies`. Perché: YAGNI, e un override di una valuta disattivata deve restare salvabile.
8. **PTC e phasing restano fuori** (`tasks.ptc` nella structure, `PATCH /api/projects/:id/ptc` e `/phasing`). Alternativa scartata: validarli in questo ciclo. Perché: è un finding che l'audit non aveva, e lo Scenario 3 lo isola. Diventa la riga B-185 di `docs/BACKLOG.md`.
9. **"Missing rate" resta visibile anche per uno 0 voluto.** Alternativa scartata: cambiare l'avviso qui. Perché: è visualizzazione, che appartiene al ciclo 2, e va segnalata come input al suo Brief.
