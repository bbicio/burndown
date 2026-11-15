# Brief — Sicurezza ciclo 4: dipendenze npm e librerie da CDN (S-09 + governo degli aggiornamenti)

**Tipo:** correzione di divergenza (audit-fix, Scenario 3), in gran parte meccanica. Finding coperto: **S-09**; più due punti emersi dopo l'audit, in chat il 2026-11-15, che appartengono alla stessa area (come le versioni entrano nell'app): Dockerfile senza lockfile e librerie da CDN.
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md`, raggruppamento confermato il 2026-11-15. Ordine: 4 di 6.
**Esclusa da qui:** `xlsx` (ciclo 2), che non ha un fix meccanico.

## Problema

Gli aggiornamenti delle librerie non sono governati da nessun processo: nessuno li controlla, e una build può installare versioni diverse da quelle provate. Inoltre `npm audit` riporta vulnerabilità note nelle dipendenze di produzione.

## Comportamento attuale

- `npm audit --omit=dev` (2026-11-15, da `api/`): `nodemailer` high (diretta, fix `10.5.0` breaking); `body-parser` high (transitiva, `npm audit fix`); `proxy-addr` **critical** (transitiva, IP spoofing con subnet IPv4-mapped; `npm audit fix`); `qs` moderate (`npm audit fix`); `uuid` moderate (diretta, fix `14.0.3` breaking).
- `uuid` è dichiarata in `api/package.json` ma **nessun file di `api/src` la importa** (`grep -rn "require('uuid')" api/src` → nessuna riga fuori dai test): si può rimuovere invece di aggiornarla.
- `proxy-addr` alimenta `req.ip`, chiave del limiter di login (`auth.js:226`); l'app usa `trust proxy` come numero di hop `1` (`index.js:33`), non una lista di subnet: la condizione dell'advisory probabilmente non è soddisfatta, **non verificato**.
- `api/Dockerfile` copia solo `package.json` e lancia `npm install --omit=dev` (righe 4-6): il `package-lock.json` non è usato nell'immagine, quindi i `^` si risolvono alle versioni più recenti al momento della build.
- Librerie da CDN: Bootstrap `5.3.2`, Chart.js `4.4.0`, ExcelJS `4.4.0`, Mermaid `11.4.1`, Marked `15.0.12` a versione esatta; **Vue è `https://unpkg.com/vue@3/dist/vue.global.prod.js`**, che segue l'ultima 3.x, su ogni pagina che lo carica. **Nessun tag ha `integrity`** (SRI).
- Nessun passo di `finish-cycle` né di `PROCESS.md` cita `npm audit` o l'aggiornamento delle dipendenze.

## Comportamento atteso

1. `npm audit --omit=dev` non riporta più le voci della lista sopra, salvo quelle che la spec motiva come non sfruttabili (es. `proxy-addr` con `trust proxy 1`) e `xlsx` (ciclo 2).
2. L'immagine dell'API si costruisce con `npm ci` e il lockfile: le versioni installate sono quelle del lockfile provato nei test.
3. Vue è caricato a versione esatta; ogni `<script src>` e `<link rel=stylesheet>` verso un CDN ha `integrity` e `crossorigin="anonymous"`.
4. Un guard test fallisce se un nuovo tag CDN è senza `integrity` o senza versione esatta (stile degli altri guard del repo).

## Vincoli

- **Servire le librerie dal repo invece che da CDN è escluso da questo ciclo**: cambierebbe `nginx.conf` (allowlist) e la regola «nessuna build» di `CLAUDE.md`; è una decisione di design da proporre come Brief a sé, non da assumere.
- Gli hash SRI si calcolano sul file realmente servito dalla versione fissata; la versione di Vue da fissare è quella oggi in uso (verificata, non scelta a caso), non un salto di versione.
- I major breaking (`nodemailer` 10) richiedono di verificare l'uso reale (`services/email.js`) e i test di invio; nessun cambio di comportamento delle mail.
- Una modifica a `package.json` o al lockfile fa rigirare la suite backend via `scripts/run-tests.sh`.
- `?v=N`: se un file servito dal repo cambia, aggiornarlo ovunque (`CLAUDE.md`, «Cache-busting»); le pagine HTML non sono versionate.
- **`/security-review` obbligatoria nel ciclo:** prima di `/finish-cycle`, sul branch del ciclo (dopo le modifiche e i test verdi), si esegue la skill `/security-review`; verifica che i finding del ciclo non si ripresentino e che il ciclo non ne introduca di nuovi (il ciclo 1 ha trovato così un gadget same-origin non previsto dal Brief). Un finding nuovo è proposto come Brief a sé, salvo diversa decisione dell'utente. Il Piano ha un task o una nota per questo passo, e `/finish-cycle` non lo esegue da sé.

## Criteri di accettazione

1. `npm audit --omit=dev` mostra solo voci esplicitamente motivate nella spec (e `xlsx`).
2. `docker build` dell'API usa `npm ci` (il lockfile è copiato nell'immagine) e fallisce se `package.json` e lockfile divergono.
3. `grep -o "unpkg.com/vue@[^/]*" *.html` mostra una sola versione esatta; nessun tag CDN senza `integrity`.
4. Il guard test esiste ed è verde; è rosso se si toglie un `integrity` da una pagina (verificato una volta a mano).
5. L'invio delle mail (invito, reset, codice di accesso, condivisione) funziona in `run-tests.sh` dopo l'aggiornamento di `nodemailer`.
6. Le pagine che caricano Vue/Bootstrap/Chart.js/Mermaid/Marked si aprono e funzionano (verifica manuale su almeno `pipeline.html`, `costgrid.html`, `help.html`: nessun errore di integrity in console).
7. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi (o con quelli trovati trattati come da «Nuovi finding durante il ciclo»).

## Scope escluso esplicitamente

- `xlsx` lato server e lato browser (ciclo 2).
- Ospitare le librerie localmente (Brief futuro, da proporre).
- Il processo ricorrente di controllo (`npm audit` come passo di `finish-cycle`, cadenza di revisione delle versioni): va nel ciclo di processo sulla sicurezza, dopo i fix, come deciso dall'utente.

## Nuovi finding durante il ciclo

Ogni nuovo finding scoperto durante `/brainstorming` o l'esecuzione di questo ciclo va **isolato e proposto come Brief a sé**, mai assorbito nel fix di questo ciclo (guardia dello Scenario 3 di `PROCESS.md`).
