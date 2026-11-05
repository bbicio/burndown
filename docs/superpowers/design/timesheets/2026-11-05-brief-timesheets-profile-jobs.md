# Brief per Claude Design — Timesheets e Profile processing

Due pagine da ridisegnare: `timesheets.html` (gestione degli actuals caricati) e `profile-jobs.html` (console di elaborazione dei profili risorsa). Questo documento descrive **come funzionano oggi**: cosa mostrano, da dove arrivano i dati, cosa fa ogni controllo. Non prescrive il nuovo layout.

Schermate dello stato attuale (`docs/superpowers/design/timesheets/`), con dati reali:

| File | Contenuto |
|---|---|
| `timesheetpage.jpg` | `timesheets.html`, view generale con il filtro Pipeline 2026 attivo (§1.2, §1.3) |
| `timesheet.modal-view.jpg` | Pop-up View di un project code da 337 righe (§1.4) |
| `profile-job.jpg` | `profile-jobs.html`, con Run history espanso (§2.2) |

Entrambe le pagine sono già nel guscio dell'app (sidebar `pd-nav`, breadcrumb, testata `.ph` condivisa con titolo, sottotitolo e pulsanti a destra). Quello che va ridisegnato è il contenuto sotto la testata. Tutti i testi visibili all'utente restano in inglese.

---

## Parte 1 — `timesheets.html`

### 1.1 Il servizio

Gli **actuals** sono le ore effettivamente lavorate sui progetti. Arrivano da un export XLS del sistema timesheet aziendale: una riga per registrazione, con data, persona (owner), ruolo, task, ore e note. Ogni riga appartiene a un **project code**, il codice che collega le ore a un progetto di PDash.

Come entrano:
- Gli actuals **non si caricano da questa pagina**. Si caricano da altri tre punti: "Load Actuals" nella reporting di `portfolio.html`, il blocco Actuals di `project-config.html` e "Load XLS" di `planning.html`.
- Un upload **sostituisce tutti** gli actuals già presenti per quel project code. Non c'è un caricamento incrementale.
- Prima di salvare, il server controlla ogni riga: il task deve esistere nel progetto e il ruolo deve essere uno di quelli configurati su quel task. **Una sola riga incoerente fa rifiutare l'intero file.**
- Su ogni riga il server salva la **Fee**, cioè la tariffa oraria del ruolo su quel task, presa dal progetto al momento dell'upload. Spent = Fee × Hours.

A cosa servono: la reporting di progetto e di programma (burndown, KPI ore e budget consumati), il planning e i profili di esperienza delle risorse (Parte 2).

**Questa pagina è la console di inventario degli actuals.** Mostra quali project code hanno dati, permette di ispezionarli, scaricarli in Excel e cancellarli. È riservata ad admin e sysadmin: chiunque altro viene rimandato a `/pipeline.html`. Nella sidebar ha la voce "Timesheets".

### 1.2 View generale

Dall'alto verso il basso:

**Testata (`.ph`)**
- Titolo "Timesheets".
- Sottotitolo "N projects": il numero totale di project code con actuals, **non** quello filtrato. Non compare se la lista è vuota.
- A destra, il pulsante **"Profile processing →"**, che porta a `profile-jobs.html` (§3). Ha un badge giallo con il numero di project code in coda di elaborazione e un tooltip "N project codes waiting for profile processing". Il badge è nascosto quando la coda è vuota o quando la chiamata fallisce.

**Avviso di errore**: un banner rosso, visibile solo quando qualcosa fallisce (caricamento, download, cancellazione).

**Testo guida** (piccolo, grigio):
> Each row represents one project code. Uploading a new XLS for a project replaces all previous data for that code. **Delete actuals** permanently removes every timesheet row for that project from the database. Use **Load XLS** in Portfolio to import new data.

Il testo dice "Load XLS", ma il pulsante del Portfolio oggi si chiama "Load Actuals".

**Barra filtri**: vedi §1.3.

**Tabella** (dentro una card, una riga per project code):

| Colonna | Contenuto | Note |
|---|---|---|
| Client | Nome del cliente del progetto | "—" se il codice non corrisponde a nessun progetto |
| Project | Nome del progetto | "—" come sopra |
| Project code | Codice in monospace (es. `HITA.000001586.001`) | I codici possono contenere punti e spazi |
| Uploads | Numero di upload salvati | Allineata a destra, grigia. Siccome l'upload sostituisce i dati, vale quasi sempre 1 |
| Rows | Totale delle righe di actuals | Allineata a destra, in grassetto, con separatore delle migliaia |
| Last uploaded | Data dell'ultimo upload, es. "05 Nov 2026" | |
| (azioni) | **👁 View**, **⬇ Download actuals**, **🗑 Delete actuals** | §1.4 e §1.5 |

Dettagli:
- Client, Project e Project code si ordinano con un clic sull'intestazione, a tre stati: ascendente ▲, discendente ▼, nessun ordinamento. Senza ordinamento le righe seguono il project code, come le restituisce il server. Le altre colonne non sono ordinabili.
- Se un codice è usato da più progetti, Client e Project mostrano il progetto più vecchio.
- Non ci sono paginazione né scroll interno: la tabella cresce con la pagina.
- **Stati vuoti**: icona 📂 e "No timesheets uploaded yet." con il suggerimento "Use Load XLS in the Portfolio view…", oppure "No timesheets match the current filters." quando i filtri escludono tutto.
- **Caricamento**: uno spinner centrato finché non arrivano i dati iniziali (lista, anni di pipeline, valute).

### 1.3 Filtri

Una riga di controlli sopra la tabella. I filtri si combinano in AND e lavorano solo sui dati già caricati, senza chiamate al server. Non vengono salvati: ricaricando la pagina tornano ai valori di partenza.

1. **Client**: dropdown con una checkbox per cliente, a scelta multipla. Le opzioni sono i clienti distinti presenti nella lista, in ordine alfabetico. Il pulsante mostra quanti ne sono selezionati, es. "Client (2)". Si possono spuntare più voci senza che il menu si chiuda. Se la lista è vuota il menu mostra "No data".
2. **Project**: stesso controllo, sui nomi dei progetti. **Le opzioni non si restringono in base al Client scelto.**
3. **Project code**: campo di testo libero, placeholder "Filter by project code…". Cerca il testo dentro il codice, senza distinguere maiuscole e minuscole.
4. **Pipeline year**: menu con "All years" e una voce "Pipeline YYYY" per ogni anno di pipeline esistente, anche quelli inattivi. **Valore iniziale**: l'anno solare corrente se esiste, altrimenti l'anno più recente, altrimenti "All years". L'anno di un progetto è quello della versione di proposta da cui il progetto è stato generato. Un codice senza progetto collegato non ha anno e **compare solo con "All years"**.
5. **↺ Reset filters**: compare solo quando almeno un filtro è attivo. Svuota tutti i filtri e mette l'anno su "All years". Nota: dato che l'anno parte quasi sempre attivo, il pulsante è visibile fin dall'apertura della pagina.

### 1.4 Pop-up "View"

Si apre con **👁 View** su una riga. È un modale molto largo (`modal-xl`) che scorre al suo interno, sopra uno sfondo scuro semitrasparente.

- **Intestazione**: il project code in monospace, "N rows" in grigio e una × per chiudere. Si chiude anche cliccando fuori dal modale.
- **Caricamento**: uno spinner mentre arrivano le righe, che vengono richieste al server a ogni apertura.
- **Tabella** compatta, con testo piccolo e tutte le righe del codice ordinate per data crescente:

| Colonna | Contenuto |
|---|---|
| Date | Data della registrazione in formato ISO grezzo (`2026-03-14`) |
| Owner | Nome della persona così com'è scritto nel file XLS |
| Role | Ruolo, troncato con ellissi oltre una certa larghezza |
| Task | Nome del task |
| Hours | Ore, allineate a destra, in grassetto |
| Notes | Note, troncate su una riga; il testo completo è nel tooltip |
| Fee | Tariffa oraria salvata all'upload, nella valuta del progetto (es. "€ 85,00", "$85.00") |
| Spent | Fee × Hours, nella stessa valuta, in grassetto |

- Sono importi monetari: il formato (simbolo, decimali, separatori) dipende dalla valuta del progetto. EUR è usato se il codice non ha progetto.
- Non ci sono filtri, ricerca, totali, raggruppamenti o paginazione. Un progetto lungo può avere migliaia di righe, tutte in un'unica tabella.
- Il modale è di sola lettura: le righe non si modificano.
- **Errore**: il modale si chiude e il messaggio compare nel banner rosso della pagina.

### 1.5 Download e Delete actuals

**⬇ Download actuals**
- Il file Excel viene generato **nel browser**, con la libreria ExcelJS, a partire dalle stesse righe del modale View, ordinate per data.
- Il file contiene un foglio, che ha per nome il project code. Le colonne sono le stesse del View: Date, Owner, Role, Task, Hours, Notes, Fee, Spent. L'intestazione è in grassetto e la prima riga è bloccata. Fee e Spent sono numeri semplici, senza formato valuta.
- Il nome del file è `Cliente_Progetto_Codice_AAAAMMGG.xlsx`. Gli spazi diventano "-" e i caratteri non ammessi nei nomi di file vengono tolti. Quando manca, il cliente diventa "NoClient" e il progetto "NoProject".
- Durante la generazione non c'è nessun indicatore: niente spinner e niente conferma. In caso di errore compare il banner rosso.

**🗑 Delete actuals**
- Oggi chiede conferma con il **`confirm()` nativo del browser**: "Delete ALL timesheet data for project "CODE"? This removes N uploads (M rows). This cannot be undone." Va sostituito con il modale di conferma dell'app (`showConfirm()`), perché la convenzione del progetto esclude i dialoghi nativi.
- Mentre l'operazione è in corso, al posto dell'etichetta del pulsante compare uno spinner.
- Cosa cancella: tutte le righe di actuals di quel codice e la sua lista di "Unmatched names" (i nomi di owner non ancora associati a una risorsa, gestiti in `team.html`). Rimette inoltre il codice in coda di elaborazione profili (Parte 2), così l'esperienza calcolata da quelle ore viene tolta ai profili. **L'operazione è irreversibile.**
- Conseguenze visibili altrove: la reporting del progetto non ha più ore consumate (burndown e KPI tornano a zero) finché non si carica un nuovo file.
- Dopo la cancellazione la lista viene ricaricata e la riga scompare. In caso di errore compare il banner rosso e il pulsante si riabilita.

---

## Parte 2 — `profile-jobs.html` (Profile processing)

### 2.1 Il servizio

PDash calcola per ogni risorsa del team (`team.html`) un **profilo di esperienza**: ore lavorate per ruolo, task, cliente, tag di progetto e competenze. Il profilo si legge nella scheda "Experience profile" di `team.html` e lo usa il Team assistant del planning per proporre le persone adatte.

Il profilo si ricava dagli actuals:
- Ogni riga di actuals ha un owner, scritto come testo libero. Se l'owner corrisponde a una risorsa (per alias o per nome esatto), quelle ore entrano nel suo profilo.
- Il calcolo procede **un project code alla volta**: ogni codice produce un "contributo" per ogni persona che ci ha lavorato, e il profilo di una persona è la somma dei suoi contributi.
- Un **worker in background** elabora una **coda** di project code. Mettono un codice in coda: un upload o una cancellazione di actuals, la modifica dei tag, del codice, del nome o della descrizione di un progetto, la modifica di risorse e alias.
- **Topic extraction (opzionale)**: durante l'elaborazione le descrizioni di progetto e dei task vengono inviate a un servizio AI esterno (Anthropic), che ne estrae le competenze (topic). Ha un interruttore dedicato, che serve anche come blocco per la privacy.

**Questa pagina è la console del motore.** Mostra cosa è in coda e quando verrà elaborato, permette di forzare l'elaborazione, di togliere un codice dalla coda, di regolare la pianificazione del worker e di consultare lo storico delle esecuzioni. È riservata ad admin e sysadmin e **non ha una voce nella sidebar**: §3.

### 2.2 View generale

**Testata (`.ph`)**: titolo "Profile processing" e sottotitolo "N queued" (numero di codici in coda). Non ha pulsanti. La breadcrumb è "Home / Timesheets / Profile processing", e il link "Timesheets" è l'unico modo per tornare indietro. Nella sidebar resta evidenziata la voce Timesheets.

**Tre avvisi** sotto la testata, indipendenti tra loro:
- rosso, non chiudibile: il server non risponde o restituisce dati inattesi ("Could not reach the server… The page retries every 15 seconds."). Scompare da solo quando un aggiornamento riesce;
- giallo, chiudibile con ×: un'azione fallita. Il caso più tipico è "A profile job is already running — try again in a moment." quando un'altra elaborazione è già in corso;
- verde, chiudibile con ×: l'esito di un'azione riuscita, es. "Recalculation finished: 3 project codes processed, 12 resource contributions rebuilt." oppure "Saved — applies on the next tick (within 60 s).".

**Testo guida**:
> Resource experience profiles are rebuilt in the background from uploaded actuals, one project code at a time. Uploads and changes to tags, aliases and resources put project codes in the queue; the worker processes the queue on the schedule below.

Seguono tre blocchi: **impostazioni e azioni globali**, **tabella dei project code** e **storico delle esecuzioni**.

**Blocco 1 — Impostazioni e azioni globali** (una card, controlli su una riga che va a capo):
- Interruttore **"Scheduled processing on/off"**: attiva o sospende il worker pianificato.
- Campo **"Interval (minutes)"**: un numero intero da 1 a 1440. Fuori da questo intervallo il campo diventa rosso e compare "Enter a whole number of minutes between 1 and 1440.".
- **Save**: salva interruttore e intervallo. È attivo solo quando uno dei due valori è diverso da quello salvato e l'intervallo è valido.
- Interruttore **"Topic extraction on/off"**: si salva subito, senza Save. Quando è acceso ma sul server manca la chiave API mostra "(no API key configured)" in giallo. Ha il tooltip "When off, project descriptions are never sent to the AI service". Quando lo si riaccende, il server rimette in coda tutti i codici.
- Allineati a destra:
  - **Recalculate now**: elabora subito la coda, senza chiedere conferma;
  - **Rebuild all**, rosso: rimette in coda **tutti** i codici e li elabora subito. Chiede conferma con il modale dell'app: "Rebuild every profile? All project codes are queued and processed again now. On a large database this can take a while.".
- Riga di stato:
  - **"Next scheduled run:"** seguito da una data e ora (`2026-11-05 14:30`), oppure "Paused" se il worker è spento, oppure "On the next tick (within 60 s)";
  - quando esiste, "· last scheduled run …".
- Testo guida: spiega la differenza tra Recalculate now e Rebuild all, e avverte che la stima dell'orario riparte dopo un riavvio dell'API, è precisa al minuto e non tiene conto delle esecuzioni manuali.

**Blocco 2 — Project codes** (filtri e tabella):
- **Filtri**:
  - campo "Search code or project…": tutte le parole digitate devono comparire nel codice o nel nome del progetto, senza distinguere maiuscole, minuscole e accenti;
  - menu di stato: All statuses / Queued / Error / Updated. I codici "Not processed" compaiono solo con All;
  - a destra, il contatore "X of Y project codes · refreshes every 15 s".
- **Tabella**: dentro una card con scroll interno (altezza massima 60% dello schermo) e intestazione fissa.

| Colonna | Contenuto |
|---|---|
| Project | Nome del progetto. Se il codice non ha progetto, è il nome preso dagli actuals |
| Code | Codice in monospace. Ordinabile |
| Actuals rows | Numero di righe di actuals del codice |
| Matched resources | Numero di risorse che hanno ricevuto un contributo dal codice nell'ultima elaborazione |
| Status | Badge a pillola (vedi sotto). Ordinabile |
| Last processed | Data e ora dell'ultima elaborazione riuscita, oppure "—". Ordinabile; i codici mai elaborati vanno sempre in fondo |
| Next processing | Per un codice in coda, come "Next scheduled run". Per un codice non in coda, "—" |
| Topics | "⚠ extraction failed" in rosso, con l'errore nel tooltip, se l'estrazione AI è fallita; altrimenti "—" |
| (azioni) | **Process** sempre. **Remove from queue** in rosso, solo per i codici in coda |

- **Stati** (badge):

| Stato | Colore | Significato |
|---|---|---|
| Error | rosso | L'ultima elaborazione è fallita. Il codice resta in coda e accanto compare "(queued)" |
| Queued | giallo | In attesa di elaborazione |
| Updated | verde | Elaborato, nessuna modifica in sospeso |
| Not processed | grigio | Mai elaborato |

  L'ordinamento per stato segue Error → Queued → Not processed → Updated. L'ordinamento predefinito è per Code crescente, con i codici numerici in ordine naturale (`.9` prima di `.10`).
- **Errore espandibile**: cliccando il badge Error compare, sotto la riga, una fascia rossa con il testo completo dell'errore. Un secondo clic la chiude. La freccia ▾/▴ indica lo stato.
- **Process**: elabora subito solo quel codice. Ripete anche l'estrazione AI dei topic, anche se le descrizioni non sono cambiate. Non chiede conferma.
- **Remove from queue**: chiede conferma con il modale dell'app, che spiega che il profilo già calcolato non cambia finché il codice non viene rielaborato.
- **Stati vuoti**: "No actuals uploaded yet." oppure "No project codes match the current filters.".

**Blocco 3 — Run history**: un pannello richiudibile (`<details>`), chiuso all'apertura della pagina. Il titolo è "Run history (last N)". Dentro c'è una tabella con scroll interno, dalla più recente, con al massimo 50 righe:

| Colonna | Contenuto |
|---|---|
| When | Data e ora di inizio |
| Type | `manual`, `scheduled` o `bootstrap`, mostrato com'è |
| Projects | Numero di codici elaborati |
| Resource contributions | Numero di contributi ricalcolati |
| Duration | "< 1 s", "12 s", "3 min 4 s", "1 h 2 min" |
| Error | Testo dell'errore in rosso, oppure "—" |

Le esecuzioni pianificate che non hanno trovato nulla da fare non vengono registrate.

### 2.3 Comportamenti da preservare

- **Aggiornamento automatico ogni 15 secondi** finché la scheda del browser è visibile. Si ferma in background e riprende subito al ritorno. Ogni azione è seguita da un aggiornamento.
- L'aggiornamento automatico **non sovrascrive** interruttore e intervallo se l'utente li sta modificando e non ha ancora salvato.
- **Un'azione alla volta in tutta la pagina**: mentre un'azione è in corso tutti i pulsanti d'azione e i controlli delle impostazioni sono disabilitati, e solo il pulsante usato mostra lo spinner. Le righe della tabella vengono sostituite a ogni aggiornamento, quindi un indicatore legato alla singola riga andrebbe perso.
- **Rebuild all** può durare più di un minuto e la risposta può andare persa (timeout del proxy). In quel caso compare l'avviso giallo "No response from the server — the action may still be running; the list refreshes automatically.".
- Nessun dialogo nativo del browser.

---

## Parte 3 — La relazione tra le due pagine

- **Lo stesso oggetto.** Entrambe le pagine elencano **project code**, e quasi sempre con gli stessi dati: le righe di Timesheets sono gli actuals caricati, quelle di Profile processing sono lo stato di elaborazione di quegli stessi actuals. "Rows" di Timesheets e "Actuals rows" di Profile processing sono lo stesso numero.
- **Una dipendenza a senso unico.** Le azioni di Timesheets alimentano la coda di Profile processing: un upload (fatto altrove) o un Delete actuals mettono il codice in coda. Profile processing non modifica mai gli actuals.
- **Gli elenchi possono essere diversi.** Profile processing elenca anche codici di cui sono stati cancellati gli actuals, finché il worker non li ripulisce. Inoltre non ha il filtro per cliente né quello per anno di pipeline.
- **La navigazione.** Profile processing è una sotto-pagina di Timesheets:
  - l'unico ingresso è il pulsante "Profile processing →" nella testata di Timesheets;
  - il badge su quel pulsante mostra quanti codici sono in coda, e viene letto una sola volta all'apertura di Timesheets;
  - l'unica uscita è la breadcrumb "Timesheets";
  - la voce della sidebar resta "Timesheets" su entrambe.
- **Utenti.** Entrambe sono riservate ad admin e sysadmin. Timesheets è uno strumento di gestione dei dati, Profile processing un pannello tecnico di manutenzione: lo stesso utente, ma con un'intenzione diversa.

---

## Vincoli per il redesign

- Stack invariato: Vue 3 da CDN, Bootstrap 5, niente build step. Colori, spaziature e tipografia solo dai token di `css/tokens.css`. Oggi `timesheets.html` usa colori esadecimali scritti nel suo `<style>` interno, ed è un debito da eliminare.
- Guscio e testata `.ph` sono condivisi e non si ridisegnano: il redesign riguarda il contenuto.
- Nessun dialogo nativo (`alert`/`confirm`). Le conferme passano per il modale dell'app.
- Gli importi si formattano sempre nella valuta del progetto, con le funzioni condivise dell'app.
- Testi in inglese. Le emoji delle etichette attuali (👁 ⬇ 🗑 📂 ⚠) vanno sostituite dalle icone SVG dell'app, come nelle pagine già ridisegnate.
- Servono le varianti tablet e smartphone, come nelle altre tavole. Oggi entrambe le pagine hanno tabelle larghe con molte colonne e la riga di azioni non va a capo.
- I dati e le regole descritti qui sono quelli reali. Nelle tavole i valori sono illustrativi, ma le colonne, gli stati e le azioni devono corrispondere a questo documento, oppure essere cambiati esplicitamente e indicati come proposta.
