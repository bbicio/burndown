# Brief — Sicurezza ciclo 5: header di sicurezza e CSP (S-06)

**Tipo:** **evoluzione con decisione di design aperta** (Scenario 2). Finding coperto: **S-06**.
**Perché è diverso dagli altri cicli:** non è una divergenza da correggere ma un controllo che manca, e una Content-Security-Policy utile dipende da come sono scritte le pagine (script inline, template Vue compilati a runtime, CDN). Il Brief non sceglie la policy: la fase `/brainstorming` propone le alternative e l'utente decide.
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato il 2026-11-15. Ordine: 5 di 6, dopo il ciclo 1 (che chiude il vettore XSS concreto delle notifiche).

## Problema

Le risposte di nginx non portano nessun header di sicurezza: nessuna CSP (che avrebbe contenuto un XSS come S-01), nessuna protezione dal clickjacking sulle pagine admin, nessun `nosniff`, nessun HSTS, nessuna `Referrer-Policy`. Davanti all'API non c'è nemmeno un limite di frequenza: i limiter in memoria di `auth.js` sono l'unico freno.

## Comportamento attuale

- `nginx.conf` non contiene `add_header`, `limit_req` né `server_tokens` (ricerca nel file: nessuna occorrenza).
- Le pagine usano script `type="module"` inline, template Vue compilati nel browser (il build `vue.global.prod.js` compila i template e richiede quindi di norma `'unsafe-eval'`), stili inline e librerie da CDN (`unpkg.com`, `cdn.jsdelivr.net`): una CSP stretta sugli script non è gratuita e va progettata. **Quanto richiedono di preciso le pagine non è stato misurato.**
- I limiter di `auth.js` (`lib/rate-limit.js`) sono in memoria e si azzerano al riavvio.
- **Non è noto dove vengano impostati gli header in produzione:** il compose di produzione (Azure) è fuori dal repo e non si sa se serva il `nginx.conf` del repo o se gli header spettino a un livello davanti (gateway, front door).

## Comportamento atteso

Le risposte delle pagine applicative portano gli header scelti dalla spec; il punto di applicazione è quello effettivo in produzione. Come minimo, gli header che non dipendono dal contenuto delle pagine; la CSP nel grado che la spec dimostra compatibile.

## Alternative da portare in `/brainstorming` (non scelte)

- **A. Solo header senza CSP:** `X-Content-Type-Options`, `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`, HSTS dove la terminazione TLS lo consente; nessun rischio di rompere le pagine.
- **B. CSP permissiva ma utile:** allowlist delle origini (`script-src` con solo le origini CDN usate, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`), accettando `'unsafe-inline'`/`'unsafe-eval'` finché le pagine non vengono rifattorizzate.
- **C. B in `Content-Security-Policy-Report-Only` prima**, per misurare cosa si romperebbe, poi applicata.
- **D. CSP stretta con nonce e Vue con build senza compilatore:** richiede di rifare la pagina-per-pagina; è un programma, non questo ciclo.
- **E. Rate limit a livello nginx** (`limit_req`) sugli endpoint di autenticazione, oppure lasciarlo ai limiter applicativi.

## Vincoli

- In `nginx`, un `add_header` dentro un blocco `location` **sostituisce** quelli del livello superiore: la soluzione deve valere per ogni `location` che serve contenuto (`scripts/nginx-serve.test.js` modella la scelta della location; `scripts/lib/nginx-locations.mjs`).
- Nessuna pagina deve smettere di funzionare: verifica con `scripts/shoot.mjs` e lettura dei PNG, più console senza violazioni (`docs/scripts/shoot.md`).
- Prima di decidere dove mettere gli header si chiede all'utente come produzione serve le pagine (nginx del repo o altro).
- Modifiche a `nginx.conf` sullo stack principale: ricarica di `pdash-nginx` solo con conferma dell'utente; verifica su stack isolato (`scripts/test-branch.sh`). Mai `-v`.
- Il guard di nginx (`scripts/nginx-serve.test.js`) continua a passare; se la soluzione aggiunge un test per gli header, fallisce quando una `location` ne è priva.
- **`/security-review` obbligatoria nel ciclo:** prima di `/finish-cycle`, sul branch del ciclo (dopo le modifiche e i test verdi), si esegue la skill `/security-review`; verifica che i finding del ciclo non si ripresentino e che il ciclo non ne introduca di nuovi (il ciclo 1 ha trovato così un gadget same-origin non previsto dal Brief). Un finding nuovo è proposto come Brief a sé, salvo diversa decisione dell'utente. Il Piano ha un task o una nota per questo passo, e `/finish-cycle` non lo esegue da sé.

## Criteri di accettazione

1. Decisione tra le alternative registrata nella spec con le ragioni, e il punto di applicazione in produzione confermato dall'utente.
2. `curl -sI` su una pagina protetta e su una pubblica (`login.html`) mostra gli header scelti; stessa verifica su un asset `/js/` e su `/handbook/`.
3. Se è scelta una CSP: nessuna violazione in console aprendo `pipeline.html`, `costgrid.html`, `planning.html`, `portfolio.html`, `help.html` (con un diagramma Mermaid) e `login.html`.
4. Il clickjacking è rifiutato: una pagina di prova che incorpora `admin.html` in un `<iframe>` non la mostra.
5. `scripts/nginx-serve.test.js` e `npm test` verdi.
6. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi (o con quelli trovati trattati come da «Nuovi finding durante il ciclo»).

## Scope escluso esplicitamente

- Rifattorizzare le pagine per eliminare gli script inline o il compilatore di template Vue (alternativa D: programma a parte).
- SRI e versione di Vue (ciclo 4).
- Il processo di sicurezza del ciclo di sviluppo (dopo i fix).

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
