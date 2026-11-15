# Dipendenze del backend aggiornate e librerie da CDN fissate con SRI (S-09) — design spec

**Date:** 2026-11-15
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-15-security-c4-dependencies-brief.md`
**Scenario:** 3 (correzione di divergenza), finding S-09 di `docs/superpowers/audits/2026-11-15-security-review-audit.md`

`npm audit --omit=dev` da `api/` non riporta più vulnerabilità di produzione. L'immagine dell'API installa esattamente il lockfile provato nei test. Ogni libreria caricata da CDN è a versione esatta, con `integrity` e `crossorigin="anonymous"`, e un guard test lo pretende.

## 1. Fatti verificati

- `npm audit --omit=dev` (da `api/`, 2026-11-15): `body-parser`, `proxy-addr`, `qs` transitive di `express` 4.22.2, con fix `npm audit fix`; `nodemailer` 6.10.1 diretta, fix solo in 10.x; `uuid` 10.0.0 diretta, fix solo in 11.1.1+.
- `uuid`: nessun `require('uuid')` in `api/src`.
- `nodemailer` è usato solo da `api/src/services/email.js`: `createTransport` SMTP (host/porta/auth/timeout) e `sendMail` con `from`/`to`/`subject`/`html`, più allegati in memoria (`content`, non `path`/`href`) per gli export. I breaking change 7.0 (SES), 8.0 (codice `NoAuth` → `ENOAUTH`), 9.0 (TLS verificato sul fetch di contenuti remoti) e 10.0 (Node ≥ 20) non toccano questo uso: nessun file di `api/src` legge `NoAuth`, gli allegati non sono remoti, l'immagine è `node:24-alpine`.
- `api/Dockerfile` copia solo `package.json` e lancia `npm install --omit=dev`; `node_modules` è nell'immagine (`./api/src` è il solo mount), quindi una dipendenza nuova richiede `docker compose up -d --build api`, un restart non basta.
- Tag CDN nelle pagine: Bootstrap `5.3.2` (CSS e bundle JS), Chart.js `4.4.0`, ExcelJS `4.4.0`, Marked `15.0.12`, SheetJS `xlsx-0.20.3` (`cdn.sheetjs.com`, `portfolio.html` e `project-config.html`); Vue `https://unpkg.com/vue@3/dist/vue.global.prod.js` su 24 pagine, che oggi risolve a `vue@3.5.45`. Nessun tag ha `integrity`.
- Mermaid non è un tag: `help.html:163` definisce `MERMAID_URL` (`mermaid@11.4.1/dist/mermaid.esm.min.mjs`) e `:187` lo carica con `import()` dinamico solo quando un documento ha diagrammi. Un `import()` non accetta `integrity`, e il modulo ESM importa a sua volta dei chunk dal CDN.
- La favicon `https://ik.imagekit.io/.../letter-f.png` è un `<link rel="icon">`: SRI non si applica alle icone.
- `js/lib/xlsx-version-guard.test.js` fissa già l'URL di SheetJS.

## 2. Dipendenze del backend

- `npm audit fix` in `api/` per le transitive di `express` (`body-parser`, `proxy-addr`, `qs`), senza `--force`.
- `nodemailer` a `^10.6.0` (ultima 10.x), nessuna modifica a `services/email.js`.
- `uuid` rimossa da `package.json` e dal lockfile.
- Il lockfile risultante è committato; se `npm audit --omit=dev` riporta ancora qualcosa, la voce è motivata qui prima del merge o il ciclo non è finito.

## 3. Dockerfile

- `COPY package.json package-lock.json ./` e `RUN npm ci --omit=dev`. `npm ci` fallisce se `package.json` e lockfile divergono.
- Stack principale: il rebuild di `pdash-api` (`docker compose up -d --build api`) è in Gate 4, con conferma esplicita dell'utente, mai `-v`/`--volumes`, `scripts/backup-db.sh` prima.

## 4. Librerie da CDN

- **Vue** fissato a `https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js` su tutte le 24 pagine.
- **SRI.** Ogni `<script src>` e `<link rel="stylesheet" href>` verso un CDN riceve `integrity="sha384-…"` e `crossorigin="anonymous"`. L'hash si calcola sul file scaricato dall'URL esatto (`curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`), uno per URL.
- **Mermaid** passa dal modulo ESM al build UMD `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js`, stessa versione. Resta caricato solo quando serve: `renderMermaid` crea un `<script>` con `src`, `integrity`, `crossOrigin = 'anonymous'`, lo aggiunge al documento e risolve con `window.mermaid` al `load` (rifiuta all'`error`, come oggi un `import()` fallito). `mermaidPromise` resta la cache. `initialize`/`run` restano invariati, `securityLevel: 'strict'` compreso.
- Le pagine HTML non sono versionate; nessun file `js/`/`css/` del repo cambia, quindi nessun `?v=N` da aggiornare. Se il loader di Mermaid finisse in un file `js/`, il suo `?v=N` va aggiornato ovunque.

## 5. Guard test

`scripts/cdn-integrity-guard.test.js` (vitest, già incluso da `vitest.config.js`), sulle pagine `*.html` della root e sui file `js/**/*.js` esclusi i test:

1. Ogni `<script src="https://…">` e `<link rel="stylesheet" href="https://…">` ha `integrity` con prefisso `sha384-` e `crossorigin="anonymous"`.
2. Ogni URL di CDN (`cdn.jsdelivr.net`, `unpkg.com`, `cdn.sheetjs.com`) contiene una versione esatta `x.y.z` dopo il nome del pacchetto: `vue@3`, `@latest` e range sono rossi.
3. Un URL di CDN che compare fuori da un tag (oggi solo il loader di Mermaid in `help.html`) richiede, nello stesso file, una stringa `sha384-` assegnata come `integrity` accanto al suo URL; altrimenti è rosso.
4. Lo stesso URL ha lo stesso hash in ogni pagina che lo carica.

Il guard non scarica nulla e non verifica che l'hash sia corretto: un hash sbagliato si vede solo nel browser (risorsa bloccata, errore in console). Questo limite sta nell'intestazione del file, nello stile degli altri guard.

## 6. Test

- `scripts/run-tests.sh` (suite backend completa, ci sono dipendenze cambiate): le mail di invito, reset, codice di accesso e condivisione arrivano a Mailpit dopo l'aggiornamento di `nodemailer`.
- `npm test`: guard nuovo verde; rosso una volta, a mano, togliendo un `integrity` da una pagina.
- `docker build` di `api/` con `npm ci` riesce; con una dipendenza aggiunta a `package.json` senza lockfile fallisce (verificato una volta a mano).
- Manuale su `scripts/test-branch.sh` (che ricostruisce l'immagine da sé): `pipeline.html`, `costgrid.html`, `help.html` con un documento che ha diagrammi, più una pagina con Chart.js (`portfolio.html`); nessun errore di integrity in console, i diagrammi Mermaid si disegnano.
- `/security-review` sul branch dopo i test verdi e prima di `/finish-cycle`: un task del Piano, non eseguito da `/finish-cycle`.

## 7. Fuori dal ciclo

`xlsx` come libreria (ciclo 2; qui riceve solo l'attributo `integrity`), servire le librerie dal repo, `npm audit` come passo di processo, la favicon esterna. Un finding nuovo si isola come Brief a sé.

## Decisioni aperte

1. **Mermaid passa al build UMD caricato su richiesta con `integrity`.** Alternative scartate: un import map con `integrity` per il modulo ESM e per tutti i suoi chunk, o Mermaid lasciato come eccezione motivata. Perché: un solo file e un solo hash da mantenere, nessun requisito di browser recente, criterio 3 soddisfatto senza eccezioni.
2. **Vue fissato a 3.5.45, la versione a cui `vue@3` risolve oggi.** Alternativa scartata: fissarlo all'ultima 3.x al momento dell'esecuzione. Perché: il Brief chiede di fissare la versione già in uso, non di fare un salto.
3. **`nodemailer` a `^10.6.0` senza toccare `services/email.js`.** Alternativa scartata: fermarsi a 10.5.0, la prima versione con il fix. Perché: nessun breaking change tra 10.5 e 10.6 tocca l'uso di SMTP semplice, e l'ultima minor riduce il prossimo audit.
4. **`uuid` rimossa, non aggiornata.** Alternativa scartata: aggiornarla a 14.x. Perché: nessun file la importa.
5. **Il tag SheetJS riceve `integrity` in questo ciclo.** Alternativa scartata: lasciarlo al ciclo 2, che ha escluso `xlsx`. Perché: la versione non cambia, cambia solo l'attributo, e il criterio 3 chiede che nessun tag CDN ne sia privo.
6. **SRI solo su script e fogli di stile; la favicon resta fuori.** Alternativa scartata: portare in locale la favicon. Perché: SRI non si applica a `rel="icon"`, e servire file dal repo è fuori dal ciclo.
7. **Hash `sha384`.** Alternativa scartata: `sha512`. Perché: è l'algoritmo che pubblicano i CDN e i generatori SRI, e il guard pretende un solo prefisso.

## Criteri di accettazione

1. **Audit** — `npm audit --omit=dev` da `api/` non mostra vulnerabilità, o solo voci motivate in questa spec.
2. **Lockfile nell'immagine** — `api/Dockerfile` copia `package-lock.json` e usa `npm ci --omit=dev`; la build fallisce se `package.json` e lockfile divergono.
3. **Versioni esatte e SRI** — `grep -o "unpkg.com/vue@[^/]*" *.html | sort -u` mostra solo `vue@3.5.45`; nessun tag CDN senza `integrity` e `crossorigin="anonymous"`; Mermaid caricato con `integrity`.
4. **Guard** — `scripts/cdn-integrity-guard.test.js` esiste ed è verde; è rosso togliendo un `integrity` da una pagina (verificato una volta a mano).
5. **Mail** — in `run-tests.sh` le mail di invito, reset, codice di accesso e condivisione funzionano dopo l'aggiornamento di `nodemailer`.
6. **Pagine** — `pipeline.html`, `costgrid.html`, `help.html` (con diagrammi) e `portfolio.html` si aprono e funzionano, senza errori di integrity in console.
7. **Security review** — `/security-review` eseguita sul branch prima di `/finish-cycle`, senza finding nuovi, o con quelli trovati trattati come Brief a sé.
