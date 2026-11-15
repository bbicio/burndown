# Token di invito/reset hashati e `forgot-password` limitato (S-03, S-04) — design spec

**Date:** 2026-11-15
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c3-auth-tokens-brief.md`
**Scenario:** 3 (correzione di divergenza), finding S-03 e S-04 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

Nel DB resta solo l'impronta sha256 dei token di invito e di reset; il token in chiaro esiste nella mail e in memoria. `forgot-password` è limitato per indirizzo e per IP, non ruota un reset appena emesso, e risponde sempre `200 {ok:true}`. Gli input non stringa di `forgot-password`, `activate` e `reset-password` non producono mai un 500.

## 1. Fatti verificati

- `token48h()`/`token2h()` (`api/src/routes/auth.js:106-116`) generano `crypto.randomBytes(32).toString('hex')`. Il token è scritto e cercato in chiaro: invito `:410`, `:443`, `:462`, `:479`; reset `:508`, `:526`, `:543`.
- Le colonne dei token sono usate anche da `api/src/routes/users.js:143-144`, `api/src/services/users.js:15-17`, `api/src/create-admin.js:71`.
- `hashToken` (sha256 hex) esiste già in `api/src/lib/two-step.js:23`.
- `createLimiter` (`api/src/lib/rate-limit.js`) è in memoria; `trust proxy` è 1 (`api/src/index.js:33`), quindi `req.ip` è l'IP del client.
- `forgot-password` non usa nessun limiter e chiama `email.toLowerCase()` senza controllare il tipo; `activate` e `reset-password` chiamano `password.length` senza controllarlo.
- `test-api.js` scrive e legge i token nel DB: `TS-21` (`:487`), `AD-ED-12/14` (`:2261-2277`).

## 2. Migrazione `036`

- Aggiunge `invite_token_hash` e `reset_token_hash` (`VARCHAR(64)`), le popola con `encode(sha256(convert_to(<token>, 'UTF8')), 'hex')` e poi elimina `invite_token` e `reset_token`.
- Tutto in un blocco `DO` che controlla `information_schema.columns`: rieseguibile senza effetti. Le colonne sono rinominate, non riscritte in place, perché token e impronta hanno la stessa forma (64 hex) e una seconda esecuzione hasherebbe due volte.
- I token già emessi restano validi: la migrazione ne copia l'impronta.
- Applicata a mano. Stack principale: `scripts/backup-db.sh` prima, conferma esplicita dell'utente, mai `-v`/`--volumes`. Verifica su `scripts/test-branch.sh` con dati clonati dal principale; `scripts/test-branch.sh up` non applica le nuove migrazioni da sé, quindi si applica a mano anche lì.

## 3. Codice

- **Hash.** I token si scrivono come `hashToken(tok)` e si cercano per `hashToken(token)`. Il token in chiaro non tocca il DB.
- **File toccati:** `routes/auth.js` (invite, resend-invite, `GET invite`, activate, forgot-password, `GET reset`, reset-password), `routes/users.js`, `services/users.js`, `create-admin.js` (nuovi nomi di colonna).
- **Input non stringa.** Un helper `isStr` in una `api/src/lib/` pura, con `node:test`. `activate` e `reset-password`: `400` se `token`, `password` o `passwordConfirm` non sono stringhe. `forgot-password`: `200 {ok:true}`.

## 4. `forgot-password`

Ordine fisso; ogni uscita risponde `200 {ok:true}`.

1. `email` non stringa o vuota → 200.
2. Slot per IP (`req.ip`): 20 per ora.
3. Slot per indirizzo, normalizzato con trim e lowercase: 5 per ora. Passa prima della query sul DB, così indirizzi esistenti e inesistenti sono trattati allo stesso modo.
4. Oltre una soglia → 200, nessuna mail, nessun cambio di token.
5. Utente attivo con un reset emesso da meno di 2 minuti → 200, nessuna mail, nessun cambio di token. L'età si ricava da `reset_expires` (scadenza meno 2 h); la funzione che la calcola è pura e testata, senza nuove colonne.
6. Altrimenti: nuovo token, scrittura dell'impronta, mail come oggi (un invio fallito non cambia la risposta).

## 5. Test

- `test-api.js`: `TS-21` scrive l'impronta del token di prova; `AD-ED-12/14` leggono le colonne `*_hash`. Nessun test rimosso.
- Nuovi: il token ricevuto da Mailpit non è nella colonna e la sua impronta sì, e invito e reset funzionano end to end; 11 richieste consecutive di `forgot-password` oltre la soglia senza altre mail né cambio di token e con risposta identica; `{"email":{}}`, `{"email":[]}`, `{"password":{"length":99}}` mai 500.
- `node:test`: `isStr` e il calcolo dell'età del reset. L'hash è già coperto da `two-step.test.js`.
- `/security-review` sul branch dopo i test verdi e prima di `/finish-cycle`: un task del Piano, non eseguito da `/finish-cycle`.

## 6. Fuori dal ciclo

Complessità delle password, login/2FA, header, CSP, errori 500 generici. Un finding nuovo si isola come Brief a sé.

## Decisioni aperte

1. **Colonne `*_token_hash` rinominate con migrazione rieseguibile.** Alternativa scartata: hashare in place nelle colonne esistenti. Perché: token e impronta hanno la stessa forma, quindi una seconda esecuzione corromperebbe i link pendenti.
2. **I token già emessi sono migrati, non invalidati.** Alternativa scartata: invalidarli e rinviare gli inviti. Perché: `sha256` nativo di PG16 lo rende gratuito e non rompe gli inviti a 48 h in volo.
3. **sha256 veloce, riuso di `hashToken`.** Alternativa scartata: bcrypt o HMAC con secret. Perché: 256 bit di entropia rendono inutile un hash lento, e un HMAC legherebbe i link pendenti a `JWT_SECRET`.
4. **Soglie `forgot-password`: 5/ora per indirizzo, 20/ora per IP, cooldown di 2 minuti sul reset già emesso.** Alternativa scartata: soglie più strette e nessun cooldown. Perché: 5/ora lascia margine a un utente reale, 20/ora a una NAT, e i 2 minuti impediscono di azzerare il link a raffica. Limite residuo accettato: un attaccante può far ruotare il link al massimo una volta ogni 2 minuti e 5 volte all'ora per indirizzo.
5. **Oltre soglia si risponde 200 uniforme, non 429.** Alternativa scartata: 429 con `retryIn`, come per il login. Perché: il Brief chiede una risposta indistinguibile dal caso normale.
6. **Input non stringa: 400 su `activate`/`reset-password`, 200 su `forgot-password`.** Alternativa scartata: 400 ovunque. Perché: `forgot-password` deve restare uniforme per non rivelare l'esistenza degli indirizzi.

## Criteri di accettazione

1. **Nessun token in chiaro** — dopo `POST /invite` e `POST /forgot-password`, le colonne `*_hash` non contengono il token ricevuto nella mail e contengono il suo sha256.
2. **Link ancora funzionanti** — attivazione da invito e cambio password da reset riescono end to end con il token della mail.
3. **Limiti di `forgot-password`** — 11 richieste consecutive dallo stesso indirizzo (o IP) superano la soglia senza altre mail né cambio di token pendente, con la stessa risposta HTTP di una richiesta normale.
4. **Input non stringa** — `{"email":{}}`, `{"email":[]}`, `{"password":{"length":99}}` non producono mai 500.
5. **Test** — `AD-ED-12`, `AD-ED-14` e il resto di `test-api.js` verdi dopo l'adattamento; test di unità per `isStr` e per l'età del reset.
6. **Migrazione** — applicata e verificata su stack isolato con dati clonati dal principale; rieseguirla non cambia nulla e i token pendenti migrati funzionano.
7. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati trattati come Brief a sé.
