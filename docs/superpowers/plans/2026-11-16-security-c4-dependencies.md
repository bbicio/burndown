# Dipendenze del backend aggiornate e librerie da CDN fissate con SRI (S-09) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm audit --omit=dev` da `api/` pulito, immagine dell'API costruita con `npm ci` sul lockfile, ogni libreria da CDN a versione esatta con `integrity` sha384 e `crossorigin="anonymous"`, pretesi da un guard test.

**Architecture:** In `api/`, `npm audit fix` per le transitive di `express`, `nodemailer` a `^10.6.0`, `uuid` rimossa, Dockerfile con `npm ci`. Nelle pagine, Vue fissato a 3.5.45 e gli attributi SRI aggiunti a ogni tag CDN; Mermaid in `help.html` passa dal modulo ESM al build UMD caricato su richiesta con `integrity`. `scripts/cdn-integrity-guard.test.js` pretende tutto questo.

**Tech Stack:** npm, Docker (`node:24-alpine`), HTML statico, vitest (guard), `test-api.js` + Mailpit (integrazione).

**Spec:** `docs/superpowers/specs/2026-11-15-security-c4-dependencies-design.md`
**Branch:** `security-c4-dependencies`
**Risk class:** high-risk — file Docker (`api/Dockerfile`) e la libreria che invia il codice di accesso del login (`nodemailer`) (§6.1b)

**Indipendenza dei task:** i task non sono indipendenti (il 3 e il 4 rendono verde il guard del 2, il 5 prova insieme il 1, il 3 e il 4): esecuzione nativa (§6.1). Il worktree si crea come da §6.1b (`git worktree add .claude/worktrees/security-c4-dependencies -b security-c4-dependencies`), poi si copia `.env` dal checkout principale e si esegue `npm ci` in radice e in `api/`.

## Global Constraints

- Vue: `https://unpkg.com/vue@3.5.45/dist/vue.global.prod.js`, nessuna altra versione. Mermaid: `https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js`. Le altre versioni non cambiano: Bootstrap `5.3.2`, Chart.js `4.4.0`, ExcelJS `4.4.0`, Marked `15.0.12`, SheetJS `xlsx-0.20.3`.
- Hash: solo `sha384`, calcolato sul file scaricato dall'URL esatto: `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`, scaricato due volte con esito identico. Un hash per URL, uguale in tutte le pagine.
- Ogni tag CDN porta `integrity="sha384-…" crossorigin="anonymous"`; gli altri attributi del tag (`defer`, `rel`) restano. La favicon `ik.imagekit.io` (`rel="icon"`) è esclusa.
- I quattro CDN rispondono `Access-Control-Allow-Origin: *` (verificato il 2026-11-15), condizione perché `crossorigin` + `integrity` funzionino.
- `nodemailer` `^10.6.0`, nessuna modifica a `api/src/services/email.js`. `uuid` rimossa. `npm audit fix` senza `--force`.
- Le pagine HTML si modificano con l'Edit tool o con uno script Node scritto con il Write tool nella scratchpad (mai `Get-Content`/`Set-Content`, mai `node -e` con backslash); dopo, `git diff --numstat` e nessun BOM aggiunto (i primi tre byte di ogni pagina toccata non sono `EF BB BF`).
- Nessun `js/*.js`, `js/lib/*.js` o `css/*.css` versionato è toccato: nessun `?v=N` da aggiornare. Se il loader di Mermaid finisce in un file `js/`, il suo `?v=N` va aggiornato ovunque.
- Testo rivolto all'utente in inglese. Nessun `docker compose` sullo stack principale durante l'esecuzione: il rebuild di `pdash-api` (`docker compose up -d --build api`) è al Gate 4 di `/finish-cycle`, dopo `scripts/backup-db.sh`, con conferma esplicita dell'utente, mai `-v`/`--volumes`.

## Review Focus

1. Un documento di `help.html` con diagrammi aperto, poi un secondo con diagrammi: Mermaid si scarica una volta sola (cache `mermaidPromise`) e il secondo si disegna (Task 4).
2. Mermaid irraggiungibile o con hash errato: `renderMermaid` rifiuta e la pagina mostra il documento senza diagrammi come oggi con un `import()` fallito, senza promessa appesa per sempre (Task 4).
3. Un tag CDN scritto su più righe o con attributi in ordine diverso (`crossorigin` prima di `integrity`, `defer` in fondo) è riconosciuto dal guard (Task 2).
4. Una pagina che carica Chart.js o ExcelJS (`portfolio.html`, `project-config.html`) si apre senza errori di integrity, non solo le tre del Brief (Task 5).
5. La mail del codice di accesso arriva a Mailpit con `nodemailer` 10: il login di un utente con verifica in due passi non si blocca (Task 5, `MAIL-09`).

---

### Task 1: Dipendenze del backend e Dockerfile

**Files:**
- Modify: `api/package.json`, `api/package-lock.json`, `api/Dockerfile`

- [ ] **Step 1: Aggiorna le dipendenze**, da `api/`: `npm uninstall uuid`, `npm install nodemailer@^10.6.0`, `npm audit fix`.
- [ ] **Step 2: Verifica l'audit**

Run: `cd api && npm audit --omit=dev`
Expected: `found 0 vulnerabilities`. Una voce residua si ferma qui: va motivata nella spec prima di proseguire.
- [ ] **Step 3: Dockerfile**: `COPY package.json package-lock.json ./` e `RUN npm ci --omit=dev` al posto delle righe 4-5.
- [ ] **Step 4: Verifica la build e il suo fallimento**

Run: `docker build -t pdash-api-c4 api` → riesce. Poi, solo nella copia di lavoro, aggiungi a `api/package.json` una dipendenza assente dal lockfile (es. `"left-pad": "1.3.0"`) e ripeti → fallisce con un errore di `npm ci` su `package.json` e lockfile fuori sincrono; ripristina con `git checkout api/package.json`, poi `docker image rm pdash-api-c4`.
- [ ] **Step 5: Backend unit test**

Run: `cd api && npm test`
Expected: tutti verdi.
- [ ] **Step 6: Commit**

```bash
git add api/package.json api/package-lock.json api/Dockerfile
git commit -m "fix(deps): update nodemailer and express transitives, drop uuid, build with npm ci (S-09)"
```

---

### Task 2: Guard test SRI

**Files:**
- Create: `scripts/cdn-integrity-guard.test.js`

**Interfaces:**
- Produces: l'oggetto che il Task 4 scrive in `help.html`, su **una riga**: `const MERMAID = { src: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', integrity: 'sha384-…' };`

- [ ] **Step 1: Scrivi il guard.** Intestazione nello stile di `scripts/doc-paths-guard.test.js` (perché esiste, cosa deliberatamente non controlla: correttezza dell'hash, CDN fuori dalla lista, file fuori dallo scope). Scope: le `*.html` della root e `js/**/*.js` esclusi `*.test.js`. CDN: `cdn.jsdelivr.net`, `unpkg.com`, `cdn.sheetjs.com`. Una tabella di casi sintetici (stringhe in memoria) prova ogni regola sia verde sia rossa; poi i test sul repo vero:
  - `every CDN tag carries sha384 integrity and crossorigin anonymous` — ogni `<script …src="https://<cdn>…">` e `<link …rel="stylesheet"…href="https://<cdn>…">`, con il tag letto fino al suo `>` anche su più righe e attributi in qualunque ordine, ha `integrity="sha384-[A-Za-z0-9+/=]+"` e `crossorigin="anonymous"` (Review Focus 3: un caso sintetico multi-riga e uno con `crossorigin` prima di `integrity`).
  - `every CDN URL pins an exact x.y.z version` — dopo l'host, il segmento del pacchetto ha `@\d+\.\d+\.\d+/` o `-\d+\.\d+\.\d+/`; casi rossi: `vue@3/`, `vue@latest/`, `vue@^3.5.0/`.
  - `a CDN URL outside a tag sits on a line with its integrity` — un URL di CDN fuori da un tag è rosso se la stessa riga non contiene `integrity: 'sha384-`.
  - `the same URL has the same hash everywhere` — mappa URL → insieme di hash, ogni insieme di dimensione 1.
- [ ] **Step 2: Verifica che fallisca sul repo**

Run: `npx vitest run scripts/cdn-integrity-guard.test.js`
Expected: i casi sintetici verdi; i quattro test sul repo rossi (tag senza `integrity`, `vue@3/`, `MERMAID_URL` senza integrity).
- [ ] **Step 3: Commit** (rosso voluto, reso verde dai Task 3 e 4)

```bash
git add scripts/cdn-integrity-guard.test.js
git commit -m "test(cdn): guard exact versions and SRI on CDN libraries (S-09)"
```

---

### Task 3: Vue fissato e SRI sui tag delle pagine

**Files:**
- Modify: ogni `*.html` della root con un tag CDN (`grep -l "cdn.jsdelivr.net\|unpkg.com\|cdn.sheetjs.com" *.html`, 24 pagine)

- [ ] **Step 1: Calcola gli hash** dei sette URL (Bootstrap CSS, Bootstrap bundle JS, Chart.js, ExcelJS, Marked, SheetJS, Vue 3.5.45) con il comando delle Global Constraints, due volte ciascuno; tienili nella scratchpad.
- [ ] **Step 2: Riscrivi le pagine** con uno script Node nella scratchpad (Write tool): `vue@3/` → `vue@3.5.45/`, poi in ogni tag CDN inserisce ` integrity="<hash>" crossorigin="anonymous"` prima della chiusura del tag, senza toccare il resto.
- [ ] **Step 3: Verifica la forma**

Run: `git diff --numstat -- '*.html'` (righe cambiate solo nei tag), il controllo dei primi tre byte delle pagine toccate (nessun `EF BB BF`), `grep -o "unpkg.com/vue@[^/]*" *.html | sort -u` → solo `unpkg.com/vue@3.5.45`.
- [ ] **Step 4: Verifica il guard**

Run: `npx vitest run scripts/cdn-integrity-guard.test.js`
Expected: verdi tutti tranne `a CDN URL outside a tag sits on a line with its integrity` (Mermaid, Task 4).
- [ ] **Step 5: Commit**

```bash
git add *.html
git commit -m "fix(cdn): pin Vue 3.5.45 and add SRI to every CDN tag (S-09)"
```

---

### Task 4: Mermaid UMD con integrity

**Files:**
- Modify: `help.html:163` (costante), `help.html:184-191` (`renderMermaid`)

**Interfaces:**
- Consumes: la forma su una riga di `const MERMAID` (Task 2).

- [ ] **Step 1: Calcola l'hash** di `mermaid@11.4.1/dist/mermaid.min.js` come nel Task 3.
- [ ] **Step 2: Sostituisci** `MERMAID_URL` con `const MERMAID = { src, integrity }` su una riga, e `import(MERMAID_URL)` con `loadMermaid()`: crea un `<script>` con `src`, `integrity`, `crossOrigin = 'anonymous'`, lo aggiunge a `document.head`, risolve con `window.mermaid` al `load`, rifiuta all'`error` e azzera `mermaidPromise` così che un documento successivo riprovi (Review Focus 2). `const mermaid = window.mermaid` al posto di `mod.default`; `initialize` e il resto invariati, `securityLevel: 'strict'` compreso.
- [ ] **Step 3: Verifica**

Run: `npx vitest run scripts/cdn-integrity-guard.test.js js/lib/handbook.test.js scripts/handbook-guard.test.js`
Expected: tutti verdi.
- [ ] **Step 4: Rosso a mano, una volta**: togli l'`integrity` da un tag di `pipeline.html`, il guard è rosso e nomina `pipeline.html`; ripristina con `git checkout pipeline.html`.
- [ ] **Step 5: Commit**

```bash
git add help.html
git commit -m "fix(help): load Mermaid's UMD build with SRI (S-09)"
```

---

### Task 5: Mail e pagine sul branch

**Files:**
- Modify: `test-api.js` (sezione `Mail failures`, prima del chaos di Mailpit)

- [ ] **Step 1: Aggiungi due controlli**, con Mailpit svuotato prima di ciascuno:
  - **MAIL-09** — un login di un utente di prova con verifica in due passi recapita a Mailpit un messaggio al suo indirizzo con oggetto `PDash — Your sign-in code` e un codice di sei cifre nel corpo.
  - **MAIL-10** — una condivisione di un cost grid con mail attiva → `201`, `emailSent === true`, e un messaggio al destinatario il cui oggetto contiene `shared a`.
  Invito e reset sono già provati da `AT-01`/`AT-02`, l'export da `MAIL-01`.
- [ ] **Step 2: Suite d'integrazione**

Run: `scripts/run-tests.sh`
Expected: tutti verdi, inclusi `MAIL-01`…`MAIL-10`, `AT-01`…`AT-04`, e i backend unit test.
- [ ] **Step 3: `npm test`** in radice → tutti verdi.
- [ ] **Step 4: Verifica manuale su `scripts/test-branch.sh up`** (ricostruisce l'immagine): `pipeline.html`, `costgrid.html`, `portfolio.html` (Chart.js), `project-config.html` (ExcelJS, SheetJS), `help.html` con due documenti di diagrammi aperti in sequenza (Review Focus 1, una sola richiesta a `mermaid.min.js` nel pannello di rete). Console senza errori di integrity, diagrammi disegnati. Lo stack del branch resta su: lo smonta `/finish-cycle` al Gate 2.
- [ ] **Step 5: Commit**

```bash
git add test-api.js
git commit -m "test(mail): sign-in code and share mails reach Mailpit (S-09)"
```

---

### Task 6: `/security-review` sul branch

**Files:** nessuna modifica prevista.

- [ ] **Step 1: Run `/security-review`** sul branch `security-c4-dependencies`, con i test del Task 5 verdi. Controlla che S-09 non si ripresenti e che il ciclo non ne introduca di nuovi.
- [ ] **Step 2: Disposizione.** Un finding nuovo si propone come Brief a sé (guardia dello Scenario 3), salvo diversa decisione dell'utente; un difetto del codice di questo ciclo si corregge nel branch con il test mirato e si riesegue la review. `/finish-cycle` non esegue questo passo da sé.
- [ ] **Step 3: Note per `/sync-docs`** (le scrive la procedura, non questo piano): `CLAUDE.md` «Cache-busting» (i CDN restano esenti da `?v=N` ma portano SRI, regola nel guard); la riga del guard nel blocco File structure; `docs/pages/help.md` (Mermaid UMD); la lezione sul rebuild di `pdash-api` per un cambio di dipendenze.

---

## Decisioni aperte

1. **`MAIL-09` e `MAIL-10` nuovi in `test-api.js`.** Alternativa scartata: considerare sufficienti i controlli esistenti. Perché: il codice di accesso nei test si legge con `two-step-code.js` e nessun controllo verifica il recapito di una condivisione, quindi il criterio 5 non sarebbe provato.
2. **Mermaid in errore azzera `mermaidPromise`.** Alternativa scartata: tenere in cache il rifiuto come fa oggi la promessa di `import()`. Perché: con il loader a script un errore di rete transitorio bloccherebbe i diagrammi fino al ricaricamento della pagina, e riprovare al documento successivo non costa nulla.
3. **Il guard riconosce l'URL fuori da un tag solo se `integrity: 'sha384-` è sulla stessa riga.** Alternativa scartata: cercare l'hash nelle righe vicine. Perché: una sola forma, `const MERMAID = { src, integrity }`, è controllabile senza euristiche.
