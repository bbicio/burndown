# Brief — Contratto di salvataggio, ciclo 5: atomicità delle route fuori dalle entità critiche

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperti: **SY-12** (le route non coperte dai cicli 1-3) e **SY-20** (`rescanAll` dentro la risposta e upsert incondizionato degli alias).
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Indipendente dai cicli 2-4; presuppone il ciclo 1 solo se si sceglie di riusare il suo helper transazionale.
**Criterio di raggruppamento:** causa comune lato server. Le scritture composte da più istruzioni usano `query()` senza `BEGIN`, oppure eseguono un passo successivo dentro il percorso della risposta.
**Natura:** divergenza di correttezza. Con queste route l'esito confermato non può essere onesto, perché il server può rispondere "errore" dopo aver già scritto una parte dei dati.
**Classe di rischio:** high-risk (money: POT e tassi di cambio; operazioni che cancellano dati: actuals).
**Security surface:** no.

## Problema

Alcune scritture sono composte da più istruzioni senza transazione. Un errore tra un'istruzione e l'altra lascia dati a metà: per esempio actuals cancellate e non reinserite, oppure un POT cambiato senza storico. In altri casi il server risponde "errore" per una scrittura già salvata.

## Comportamento attuale

- **Upload timesheet:** `DELETE FROM timesheets WHERE project_code` e poi `INSERT`, come query separate (`api/src/routes/timesheets.js:224-229`).
- **Delete timesheet:** tre istruzioni senza transazione (`timesheets.js:259-263`).
- **POT:** `UPDATE pots`, poi `INSERT pot_history`, senza transazione e con `old_value` letto prima (`api/src/routes/pots.js:405-414`).
- **Tasso di valuta:** aggiornamento più storico (`api/src/routes/currencies.js:82-89`).
- **Publish dei T&C:** tre query separate (`api/src/routes/app-settings.js:122-155`). Due publish concorrenti collidono su `terms_versions.version UNIQUE` con un 500.
- **Broadcast delle notifiche:** inserimenti per utente in un loop (`api/src/routes/notifications.js`).
- **Alias e risorse:** l'upsert su `alias_normalized` è incondizionato, poi c'è `await rescanAll()` (`api/src/routes/resources.js:92-104` e `:117,220,234`). Se `rescanAll` fallisce la risposta è 500 per un alias già salvato; un "Assign" partito da una pagina vecchia ripunta un nome appena risolto da un altro admin.

## Comportamento atteso

1. Ogni scrittura composta riesce tutta o niente, in una transazione con un client dedicato (`pool.connect()` più `BEGIN`/`COMMIT`/`ROLLBACK`).
2. Lo storico di POT e valute viene scritto nella stessa transazione, con il valore vecchio letto sotto lock.
3. Due publish concorrenti dei T&C: uno riesce, l'altro riceve un rifiuto esplicito (non un 500).
4. Un passo successivo che non fa parte della scrittura, come `rescanAll`, non trasforma in errore una scrittura riuscita (scelta aperta 1).
5. L'assegnazione di un alias che nel frattempo è già stato risolto in altro modo viene rifiutata o segnalata, non sovrascritta in silenzio (scelta aperta 2).

## Vincoli

- Nessun cambio dei contratti delle route oltre agli esiti nuovi descritti; i client attuali continuano a funzionare.
- Le regole di validazione esistenti restano: `MONEY_RULE`, il controllo delle incoerenze del file xlsx, il limite di dimensione.
- La sanitizzazione dei T&C (ciclo sicurezza 7) resta invariata.
- Prima di qualsiasi verifica che tocchi il main stack: `scripts/backup-db.sh` e conferma dell'utente; le prove si fanno su `scripts/run-tests.sh`.

## Criteri di accettazione

- [ ] Per ciascuna route elencata, un test che simula un errore dopo la prima istruzione verifica che il DB resti allo stato precedente (`test-api.js` o un test backend con un errore iniettato).
- [ ] Due publish concorrenti dei T&C: una sola versione nuova e un rifiuto esplicito.
- [ ] Un `rescanAll` fallito non fa rispondere 500 a un alias salvato (o vale la scelta 1).
- [ ] Un alias risolto da un altro admin non viene ripuntato in silenzio (o vale la scelta 2).
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano.
- [ ] Documentazione: `docs/api/timesheets.md`, `docs/api/currencies.md`, `docs/api/app-settings.md`, `docs/api/resources.md`, `docs/api/notifications.md` per le parti che cambiano.
- [ ] Regole del progetto: se `/brainstorming` estende il guard alle scritture composte lato server (transazione obbligatoria), le route di questo ciclo ne fanno parte; in ogni caso CLAUDE.md dice che una scrittura composta lato server sta in una transazione.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` su queste route sono rilette; quelle superate vengono chiuse al Gate 5 con il controllo eseguito.

## Scope escluso

- Le route delle entità registrate (cost grid, progetti, programmi, ruoli, ratecard), che sono dei cicli 1-3.
- La correzione del broadcast accidentale nel modale delle notifiche (nota fuori scope del report: voce di backlog separata).
- Le modifiche lato client alle pagine che usano queste route (cicli 6-7).

## Scelte aperte per /brainstorming

1. `rescanAll`: in background dopo la risposta, oppure dentro la transazione, oppure con un esito che la risposta riporta senza fallire.
2. Alias: rifiuto (409) quando l'alias è già risolto diversamente da ciò che il client ha visto, oppure un esito "already resolved" con il valore attuale.
3. Se riusare l'helper transazionale del ciclo 1 (senza registro) oppure un helper `withTransaction` più semplice.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
