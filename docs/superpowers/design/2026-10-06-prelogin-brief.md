# Brief per Claude Code — Pagina 2: Login & Password Recovery (restyling)

> Brief ricevuto dall'utente il 2026-10-06 (sostituisce una prima versione del 2026-10-05, scartata). Input del ciclo pre-login; le affermazioni sul codice sono state verificate in `/brainstorming` — vedi la Spec `docs/superpowers/specs/2026-10-06-prelogin-restyling-design.md`.

Immagini allegate: `PreLogin/2.1-signin.png`, `PreLogin/2.2-forgot.png`, `PreLogin/2.3-reset.png`.

## 0. Cosa è e cosa NON è questo intervento

È un **restyling visivo** di pagine che esistono già e funzionano. Non si cambiano route, chiamate API, stati Vue, flussi né l'organizzazione dei file.

| Tavola | File esistente | Stato Vue |
|---|---|---|
| 2.1 Sign In | `login.html` | `view === 'login'` |
| 2.2 Forgot password | `login.html` (stessa pagina) | `view === 'forgot'` |
| 2.3 Reset Password | `reset-password.html` | `state === 'form'` (+ `loading` / `invalid` / `success`) |

Vincoli dal `CLAUDE.md` del repo, da rispettare:
- Nessun build step. Vue 3 da CDN e Bootstrap 5.3 da CDN **restano**.
- Nessun hex hardcoded in CSS/JS: solo `var(--token)` da `css/tokens.css`.
- Ogni file CSS/JS versionato ha `?v=N`. Se lo modifichi, aggiorna tutte le occorrenze.
- `v-cloak` resta sul root `#app`.
- Segui il workflow di `docs/superpowers/PROCESS.md` e chiudi con `/finish-cycle`.

## 1. Problema strutturale da risolvere (il punto chiave)

`login.html`, `reset-password.html` e `activate.html` hanno oggi **lo stesso blocco `<style>` inline copiato tre volte**: `.auth-card`, `.brand-name`, `.form-label`, `.form-control`, `.btn-primary`, `.strength-bar`. Caricano solo Bootstrap + `tokens.css`, **non** `style.css`.

Proposta, in linea con il precedente di `css/admin-crud.css` (estratto nel 2026-09 per lo stesso motivo):
- Creare **`css/auth.css?v=1`**, il foglio condiviso delle pagine pubbliche di autenticazione.
- Caricarlo in `login.html`, `reset-password.html` e `activate.html`, dopo `tokens.css`.
- Rimuovere i blocchi `<style>` inline duplicati.
- Le pagine restano separate. Si cambiano solo classi e markup di presentazione dentro i template esistenti.
- `terms.html` è fuori scope: ha un layout diverso.
- Valutare se aggiungere `auth.css` a `js/lib/foundations-guard.test.js` (il check che le versioni `?v=N` coincidano).
- Aggiornare in `CLAUDE.md` la riga `css/` della sezione "File structure".

`activate.html` non ha una tavola, ma è lo stesso componente di 2.3 (card, logo, barra di forza). Deve ereditare lo stesso stile, altrimenti diventa l'unica pagina disallineata.

**Nessun nuovo token.** I valori delle tavole si mappano su token esistenti (§2). Così `tokens.css` non cambia e non serve aggiornare la sua versione sulle 18 pagine.

## 2. Mappatura tavola → token esistenti

| Elemento | Valore tavola | Token da usare |
|---|---|---|
| Sfondo pagina, testo input, titoli | #0B1840 | `--brand-navy` |
| Bottone primario | #F0287A | `--brand-magenta` / `-hover` / `-active` |
| Bordo input | #DDE1E8 | `--border-light` (#e5e7eb) |
| Label, sottotitoli, link | #6B7280 | `--text-muted` |
| Placeholder, sottotitolo logo | #9AA0AC | `--border-dark` (#9ca3af) |
| Focus input | — | `--brand-magenta` + `0 0 0 3px var(--focus-ring)` (invariato) |
| Errore | rosso | `--color-danger` / `--color-danger-bg` / `--color-danger-text` |
| Successo | verde | `--color-success` / `-bg` / `-text` |
| Barra forza: Weak / Fair / Good / Strong | rosso / ambra / verde | `--color-danger` / `--brand-gold` / `--color-success` / `--color-success` |
| Radius card / input | 16px / 8px | `--radius-lg` (12) o 16px letterale / `--radius-md` |
| Font | system | `--font-family-base` |

Nota: 16px non è un token. O si accetta `--radius-lg` (12px, differenza minima) o si usa un letterale documentato. Decidete voi, ma motivate la scelta.

## 3. Componenti in `auth.css`

- **Body**: navy, centrato, `min-height:100vh`. È già così: va spostato da inline ad `auth.css`.
- **Stack**: nuovo wrapper `.auth-stack`, colonna con gap 22px: card + copyright.
- **`.auth-card`**: bianca, padding 40px 38px, ombra `0 20px 50px rgba(0,0,0,.30)`, `max-width` 400px (login) / 420px (reset, activate). Le larghezze sono già queste.
- **Logo**: sostituisce l'attuale `.brand-name` (testo "PDash" da 3.2rem).
  - Riquadro 34×34, radius 9px, sfondo navy, bordo inferiore 3px magenta, "P" magenta 17px/800.
  - "Dash" 24px/800 navy.
  - Sotto, "PROJECT DASHBOARD" 10.5px/700, uppercase, letter-spacing .08em.
  - Il blocco va aggiornato nei 3 file. È markup duplicato, quindi la stessa modifica in tutti.
- **`.form-label`**: 11px/700, uppercase, letter-spacing .04em, `--text-muted` (oggi è 0.82rem/600 #374151).
- **`.form-control`**: radius 8px, padding 10px 13px, 13.5px, testo navy, placeholder `--border-dark`.
- **`.btn-primary`**: invariato nei colori. Padding 12px, radius 8px, 13.5px/700.
- **`.link-muted`**: 12px/600, hover magenta (esiste già, ritoccare le misure).
- **Titolo vista**: le `h6.fw-bold` diventano 15px/800 navy. Sottotitolo 12.5px muted, line-height 1.5.
- **Alert**: `.alert-danger` e `.alert-success` restano classi Bootstrap, ristilizzate con i token. `style.css` lo fa già con le variabili `--bs-alert-*`, ma queste pagine non lo caricano: replicare solo quelle regole in `auth.css`.
- **Spinner**: magenta come in `style.css`. Stesso motivo dell'alert.
- **Barra di forza**: 4 segmenti alti 4px, gap 4px, segmento vuoto `--border-light`.
  - Oggi i colori sono hex dentro il computed `strengthColor` (viola la regola token).
  - Sostituire con classi `.strength-1` … `.strength-4` in `auth.css`.
  - Il computed restituisce il nome della classe. Stessa modifica in `activate.html`.
  - La logica di `checkStrength()` resta invariata.
- **Copyright**: nuovo elemento sotto la card, "© {{ year }} PDash", 11px, `rgba(255,255,255,.45)`.

## 4. Tavola 2.1 — Sign In (`login.html`, view `login`)

Struttura invariata: Email → riga "Password / Forgot password?" → Password → bottone **Sign in**. Cambia solo lo stile.

Spaziature: 16px dopo Email, 24px prima del bottone.

L'alert d'errore resta dov'è (sopra i campi) con lo stile di §3.

## 5. Tavola 2.2 — Forgot password (`login.html`, view `forgot`)

Struttura invariata: "← Back to sign in" → titolo "Reset your password" → sottotitolo → Email → **Send reset link**. Lo stato di conferma esiste già e va mantenuto: alert success con campo e bottone disabilitati.

Unica aggiunta di logica, opzionale: in `switchToForgot()`, `this.forgotEmail ||= this.email`, per precompilare l'email già digitata.

## 6. Tavola 2.3 — Reset Password (`reset-password.html`)

`state === 'form'`: struttura invariata, si applica la barra di forza di §3.

Gli stati non disegnati esistono già: vanno solo allineati.
- `loading`: spinner magenta + "Validating link…".
- `invalid` e `success`: oggi usano le emoji ⚠️ e ✅.
  - Sostituirle con icone SVG inline 28–32px, `stroke="currentColor"`: warning in `--color-danger`, check in `--color-success`. Regola di progetto: mai emoji.
  - Titoli e testi con lo stile di §3.
  - "Request a new link" / "Go to sign in" a larghezza piena come il bottone primario, non `btn-sm`.

`activate.html`: stessi stati. Anche lì le emoji ✉️ ⚠️ ✅ diventano SVG. Il `btn-outline-secondary` dello stato invalid diventa `.link-muted` o un bottone secondario navy (un solo magenta per vista).

## 7. Responsive

- Tablet 1024×768: nessuna differenza.
- Smartphone 390×844, media query in `auth.css`:
  - Card `width: calc(100% - 32px)`, padding 28px 22px.
  - Input a 16px, per evitare lo zoom di iOS.

## 8. Fuori scope

- Logica, endpoint, messaggi di errore lato API.
- `terms.html`, `nav.js`, `style.css`, `tokens.css`.
- Rimuovere Bootstrap dalle pagine auth (resta la base della griglia e degli alert).

## 9. Checklist

- [ ] `css/auth.css?v=1` creato e caricato dalle 3 pagine. Nessun `<style>` duplicato rimasto.
- [ ] Nessun hex nuovo in CSS/JS (barra di forza inclusa).
- [ ] Nessuna emoji nelle pagine auth.
- [ ] Logo nuovo identico nelle 3 pagine.
- [ ] Tutti gli stati verificati: login (errore, loading), forgot (errore, conferma), reset e activate (loading, invalid, form, mismatch, success).
- [ ] Verifica a 1440, 1024 e 390px.
- [ ] `CLAUDE.md` aggiornato (file structure). Test `foundations-guard` aggiornato o motivato.
