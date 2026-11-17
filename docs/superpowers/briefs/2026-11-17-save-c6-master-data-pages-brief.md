# Brief — Contratto di salvataggio, ciclo 6: pagine dei master data sul contratto

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperti: **SY-13**, **SY-16** (pagine diverse da ruoli e ratecard), **SY-17**, **SY-15** (team, attribute-lists), più il lato client di **SY-20** (team).
**Brief started:** 2026-11-17 17:32
**Origine:** `docs/superpowers/audits/2026-11-17-save-sync-audit.md`. Raggruppamento confermato dall'utente il 2026-11-17. Presuppone il ciclo 1 (helper lato client) e, per team, il ciclo 5.
**Criterio di raggruppamento:** stesse pagine (master-clients, master-pipelines, master-currencies, team, attribute-lists) e stessa migrazione verso l'helper lato client.
**Natura:** divergenza di correttezza. Le entità di queste pagine, fuori da ruoli e ratecard, non entrano nel registro (decisione dell'utente).
**Classe di rischio:** high-risk (money: POT e valute; route API con nuove regole lato server).
**Security surface:** yes — team e attribute-lists passano da `fetch` diretto ad `apiFetch` (redirect su 401); regole spostate dal client al server sotto `requireAdmin`.

## Problema

Alcuni salvataggi riusciti vengono mostrati come falliti, perché la ricarica che segue il salvataggio fallisce nello stesso blocco. Dopo il salvataggio, lo stato locale viene ricostruito dai valori della pagina invece che dalla risposta del server. Alcune regole (nomi duplicati, cancellazione di un anno che ha ancora POT) le controlla solo il browser, su liste ormai vecchie. Team e attribute-lists usano `fetch` diretto, quindi non hanno redirect su 401, overlay né timeout.

## Comportamento attuale

- **SY-13.**
  - POT: `await Api.pots.create(body); this.pots = await Api.pots.list(…)` nello stesso `try` (`js/pages/master-pipelines.js:447-449`). Se la lista fallisce, un nuovo tentativo dà 409 "A POT already exists".
  - Valute: il tasso viene salvato, poi `loadAll()` fallisce e la pagina dice "Failed to load" (`js/pages/master-currencies.js:153`).
- **SY-16.**
  - Rinomina di un cliente: copia il proprio valore (`js/pages/master-clients.js:251`).
  - Risorse: invia sempre sei campi presi dal drawer (`js/pages/team.js:512-532`).
- **SY-17.**
  - `PATCH /clients/:id` non controlla i duplicati (`api/src/routes/config.js:35-46`); il controllo esiste solo in `master-clients.js:246`.
  - I nomi dei gruppi di clienti non sono controllati lato server (`api/src/routes/client-groups.js:34-44`).
  - `deleteBlock` per un anno con POT esiste solo nel client (`master-pipelines.js:356-362`), mentre il server rifiuta solo se l'anno è usato da proposte (`api/src/routes/pipeline-years.js:94-112`).
- **SY-15.**
  - `team.js` usa `fetch` diretto, e `await res.json()` su un 5xx non JSON diventa "Network error." anche se la scrittura è stata salvata (`:525`).
  - `attribute-lists.js:133-145` ha un proprio wrapper che non lancia mai eccezioni.
- **SY-20 (client).** Team non distingue "alias creato" da "alias già esistente e ripuntato".

## Comportamento atteso

1. Ogni scrittura di queste pagine passa dall'helper del ciclo 1, e l'esito distingue "la scrittura è fallita" da "la ricarica è fallita". La seconda dice "Saved, but the list couldn't be reloaded": è lo schema che attribute-lists e team già seguono.
2. Dopo il salvataggio, lo stato locale prende i valori restituiti dal server.
3. Le regole di unicità e di cancellazione citate in SY-17 sono applicate dal server, con un rifiuto e un `code`; il client le mostra.
4. team e attribute-lists non usano più `fetch` diretto per scrivere: ottengono redirect su 401, overlay e timeout, e una risposta non JSON diventa "esito sconosciuto", non "Network error".
5. Team mostra l'esito dell'alias secondo la scelta del ciclo 5.

## Vincoli

- Nessuna regressione degli schemi che l'audit segna come corretti: spostamento del cliente tra gruppi con rollback e ricarica, banner di attribute-lists che dice se la ricarica è riuscita.
- Una regola nuova lato server su dati esistenti (per esempio nomi già duplicati nel DB) non deve rompere la lettura né il salvataggio di record non toccati (scelta aperta 1).
- Nessun build step; cache-busting dei file modificati.
- Testi utente in inglese.

## Criteri di accettazione

- [ ] Una creazione di POT riuscita con la ricarica fallita mostra "saved, couldn't reload" e non permette di ricreare lo stesso POT credendolo mancante.
- [ ] Un tasso salvato con la ricarica fallita non mostra "Failed to load" come esito del salvataggio.
- [ ] La rinomina di un cliente in un nome già usato è rifiutata dal server (`test-api.js`); lo stesso vale per i gruppi.
- [ ] Cancellare un anno con POT è rifiutato dal server (`test-api.js`).
- [ ] In team e attribute-lists, una risposta 401 porta al login; un 502 HTML non viene mostrato come "Network error" di una scrittura salvata.
- [ ] Dopo un salvataggio, i valori mostrati sono quelli del server (per esempio il codice normalizzato).
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano.
- [ ] Documentazione: `docs/pages/config.md`, `docs/pages/team.md`, `docs/pages/attribute-lists.md`, `docs/api/config.md`, `docs/api/resources.md`.
- [ ] Regole del progetto: master-clients, master-pipelines, master-currencies, team, attribute-lists e `js/clients.js` sono tolti dalla lista delle eccezioni del guard; il guard passa.
- [ ] Step di backlog: le voci aperte di `docs/BACKLOG.md` su queste pagine e route sono rilette; quelle superate vengono chiuse al Gate 5 con il controllo eseguito.

## Scope escluso

- Ruoli e ratecard (ciclo 1).
- Atomicità lato server di POT, valute e alias (ciclo 5).
- Registro delle modifiche per clienti, gruppi, anni, POT, valute, risorse, liste.
- Il controllo di versione (409) per queste entità, salvo che `/brainstorming` lo ritenga necessario per una di esse (scelta aperta 2).

## Scelte aperte per /brainstorming

1. Come trattare i duplicati già presenti nel DB quando si introduce la regola lato server: indice unico con pulizia preventiva, oppure solo un controllo nella route.
2. Se qualche entità di queste pagine (per esempio i POT, che sono importi) merita anche il controllo di versione del ciclo 1.
3. Per attribute-lists: se il suo wrapper diventa l'helper del ciclo 1 o viene sostituito.

## Finding nuovi

Ogni finding nuovo che emerge in `/brainstorming` o in esecuzione va isolato e proposto come Brief futuro, mai incorporato in questo ciclo (PROCESS.md, Scenario 3).
