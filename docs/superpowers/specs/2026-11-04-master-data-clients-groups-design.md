# Master Data — Clients & groups (phase 2, page 1 of 4) — design spec

**Date:** 2026-11-04
**Brief started:** 2026-11-04 09:45
**Brief:** `docs/superpowers/design/MD-Clients-Groups/2026-1193-brief-master-data-clients-claude-code.md`
**Scenario:** 2 (evoluzione)

Fase 2 del redesign Master Data, prima pagina: il contenuto della sezione "Clients & groups" dentro la shell
della fase 1. Client Groups confluisce in `master-clients.html`; la rate card del client passa da modale a
sotto-vista della pagina con un suo URL. La shell (page head, sub-nav, card) non cambia. Il brief è normativo
dove differisce dalle note delle tavole; le regole attuali dell'app vincono sulle tavole (brief §2).

## 1. Obiettivo

- Vista **List** e vista **By group** con le stesse righe e le stesse azioni; ricerca su entrambe.
- Aggiunta inline di client e gruppo, rename inline del gruppo, edit inline del nome del client.
- Assegnazione e spostamento del gruppo dalla riga e dal selettore "+ Add client"; un gruppo per client.
- Delete del gruppo bloccato quando esiste un POT, in UI e in API.
- Rate card come sotto-vista con URL proprio; caricamento e salvataggio identici alla modale.
- `master-client-groups.html` diventa un redirect alla vista By group.
- Tablet e smartphone come 10.2e; niente emoji; copy in inglese.

## 2. Fatti verificati nel codice (a `6fe1a7e`)

- `GET /api/clients` → `{id, name}` (`api/src/routes/config.js:13`). `POST` rifiuta un nome duplicato (409,
  "Client name already exists"); `PATCH` non controlla i duplicati (il controllo è lato pagina, `saveClient`).
- `DELETE /api/clients/:id` rifiuta con 400 "Cannot delete client with linked projects" (`config.js:47`). Il
  `confirm()` nativo di oggi dice "Projects assigned to this client will become unassigned.": è falso.
- `GET /api/client-groups` → gruppi con `clients[]` (`client-groups.js:8`). `PUT /:id/clients/:clientId`
  rifiuta con 400 un client già in un altro gruppo (`client-groups.js:75`). `DELETE /:id` cancella il gruppo;
  `clients.group_id` va a NULL e i POT del gruppo vengono cancellati in cascata
  (`005_drafts_pipeline_year_pot.sql:24,31`).
- I POT **non hanno un nome**: un POT per gruppo (o client, o etichetta speciale) **per anno** (`pots.year`).
- `GET /api/roles` → `id, label, code, team, hourly_rate, rate_overrides`. `team` è valorizzato su 2 ruoli su
  58 ("Delivery", "Engineering"): non è una famiglia. I codici hanno la forma `PREFISSO - RUOLO`
  (`HWGACCSVS - DIRECTOR`); alcuni non hanno `" - "` (`GREENLIGHT SHARED RESOURCE`).
- `GET /api/ratecards` restituisce tutte le rate card con `entries[{roleId, hourlyRate, rateOverrides}]` e
  `client_id`: basta per contare le tariffe custom di ogni client senza chiamate in più.
- Regola di risoluzione: `resolveRoleRate` (`js/lib/costgrid-calc.js:92`). EUR: client € → agency €. Altra
  valuta: client nella valuta → agency nella valuta (`roles.rate_overrides`) → € (client o agency) × cambio
  della versione. Il testo della tavola 10.2d coincide con il codice.
- `currencies.current_rate` è il cambio corrente ("Fallback 1 € = x" in testa alle colonne).
- La breadcrumb è costruita da `initNav` tramite `window.updateBreadcrumbs(items)` (`js/nav.js:331`), che una pagina può richiamare per riscriverla.
- Non esistono un segmented control né un toggle condivisi (solo il segmented locale di `css/costgrid.css`).
- `showConfirm(message, onConfirm, onCancel, title)` in `js/core.js:287` è il modale di conferma dell'app.
- `master-client-groups.html` è citato da `master-data-guard`, `content-surface-guard`, `nav-shell-guard`,
  `page-head-guard`, `page-names.test.js`, e linkato solo da `master-clients.html:73`.

## 3. Mappa tavola → sezione

| Tavola | Sezione |
|---|---|
| `10.2a-clients-list.png`, `10.2a.jpg` | §5 Vista List |
| `10.2b-new-client-inline.png` | §5.3 Riga nuovo client |
| `10.3a-by-group.png` | §6 Vista By group |
| `10.3b-new-group-add-client.png` | §6.3 Nuovo gruppo, §6.4 Selettore "+ Add client" |
| `10.2c-rate-card.png` | §7 Rate card |
| `10.2d-rate-card-how-rates-resolve.png` | §7.4 "How rates resolve" |
| `10.2e-tablet-smartphone.png` | §9 Responsive |

Nelle tavole ma fuori scope: segmented Active/Archived, colonna Status, frase sull'archivio, voce Archive nel
menu "⋯" del phone, conteggio nella sub-nav (decisione della fase 1), nome esteso della famiglia di ruoli.

## 4. Architettura

- **Una sola app Vue** in `master-clients.html`. Stato di vista `view: 'list' | 'group'` e `rateClientId`
  (sotto-vista rate card quando non è nullo). URL: `?view=group` per la vista By group (assente = List),
  `?client=<id>` per la rate card. Il cambio di vista fa `history.replaceState`; l'apertura della rate card
  `history.pushState`; `popstate` rilegge l'URL. Il reload riapre lo stato dell'URL; un `client` sconosciuto
  torna alla lista con `globalError` "Client not found.".
- **Nuovo modulo `js/lib/master-clients.js`** (ES module + bridge `window.*`), funzioni pure:
  - `filterClients(clients, groupsById, query)` — match case-insensitive sul nome del client o del gruppo.
  - `groupSections(clients, groups)` — sezioni per gruppo ordinate per nome, poi "No group" se non vuota.
  - `customRateCount(ratecard)` — numero di entry con almeno un valore non nullo (EUR o override).
  - `roleFamily(code)` — prefisso prima del primo `" - "`; senza prefisso → `'Other'`; ordinamento famiglie
    alfabetico con `Other` in fondo.
  - `cellSource({ row, code, currencies })` — `{ value, kind }` con `kind` in `custom | agency |
    agency-currency | converted | missing`, calcolato **chiamando `resolveRoleRate`** (import ES da
    `costgrid-calc.js`) con `currencyRate = current_rate` della valuta; `missing` quando il ruolo non ha
    agency € e la cella non ha un valore proprio.
  - `buildRatecardEntries(rows, currencies)` — il corpo di `saveClientRatecard` estratto senza modifiche:
    `{ entries }` oppure `{ error: { code } }` per il primo importo non valido.
  - `moveClient({ clientId, fromGroupId, toGroupId }, api)` — remove dal gruppo vecchio (se c'è), assign al
    nuovo (se c'è); se l'assign fallisce dopo un remove riuscito ri-assegna il gruppo vecchio e rilancia
    l'errore originale.
- **Redirect**: `master-client-groups.html` diventa come `config.html` (meta refresh + `location.replace`)
  verso `/master-clients.html?view=group`; Vue app e stili locali rimossi.

## 5. Vista List (10.2a, 10.2b)

### 5.1 Testata della card

Una riga che va a capo: titolo "Clients & groups" (la card-head della shell, ora con questo nome), segmented
**List / By group**, spazio, ricerca 190px "Search client or group…", bottone secondario **+ Add group** (apre
la riga nuovo gruppo e passa a By group), bottone primario **+ Add client**. La descrizione sotto il titolo e il
link "Client groups →" spariscono. Breadcrumb `Home / Master Data / Clients & groups`.

### 5.2 Tabella

Testata 10px maiuscolo su sfondo token più vicino a `#F7F8FA`; righe 52px, hover token più vicino a `#FAFBFC`;
ordine per nome.

| Colonna | Contenuto |
|---|---|
| Name | Nome 13.5px 600 navy; in edit diventa input + Save / Cancel |
| Client group | Pill-selector con il gruppo, o "No group" muted senza bordo. Menu: "No group", tutti i gruppi (check sul corrente), divisore, "+ New group…" |
| Rate card | Pill "N custom rates" (verde) o "Agency rates" (grigio); click → rate card |
| Actions | Link "Rate card →", icona edit (30×30), "⋯" |

- **Edit del nome**: stessa validazione di oggi ("Name is required.", `A client named "X" already exists.`),
  stessa API (`Api.clients.update`). La form card "Edit client"/"New client" è rimossa.
- **Menu "⋯"**: Delete, con hint su una riga. Sempre abilitato; conferma con `showConfirm` —
  `Delete client "X"? This can't be undone.` — l'errore del server (es. progetti collegati) va in
  `globalError`. Nessun `confirm()` nativo.
- **Selettore gruppo**: scegliere un gruppo o "No group" chiama `moveClient` (§8). "+ New group…" apre la
  riga nuovo gruppo (§6.3) in vista By group; dopo la creazione quel client viene assegnato al gruppo nuovo.

### 5.3 Riga nuovo client (10.2b)

Prima riga sotto la testata, sfondo come la testata: input nome (autofocus, focus ring magenta) placeholder
"Client name, e.g. Acme Corp", selettore gruppo opzionale ("No group"), testo muted "Agency rates", Cancel /
Create. Create disabilitato finché il nome è vuoto; Enter = Create, Esc = Cancel. Validazione ed errori di oggi,
mostrati sotto la riga. Se è scelto un gruppo, dopo la create si chiama l'assign; se l'assign fallisce il client
resta creato e senza gruppo, con l'errore sotto la riga.

### 5.4 Nota e stato vuoto

Nota in fondo (11.5px muted): "A client group puts affiliates under one umbrella: in Pipelines & POTs the group
has a single POT." Stato vuoto: "No clients yet. Use + Add client to create the first one." Ricerca senza
risultati: "No clients match "<query>"."

## 6. Vista By group (10.3a, 10.3b)

### 6.1 Sezioni

Una sezione apribile per gruppo (ordinata per nome), poi **"No group"** con i client senza gruppo (solo se ce ne
sono). Testata 46px: chevron, icona edificio (SVG `.pd-icon`), nome, "N client(s)", pillola POT, spazio,
"+ Add client", icona Rename, icona Delete. "No group" ha icona attenuata e nessuna azione. Le righe sotto sono
le righe della List, rientrate di 46px. Gruppo vuoto: "No clients in this group yet · use "+ Add client" or
pick the group on a client." Nessun gruppo: solo "No group" più "No client groups yet. Groups bundle clients
together for POT targets."

### 6.2 Pillola POT e delete

- Pillola viola "POT · <anno più recente>", con " +N" se il gruppo ha POT di altri anni; tooltip "Clients in a
  group share one POT".
- Delete disabilitato quando il gruppo ha almeno un POT, con hint/tooltip "Can't delete: this group has a POT
  (<anni>). Remove the POT first."
- Altrimenti `showConfirm`: `Delete group "X"? Its clients become ungrouped.`; un 409 del server (POT creato nel
  frattempo) va in `globalError` e ricarica i gruppi.

### 6.3 Rename e nuovo gruppo

- Rename inline sulla testata (input + Save / Cancel; Enter/Esc), validazione di oggi: nome obbligatorio e
  unico (case-insensitive) fra i gruppi.
- Riga nuovo gruppo sopra le sezioni: icona, input "Group name, e.g. Italian Public Sector", hint "Add clients
  to it after creating it.", Cancel / Create group (disabilitato a nome vuoto), stessa validazione.

### 6.4 Selettore "+ Add client" (10.3b)

Popover "ADD TO <GRUPPO>" con tutti i client non in questo gruppo, ordinati per nome: quelli in un altro gruppo
mostrano "Move from <gruppo>" in ambra, gli altri "No group" muted. La scelta chiama `moveClient`. Vuoto:
"Every client is already in this group." Esc o click fuori lo chiudono.

## 7. Rate card (10.2c, 10.2d)

### 7.1 Contenitore

- Sotto-vista al posto della card della lista (la sub-nav resta). `#clientRcModal` è rimosso.
- Breadcrumb `Home / Master Data / Clients & groups / <Client> · Rate card`, con "Clients & groups" che porta
  alla lista; aggiornata con `window.updateBreadcrumbs(items)` di `js/nav.js`.
- Testa: link "← Clients", titolo "Rate card · <Client>", pillola verde "N roles customized" (N = righe con
  almeno un valore custom nello stato corrente), descrizione "Custom hourly rates for this client, applied
  automatically when it's selected in a new proposal. Leave a field empty to use the agency rate."
- Toolbar: ricerca "Search role or code…" (label o codice), toggle **Only customized**, legenda (Custom /
  Agency / From € × rate), toggle "How rates resolve".
- Tabella in una card propria con scroll verticale interno; testata e righe famiglia sticky.
- **Save bar** sempre visibile: pallino + "All rates saved" / "N unsaved changes" (N = celle il cui testo
  differisce da quello di apertura), errore di validazione o di salvataggio nella stessa barra, Discard
  (ripristina i testi di apertura), **Save rates** (primario magenta).
- Uscita con modifiche non salvate ("← Clients", breadcrumb della lista via `click` intercettato, `popstate`):
  `showConfirm` "You have unsaved rate changes. Leave without saving?"; su `popstate` annullato si ripristina
  l'URL con `pushState`. Chiusura o reload della scheda: `beforeunload`.

### 7.2 Tabella

- Colonne: Role (label + codice monospace 10.5px), Agency €/h (sola lettura, "—" ambra se manca), Client €/h,
  una colonna per ogni valuta attiva non EUR (testa: codice + "Fallback 1 € = <current_rate>"), icona reset.
- Ruoli raggruppati per famiglia (`roleFamily`), apribili; testata: codice famiglia e "x of y customized"
  oppure "y roles · agency rates".
- Ogni input: placeholder = valore effettivo (`cellSource().value`, formattato con `formatMoneyInput`);
  didascalia sotto = fonte: "Custom" (verde), "Agency" / "Agency <CUR>" (muted), "From € × rate" (viola
  corsivo), "No rate · set one" (EUR) / "No rate" (ambra). Valori custom in grassetto con bordo navy.
- Reset per riga (solo righe con valori custom): svuota i testi della riga, segna dirty, non salva.
- "Only customized" e ricerca filtrano le righe; una famiglia senza righe visibili non si mostra.

### 7.3 Logica invariata

Caricamento e salvataggio identici alla modale: ruoli e rate card riletti a ogni apertura, auto-create della
rate card del client se manca, `readMoneyInput`/`formatMoney` su focus/blur con `stored` e `keepZero`, messaggio
"Enter a valid amount in <CUR>, e.g. …", salvataggio a sostituzione completa (`Api.ratecards.updateEntries`),
override in valute non più attive conservati (`hidden`). Un caricamento o un salvataggio scrive solo nello stato
per cui è partito (invariante attuale). Dopo un salvataggio riuscito i testi correnti diventano quelli di
riferimento ("All rates saved") e il conteggio "N custom rates" della lista si aggiorna.

### 7.4 "How rates resolve" (10.2d)

Pannello sopra la tabella, due colonne. **EUR**: 1 · Client rate in €; 2 · Agency rate in € (Roles & rates).
**Other currencies (e.g. <prima valuta extra>)**: 1 · Client rate in <CUR>; 2 · Agency rate in <CUR>;
3 · € rate (client or agency) × exchange rate; poi "Steps 1–2 are used as they are, without conversion. A custom
€ rate doesn't change <CUR> when an agency <CUR> rate exists. The exchange rate is the one saved in the proposal
version at creation, not the live one." Senza valute extra si mostra solo la colonna EUR.

## 8. Spostamento fra gruppi e backend

- `moveClient` (§4) per riga e popover. UI ottimistica: il gruppo cambia subito; in errore si torna al gruppo
  precedente e l'errore va in `globalError`. Dopo ogni spostamento i gruppi si ricaricano da `GET
  /client-groups`.
- **`DELETE /api/client-groups/:id`**: prima di cancellare, `SELECT … FROM pots WHERE client_group_id = $1`;
  se ce ne sono → **409** `{ error: 'Group has a POT: remove the POT first.', code: 'GROUP_HAS_POT' }`.
- **`GET /api/client-groups`** aggiunge `pots: [{ id, year }]` ordinati per anno decrescente (`[]` senza POT).
  Campo additivo: `master-pipelines.html` e gli altri lettori non cambiano.
- `ARCHITECTURE.md` §5 e `docs/api` aggiornati sul branch se il guard lo richiede.

## 9. Responsive (10.2e)

**Tablet (768–1023px)** — tabella invariata; sotto 900px la colonna Rate card (pillola) si nasconde, il link
"Rate card →" resta. Toolbar su due righe (titolo + segmented; ricerca + bottoni), controlli 40px. Rate card:
colonne Role e Client € sticky a sinistra, valute in scroll orizzontale, Agency € come ultima colonna, input
40px, save bar fissa in fondo al contenuto.

**Smartphone (< 768px)** — toolbar: ricerca (flex) + "+ Add"; seconda riga segmented List / By group + "+ Group";
tutto 44px. Client come card: nome + "⋯" (44px), gruppo (o "Tap ⋯ to add to a group") + pillola rate card,
riga "Rate card ›" (44px). Menu "⋯": Edit, Move to group (apre il menu dei gruppi), Delete. By group: etichetta
gruppo maiuscola, conteggio, pillola POT, "+ Add client", card sotto. Rate card: segmented di valuta (EUR + valute
attive) con la riga di hint ("Empty = agency € rate." / "Empty = agency <CUR> rate; if missing, € rate ×
<current_rate>."), famiglie come card apribili, ogni ruolo = nome + riga della fonte + input 96×44px; save bar
sticky in fondo con "N roles customized" + Save rates.

## 10. Componenti, token, icone, cache-busting

- `.md-seg` (segmented) e `.md-switch` (toggle) in `css/style.css` accanto agli altri `.md-*`, dai token più
  vicini alla tavola (traccia `#EEF0F4`, pillola attiva bianca). Gli stili specifici della pagina restano nel
  suo `<style>`, ripuliti dagli hex (token).
- Icone SVG `.pd-icon` (`js/lib/icons.js`): quelle mancanti (edificio, matita, puntini, reset, info, cerca,
  chevron) si aggiungono lì. Nessuna emoji (💲 ✏️ 🗑 🏢).
- Bump di `?v=` di `style.css` e `icons.js` in ogni riferimento del repo (guard); `js/nav.js` non cambia.

## 11. Test

- **Nuovo** `js/lib/master-clients.test.js`: filtro, sezioni (ordine, "No group" solo se non vuota),
  `customRateCount`, `roleFamily` (prefisso, `Other`), `cellSource` per ogni `kind` (EUR e non EUR, override
  client, override agency, conversione, missing), `moveClient` (assign, unassign, move, rollback su assign
  fallito, nessun rollback se fallisce il remove), **`buildRatecardEntries` produce lo stesso payload della
  modale** per gli stessi input (casi copiati dal comportamento attuale: righe vuote escluse, `hidden`
  conservati, zero, importo non valido).
- `js/lib/master-clients-ratecard-guard.test.js` riscritto sui nuovi nomi, stesse invarianti (nessuna scrittura
  sullo stato corrente dopo il primo await, ruoli riletti a ogni apertura, `keepZero`, `stored`, timer del
  messaggio). Nessun `confirm(`/`alert(` nella pagina.
- `master-data-guard`, `content-surface-guard`, `nav-shell-guard`, `page-head-guard`, `page-names.test.js`:
  `master-client-groups.html` atteso come redirect a `/master-clients.html?view=group`.
- Guard di `?v=` esistenti per i bump.
- Backend: `test-api.js` — `DELETE /client-groups/:id` con un POT → 409 `GROUP_HAS_POT` e gruppo intatto; senza
  POT → 200; `GET /client-groups` porta `pots`.
- Manuale: caso nuovo in `TEST_CASES.md` (sotto-vista rate card, back/forward, unsaved guard, spostamento).

## 12. Verifica visiva

`scripts/shoot.mjs` contro lo stack del branch (`scripts/test-branch.sh up`, `--base http://localhost:8081`,
`--settle 3000`): List e By group con popover "+ Add client" aperto a 1440; rate card e rate card con "How rates
resolve" a 1440; rate card a 1024; lista e rate card a 390. I PNG si rileggono e si confrontano con le tavole
del §3; gli scostamenti si presentano uno per uno (fix ora / accetta e registra in `docs/pages/config.md`).

## 13. Fuori scope

Shell della fase 1; Pipelines & POTs, Roles & rates, Currencies; archivio dei client; campi del client oltre a
nome e gruppo; modifiche alla risoluzione delle tariffe; il controllo di `DELETE /clients/:id` (solo progetti) e
la cascata dei POT per client; un endpoint di move atomico.

## Criteri di accettazione

1. **Due viste** — List e By group mostrano le stesse righe e azioni; la ricerca filtra per nome di client e di gruppo in entrambe (`master-clients.test.js`; a vista al Gate 2).
2. **Inline** — aggiunta client, aggiunta gruppo, rename gruppo ed edit nome client avvengono inline con la validazione di oggi (nome obbligatorio, duplicato rifiutato); nessuna form card resta (Gate 2).
3. **Gruppo dalla riga e dal popover** — assegnare, togliere e spostare un client funziona da entrambi i punti; un client sta in un solo gruppo; un assign fallito ripristina il gruppo precedente (`master-clients.test.js`; Gate 2).
4. **Delete gruppo con POT** — `DELETE /api/client-groups/:id` risponde 409 `GROUP_HAS_POT` se esiste un POT e il gruppo resta; in UI il cestino è disabilitato con l'hint (`test-api.js`; Gate 2).
5. **Rate card come sotto-vista** — `?client=<id>` apre la rate card, back/forward e reload funzionano, la breadcrumb mostra `<Client> · Rate card` (Gate 2).
6. **Salvataggio invariato** — per lo stesso input il payload di `Api.ratecards.updateEntries` è identico a quello della modale; i test money esistenti passano (`master-clients.test.js`, `npm test`).
7. **Fonte delle tariffe** — placeholder e didascalie seguono `resolveRoleRate` (Custom / Agency / Agency CUR / From € × rate / No rate) (`master-clients.test.js`).
8. **Unsaved guard** — uscire dalla rate card con modifiche non salvate chiede conferma; Discard ripristina (Gate 2).
9. **Redirect** — `/master-client-groups.html` porta a `/master-clients.html?view=group` (`master-data-guard`; Gate 2).
10. **Responsive** — tablet e smartphone come 10.2e, target touch ≥ 44px su phone (shoot a 1024 e 390, confronto con `10.2e-tablet-smartphone.png`).
11. **Niente emoji, niente dialog nativi** — nessuna emoji né `confirm(`/`alert(` in `master-clients.html` (guard).

## Decisioni aperte

1. **Una sola pagina, logica pura in `js/lib/master-clients.js`.** Alternativa scartata: logica inline nell'HTML. Perché: il brief chiede test su spostamento, rollback e identità del payload.
2. **Famiglia = prefisso del codice prima di `" - "`, codici senza prefisso in "Other", testata col solo codice.** Alternativa scartata: `roles.team` o un nome esteso inventato. Perché: `team` è vuoto su 56 ruoli su 58 e il nome esteso non esiste.
3. **Pillola "POT · <anno più recente>" con "+N", hint del delete con gli anni.** Alternativa scartata: "POT · <nome>" della tavola. Perché: i POT non hanno nome.
4. **`pots: [{id, year}]` in `GET /client-groups`.** Alternativa scartata: `GET /pots` al caricamento. Perché: quell'endpoint calcola i totali pipeline di ogni POT, inutili qui.
5. **Spostamento lato client (remove + assign) con rollback.** Alternativa scartata: endpoint di move atomico. Perché: il brief limita il backend al §7.3 e il rollback copre il secondo passo fallito.
6. **Breadcrumb aggiornata con la `window.updateBreadcrumbs(items)` già esposta da `js/nav.js`.** Alternativa scartata: una funzione nuova in `nav.js` o riscrivere `#breadcrumb-bar` dalla pagina. Perché: l'API esiste già, e `nav.js` resta intatto.
7. **`.md-seg` e `.md-switch` in `css/style.css`.** Alternativa scartata: componenti globali dell'app. Perché: le riusano le prossime tre pagine Master Data, il resto dell'app no.
8. **Delete client sempre abilitato, errore del server inline.** Alternativa scartata: conteggio progetti in `GET /clients`. Perché: il brief lo consente ed evita un secondo cambio API.
9. **Verifica visiva con `scripts/shoot.mjs` nel Piano (§12).** Alternativa scartata: solo il Gate 2. Perché: otto tavole su tre larghezze.
10. **Archivio fuori ciclo (brief §7.1).** Alternativa scartata: `clients.archived_at`. Perché: migrazione e filtro su tutti i picker dei client.
