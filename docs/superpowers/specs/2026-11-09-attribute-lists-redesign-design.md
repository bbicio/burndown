# Attribute Lists redesign — `attribute-lists.html` — design spec

**Date:** 2026-11-09
**Brief started:** unknown
**Brief:** `docs/superpowers/design/attribute-lists/redesign/2026-11-08-brief-attribute-lists-claude-code.md`
**Boards:** `docs/superpowers/design/attribute-lists/redesign/14*.png`
**Scenario:** 2 (evoluzione di una feature esistente)

Redesign visivo e di interazione della pagina Attribute Lists. API e regole invariate. Il brief è il riferimento per
testi e misure; questa spec registra cosa si costruisce, cosa si scosta dalle tavole e perché. Dove la tavola
contraddice il sito vale il sito (brief §0). Le funzioni che oggi non esistono entrano solo perché confermate in chat
(§1.3).

## 1. Fatti e perimetro

### 1.1 Fatti verificati nel codice (a `d79eb2c`)

- `GET /api/attribute-lists` restituisce `id, name, slug, created_at, active_item_count`, ordinato per nome. Nessun
  conteggio degli inattivi.
- `GET /api/attribute-lists/:id/items` restituisce tutti gli item (attivi e inattivi), ordinati per label.
- `PATCH /api/attribute-lists/:id` non intercetta il `23505`: il comportamento di un rename verso un nome già usato
  resta quello di oggi.
- `GET /api/topics` restituisce `id, name, status, created_at, updated_at, usage_count`; i topic fusi sono esclusi.
- `POST /api/topics/:id/merge` restituisce `{ ok, targetId }`. I link si spostano con `ON CONFLICT DO NOTHING`: la
  somma dei due `usage_count` può superare il conteggio reale dopo il merge.
- I messaggi d'errore del server (`topicNameError`, 409 di liste e item) sono quelli di
  `api/src/routes/attribute-lists.js`, `api/src/routes/topics.js` e `api/src/lib/topic-extract.js`.
- `api/src/lib/slugify.js` è l'unico algoritmo dello slug.
- La pagina oggi usa `fetch` diretto, tre `.ph`, `nav-tabs`, quattro modal Bootstrap, un `<select>` nativo (merge), un
  `<details>` (rejected), `badge-st-*` di `css/admin-crud.css` (unico consumatore) e `.slug-code` inline con un hex.
- Condivisi in `css/style.css`: `.md-layout`, `.md-subnav` (desktop colonna, tablet riga di chip, smartphone
  `.md-subnav-select` sopra un `<select>` nativo trasparente), `.md-seg`, `.pd-drawer`, `.pd-row-menu`, `.pd-tag`,
  `.pd-status-pill`, `.pd-banner`, `.pd-confirm`, `.pd-state`. `js/lib/md-subnav.js` genera solo set statici.
- `combo-select` è un componente locale di `team.html` (CSS `.tm-combo*` in `css/team.css`), dipende da
  `window.filterComboOptions` di `js/lib/team-ui.js`. `sessionProgress()` sta in `js/lib/team-ui.js`.
- Non esiste un bottom sheet condiviso (quello di `admin.html` è locale); Team su smartphone tiene il popover.
- Il brief cita `docs/captures/attribute-lists/` e i sorgenti `.dc.html` per i PNG: fanno fede i PNG in `redesign/`.

### 1.2 Elementi omessi o ridotti (richiederebbero sviluppo nuovo o contraddicono il sito)

- **Totale dopo il merge** (14y «5 descriptions in total», banner «{n} now use …»): non si stima sul client (§7).
- **Pre-validazione dei nomi dei topic** (14v «This name has 6 words»): si mostra il messaggio del server.
- **Testi d'errore delle tavole** (14e, 14l, 14v): si mostra il messaggio del server.
- **Bottom sheet** della sub-nav e del menu ⋯ su smartphone (14ad-2): si usano `.md-subnav-select` e il popover.
- **«{n} left to review.»** nel banner di Approve (14p, assente dal brief): omesso, il conteggio è già nella strip.
- **Tabella vuota con intestazioni** in 14c: lo stato vuoto è un `.pd-state`, senza tabella.

### 1.3 Funzioni nuove, tutte lato client (confermate in chat)

| Id | Funzione | Esito |
|---|---|---|
| A | Ricerca su item e topic, con «Show all items», «Clear search», «Review proposed ({n})», link «View rejected» | inclusa |
| B | Strip della coda: «{n} to review» + «{r} of {t} reviewed this session» | inclusa |
| C | Undo nel banner dopo Deactivate/Activate (PATCH opposto) | inclusa |
| D | Anteprima dello slug nel drawer New list | inclusa |
| E | «Try again» sul banner di errore di caricamento | inclusa |
| F | «Reject instead» nella conferma del merge | inclusa |

## 2. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| 14a | §3, §4 |
| 14c | §9 |
| 14d, 14e, 14f, 14j, 14l, 14u, 14v | §6 |
| 14g, 14h, 14i, 14m | §4 |
| 14n, 14o, 14p, 14q, 14r, 14s, 14t, 14z | §5 |
| 14w, 14y | §7 |
| 14aa, 14ab, 14ac | §9 |
| 14ad-1 | §10 |
| 14ad-2 | §10 (con le riduzioni di §1.2) |

## 3. Struttura e sub-navigazione (14a)

- Un solo `.ph`: titolo `Attribute Lists`, sottotitolo `Values to tag proposals and projects, and topics for experience
  profiles`, primario contestuale **New list** / **New topic** (icona plus). Via `nav-tabs`, via `.ph-back`, via le tre
  testate.
- Sotto: `.md-layout` con `<nav class="md-subnav" aria-label="Attribute lists and topics">` scritto da Vue (non da
  `md-subnav.js`, perché le voci vengono dall'API), con le classi e il markup delle pagine Master Data; contenuto in
  `.md-content`.
- Gruppo `ATTRIBUTE LISTS`: una voce per lista, in ordine API, con `active_item_count`. Gruppo `TOPICS`: Proposed,
  Approved, Rejected con i conteggi; Proposed > 0 ha il badge magenta (stesso stile del contatore Team), a 0 testo muted.
- Voce selezionata `aria-current="page"`; le voci sono `button` (Enter/Space selezionano). Apertura sulla prima lista;
  nessuna persistenza, nessun deep link.
- Smartphone: `.md-subnav-select` con un `<select>` a due `<optgroup>` (pattern del sito).

## 4. Contenuto di una lista (14a, 14g, 14h, 14i, 14m)

- Una card `.md-card`. Testata: eyebrow `ATTRIBUTE LIST`, nome, chip monospace dello slug (token, nessun hex) + `Slug ·
  set at creation, never changes`, riga `Offered as Tags in Cost Grid and Project config, and a dimension of experience
  profiles in Team.` (link a `team.html`), bottone outline **Rename** (icona pencil).
- Toolbar: `.md-seg` radiogroup **Active {n} / Inactive {n} / All {n}** (Active all'apertura e a ogni cambio di
  lista), ricerca `Search values…`, **New item** magenta. Conteggi calcolati sugli item caricati e filtrati dalla
  ricerca.
- Tabella nello stile di Team: Label · Status (`.pd-status-pill --active/--inactive`) · ⋯. Label inattive muted.
- Menu `.pd-row-menu`: **Edit label** (`Tags already applied show the new label.`); **Deactivate** con `.pd-tag--navy`
  `INSTEAD OF DELETE` (`No longer offered when tagging. Existing tags and profiles keep it.`) oppure **Activate**
  (`Offered again when tagging.`). Apertura verso l'alto con la stessa regola di Team.
- In corso: pill `--busy` `Updating…` (`aria-live="polite"`), menu della riga disabilitato.
- Esito: `.pd-banner--success` dentro la card, sopra la tabella, con **Undo** (PATCH opposto) e chiusura. Testi del
  brief §4. Un'azione nuova sostituisce il banner; un Undo riuscito lo chiude. Errore della PATCH: `.pd-banner--error`
  nella card con il messaggio del server.
- `active_item_count` della lista selezionata si aggiorna a ogni Deactivate/Activate/New item.
- Nota in fondo (icona info), testo del brief §4.
- Filtro vuoto (14m): `.pd-state` con icona search, `No items match the current filter.` + la riga del brief +
  **Show all items** (All, ricerca vuota).

## 5. Contenuto dei topic (14n–14t, 14z)

- Una card per stato. Toolbar: titolo (`Proposed topics` / `Approved topics` / `Rejected topics`) e ricerca
  `Search topics…`.
- Solo Proposed: strip con `{n}` `to review`, barra `{r} of {t} reviewed this session` (`None reviewed yet this
  session` a 0) via `sessionProgress()`, e il testo di destra del brief. Approve, Reject e Merge da Proposed contano
  come revisionati; `t` = proposti all'apertura della sessione + revisionati. Si azzera al reload.
- Tabella: Name · Used in (`{n} description(s)`) · azioni. Proposed ordinati per `usage_count` desc poi nome; gli
  altri per nome.
- Azioni: Proposed = **Approve** navy (icona check) + ⋯; Approved = ⋯; Rejected = **Restore** outline (icona
  rotate-ccw).
- Menu ⋯: **Rename**; **Reject** con `.pd-tag--navy` `REVERSIBLE`; divisore; **Merge into…** `--danger` con
  `.pd-tag--danger` `IRREVERSIBLE`. Testi del brief §5.
- In corso: spinner + `Approving…` / `Rejecting…` / `Restoring…` al posto delle azioni.
- Esito: `.pd-banner--success` nella card, testi del brief §5; Reject con link **View rejected**; nessun Undo.
- Errore (14z): come oggi si ricarica la lista, poi `.pd-banner--error` nella card: `Couldn't {verb} "{name}". The list
  was reloaded. Server: {message}`.
- Used in 0 su un approvato (14q): conteggio in testo amber (token che passa 4.5:1) e riga sotto il nome con link a
  `profile-jobs.html`.
- Nota in fondo per stato, testi del brief §5.
- Vuoti: Proposed (14s), Approved (14t, con **Review proposed ({n})**), Rejected, ricerca senza risultati (**Clear
  search**), con `.pd-state` e i testi del brief §9.

## 6. Drawer dei form (14d, 14e, 14f, 14j, 14l, 14u, 14v)

- Un drawer `.pd-drawer` da 480 px per ciascun form; head, body, foot come Team. Cancel outline + primario magenta con
  spinner bianco. Errore: box rosso in cima al body con il **messaggio del server**, campo `is-invalid`. Focus sul
  campo all'apertura, ritorno al trigger alla chiusura. Chiusura con successo → banner verde nella card di
  destinazione.
- Eyebrow, titoli, sottotitoli, campi e primari: tabella del brief §6.
- New list: riga slug con l'anteprima calcolata da `js/lib/slugify.js` (gemello del server, §8) e il testo del brief;
  `—` a nome vuoto. Create list seleziona la nuova lista.
- Rename list: slug in sola lettura.
- New topic: box `It starts empty` con i tre punti e il link `Open Profile processing →`; Create topic seleziona
  Approved.
- Rename topic: eyebrow `TOPIC · {STATUS}`, box `Naming rules`.

## 7. Merge (14w, 14y)

- Drawer 480 px `TOPICS` / **Merge topic**. Card sorgente (`TOPIC TO MERGE`, nome, `Used in {n} description(s)`, pill
  `proposed`/`approved`).
- **Merge into \***: `combo-select` con ricerca, gruppi Approved / Proposed, `{n} descriptions` come hint, suffisso
  `(proposed)` sul valore scelto. Sorgente approvata → solo approvati. Help sotto il campo dal brief §7.
- Scelto il target: box **What happens** — `The {n} description(s) using "{source}" will use "{target}".` · la
  sorgente sparisce · **Can't be undone.** Nessun totale.
- Foot: Cancel + **Merge…** `btn-danger`, disabilitato finché manca il target.
- Conferma `.pd-confirm` sopra il drawer: titolo, tag `IRREVERSIBLE`, box **Disappears** e **Moves to {target}**
  (`{n} description(s) move over`), nota **Just want it gone?** con **Reject instead** (chiude modal e drawer, esegue
  Reject), checkbox che abilita **Merge topics** (spinner). **Back** torna al drawer.
- Successo: ricarica dei topic, banner `Merged "{source}" into "{target}". "{target}" is now used in {n}
  description(s).` con `{n}` = `usage_count` del target **dopo** il ricaricamento. Errore: dentro la conferma.

## 8. Moduli e componenti condivisi

- `js/combo-select.js` (classic, `window.ComboSelect`): il componente estratto da `team.html` senza cambiarne il
  comportamento; il suo CSS passa da `.tm-combo*` di `css/team.css` a `.pd-combo*` in `css/style.css`. `team.html` lo
  registra dal file condiviso. Il filtro `window.filterComboOptions` deve essere disponibile a entrambe le pagine
  (caricando `js/lib/team-ui.js` o spostando la funzione in un modulo comune): la scelta è del Piano, a comportamento
  invariato.
- `js/lib/slugify.js`: gemello ES di `api/src/lib/slugify.js`; un test vitest confronta le due uscite su un elenco di
  input (accenti, simboli, spazi, vuoto, > 100 caratteri).
- `js/lib/attribute-lists-ui.js` (puro, testato): conteggi per stato, filtro di ricerca, ordinamento dei topic, testi
  dei banner, target ammessi del merge.
- `sessionProgress()` si riusa da `js/lib/team-ui.js` oppure si sposta nel modulo condiviso: la scelta è del Piano, a
  comportamento invariato.
- Le chiamate passano da un helper locale unico che restituisce `{ ok, data }` (oggi `topicsRequest`), esteso a liste e
  item.

## 9. Stati della pagina (14c, 14aa, 14ab, 14ac)

- Caricamento: sub-nav nascosta, una card `.pd-state` con spinner `Loading attribute lists…`.
- Accesso negato: `.pd-state` con icona lock, testi e **Go to app** del brief §9; nessuna emoji.
- Errore di caricamento: `.pd-banner--error` globale sopra il contenuto, testo del brief §8 + **Try again** (rilancia
  il caricamento).
- Nessuna lista: gruppo Lists vuoto, card `.pd-state` con icona tag, testi del brief §9, **Create the first list**
  outline, e la nota.

## 10. Responsive (14ad)

- Tablet (768–1023): la riga di chip di `.md-subnav` già esistente, con le etichette `LISTS` / `TOPICS`; scorre in
  orizzontale. Target ≥ 40 px.
- Smartphone (< 768): primario come `+` 44 px; `.md-subnav-select`; segmented a tutta larghezza; righe con ⋯ da 44
  px; topic come card con Approve 44 px; menu ⋯ a popover (come Team); drawer a tutto schermo (`.pd-drawer`); conferma
  a tutta larghezza come le regole esistenti di `.pd-confirm`.

## 11. Accessibilità e livelli

- Livelli: pagina < drawer < conferma. Esc chiude solo il livello in cima; il popover del combo e il menu ⋯ prima del
  drawer.
- Menu ⋯: `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, frecce, Esc restituisce il focus.
- Banner: `role="status"` (successo), `role="alert"` (errore).

## 12. Pulizia CSS e test

- Via `.slug-code` e lo `<style>` inline con hex; via `badge-st-*` da `css/admin-crud.css`; nessun hex nella pagina;
  bump di ogni `?v=N` toccato.
- Guard nuovo `js/lib/attribute-lists-page-guard.test.js` sul modello di `team-page-guard.test.js`: niente
  `nav-tabs`, `<details>`, `<select>` fuori da `.md-subnav-select`, `class="modal"` diversi dalla conferma, `alert(`,
  `confirm(`, hex, `badge-st-`; presenza di `.md-subnav`, `.pd-drawer`, `.pd-confirm`, `combo-select`.
- `TEST_CASES.md`: TP-09 e AL-* aggiornati al nuovo layout.

## Criteri di accettazione

1. **Niente tab** — la pagina non ha `nav-tabs` né `.ph-back`; la sub-nav mostra le liste e Proposed/Approved/Rejected
   con i conteggi, Proposed con badge magenta se > 0.
2. **Lista nel contenuto** — selezionare una lista mostra testata con slug, segmented Active/Inactive/All con conteggi,
   ricerca, tabella con pill e menu ⋯ (Edit label, Deactivate/Activate).
3. **Undo** — dopo Deactivate compare il banner verde; Undo riattiva l'item e i conteggi tornano come prima.
4. **Coda Proposed** — Approve visibile su ogni riga; dopo Approve la riga sparisce, il conteggio cala, la barra
   avanza, compare il banner.
5. **Rischio** — il menu ⋯ dei topic mostra Reject con `REVERSIBLE` e Merge in rosso con `IRREVERSIBLE` dopo un
   divisore.
6. **Merge** — target scelto con `combo-select` con ricerca; Merge… rosso; la conferma richiede la checkbox; Reject
   instead esegue Reject; il banner riporta l'`usage_count` reale del target.
7. **Rejected** — è una voce della sub-nav con Restore, nessun `<details>`.
8. **Form in drawer** — tutti i form sono drawer da 480 px con Cancel + primario, errori del server nel drawer.
9. **Slug preview** — New list mostra lo slug che il server genererà (test di parità verde).
10. **Stati** — caricamento, accesso negato, errore con Try again, nessuna lista, filtri vuoti usano `.pd-state` /
    `.pd-banner`.
11. **Team invariato** — l'assegnazione dei nomi Unmatched in `team.html` funziona come prima con il `combo-select`
    condiviso.
12. **Pulizia** — nessun hex nella pagina, nessun `badge-st-` in `css/admin-crud.css`, nessun `<select>` nativo per il
    merge; `npm test` verde.
13. **Responsive** — a 1024 px la sub-nav è una riga di chip; a 390 px un selettore di sezione e i drawer a tutto
    schermo.

## Decisioni aperte

1. **Smartphone con `.md-subnav-select` e menu a popover.** Alternativa scartata: i bottom sheet di 14ad-2. Perché:
   il sito non ha un bottom sheet condiviso e vince il sito.
2. **`combo-select` estratto in un file condiviso e adottato da Team.** Alternativa scartata: copia locale nella
   pagina. Perché: due implementazioni dello stesso controllo divergerebbero.
3. **Merge senza totale stimato; il banner usa l'`usage_count` reale dopo il ricaricamento.** Alternativa scartata:
   somma client dei due conteggi. Perché: sovrastima con descrizioni in comune.
4. **Errori dei form col testo del server, nessuna pre-validazione dei topic.** Alternativa scartata: testi e
   validazione delle tavole. Perché: la regola vive sul server.
5. **Rename lista verso un nome già usato: comportamento invariato.** Alternativa scartata: correggerlo qui. Perché:
   è un fix del server, fuori da un ciclo visivo.
6. **Conteggi della sub-nav solo per gli item attivi.** Alternativa scartata: conteggi totali. Perché: l'API dà solo
   `active_item_count`.
7. **Funzioni A–F incluse.** Alternativa scartata: escluderle come in Team (Undo). Perché: confermate in chat.
8. **Anteprima dello slug da un gemello client di `slugify` pinnato da un test di parità.** Alternativa scartata:
   riscriverla inline nella pagina. Perché: un secondo algoritmo senza test divergerebbe in silenzio.
