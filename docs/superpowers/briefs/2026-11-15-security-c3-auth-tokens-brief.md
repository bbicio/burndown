# Brief — Sicurezza ciclo 3: token di invito/reset e `forgot-password` (S-03, S-04)

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperti: **S-03**, **S-04**.
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato il 2026-11-15. Ordine: 3 di 6.
**Perché due finding insieme:** stesso file (`api/src/routes/auth.js`), stesso flusso e la stessa riga (`UPDATE users SET reset_token`, `:508`); correggerli separatamente toccherebbe due volte gli stessi handler e i test che scrivono quei token.

## Problema

(S-03) I token di invito e di reset sono salvati in chiaro: chi legge la tabella `users` (dump in `backups/`, Adminer, un ruolo DB) possiede link di presa dell'account validi, senza password né 2FA. (S-04) `forgot-password` non ha limiti: permette di inondare di mail un indirizzo e ogni chiamata sostituisce il token pendente, impedendo di fatto il recupero a chi ha già ricevuto un link.

## Comportamento attuale

- Il token (`crypto.randomBytes(32).toString('hex')`, `auth.js:79-90`) è scritto e cercato in chiaro: invito `:410`, `:462`, `:479`; reset `:508`, `:526`, `:543`. Il codice a due passaggi è invece hashato (`T.hashCode`, `:291`).
- `POST /api/auth/forgot-password` (`:495-520`) non usa nessuno dei limiter dichiarati a `:23-30`; per un utente attivo aggiorna `reset_token` e invia la mail.
- `email.toLowerCase()` (`:503`) lancia su un valore non stringa: `{"email": {}}` risponde 500 invece del 200 uniforme.
- Gli stessi difetti di tipo, non nell'audit come finding a sé ma sulle stesse righe: `password.length` (`:476`, `:540`) con `password` non stringa.
- I test scrivono e leggono i token direttamente nel DB: `test-api.js:476` (`UPDATE users SET reset_token = $2`), `:2250-2266` (`AD-ED-12/14` verificano che `invite_token`/`reset_token` diventino `NULL`).

## Comportamento atteso

1. Nel DB non resta nessun token utilizzabile: si conserva solo un'impronta, e l'invito/reset continua a funzionare con il link inviato. (I token hanno 256 bit di entropia: un hash veloce è sufficiente; la scelta esatta è della spec.)
2. `forgot-password` è limitato (per indirizzo e per IP) con risposta indistinguibile dal caso normale, e una raffica non può azzerare di continuo il link già inviato (la regola esatta — es. non rigenerare un token ancora valido emesso da poco — è decisione della spec).
3. Input non stringa su `forgot-password`, `activate`, `reset-password` → risposta di errore controllata (`400` o `200` uniforme per `forgot-password`), mai 500.
4. I token già emessi al momento del rilascio hanno un destino definito (restano validi tramite migrazione dell'impronta, oppure sono invalidati e l'invito si rinvia con «Resend invite»); la scelta è esplicitata dalla spec.

## Vincoli

- **Migrazione SQL numerata** in `api/src/db/migrations/`, applicata a mano. Operazioni sullo stack principale: backup con `scripts/backup-db.sh` prima, **conferma esplicita dell'utente**, mai `-v`/`--volumes` (`CLAUDE.md`, «Infrastructure safety»); verifica preferibilmente su stack isolato (`scripts/test-branch.sh`, `scripts/run-tests.sh`). Il riavvio di `pdash-api` post-merge segue la deroga di `/finish-cycle` Gate 4.
- `docs/db/migrations.md` e `docs/api/` aggiornati dalla procedura di sync-docs.
- Risposte uniformi: nessun cambiamento che renda distinguibile un indirizzo esistente da uno inesistente.
- I test di `test-api.js` che scrivono i token nel DB vanno adattati al nuovo formato, non rimossi.
- Messaggi all'utente in inglese.

## Criteri di accettazione

1. Dopo `POST /invite` e `POST /forgot-password`, la colonna del DB **non** contiene il token inviato nella mail (query di verifica con il token ricevuto da Mailpit/test).
2. Il link di invito e quello di reset funzionano ancora end to end (attivazione e cambio password).
3. 11 richieste consecutive di `forgot-password` dallo stesso indirizzo (o IP) superano la soglia scelta senza inviare altre mail né cambiare il token pendente; la risposta HTTP è la stessa di una richiesta normale.
4. `{"email": {}}`, `{"email": []}`, `{"password": {"length": 99}}` → mai 500.
5. Test esistenti `AD-ED-12`, `AD-ED-14` e il resto di `test-api.js` verdi dopo l'adattamento; test di unità per la funzione di hash.
6. Migrazione applicata e verificata su stack isolato con dati clonati dal principale.

## Scope escluso esplicitamente

- Politica di complessità delle password (oggi solo lunghezza minima 8, `auth.js:476`): non è un finding di questo ciclo.
- Limiti sul resto dell'autenticazione (login, 2FA: già protetti, vedi «Ruled out» dell'audit).
- Header, CSP, errori 500 generici (cicli 5 e 6).

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
