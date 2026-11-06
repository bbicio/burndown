# Briefing Claude Design: redesign di `team.html` (Team)

Questo documento descrive **come funziona oggi** la pagina: cosa mostra, da dove arrivano i dati e cosa fa ogni controllo. Il nuovo layout non è prescritto. I problemi elencati nel §4 sono spunti, non decisioni.

## 1. Cosa è la pagina
È il **registro delle risorse** di PDash, l'app di project e portfolio management: le persone che lavorano sui progetti, ognuna con un ruolo. Non coincide con gli utenti dell'app. Una risorsa può essere collegata a un account PDash, ma non è obbligatorio: la maggior parte delle persone lavora sui progetti senza mai fare login.

La pagina serve a tre cose:
1. **Anagrafica**: creare, modificare, disattivare ed eliminare risorse.
2. **Riconciliazione dei nomi**: negli actuals caricati (le ore lavorate, importate da XLS) la persona compare come testo libero ("owner"). La pagina mostra i nomi che il sistema non ha saputo collegare a una risorsa e permette di assegnarli o ignorarli.
3. **Profilo di esperienza**: per ogni persona, un albero calcolato dalle ore lavorate. Mostra su quali mercati, brand, aree terapeutiche, tipi di servizio, ruoli e topic di competenza ha lavorato, e per quante ore.

Volumi reali: circa **150 risorse** e **decine di nomi non riconciliati**.

**Chi la usa:** utenti con ruolo `admin` o `sysadmin`. Gli altri vedono "Admin access required" con un link "Go to app".

**Dove si trova:** voce "Team" del menu ⚙ Admin nella sidebar. Il breadcrumb è `Home › Team`.

## 2. Concetti che la UI deve rendere chiari
- **Risorsa**: nome, cognome, email, **ruolo** (obbligatorio, scelto dalla lista Roles del Master Data e mostrato come `label (code)`, es. "Project Manager (PM)"), job description (testo libero, più righe), utente PDash collegato (opzionale), stato `active` / `inactive`.
- **Inattiva** = persona uscita. Non viene eliminata, perché le sue ore storiche le devono restare attribuite. Una risorsa inattiva può ancora ricevere alias.
- **Alias**: un nome come scritto negli actuals ("Rossi Mario", "M. Rossi") che punta a una risorsa, oppure a nessuna ("ignored", per voci come "TBD" che non sono persone).
- **Nome ambiguo**: nome che corrisponde a più risorse attive omonime. Il sistema non lo collega mai da solo e mostra i candidati.
- **Profilo asincrono**: il profilo viene ricalcolato in background, con un ciclo predefinito di 10 minuti. Dopo un'assegnazione la lista dei nomi si aggiorna subito, il profilo solo al passaggio successivo del worker. La console di questa elaborazione è un'altra pagina, `profile-jobs.html`.

## 3. Contenuti e funzionalità attuali

**Testata (`.ph`, già unificata)**
- Titolo "Team", sottotitolo "N resources". Il conteggio include anche le inattive, anche quando sono nascoste.
- Azione primaria **+ New resource**.

**Banner errore globale** rosso sotto la testata, solo quando qualcosa fallisce.

**Tab di pagina** (Bootstrap `nav-tabs`): **Team** e **Unmatched names (N)**, con il contatore in un badge grigio. La pagina si apre sempre su Team, la scelta non viene salvata e non ha un deep link.

### 3.1 Tab "Team"
- **Toolbar**: ricerca libera "Search name or email…", che cerca anche nel ruolo. Checkbox **Show inactive**, spenta all'apertura: senza spunta le inattive sono nascoste.
- **Tabella**, dentro una card:

| Colonna | Contenuto | Ordinabile |
|---|---|---|
| Name | Nome e cognome, in grassetto | sì |
| Email | grigio | sì |
| Role | Label, con il codice tra parentesi in piccolo | sì |
| Linked user | Nome dell'utente PDash collegato, o "—" | no |
| Status | Pillola `active` (verde) / `inactive` (grigia) | sì |
| (azioni) | **Edit**, **Deactivate/Activate**, **Delete** (rosso) | — |

- L'ordinamento si cambia cliccando l'intestazione, con le frecce ▲/▼. All'apertura è per nome crescente.
- Paginazione a 25 righe con "‹ Previous", "Page X of Y", "Next ›", visibile solo oltre una pagina. Torna a pagina 1 quando cambiano ricerca, filtro o ordinamento.
- **Clic su una riga** apre il pannello di dettaglio (§3.3). La riga aperta resta evidenziata.
- **Delete** è irreversibile e chiede conferma con un modal applicativo ("Delete resource "X"? This cannot be undone."). Insieme alla risorsa elimina i suoi alias, e i nomi corrispondenti tornano tra gli Unmatched.
- Stato vuoto: "No resources match the current filter."

### 3.2 Tab "Unmatched names"
- Titolo "Unmatched names (N)" e pulsante **Rescan** a destra, con spinner durante l'esecuzione. Rescan ricalcola la coda da tutti gli actuals caricati.
- Ricerca "Search name…", che ignora maiuscole e accenti.
- Testo guida: "Names found in uploaded actuals that could not be matched to a resource. Assign each to a resource, or ignore names that are not people."
- Banner errore proprio di questa sezione, separato da quello globale.
- **Tabella**:

| Colonna | Contenuto | Ordinabile |
|---|---|---|
| Name in actuals | Il nome come scritto, con un badge giallo **ambiguous** se ci sono omonimi | sì |
| Hours | Ore totali registrate a quel nome | sì (all'apertura: decrescente) |
| Projects | Numero di progetti, cliccabile: espande sotto l'elenco "Project name (CODE), …" | sì |
| Assign to | **Select con ricerca** (componente custom `combo-select`): ordina prima i candidati omonimi, poi le risorse attive, poi le inattive marcate "(inactive)"; voce "— none —"; navigazione da tastiera | no |
| (azioni) | **Assign** (primario, attivo solo con una scelta), **Ignore** | — |

- Paginazione a 25 righe, come sopra.
- Stati vuoti: "No unmatched names." oppure "No unmatched names match the search."
- In fondo, un accordion chiuso **"Existing aliases (N)"**. È una tabella con il nome, "Resolves to" (la risorsa, oppure "ignored" in grigio) e **Remove**, che riporta il nome in coda. Non ha né ricerca né paginazione.

### 3.3 Pannello di dettaglio della risorsa
Drawer fisso a destra, largo 860px (100% sugli schermi stretti), sopra la pagina e sotto i modal. Si chiude con ×, con Esc o con un clic fuori. Si chiude anche cambiando tab di pagina.

- **Header** navy con nome, pillola di stato e ×.
- Due tab: **Details** e **Experience profile**.

**Details** (sola lettura)
- Pulsante **Edit**, che apre lo stesso modal della tabella.
- Lista di definizioni: Name, Email, Role, Linked user (nome ed email), Status, Job description (testo su più righe, o "—").
- Accordion chiuso **Aliases (N)**: "Names from uploaded actuals that resolve to this resource.", tabella dei nomi con **Remove**. Stato vuoto: "No aliases for this resource."

**Experience profile**
Viene caricato all'apertura del tab. Ha quattro stati oltre al contenuto:
- "Loading…";
- errore (banner);
- "Not calculated yet. The profile is built in the background from uploaded actuals." (risorsa appena creata);
- "No actuals matched to this person yet…" con un link al tab Unmatched names.

Contenuto, dall'alto:
1. **Striscia di totali**: Hours, Projects, First month, Last month. Sotto: "Last calculated: <data e ora>".
2. **Topics**: chip di competenze in due gruppi.
   - **Direct experience**: topic dei task su cui la persona ha registrato ore. Chip "Medical writing · 3 · 120 h" (progetti, ore), con un tooltip che elenca i progetti.
   - **Project context**: topic che vengono solo dalla descrizione di un progetto su cui ha lavorato. Chip "Nome · N progetti".
   - Un terzo gruppo, "Topics (provenance not available — recalculate profiles)", compare solo per i profili vecchi.
   - Stato vuoto: "No topics yet."
3. **Una sezione per dimensione** (Market, Brand, Therapeutic Area, Service Type, più eventuali liste aggiunte dagli admin). È un albero a tre livelli di `<details>` nativi:
   - **valore** (es. "Oncology"): ore, quota percentuale, numero di progetti, ultimo mese, e una barra di quota navy sottile;
   - → **progetto**: nome, codice, ore, ultimo mese;
   - → **task**: nome e ore.
   - Nota per dimensione: "N h on projects without a value", per le ore su progetti senza quel tag.
4. **Roles**: ruoli svolti, ciascuno con ore, quota e numero di progetti, espandibile nei progetti con le relative ore.

Le ore sono arrotondate a 2 decimali, le quote a percentuali intere.

### 3.4 Modal "New resource" / "Edit resource"
- Campi: First name, Last name (affiancati), Email, **Role** (select obbligatoria: "Select a role…", opzioni `label (code)`; se manca un ruolo va creato prima in Master Data → Roles & rates), Job description (textarea), **Linked PDash user (optional)** (select con "— None —" e gli utenti attivi come "Nome Cognome (email)").
- Gli errori compaiono in un banner dentro il modal (es. "Role is required"). Il pulsante Create/Save mostra uno spinner durante il salvataggio.

### 3.5 Stati di pagina
- Caricamento: spinner centrato.
- Accesso negato: lucchetto, "Admin access required.", pulsante "Go to app".

## 4. Problemi di design da risolvere
1. **Il pannello di dettaglio è il cuore della pagina, ma è un ripiego.** Gli stili sono inline, con hex copiati da `pipeline.html`, e il profilo è un albero di `<details>` nativi con testo grigio. Serve un linguaggio visivo vero per il profilo, leggibile a colpo d'occhio: dove è forte questa persona, quanto, quanto di recente. Valuta barre orizzontali per i valori, chip per i topic e una gerarchia chiara tra valore, progetto e task. Il drawer di `pipeline.html` (tavole `Pipeline/4.10…4.13`) è il riferimento attuale per i pannelli laterali.
2. **Riga di azioni ripetuta 25 volte.** Edit, Deactivate e Delete su ogni riga. La riga è già cliccabile e il pannello ha un Edit, quindi le azioni potrebbero spostarsi in un menu "⋯" o nel pannello, con Delete separato come distruttivo.
3. **Gerarchia del rischio.** Deactivate è reversibile ed è l'azione corretta per chi lascia l'azienda. Delete è irreversibile e cancella anche gli alias. Oggi hanno quasi lo stesso peso, e niente suggerisce che Deactivate sia la scelta giusta per un dipendente uscito.
4. **Unmatched names come flusso di lavoro.** È una coda da svuotare. Utili un contatore che cala in modo visibile, una gerarchia per i nomi con molte ore (quelli che contano), i nomi ambigui evidenziati con i candidati, e Assign e Ignore vicini alla scelta. L'elenco dei progetti espanso dentro la cella oggi deforma la riga.
5. **"Existing aliases" sepolto** in fondo alla coda, senza ricerca. Con molti alias diventa ingestibile. Potrebbe meritare una vista propria o un filtro.
6. **Il contatore del tab Unmatched compare due volte** (badge del tab e titolo della card), e quello dell'header conta anche le inattive nascoste.
7. **Colori locali.** Le pillole `active`/`inactive` in `css/admin-crud.css` usano hex (l'inattiva, `#9ca3af` su `#f3f4f6`, è circa 2.3:1, sotto la soglia di 4.5:1). Lo stesso vale per il badge "ambiguous" (`bg-warning`) e per i badge grigi Bootstrap. Vanno ricondotti ai token `--status-*` / `--color-*`, con testo ≥ 4.5:1.
8. **Accessibilità della tabella.** Righe e intestazioni ordinabili non sono raggiungibili da tastiera e mancano `aria-sort` e uno stato di focus.
9. **Feedback per riga.** Durante un'azione i pulsanti si disabilitano senza spinner. Non esiste un messaggio di successo: dopo Assign la riga sparisce e basta.
10. **Toolbar povera.** Mancano filtri per ruolo o per "collegato a un utente" sì/no, mentre su 150 persone sarebbero utili. Valuta anche contatori per stato (Active N / Inactive N) al posto della sola checkbox.
11. **Profilo asincrono poco spiegato.** Va comunicato che i dati si aggiornano in background ("Last calculated …"), magari con un rimando a Profile processing.

## 5. Vincoli tecnici (non negoziabili)
- Vue 3 e Bootstrap 5.3 da CDN. Nessun build step.
- Nessun hex nel codice: solo `var(--token)` da `css/tokens.css`. Nessun nuovo token, salvo necessità motivata. Ogni coppia testo/sfondo deve stare ≥ 4.5:1.
- Tutto il testo in **inglese**.
- Pagina dentro lo shell standard: sidebar `pd-nav`, `#app-main`, testata `.ph` con breadcrumb. Va ridisegnato il contenuto sotto la testata, nel linguaggio delle pagine già ridisegnate (tavole `Master-data/`, `MD-Roles-Rates/`, `timesheets/`, `admin/`).
- Responsive: sidebar da 1024px in su, navbar a icone sotto. Va previsto il comportamento su tablet e smartphone: tabelle come card, drawer a tutto schermo o bottom sheet.
- Brand: navy `#0B1840` e magenta `#F0287A` come primario. Il magenta con testo bianco è un compromesso accettato.
- Il pannello sta sopra la pagina e sotto i modal: Edit e conferma si aprono sopra il pannello.
- Il redesign è visivo. Le API non cambiano: `GET/POST /api/resources`, `PATCH/DELETE /api/resources/:id`, `GET /api/resources/:id/profile`, `GET /api/resources/unmatched`, `POST /api/resources/unmatched/rescan`, `GET/POST /api/resources/aliases`, `DELETE /api/resources/aliases/:id`, `GET /api/roles`, `GET /api/users/active-list`. Non cambiano nemmeno le regole di matching dei nomi.
- Fuori ambito, salvo proposta esplicita: suggerimento automatico dei candidati per somiglianza, editing inline, una pagina `resource.html` dedicata, deep link `?resourceId=`.

## 6. Cosa chiediamo come consegna
Tavole per desktop (≥1280), tablet e smartphone, con questi stati:
1. Tab **Team**: tabella piena con risorse attive, inattive (Show inactive acceso), con e senza utente collegato, una riga selezionata; paginazione visibile.
2. Menu azioni della riga aperto e modal di conferma **Delete**.
3. Modal **New resource** vuoto, con errore, ed **Edit resource**.
4. Tab **Unmatched names**: coda con nomi normali e ambigui, select di assegnazione aperta con ricerca, elenco progetti espanso, "Existing aliases" aperto.
5. **Pannello di dettaglio**, tab Details con Aliases aperto.
6. **Experience profile** completo (totali, i due gruppi di topic, almeno due dimensioni espanse fino ai task, Roles) e i suoi stati: loading, not calculated, no actuals, errore.
7. Stati vuoti (nessuna risorsa per il filtro, coda vuota), caricamento e accesso negato.
8. Banner di errore globale e di sezione, ed eventuale feedback di successo.
