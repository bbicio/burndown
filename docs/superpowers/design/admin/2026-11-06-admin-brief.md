# Briefing Claude Design: redesign di `admin.html` (User Admin)

## 1. Cosa è la pagina
Console di gestione utenti di PDash (app di project/portfolio management multi-pagina). Qui si **invitano** persone, si **assegnano ruoli**, si **disabilitano** o **anonimizzano** account. È una pagina operativa e poco frequentata, ma con azioni delicate (anche irreversibili). Deve trasmettere chiarezza e sicurezza, non decorazione.

**Chi la usa:** utenti con ruolo `admin` o `sysadmin`. Chiunque altro vede una schermata "Admin access required" con un link per tornare all'app.

**Dove si trova:** voce del menu ⚙ Admin nella sidebar. Il breadcrumb è `Home › User Admin`.

## 2. Modello dei ruoli (determina quasi tutta la UI)
Tre livelli: `user` < `admin` < `sysadmin`.

- Un **admin** può invitare utenti, promuovere `user→admin` e retrocedere `admin→user`. Può disabilitare, riabilitare e anonimizzare utenti e admin, ma **non** i sysadmin.
- Un **sysadmin** fa tutto questo, ed è l'unico che può **concedere o revocare** il ruolo sysadmin.
- La promozione a sysadmin passa sempre per admin: `user→admin→sysadmin`. Anche la retrocessione: `sysadmin→admin→user`. Mai in un solo passo.
- La riga dell'utente loggato non offre azioni e mostra solo "you".
- Su una riga sysadmin, un admin semplice vede solo i dati, senza azioni.

La UI deve rendere visibile il motivo per cui un'azione manca (ad esempio un tooltip o un testo di aiuto), perché oggi i pulsanti spariscono e basta.

## 3. Contenuti e funzionalità attuali

**Testata della pagina**
- Titolo "Users", sottotitolo con il conteggio ("N users"), azione primaria **+ Invite user**.
- Testata condivisa dell'app (`.ph`), già unificata nel ciclo header del 2026-10-16.

**Filtri per stato**
- Quattro filtri esclusivi: All / Active / Pending / Disabled. Oggi senza contatori.

**Tabella utenti**

| Colonna | Contenuto |
|---|---|
| Name | Nome e cognome |
| Email | Indirizzo email |
| Role | Badge `user` / `admin` / `sysadmin` |
| Status | Badge `active` / `pending` / `disabled` |
| Invited by | Nome di chi ha invitato, o "—" |
| Joined | Data di creazione, formato `06 Nov 2026` |
| (azioni) | Vedi sotto |

Le righe sono ordinate come arrivano dall'API. Non c'è né ricerca né ordinamento.

**Azioni per riga** (condizionali):
1. **Make admin / Make user**: toggle del ruolo base. Nascosto sulle righe sysadmin.
2. **⬆ Grant sysadmin / ⬇ Revoke sysadmin**: visibile solo a un viewer sysadmin e solo sulle righe admin/sysadmin. Azione sensibile, oggi con stile "danger".
3. **✉️ Resend invite**: solo per utenti `pending`. Invia un nuovo link di attivazione, valido altre 48 ore.
4. **Disable / Enable**: sospende o riattiva l'accesso.
5. **🗑 Anonymize**: solo per utenti `disabled` non ancora anonimizzati. **Irreversibile.** Sostituisce nome ed email con valori anonimi e conserva proposte, progetti e cost grid creati. Oggi chiede conferma con un `confirm()` nativo del browser. Il progetto vieta gli alert/confirm nativi, quindi va sostituito con un modal di conferma coerente con il resto dell'app.
6. Badge grigio **anonymized** sulle righe già anonimizzate (email che inizia con `anon_`). Queste righe non hanno più azioni di ripristino utili.

Durante un'azione sulla riga i pulsanti si disabilitano. Non c'è spinner per riga.

**Modal "Invite user"**
- Campi: First name, Last name, Email, Role (User / Admin; il sysadmin non si assegna in invito).
- Errori e conferma ("Invite sent to …") compaiono dentro il modal. Dopo il successo il form si blocca e resta solo "Close". Alla chiusura il form si resetta.
- Il pulsante "Send invite" mostra uno spinner durante l'invio.

**Feedback globale**
- Banner rosso per gli errori e verde per i successi (ad esempio "Invite resent to …"). Ogni nuova azione pulisce quello precedente.

**Stati della pagina**
- Caricamento: spinner centrato.
- Accesso negato: lucchetto, "Admin access required", link "Go to app".
- Nessun risultato: "No users match the selected filter."

## 4. Problemi di design da risolvere
1. **Riga di azioni sovraffollata.** Fino a 5 pulsanti testuali affiancati. Proposta: azione principale visibile (probabilmente Enable/Disable o Resend invite per i pending) e il resto in un menu "⋯" per riga, con le azioni distruttive separate in fondo.
2. **Gerarchia del rischio.** Distinguere visivamente azioni reversibili (ruolo, disable/enable), sensibili (sysadmin) e irreversibili (anonymize). Oggi hanno lo stesso peso.
3. **Badge con colori esadecimali locali** nel `<style>` della pagina. Vanno riportati ai token (`--status-*`, `--color-*`). Servono tre colori ruolo distinguibili e tre stati, tutti con testo ≥ 4.5:1.
4. **Utenti pending**: dovrebbero risultare riconoscibili a colpo d'occhio (invito in attesa, magari con la scadenza), con "Resend invite" come azione naturale.
5. **Ricerca e ordinamento** assenti. Con molti utenti serve almeno una ricerca per nome o email, e magari un ordinamento per colonna. Proponi come inserirli nella testata della tabella, nello stile delle altre pagine admin (Team, Attribute Lists).
6. **Filtri con contatori** (Active 12, Pending 3, …). Possibile anche un filtro per ruolo.
7. **Feedback per riga** (spinner o stato "in corso") al posto dei soli pulsanti disabilitati.
8. **Conferme coerenti**: modal di conferma applicativo per Disable e Anonymize (almeno quest'ultima, con testo esplicito sulle conseguenze).
9. **Riga "you"**: evidenziarla in modo discreto e spiegare perché non ha azioni.

## 5. Vincoli tecnici (non negoziabili)
- Vue 3 da CDN e Bootstrap 5.3 da CDN restano. Nessun build step.
- Nessun hex hardcoded: solo `var(--token)` da `css/tokens.css`. Nessun nuovo token, salvo necessità motivata.
- Tutto il testo in **inglese**.
- Pagina dentro lo shell standard: sidebar + `#app-main` + testata `.ph` con breadcrumb, come nelle altre pagine già ridisegnate (vedi tavole `Master-data/` e `Pipeline/` per il linguaggio visivo attuale).
- Responsive: sidebar ≥ 1024px, navbar a icone sotto. Va previsto il comportamento della tabella su tablet e smartphone (ad esempio righe a card).
- Brand: navy `#0B1840` e magenta `#F0287A` (primario). Il magenta con testo bianco è un compromesso accettato.
- Il redesign è visivo. Le API (`GET /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/anonymize`, `POST /api/auth/invite`, `POST /api/auth/:id/resend-invite`) e le regole sui ruoli **non cambiano**.

## 6. Cosa chiediamo come consegna
Tavole per desktop (≥1280), tablet e smartphone, con questi stati:
1. Tabella piena con tutti i tipi di riga: self, user, admin, sysadmin, pending, disabled, anonymized.
2. Vista da sysadmin e vista da admin semplice (azioni diverse).
3. Menu azioni aperto.
4. Modal Invite: vuoto, errore, successo.
5. Modal di conferma Anonymize e Disable.
6. Stati vuoto, caricamento e accesso negato.
7. Banner di successo e di errore.
