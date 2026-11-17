# Password policy (NIST SP 800-63B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una regola unica per le password (minimo 12, massimo 64 code point e 72 byte, niente contesto utente, niente password comuni, HIBP fail-open), applicata dal server attraverso un solo servizio e mostrata in modo uguale da tutte e tre le pagine.

**Architecture:** `api/src/lib/password-policy.js` (puro) contiene la regola e `api/src/services/passwords.js` è l'unico punto che calcola l'hash di una password (regola, poi HIBP, poi bcrypt). Le tre route e `create-admin.js` passano dal servizio. `js/lib/password-policy.js` è il gemello browser per il feedback immediato, tenuto allineato da un test di parità. Un guard pinna il punto unico.

**Tech Stack:** Node 24 (`fetch`, `AbortSignal.timeout`, `crypto`), Express, bcryptjs, `node:test`; Vue 3 da CDN, vitest 4 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-17-password-policy-design.md`
**Branch:** `security-password-policy`
**Risk class:** high-risk — autenticazione (`api/src/routes/auth.js`: activate, reset-password, change-password)

**Task indipendenti:** no. I Task 2-7 consumano le interfacce del Task 1, il Task 3 quelle del Task 2, il Task 5 quelle del Task 4, il Task 6 pinna lo stato dei Task 2-5 e il Task 7 documenta lo stato finale.

## Global Constraints

- Costanti, identiche nei due moduli: `MIN_LENGTH = 12`, `MAX_LENGTH = 64`, `MAX_BYTES = 72`, `MIN_DISTINCT = 4`, `CONTEXT_MIN = 4`.
- Messaggi (Spec §2, §4), copiati alla lettera: `Password is required.` · `Use at least 12 characters.` · `Use at most 64 characters.` · `This password is too long.` · `Avoid repeating the same few characters.` · `Don't use your name or email in your password.` · `This password is too common. Choose a different one.` · `This password has appeared in a data breach. Choose a different one.`
- Codice di rifiuto: `400 { error, code: 'PASSWORD_RULE' }`.
- bcrypt cost 12, invariato.
- La password, il suo SHA-1 e il suo prefisso non compaiono mai in log, messaggi, risposte o report.
- Nessuna dipendenza npm nuova, nessuna libreria CDN nuova.
- File nuovi sotto `js/` referenziati con `?v=1`. Ogni file modificato e già versionato aggiorna il suo `?v=N` in ogni riferimento del repo.
- File scritti in UTF-8 senza BOM, con Edit/Write (mai `Get-Content`/`Set-Content`, mai codice con `\` scritto via `node -e`).
- Testi utente in inglese.
- Mai `docker compose` sullo stack principale. La verifica usa `scripts/run-tests.sh` e `scripts/test-branch.sh`.
- Worktree: `.claude/worktrees/security-password-policy` (PROCESS.md §6.1b). In un worktree nuovo bisogna copiare `.env` dal checkout principale e lanciare `npm ci` nella radice e in `api/`.

## Review Focus

1. **Utente senza nome o cognome** (invito con `last_name` vuoto, riga anonimizzata). `contextTokens` con `null`/`undefined`/`''` non solleva eccezioni e non produce token. Test nel Task 1.
2. **Password con emoji o accenti.** 18 emoji (72 byte) sono accettate, 19 (76 byte) sono rifiutate con `This password is too long.`; la lunghezza minima conta i code point, non le unità UTF-16. Test nel Task 1.
3. **Risposta HIBP con `\r\n` e suffissi maiuscoli**, cioè il formato reale. Il suffisso si trova comunque, e una riga `SUFFISSO:0` (padding) non conta. Test nel Task 2.
4. **HIBP lento.** La route non resta appesa oltre il timeout: `pwnedCount` restituisce `null` entro `timeoutMs` anche se lo stub non risponde mai. Test nel Task 2.
5. **Invito senza `firstName`** su `activate.html`. Il gemello riceve `{ email, firstName: '' }` e la pagina non si rompe. Test nel Task 4, sul gemello.

---

### Task 1: regola server e lista delle password comuni

**Files:**
- Create: `api/src/lib/password-policy.js`
- Create: `api/src/lib/password-policy.test.js`
- Create: `api/src/lib/data/common-passwords.txt`

**Interfaces:**
- Produces: `MIN_LENGTH`, `MAX_LENGTH`, `MAX_BYTES`, `MIN_DISTINCT`, `CONTEXT_MIN` (number); `contextTokens({ email, firstName, lastName } = {}) → string[]`; `passwordError(password, context = {}, { common = new Set() } = {}) → null | { message: string }`. CommonJS (`module.exports`).

- [ ] **Step 1: genera `common-passwords.txt`.** Leggi lo SHA corrente con `git ls-remote https://github.com/danielmiessler/SecLists HEAD`. Scarica `https://raw.githubusercontent.com/danielmiessler/SecLists/<sha>/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt` nella scratchpad. Filtra con uno script node scritto con Write nella scratchpad, non con `node -e`:
  - tieni le voci con `[...v].length` compreso tra 12 e 64;
  - mettile in minuscolo, togli i duplicati e mantieni l'ordine della fonte.

  Scrivi l'header:
  ```
  # Source: https://github.com/danielmiessler/SecLists/blob/<sha>/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt
  # License: MIT (SecLists)
  # Filter: 12..64 code points, lowercased, deduplicated, source order
  ```
  Expected: un file sotto i 2 MB. Se è più grande, fermati e chiedi.
- [ ] **Step 2: scrivi i test** in `password-policy.test.js` (`node:test` + `assert`):
  - `rejects 11 code points, accepts 12` (`'k7#wq9vz!m2p'.slice(0,11)` → `Use at least 12 characters.`; 12 → `null`);
  - `accepts 64, rejects 65` (`Use at most 64 characters.`);
  - `rejects over 72 bytes`: 18 × `'😀'` → `null`, 19 × `'😀'` → `This password is too long.`;
  - `counts code points, not UTF-16 units`: 11 emoji → `Use at least 12 characters.`;
  - `rejects 3 distinct, accepts 4` (`'abcabcabcabc'` → `Avoid repeating…`; `'abcdabcdabcd'` → `null`);
  - `context tokens`:
    - `contextTokens({ email: 'Mario.Rossi+x@acme.it', firstName: 'Ugo', lastName: 'Rossi' })` deep-equals `['mario.rossi+x', 'mario', 'rossi', 'pdash']`: `ugo` è sotto i 4 caratteri, `x` è scartato, i duplicati sono tolti;
    - `'Rossi-2026-ottobre'` → `Don't use your name…`;
    - `'Ugo-2026-ottobre!'` → `null`;
    - `'my-PDash-vault-key'` → `Don't use…`;
  - `missing context never throws`: `contextTokens({ email: null, firstName: undefined, lastName: '' })` deep-equals `['pdash']`; `passwordError('k7#wq9vz!m2pq')` → `null`;
  - `common list, case-insensitive`: con `common: new Set(['qwertyuiop123'])`, `'QwertyUIOP123'` → `This password is too common…`;
  - `non-string`: `12345678901234` e `{}` → `Password is required.`;
  - `no message contains the password`: per ogni caso rifiutato sopra, `!message.includes(password)`.
- [ ] **Step 3:** `cd api && node --test src/lib/password-policy.test.js`. Expected: FAIL (`Cannot find module './password-policy'`).
- [ ] **Step 4: implementa `password-policy.js`.** I controlli vanno nell'ordine della Spec §2; `contextTokens` divide la parte locale su `/[._+-]/`. Commento d'apertura sul modello degli altri moduli di `api/src/lib/`.
- [ ] **Step 5:** stesso comando dello Step 3. Expected: PASS.
- [ ] **Step 6: commit** `feat(auth): password policy rule and common-password list`.

### Task 2: servizio `passwords.js` (punto unico dell'hash, HIBP)

**Files:**
- Create: `api/src/services/passwords.js`
- Create: `api/src/services/passwords.test.js`

**Interfaces:**
- Consumes: `passwordError`, `MIN_LENGTH` (Task 1).
- Produces: `loadCommonPasswords() → Set<string>`; `pwnedCount(password, { fetchImpl = fetch, timeoutMs = 2000 } = {}) → Promise<number | null>`; `hashNewPassword(password, context, { breachCheck = true, fetchImpl } = {}) → Promise<{ hash: string } | { error: string }>`.

- [ ] **Step 1: scrivi i test.** Lo stub è `fetchImpl = async (url, opts) => ({ ok, status, text: async () => body })`, e registra `url` e `opts.headers`.
  - `found → count`: per `'correct-horse-battery'`, il corpo contiene `<suffisso>:42\r\n` con il suffisso maiuscolo dello SHA-1 → `42`;
  - `not found → 0`;
  - `padding line ignored`: `<suffisso>:0` → `0`;
  - `only the 5-char prefix leaves`: l'URL è `https://api.pwnedpasswords.com/range/<5 hex maiuscoli>` e non contiene altro dell'hash; `headers['Add-Padding'] === 'true'`;
  - `timeout → null`: uno stub che non si risolve mai, con `timeoutMs: 50`, restituisce `null` entro 1 s;
  - `network error → null`, `status 500 → null`;
  - `hashNewPassword rule error`: `'short'` → `{ error: 'Use at least 12 characters.' }`, stub non chiamato;
  - `hashNewPassword breach`: stub trovato → `{ error: 'This password has appeared in a data breach. Choose a different one.' }`;
  - `hashNewPassword fail-open`: con lo stub in errore, ritorna `{ hash }`, `bcrypt.compareSync(pw, hash)` è vero e c'è un solo `console.warn` (intercettato con `t.mock.method`) il cui testo non contiene né la password né il prefisso;
  - `breachCheck: false` e `process.env.PASSWORD_BREACH_CHECK = 'off'`: stub non chiamato (ripristina l'env alla fine);
  - `common list loads`: `loadCommonPasswords()` ha più di 0 voci, nessuna inizia con `#`, e `loadCommonPasswords() === loadCommonPasswords()`;
  - `test-profile defaults pass the local rule`: `hashNewPassword(<default nuovo>, { email: 'test-admin@pdash.local', firstName: 'Test', lastName: 'Admin' }, { breachCheck: false })` → `{ hash }`, e lo stesso per il sysadmin (`test-sysadmin@pdash.local`, `Test`, `SysAdmin`). I valori nuovi sono quelli del Task 3, Step 1.
- [ ] **Step 2:** `cd api && node --test src/services/passwords.test.js`. Expected: FAIL (modulo mancante).
- [ ] **Step 3: implementa `passwords.js`** come da Spec §4. SHA-1 con `crypto.createHash('sha1')`, in hex maiuscolo. Righe divise su `/\r?\n/`. Il `console.warn` è `'[passwords] breach check unavailable:'` più `'timeout'`, `'network'` o `'status <n>'`. È l'unico `bcrypt.hash` del file: `bcrypt.hash(password, 12)`.
- [ ] **Step 4:** stesso comando. Expected: PASS.
- [ ] **Step 5: commit** `feat(auth): passwords service — single hash point, HIBP fail-open`.

### Task 3: route, `create-admin.js`, fixture e test d'integrazione

**Files:**
- Modify: `api/src/routes/auth.js:464-489` (`/activate`), `:540-570` (`/reset-password`), `:572-600` (`/change-password`)
- Modify: `api/src/create-admin.js:42-60`
- Modify: `docker-compose.yml:72`, `:74`; `test-api.js:11`, `:13`, `:21`, `:27`, `:245`, `:489`, `:5361`
- Modify: `scripts/run-tests.sh` (override, servizio `api`, `environment`)
- Test: `test-api.js` (nuova `testPasswordPolicy()`, registrata in `main()` dopo `testAuthTokens()`)

**Interfaces:**
- Consumes: `hashNewPassword` (Task 2).
- Produces: `400 { error, code: 'PASSWORD_RULE' }` sulle tre route; `create-admin.js` esce con 1 e `Password refused: <message>` su stderr.

- [ ] **Step 1: fixture.** I default di oggi violano la regola del contesto (`test`, `admin` sono token dell'email e del nome):
  - `TestAdmin123!` diventa `Quiet-Harbor-Lantern-42`, in `docker-compose.yml:72` e `test-api.js:11` e `:21`;
  - `TestSysAdmin123!` diventa `Silver-Orchard-Compass-87`, in `:74`, `:13` e `:27`;
  - `TS_PASS` (`:245`) diventa `'Velvet-Meadow-58'` (non contiene `step`, che è il cognome dei suoi utenti);
  - `'ResetPass123!'` (`:489`) diventa `'Copper-Willow-Night-19'`;
  - `PASS` di `testAuthTokens` (`:5361`) diventa `'Amber-Canyon-Ledger-9'`.
- [ ] **Step 2: override di `scripts/run-tests.sh`.** Aggiungi `PASSWORD_BREACH_CHECK: "off"` sotto `api: environment:`, dopo `SMTP_PORT`.
- [ ] **Step 3: scrivi `testPasswordPolicy()`** in `test-api.js` (`section('Password policy')`). I casi:
  - `PP-01` activate. Inserisci via `sql` un utente `pending` con email `__pp_mario.rossi_<stamp>@pdash.local`, `first_name 'Mario'`, `last_name 'Rossi'` e `invite_token_hash = sha256(tok)` scadente fra un'ora; ogni utente creato va in `later('DELETE', …)`.
    - `'k7#wq9vz!m2'` (11) → 400 `PASSWORD_RULE`;
    - `'Rossi-k7#wq9vz'` → 400 `PASSWORD_RULE`;
    - la voce comune → 400 `PASSWORD_RULE`;
    - 65 caratteri (`'k7wq9vzm2pqx'.repeat(6).slice(0, 65)`) → 400 `PASSWORD_RULE`;
    - poi `'k7wq9vzm2pqx'` (12, solo minuscole e cifre) → 200.
  - `PP-02` reset-password. Usa un utente di `makeTsUser('pp')` (nome `Two`, cognome `Step`) con `reset_token_hash` impostato come in TS-21. Stessi cinque casi, ma il caso del contesto usa un token di questo utente: `'Step-k7#wq9vzq'`. L'ultimo caso → 200.
  - `PP-03` change-password. Stesso utente, sessione da `loginWithCode`; gli stessi casi di `PP-02` su `newPassword`, ultimo → 200. Ogni 200 su change-password riemette il cookie: riportalo avanti come a `:763-766`.
  - `PP-04`: `newPassword: 123456789012345` (numero) → 400, non 500.
  - La voce comune si legge da `/app/src/lib/data/common-passwords.txt`: è la prima riga non `#` con almeno 4 caratteri distinti che non contenga `mario`, `rossi`, `test`, `step` o `pdash`.
- [ ] **Step 4:** `scripts/run-tests.sh`. Expected: FAIL su `PP-01..PP-04`, perché le route accettano ancora 11 caratteri, e nessun altro fallimento nuovo.
- [ ] **Step 5: route.**
  - `/activate` e `/reset-password`: rimuovi `length < 8`; la SELECT del token legge `id, email, first_name, last_name`; dopo il 410, `const r = await hashNewPassword(password, { email, firstName: first_name, lastName: last_name })`; con `r.error`, rispondi `res.status(400).json({ error: r.error, code: 'PASSWORD_RULE' })`; l'`UPDATE` usa `r.hash`.
  - `/change-password`: `if (!isStr(currentPassword) || !isStr(newPassword) || !currentPassword || !newPassword)` → `All fields required`; rimuovi `length < 8`; la SELECT legge `password_hash, email, first_name, last_name`; `hashNewPassword` dopo la verifica della password attuale.
  - Rimuovi `require('bcryptjs')` da `auth.js` solo se non resta un altro uso (`bcrypt.compare` resta: quindi resta).
- [ ] **Step 6: `create-admin.js`.** Sostituisci `bcrypt.hash(password, 12)` con `hashNewPassword(password, { email: normalized, firstName, lastName }, { breachCheck: false })`. Con `error`: `console.error('Password refused: ' + error)`, `process.exit(1)`, prima di qualsiasi query. Il calcolo di `normalized` va spostato prima, se serve.
- [ ] **Step 7:** `scripts/run-tests.sh`. Expected: tutto verde, `PP-01..PP-04` compresi; anche i test backend unitari che lo script esegue.
- [ ] **Step 8:** `cd api && node src/create-admin.js x@y.z short` con `DATABASE_URL` assente. Expected: `Password refused: Use at least 12 characters.` ed exit 1, senza errori di connessione (il rifiuto avviene prima del DB).
- [ ] **Step 9: commit** `feat(auth): PASSWORD_RULE on activate, reset and change-password; create-admin applies the rule`.

### Task 4: gemello browser e parità

**Files:**
- Create: `js/lib/password-policy.js`
- Create: `js/lib/password-policy.test.js`

**Interfaces:**
- Consumes: le costanti e i casi del Task 1 (parità).
- Produces: export ES e ponte `window.` di `MIN_LENGTH`, `MAX_LENGTH`, `MAX_BYTES`, `MIN_DISTINCT`, `CONTEXT_MIN`, `contextTokens(context)`, `passwordError(password, context) → null | { message }` (controlli 1-5), `passwordStrength(password) → 0..4`, `STRENGTH_LABELS = ['', 'Too weak', 'Fair', 'Good', 'Strong']`, `PASSWORD_HINT = 'At least 12 characters. A longer passphrase is stronger.'`, `PASSWORD_PLACEHOLDER = 'At least 12 characters'`.

- [ ] **Step 1: scrivi i test** (vitest):
  - `parity: constants`: le cinque costanti sono uguali a quelle di `createRequire(import.meta.url)('../../api/src/lib/password-policy.js')`;
  - `parity: rules 1-5`: una tabella di almeno 12 casi (quelli del Task 1, esclusa la lista comune) dà lo stesso `message` (o `null`) nei due moduli;
  - `passwordStrength`: `''` → 0, `'k7#wq9vz!m2'` → 1, 12 → 2, 15 → 2, 16 → 3, 19 → 3, 20 → 4, `'abcabcabcabc'` → 1;
  - `no firstName`: `passwordError('k7#wq9vz!m2pq', { email: 'a@b.c', firstName: '' })` → `null`.
- [ ] **Step 2:** `npx vitest run js/lib/password-policy.test.js`. Expected: FAIL (modulo mancante).
- [ ] **Step 3: implementa il modulo.** Le regole 1-5 sono la stessa logica del Task 1, senza `common`. Ponte `if (typeof window !== 'undefined') { … }` come in `js/lib/profile-ui.js`.
- [ ] **Step 4:** stesso comando. Expected: PASS.
- [ ] **Step 5: commit** `feat(auth): browser twin of the password rule`.

### Task 5: pagine

**Files:**
- Modify: `activate.html:55`, `:92`; `js/pages/activate.js`
- Modify: `reset-password.html:50`, `:87`; `js/pages/reset-password.js`
- Modify: `profile.html:107`, `:118`, `:270-272`; `js/lib/profile-ui.js`; `js/pages/profile.js:24`, `:37-38`
- Test: `js/lib/profile-ui.test.js`

**Interfaces:**
- Consumes: il gemello del Task 4, via `window.*` nei page script e via `import … from './password-policy.js?v=1'` in `profile-ui.js`.
- Produces: `passwordFormState({ current, next, confirm }, context) → { mismatch, ruleError, canSubmit }` (`ruleError`: stringa o `''`).

- [ ] **Step 1: aggiorna `profile-ui.test.js`.**
  - Togli i test di `passwordStrength`.
  - `passwordFormState`:
    - `next: 'abcdefgh'` → `canSubmit: false` e `ruleError: 'Use at least 12 characters.'`;
    - `next = confirm = 'k7wq9vzm2pqx'` con `current: 'a'` → `{ mismatch: false, ruleError: '', canSubmit: true }`;
    - `next: 'Rossi-k7#wq9vz'` con contesto `{ lastName: 'Rossi' }` → `canSubmit: false`;
    - `next` vuoto → `ruleError: ''`.
- [ ] **Step 2:** `npx vitest run js/lib/profile-ui.test.js`. Expected: FAIL.
- [ ] **Step 3: `profile-ui.js`.** Rimuovi `passwordStrength` (export e ponte). `passwordFormState` riceve il secondo parametro `context` e usa `passwordError` importato. Aggiorna `?v` di `profile-ui.js` (5 → 6) in `profile.html`.
- [ ] **Step 4: `profile.html` e `profile.js`.**
  - Prima di `profile-ui.js` aggiungi `<script type="module" src="js/lib/password-policy.js?v=1"></script>`.
  - In `profile.js`:
    - `strength()` diventa `passwordStrength(this.pw.next)`, letto dal ponte del gemello;
    - `pwState()` passa `{ email: this.user?.email, firstName: this.user?.first_name, lastName: this.user?.last_name }`;
    - espone `hint`/`placeholder` dal gemello.
  - In `profile.html`:
    - `:107` diventa `:placeholder="placeholder"`;
    - `:118` diventa `{{ hint }}`;
    - sotto il campo New password compare `<div v-if="pwState.ruleError" class="mp-field-error" role="alert">{{ pwState.ruleError }}</div>`.
  - `profile.js` passa a `?v=2`.
- [ ] **Step 5: `activate` e `reset-password`.**
  - Nelle due pagine aggiungi `<script type="module" src="js/lib/password-policy.js?v=1"></script>` prima dello script della pagina.
  - Nei due `js/pages/*.js`:
    - rimuovi `checkStrength`, il dato `strength` e `@input="checkStrength"`;
    - aggiungi i computed `strength` (`passwordStrength`), `strengthLabel` (`STRENGTH_LABELS`) e `ruleError` (`password ? passwordError(password, ctx)?.message || '' : ''`), dove `ctx` è `{ email: user.email, firstName: user.firstName }` su activate e `{}` su reset;
    - `canSubmit` diventa `!this.ruleError && !!this.password && this.password === this.confirm`;
    - aggiungi il computed `placeholder`.
  - Nell'HTML: `:placeholder="placeholder"` e, sotto la barra, `<div v-if="ruleError" class="invalid-feedback d-block" role="alert">{{ ruleError }}</div>`, cioè la stessa classe di "Passwords do not match." (nessun colore scritto a mano).
  - Le due pagine passano a `?v=2`.
- [ ] **Step 6:** `npm test`. Expected: tutto verde, `page-source`, `security-headers-guard`, `cdn-integrity-guard` e `nginx-serve` compresi.
- [ ] **Step 7: verifica visiva.**
  - `scripts/test-branch.sh up`, poi `scripts/shoot.mjs` (vedi `docs/scripts/shoot.md`) su `/activate.html?token=<token valido>`, `/reset-password.html?token=<token valido>` e `/profile.html#password`, a 1440, 1024 e 390 px, con password digitata `abc` e `k7wq9vzm2pqx`.
  - **Rileggi i PNG**: placeholder `At least 12 characters`, barra a 1 segmento con l'errore visibile, poi a 2 segmenti con `Fair`, nessun salto di layout del campo di conferma.
  - Lascia lo stack su: lo spegne `/finish-cycle`.
- [ ] **Step 8: commit** `feat(auth): activate, reset and profile read the password rule from the twin`.

### Task 6: guard

**Files:**
- Create: `scripts/password-policy-guard.test.js`

**Interfaces:**
- Consumes: lo stato prodotto dai Task 2-5.

- [ ] **Step 1: scrivi il guard** (vitest; walk sul modello di `js/lib/money-guard.test.js`, stessi `SKIP_DIRS`). Header con il limite dichiarato della Spec §9. I test sono:
  1. `bcrypt.hash( only in services/passwords.js`: file sotto `api/src`, `.js`, test esclusi, che contengono `bcrypt.hash(` → `['api/src/services/passwords.js']`;
  2. `services/passwords.js requires ../lib/password-policy`;
  3. `every page with a new-password field loads the twin`: per ogni `*.html` della radice con `autocomplete="new-password"`, il testo come servito (`rawReadFileSync`, vedi `scripts/lib/page-source.setup.mjs`) contiene `src="js/lib/password-policy.js?v=`;
  4. `no rule rewritten by hand`: nelle pagine del punto 3, nei loro `js/pages/<page>.js` e in `js/lib/profile-ui.js`, nessuna occorrenza di `checkStrength` né di `/\b\d+ characters\b/`.
- [ ] **Step 2:** `npx vitest run scripts/password-policy-guard.test.js`. Expected: PASS.
- [ ] **Step 3: prova che morde.** Aggiungi temporaneamente `bcrypt.hash('x', 4)` in `api/src/create-admin.js` e `placeholder="Min. 8 characters"` in `reset-password.html`, poi lancia il guard. Expected: FAIL sui punti 1 e 4. Annulla con `git checkout -- api/src/create-admin.js reset-password.html`.
- [ ] **Step 4: commit** `test(auth): password policy guard`.

### Task 7: documentazione e help

**Files:**
- Modify: `handbook/public/manual.md:29`, `:34` (e `:683` se cambia)
- Modify: `handbook/restricted/TEST_CASES.md` (A-16, GD-10, righe nuove A-36..A-38)
- Modify: `handbook/restricted/ARCHITECTURE.md` (§4.1, §4.3, §4.4, righe `:894`, `:897`, `:898`, albero `:1221`)
- Modify: `handbook/restricted/production-checklist.md`
- Modify: `docs/js/lib.md:326` e voce nuova; `docs/api/lib.md` (voce nuova); `docs/api/services.md` (voce nuova); `docs/pages/profile.md:10`; `docs/scripts/run-tests.md`
- Modify: `CLAUDE.md` (sezione `### Passwords` dopo `### Dates`; l'elenco `api/src/services/` del File structure aggiunge `passwords`)

- [ ] **Step 1: scrivi i testi.**
  - `manual.md:29`: la frase sugli 8 caratteri diventa "A password needs at least 12 characters and must not contain your name or email, or be a common password or one that has appeared in a data breach." `:34` descrive l'indicatore Too weak / Fair / Good / Strong, che cresce con la lunghezza, e il pulsante, abilitato quando la regola è rispettata e la conferma coincide.
  - `TEST_CASES.md`:
    - A-16 con i nuovi livelli (input `abc`, `k7wq9vzm2pqx`, 16 e 20 caratteri);
    - GD-10 con i nuovi livelli e l'errore sotto il campo;
    - A-36: rifiuto per nome o email (`PP-01..PP-03`, ✓);
    - A-37: password comune (`PP-01..PP-03`, ✓);
    - A-38: password comparsa in un breach, manuale con HIBP attivo sul branch stack.
  - `ARCHITECTURE.md`:
    - nelle sequenze, una riga `API->>API: password rule + breach check (services/passwords.js)` prima dell'update del DB;
    - le tre righe della tabella delle route aggiungono `400 PASSWORD_RULE`;
    - nell'albero, `passwords` in `services/`.
  - `production-checklist.md`: un punto sull'uscita HTTPS verso `api.pwnedpasswords.com`, con il controllo `docker logs pdash-api 2>&1 | grep "breach check unavailable"`; esito negativo: qualsiasi riga.
  - `docs/`: le voci dei due moduli e del servizio, `profile-ui.js` senza `passwordStrength`, `profile.md:10` senza "8 characters", `run-tests.md` con `PASSWORD_BREACH_CHECK=off`.
  - `CLAUDE.md`, sezione `### Passwords`, tre punti:
    - la regola vive in `api/src/lib/password-policy.js` e nel suo gemello `js/lib/password-policy.js`;
    - ogni hash di una password passa da `hashNewPassword` (`api/src/services/passwords.js`);
    - nessuna pagina riscrive la regola.

    Più il rimando a `scripts/password-policy-guard.test.js`. Niente valori numerici in prosa (CLAUDE.md, "Writing documentation").
- [ ] **Step 2:** `npm test`. Expected: tutto verde, `claude-md-guard`, `doc-paths-guard`, `handbook-guard` e `architecture-guard` compresi.
- [ ] **Step 3:** sul branch stack, apri `/help.html?doc=manual`, `?doc=test-cases` e `?doc=architecture` con shoot.mjs e **rileggi i PNG**: i testi nuovi sono visibili e il diagramma Mermaid di §4 si disegna.
- [ ] **Step 4: commit** `docs: password policy in manual, test cases, architecture, checklist and docs`.

## Decisioni aperte

1. **Le password di default del profilo `test` e le fixture di `test-api.js` cambiano** (`Quiet-Harbor-Lantern-42`, `Silver-Orchard-Compass-87`, …). Alternativa scartata: una deroga della regola del contesto per `create-admin.js`. Perché: i default di oggi contengono `test` e `admin`, token della loro stessa email e del loro nome. La Spec (§6) pretendeva che passassero, e non passano. Una deroga ridurrebbe la regola proprio sugli account privilegiati.
2. **Il controllo 4 del guard copre solo le pagine con `new-password`, i loro page script e `profile-ui.js`.** Alternativa scartata: tutte le pagine, `js/pages/` e `js/lib/`, come diceva la Spec §9. Perché: `\d+ characters` compare legittimamente altrove (limiti di altri campi), e un guard che sbaglia su file estranei va disattivato.
3. **Esecuzione nativa.** Alternativa scartata: subagent-driven. Perché: i task non sono indipendenti (PROCESS.md §6.1, "Il Piano deve dire se i task sono indipendenti").
