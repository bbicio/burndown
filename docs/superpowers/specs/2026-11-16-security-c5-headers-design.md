# Header di sicurezza e Content-Security-Policy su nginx (S-06) — design spec

**Date:** 2026-11-16
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c5-headers-brief.md`
**Scenario:** 2 (evoluzione con decisione di design aperta), finding S-06 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

Ogni risposta di nginx porta una Content-Security-Policy con allowlist delle origini (alternativa B del Brief), la protezione dal clickjacking, `nosniff`, `Referrer-Policy`, HSTS e `Permissions-Policy`, e non annuncia più la versione di nginx né Express. Un guard test fallisce quando una `location` perde gli header o quando una pagina carica da un'origine che la policy non ammette.

## 1. Fatti verificati

- `nginx.conf` non contiene `add_header`, `limit_req`, `server_tokens` né `proxy_hide_header`. Nessuna `location` ha header propri, quindi un `add_header` a livello `server` vale per tutte.
- L'API non imposta header di sicurezza (nessun `helmet`, nessun `setHeader` di sicurezza in `api/src`); Express risponde con `X-Powered-By: Express`.
- Tutte le pagine hanno script inline (classici o `type="module"`); `costgrid.html` ha handler `onclick=` inline; molte pagine hanno attributi `style="..."`. Vue è il build `vue.global.prod.js`, che compila i template nel browser.
- Origini esterne caricate dalle pagine: `https://cdn.jsdelivr.net` (Bootstrap CSS e JS, Chart.js, ExcelJS, Marked, Mermaid caricato su richiesta da `help.html`), `https://unpkg.com` (Vue), `https://cdn.sheetjs.com` (xlsx), `https://ik.imagekit.io` (favicon, `<link rel="icon">`).
- I download di export usano URL `blob:` (`URL.createObjectURL`) come `href` di un'ancora: è una navigazione, non una risorsa soggetta a CSP.
- Nessuna pagina usa `<iframe>` né `window.open`.
- La topologia di produzione (Azure) non è nota all'utente: non si sa se serva il `nginx.conf` del repo né chi termini il TLS.
- `scripts/cdn-integrity-guard.test.js` legge già gli URL CDN di pagine e `js/` (tag e caricatori lazy) tramite `scripts/lib/js-code.mjs`; `scripts/lib/nginx-locations.mjs` legge i blocchi `location` di `nginx.conf` per `scripts/nginx-serve.test.js`.

## 2. Header

A livello `server` in `nginx.conf`, ognuno con `always` (valgono anche su 302, 403, 404):

- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com`
  - `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`
  - `img-src 'self' data: blob: https://ik.imagekit.io`
  - `font-src 'self'`
  - `connect-src 'self'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `frame-ancestors 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `Strict-Transport-Security: max-age=15552000`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Più `server_tokens off;` e `proxy_hide_header X-Powered-By;` a livello `server`.

I valori della CSP sono quelli di partenza: la misura in Report-Only (§4) li conferma o li corregge prima che la policy diventi bloccante. Una correzione si riporta all'utente prima di applicarla.

**Regola:** nessun blocco `location` (nominato e `internal` compresi) contiene `add_header`. In nginx un `add_header` dentro una `location` sostituisce tutti quelli del livello superiore.

## 3. Guard test

`scripts/security-headers-guard.test.js` (vitest, sotto `scripts/`, nessuna modifica di config):

- il blocco `server` di `nginx.conf` porta ognuno degli header di §2 con `always`, `server_tokens off` e `proxy_hide_header X-Powered-By`;
- nessun blocco `location` contiene `add_header`;
- ogni origine `https://` caricata dalle pagine e da `js/` sta nella direttiva della CSP che la governa: `<script src>` e caricatori lazy in `script-src`, `<link rel="stylesheet">` in `style-src`, `<link rel="icon">` in `img-src`.

La lettura degli URL non è una seconda implementazione: la parte di `scripts/cdn-integrity-guard.test.js` che trova tag e caricatori lazy passa in un modulo di `scripts/lib/` condiviso dai due guard, con i test del guard del ciclo 4 invariati e verdi. La lettura dei blocchi `location` riusa `scripts/lib/nginx-locations.mjs` dove può. I limiti di ciò che il guard non vede stanno nel suo header, come negli altri guard.

`scripts/nginx-serve.test.js` resta invariato e verde.

## 4. Verifica

Sullo stack di branch (`scripts/test-branch.sh`), mai sullo stack principale:

1. **Misura.** La policy di §2 gira come `Content-Security-Policy-Report-Only`. Con `scripts/shoot.mjs` si aprono `pipeline.html`, `costgrid.html`, `planning.html`, `portfolio.html`, `help.html` con un documento che ha un diagramma Mermaid, e `login.html`; si leggono i PNG e la console. Si esercitano a mano anche un download di export (`blob:`), un import xlsx, un grafico Chart.js. Le violazioni correggono la policy (§2).
2. **Applicazione.** L'header diventa `Content-Security-Policy`; la verifica del punto 1 si ripete con zero violazioni in console e pagine funzionanti nei PNG.
3. **Header.** `curl -sI` su una pagina protetta (302 senza cookie e 200 con cookie), su `login.html`, su `/js/core.js` e su `/handbook/manifest.json` mostra gli header di §2 e nessun `Server: nginx/<versione>` né `X-Powered-By`.
4. **Clickjacking.** Una pagina di prova servita da un'altra porta da un server `node` usa e getta nella scratchpad incorpora `admin.html` in un `<iframe>`; Chrome headless non la mostra e la console riporta il rifiuto per `frame-ancestors`.
5. `npm test` verde.
6. `/security-review` sul branch, dopo le modifiche e i test verdi, prima di `/finish-cycle`; `/finish-cycle` non la esegue da sé.

## 5. Documentazione e stack principale

- `docs/ops/security-headers.md`: gli header attesi, il comando `curl -sI` da lanciare sull'URL di produzione, e la regola che, se lì mancano, la causa è un livello davanti a nginx dove vanno replicati.
- `docs/BACKLOG.md`: una riga per il rate limit in nginx (`limit_req`) quando la topologia è nota, con `real_ip` configurato sul proxy reale; una riga per la CSP stretta (nonce, niente `'unsafe-inline'`/`'unsafe-eval'`, Vue senza compilatore di template).
- Dopo il merge, lo stack principale prende la nuova config con `docker exec pdash-nginx nginx -s reload`. Non rientra nella deroga del Gate 4 (che copre solo `docker compose restart api`): si chiede conferma all'utente.

## 6. Fuori dal ciclo

Rifattorizzare le pagine per togliere script inline, handler inline o il compilatore Vue (alternativa D); SRI e versioni delle librerie (ciclo 4); il cookie `Secure` (S-07); raccolta dei report CSP (`report-to`); il processo di sicurezza del ciclo di sviluppo. Un finding nuovo si isola come Brief a sé.

## Decisioni aperte

1. **CSP con allowlist delle origini, applicata (alternativa B).** Alternativa scartata: solo header senza CSP (A); CSP in `Report-Only` anche dopo il merge (C permanente); CSP stretta con nonce (D). Perché: B blocca script da origini non in elenco, chiude `object`/`base`/`form-action` e limita l'esfiltrazione via `connect-src`/`img-src` senza rifare le pagine; C senza un endpoint di raccolta non protegge e nessuno vede i report; D è un programma a parte. Limite accettato: con `'unsafe-inline'` la CSP non avrebbe fermato S-01 (`javascript:` URL).
2. **Report-Only solo sullo stack di branch, come misura.** Alternativa scartata: Report-Only in produzione per un periodo. Perché: senza `report-to` le violazioni degli utenti non arrivano a nessuno.
3. **Header nel `nginx.conf` del repo, più una nota per chi gestisce Azure.** Alternativa scartata: aspettare di conoscere la topologia, o puntare a un gateway. Perché: è il solo livello che il repo controlla e testa; l'utente non sa come produzione serve le pagine, e la nota dà il comando per verificarlo lì.
4. **Rate limit in nginx (alternativa E) fuori dal ciclo, in BACKLOG.** Alternativa scartata: `limit_req` per IP sugli endpoint di autenticazione. Perché: dietro un proxy sconosciuto nginx vede l'IP del proxy e frenerebbe tutti gli utenti insieme; `real_ip` non si configura in sicurezza senza sapere qual è il proxy.
5. **HSTS sempre emesso, `max-age` di sei mesi, senza `includeSubDomains` né `preload`.** Alternativa scartata: emetterlo solo con `X-Forwarded-Proto: https`, o con `includeSubDomains`. Perché: i browser ignorano HSTS su risposte HTTP, quindi su `localhost` è inerte; il dominio di produzione e i suoi sottodomini non sono noti.
6. **Origini CDN per host, non per percorso.** Alternativa scartata: `https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/` e simili. Perché: con `'unsafe-inline'` il guadagno è quasi nullo, ogni cambio di versione cambierebbe la policy, e le versioni le fissa già l'SRI del ciclo 4.
7. **`frame-ancestors 'none'` più `X-Frame-Options: DENY`.** Alternativa scartata: `'self'`/`SAMEORIGIN`. Perché: l'app non incornicia nessuna sua pagina.
8. **Una sola policy a livello `server` per tutte le risposte, in `nginx.conf`.** Alternativa scartata: policy diverse per pagine, asset e API; un file `include` separato. Perché: sulle risposte JSON la CSP è innocua; un `include` richiederebbe un mount nuovo nel compose, e quello di produzione è fuori dal repo.
9. **`Referrer-Policy: same-origin`.** Alternativa scartata: `strict-origin-when-cross-origin`, il default dei browser. Perché: `activate.html` e `reset-password.html` portano un token nell'URL, e i CDN non hanno bisogno nemmeno dell'origine.
10. **Il guard riusa la lettura degli URL CDN del ciclo 4, spostata in `scripts/lib/`.** Alternativa scartata: una seconda lettura a regex nel nuovo guard. Perché: nel ciclo 4 la lettura a regex di JS ha generato finding a ogni round di review; una sola definizione non diverge.

## Criteri di accettazione

1. **Decisione** — questa spec registra la scelta B e le ragioni (Decisioni aperte); il punto di applicazione è il `nginx.conf` del repo, e `docs/ops/security-headers.md` dà il comando per verificarlo in produzione.
2. **Header** — `curl -sI` sullo stack di branch, su una pagina protetta, su `login.html`, su `/js/core.js` e su `/handbook/manifest.json`, mostra gli header di §2, senza versione di nginx né `X-Powered-By`.
3. **CSP** — nessuna violazione in console aprendo `pipeline.html`, `costgrid.html`, `planning.html`, `portfolio.html`, `help.html` con un diagramma Mermaid e `login.html`, con la policy bloccante; i PNG di `shoot.mjs` mostrano le pagine funzionanti.
4. **Clickjacking** — la pagina di prova che incorpora `admin.html` in un `<iframe>` non la mostra.
5. **Test** — `scripts/security-headers-guard.test.js` esiste ed è verde, ed è rosso aggiungendo un `add_header` in una `location` o un tag CDN da un'origine fuori dalla policy (verificato una volta a mano); `scripts/nginx-serve.test.js`, `scripts/cdn-integrity-guard.test.js` e `npm test` verdi.
6. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati trattati come Brief a sé.
