# Privacy Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La voce di menu `Settings` e la pagina vuota `settings.html` diventano "Privacy Notice", una pagina in sola lettura con l'ultima versione pubblicata dei T&C e versione + data di pubblicazione in calce.

**Architecture:** Nuova pagina Vue `privacy-notice.html` che legge `GET /api/app-settings/terms` con `apiFetch` e rende `content` con `v-html`; `settings.html` si elimina, senza redirect; in `js/nav.js` cambiano etichetta, icona, id e destinazione della voce del menu account. Nessuna modifica API.

**Tech Stack:** HTML + Vue 3 da CDN, nessun build; vitest + jsdom per i guard.

**Spec:** `docs/superpowers/specs/2026-11-06-privacy-notice-design.md`
**Branch:** `privacy-notice`
**Risk class:** high-risk — `js/nav.js` è un file condiviso caricato da più pagine (§6.1b).

## Global Constraints

- Testo utente in inglese; copy esatte: titolo `Privacy Notice`, `<title>PDash — Privacy Notice</title>`, breadcrumb `Home › Privacy Notice`, errore `Unable to load the privacy notice. Please refresh or contact your administrator.`, vuoto `No privacy notice has been published yet.`, calce `Version {version} · Published {data}` (solo `Version {version}` senza data valida).
- Data: `formatDayText(String(updatedAt).slice(0, 10))` — giorno UTC (decisione 7 della Spec, confermata).
- Nessun hex fisso: solo `var(--token)`.
- Ogni `?v=N` di `js/nav.js` bumpato allo stesso nuovo valore in tutto il repo (oggi `?v=21`, compreso `js/lib/nav-shell-guard.test.js:96`).
- Edit di HTML solo con l'Edit tool, mai `Get-Content`/`Set-Content` (BOM).
- Nessun comando Docker sul main stack.

## Review Focus

1. **Contenuto largo** (tabelle, immagini, URL lunghi nell'HTML del sysadmin) a larghezza smartphone → nessuno scroll orizzontale della pagina: `img { max-width: 100% }`, `overflow-wrap: anywhere`, tabelle in scroll proprio. Verifica in Task 2 step 6.
2. **Tabella `terms_versions` vuota** → l'API dà `version: 1`, `content: ''`, `updatedAt: null`: la pagina mostra il messaggio "No privacy notice…" e la calce non compare. Pin nel guard di Task 2 (il messaggio esiste nel markup).
3. **`updatedAt` null o malformato** → calce `Version N` senza "· Published". Comportamento del computed in Task 2.
4. **Errore di rete/500** → messaggio d'errore, spinner spento. Task 2.
5. **Utente non loggato** → `apiFetch`/`initNav` portano a `/login.html`, nessun flash di contenuto. Verifica manuale (criterio 10).

I task sono **sequenziali**, non indipendenti: Task 2 dipende dall'id e dalla destinazione fissati in Task 1, Task 3 dagli id di pagina di Task 2.

---

### Task 1: Voce di menu in `js/nav.js`

**Files:**
- Modify: `js/nav.js:4` (commento di testa), `js/nav.js:102` (voce), `js/nav.js:689-699` (handler)
- Modify: ogni `*.html` con `js/nav.js?v=21` → `?v=22`; `js/lib/nav-shell-guard.test.js:96`
- Test: `js/lib/nav-model.test.js`

**Interfaces:**
- Produces: `#nav-privacy-btn` nel menu account, click → `window.location.href = '/privacy-notice.html'`; la tab `'privacy'` per `initNav` non evidenzia nulla.

- [ ] **Step 1: Aggiorna i test** in `js/lib/nav-model.test.js`:
  - nell'elenco di "keeps every existing element id" `'nav-settings-btn'` → `'nav-privacy-btn'`;
  - il caso "out-of-menu activeTab" usa `build('sysadmin', 'privacy')` e il titolo dice `(privacy)`;
  - nuovo caso:
    ```js
    it('the account menu has a Privacy Notice entry and no Settings entry', () => {
      const el = build('user');
      expect(el.querySelector('#nav-privacy-btn').textContent.trim()).toBe('Privacy Notice');
      expect(el.querySelector('#nav-privacy-btn svg')).not.toBeNull();
      expect(el.querySelector('#nav-settings-btn')).toBeNull();
      expect(el.querySelector('.pd-account-menu').textContent).not.toContain('Settings');
    });
    ```
- [ ] **Step 2:** `npx vitest run js/lib/nav-model.test.js` → FAIL (`nav-privacy-btn` non trovato).
- [ ] **Step 3: Implementa** — voce `<li><button class="dropdown-item" id="nav-privacy-btn">${navIcon('terms')}Privacy Notice</button></li>` nella stessa posizione; l'handler dentro il blocco `stgAlreadyWired` prende `nav-privacy-btn` e va a `/privacy-notice.html`; il commento a `:4` diventa "injects the shared modals (change password, send notification, My Profile)".
- [ ] **Step 4:** `npx vitest run js/lib/nav-model.test.js` → PASS.
- [ ] **Step 5: Bump `?v=`** — `grep -rln "js/nav.js?v=21" --include=*.html --include=*.js . | grep -v node_modules` e porta ogni riferimento a `?v=22`; poi `grep -rn "js/nav.js?v=" --include=*.html --include=*.js . | grep -v node_modules | grep -v "v=22"` → nessun output.
- [ ] **Step 6:** `npx vitest run js/lib/` → PASS. (`nav-shell-guard` conosce ancora `settings` in `PAGES`: resta verde perché `settings.html` non è ancora cambiata.)
- [ ] **Step 7: Commit** — `git commit -m "feat(nav): account menu entry Settings → Privacy Notice"`.

### Task 2: Pagina `privacy-notice.html`, eliminazione di `settings.html`

**Files:**
- Create: `privacy-notice.html`
- Delete: `settings.html`
- Modify: `js/lib/nav-shell-guard.test.js:44` (`'settings'` → `'privacy-notice'`), `js/lib/page-head-guard.test.js:26` (`'settings.html'` → `'privacy-notice.html'`)
- Test (create): `js/lib/privacy-notice-guard.test.js`

**Interfaces:**
- Consumes: `initNav('privacy', { breadcrumbs })` (Task 1), `apiFetch(url)` (`js/api.js`, restituisce il JSON, lancia su `!ok`, porta al login su 401), `formatDayText(iso)` (bridge `window.formatDayText` da `js/lib/dates.js?v=4`).
- Produces: la pagina `/privacy-notice.html`; `settings.html` non esiste più.

- [ ] **Step 1: Scrivi il guard** `js/lib/privacy-notice-guard.test.js` (legge i file con `readFileSync(join(process.cwd(), …))`, come `nav-shell-guard`):
  - `privacy-notice.html` non matcha `/<button|<input|<form|<textarea|<select/i`;
  - contiene `js/lib/dates.js?v=4`, `/api/app-settings/terms`, `initNav('privacy'`, `<title>PDash — Privacy Notice</title>`, `No privacy notice has been published yet.`, `Unable to load the privacy notice. Please refresh or contact your administrator.`;
  - non matcha `/#[0-9a-fA-F]{3,8}\b/` nel suo `<style>`;
  - `existsSync('settings.html')` è `false`, e nessun `*.html` alla radice né `js/**/*.js` (esclusi i `*.test.js`) contiene la stringa `settings.html`.
- [ ] **Step 2:** aggiorna `PAGES` in `nav-shell-guard.test.js` e l'elenco `.page-header` in `page-head-guard.test.js`; `npx vitest run js/lib/privacy-notice-guard.test.js js/lib/nav-shell-guard.test.js js/lib/page-head-guard.test.js` → FAIL (`privacy-notice.html` mancante, `settings.html` ancora presente).
- [ ] **Step 3: Crea `privacy-notice.html`** copiando la struttura di `settings.html` (snippet sidebar, CSS `tokens/style/admin-crud` con i loro `?v=` attuali, page shell, script `defer`/`module` nello stesso ordine, `nav.js?v=22`) e aggiungendo `<script type="module" src="js/lib/dates.js?v=4"></script>` prima dello script della pagina. Vue `data`: `ready`, `loading`, `loadError`, `content`, `version`, `updatedAt`. `created()`: `initNav('privacy', …)`, `ready = true`, poi `apiFetch('/api/app-settings/terms')` in `try/catch` → `loadError` con la copy esatta. Computed `footerLine`: `Version ${version}` + (`formatDayText(String(updatedAt).slice(0, 10))` non vuoto ? ` · Published ${data}` : ''). Template: `.ph` con `Privacy Notice`; card `.pn-doc` con spinner (`loading`), errore, vuoto (`!content`), oppure `<div class="pn-body" v-html="content"></div>` + `<p class="pn-footer">{{ footerLine }}</p>`. `<style>` di pagina: card bianca (`var(--surface-…)`, bordo/raggio dei token), `max-width: 780px`, tipografia h2/p/li di `terms.html:33-34` coi token, `.pn-body img { max-width: 100% }`, `.pn-body { overflow-wrap: anywhere }`, `.pn-body table { display: block; overflow-x: auto }`, `.pn-footer` muted con `border-top` sottile.
- [ ] **Step 4: Elimina `settings.html`** — `git rm settings.html`.
- [ ] **Step 5:** `npx vitest run js/lib/` → PASS. (`scripts/doc-paths-guard.test.js` è rosso finché Task 3 non aggiorna i documenti: atteso.)
- [ ] **Step 6: Verifica visiva** (§6.3, una per ciclo) — su uno stack di branch (`scripts/test-branch.sh up`, `.env` copiato dal checkout principale) `node scripts/shoot.mjs` su `/privacy-notice.html` a 1440 e 390 px (invocazione: `docs/scripts/shoot.md`); leggi le PNG: titolo, testo, calce `Version N · Published …`, nessuno scroll orizzontale a 390. Annota le PNG lette nel report.
- [ ] **Step 7: Commit** — `git commit -m "feat(privacy-notice): read-only Terms page replaces the empty Settings page"`.

### Task 3: Documentazione che cita `settings.html`

**Files:**
- Modify: `TEST_CASES.md:42-44`, `:54`
- Rename: `docs/pages/settings.md` → `docs/pages/privacy-notice.md` (`git mv`), più una sezione `## Privacy Notice (2026-11-06)` con lo stato corrente
- Modify: `CLAUDE.md:111` (riga della tabella Pages → `privacy-notice.html`, link a `docs/pages/privacy-notice.md`), `CLAUDE.md:233` ("settings link to `/settings.html`" → "Privacy Notice link to `/privacy-notice.html`")
- Modify: `ARCHITECTURE.md:998`, `docs/prd/notifications.md:7,11`, `docs/js/nav.md` (nuova sezione in coda: voce `#nav-privacy-btn` → `/privacy-notice.html`, `settings.html` eliminata), `.claude/skills/operational-manual/SKILL.md:165`
- Modify: `scripts/doc-paths-guard.test.js` — voce `GONE` `['settings.html', 'deleted by the privacy-notice cycle (2026-11-06); only historical mentions remain']`

- [ ] **Step 1:** N-03 → "Privacy Notice opens a page": click "Privacy Notice" nel menu account → `/privacy-notice.html`. ST-01/ST-02 sostituiti da:
  - PN-01 Privacy Notice content — apri `/privacy-notice.html` → breadcrumb Home › Privacy Notice, titolo Privacy Notice, testo dei T&C pubblicati, nessun pulsante/checkbox, calce `Version N · Published Mon D, YYYY`;
  - PN-02 Privacy Notice requires login — logout, apri `/privacy-notice.html` → login.
  N-12: `/settings.html` → `/privacy-notice.html`, "settings highlights nothing" → "privacy notice highlights nothing".
- [ ] **Step 2:** aggiorna gli altri file della lista: la prosa al presente descrive la Privacy Notice; le menzioni al passato di `settings.html` (es. la sezione 2026-09-30 di `docs/js/nav.md`) restano, coperte dalla voce `GONE`.
- [ ] **Step 3:** `grep -rn "settings.html|pages/settings.md" --include=*.md . | grep -v node_modules | grep -v docs/superpowers` → solo menzioni al passato.
- [ ] **Step 4:** `npm test` → PASS (compresi `doc-paths-guard` e `claude-md-guard`).
- [ ] **Step 5: Commit** — `git commit -m "docs: Privacy Notice replaces the Settings page in the live docs"`.

## Decisioni aperte

1. **Nessuna funzione pura in `js/lib/` per la calce.** Alternativa scartata: `privacyFooterLine(version, updatedAt)` testata con vitest. Perché: la Spec non la prevede, è una riga di computed, e il comportamento è coperto dalla verifica visiva e dal criterio 6.
