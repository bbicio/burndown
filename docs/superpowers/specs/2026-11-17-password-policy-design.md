# Password policy (NIST SP 800-63B) — design spec

**Date:** 2026-11-17
**Brief started:** 2026-11-17 10:13
**Brief:** `docs/superpowers/briefs/2026-11-17-password-policy-brief.md`
**Scenario:** 2 (evoluzione)
**Classe di rischio:** high-risk (autenticazione)

Una sola regola per le password, scritta in due moduli gemelli e applicata dal server attraverso un solo servizio. Questo servizio è anche l'unico punto del codice che calcola l'hash di una password.

## 1. Fatti verificati

- `api/src/routes/auth.js`: `length < 8` a `:474` (`/activate`), `:554` (`/reset-password`) e `:578` (`/change-password`); `bcrypt.hash(…, 12)` a `:482`, `:562` e `:585`. Le SELECT del token leggono solo `id` (`:476-479`, `:556-559`). `/change-password` non applica `isStr` a `newPassword` (`:576`).
- `api/src/create-admin.js:42-58`: nessun controllo sulla password, `bcrypt.hash(password, 12)`. Lo usa il servizio `test` di `docker-compose.yml:82-83`, che installa in `/tmp` solo `pg`, `bcryptjs` e `xlsx`.
- `api/Dockerfile`: `node:24-alpine`, quindi `fetch`, `AbortSignal.timeout` e `crypto` sono già disponibili. Nessuna dipendenza nuova.
- Client: `checkStrength` in `js/pages/activate.js:39-47` e `js/pages/reset-password.js:36-44`; `passwordStrength` e `passwordFormState` in `js/lib/profile-ui.js:16-31`, pinnate da `js/lib/profile-ui.test.js:37-63`. Testi in `activate.html:55`, `reset-password.html:50` e `profile.html:107`, `:118`.
- `api/src/lib/credential-revocation-guard.test.js` pretende `revokeTwoStepState(` in ogni file che scrive `users.password_hash`. Gli `UPDATE` restano dove sono, quindi il guard continua a valere senza modifiche.
- `test-api.js` usa già gli ID `PW-01`/`PW-02` (cambio password). I casi nuovi usano il prefisso `PP-`.
- `scripts/site-export.rules:40` include `api/src/`, quindi la lista delle password comuni viene esportata insieme al resto del server.
- La regola degli 8 caratteri compare in questi documenti:
  - `handbook/public/manual.md:29` e `:34`;
  - `handbook/restricted/TEST_CASES.md`, A-16 e GD-10;
  - `docs/js/lib.md:326`;
  - `docs/pages/profile.md:10`.

## 2. Regola — `api/src/lib/password-policy.js`

Modulo puro in CommonJS, testato con `node:test`. Esporta le costanti `MIN_LENGTH = 12`, `MAX_LENGTH = 64`, `MAX_BYTES = 72`, `MIN_DISTINCT = 4` e `CONTEXT_MIN = 4`, la funzione `passwordError(password, context, { common })` e la funzione `contextTokens(context)`.

`passwordError` restituisce `null` oppure `{ message }`. Il messaggio è in inglese e non contiene mai la password. Si ferma al primo controllo fallito, in quest'ordine:

| # | Controllo | Messaggio |
|---|---|---|
| 1 | è una stringa | `Password is required.` |
| 2 | almeno `MIN_LENGTH` code point (`[...password].length`) | `Use at least 12 characters.` |
| 3 | al massimo `MAX_LENGTH` code point e al massimo `MAX_BYTES` byte UTF-8 | `Use at most 64 characters.` (oltre i 72 byte: `This password is too long.`) |
| 4 | almeno `MIN_DISTINCT` caratteri distinti | `Avoid repeating the same few characters.` |
| 5 | non contiene, senza distinzione tra maiuscole e minuscole, nessun token di `contextTokens(context)` | `Don't use your name or email in your password.` |
| 6 | non compare in `common`, cioè in un `Set` di password in minuscolo (confronto esatto su `password.toLowerCase()`) | `This password is too common. Choose a different one.` |

`contextTokens({ email, firstName, lastName })` raccoglie:
- la parte locale dell'email e i suoi pezzi separati da `.`, `_`, `+` e `-`;
- `firstName` e `lastName`;
- `pdash`.

Mette tutto in minuscolo e scarta i token più corti di `CONTEXT_MIN` caratteri. Un contesto assente o parziale non è un errore.

Nessuna normalizzazione Unicode. Il valore controllato è esattamente quello che riceve l'hash.

## 3. Lista delle password comuni — `api/src/lib/data/common-passwords.txt`

- Fonte: SecLists, `Passwords/Common-Credentials/10-million-password-list-top-1000000.txt` (licenza MIT).
- Il file si genera una volta sola: voci tra 12 e 64 code point, in minuscolo, senza duplicati, una per riga.
- Le righe che iniziano con `#` formano l'header: URL della fonte, commit di SecLists, licenza e filtro applicato. Il caricatore le ignora.
- Il file non viene servito da nginx (`api/` non è nel sito) e non lo carica il browser.

## 4. Servizio — `api/src/services/passwords.js`

È l'unico file sotto `api/src` (test esclusi) che chiama `bcrypt.hash`. Esporta tre funzioni.

- `loadCommonPasswords()`: legge il file del §3 la prima volta che serve e lo tiene in memoria come `Set`.
- `pwnedCount(password, { fetchImpl = fetch, timeoutMs = 2000 })`:
  - calcola lo SHA-1 della password in esadecimale maiuscolo;
  - invia `GET https://api.pwnedpasswords.com/range/<primi 5 caratteri>` con l'header `Add-Padding: true` e `AbortSignal.timeout(timeoutMs)`;
  - cerca il suffisso nelle righe `SUFFISSO:conteggio` e ignora le righe con conteggio 0 (il padding).
  - Restituisce il conteggio, `0` se il suffisso non c'è, `null` su timeout, errore di rete o risposta diversa da 200.
- `hashNewPassword(password, context, { breachCheck = true, fetchImpl })`:
  1. `passwordError(password, context, { common: loadCommonPasswords() })`; con un errore restituisce `{ error }`;
  2. se `breachCheck` è attivo e `process.env.PASSWORD_BREACH_CHECK !== 'off'`, chiama `pwnedCount`:
     - con un conteggio di 1 o più restituisce `{ error: 'This password has appeared in a data breach. Choose a different one.' }`;
     - con `null` scrive `console.warn('[passwords] breach check unavailable:', <motivo>)` e prosegue (fail-open). Il motivo non contiene la password né il prefisso;
  3. restituisce `{ hash: await bcrypt.hash(password, 12) }`.

## 5. Route — `api/src/routes/auth.js`

Una password rifiutata risponde `400 { error, code: 'PASSWORD_RULE' }`.

- **`/activate`:** la SELECT dell'invito legge anche `email`, `first_name` e `last_name`. Il controllo `length < 8` viene rimosso. Dopo il lookup, `hashNewPassword(password, { email, firstName, lastName })` sostituisce `bcrypt.hash`. L'ordine di risposta resta quello di oggi: 400 per i campi mancanti o la conferma diversa, poi 410 per il token non valido, poi `PASSWORD_RULE`.
- **`/reset-password`:** come `/activate`, sulla SELECT del token di reset.
- **`/change-password`:**
  - `isStr` su `currentPassword` e `newPassword` (risposta `All fields required`);
  - poi la conferma;
  - poi la verifica della password attuale (400 con `field: 'currentPassword'`, invariato);
  - poi `hashNewPassword` con il contesto letto insieme a `password_hash` (`email`, `first_name`, `last_name`).
- Login e two-step non cambiano. Nessuna azione sugli utenti esistenti.

## 6. `api/src/create-admin.js`

Usa `hashNewPassword(password, { email, firstName, lastName }, { breachCheck: false })`. Se la password è rifiutata, scrive `Password refused: <message>` su stderr ed esce con codice 1, prima di qualsiasi scrittura. I default del profilo `test` (`TestAdmin123!`, `TestSysAdmin123!`) devono superare la regola: lo verifica un test.

## 7. Gemello browser — `js/lib/password-policy.js`

Modulo ES con il ponte `window.`. Esporta:
- le stesse costanti, `contextTokens` e `passwordError(password, context)`, con i controlli 1-5 del §2 (niente lista comune, niente HIBP);
- `passwordStrength(password)`: 0 se vuota, 1 se `passwordError` non è `null`, altrimenti 2 da 12 a 15 code point, 3 da 16 a 19, 4 da 20 in su;
- `STRENGTH_LABELS` = `['', 'Too weak', 'Fair', 'Good', 'Strong']`;
- `PASSWORD_HINT` = `At least 12 characters. A longer passphrase is stronger.`;
- `PASSWORD_PLACEHOLDER` = `At least 12 characters`.

Un test di parità (vitest) carica i due moduli (il server con `createRequire`), confronta le costanti e fa girare la stessa tabella di casi su `passwordError` per i controlli 1-5.

## 8. Pagine

- **`activate.html` e `reset-password.html`** caricano `js/lib/password-policy.js`, come modulo, prima dello script della pagina. In `js/pages/activate.js` e `js/pages/reset-password.js`:
  - `checkStrength` sparisce, e con esso il dato `strength`;
  - la robustezza diventa un computed `strength` = `passwordStrength(this.password)`, e `strengthLabel` legge `STRENGTH_LABELS`;
  - `ruleError` è il computed `passwordError(this.password, context)?.message`, mostrato sotto il campo solo quando il campo non è vuoto. Il contesto è `{ email, firstName }` dell'invito su activate e `{}` su reset;
  - `canSubmit` vale `!ruleError && password === confirm`;
  - il placeholder viene da `PASSWORD_PLACEHOLDER`.
- **`profile.html`:**
  - `js/lib/profile-ui.js` perde `passwordStrength` e importa `passwordError` dal gemello;
  - `passwordFormState({ current, next, confirm }, context)` aggiunge `ruleError` e calcola `canSubmit` da questo;
  - `js/pages/profile.js` passa il contesto dell'utente;
  - placeholder e testo di aiuto (`:107`, `:118`) vengono dal modulo; sotto il campo compare `ruleError`.
- Il CSS degli indicatori (`css/auth.css` `.strength-*`, `.mp-strength[data-level]`) non cambia.
- I messaggi d'errore del server (`data.error`, `e.data?.error`) si mostrano come oggi.
- Ogni `?v=N` dei file toccati viene aggiornato in tutte le pagine che li caricano.
- `autocomplete="new-password"` resta su tutti i campi e nessun handler blocca l'incolla.

## 9. Guard — `scripts/password-policy-guard.test.js`

Fallisce quando:
1. `bcrypt.hash(` compare in un file sotto `api/src` (test esclusi) diverso da `api/src/services/passwords.js`;
2. una pagina `*.html` della radice con `autocomplete="new-password"` non carica `js/lib/password-policy.js`;
3. una pagina `*.html` della radice, un file di `js/pages/` o un file di `js/lib/` diverso da `password-policy.js` (test esclusi) contiene `checkStrength` o un testo `\d+ characters` scritto a mano;
4. `api/src/services/passwords.js` non importa `../lib/password-policy`.

L'header del guard dichiara il suo limite: controlla dove stanno le chiamate, non se la regola è corretta. La correttezza è compito dei test dei moduli.

## 10. Test

- `api/src/lib/password-policy.test.js`: per ogni controllo, l'ultimo valore rifiutato e il primo accettato:
  - 11 e 12 code point; 64 e 65; una stringa di 64 caratteri non ASCII oltre i 72 byte;
  - 3 e 4 caratteri distinti;
  - token di 3 caratteri ignorato, di 4 rifiutato;
  - un contesto assente;
  - una voce comune in maiuscolo;
  - nessun messaggio contiene la password.
- `api/src/services/passwords.test.js`, con `fetchImpl` sostituito da uno stub:
  - trovata, non trovata e solo padding;
  - timeout, errore di rete e risposta 500, tutti fail-open con warning;
  - `PASSWORD_BREACH_CHECK=off` e `breachCheck: false` non chiamano lo stub;
  - lo stub riceve solo i 5 caratteri del prefisso;
  - la lista comune si carica e ignora le righe `#`;
  - i default di `docker-compose.yml` superano la regola.
- vitest:
  - `js/lib/password-policy.test.js` (gemello, `passwordStrength`, parità);
  - `js/lib/profile-ui.test.js` aggiornato;
  - `scripts/password-policy-guard.test.js`.
- `test-api.js`, `PP-01..`, con `PASSWORD_BREACH_CHECK=off` impostato sul servizio `api` dall'override di `scripts/run-tests.sh`. Sulle tre route:
  - 11 caratteri → `PASSWORD_RULE`; 12 caratteri conformi → 200;
  - una password che contiene la parte locale dell'email → `PASSWORD_RULE`;
  - una voce della lista comune → `PASSWORD_RULE`;
  - 65 caratteri → `PASSWORD_RULE`;
  - una password conforme senza maiuscole né simboli → 200;
  - su `/change-password`, `newPassword` numerico → 400, non 500.
  - Le fixture esistenti che impostano una password (`test-api.js:489`, `ResetPass123!`) si adeguano dove la nuova regola le rifiuta.

## 11. Documentazione

- `handbook/public/manual.md`:
  - `:29`: la regola in parole semplici: almeno 12 caratteri, niente nome o email, niente password comuni o comparse in un data breach;
  - `:34`: l'indicatore (Too weak / Fair / Good / Strong) dipende dalla lunghezza, e il pulsante si abilita quando la regola è rispettata;
  - la riga della tabella del profilo (`:683`), se serve.
- `handbook/restricted/TEST_CASES.md`: A-16 e GD-10 riscritti con i nuovi livelli; righe nuove per il rifiuto con il nome o l'email, per la password comune e per il breach (manuale, con HIBP attivo), con il riferimento ai casi `PP-`.
- `handbook/restricted/ARCHITECTURE.md`:
  - le sequenze §4.1, §4.3 e §4.4 riportano il controllo della password;
  - la tabella delle route (`activate`, `reset-password`, `change-password`) riporta `400 PASSWORD_RULE`;
  - il servizio nuovo va nelle sezioni che elencano i servizi, se `scripts/architecture-guard.test.js` lo pretende.
- `handbook/restricted/production-checklist.md`: un punto per il traffico HTTPS in uscita dal container API verso `api.pwnedpasswords.com`, con il controllo `docker logs pdash-api 2>&1 | grep "breach check unavailable"`.
- `docs/js/lib.md` (gemello, `profile-ui.js` aggiornato), `docs/api/lib.md` (`password-policy.js`), `docs/api/services.md` (`passwords.js`), `docs/pages/profile.md:10`, `docs/scripts/run-tests.md` (`PASSWORD_BREACH_CHECK=off`).
- `CLAUDE.md`: la sezione "Passwords", sul modello di "Dates", porta tre regole:
  - la regola vive nei due moduli;
  - ogni hash di una password passa da `hashNewPassword`;
  - nessun testo della regola scritto a mano nelle pagine.

  Il guard è citato invece di ripetere le regole.

## 12. Stack principale

Nessuna migrazione. Dopo il merge serve il restart di `pdash-api`, già coperto dalla deroga del Gate 4. nginx non è toccato.

## Criteri di accettazione

1. **Minimo 12** — sulle tre route una password di 11 caratteri risponde `400 PASSWORD_RULE` e una conforme di 12 risponde 200 (`PP-`).
2. **Nome ed email** — una password che contiene la parte locale dell'email, il nome o il cognome (token di almeno 4 caratteri) è rifiutata con `PASSWORD_RULE` (`PP-` e `password-policy.test.js`).
3. **Lista comune** — una voce di `common-passwords.txt` è rifiutata con `PASSWORD_RULE` su tutte e tre le route (`PP-`).
4. **HIBP** — con lo stub, una password trovata è rifiutata; timeout, errore e 500 la accettano scrivendo il warning; al servizio arriva solo il prefisso di 5 caratteri (`passwords.test.js`).
5. **HIBP reale** — sul branch stack, con HIBP attivo, una password di almeno 12 caratteri nota a HIBP e assente dalla lista locale (assenza verificata con `grep -x` sul file) è rifiutata con il messaggio sul data breach (manuale).
6. **Massimo** — 65 caratteri, oppure oltre i 72 byte UTF-8, sono rifiutati con `PASSWORD_RULE`.
7. **Nessuna composizione** — una password conforme senza maiuscole né simboli è accettata.
8. **Non stringa** — `newPassword` numerico su `/change-password` risponde 400, non 500.
9. **CLI** — `create-admin.js` con `short` esce con 1 senza scrivere; i default del profilo `test` passano.
10. **Unico hash** — il guard fallisce su un `bcrypt.hash(` aggiunto fuori dal servizio, o su un `checkStrength` o un testo "N characters" in una pagina.
11. **Pagine coerenti** — activate, reset e profilo mostrano lo stesso placeholder, lo stesso testo di aiuto e gli stessi livelli dell'indicatore (Too weak / Fair / Good / Strong), presi dal modulo; il pulsante si abilita solo con la regola rispettata (manuale, alle tre larghezze di A-14).
12. **Incolla** — incollare una password da un password manager funziona su tutti e tre i form (manuale).
13. **Nessuna password nei log** — `docker logs` del branch stack dopo i test non contiene le password dei casi `PP-`; nessun messaggio del modulo contiene la password (test).
14. **Suite** — `npm test`, i test backend e `scripts/run-tests.sh` passano.
15. **Documentazione e help** — i file del §11 sono aggiornati; `help.html` mostra il manuale, i test case e l'architettura aggiornati (`scripts/handbook-guard.test.js`, `scripts/architecture-guard.test.js` verdi).

## Decisioni aperte

1. **Lista locale + HIBP con k-anonymity, fail-open** (decisa dall'utente). Alternativa scartata: solo lista locale, oppure HIBP fail-closed. Perché: copertura ampia senza bloccare attivazioni e reset quando HIBP è giù.
2. **Nessuna azione sugli utenti esistenti** (decisa dall'utente). Alternativa scartata: avviso dopo il login, oppure cambio obbligatorio. Perché: lo scope resta piccolo e il login non cambia.
3. **Massimo: 64 code point e 72 byte UTF-8.** Alternativa scartata: un solo limite di 72 byte. Perché: 64 è il minimo raccomandato da NIST, e il limite in byte evita che bcrypt tronchi in silenzio.
4. **Lunghezza in code point, senza normalizzazione Unicode.** Alternativa scartata: NFKC prima del controllo e dell'hash. Perché: il login confronta la password grezza, quindi normalizzare romperebbe le password non ASCII già salvate.
5. **Indicatore unificato basato sulla lunghezza, senza librerie.** Alternativa scartata: zxcvbn. Perché: centinaia di KB da CDN con SRI, e premia la composizione, che NIST non chiede.
6. **`create-admin.js`: regole locali sì, HIBP no.** Alternativa scartata: la regola completa. Perché: è uno strumento da operatore e gira nel profilo `test`, che non deve dipendere dalla rete.
7. **Contesto: token di almeno 4 caratteri, senza distinzione tra maiuscole e minuscole, più `pdash`.** Alternativa scartata: confronto con l'email e il nome interi. Perché: blocca le varianti; soglie più corte darebbero falsi rifiuti sui nomi brevi.
8. **Almeno 4 caratteri distinti.** Alternativa scartata: nessun controllo di ripetizione. Perché: NIST cita le password ripetitive, e la lista comune non copre tutte le varianti.
9. **HIBP rifiuta da 1 occorrenza.** Alternativa scartata: una soglia più alta. Perché: una password comparsa in un breach è nei dizionari di attacco.
10. **`PASSWORD_BREACH_CHECK=off` solo nell'override di `run-tests.sh`.** Alternativa scartata: HIBP attivo nei test d'integrazione. Perché: i test resterebbero legati alla rete e al contenuto di HIBP. Il branch stack e lo stack principale lo tengono attivo.
11. **Controllo dopo il lookup del token.** Alternativa scartata: lunghezza prima del lookup. Perché: il contesto arriva dalla riga dell'utente, un solo punto di controllo è più semplice, e il 410 resta com'è.
12. **Sezione "Passwords" in `CLAUDE.md`.** Alternativa scartata: solo i file in `docs/`. Perché: è una regola trasversale come "Dates" e "Money".
13. **Documentazione e help inclusi nel ciclo** (deciso dall'utente). Alternativa scartata: rinviarli a `/sync-docs`. Perché: il manuale e i test case descrivono la regola, e il ciclo li deve lasciare veri al merge.
14. **Il ciclo si consegna intero, senza dividerlo.** Alternativa scartata: un ciclo per il server e uno per le pagine e l'help. Perché: con le pagine ancora a 8 caratteri mentre il server pretende 12, l'interfaccia mentirebbe tra un ciclo e l'altro.
