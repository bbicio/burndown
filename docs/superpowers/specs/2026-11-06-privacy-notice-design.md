# Privacy Notice — la pagina Settings diventa la consultazione dei T&C — design spec

**Date:** 2026-11-06
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-06-privacy-notice-brief.md`
**Scenario:** 2 (evoluzione di una feature esistente)

La voce `⚙ Settings` del menu account e la pagina vuota `settings.html` diventano **Privacy Notice**: una pagina in
sola lettura che mostra l'ultima versione pubblicata dei Terms & Conditions, con versione e data di pubblicazione in
calce. Nessuna modifica API, nessuna migrazione. Lo scope escluso è quello confermato nel Brief.

## 1. Fatti verificati nel codice (a `abbf9e0`)

- `js/nav.js:102` — voce `<button class="dropdown-item" id="nav-settings-btn">${navIcon('config')}Settings</button>`;
  `js/nav.js:611-614` — il click fa `window.location.href = '/settings.html'`.
- `settings.html` — `initNav('settings', { breadcrumbs: Home › Settings })`, `.ph` con `<h1 class="ph-title">Settings</h1>`,
  spinner finché `ready`; carica `api.js`, `core.js`, `notif-browser.js`, `notifications.js`, `icons.js`, `nav.js`.
- `GET /api/app-settings/terms` (`api/src/routes/app-settings.js:25-42`, `requireAuth`) — ultima riga di
  `terms_versions`: `{ version, content, updatedAt: published_at, updatedBy }`; `version` vale 1 e `content` `''` se la
  tabella è vuota.
- `js/lib/dates.js` — `formatDayText(iso)` accetta solo `'YYYY-MM-DD'` e restituisce `'Dec 1, 2025'` (`''` se malformato);
  `updatedAt` arriva come timestamp ISO (`2026-10-12T09:30:00.000Z`).
- Riferimenti a `settings`: `js/lib/nav-model.test.js:83-84` (tab fuori menu), `:96` (elenco id),
  `js/lib/nav-shell-guard.test.js:44` (`PAGES`), `js/lib/page-head-guard.test.js:26` (pagine `.page-header`).

## 2. Pagina — `privacy-notice.html` (nuova)

- Struttura come ogni pagina autenticata: snippet `PDash_sidebarCollapsed` nel `<head>`, page shell
  (`#app-shell` / `#nav-container` / `#app-main`), radice Vue con `v-cloak`, `.ph` con `<h1 class="ph-title">Privacy Notice</h1>`,
  `icons.js` prima di `nav.js`, stessi `?v=N` delle altre pagine. `<title>PDash — Privacy Notice</title>`.
- `initNav('privacy', { breadcrumbs: [{ label: 'Home', href: '/pipeline.html' }, { label: 'Privacy Notice' }] })`;
  `'privacy'` non è una tab del menu, quindi nulla è evidenziato (come oggi `settings`).
- Carica anche `js/lib/dates.js` (modulo, `?v=` uguale agli altri riferimenti).
- Dopo `initNav`: `apiFetch('/api/app-settings/terms')` (un 401 porta al login tramite `apiFetch`).
- Stati:
  - caricamento → spinner;
  - errore → `Unable to load the privacy notice. Please refresh or contact your administrator.`;
  - `content` vuoto → `No privacy notice has been published yet.`;
  - altrimenti il contenuto con `v-html` (HTML del sysadmin, come `terms.html:69`).
- Impaginazione: card bianca, colonna di lettura di circa 780px; tipografia di h2/p/li ripresa da `terms.html:33-34`, in un
  blocco `<style>` della pagina limitato alla classe del documento, solo token.
- Riga in calce, separata da un bordo sottile, testo muted: `Version {version} · Published {data}`; senza data
  valida solo `Version {version}`. Data: `formatDayText(String(updatedAt).slice(0, 10))`, cioè il giorno UTC di pubblicazione.
- Nessun `<button>`, `<input>`, `<form>` nella pagina.

## 3. `settings.html` eliminata

`settings.html` si cancella, senza redirect: nessun link la cita tranne la voce di menu, che passa a
`/privacy-notice.html`. `/settings.html` risponde 404. Esce da `nav-shell-guard` e `page-head-guard`.
`scripts/doc-paths-guard.test.js` fallisce su ogni documento vivo che citi ancora `settings.html` o
`docs/pages/settings.md`: quei documenti si aggiornano nel branch (§6), e le sole menzioni al passato restano
coperte da una voce `GONE` per `settings.html`.

## 4. Menu — `js/nav.js`

- Voce: `<button class="dropdown-item" id="nav-privacy-btn">${navIcon('terms')}Privacy Notice</button>`, stessa posizione.
- Handler: click → `window.location.href = '/privacy-notice.html'`, cablato una volta come oggi.
- Il commento di testa (`js/nav.js:4`) che parla di "settings modal" si corregge.
- `?v=N` di `nav.js` incrementato in ogni pagina che lo carica.

## 5. Test

- `js/lib/nav-model.test.js`: `nav-settings-btn` → `nav-privacy-btn` nell'elenco id; il caso "tab fuori menu" usa `'privacy'`;
  un'asserzione nuova: la voce `#nav-privacy-btn` ha il testo "Privacy Notice".
- `js/lib/nav-shell-guard.test.js`: `'settings'` → `'privacy-notice'` in `PAGES`.
- `js/lib/page-head-guard.test.js`: `settings.html` → `privacy-notice.html`.
- Nuovo `js/lib/privacy-notice-guard.test.js`:
  - `privacy-notice.html` non contiene `<button`, `<input`, `<form`;
  - carica `js/lib/dates.js` e chiama `/api/app-settings/terms`;
  - `settings.html` non esiste e nessun `*.html` o `js/*.js` contiene `settings.html`.

## 6. Documentazione

- `docs/pages/settings.md` → `docs/pages/privacy-notice.md`, con la nuova sezione del ciclo.
- `TEST_CASES.md`: N-03 e N-12 aggiornati; ST-01/ST-02 sostituiti da PN-01 (contenuto + calce), PN-02 (login richiesto).
- `CLAUDE.md` tabella Pages, `ARCHITECTURE.md:998`, `docs/prd/notifications.md:7,11`, `docs/js/nav.md`,
  `.claude/skills/operational-manual/SKILL.md:165`, nel branch e non a `/sync-docs` (`doc-paths-guard`, §3). I
  documenti storici in `docs/superpowers/` non si toccano (fuori dal perimetro del guard).

## 7. Fuori scope

- Pagina Settings separata (il posto per "future settings" sparisce).
- Storico delle versioni per l'utente.
- Stampa / download PDF.
- Modifiche a `terms.html`, al gate T&C, a `_terms-editor.html`.

## Criteri di accettazione

1. **Voce di menu** — il menu account mostra "Privacy Notice" con l'icona documento e non mostra più "Settings".
2. **Navigazione** — il click sulla voce apre `/privacy-notice.html`.
3. **Titoli** — `.ph`, `<title>` e breadcrumb (`Home › Privacy Notice`) riportano "Privacy Notice".
4. **Contenuto** — il corpo mostra lo stesso HTML del campo `content` di `GET /api/app-settings/terms`.
5. **Nessun controllo** — la pagina non ha checkbox, pulsanti né input oltre alla navigazione (`privacy-notice-guard.test.js`).
6. **Calce** — sotto il testo compare `Version N · Published <Mon D, YYYY>` con i valori di `version` e `updatedAt`.
7. **Nuova versione** — dopo un "Publish new version" in `_terms-editor.html`, un reload mostra testo, versione e data nuovi.
8. **Errore** — con la chiamata fallita compare il messaggio d'errore in inglese, non una pagina vuota.
9. **Settings eliminata** — `settings.html` non esiste più e nessun file di codice la cita (`privacy-notice-guard.test.js`).
10. **Login** — da non loggato `/privacy-notice.html` porta a `/login.html`.
11. **Test** — `npm test` verde.

## Decisioni aperte

1. **`settings.html` eliminata, senza redirect** (scelta dell'utente dopo la prima stesura). Alternativa scartata: un redirect HTML sul modello di `config.html`, o un 301 in `nginx.conf`. Perché: la pagina era vuota e nessun link la usa; il costo è aggiornare nel branch i documenti vivi che la citano.
2. **Id `nav-privacy-btn`.** Alternativa scartata: tenere `nav-settings-btn`. Perché: un id "settings" su una voce "Privacy Notice" confonde; costa una riga di test.
3. **Icona `terms`.** Alternativa scartata: tenere l'ingranaggio `config`. Perché: l'ingranaggio promette impostazioni che non ci sono più.
4. **Stile in un `<style>` di pagina.** Alternativa scartata: regole in `css/style.css`. Perché: eviterebbe un bump di `?v=` su ogni pagina per regole usate da una sola.
5. **Niente "Published by".** Alternativa scartata: mostrare `updatedBy`. Perché: richiesti solo versione e data; il nome del sysadmin non è un'informazione legale per l'utente.
6. **Formato data del progetto (`Dec 1, 2025`).** Alternativa scartata: `1 December 2025` come `terms.html`. Perché: CLAUDE.md vuole le date tramite `js/lib/dates.js`; le due pagine mostreranno formati diversi.
7. **Giorno UTC di pubblicazione (`updatedAt.slice(0, 10)`).** Alternativa scartata: il giorno nel fuso del browser, o un helper nuovo in `js/lib/dates.js`. Perché: `formatDayText` accetta solo `YYYY-MM-DD` e il timestamp JSON è UTC; una pubblicazione a cavallo della mezzanotte può mostrare il giorno UTC.
