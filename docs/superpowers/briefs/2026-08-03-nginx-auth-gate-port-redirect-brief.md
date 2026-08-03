# Brief — Fix redirect assoluto senza porta nel gate di autenticazione nginx

**Data:** 2026-08-03
**Scenario:** 2 — Evoluzione di una feature esistente
**Origine:** Roadmap notes di `docs/superpowers/reports/2026-08-01-worktree-dead-xlsx-and-branch-gitignore-finish-cycle.md`, scoperto durante il Gate 2 di quel ciclo

## Current behavior

`nginx.conf:74-76` applica un gate di autenticazione a tutte le route protette:

```
location / {
  auth_request  /auth-check;
  error_page 401 = @to_login;
  ...
}
```

Su 401 dal sub-request (`nginx.conf:13-21`, che proxya a `http://api:3000/api/auth/me`), nginx esegue `error_page 401 = @to_login`, che risolve in `nginx.conf:24-26`:

```
location @to_login {
  return 302 /login.html;
}
```

`return 302 /login.html` usa un path relativo, ma nginx lo espande sempre in un URL assoluto usando il proprio scheme/host interno (`listen 80` a `nginx.conf:8`) — nginx non ha visibilità sul mapping di porta esterno di Docker. Verificato via `curl -s -D - -o /dev/null http://localhost:8081/pipeline.html` (nessun cookie di sessione):

```
HTTP/1.1 302 Moved Temporarily
Location: http://localhost/login.html
```

Nota l'assenza della porta `:8081` nella `Location`. Sullo stack principale (`docker-compose.yml:88-89`, pubblicato su `80:80`) questo è invisibile/corretto per coincidenza — la porta 80 è comunque quella reale. Ma qualunque stack di test isolato (`scripts/test-branch.sh:58-61`, porte sempre diverse da 80, es. `8081:80` per nginx via `write_override()`) condivide lo stesso `nginx.conf` (bind-mount identico, `docker-compose.yml:86`) — quindi un visitatore non autenticato che finisce sul gate su un branch stack viene rimandato fuori dall'ambiente isolato, dentro il login dello stack principale su porta 80, senza alcuna indicazione visibile del cambio di ambiente oltre l'URL.

Il redirect via JS lato client (`js/nav.js:350`, `js/api.js:27-29`, entrambi `window.location.href = '/login.html'`) **non** è affetto: essendo risolto dal browser stesso contro il documento corrente, preserva correttamente la porta. Il bug è isolato al redirect nginx-level.

## Expected behavior

Il redirect del gate di autenticazione nginx deve mantenere l'utente sullo stesso host:porta da cui è arrivata la richiesta — sia sullo stack principale (porta 80) sia su un qualunque stack di branch isolato (qualunque altra porta) — senza mai rimandare silenziosamente a un ambiente diverso.

## Constraints

- `nginx.conf` è condiviso e bind-montato identico su ogni stack (`docker-compose.yml:86`; `scripts/test-branch.sh` sovrascrive solo `container_name`/`ports`, mai i volumi) — il fix deve essere generico (funzionare per qualunque combinazione host:porta), non basato su porte hardcoded.
- Non deve richiedere modifiche alla logica di autenticazione stessa (`/auth-check`, `nginx.conf:13-21`) — il 401 è determinato correttamente, solo la destinazione del redirect è sbagliata.
- Non deve alterare il comportamento (oggi corretto) dello stack principale su porta 80.
- Nessuna nuova dipendenza esterna; l'immagine resta `nginx:alpine` (`docker-compose.yml:83`).

## Acceptance criteria

- Richiesta non autenticata a una pagina protetta sullo stack principale (porta 80) → redirect resta su porta 80 (verifica di non-regressione).
- Richiesta non autenticata a una pagina protetta su uno stack di branch isolato (es. porta 8081 via `scripts/test-branch.sh up`) → l'header `Location` include la porta 8081 (o qualunque porta di branch usata), non punta mai a un'altra porta/stack.
- Verificato via `curl -D -` (o equivalente) su almeno due porte diverse (80 e una porta di branch non-80), confermando che l'host:porta della `Location` coincide esattamente con quello della richiesta.
- Un utente già autenticato (cookie JWT valido) continua a caricare la pagina normalmente, nessun redirect (verifica di non-regressione).
- Il target del sub-request `/auth-check` (`proxy_pass http://api:3000/api/auth/me`) resta invariato — fix a livello di presentazione, non di logica d'auth.

## Explicitly excluded scope

- Il meccanismo dei cookie condivisi cross-porta (host-only, non scoped alla porta) che permette a un JWT valido sullo stack principale di essere accettato anche da un'API di branch con lo stesso `JWT_SECRET` — comportamento intrinseco ai cookie HTTP (RFC 6265 ignora la porta), non un bug di questo redirect; risolverlo richiederebbe uno scoping delle sessioni per branch, un cambiamento architetturale distinto. Non parte di questo fix.
- Lo schema di assegnazione porte fisso di `scripts/test-branch.sh` (stesse porte 8081/3001/5433/8082 per ogni branch, non porte dinamiche) — questione già nota da un ciclo precedente (`2026-07-20-test-branch-port-merge-bug-brief.md`), causa e soluzione diverse. Non toccata qui.
- Qualunque modifica al redirect lato client (`js/nav.js:350`, `js/api.js:27-29`) — verificato che non è affetto dal bug (JS relativo, risolto dal browser contro l'origine corrente, porta inclusa). Nulla da correggere lì.

## Domande aperte per `/brainstorming`

- Approccio tecnico: usare `$scheme://$http_host` (che riflette l'header `Host` inviato dal client, comprensivo di porta se non standard) al posto del path relativo in `return 302`, oppure un'altra direttiva (`absolute_redirect off`, `port_in_redirect`, ecc.) — alternative reali con trade-off diversi, da esplorare in brainstorming, non decise qui.
- Se serve gestire anche scenari con reverse proxy/TLS-termination a monte (X-Forwarded-Proto/Host) o se lo scope resta limitato all'uso attuale (HTTP diretto, nessun proxy aggiuntivo davanti a nginx).

Brief ready. Next step: /brainstorming.
