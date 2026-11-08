# Team redesign — `team.html` — design spec

**Date:** 2026-11-08
**Brief started:** unknown
**Brief:** `docs/superpowers/design/team/redesign/brief-team-claude-code.md`
**Boards:** `docs/superpowers/design/team/redesign/13*.png`
**Scenario:** 2 (evoluzione di una feature esistente)

Redesign visivo e di interazione della pagina Team. API e regole di matching invariate. Il brief è il riferimento per
misure, testi e colori; questa spec registra cosa si costruisce, cosa si scosta dalle tavole e perché. Dove la tavola
contraddice il sito vale il sito (brief §0); una funzione che le tavole introducono e che oggi non esiste entra solo se
confermata in chat (elenco in §1.3).

## 1. Fatti e perimetro

### 1.1 Fatti verificati nel codice (a `7f6cfb3`)

- `GET /api/resources/unmatched` (`api/src/routes/resources.js:29`) restituisce `name_normalized, display_name, hours,
  projects, project_list: [{code, name}], candidate_resource_ids`. **Nessuna ora per progetto.**
- `GET /api/resources/aliases` (`resources.js:67`) restituisce `id, alias_normalized, display_name, resource_id,
  created_by, created_at, updated_by, updated_at, first_name, last_name`. **Nessuna ora, nessun ruolo, nessuno stato
  della risorsa.**
- `POST /api/resources/aliases` restituisce l'alias creato con il suo `id`; `DELETE /api/resources/aliases/:id` esiste.
- `resource_aliases.resource_id` è `ON DELETE CASCADE` (`024_resource_aliases_unmatched.sql`) e `DELETE
  /api/resources/:id` esegue `rescanAll()`: dopo un Delete i nomi degli alias tornano davvero in coda. Il testo del modal
  Delete (13g) è quindi vero.
- `POST /api/resources` rifiuta l'assenza di `firstName`, `lastName`, `email` **o** `roleId`; `PATCH` rifiuta i primi
  tre vuoti. Il client oggi controlla solo il ruolo (`team.html:760`).
- `GET /api/resources` restituisce già `role_label`, `role_code`, `user_id`, `linked_user_*`, `status`.
- L'intervallo del worker dei profili è configurabile da `profile-jobs.html` (`docs/api/profile-engine.md`): "10
  minuti" è solo il default.
- `profile-jobs.html` oggi si raggiunge solo dalla sub-nav di Timesheets.
- `css/admin-crud.css` è caricato anche da `admin.html`, `attribute-lists.html`, `privacy-notice.html`,
  `profile-jobs.html`; `attribute-lists.html` usa `badge-st-*`.
- Le pagine ridisegnate definiscono drawer, menu, pill, banner e stati **in locale** (`ua-`, `mdr-`, `mdp-`, `cg-`,
  `mdc-`, `ts-`); sono condivisi in `css/style.css` solo `.ph-*`, `.pd-*`, `.md-seg*`, i bottoni, `.tag-pill`,
  `.md-card*`, `.pd-save-overlay`.
- Il brief cita `docs/captures/team/`, `TeamAdminResponsive.dc.html` e `Section - Team.dc.html`, che non esistono nel
  repo: per tablet e smartphone fanno fede solo `13aa-1-tablet.png` e `13aa-2-smartphone.png`.

### 1.2 Elementi ⚠ omessi (richiedono API nuove)

- Colonna **Hours** degli alias (13m) e ore accanto agli alias nel pannello (13n).
- **Ore per progetto** nella sotto-riga Projects della coda (13i): si mostrano nome e codice.

### 1.3 Funzioni nuove: incluse ed escluse (confermate in chat)

| Id | Funzione | Esito |
|---|---|---|
| A | Filtri **Role** e **PDash user** nella toolbar | inclusa |
| B | **Undo** nei banner (Assign/Ignore, Deactivate) | **esclusa** |
| C | Contatore **"{r} of {t} resolved this session"** | inclusa |
| D | Stato **"created"** del drawer (Open resource, Create another) | inclusa |
| E | **Chip dei candidati** per i nomi ambigui | inclusa |
| F | Link **Profile processing →** dal profilo | inclusa |
| G | Evidenze: ultimo mese verde (≤ 3 mesi), nomi ≥ 40 h in grassetto, i due topic più forti in navy | inclusa |
| — | Ricerca e filtro **Resolves to** nella vista Existing aliases | inclusa |
| H | Smartphone completo (pagina risorsa full-screen, bottom sheet Assign) | **secondo ciclo** |

## 2. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 13ab | §5.1, §5.2, §5.3 |
| 13c | §5.4 |
| 13g | §5.5 |
| 13af, 13ag, 13ah, 13f | §7 |
| 13i, 13k | §6.1–§6.3 |
| 13m | §6.4 |
| 13n | §8.1 |
| 13o | §8.2 |
| 13aa-1 | §10 |
| 13aa-2 | §10 (fallback semplice; il resto è il ciclo H) |

## 3. Componenti condivisi — `css/style.css`

Classi nuove, prefisso `pd-` (componenti dell'app, come `pd-save-overlay`), valori presi dalle classi `ua-` di
`admin.html`, solo `var(--token)`. In questo ciclo le usa **solo** `team.html`; la convergenza delle altre pagine
(`admin.html`, Master Data, Timesheets, Pipeline) è una voce di backlog, una pagina per ciclo.

- `.pd-drawer` (Bootstrap offcanvas, `--bs-offcanvas-width` 480 px) con `-head`, `-eyebrow`, `-title`, `-sub`,
  `-body`, `-foot`, `-hint`; modificatore `.pd-drawer--wide` (980 px). Sotto 768 px larghezza `100vw`.
- `.pd-row-menu` (wrap, trigger ⋯, menu `role="menu"`, `--up`, voce con titolo/tag/sottotitolo, divisore, voce
  `--danger`) e `.pd-tag` (`--navy`, `--danger`).
- `.pd-banner` (`--success`, `--error`, corpo, chiusura).
- `.pd-confirm` (modal Bootstrap: head con icona, testo, box `-boxes`/`-box`/`-box-title`, avviso, `-ack`, foot).
- `.pd-status-pill` (`--active`, `--inactive`, `--busy`) con pallino.
- `.pd-state` (`-icon`, `-title`, `-text`; `--dashed` per la card tratteggiata) per vuoto, caricamento, errore, accesso
  negato.

Il pannello risorsa (860 px, da Pipeline) resta in `css/team.css`: estrarlo toccherebbe `pipeline.html`.

`css/admin-crud.css`: le pill `badge-st-*` restano (le usa `attribute-lists.html`) ma passano ai token, con l'inactive
≥ 4.5:1; i `#…` dell'header tabella, dei bordi, di `.form-label` e `.empty` passano anch'essi ai token. Team non usa
più `badge-st-*`.

## 4. Logica pura — `js/lib/team-ui.js`

Funzioni nuove, ES module con bridge `window.*`, test vitest in `js/lib/team-ui.test.js`:

- `resourceCounts(resources)` → `{ total, active, inactive }` (sottotitolo e segmented).
- `filterResources(resources, { status, roleId, linked, text })`: `status` `active|inactive|all`, `linked`
  `any|linked|unlinked` su `user_id`, `text` con la regola di ricerca attuale (nome, email, ruolo label/codice,
  case-insensitive, senza folding degli accenti: come oggi).
- `profileMonthText(ym)`: `'YYYY-MM'` del profilo → `Dec 2025` via `formatMonthText` di `js/lib/dates.js` (che vuole
  `YYYYMM`); `'—'` se assente o non valido.
- `sessionProgress(resolved, queueLength)` → `{ resolved, total, pct }`, `total = resolved + queueLength`.
- `hoursBarPct(hours, maxHours)` (0–100, 0 se `maxHours` è 0).
- `isRecentMonth(ym, today, months = 3)`: vero se il mese `YYYY-MM` cade nei 3 mesi che terminano con il mese corrente
  di `today` (contato dal mese corrente, non dall'ultimo upload).
- `aliasRows(aliases, resources, { text, resolves })`: aggiunge `role_code` e `status` della risorsa da `resource_id`;
  `resolves` `any|resource|ignored`; `text` su nome dell'alias e nome risorsa.
- `candidateChips(unmatchedRow, resources)` → risorse dei `candidate_resource_ids` con nome e codice ruolo.
- `topTopicIds(directTopics, n = 2)` → gli id dei due topic diretti con più ore.

Esistenti invariate: `sortResources`, `sortUnmatched`, `paginate`, `filterComboOptions`, `fold`, `buildProfileTree`.

## 5. Pagina — lista

### 5.1 Testata (13ab)
`.ph` invariato nella struttura: titolo **Team**, sub `{n} resources · {a} active · {i} inactive` (`Loading…` durante
il caricamento), **New resource** magenta con icona +. Le tab di pagina Team / Unmatched names spariscono.

### 5.2 Callout Unmatched (13ab)
Striscia amber sopra la card, solo con la coda non vuota (nascosta durante il caricamento). Titolo `{n} names in
uploaded actuals aren't matched to a resource`; testo `{h} h not attributed · {k} ambiguous. Their hours don't count
in any experience profile until you match them.` (parte ambigui omessa con k = 0; `h` = somma client di `hours`). A
destra **Existing aliases** (apre il drawer sulla vista alias) e **Review names →** navy (apre sulla coda).

### 5.3 Toolbar e tabella (13ab)
- Toolbar in card: segmented `.md-seg` Active / Inactive / All con contatori (Active all'apertura; sostituisce "Show
  inactive"); select **Role** (`All roles` + label da `GET /api/roles`); select **PDash user** (`Any / Linked / Not
  linked`); ricerca a destra `Search name, email or role…`.
- Ogni cambio di ricerca, filtro o ordinamento riporta a pagina 1 (watcher dedicati, come oggi; non su
  `sortedResources`).
- Colonne: Name (avatar 30 px con iniziali, email sotto in muted) · Role (label, codice sotto) · Linked PDash user
  (icona link + nome, o `—`) · Status (`.pd-status-pill`) · ⋯. Le righe inattive hanno il nome in muted.
- Ordinabili Name, Role, Status, con `aria-sort` e le frecce del sito; apertura Name ascendente. Email non è più una
  colonna, quindi non è più ordinabile.
- Paginazione a 25: `1–25 of N`, `‹ Previous`, `Page X of Y`, `Next ›`.
- Click su riga apre il pannello; riga aperta evidenziata (fondo magenta chiarissimo + barra inset 3 px). Righe e
  header focusabili, outline magenta 2 px, Enter apre. Il click su ⋯ non chiude il pannello e il click sulla riga già
  aperta non provoca flicker.

### 5.4 Menu ⋯ (13c)
`.pd-row-menu`, verso l'alto sulle ultime righe, Esc/click fuori chiudono e il focus torna al trigger:
1. **Edit** — `Name, role, job description, linked user`.
2. **Deactivate** + tag `LEFT THE COMPANY` — `Hides them from lists. Hours and aliases stay. Reversible.`; su inattivi
   **Activate** — `Back in the active list`. Nessuna conferma. In corso: pill → spinner + `Updating…`, riga al 70%.
3. Divisore, **Delete…** rosso + tag `IRREVERSIBLE` — `Removes the resource and {n} aliases.` (`n` dagli alias
   caricati).

### 5.5 Modal Delete (13g)
`.pd-confirm`, sostituisce lo `showConfirm` attuale. Titolo `Delete {name}?` + tag `IRREVERSIBLE`; testo `This can't be
undone. The resource and its aliases are removed, and their names go back to Unmatched names.`; box **Deleted**
(`Resource record`, `{n} aliases`) e **Back to Unmatched names** (i `display_name` degli alias, o la riga `No aliases`
con n = 0); solo su risorsa attiva il box `Has this person left? Deactivate instead…` con link **Deactivate** (chiude il
modal ed esegue il Deactivate); checkbox `I understand this can't be undone.` che abilita **Delete resource** rosso.

### 5.6 Banner globali
`.pd-banner` sopra la card: verde per i successi (`{name} was deactivated. Their hours and aliases stay attributed.
Find them under Inactive.`, `{name} was activated.`, `{name} was deleted.`, `Changes saved.`), rosso per gli errori
come oggi; `role="status"` / `role="alert"`. Un'azione nuova cancella il banner precedente. **Nessun Undo.**

## 6. Drawer Unmatched names (13i, 13k, 13m)

### 6.1 Contenitore e barra
`.pd-drawer.pd-drawer--wide`; tablet = area contenuto, sotto 768 px a tutto schermo. Header eyebrow `TEAM`, titolo
**Unmatched names**, sub `Match names from uploaded actuals to resources, so their hours count in experience
profiles.`, ×. Scrim, Esc, × chiudono. Aperto dal profilo resta sopra il pannello risorsa. Barra: segmented **Queue
{n} / Existing aliases {n}**; a destra ricerca (`Search name…` sulla coda, `Search alias or resource…` sugli alias) e
**Rescan** outline (spinner + `Rescanning…`).

### 6.2 Coda
- Riepilogo: `{n}` names to match · `{h} h` not attributed to anyone · barra verde `{r} of {t} resolved this session`
  (`sessionProgress`; `r` = Assign/Ignore riusciti dall'apertura della pagina) · `{k} ambiguous`; testo d'aiuto a
  destra.
- Colonne Name in actuals · Hours · Projects · Assign to · azioni; apertura Hours discendente; Name/Hours/Projects
  ordinabili; paginazione a 25 come oggi.
- Nomi ≥ 40 h in grassetto; sotto le ore barra navy sottile (`hoursBarPct` sul massimo della coda).
- Ambiguo: badge amber `AMBIGUOUS` + `{n} active resources share this name. Pick the right one.`; sotto la select i chip
  dei candidati (`candidateChips`, nome + codice) che selezionano con un click.
- `{n} projects ▾` apre una sotto-riga a tutta larghezza: `Project name (CODE)` ordinati per nome, **senza ore**.
- **Assign to**: il `combo-select` della pagina, restilizzato; gruppi `— none —`, **Same name · candidates**, **Active
  resources**, **Inactive** (`(inactive)`), codice ruolo a destra, legenda tastiera in fondo; tastiera invariata.
- **Assign** navy (disabilitato senza scelta), **Ignore** outline con tooltip `Not a person (e.g. TBD). Stored as an
  ignored alias.`

### 6.3 Esito (13k)
In corso: spinner + `Assigning…` / `Ignoring…`, `aria-live="polite"`. Poi la riga esce dalla coda e compare un
`.pd-banner--success` di sezione: `"{name}" assigned to {resource} ({code}). Removed from the queue. Their profile
updates in the next background run.` / `"{name}" ignored. Stored as an ignored alias.` **Nessun Undo, nessun numero di
minuti.** Errori nel banner rosso di sezione (`unmatchedError`), separato da quello globale. Empty state: `No unmatched
names.` (check verde + `Every name in uploaded actuals resolves to a resource or is ignored. New uploads may add names
here.`) e `No unmatched names match the search.`

### 6.4 Existing aliases (13m)
Ricerca + select **Resolves to** `Anything / A resource / Ignored` (`aliasRows`). Colonne Name in actuals · Resolves to
(freccia + `Resource · CODE` + chip `inactive`, o chip tratteggiato `ignored`) · **Remove** outline (senza conferma,
come oggi). **Niente colonna Hours.** Nota in fondo: `Removing an alias sends the name back to the queue. Hours already
attributed are recalculated in the next background run.` Empty: `No aliases yet.` / `No aliases match the filters.`

## 7. Drawer New / Edit resource (13af, 13ag, 13ah, 13f)

- `.pd-drawer` 480 px, sostituisce il modal. Eyebrow `TEAM` / `RESOURCE`; titolo **New resource** / **Edit resource**;
  sub `A person who works on projects. They don't need a PDash account.` / `Changes apply to this resource only. Hours
  already attributed don't move.` In Edit dal pannello sta sopra il pannello. Focus sul primo campo, ritorno del focus
  alla chiusura.
- Campi: First name \* / Last name \* affiancati, Email \*, **Role \*** (`Select a role…`, `label (code)`, help `Missing
  a role? Add it first in Master Data → Roles & rates.` con link a `master-roles.html`), Job description (textarea),
  **Linked PDash user (optional)** (`— None —`, utenti attivi `Name Surname (email)`, help `Only if this person signs in
  to PDash. Most resources don't need an account.`).
- Validazione client dei quattro obbligatori (errore sotto il campo: `First name is required.` ecc.) + riquadro rosso in
  cima; i messaggi del server vanno nel riquadro.
- Footer Cancel + **Create resource** / **Save changes** magenta (spinner bianco + `Creating…` / `Saving…`).
- Creato (13ah): il drawer resta aperto con la conferma verde `{name} was created` / `{Role (code)}. Their experience
  profile appears after the next background run, once actuals match their name.` e **Open resource** (chiude il drawer
  e apre il pannello); footer `Create another` (form vuoto, ruolo mantenuto) e **Close**.
- Edit salvato: il drawer si chiude, banner `Changes saved.`
- Esc chiude solo il layer più alto: il listener Esc del pannello (capture phase) ignora anche un `.offcanvas.show`, non
  solo i `.modal.show`.

## 8. Pannello risorsa (13n, 13o)

Drawer fisso a destra, 860 px (720 px su tablet), come Pipeline. Header navy: avatar, nome, `.pd-status-pill`, `Role ·
CODE`, ×. Tab **Details** / **Experience profile** con sottolineatura magenta; **Edit** a destra sulla riga dei tab.
Chiusura ×, Esc, click fuori, come oggi. Focus sul titolo all'apertura.

### 8.1 Details (13n)
Lista di definizione in card a due colonne: Name, Email, Role (+ `Code …`), Linked user (nome + email, o `Not linked` +
`This person doesn't sign in to PDash.`), Status, Job description (multilinea o `—`). **Aliases ({n})** comprimibile
(bottone `aria-expanded`, chiuso all'apertura) con `Names from uploaded actuals that resolve to this resource.`, una riga
per alias con Remove, **senza ore**; vuoto `No aliases for this resource.` Card **Management**: Deactivate/Activate
(navy outline, testo del brief §8) e **Delete resource** (titolo rosso, bottone outline rosso **Delete…** → modal §5.5).

### 8.2 Experience profile (13o)
- Totali in card a 4 celle: HOURS, PROJECTS, FIRST MONTH, LAST MONTH (mesi `Dec 2025`, via `profileMonthText`).
- `Last calculated {data, ora}. Rebuilt in the background from uploaded actuals. Recent assignments appear after the
  next run.` + a destra **Profile processing →** (`profile-jobs.html`).
- Topics: **Direct experience** (`tasks with logged hours`) chip pieni `Label · {n} project(s) · {h} h`, per ore, i due
  di `topTopicIds` in navy chiaro, tooltip con i progetti; **Project context** (`from descriptions of projects they
  worked on`) chip tratteggiati `Label · {n} project(s)`; gruppo legacy solo se presente; `No topics yet.`
- Una card per dimensione: nome + `{n} values`, a destra `{h} h on projects without a value`. Riga valore: chevron ·
  valore · barra di quota 8 px · ore · % · `{n} projects` · ultimo mese (verde semibold se `isRecentMonth`). Espansa →
  progetti (indentati, fondo grigio chiaro: nome + codice · ore · ultimo mese) → task (ulteriore indentazione, linea
  grigia a sinistra: nome · ore). Card **Roles** con colonna `ROLE`, espande solo ai progetti. Bottoni con
  `aria-expanded`, niente `<details>`. Arrotondamenti invariati.
- Stati in `.pd-state--dashed`: `Loading profile…`; **Not calculated yet** (`The profile is built in the background from
  uploaded actuals. New resources get one after the next run.`); **No actuals matched to this person yet** (`Their name
  may appear in actuals in a different form…` + **Open Unmatched names ({n})** che apre il drawer §6); **Error** banner
  rosso `Couldn't load the profile.` + **Try again** (ripete `loadProfile()`).

## 9. Stati della pagina
`Loading team…` con spinner nella card; `No resources match the current filter.` con icona, riga che descrive i filtri
attivi e **Clear filters** outline; accesso negato come User Admin (icona lucchetto, **Admin access required**, `The team
register is available to admins and sysadmins. Ask an admin if you need access.`, **Go to app**).

## 10. Responsive
- **Tablet ≤ 1279 px** (sidebar a icone, 13aa-1): callout compatto; colonne Name (email + `Linked to a PDash user` come
  terza riga se collegato) · Role · Status · ⋯; Role e PDash user in un bottone **Filters** (dropdown); target ≥ 40 px;
  pannello 720 px; drawer Unmatched sull'area contenuto, Projects sotto il nome, Ignore come icona con tooltip.
- **Sotto 768 px** (fallback, non 13aa-2): card per risorsa (nome + pill, `Role · CODE`, email, ⋯ 44 px), drawer e
  pannello a tutto schermo, modal a tutta larghezza con inset 16 px, target ≥ 44 px, `combo-select` come dropdown. La
  pagina risorsa full-screen con freccia indietro, il bottom sheet Assign e i filtri a pillole sono il ciclo H.

## 11. Accessibilità
Trigger ⋯ con `aria-haspopup="menu"` e `aria-expanded`, menu `role="menu"`, Esc restituisce il focus. Drawer e modal con
focus trap (offcanvas/modal Bootstrap), Esc chiude solo il layer più alto. Header ordinabili come bottoni con
`aria-sort`; righe focusabili, Enter apre.

## 12. Vincoli
Nessun hex in `team.html`, `css/team.css` e nelle classi nuove di `style.css`; ogni coppia testo/sfondo ≥ 4.5:1
(`js/lib/tokens.test.js` per gli eventuali token nuovi, giustificati nel report). Icone SVG inline `currentColor` da
`js/lib/icons.js`, niente emoji. Testi in inglese con `…`. Bump `?v=` di `css/style.css` su tutte le pagine, di
`css/admin-crud.css` sulle sue cinque pagine, di `js/lib/team-ui.js`; `css/team.css` nuovo con `?v=1`.

## 13. Test
- Unit: le funzioni di §4 in `js/lib/team-ui.test.js` (characterization di `sortResources`/`sortUnmatched`/
  `buildProfileTree` invariate).
- Guard esistenti: `page-head-guard`, `nav-shell-guard`, `foundations-guard`, `tokens.test.js`, `money-guard`,
  `dates-guard`.
- Verifica visiva con `scripts/shoot.mjs` contro lo stack del branch a 1400, 1024 e 390 px, confrontata con ogni tavola
  di §2.

## 14. Documentazione
`docs/pages/team.md` (nuova sezione del redesign, minori chiusi, elementi esclusi), `docs/js/lib.md` (funzioni nuove),
`docs/css/stylesheets.md` (classi `pd-` condivise, `css/team.css`), riga della pagina in CLAUDE.md (stylesheet propria),
la descrizione di `profile-jobs.html` (non più raggiunta solo da Timesheets) in CLAUDE.md e `docs/pages/profile-jobs.md`,
`docs/BACKLOG.md` (convergenza delle classi condivise; Undo; ore per alias e per progetto; ciclo smartphone H).

## Criteri di accettazione

1. **Niente tab di pagina** — `team.html` non ha più `nav-tabs` Team / Unmatched names; coda e alias stanno nel drawer.
2. **Callout condizionale** — con coda vuota il callout non c'è; con coda non vuota mostra conteggio, ore sommate e
   ambigui (questi ultimi omessi con k = 0).
3. **Sottotitolo** — `{n} resources · {a} active · {i} inactive` con i conteggi di `resourceCounts`.
4. **Filtri** — segmented di stato con contatori, Role, PDash user e ricerca filtrano la tabella e riportano a pagina 1.
5. **Menu ⋯** — una sola ⋯ per riga con Edit, Deactivate/Activate col tag `LEFT THE COMPANY`, Delete… rosso separato
   dal divisore.
6. **Modal Delete** — Delete resource è spento finché la checkbox non è spuntata; il box Deactivate compare solo su
   risorse attive; i nomi elencati sono gli alias della risorsa.
7. **Drawer New/Edit** — 480 px; i quattro obbligatori segnalati sotto il campo; dopo Create il drawer mostra lo stato
   creato con Open resource e Create another (ruolo mantenuto).
8. **Drawer Unmatched** — 980 px; Assign/Ignore tolgono la riga, mostrano il banner di sezione e fanno avanzare il
   contatore di sessione; i chip dei candidati selezionano la risorsa.
9. **Existing aliases** — ricerca e filtro Resolves to funzionano; risorsa con codice e chip `inactive`; nessuna colonna
   Hours.
10. **Pannello** — Details con Aliases comprimibile e card Management; Experience profile con totali, due gruppi di topic,
    dimensioni con barre ed espansione valore → progetto → task, link Profile processing.
11. **Stati del profilo** — loading, not calculated, no actuals (con Open Unmatched names), error con Try again.
12. **Layer ed Esc** — Edit sopra il pannello e Unmatched sopra il pannello; Esc chiude solo il layer più alto.
13. **Nessun Undo e nessun "10 minutes"** — nessun testo della pagina cita un numero di minuti; nessun link Undo.
14. **Niente hex** — `grep -nE "#[0-9a-fA-F]{3,8}\b"` su `team.html` e `css/team.css` non trova colori; le pill di
    `admin-crud.css` usano token e l'inactive è ≥ 4.5:1.
15. **Test verdi** — `npm test` passa, incluse le funzioni nuove di `team-ui.js` e i guard.
16. **Fedeltà** — gli screenshot a 1400 e 1024 px corrispondono alle tavole di §2, scostamenti elencati e decisi.

## Decisioni aperte

1. **Classi condivise in `css/style.css`, usate in questo ciclo solo da Team.** Alternativa scartata: `css/team.css`
   locale con prefisso `tm-`, oppure migrare subito anche `admin.html` o tutte le pagine. Perché: scelta in chat; le
   altre pagine convergono in cicli successivi.
2. **Prefisso `pd-` per le classi condivise.** Alternativa scartata: nomi nudi (`.drawer`, `.banner`, `.state`,
   `.confirm`). Perché: generici e a rischio collisione; `pd-` è già il prefisso dei componenti dell'app
   (`pd-save-overlay`).
3. **Pill di `admin-crud.css` convertite ai token, non rimosse.** Alternativa scartata: rimuoverle come chiede il brief.
   Perché: le usa anche `attribute-lists.html`.
4. **Ore per alias e per progetto omesse.** Alternativa scartata: estendere le API. Perché: brief §0, niente campi API
   nuovi.
5. **Undo escluso.** Alternativa scartata: Undo via `DELETE` alias / `PATCH` inverso. Perché: scelta in chat, funzione
   nuova non presente nel sito.
6. **Smartphone completo rinviato al ciclo H; qui un fallback semplice.** Alternativa scartata: tutto in questo ciclo.
   Perché: scelta in chat, come Planning.
7. **Testi senza numero di minuti.** Alternativa scartata: `about 10 minutes` delle tavole. Perché: l'intervallo è
   configurabile, il numero diventerebbe falso.
8. **Quattro campi obbligatori con `*` e validazione client.** Alternativa scartata: `*` solo su Role come in 13af.
   Perché: il server li rifiuta tutti e quattro.
9. **Ruolo e stato della risorsa negli alias ricavati dal client.** Alternativa scartata: join nell'API. Perché: dati
   già caricati, niente API nuove.
10. **`<select>` nativi stilizzati** per Role e PDash user della toolbar, Resolves to degli alias, Role e Linked PDash
    user del drawer. Alternativa scartata: `<cg-select>` o un `combo-select` anche lì. Perché: stessa scelta di User
    Admin (decisione 8 della sua spec), `cg-controls.js` non è caricato su Team, liste brevi o già "standard" per il
    brief §7; l'unico controllo custom resta Assign to.
11. **"Ultimi 3 mesi" contati dal mese corrente.** Alternativa scartata: dal mese dell'ultimo upload. Perché: confermato
    in chat.
12. **Pannello risorsa in `css/team.css`, non estratto.** Alternativa scartata: classe condivisa con Pipeline. Perché:
    toccherebbe `pipeline.html`.
13. **Paginazione a 25 della coda Unmatched mantenuta.** Alternativa scartata: lista senza paginazione come nelle tavole
    13i/13k. Perché: è il comportamento attuale e la coda può contenere decine di nomi.
14. **Email non più ordinabile.** Alternativa scartata: tenere l'ordinamento per email. Perché: nelle tavole l'email è
    sotto il nome, non una colonna; la ricerca la copre ancora.
15. **Soglia tablet a 1279 px e card sotto 768 px.** Alternativa scartata: solo a 1024 px. Perché: stessa scelta di User
    Admin; la soglia si conferma misurando nella verifica visiva.
