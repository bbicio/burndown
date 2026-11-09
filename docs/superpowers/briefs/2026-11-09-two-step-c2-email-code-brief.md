# Brief — two-step, ciclo 2: secondo passo del login via email

**Tipo:** nuova feature (Scenario 1). Scomposizione confermata dall'utente il 2026-11-09, compresa la scelta di partire con il solo codice via email.
**Origine:** brief di prodotto `docs/superpowers/design/two-factor/redesign/2026-11-09-two-factor-brief.md` e brief UI `docs/superpowers/design/two-factor/redesign/brief-two-step-claude-code.md` (§6 riga Email, §9 variante email, §11 Trusted devices, §12, §13), tavole 15c, 15i, 15u–15aa, 15ag–15ah, 15ai, 15al.
**Sequenza concordata:** ciclo 1 My profile (`2026-11-09-two-step-c1-profile-page-brief.md`) → ciclo 2 (questo). Si apre dopo il merge del ciclo 1.

## Problema

Il login è a un solo passo: `POST /api/auth/login` controlla la password e chiama subito `setAuthCookie`. Una password rubata, riutilizzata o indovinata basta per entrare. Vogliamo un secondo passo obbligatorio per tutti: un codice di 6 cifre inviato all'email dell'account.

**Limite accettato:** il codice arriva nella stessa casella del link "Forgot password". Chi controlla la casella entra comunque. Il ciclo authenticator futuro chiude questo caso.

## Comportamento atteso

- Dopo la password corretta l'utente è "a metà": non ha la sessione e vede la terza vista di `login.html` (brief UI §9, variante email, con tutti i suoi stati).
- Il codice scade dopo 10 minuti. Il reinvio ha un cooldown di 60 s e invalida i codici precedenti. Dopo 5 tentativi errati il passo si chiude e si riparte dalla password.
- "Trust this device for 30 days" salta il codice su quel dispositivo. La sezione Trusted devices del profilo (15i) elenca e rimuove i dispositivi. Cambiare password li rimuove tutti.
- La sezione Two-step verification del profilo mostra la sola riga "Email code · Active" (15c senza la riga Authenticator).
- Dopo il codice corretto il flusso prosegue come oggi, gate dei Terms & Conditions compreso.

## Vincoli strutturali: l'authenticator si aggiunge senza rifare

Concordati con l'utente il 2026-11-09. La Spec li riporta come vincoli, non come opzioni.

1. **Dati.** Lo stato 2FA dell'utente ha una colonna `method`, che in questo ciclo vale sempre `'email'`. Anche il challenge del login registra il metodo. L'authenticator sarà un nuovo valore, non una migration che rimette mano allo schema.
2. **Login.** Il secondo passo di `login.html` sceglie la vista in base al metodo restituito dal server. In questo ciclo esiste solo la vista email. L'input a 6 caselle è un componente unico, riusabile dalle viste app/recovery e dal wizard futuri.
3. **Profilo.** La sezione Two-step verification è un elenco di righe-metodo (brief UI §6). In questo ciclo ha una sola riga. Le righe Authenticator app, Recovery codes e, più avanti, le passkey si aggiungono senza ridisegnare.

## Decisioni per il brainstorming

1. **Stato "a metà".** È un cookie di challenge separato da `pdash_token`, così `requireAuth` resta com'è. Forma, durata e firma le sceglie il brainstorming.
2. **Rate limiting** su `POST /api/auth/login` e sugli endpoint del codice: oggi non ce n'è nessuno. Si sceglie tra una dipendenza nuova e un'implementazione in DB.
3. **Login automatizzati.** `test-api.js`, `scripts/shoot.mjs` e `api/src/scripts/seed-planning-golden.js` fanno login con la sola password. Serve un percorso valido solo sugli stack di test, mai in produzione.
4. **Lockout se l'SMTP non funziona.** Serve una via d'emergenza da CLI, sul modello di `api/src/create-admin.js`.
5. **Rollout.** Obbligatorio per tutti dal merge, oppure con un interruttore.
6. **Dispositivo fidato.** Come si identifica (cookie con token casuale, hash in DB) e cosa si mostra come "Chrome on Windows" (parsing dello user agent).

## Vincoli

- Le regole pure (scadenza, tentativi, cooldown, mascheramento dell'email) stanno sotto `api/src/lib/` con test `node:test`.
- Nessun codice né token in chiaro nel DB: solo hash.
- Le route nuove richiedono `docker compose restart api` sullo stack principale, solo nella deroga del Gate 4 step 7 di `/finish-cycle`. La migration si applica nel Gate 4.
- Componenti del sito prima delle tavole (brief UI §0). Niente hex. Testo in inglese. `?v=N` aggiornati ovunque.

## Criteri di accettazione

Da fissare nella Spec (§6b). Base di partenza: brief UI §14, riga 3 limitata alla variante email, più i criteri di `test-api.js` su scadenza, tentativi, cooldown e dispositivo fidato.

## Scope escluso esplicitamente

- Authenticator app, recovery code, ri-autenticazione, switch back e regenerate, reset da admin, badge 2FA in User Admin (ciclo futuro; tavole 15d–15t, 15ab–15af, 15aj–15ak, 15am–15ao).
- Sessions, Notifications, Download my data (⚠: backlog).
- Setup forzato per ruolo, passkey.

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione va isolato in `docs/BACKLOG.md` o in un Brief a sé, non corretto qui.
