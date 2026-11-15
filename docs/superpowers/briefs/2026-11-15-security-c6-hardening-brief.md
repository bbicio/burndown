# Brief — Sicurezza ciclo 6: hardening a bassa severità (S-08, S-05, S-10)

**Tipo:** correzione di divergenza (audit-fix, Scenario 3). Finding coperti: **S-08**, **S-05**, **S-10**, più il candidato `APP_URL` emerso dal ciclo 1 (vedi «Comportamento attuale»).
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato il 2026-11-15. Ordine: 6 di 6.
**Criterio di raggruppamento:** natura e severità (tre correzioni piccole e a basso rischio), **non** una causa comune: toccano `api/src/index.js`, `docker-compose.yml` e `api/Dockerfile`. Se in `/brainstorming` conviene, S-08 si sposta nel ciclo 3 (anche lì c'è un 500 da input non valido) e gli altri due restano insieme.
**Severità aggiornata dall'utente (2026-11-15):** il `docker-compose.yml` del repo **non** è quello di produzione (Azure ha il proprio), quindi S-05 e S-10 riguardano l'ambiente di sviluppo e scendono a Low. **S-07** (cookie `Secure` solo con `NODE_ENV=production`) non è un ciclo di codice: l'utente verifica che il compose Azure imposti `NODE_ENV=production`; resta aperta una scelta di design (vedi «Decisione aperta»).

## Problema

(S-08) Ogni errore 500 restituisce al client il messaggio interno, inclusi testi di PostgreSQL. (S-05) Nel compose di sviluppo PostgreSQL e Adminer sono pubblicati su tutte le interfacce dell'host e Adminer è `latest`. (S-10) Il container API gira come root e il profilo `test` può creare un sysadmin con password nota se lanciato su uno stack con dati veri.

## Comportamento attuale

- `res.status(err.status || 500).json({ error: err.message || 'Internal server error' })` (`api/src/index.js:90-93`). Percorsi raggiungibili con input malformato: `userId` non validato in `routes/cost-grids.js:990` (share) e `routes/notifications.js:149`.
- **Candidato aggiunto dal ciclo 1 (2026-11-15, non un finding dell'audit):** `api/src/routes/cost-grids.js:1023` (link dell'email di condivisione) e `:1035` (`url` della notifica) usano `process.env.APP_URL` senza il default `http://localhost` che usano `email.js` e `:1141`/`:1149` (`APP_URL` importato da `services/email`). Con la variabile assente il link diventa `undefined/pipeline.html`: l'email porta un link rotto e, dal ciclo 1, il client non mostra il link della notifica (non è un percorso né un URL sull'origine dell'app). `config.js:185`/`:198` e `projects.js:707`/`:719` usano un `appUrl` locale: verificarne la definizione in `/brainstorming`.
- `docker-compose.yml`: `"5432:5432"` (`:21`), `adminer: image: adminer:latest`, `"8080:8080"` (`:88-92`), nessun indirizzo di bind.
- `api/Dockerfile`: nessuna istruzione `USER`; l'immagine esegue `node src/index.js` come root.
- Servizio `test` del compose: `create-admin.js` e `promote-sysadmin.js` con `${TEST_SYSADMIN_PASSWORD:-TestSysAdmin123!}` contro il `db` del progetto (`docker-compose.yml:72` e comando del servizio); `scripts/run-tests.sh` è la mitigazione perché usa uno stack isolato, ma il profilo del compose non ha nessuna guardia.

## Comportamento atteso

1. Per un errore inatteso (nessun `err.status` di classe 4xx impostato deliberatamente) il client riceve un messaggio generico in inglese; il dettaglio resta nel log del server. Gli errori 4xx deliberati (validazione, `MONEY_RULE`, `DATE_RULE`, `PROJECT_RULE`, multer) mantengono il loro messaggio e codice.
2. Nel compose di sviluppo PostgreSQL e Adminer ascoltano solo su `127.0.0.1`, e Adminer ha una versione fissata.
3. Il container API non gira come root.
4. Il profilo `test` rifiuta di creare gli account con password predefinita se non è su uno stack di test (la regola esatta, es. nome del database o variabile esplicita, è della spec).
5. (Candidato del ciclo 1) Ogni punto che costruisce un link da `APP_URL` usa lo stesso valore e lo stesso default di `services/email.js` (`APP_URL`), senza leggere `process.env.APP_URL` direttamente.

## Decisione aperta (da portare in `/brainstorming`, non assunta)

- **Cookie `Secure` per default (S-07):** oggi `secure: process.env.NODE_ENV === 'production'` (`api/src/services/jwt.js:19`, `api/src/routes/auth.js:36`, `:46`). Si può invertire (Secure salvo `NODE_ENV=development` esplicito) per fallire in sicurezza se un ambiente dimentica la variabile; cambia il comportamento in sviluppo su HTTP. L'utente decide se includerla.

## Vincoli

- Nessun test né pagina deve dipendere dal testo di un errore 500: verificare con una ricerca prima di cambiarlo (`js/api.js` e le pagine che mostrano `err.message`).
- `USER node` e il volume `./api/src` montato: verificare che i permessi consentano la lettura e che `create-admin.js` e gli script continuino a funzionare.
- **Lo stack principale non si tocca senza conferma:** applicare il nuovo compose o ricostruire l'immagine su `pdash-db`/`pdash-api` segue «Infrastructure safety» di `CLAUDE.md` (mai `-v`, backup con `scripts/backup-db.sh`, conferma esplicita dell'utente). Verifica su stack isolato (`scripts/test-branch.sh`, `scripts/run-tests.sh`).
- `scripts/test-branch.sh` e `scripts/run-tests.sh` che dipendono dal compose o dalle porte devono continuare a funzionare (`docs/scripts/`).
- **`/security-review` obbligatoria nel ciclo:** prima di `/finish-cycle`, sul branch del ciclo (dopo le modifiche e i test verdi), si esegue la skill `/security-review`; verifica che i finding del ciclo non si ripresentino e che il ciclo non ne introduca di nuovi (il ciclo 1 ha trovato così un gadget same-origin non previsto dal Brief). Un finding nuovo è proposto come Brief a sé, salvo diversa decisione dell'utente. Il Piano ha un task o una nota per questo passo, e `/finish-cycle` non lo esegue da sé.

## Criteri di accettazione

1. Una richiesta che provoca un errore di PostgreSQL (es. `userId` non UUID sullo share) risponde con un messaggio generico; il log del server contiene l'errore originale.
2. Un errore 4xx deliberato (es. `periodError`) conserva messaggio e `code`.
3. `docker compose config` mostra `127.0.0.1:5432`, `127.0.0.1:8080` e un tag di versione per Adminer.
4. `docker exec pdash-api id` (su stack isolato) non mostra `uid=0`; le suite `run-tests.sh` passano.
5. Il servizio `test` si ferma con un messaggio chiaro se lanciato contro uno stack non di test.
6. Con `APP_URL` non impostato, l'email di condivisione e la notifica di `cost-grids.js` portano un link su `http://localhost` e non `undefined/…` (test sul punto che costruisce il link).
7. Suite backend e frontend verdi.
8. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi (o con quelli trovati trattati come da «Nuovi finding durante il ciclo»).

## Scope escluso esplicitamente

- Il compose e le variabili d'ambiente di produzione (Azure): fuori dal repo, a carico dell'utente.
- Header di sicurezza (ciclo 5), dipendenze e Dockerfile `npm ci` (ciclo 4), token (ciclo 3).

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
