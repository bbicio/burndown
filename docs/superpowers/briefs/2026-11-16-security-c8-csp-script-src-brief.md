# Brief — Sicurezza ciclo 8: CSP senza `'unsafe-inline'` in `script-src` (B-497 parziale)

**Tipo:** evoluzione (Scenario 2), confermata dall'utente il 2026-11-16.
**Ordine:** ciclo 8, dopo l'audit dei punti che scrivono HTML (ciclo 7), per decisione dell'utente del 2026-11-16: prima si correggono i bug reali, poi la CSP come seconda rete.
**Origine:** `docs/BACKLOG.md` B-497 (aperta dalla spec `security-c5-headers` §6); perimetro "parziale" deciso nella spec `docs/superpowers/specs/2026-11-16-security-c6-hardening-design.md` §6.

## Problema

La CSP ammette `'unsafe-inline'` in `script-src`: uno script iniettato nell'HTML di una pagina (XSS) viene eseguito. Dal ciclo 5 la CSP è applicata, ma su questo punto non protegge.

## Comportamento attuale

- `nginx.conf:24`: `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdn.sheetjs.com`; `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`. Header a livello `server`, pinnato da `scripts/security-headers-guard.test.js` (detail: `docs/ops/security-headers.md`).
- **Script inline:** 55 blocchi `<script>` senza `src` nelle 27 pagine `*.html` della radice, circa 507 KB in tutto (conteggio di questo Brief, script ad hoc sulle pagine, 2026-11-16). Comprendono lo snippet inerte del `<head>` identico in ogni pagina che legge `PDash_sidebarCollapsed` (`CLAUDE.md` "Page shell"), i redirect di una riga (`index.html`, `config.html`, `master-client-groups.html`) e gli script `type="module"` con `Vue.createApp(...).mount(...)` (fino a ~70 KB in `portfolio.html`, ~65 KB in `costgrid.html`).
- **Handler inline:** due attributi `onclick` in `costgrid.html`: `:718` (`openClientEditModal(null)`) e `:737` (`saveClientFromModal()`). Nessun altro attributo `on…=` nelle pagine né nelle stringhe HTML costruite da `js/*.js`; nessun `href="javascript:"`; `js/notifications.js:84` assegna `browserNotif.onclick` da JS (consentito da una CSP).
- **CDN a host intero:** gli script esterni usati sono `cdn.jsdelivr.net/npm/{bootstrap@5.3.2, chart.js@4.4.0, exceljs@4.4.0, marked@15.0.12, mermaid@11.4.1}/…`, `unpkg.com/vue@3.5.45/…`, `cdn.sheetjs.com/xlsx-0.20.3/…`, letti anche da `scripts/lib/cdn-urls.mjs`; ognuno ha SRI (`scripts/cdn-integrity-guard.test.js`). Una CSP che ammette tutto `cdn.jsdelivr.net`/`unpkg.com` consente di caricare qualunque pacchetto npm da lì: senza `'unsafe-inline'` diventa la via di bypass.
- `'unsafe-eval'` serve al compilatore di template di Vue nel browser (Vue da CDN, nessun build step).

## Comportamento atteso

1. `script-src` non contiene `'unsafe-inline'`; ogni script inline che resta è ammesso esplicitamente (hash) oppure è spostato in un file `.js` servito da `'self'` — la scelta, anche mista, è di `/brainstorming`.
2. Nessun attributo handler inline nelle pagine: i due `onclick` di `costgrid.html` diventano `addEventListener` (o binding Vue).
3. `cdn.jsdelivr.net` e `unpkg.com` (e `cdn.sheetjs.com`) compaiono in `script-src` solo con i path delle librerie usate, non come host interi.
4. Ogni pagina si carica e funziona senza violazioni CSP in console, per ogni ruolo che la vede.
5. Una modifica futura a uno script inline (se ne restano) o a un URL CDN che non aggiorni la CSP fa fallire un test, non la pagina in produzione.

## Vincoli

- Nessun build step né bundler: nginx serve `js/`/`css/` come sono su disco (`CLAUDE.md` "Testing & tooling").
- Un file `.js` nuovo è servito solo se rientra nell'allowlist di `nginx.conf` (`scripts/nginx-serve.test.js`) e porta il suo `?v=N` ("Cache-busting").
- Ordine di esecuzione: gli script `defer`/`type="module"` condividono una coda per posizione nel documento; un override di un global resta `type="module"` che assegna `window.x` ("Script loading order"). Spostare uno script inline in un file non deve cambiarne il momento di esecuzione (lo snippet del `<head>` gira prima del primo paint).
- Le guardie esistenti restano verdi o si aggiornano nello stesso ciclo: `security-headers-guard`, `cdn-integrity-guard`, `nginx-serve`, `js/lib/nav-shell-guard.test.js`, `js/lib/page-head-guard.test.js`.
- Le pagine sono servite senza `?v=` sull'HTML: un hash di uno script inline e la pagina che lo contiene devono arrivare insieme (una pagina in cache con lo script vecchio e la CSP nuova la rompe).
- Verifica su stack isolato (`scripts/test-branch.sh`); il reload di `pdash-nginx` principale al Gate 4 richiede la conferma dell'utente (non è nella deroga di `CLAUDE.md`). Claude in Chrome è bloccato su localhost: la console si legge con una sonda CDP usa-e-getta, come nel ciclo 5.
- Testo per l'utente in inglese.
- **`/security-review` obbligatoria** sul branch prima di `/finish-cycle`.

## Criteri di accettazione

1. **CSP** — `grep -n "Content-Security-Policy" nginx.conf` non contiene `'unsafe-inline'` dentro `script-src`; `style-src` invariato.
2. **Handler** — nessun attributo `on[a-z]+=` nelle pagine `*.html` (pinnato da un test).
3. **CDN** — `script-src` elenca path, non host interi, per `cdn.jsdelivr.net`, `unpkg.com`, `cdn.sheetjs.com`; nel browser un `<script src="https://cdn.jsdelivr.net/npm/<altro pacchetto>">` aggiunto da console è rifiutato dalla CSP.
4. **Pagine** — ogni pagina della tabella Pages di `CLAUDE.md` (più `help.html` con un diagramma Mermaid e le pagine pubbliche `login`/`activate`/`reset-password`/`terms`) si apre sullo stack di branch senza violazioni CSP in console e le sue azioni principali funzionano.
5. **Guardia** — un test fallisce se uno script inline rimasto non è ammesso dalla CSP, o se un URL CDN usato da una pagina non è nei path di `script-src`.
6. **Test** — `npm test` verde; `scripts/run-tests.sh` se il ciclo tocca `api/`.
7. **Security review** — `/security-review` sul branch, senza finding nuovi, o con quelli trovati proposti come Brief a sé.

## Scope escluso esplicitamente (confermato dall'utente il 2026-11-16)

- `'unsafe-eval'` resta (compilatore di template di Vue; toglierlo richiede un build step).
- `style-src 'unsafe-inline'` resta (attributi `style=` e blocchi `<style>`).
- B-496 (rate limit in nginx) e B-498 (favicon da imagekit).
- Nonce: nginx serve file statici, un nonce per risposta richiede una riscrittura lato server.

## Domande aperte per `/brainstorming`

1. **Hash o file esterni.** Hash per ogni script inline (55 hash nell'header, ricalcolati a ogni modifica, quindi serve una guardia che li ricalcoli dalle pagine) o spostamento in file `js/pages/<pagina>.js` (cache-busting `?v=N`, allowlist di nginx, ordine di esecuzione da preservare), oppure un misto: hash per lo snippet del `<head>` e i redirect, file per gli script grandi.
2. **Granularità dei path CDN:** URL esatto del file o directory del pacchetto versionato (`/npm/mermaid@11.4.1/`); verificare se Mermaid o altre librerie caricano altri file a runtime (chunk, worker) e da dove.
3. **Transizione:** una fase con `Content-Security-Policy-Report-Only` accanto alla CSP attuale prima di applicarla, oppure applicazione diretta dopo la verifica sullo stack di branch.
4. **Pagine in cache dopo il deploy:** come evitare che una pagina HTML in cache (non versionata) con lo script inline vecchio incontri la CSP nuova (es. `Cache-Control` sulle pagine, o tenere temporaneamente entrambi gli hash).
5. **Metodo di verifica di tutte le pagine:** sonda CDP su ogni pagina per ruolo, `scripts/shoot.mjs --eval`, o un mix.
6. **Ciclo unico o due cicli:** se lo spostamento degli script è grande, separare (a) handler + CDN a path + pagine piccole e (b) gli script grandi.
