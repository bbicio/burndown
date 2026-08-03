# Design — Fix redirect assoluto senza porta nel gate di autenticazione nginx

**Data:** 2026-08-03
**Brief:** `docs/superpowers/briefs/2026-08-03-nginx-auth-gate-port-redirect-brief.md`

## Problema

`nginx.conf`'s auth-gate (`location / { auth_request /auth-check; error_page 401 = @to_login; }`, `nginx.conf:74-76`) redirige un visitatore non autenticato tramite `@to_login` (`nginx.conf:24-26`):

```
location @to_login {
  return 302 /login.html;
}
```

Il path `/login.html` è relativo, ma nginx lo espande sempre in un URL assoluto (comportamento di default, `absolute_redirect on`), costruito da `$host` (che non include mai la porta) più `$server_port` solo se differisce dal default per lo scheme — e nginx vede sempre la propria porta interna (`listen 80`, `nginx.conf:8`), identica al default HTTP, quindi non aggiunge mai alcuna porta. nginx non ha visibilità sul mapping di porta esterno di Docker (`docker-compose.yml:88-89` per lo stack principale: `80:80`; `scripts/test-branch.sh:58-80`, `write_override()`, per uno stack di branch: `${FRONTEND_PORT}:80`, es. `8081:80`).

Verificato via `curl -s -D - -o /dev/null http://localhost:8081/pipeline.html` (nessun cookie di sessione):

```
HTTP/1.1 302 Moved Temporarily
Location: http://localhost/login.html
```

Sullo stack principale (porta 80) questo è invisibile/corretto per coincidenza. Su un qualunque stack di branch isolato (porta diversa da 80, stesso `nginx.conf` bind-montato identico via `docker-compose.yml:86`) un visitatore non autenticato viene rimandato fuori dall'ambiente isolato, dentro il login dello stack principale su porta 80.

Il redirect lato client (`js/nav.js:350`, `js/api.js:27-29`) non è affetto — è JS relativo, risolto dal browser contro il documento corrente, porta inclusa.

## Scope escluso (confermato nel Brief)

- Cookie condivisi cross-porta (comportamento intrinseco HTTP, non un bug di questo redirect).
- Schema di porte fisse di `scripts/test-branch.sh` (issue separata, già tracciata).
- Redirect lato client (già verificato non affetto).
- Supporto per un eventuale reverse proxy/TLS-termination futuro (`X-Forwarded-Proto`/`X-Forwarded-Host`) — non esiste oggi nel repo (verificato: zero menzioni in `ARCHITECTURE.md`, `docker-compose.yml`, `nginx.conf`); fuori scope, da affrontare solo se/quando un proxy verrà effettivamente introdotto.

## Approcci considerati

**A — `absolute_redirect off;` (globale, scelto):** dice a nginx di non sintetizzare mai un URL assoluto per i redirect che genera, mandando `Location: /login.html` (path relativo) — legale per HTTP spec (RFC 7231 §7.1.2); il browser risolve il path relativo contro l'URL della richiesta effettiva, che conosce per intero, porta inclusa. Corregge la causa radice (nginx non ha comunque la porta esterna reale) e protegge automaticamente anche qualunque redirect nginx dovesse generare in futuro — coerente con la storia di questo progetto di problemi di porta ricorrenti tra stack (vedi `docs/superpowers/briefs/2026-07-20-test-branch-port-merge-bug-brief.md`).

**B — `return 302 $scheme://$http_host/login.html;` (mirato su `@to_login`, scartato):** `$http_host` riflette l'header Host esattamente come inviato dal client (porta inclusa), a differenza di `$host` che la strippa sempre. Fix chirurgico limitato al singolo redirect esistente. Scartato a favore di A per la sua maggiore robustezza contro redirect futuri e la coerenza con la storia di problemi di porta del progetto.

**Scartata a priori:** `port_in_redirect` da solo — confronta la porta di ascolto *interno* di nginx (sempre 80 in questo setup Docker) col default dello scheme, sempre uguali; nginx non ha da nessuna parte il numero della porta esterna reale se non leggendolo dall'header Host (esattamente ciò che fa `$http_host`, opzione B).

## Modifica

Una riga aggiunta a `nginx.conf`, dentro il blocco `server { listen 80; ... }`, subito dopo `listen 80;`:

```nginx
server {
  listen 80;

  # nginx non ha visibilità sul mapping di porta esterno di Docker (vede solo
  # la propria porta interna 80) — un redirect assoluto costruito da nginx
  # perderebbe sempre la porta reale usata dal client. Lasciando il Location
  # relativo, è il browser (che conosce l'URL effettivo) a risolverlo
  # correttamente, porta inclusa.
  absolute_redirect off;
  ...
```

Nessun'altra modifica a `docker-compose.yml`, `scripts/test-branch.sh`, o codice applicativo. La logica di `/auth-check` (`nginx.conf:13-21`) e il redirect target `@to_login` (`nginx.conf:24-26`) restano invariati — cambia solo come nginx costruisce l'header `Location`.

## Verifica

Manuale via `curl`, coerente con i criteri di accettazione del Brief — nessuna infrastruttura di test dedicata (nessuna esiste oggi per `nginx.conf`; un fix di una riga non la giustifica):

- **Stack principale (porta 80), prima/dopo:** `curl -s -D - -o /dev/null http://localhost/pipeline.html` (nessun cookie) → `Location: /login.html` (relativo, non più `http://localhost/login.html` assoluto). Nessuna regressione visibile all'utente — il browser risolve comunque correttamente.
- **Stack di branch isolato** (es. porta 8081 via `scripts/test-branch.sh up`), stessa richiesta non autenticata → stesso `Location: /login.html` relativo; con `curl -sIL` (segue il redirect) l'URL effettivo risolto resta su `:8081`, non su `:80`.
- **Utente autenticato** (cookie JWT valido), su qualunque porta → nessun redirect, comportamento invariato (verifica di non-regressione).

## Error handling / rollback

Nessuno stato di errore nuovo introdotto — è un valore di configurazione statico, nessuna logica applicativa coinvolta. Rollback banale: rimuovere la riga `absolute_redirect off;`.
