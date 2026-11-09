# Briefing Claude Design: redesign di `attribute-lists.html` (Attribute Lists)

Questo documento descrive **come funziona oggi** la pagina: cosa mostra, da dove arrivano i dati e cosa fa ogni controllo. Il nuovo layout non è prescritto. I problemi elencati nel §4 sono spunti, non decisioni.

**Principio guida di questo ciclo: riuso, non invenzione.** Questa pagina non ha esigenze che le altre pagine ridisegnate non abbiano già risolto. Ogni elemento va costruito con un pattern già collaudato nell'app (§5). Una soluzione specifica per questa pagina è ammessa solo quando nessun pattern esistente regge il caso, e va segnalata e motivata esplicitamente nella consegna.

## 1. Cosa è la pagina
È la console delle **tassonomie** di PDash, l'app di project e portfolio management. Gestisce due vocabolari distinti:
1. **Attribute lists**: liste generiche di valori (tag) con cui si classificano proposte e progetti. Quattro liste sono predefinite (Market, Brand, Therapeutic Area, Service Type); un admin può aggiungerne altre senza modifiche al codice. I loro valori compaiono nelle sezioni "🏷 Tags" di `costgrid.html` e `project-config.html`, e sono le dimensioni del profilo di esperienza in `team.html`.
2. **Topics**: le competenze ("Medical writing", "Data visualization") che un LLM estrae dalle descrizioni di progetti e task. L'agente le propone, un admin le approva, rinomina, fonde o rifiuta. Solo i topic approvati compaiono nei profili di esperienza di `team.html`.

È una pagina di amministrazione poco frequentata: si usa per impostare le liste all'inizio e poi per smaltire periodicamente la coda dei topic proposti.

**Chi la usa:** utenti con ruolo `admin` o `sysadmin`. Gli altri vedono "Admin access required" con un link "Go to app".

**Dove si trova:** voce "Attribute Lists" del menu ⚙ Admin nella sidebar. Il breadcrumb è `Home › Attribute Lists`.

## 2. Concetti che la UI deve rendere chiari
- **Lista**: nome e **slug**. Lo slug è generato una volta alla creazione dal nome e non cambia mai, nemmeno se la lista viene rinominata. Una lista si può solo creare e rinominare: **non si elimina**, per scelta, perché i suoi valori possono essere già applicati.
- **Item** (valore di una lista): una label, unica nella lista senza distinzione di maiuscole. Stato `active` / `inactive`. **Non si elimina**: si disattiva. Un item inattivo non viene più offerto quando si assegnano i tag.
- **Topic**: nome di 1–4 parole, al massimo 60 caratteri, in inglese. Non può coincidere con il nome di una lista né con la label di un item attivo. Tre stati:
  - `proposed`: suggerito dall'agente, non visibile nei profili finché non viene approvato;
  - `approved`: visibile nei profili;
  - `rejected`: nascosto, e l'agente non lo propone più.
- **Merge**: un topic viene assorbito da un altro. Tutte le descrizioni che lo usavano passano al topic di destinazione, e quello di origine sparisce. Un topic approvato si può fondere solo in un altro approvato, per non perdere l'approvazione.
- **Used in**: per un topic, il numero di descrizioni (di progetto o di task) collegate, non il numero di persone.
- **Effetto immediato**: rinomina, approvazione, rifiuto e merge dei topic si vedono subito nei profili di `team.html`, senza ricalcolo.
- **Un topic creato a mano non classifica nulla a ritroso.** Con **+ New topic** il topic nasce già approvato ed entra nel vocabolario che l'agente riceve a ogni estrazione. Viene collegato a una descrizione solo quando l'agente, estraendo quella descrizione, lo sceglie. L'estrazione rilegge però solo le descrizioni modificate: sui progetti già elaborati il nuovo topic arriva solo se la descrizione cambia o se si forza **Process** su quel progetto in *Profile processing* (`profile-jobs.html`). Finché non è collegato a nessuna descrizione, il suo "Used in" resta a 0.

## 3. Contenuti e funzionalità attuali

**Testata (`.ph`, già unificata).** Cambia con la vista:
- vista Lists: titolo "Attribute Lists", sottotitolo "N lists", azione primaria **+ New list**;
- vista Topics: titolo "Topics", sottotitolo "Competences extracted from project descriptions", azione primaria **+ New topic**;
- dettaglio di una lista: link indietro "‹ All lists", titolo = nome della lista, sottotitolo = slug, azione primaria **+ New item**.

**Tab di pagina** (Bootstrap `nav-tabs`), visibili solo fuori dal dettaglio di una lista: **Lists** e **Topics**, con il numero di topic proposti in un badge giallo. La pagina si apre sempre su Lists, la scelta non viene salvata e non ha un deep link.

### 3.1 Vista "Lists"
- Banner di errore rosso, solo quando il caricamento fallisce.
- **Tabella** dentro una card, senza ricerca, ordinamento o paginazione, nell'ordine dell'API:

| Colonna | Contenuto |
|---|---|
| Name | Nome della lista, in grassetto |
| Slug | Slug, piccolo e grigio |
| Active items | Numero di item attivi |
| (azioni) | **Rename** |

- **Clic su una riga** apre il dettaglio della lista (§3.2), nella stessa pagina.
- Stato vuoto: "No attribute lists yet."

### 3.2 Dettaglio di una lista
- Checkbox **Show inactive**, spenta all'apertura: senza spunta gli item inattivi sono nascosti.
- **Tabella** dentro una card, senza ricerca, ordinamento o paginazione:

| Colonna | Contenuto |
|---|---|
| Label | Label dell'item |
| Status | Pillola `active` / `inactive` |
| (azioni) | **Edit**, **Deactivate/Activate** |

- Durante Deactivate/Activate i pulsanti della riga si disabilitano, senza spinner e senza messaggio di conferma.
- Stato vuoto: "No items match the current filter."

### 3.3 Vista "Topics"
- Banner di errore proprio. Se un'azione fallisce, la lista viene ricaricata e poi compare l'errore del server.
- **Card "Proposed"**, solo se ci sono proposte, con il sottotitolo "— not shown in profiles until approved". Tabella: Name, Used in ("N descriptions"), azioni **Approve**, **Rename**, **Merge into…**, **Reject** (rosso).
- **Card "Approved"**: stessa tabella, azioni **Rename**, **Merge into…**, **Reject**. Stato vuoto: "No approved topics yet."
- **"Rejected (N) — never proposed again"**: un `<details>` nativo chiuso, con la tabella dei nomi e **Restore** (che li riporta ad approved).
- Nessuna ricerca, ordinamento o paginazione in nessuna delle tre sezioni.

### 3.4 Modal
Tutti con errore in un banner dentro il modal e spinner sul pulsante di conferma durante il salvataggio.
- **New list / Rename list**: campo Name.
- **New item / Edit item**: campo Label. Una label già presente nella lista viene rifiutata dal server.
- **New topic / Rename topic**: campo Name con l'aiuto "(a competence, 1–4 words, English)". Un topic creato a mano nasce già approvato.
- **Merge "X" into…**: testo "All descriptions using this topic will use the target instead; this topic disappears." e una `<select>` nativa "Choose the topic to keep…". Le opzioni proposte sono marcate "(proposed)". Per una sorgente approvata la lista contiene solo topic approvati.

### 3.5 Stati di pagina
- Caricamento: spinner centrato.
- Accesso negato: lucchetto, "Admin access required.", pulsante "Go to app".

## 4. Problemi di design da risolvere
1. **Pagina rimasta indietro.** È l'ultima console ⚙ Admin ancora nel linguaggio precedente al redesign: tabelle Bootstrap nude, pulsanti outline ripetuti su ogni riga, uno stile inline con un hex (`.slug-code`, `#9ca3af`).
2. **Il dettaglio di una lista sostituisce la pagina.** Le tab spariscono e si torna indietro con un link. Con liste che hanno pochi campi, il pattern master-detail già usato altrove (pannello o drawer laterale) potrebbe evitare il cambio di vista.
3. **Riga di azioni ripetuta.** Sui topic proposti ogni riga ha quattro pulsanti. Valuta il menu "⋯" di riga già in uso, lasciando in vista solo l'azione principale (Approve sulla coda).
4. **La coda dei topic proposti è un flusso di lavoro**, come gli Unmatched names di `team.html`: un contatore che cala in modo visibile, l'azione principale vicina al nome, un feedback di successo. Oggi dopo Approve la riga sparisce e basta.
5. **Gerarchia del rischio.** Reject è reversibile (con Restore), Merge no: il topic di origine sparisce. Oggi però entrambi hanno lo stesso peso visivo di Rename. Merge è l'unica azione davvero definitiva della pagina e oggi non chiede conferma oltre al modal di scelta.
6. **Niente eliminazione, ma non si capisce.** Né per le liste né per gli item c'è un Delete, e niente spiega perché. Deactivate va presentato come la scelta corretta per ritirare un valore, come in `team.html` per le risorse.
7. **Mancano ricerca e contatori.** Nessuna ricerca né sugli item né sui topic. Valuta contatori per stato (Active N / Inactive N; Proposed / Approved / Rejected) al posto della checkbox e delle tre card.
8. **Rejected sepolto** in un `<details>` nativo in fondo, come lo era "Existing aliases" in `team.html`.
9. **Colori locali.** Le pillole `badge-st-*` di `css/admin-crud.css` usano hex (l'inattiva è sotto 4.5:1), il badge dei proposti è un `text-bg-warning` Bootstrap. Vanno ricondotti ai componenti condivisi e ai token.
10. **Controlli nativi.** La `<select>` del merge e il `<details>` dei rifiutati vanno sostituiti con i controlli custom già esistenti.
11. **Collegamento con il resto dell'app poco visibile.** Non si capisce dove vengono usati i valori (Tags di proposte e progetti, dimensioni del profilo) né l'effetto di un topic approvato sui profili.
12. **+ New topic crea un'aspettativa sbagliata.** Chi crea un topic si aspetta di vederlo comparire nei profili, mentre resta a "Used in 0" finché l'agente non lo usa su una descrizione nuova o rielaborata (§2). Il modal e la riga di un topic non usato dovrebbero dirlo, con un rimando a Profile processing per forzare la rielaborazione.

## 5. Pattern da riusare (obbligatorio)
Prima di disegnare un elemento, cercalo in questo elenco. Se c'è, va usato così com'è, anche se una variante su misura sembrerebbe migliore. Una deviazione va dichiarata nella consegna con il motivo.

| Esigenza | Pattern da riusare | Dove guardarlo |
|---|---|---|
| Testata, back link, azione primaria | `.ph` e le sue parti (`.ph-back`, `.ph-btn-primary`, `.ph-toolbar`) | tutte le pagine; `css/style.css` |
| Drawer laterale (dettaglio, form) | `.pd-drawer` (anche `--wide`) | `team.html`; tavole `team/redesign/13af…13o` |
| Menu "⋯" di riga | `.pd-row-menu` | `team.html`; tavola `13c-row-menu` |
| Pillole di stato | `.pd-status-pill` | `team.html` |
| Banner errore / successo con Undo | `.pd-banner` | `team.html`; tavole `13ah`, `admin/` |
| Conferma di un'azione definitiva | `.pd-confirm` in `.pd-confirm-modal` | `team.html`; tavola `13g-delete-confirm` |
| Stati vuoti, caricamento, accesso negato | `.pd-state` | `team.html` |
| Tab di pagina, toolbar, ricerca, paginazione | tab, toolbar e pager di `team.html` | `team.html`; tavola `13aa` |
| Coda di lavoro con contatore e callout | Unmatched names e callout di `team.html` | tavole `13ab`, `13i`, `13k` |
| Lista sezionata semplice con creazione | pagine Master Data (es. Roles & rates, Currencies) | tavole `MD-Roles-Rates/10.7*`, `MD-Currencies/10.6*` |
| Select con ricerca (target del merge) | `combo-select` di `team.html` | tavola `13i-unmatched-assign` |
| Chip dei topic | `.pd-tag` / chip dei topic nel profilo di `team.html` | tavola `13o-experience-profile` |
| Overlay durante il salvataggio | save overlay | tavole `Overlay/` |
| Responsive (tabelle come card, drawer a tutto schermo) | soluzione di `team.html` e Master Data | tavole `13aa-1/2`, `10.7e`, `10.6d` |

Tabelle, pulsanti e card seguono le pagine già ridisegnate: niente nuovi stili di tabella o di pulsante.

## 6. Vincoli tecnici (non negoziabili)
- Vue 3 e Bootstrap 5.3 da CDN. Nessun build step.
- Nessun hex nel codice: solo `var(--token)` da `css/tokens.css`. Nessun nuovo token, salvo necessità motivata. Ogni coppia testo/sfondo deve stare ≥ 4.5:1.
- Tutto il testo in **inglese**.
- Pagina dentro lo shell standard: sidebar `pd-nav`, `#app-main`, testata `.ph` con breadcrumb. Va ridisegnato il contenuto sotto la testata.
- Responsive: sidebar da 1024px in su, navbar a icone sotto. Va previsto il comportamento su tablet e smartphone.
- Brand: navy `#0B1840` e magenta `#F0287A` come primario. Il magenta con testo bianco è un compromesso accettato.
- Niente `alert`/`confirm` nativi del browser: un solo idioma di modal, quello condiviso.
- Il redesign è visivo. Le API non cambiano: `GET/POST /api/attribute-lists`, `PATCH /api/attribute-lists/:id`, `GET/POST /api/attribute-lists/:id/items`, `PATCH /api/attribute-lists/:id/items/:itemId`, `GET/POST /api/topics`, `PATCH /api/topics/:id`, `POST /api/topics/:id/{approve,reject,restore,merge}`. Non cambiano nemmeno le regole: slug immutabile, nessun Delete per liste e item, unicità delle label, regole di nome e di merge dei topic.
- Fuori ambito, salvo proposta esplicita: eliminazione di liste o item, riordino manuale degli item, modifica dello slug, deep link a una lista o alla tab Topics, elenco delle proposte o dei progetti che usano un valore.

## 7. Cosa chiediamo come consegna
Tavole per desktop (≥1280), tablet e smartphone, con questi stati:
1. Vista **Lists**: le quattro liste predefinite più una aggiunta, con il conteggio degli item attivi.
2. **New list** e **Rename list**, anche con errore.
3. **Dettaglio di una lista**: item attivi e inattivi (filtro acceso), **New item**, **Edit item**, errore di label duplicata, Deactivate con feedback.
4. Vista **Topics**: coda dei proposti piena, approvati, rifiutati aperti; menu di riga aperto; feedback dopo Approve.
5. **Rename topic** con errore di nome non valido, **New topic** con la spiegazione del suo effetto, e un topic approvato con "Used in 0".
6. **Merge**: scelta del target con ricerca e conferma dell'azione definitiva.
7. Stati vuoti (nessuna lista, nessun item per il filtro, coda dei proposti vuota, nessun approvato), caricamento e accesso negato.
8. Banner di errore e di successo.

Per ogni tavola, indica quale pattern del §5 hai usato per ciascun elemento, ed elenca a parte le eventuali deviazioni con il motivo.
