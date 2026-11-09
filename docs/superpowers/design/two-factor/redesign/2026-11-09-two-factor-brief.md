# Briefing Claude Design: autenticazione a due fattori (email OTP + authenticator)

Questo documento descrive una **funzionalità nuova**: oggi PDash non ha alcun secondo fattore. Il flusso è descritto per come lo vogliamo, non il layout. I problemi elencati nel §4 sono spunti, non decisioni.

## 1. Contesto
PDash è un'app di project e portfolio management. Oggi il login è a un solo passo: email + password su `login.html`, e la sessione parte subito.

Vogliamo aggiungere un **secondo passo obbligatorio dopo la password**, con due metodi che convivono e che l'utente sceglie:
- **Email code** (predefinito per tutti): un codice di 6 cifre inviato all'email dell'account, valido pochi minuti.
- **Authenticator app** (opzionale, attivato dall'utente): codice di 6 cifre generato da un'app TOTP (Google/Microsoft Authenticator, 1Password…), che si rinnova ogni 30 secondi.

Chi attiva l'authenticator riceve dei **recovery code** monouso, da usare se perde il telefono.

**Chi la usa:** tutti gli utenti autenticati (`user`, `admin`, `sysadmin`). Gli admin hanno in più un'azione di reset su un altro utente.

**Dove compare:**
1. `login.html`: nuovo step dopo la password.
2. Gestione del metodo da parte dell'utente: oggi il menu account ha "My Profile" (un modal con nome, cognome ed email) e "Change password". Serve una sezione "Security" / "Two-step verification". Dove metterla (dentro My Profile, modal a sé, pagina dedicata) è una decisione di design.
3. `admin.html` (User Admin): azione "Reset two-step verification" nel menu della riga di un utente.

Fuori ambito: le passkey (WebAuthn). Arriveranno in un ciclo successivo, come terzo metodo o come login senza password. Il design della sezione Security deve lasciare spazio a un elenco di metodi che cresce.

## 2. Concetti che la UI deve rendere chiari
- **Secondo passo**: la password da sola non basta più. Dopo la password l'utente è "a metà" e non vede ancora l'app.
- **Metodo attivo**: ogni utente ne ha uno (Email code oppure Authenticator app). Il metodo attivo determina cosa chiede il secondo passo.
- **Fallback**: chi usa l'authenticator può ricorrere a un recovery code. Se possa anche farsi mandare un codice via email è una **decisione di policy ancora aperta**. Il design deve prevedere entrambe le varianti: link "Send a code to my email instead" presente oppure assente.
- **Recovery code**: un elenco (es. 10 codici) mostrato **una sola volta**, all'attivazione o alla rigenerazione. Ogni codice vale una volta. L'utente deve capire che va salvato subito.
- **Scadenza e tentativi**: il codice email scade (es. 10 minuti). Dopo 5 tentativi errati il passo si invalida e bisogna ricominciare dalla password. Il reinvio ha un cooldown (es. 60 secondi).
- **Reset da admin**: riporta l'utente all'Email code e cancella authenticator e recovery code. Serve per chi ha perso sia il telefono sia i recovery code.

## 3. Flussi e contenuti

### 3.1 Login, secondo passo (`login.html`)
È nella stessa `auth-card` del sign-in (tavole `PreLogin/2.1-signin.png`, `2.2-forgot.png`, `2.3-reset.png`), come una terza vista accanto a "login" e "forgot".

**Variante Email code**
- Titolo e testo: "Check your email", "We sent a 6-digit code to f•••@company.com" (email mascherata).
- Input del codice: 6 cifre, incolla supportato, `autocomplete="one-time-code"`, invio automatico al sesto carattere oppure pulsante **Verify**.
- **Resend code**, disabilitato durante il cooldown con un conto alla rovescia ("Resend in 45 s").
- "← Back to sign in" (torna al passo password).
- Facoltativo: checkbox "Trust this device for 30 days".

**Variante Authenticator app**
- "Enter the 6-digit code from your authenticator app".
- Stesso input e stesso **Verify**.
- Link "Use a recovery code" → stesso passo, con input alfanumerico (es. `XXXX-XXXX`).
- Link "Send a code to my email instead" (solo se la policy lo consente).
- "← Back to sign in".

**Stati**: verifica in corso (spinner nel pulsante), codice errato con tentativi rimasti ("Incorrect code. 3 attempts left."), codice scaduto, troppi tentativi (il passo si chiude, messaggio e ritorno al sign-in), reinvio avvenuto ("A new code has been sent"), errore di invio email.

Dopo il codice corretto il flusso prosegue come oggi, gate dei Terms & Conditions compreso (`terms.html`).

### 3.2 Sezione "Two-step verification" dell'utente
**Vista d'insieme**
- Metodo attivo ben visibile: "Email code — codes are sent to f•••@company.com" oppure "Authenticator app — enabled on 9 Nov 2026".
- Con Email code attivo: invito a passare all'authenticator ("More secure, works offline"), pulsante **Set up authenticator app**.
- Con Authenticator attivo:
  - recovery code rimasti ("7 of 10 left") con **Regenerate codes**;
  - **Switch back to email code** (azione che abbassa la sicurezza, va confermata).

**Wizard "Set up authenticator app"** (3 passi)
1. **Scan**: QR code, più la chiave in chiaro per chi non può scansionare (con copia), con un breve testo sulle app compatibili.
2. **Verify**: "Enter the code shown in the app" (6 cifre). Gestisce l'errore "Code doesn't match, check the time on your phone".
3. **Save your recovery codes**: griglia di codici, azioni **Copy**, **Download (.txt)**, **Print**, più la checkbox obbligatoria "I have saved these codes" prima di **Done**.

**Conferme sensibili**: per disattivare l'authenticator o rigenerare i codici si chiede la password attuale, oppure un codice valido. Va disegnato questo passo di ri-autenticazione.

**Stati**: caricamento, errore di salvataggio, successo ("Authenticator app enabled").

### 3.3 Reset da admin (`admin.html`)
- Nuova voce nel menu azioni della riga (tavole `admin/redesign/12d…12g`): **Reset two-step verification**, visibile solo se l'utente ha l'authenticator attivo.
- Le regole di visibilità sono quelle delle altre azioni: un admin non agisce su un sysadmin, nessuno agisce su sé stesso.
- Modal di conferma: cosa succede ("X will sign in with an email code next time. Their authenticator app and recovery codes will be removed.").
- Facoltativo: colonna o badge "2FA: Email / App" nella tabella utenti, oppure un filtro.

### 3.4 Notifiche email (testo, non tavola obbligatoria)
- Email con il codice di login.
- Avviso di sicurezza quando il metodo cambia o un admin lo resetta ("Your two-step verification settings changed").

Un template semplice e coerente con le email di invito e reset password esistenti è gradito ma non obbligatorio.

## 4. Problemi di design da risolvere
1. **Il secondo passo non deve sembrare un errore.** L'utente ha appena inserito la password giusta e si trova davanti un'altra schermata: deve capire subito che è previsto e cosa fare.
2. **Input del codice**: sei caselle separate o un campo unico? Serve facilità d'incolla da email/app, il funzionamento su mobile (tastiera numerica) e l'accessibilità per i lettori di schermo.
3. **Le uscite di sicurezza vanno trovate ma non devono distrarre.** Recovery code e "send to email" sono per i casi eccezionali e non devono competere con l'input principale.
4. **Recovery code presi sul serio.** L'utente deve davvero salvarli: gerarchia visiva, avvertimento, conferma esplicita.
5. **Gerarchia del rischio.** Passare dall'authenticator all'email abbassa la sicurezza e deve sembrarlo. Attivare l'authenticator è l'azione "buona" e va incoraggiata senza essere imposta.
6. **Spazio per crescere.** La sezione Security deve poter ospitare in futuro un elenco di passkey e, eventualmente, dei dispositivi fidati, senza un nuovo redesign.
7. **Policy per ruolo (opzionale).** Potremmo obbligare admin/sysadmin all'authenticator. Se lo proponi, disegna lo stato "Your role requires an authenticator app" al primo login: setup forzato, non saltabile.

## 5. Vincoli tecnici (non negoziabili)
- Vue 3 e Bootstrap 5.3 da CDN. Nessun build step. Il QR viene generato dal server come immagine.
- Nessun hex nel codice: solo `var(--token)` da `css/tokens.css`. Nessun nuovo token, salvo necessità motivata. Ogni coppia testo/sfondo deve stare ≥ 4.5:1.
- Tutto il testo in **inglese**.
- Il secondo passo del login sta nella `auth-card` di `login.html` (stile `css/auth.css`, tavole `PreLogin/`): niente sidebar, niente shell.
- La sezione utente e il reset admin stanno dentro lo shell standard (sidebar `pd-nav`, `#app-main`), nel linguaggio delle pagine già ridisegnate (tavole `admin/redesign/`, `Master-data/`, `team/`).
- Responsive: desktop (≥1280), tablet e smartphone. Il login a due passi su smartphone è il caso più frequente (utente che apre la mail sul telefono).
- Brand: navy `#0B1840` e magenta `#F0287A` come primario. Il magenta con testo bianco è un compromesso accettato.

## 6. Cosa chiediamo come consegna
Tavole per desktop, tablet e smartphone, con questi stati:
1. **Login, passo Email code**: stato iniziale, cooldown del reinvio attivo, codice errato con tentativi rimasti, codice scaduto, troppi tentativi, verifica in corso.
2. **Login, passo Authenticator**: stato iniziale, codice errato, vista "Use a recovery code", con e senza il link "Send a code to my email instead".
3. **Sezione Two-step verification**: con Email code attivo e con Authenticator attivo (recovery code rimasti visibili).
4. **Wizard authenticator**: i tre passi (Scan, Verify con errore, Save recovery codes).
5. **Ri-autenticazione** prima di Switch back to email e di Regenerate codes, più la conferma dello switch.
6. **Regenerate codes**: la nuova griglia di codici.
7. **User Admin**: menu della riga con "Reset two-step verification" e il suo modal di conferma. Facoltativo: badge/colonna metodo 2FA.
8. Facoltativo: **setup forzato** per un ruolo obbligato (§4.7) e template delle email (§3.4).
