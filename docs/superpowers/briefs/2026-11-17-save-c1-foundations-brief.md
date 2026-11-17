# Brief — Contratto di salvataggio, ciclo 1: fondamenta + pilota su ruoli e ratecard

**Tipo:** evoluzione (Scenario 2) su base audit. Finding coperti: **SY-01**, **SY-15** (parte helper), **SY-16** (ruoli e ratecard), più il requisito nuovo del registro delle modifiche (decisioni dell'utente, 2026-11-17).
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento in sette cicli confermato dall'utente il 2026-11-17. Primo della serie; i cicli 2-7 lo presuppongono.
**Criterio di raggruppamento:** causa comune di quasi tutti i finding. Nessuna scrittura porta un riferimento a ciò che il client ha letto, e non esiste un punto unico di scrittura, né sul server né nel client. Il pilota su ruoli e ratecard prova il contratto dall'inizio alla fine su due entità piccole, prima di toccare costgrid.
**Natura — perché è in forma Scenario 2:** non è una divergenza da riallineare. Manca un contratto, e la sua forma è una decisione di design. Il Brief propone alternative; `/brainstorming` sceglie.
**Classe di rischio:** high-risk (migrazione DB; money: tariffe di ruoli e ratecard; file condivisi `js/api.js` e helper caricati da più pagine).
**Security surface:** yes — nuove scritture lato server sotto `requireAuth`/`requireAdmin`; il registro conserva l'id dell'utente che modifica.

## Problema

Oggi ogni salvataggio sovrascrive l'ultimo valore senza sapere su cosa si basava il client. Ogni pagina gestisce l'esito a modo suo, e nessuno sa chi ha cambiato cosa. Serve un contratto unico, che i cicli successivi adottano pagina per pagina:
- lettura con versione;
- scrittura con versione di partenza;
- conflitto esplicito;
- risposta del server adottata dal client;
- fotografia nel registro.

## Comportamento attuale

- **SY-01.** L'unico controllo ottimistico è `PATCH /api/ratecards/:id/entries`:
  - `api/src/routes/config.js:438-445`: `SELECT … version … FOR UPDATE`, confronto con `req.body.version`, poi `409 { error, code: 'RATECARD_STALE' }`;
  - `:469-471`: incrementa la versione e la restituisce;
  - `035_ratecard_version.sql` ha introdotto la colonna (B-209).

  Le altre scritture sono last-writer-wins. Per i ruoli, `PATCH /api/roles/:id` (`config.js:262`) scrive tutti i campi ricevuti, compresa la mappa intera `rate_overrides`.
- **Client della ratecard** (`js/pages/master-clients.js:510,531,548`): invia `{ version, entries }`. Su 409 mostra `e.message` e non distingue `err.data.code`, quindi niente pulsante di ricarica. Dopo il successo ricostruisce i valori "stored" dai propri input (`:533-545`).
- **Client dei ruoli** (`js/pages/master-roles.js:281-283`): invia sempre `label, code, hourlyRate, rateOverrides` presi dal form. Dopo il successo copia i propri valori e scarta il `RETURNING *` del server.
- **SY-15.** Coesistono almeno cinque forme di esito:
  - `apiFetch` lancia un `Error` con `err.data`. Su una risposta d'errore non JSON lancia un `SyntaxError` senza `data` (`js/api.js:89`);
  - `boolean`;
  - `{ok, failed}`;
  - i wrapper che non lanciano mai `{ok, status, data}` (`attribute-lists.js:133-145`, `profile-jobs.js:90-106`);
  - `fetch` diretto ad hoc.
- **Registro:** esiste solo per POT (`pot_history`), cambi valuta (`currency_rates`) e versioni dei T&C (`terms_versions`). Per cost grid, progetti, programmi, ruoli e ratecard non c'è traccia.

## Comportamento atteso

1. **Helper di scrittura lato server**, un modulo in `api/src/lib/` o `api/src/services/` con test. In una sola transazione:
   - blocca la riga;
   - confronta la versione attesa con quella salvata e, se non coincidono, risponde 409 con un `code` comune;
   - scrive;
   - incrementa la versione;
   - inserisce la fotografia nel registro;
   - restituisce l'entità salvata con la nuova versione.
2. **Versione su ogni entità registrata:** cost grid (testata e versione), progetti, programmi, ruoli, ratecard (che la ha già). Le letture (`GET`) la restituiscono. In questo ciclo l'helper si usa solo per ruoli e ratecard; le altre entità ricevono la colonna e lo adottano nei cicli 2-3.
3. **Registro delle modifiche** (decisioni dell'utente):
   - una tabella unica;
   - fotografia completa dell'entità dopo la modifica, compresa la struttura della cost grid quando la si salva;
   - nessuna scadenza, il registro si tiene per sempre;
   - nessuna interfaccia: si consulta da Adminer o con una query.

   Ogni riga riporta: tipo ed id dell'entità, versione, utente, momento, azione (creazione, modifica, eliminazione o azione specifica).
4. **Helper di scrittura lato client**, in `js/lib/` con il ponte `window.`, sopra `apiFetch`. Restituisce un esito unico che distingue:
   - successo, con i dati del server;
   - conflitto (409 con il codice comune);
   - rifiuto di regola (`*_RULE`, con il messaggio);
   - errore;
   - esito sconosciuto: timeout, risposta non JSON, rete.

   Non lancia eccezioni per questi casi. Gestisce la risposta d'errore non JSON. Mantiene redirect su 401, overlay e timeout.
5. **Pilota — `master-roles`:** il salvataggio invia la versione e solo i campi cambiati (o l'entità con la versione: scelta aperta 3). Su successo adotta la risposta del server. Su conflitto spiega il motivo e offre la ricarica.
6. **Pilota — ratecard** (`master-clients`): la ratecard usa l'helper. Su `RATECARD_STALE` (o sul codice comune che lo sostituisce) offre la ricarica. Dopo il successo adotta le voci restituite dal server.
7. **Regole del progetto** (decisione dell'utente, 2026-11-17).
   - CLAUDE.md riceve una sezione nuova sul contratto di salvataggio, nello stile di "Money formatting and parsing" e "Dates". La sezione dice che:
     - ogni route che scrive un'entità registrata passa dall'helper lato server (transazione, versione, registro);
     - nessuna pagina scrive con `fetch` diretto né con `.catch(() => {})` su una scrittura;
     - una pagina nuova scrive solo tramite l'helper lato client.
   - Il paragrafo "Data strategy (in-memory cache)", che oggi prescrive il fire-and-forget, rimanda alla sezione nuova e dichiara che vale ancora solo per i file non migrati.
8. **Guard test** della regola, sullo schema di `js/lib/money-guard.test.js`/`js/lib/dates-guard.test.js`. Fallisce in due casi:
   - una route che scrive un'entità registrata non passa dall'helper lato server;
   - un file in `js/` scrive senza l'helper lato client.

   Fa eccezione una **lista esplicita di file non ancora migrati**: i cicli 2-6 la riducono e il ciclo 7 la svuota. Un file tolto dalla lista non può rientrarci senza far fallire il guard.

## Vincoli

- Nessun build step e nessuna riscrittura: si aggiungono i moduli e si migrano solo le due pagine pilota.
- Il server resta l'unica autorità: nessun controllo di versione fatto solo nel client.
- Migrazione numerata (successiva a `036_token_hashes.sql`), applicata a mano secondo CLAUDE.md. Prima di applicarla al main stack: `scripts/backup-db.sh` e conferma dell'utente (Infrastructure safety). Le verifiche si fanno su `scripts/test-branch.sh`/`scripts/run-tests.sh`.
- Il registro va scritto nella stessa transazione della scrittura. Un fallimento del registro annulla la scrittura.
- Money: le tariffe continuano a passare da `amountError`/`overridesError` (`api/src/lib/money-rules.js`) prima di ogni scrittura.
- Cache-busting: ogni `?v=N` dei file modificati va aggiornato in tutte le pagine che li caricano.
- Testi utente in inglese.

## Criteri di accettazione

- [ ] L'helper lato server ha test `node:test` per: versione corretta → salva, incrementa e registra; versione vecchia → 409 senza scrittura né riga nel registro; errore nel registro → nessuna scrittura.
- [ ] La migrazione aggiunge la versione alle entità del punto 2 e crea il registro; `GET` di ruoli e ratecard restituisce la versione.
- [ ] Due salvataggi dello stesso ruolo dalla stessa versione: il primo riesce, il secondo riceve 409 e il ruolo resta quello del primo. Lo verifica `test-api.js`.
- [ ] Ogni salvataggio riuscito di un ruolo o di una ratecard lascia una riga nel registro con la fotografia completa, l'utente e la versione nuova (`test-api.js`).
- [ ] L'helper lato client ha test vitest per ciascuno dei cinque esiti, compresa una risposta d'errore HTML (502) e un timeout.
- [ ] `master-roles` e la ratecard mostrano il conflitto con un'azione di ricarica e, dopo il successo, mostrano i valori restituiti dal server (verificato a mano su branch stack, con le istruzioni nella checklist del Gate 2).
- [ ] CLAUDE.md contiene la sezione del contratto di salvataggio. "Data strategy" rimanda a essa e limita il fire-and-forget ai file in lista. `scripts/claude-md-guard.test.js` passa.
- [ ] Il guard test esiste e contiene la lista delle eccezioni, che comprende tutti i file non migrati in questo ciclo e non `master-roles`. Fallisce, con un test che lo dimostra, su una scrittura con `fetch` diretto in un file fuori dalla lista e su una route di un'entità registrata che non passa dall'helper.
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` che toccano i file del ciclo sono rilette; quelle superate vengono chiuse al Gate 5, con il controllo eseguito scritto in `Verified how`.

## Scope escluso

- Migrazione di tutte le altre pagine (cicli 2-7).
- Interfaccia per consultare il registro.
- Registro per entità diverse da cost grid, progetti, programmi, ruoli, ratecard.
- Rimozione degli store globali (`config.projects`, `_cgStore`).
- I punti "Out of scope / roadmap notes" del report (broadcast accidentale e gli altri).

## Scelte aperte per /brainstorming

1. **Token di versione:** intero incrementale (come le ratecard) oppure `updated_at`. Per la cost grid: una versione sulla testata e una per ogni versione della proposta, oppure una sola.
2. **Come il client manda la versione:** campo nel body (come le ratecard) oppure header `If-Match`.
3. **Payload del pilota:** solo i campi cambiati, oppure l'entità intera con la versione (il controllo di versione rende sicuri entrambi).
4. **Forma del registro:** colonne (`entity_type`, `entity_id`, `version`, `user_id`, `at`, `action`, `snapshot jsonb`). Valutare se serve un indice per entità e se registrare anche la fotografia prima della modifica.
5. **Codice di conflitto comune:** un codice generico (per esempio `STALE`) oppure uno per entità, e il destino di `RATECARD_STALE`.
6. **Posizione e nome dell'helper lato client**, e se `apiFetch` resta come primitiva sotto di esso.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
