# Errori 500 generici e cookie `Secure` per default (S-08, S-07) — design spec

**Date:** 2026-11-16
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c6-hardening-brief.md`
**Scenario:** 3 (audit-fix), finding S-08 e S-07 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

Un errore inatteso dell'API risponde al client con un messaggio generico e lascia il dettaglio nel log; il cookie di sessione è `Secure` salvo un `NODE_ENV=development` esplicito. Lo scope è ridotto rispetto al Brief per decisione dell'utente (Decisioni aperte, voce 1).

## 1. Fatti verificati

- L'handler globale è `api/src/index.js:90-93`: `res.status(err.status || 500).json({ error: err.message || 'Internal server error' })`, preceduto da `console.error(err)`.
- `DATE_RULE`, `MONEY_RULE` e `PROJECT_RULE` non passano dall'handler: le route rispondono direttamente con `res.status(400)`.
- All'handler arrivano con uno `status` 4xx gli errori di body-parser (400 JSON malformato, 413 corpo troppo grande) e il `fail()` di `api/src/services/planning-assistant.js:17`, che `routes/planning-assistant.js:25` gestisce comunque da sé.
- Un `MulterError` (es. `File too large`, limite in `api/src/routes/timesheets.js:15`) non ha `status`: oggi risponde 500 con il suo messaggio.
- Percorsi che oggi espongono un testo di PostgreSQL: `userId` non validato in `api/src/routes/cost-grids.js` (share) e `api/src/routes/notifications.js` (invio).
- `secure: process.env.NODE_ENV === 'production'` in `api/src/services/jwt.js:19`, `api/src/routes/auth.js:44` e `:54`. `docker-compose.yml` imposta `NODE_ENV: ${NODE_ENV:-development}`, quindi lo stack di sviluppo, quello di branch e quello di `run-tests.sh` girano in `development`.
- `./api/src` è montato nel container `api`: il ciclo non cambia dipendenze né `Dockerfile`, quindi basta un riavvio.

## 2. Risposta agli errori (S-08)

Nuovo modulo puro `api/src/lib/error-response.js`, `errorResponse(err)` → `{ status, body }`:

- `err.status` intero tra 400 e 499: `{ status: err.status, body: { error: err.message } }`, con `code` se `err.code` è una stringa.
- `err` è un `MulterError` (`err.name === 'MulterError'`): `{ status: 400, body: { error: err.message, code: err.code } }`.
- ogni altro caso: `{ status: 500, body: { error: 'Internal server error' } }`.

`index.js` mantiene `console.error(err)` e risponde con `errorResponse(err)`. Nessun messaggio di un 5xx raggiunge il client.

## 3. Cookie `Secure` (S-07)

`cookieSecure()` in `api/src/services/jwt.js`, esportata: `process.env.NODE_ENV !== 'development'`, letta a ogni chiamata. I tre punti di §1 la usano al posto del confronto con `'production'`.

## 4. Test

- `api/src/lib/error-response.test.js` (`node:test`): 4xx conserva messaggio e `code`; `MulterError` → 400; errore senza `status`, con `status` 500 o con `status` non intero → 500 generico; errore con il testo di un errore PostgreSQL → il testo non compare nel corpo.
- Test `node:test` di `cookieSecure()`: `development` → `false`; `production`, `test` e variabile assente → `true`.
- `test-api.js`: share con `userId` non UUID → 500 con `{ error: 'Internal server error' }`; una richiesta che riceve un `DATE_RULE` conserva messaggio e `code`.
- Prima della modifica una ricerca in `js/`, nelle pagine `*.html` e in `test-api.js` conferma che nessun test né pagina dipende dal testo di un 500.

## 5. Stack principale

Al Gate 4, `docker compose restart api` (la deroga di `CLAUDE.md`, mai `down`, mai `-v`). Niente rebuild, niente migrazioni.

## 6. Voci del Brief escluse e follow-up

- S-05 (porte di PostgreSQL/Adminer, Adminer `latest`) e S-10 (container root, profilo `test` senza guardia) sono esclusi per decisione dell'utente: il `docker-compose.yml` del repo non è quello di produzione, rischio nullo in produzione. Il report del ciclo li registra come tali.
- In `docs/BACKLOG.md` due righe nuove: `APP_URL` senza default in `api/src/routes/cost-grids.js:1023`/`:1035` (link rotto nell'email e nella notifica di condivisione con la variabile assente) e gli `userId` non validati di share e notifiche (500 invece di 400).
- B-497 parziale (`'unsafe-inline'` fuori da `script-src` con hash, niente handler inline) diventa il ciclo 7 con un Brief proprio, da aprire con `/feature-brief` dopo questo ciclo. `'unsafe-eval'` resta, perché toglierlo richiede un build step. B-496 resta aperto in BACKLOG finché la topologia Azure non è nota.

## 7. Security review

`/security-review` sul branch, dopo i test verdi e prima di `/finish-cycle`. Un finding nuovo è proposto come Brief a sé, salvo diversa decisione dell'utente.

## Criteri di accettazione

1. **500 generico** — uno share con `userId` non UUID risponde 500 con `{ error: 'Internal server error' }`; il log di `pdash-api` contiene l'errore originale di PostgreSQL.
2. **4xx conservato** — un `DATE_RULE` e un JSON malformato conservano status, messaggio e (dove c'è) `code`; un file oltre il limite di multer risponde 400 con il messaggio di multer.
3. **Cookie** — `cookieSecure()` è `false` solo con `NODE_ENV=development`; i tre `res.cookie` la usano (`grep -n "NODE_ENV === 'production'" api/src` → nessun risultato).
4. **Test** — `api/src/lib/error-response.test.js` e il test di `cookieSecure()` verdi; `scripts/run-tests.sh` e `npm test` verdi.
5. **Follow-up** — le due righe nuove sono in `docs/BACKLOG.md`; il report del ciclo registra S-05 e S-10 come esclusi per decisione dell'utente.
6. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati trattati come Brief a sé.

## Decisioni aperte

1. **Scope ridotto a S-08 + S-07; B-497 parziale nel ciclo 7, B-496 in BACKLOG, S-05/S-10 esclusi.** Alternativa scartata: tutto il Brief più B-496 e B-497 in un ciclo. Perché: S-05/S-10 hanno rischio nullo in produzione e B-497 è un ciclo che tocca ogni pagina; scelta dell'utente.
2. **Un `MulterError` risponde 400 con il suo messaggio.** Alternativa scartata: lasciarlo cadere nel 500 generico. Perché: «File too large» è un errore dell'utente che la pagina deve poter mostrare.
3. **Gli `userId` non validati restano 500 generici, con una riga di BACKLOG.** Alternativa scartata: validarli nel ciclo. Perché: la validazione non è nel Brief.
4. **`Secure` salvo `NODE_ENV=development` esplicito.** Alternativa scartata: `Secure` solo con `production`, come oggi. Perché: un ambiente che dimentica la variabile resta protetto.
5. **`APP_URL` va in BACKLOG invece di essere scartato.** Alternativa scartata: non registrarlo. Perché: con la variabile assente il link dell'email si rompe davvero.
