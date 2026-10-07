# Brief — Portfolio, vista overview (tavole 6.3)

> Scritto dall'utente e incollato in chat il 2026-10-08, non prodotto da Claude Design.
> Salvato qui come input della fase Brief (PROCESS.md §6.5: il Brief è committato prima di
> aprire il ciclo). Testo riprodotto integralmente; le note di questo riquadro sono l'unica
> aggiunta.
>
> **Il brief copre due cicli.** Per decisione dell'utente (2026-10-08) il lavoro è stato
> diviso: **Ciclo 1 = le viste** (header, toolbar, Card, List, CSS, computed, correzione di
> `cardData()`), **Ciclo 2 = lo Share di programma** (§5 — i due endpoint nuovi e il
> componente Vue). Nel Ciclo 1 il pulsante Share resta agganciato alla
> `openShareModal('program', …)` esistente.
>
> **Nomi dei file delle tavole.** Il brief le chiama 6.4a / 6.4b / 6.5e; sul disco si chiamano:
>
> | Nome nel brief | File |
> |---|---|
> | 6.4a — vista Card | `6.3-portfolio-card-list.jpg` |
> | 6.4b — vista List | `6.3-portfolio-project-list.jpg` |
> | 6.5e — modale Share | `6.3-portfolio-share-modale.jpg` |
>
> **Le decisioni del §9 sono state prese in `/brainstorming`** e sono registrate, con le
> relative motivazioni, nella §4 della spec
> `docs/superpowers/specs/2026-10-08-portfolio-overview-cycle1-views-design.md`. Dove spec e
> brief divergono (ordinamento misto, filtro Client multi-selezione, `N at risk` in navy
> invece che in rosso, progetti senza date resi visibili) **vale la spec**.

---

Immagini allegate:

| Tavola | Contenuto |
|---|---|
| 6.4a | Vista Card (griglia uniforme, programma espanso sotto la riga) — **riferimento per il layout Card** |
| 6.4b | Vista List (albero) — **riferimento per il layout List** |
| 6.5e | Modale Share "Manage access" — **riferimento unico per lo Share** |

6.4a mostra lo Share come popover: **il popover non si implementa.** Lo Share è sempre la modale della 6.5e, in entrambe le viste (Card e List) e per qualunque numero di persone. Le tavole 6.5a–d (popover a soglie) e 6.3c (griglia a peso variabile) non vanno implementate.

---

## 0. Natura dell'intervento

Restyling della vista `overview` di `portfolio.html`, dentro la struttura attuale:

- Una sola app Vue, stessi `data`/`computed`/`methods`, estesi solo dove serve.
- Restano invariati: caricamento (`loadClientsFromApi`, `loadProgramsFromApi`, `loadCurrenciesFromApi`), `cardDataMap`, `programStatsMap`, `visibleProgramGroups`/`ungroupedProjects`, `sortedFilteredProjects` e i filtri (search, Client, Status), `goConfigure`, `showDashboard`, `?projectId=`/`replaceState`, `?notice=direct-creation-disabled`.
- La vista `dashboard` (dettaglio progetto) è fuori scope.
- **Le regole di business del codice hanno la precedenza sui disegni.** Dati e importi delle tavole sono illustrativi; formattazione solo via `formatMoney(amount, code, currencies)`, `fmtVar`, `varColor`, `monthLabel`.

Vincoli dal `CLAUDE.md` del repo: niente build step, solo `var(--token)`, `?v=N` aggiornato sui file versionati toccati, shim/override solo `type="module"`, `#app-shell`/`#app-main` senza `overflow`/`position`/`transform`, `v-cloak` invariato, workflow `docs/superpowers/PROCESS.md` con `/finish-cycle`.

## 1. Tre punti fermi (richiesti esplicitamente)

1. **`+ New project` resta disattivato, come oggi.** Stessa logica: `:disabled="!directCreationEnabled"`, `<span>` esterno con il tooltip `directCreationMessage`, testo dello stato vuoto invariato. Cambia solo lo stile (magenta, in alto a destra come in tavola) e lo stato disabilitato deve leggersi come tale (opacità ridotta, `cursor:not-allowed`). In tavola appare attivo: è un errore della tavola.
2. **Il pulsante `Dashboard` del programma (e il link "Program Dashboard →" nel pannello figli) resta inattivo.** La Program Dashboard non esiste ancora. Renderlo disabilitato con tooltip "Program Dashboard — coming soon", nessun handler, nessuna navigazione. Il `Dashboard` dei **progetti** invece funziona: chiama `showDashboard(cfg.id)` come l'attuale "Project Dashboard".
3. **Share = modale 6.5e, sempre.** Dettagli in §5.

## 2. Organizzazione CSS

- Nuovo `css/portfolio.css?v=1`, caricato solo da `portfolio.html` (stesso precedente di `pipeline.css`). Classi nuove con prefisso `.pf-*`.
- `style.css` e `tokens.css` non si toccano. Niente token nuovi se evitabile.
- Le stringhe HTML via `v-html` usate nelle card (`pipelineBadge`, `statusBadgeLarge`, `budgetBadgeHtml`) possono restare per questo ciclo, purché lo stile pillola sia quello della tavola (radius 999px, 10.5px/700). Se serve cambiarle in `js/core.js`, bump e verifica sulle altre pagine che le usano.
- **Nessuna emoji**: 📋 📂 📁 🔗 ⚙️ 📊 🔍 ▶ ▼ ✕ → icone SVG `stroke="currentColor"` 14/16px o solo testo.

## 3. Header e toolbar

- Titolo "Project Portfolio" 26px/700 navy; sotto, riepilogo "N programs · N projects" (calcolato da `visibleProgramGroups`/`ungroupedProjects`, non hardcoded). Il sottotitolo attuale "Budget Spent vs Estimated by month…" sparisce (la vista non mostra più il dettaglio mensile).
- Pulsante `+ New project` a destra (§1.1).
- Toolbar in una riga:
  - ricerca (300px, icona SVG, placeholder "Search project, code or client…") → `portfolioSearch`;
  - dropdown **Client**, **Status** (comportamento attuale, badge conteggio invariato);
  - **Stage**: in tavola c'è, nel codice no. Da aggiungere solo se si conferma (§9); altrimenti omettere;
  - spazio flessibile; **Sort** (`portfolioSort`, opzioni attuali);
  - selettore segmentato **Card | List** → nuovo stato `portfolioLayout: 'card' | 'list'`, persistenza facoltativa in `localStorage` (chiave nel `keep` Set di `core.js`, con bump).
- "Clear filters" come link testuale, senza ✕ rosso. Messaggio "No projects match the current filters." invariato.

## 4. Viste

**Card (6.4a)** — sostituisce la griglia Bootstrap `col-md-6`:
- Griglia CSS a 3 colonne, gap 16px, stesso ordine di oggi (`visibleProgramGroups` poi `ungroupedProjects`; se l'ordinamento per cliente della tavola richiede di mescolare programmi e progetti, va in `sortedFilteredProjects`/computed dedicato — da confermare §9).
- **Card progetto**: etichetta "PROJECT" + pillola stadio; cliente, titolo (max 2 righe), codice monospace; griglia 2×2 Duration / Sold / Spent / Variance (valori da `cardDataMap`, currency `cfg.currency`); barra speso/venduto 4px (navy, ambra ≥85%, rosso >100%, vuota se no budget) con "N% spent" / "No budget"; footer: pillola stato · `Configure` (gating `my_permission !== 'viewer'` come oggi) · `Dashboard` (§1.2).
  - Il badge "No actuals available" resta: va reso come pillola neutra accanto allo stato o sopra la barra.
- **Card programma**: stessa struttura, card "impilata" (ombra a gradino), etichetta "PROGRAM · N projects", numeri da `programStatsMap`; footer: `Share` · `Show N projects`/`Hide projects` (→ `toggleProgramExpanded`) · `Dashboard` inattivo.
- **Pannello figli**: si apre sotto la riga che contiene il programma, largo quanto la griglia, uno alla volta (oggi `expandedPrograms` è un Set: passa a singolo id, o si chiude l'altro all'apertura). Figli in griglia a 4 colonne: nome, codice, pillola stato, "€ Xk / € Yk", barra, `Configure` · `Dashboard →`.
- Con filtri attivi, comportamento attuale: figli sempre visibili, toggle sostituito da etichetta non interattiva "Shown (filtered)".

**List (6.4b)** — vista nuova, stessi dati:
- Tabella a griglia: PROGRAM / PROJECT · STAGE · STATUS · DURATION · SOLD · SPENT (con barra 3px) · VARIANCE · azioni.
- Programma: chevron che espande i figli al loro posto (rientro 30px, sfondo leggermente grigio); colonna Status = "N at risk" in rosso se ci sono figli "Started at risk", altrimenti "N projects".
- Azioni: programma `Share` + `Dashboard →` (inattivo); progetto `Dashboard →` (attivo). `Configure` nella List non c'è in tavola: aggiungerlo come icona con lo stesso gating, oppure lasciarlo alla vista Card (§9).
- Stesso stato di espansione della vista Card o separato: separato è più semplice (la List permette più programmi aperti insieme).

## 5. Share (6.5e) — sempre modale

**Comportamento UI**
- Click su `Share` del programma → modale centrata 520px con backdrop. Si chiude con `Done`, ✕, click sul backdrop, Esc. Nessun popover in nessuna vista.
- Contenuto, dall'alto:
  1. Titolo "Share program" + nome del programma.
  2. Campo "Email or name" con suggerimenti dalla rubrica (`Api.users.activeList()`, stessi filtri di oggi: niente admin/sysadmin né sé stessi, esclusi chi ha già accesso) · ruolo Viewer/Editor · `Invite`.
  3. Nota: "Access also applies to all N projects in the program."
  4. "PEOPLE WITH ACCESS · N": ricerca tra chi ha accesso, filtro segmentato All / Editor · n / Viewer · n, lista ordinata Owner → Editor → Viewer. Ogni riga: avatar iniziali, nome, email, pillola ruolo (click = alterna Viewer/Editor), × per rimuovere. Owner: niente ×, niente cambio ruolo, casella non selezionabile.
  5. Caselle di selezione → barra navy "N people selected · Cancel · Remove access" per la rimozione multipla.
  6. Footer: "Notify by email" · "Copy link" · `Done`.
- Con poche persone la modale è la stessa; ricerca/filtro/caselle si possono nascondere sotto una soglia (§9).
- Feedback: errore inline sotto il campo ("Enter a valid email address.", "x already has access."); riga appena aggiunta con "Invite sent" se applicabile.

**Dove sta il codice**
- Oggi lo Share è `js/shares.js` (`openShareModal(type, id, name)`, modale Bootstrap iniettata, HTML in stringhe) e `js/share-list-component.js` (lista + rimozione, usato da `pipeline.html` e `costgrid.html`).
- Proposta: la nuova modale nasce come componente Vue in un file nuovo (es. `js/share-modal-component.js?v=1`), usato **solo da `portfolio.html` per i programmi** in questo ciclo. `shares.js` e `share-list-component.js` non si toccano: restano per pipeline, costgrid e per lo Share del progetto nella vista dashboard. L'estensione a progetti e proposal è un ciclo successivo.

**Divergenze dal codice / backend (da risolvere prima o dentro il ciclo)**
1. **Lista accessi del programma**: oggi non esiste. Per i programmi `shares.js` mostra solo un testo, e il backend ha solo `POST /programs/:id/share` (che scrive uno share su ogni progetto). Serve `GET /programs/:id/shares`, derivato dalle `resource_shares` dei progetti del programma. Regola da definire (§9): utente incluso se ha accesso ad almeno un progetto; ruolo = quello comune, oppure segnalare "Mixed" se differisce tra progetti.
2. **Rimozione e cambio ruolo a livello programma**: servono `DELETE /programs/:id/shares/:userId` (rimuove da tutti i progetti del programma) e il cambio ruolo (il `POST` esistente fa già upsert su tutti i progetti: verificare). Per la rimozione multipla: endpoint con `userIds[]` oppure N chiamate in sequenza dal client.
3. Stessi controlli di ownership del `POST` attuale (admin, o owner/editor su almeno un progetto). Chi non ha questi diritti vede la modale in sola lettura (niente campo invito, niente ×, niente caselle) — oppure il pulsante Share è nascosto (§9).
4. **Inviti esterni** (email non in rubrica): il backend accetta solo utenti `active`. Finché non c'è un flusso di invito, la voce "Invite <email>" nei suggerimenti **non si implementa**; un'email non trovata dà "No users found".
5. **Notify by email**: oggi la notifica parte sempre ("notified by email and in-app"). La casella richiede un parametro `notify` sul `POST`; se non lo si aggiunge, la casella si omette.
6. **Copy link**: per il programma non c'è una pagina di destinazione (la Program Dashboard non esiste, §1.2). Omettere "Copy link" sui programmi finché la pagina non esiste.

## 6. Mappatura colori → token

| Uso | Token |
|---|---|
| Testo principale, bottone secondario, pannello figli | `--brand-navy` |
| `+ New project`, focus ricerca | `--brand-magenta` (+ `-hover`, `--focus-ring`) |
| Bordi | `--border-light` |
| Testi secondari | `--text-muted`, `--text-faint` |
| Sfondi pagina / figli | `--surface-subtle`, `--surface-light` |
| Stadi | `--pipeline-{sip,anticipated,committed}-{bg,color}` |
| Stati progetto | `--status-*` (come `statusBadgeLarge`) |
| Barra ≥85% / >100%, Variance | `--color-warning`, `--color-danger`, `--color-success` |
| Pillole ruolo Owner/Editor/Viewer | token esistenti viola / success / info; se mancano, gli hex di `_permBadge` restano dove sono (in `shares.js`) e nel componente nuovo si usano i token più vicini |

Il viola `--violet-500` dei bordi programma attuali sparisce: il programma si riconosce dalla card impilata e dall'etichetta.

## 7. Copy (inglese)

- "Show N projects" / "Hide projects", "Program · N projects", "N% spent", "No budget", "N at risk".
- "Program Dashboard — coming soon" (tooltip del Dashboard inattivo).
- Share: "Share program", "Email or name", "Invite", "People with access · N", "Search people with access", "All / Editor / Viewer", "N people selected", "Remove access", "Cancel", "Done", "No people found", "Access also applies to all N projects in the program."

## 8. Responsive

Tablet 1024×768 e smartphone 390×844 **non sono ancora disegnati** per il Portfolio (vanno prodotti, come per Pipeline). In attesa delle tavole: a <1280 la griglia Card passa a 2 colonne, a <768 a 1 colonna; la List a <1024 nasconde Duration e Spent; la modale Share su smartphone diventa bottom sheet a tutta larghezza (`offcanvas-bottom`).

## 9. Decisioni da confermare

1. Filtro **Stage** in toolbar: aggiungere o no.
2. Ordinamento: programmi e progetti mescolati per cliente (tavola) o programmi prima (codice attuale).
3. Regola del ruolo nella lista accessi del programma quando differisce tra progetti ("Mixed" o ruolo più alto).
4. Share senza diritti di gestione: modale in sola lettura o pulsante nascosto.
5. Soglia sotto cui la modale nasconde ricerca / filtro / selezione multipla (proposta: ricerca da 6 persone, filtro e caselle da 16).
6. `Configure` nella vista List.

## 10. Fuori scope

- Vista `dashboard` del progetto, Share del progetto (resta `openShareModal('project', …)`), pipeline e costgrid.
- Program Dashboard (pagina inesistente).
- Abilitazione di `+ New project`.
- Inviti a utenti esterni.

## 11. Documentazione

- `docs/pages/portfolio.md`: nuova sezione (Card/List, Share programma in modale, Dashboard programma inattivo).
- `CLAUDE.md`: file structure (`css/portfolio.css`, componente Share), descrizione Pages.
- `docs/api/config.md` / `ARCHITECTURE.md`: nuovi endpoint shares del programma.

## 12. Checklist

- [ ] `css/portfolio.css?v=1` solo su `portfolio.html`; `style.css`/`tokens.css` intatti. Nessun hex nuovo, nessuna emoji.
- [ ] `+ New project` disabilitato con tooltip, come oggi.
- [ ] Dashboard del programma inattivo con tooltip; Dashboard del progetto → `showDashboard`.
- [ ] Selettore Card | List; Card a 3 colonne con pannello figli sotto la riga; List ad albero.
- [ ] Filtri, sort, auto-espansione con filtri attivi: comportamento invariato.
- [ ] Share programma = modale 6.5e in entrambe le viste, mai popover; Esc e backdrop chiudono.
- [ ] Endpoint `GET`/`DELETE` shares del programma con controllo ownership + test `node:test`.
- [ ] Inviti esterni, Notify e Copy link omessi se il backend non li supporta (§5).
- [ ] Verifica a 1440, 1024, 390 con dati reali (programma con >15 persone e con >4 figli).
- [ ] Docs aggiornate (§11).
