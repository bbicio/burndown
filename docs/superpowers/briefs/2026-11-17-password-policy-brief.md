# Brief — Password policy (NIST SP 800-63B)

**Tipo:** evoluzione (Scenario 2), dichiarata dall'utente il 2026-11-17.
**Brief started:** 2026-11-17 10:13
**Origine:** `docs/superpowers/audits/2026-11-15-security-review-audit.md:123`, "Not assessed": "password policy (the code requires 8 characters and nothing else)".
**Classe di rischio:** high-risk (autenticazione, `PROCESS.md` §6.1b).

## Obiettivo

Una sola regola per le password, applicata dal server ovunque si imposti una password e mostrata in modo coerente nell'interfaccia, allineata a NIST SP 800-63B.

## Comportamento attuale

**Server: la regola è "almeno 8 caratteri" ed è ripetuta in tre handler di `api/src/routes/auth.js`.**
- `POST /activate`: `:474`, prima con `isStr` (`:468`) e il controllo di conferma (`:473`).
- `POST /reset-password`: `:554`, stessa sequenza (`:549`, `:553`).
- `POST /change-password`: `:578`. Qui `newPassword` non passa da `isStr` (`:576`): leggendo il codice, un valore non stringa supera `length < 8` (`undefined < 8` è falso) e arriva a `bcrypt.hash` (`:585`). Non l'ho verificato a runtime.
- Ogni rifiuto è `400 { error: 'Password must be at least 8 characters' }`, senza `code`.
- Il contesto utente disponibile cambia da handler a handler. `/activate` e `/reset-password` leggono solo `id` (`:476-479`, `:556-559`). `/change-password` ha `req.user` (id, role, email) e rilegge `password_hash` (`:580`). Nome ed email non vengono letti dove servirebbero per escluderli dalla password.
- Hash: `bcrypt.hash(…, 12)` a `:482`, `:562` e `:585`. bcrypt usa solo i primi 72 byte. Non esiste una lunghezza massima.

**CLI: `api/src/create-admin.js` non controlla nulla.** La password arriva da `process.argv` (`:42`); si verifica solo che ci sia (`:44`), poi viene cifrata (`:58`). Lo script è richiamato dal profilo `test` di `docker-compose.yml` (`:82-83`), con i default `TestAdmin123!` (13 caratteri, `:72`) e `TestSysAdmin123!` (16 caratteri, `:74`).

**Client: tre implementazioni dello stesso minimo di 8 e due formule di robustezza diverse.**
- `js/pages/activate.js:18` e `js/pages/reset-password.js:17`: `canSubmit` vale `length >= 8` più la conferma uguale. `checkStrength` (`:39-47`, `:36-44`, identiche) dà un punto per ciascuno di questi criteri:
  - almeno 8 caratteri;
  - almeno 12 caratteri;
  - maiuscole e minuscole insieme;
  - `[0-9!@#$%^&*]`.
  Le etichette sono Weak/Fair/Good/Strong e lo stile sta in `css/auth.css:193-208`.
- `js/lib/profile-ui.js:16-26`, `passwordStrength`: restituisce 1 sotto gli 8 caratteri, altrimenti un punteggio compreso tra 2 e 4 con criteri diversi (lettere con cifre, qualsiasi carattere non alfanumerico). Alle `:28-31`, `passwordFormState` ripete `next.length >= 8`. Entrambe sono pinnate da `js/lib/profile-ui.test.js:37-63`.
- Testi:
  - `activate.html:55` e `reset-password.html:50`: `placeholder="Min. 8 characters"`;
  - `profile.html:107`: `placeholder="At least 8 characters"`;
  - `profile.html:118`: "At least 8 characters. Longer, with numbers and capitals, is stronger." Questo testo suggerisce una regola di composizione.
- Su tutti i campi c'è `autocomplete="new-password"` e nessun blocco dell'incolla.

**Documentazione che cita la regola:**
- `handbook/public/manual.md:29` ("A password needs at least 8 characters.");
- `docs/js/lib.md:326`;
- `docs/pages/profile.md:10`.

**Fixture di test con password:** `test-api.js:489` (`ResetPass123!`, 13 caratteri) e i default di `docker-compose.yml` citati sopra.

## Comportamento atteso

1. **Una regola, un modulo.** `api/src/lib/password-policy.js` è puro e testato con `node:test`. Decide se una password è accettabile dato il contesto dell'utente (email, nome, cognome) e restituisce un esito con un messaggio in inglese. Il messaggio non contiene la password.
2. **Il server è l'unica autorità.** `/activate`, `/reset-password` e `/change-password` chiamano il modulo prima di qualsiasi scrittura. Un rifiuto risponde `400 { error, code: 'PASSWORD_RULE' }`. Gli handler leggono il contesto utente necessario al controllo.
3. **Contenuto della regola, secondo NIST SP 800-63B:**
   - minimo di 12 caratteri (deciso dall'utente il 2026-11-17);
   - massimo ampio e coerente con i 72 byte di bcrypt;
   - nessuna regola di composizione obbligatoria e nessuna scadenza;
   - rifiuto delle password comuni o compromesse e di quelle che contengono l'email o il nome dell'utente.

   I valori e il meccanismo si decidono in /brainstorming (scelte aperte 1, 2 e 6).
4. **Un gemello nel browser per il feedback immediato.** Il modulo in `js/lib/` (con il ponte `window.`) sostituisce i due `checkStrength`, `passwordStrength` e i tre `>= 8` lato client. Le tre pagine mostrano lo stesso requisito, lo stesso indicatore e lo stesso messaggio del server. Il testo di `profile.html:118` non suggerisce più una regola di composizione.
5. **Incolla e password manager restano consentiti.** `autocomplete="new-password"` resta su ogni campo e nessun handler blocca l'incolla.
6. **`create-admin.js`** applica la regola oppure una deroga esplicita e documentata (scelta aperta 5).
7. **Utenti esistenti con password non conformi:** il comportamento si decide in /brainstorming (scelta aperta 4).
8. **Documentazione:** `handbook/public/manual.md`, `docs/js/lib.md` e `docs/pages/profile.md` descrivono la nuova regola senza ripeterne i valori fuori dal file che la contiene (CLAUDE.md, "Writing documentation").

## Vincoli

- Una sola implementazione sul modello di `money.js`/`dates.js`: un modulo server e un gemello browser. Il server resta l'unica autorità.
- Un guard test fallisce in questi casi:
  - un punto che imposta una password (route o script CLI, cioè ogni `bcrypt.hash` di una password) non passa dal modulo;
  - una pagina o un file in `js/` ridefinisce la regola per conto suo.
- Nessuna chiamata a servizi esterni con la password o un suo hash senza una decisione esplicita in /brainstorming (scelta aperta 2).
- Nessuna nuova libreria CDN senza versione esatta, SRI e compatibilità con la CSP (`scripts/cdn-integrity-guard.test.js`, `scripts/security-headers-guard.test.js`). Nessuno script inline (CSP).
- La password non compare mai in log, messaggi d'errore, report o fixture committate oltre a quelle già esistenti.
- Cache-busting: ogni `?v=N` dei file modificati va aggiornato in tutte le pagine che li caricano.
- Testi utente in inglese.
- Le fixture di test (`test-api.js`, i default di `docker-compose.yml`) devono rispettare la nuova regola, oppure la deroga della scelta aperta 5.

## Criteri di accettazione

- [ ] `api/src/lib/password-policy.js` esiste con i suoi test `node:test`. I test coprono, per ciascuna regola decisa, il primo valore accettato e l'ultimo rifiutato.
- [ ] Una password di 11 caratteri è rifiutata e una di 12 conforme è accettata; il rifiuto arriva da `/activate`, `/reset-password` e `/change-password` con `400` e `code: 'PASSWORD_RULE'`. Lo verificano test d'integrazione in `test-api.js`.
- [ ] Una password che contiene l'email o il nome dell'utente è rifiutata dalle tre route con `PASSWORD_RULE`.
- [ ] Una password presente nella lista delle compromesse (secondo il meccanismo deciso) è rifiutata dalle tre route con `PASSWORD_RULE`.
- [ ] Una password conforme senza maiuscole né simboli è accettata.
- [ ] Una password oltre il massimo deciso è rifiutata con `PASSWORD_RULE`.
- [ ] Un `newPassword` non stringa su `/change-password` non produce un 500.
- [ ] `create-admin.js` applica la regola, o la deroga decisa, ed è coperto dal guard.
- [ ] Il guard test fallisce se si aggiunge un `bcrypt.hash` di una password che non passa dal modulo, o una regola di lunghezza o robustezza ridefinita in una pagina.
- [ ] `activate.html`, `reset-password.html` e `profile.html` mostrano lo stesso requisito e lo stesso indicatore, presi dal modulo browser. Non esistono più `checkStrength` né `>= 8` locali.
- [ ] Nessun campo password blocca l'incolla. Ogni campo nuovo porta `autocomplete="new-password"`.
- [ ] Nessuna riga di log o risposta d'errore contiene la password (verificato con un grep sul diff e da un test sul messaggio del modulo).
- [ ] `npm test`, i test backend e `scripts/run-tests.sh` passano. `cdn-integrity-guard` e `security-headers-guard` passano.
- [ ] La documentazione elencata al punto 8 è aggiornata.

## Scope escluso (confermato dall'utente)

- Two-step verification (esiste già), SSO.
- Blocco degli account e rate limit (già presenti).
- Scadenza periodica delle password.
- Algoritmo di hash: bcrypt cost 12 resta invariato, senza argon2 e senza rehash al login.
- Storico delle password e divieto di riuso.
- S-10 (account del profilo `test` con password note): i default si adeguano solo se la nuova regola lo impone.
- Le board di design storiche in `docs/superpowers/design/` (per esempio `two-factor/redesign/MyProfile.dc.html`).

## Scelte aperte per /brainstorming

1. Lunghezza massima. Il minimo è già deciso dall'utente: 12 caratteri.
2. Controllo delle password compromesse: una lista locale delle più comuni nel repo, un servizio esterno con k-anonymity (Have I Been Pwned), oppure entrambi. Da valutare privacy, dipendenza di rete, comportamento quando il servizio non risponde e dimensione della lista (incluso il gemello browser).
3. Indicatore di robustezza: quello attuale unificato, oppure una libreria (per esempio zxcvbn), con i suoi costi di dimensione, SRI e CSP.
4. Utenti esistenti con password non conformi: nessuna azione, cambio richiesto al prossimo login, oppure solo un avviso.
5. `create-admin.js`: la stessa regola o una deroga esplicita.
6. Unità di misura dei limiti (caratteri o byte UTF-8, rispetto ai 72 byte di bcrypt) ed eventuale normalizzazione Unicode prima del controllo e dell'hash.
7. Come si confrontano email e nome: parte locale dell'email, soglia minima di lunghezza del frammento, maiuscole e minuscole.
