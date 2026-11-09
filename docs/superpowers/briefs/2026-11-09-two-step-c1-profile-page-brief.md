# Brief — two-step, ciclo 1: la pagina My profile

**Tipo:** nuova feature con evoluzione di una esistente (Scenario 2): i modal My Profile e Change password diventano una pagina. Scomposizione confermata dall'utente il 2026-11-09.
**Origine:** brief di prodotto `docs/superpowers/design/two-factor/redesign/2026-11-09-two-factor-brief.md` e brief UI `docs/superpowers/design/two-factor/redesign/brief-two-step-claude-code.md` (§3, §4, §5, §11 Privacy & data, §12, §13), tavole nella stessa cartella.
**Sequenza concordata:** ciclo 1 (questo) → ciclo 2 secondo passo via email (`2026-11-09-two-step-c2-email-code-brief.md`). L'authenticator app è rimandato a un ciclo futuro.

## Problema

Il profilo dell'utente vive in due modal iniettati da `js/nav.js` (`#navProfileModal`, `#navChangePwdModal`). Il ciclo 2 deve aggiungere al profilo le sezioni Two-step verification e Trusted devices, e un modal non ha posto per loro. Serve una pagina `profile.html` con una sotto-navigazione che possa crescere.

## Comportamento attuale

- `js/nav.js` inietta i due modal e ne gestisce gli eventi. `js/lib/nav-behavior.test.js` controlla quei due id.
- `PATCH /api/auth/profile` (`api/src/routes/auth.js`) accetta `firstName`, `lastName` **ed `email`**: l'utente può cambiarsi l'email da solo.
- `PATCH /api/users/:id` (`api/src/routes/users.js`) accetta solo `role` e `status`. Nessun admin può cambiare l'email di un utente dalla UI.
- `POST /api/auth/change-password` controlla la password attuale e la lunghezza minima di 8. Non revoca nulla: il JWT è senza stato.
- `users` ha `created_at` (member since) e `terms_accepted_at`. Non ha una data di ultimo cambio password.
- Non esiste un endpoint che esponga al client delle variabili d'ambiente: il "config endpoint" del brief UI §11 non c'è.

## Comportamento atteso

- `profile.html` nello shell standard, con `.ph`, la sotto-navigazione Master Data e l'hash per sezione, come nel brief UI §3–§4 e §12–§13.
- **ACCOUNT:** Details (15a) e Password (15b). **PRIVACY:** Privacy & data (15k) senza le parti ⚠.
- Le voci SECURITY e PREFERENCES non compaiono finché non esistono (vedi Scope escluso).
- Il menu account apre `profile.html` e `profile.html#password`. I due modal e i loro handler spariscono.
- L'email è in sola lettura sulla pagina, e il server rifiuta il cambio self-service.

## Decisioni per il brainstorming

1. **Chi cambia un'email, se non l'utente.** Le opzioni sono: un'azione admin in User Admin (`PATCH /api/users/:id` con `email`), oppure solo da DB/CLI. Dal ciclo 2 l'email diventa il secondo fattore, quindi cambiarla è un'azione sensibile.
2. **Contatto privacy.** Il brief UI chiede `PRIVACY_CONTACT_EMAIL`/`PRIVACY_CONTACT_NAME` esposte "through the existing config endpoint", che non esiste. Si può fare un endpoint nuovo, estendere `GET /api/auth/me`, oppure altro.
3. **"Last changed on {date}"** (⚠) e la nota "Updating your password signs you out…". Il default è ometterli: il primo richiede una colonna nuova, la seconda le sessioni lato server.

## Vincoli

- Pagina nuova: wrapper `#app-shell`, `.ph`, `js/lib/icons.js` prima di `nav.js`, `v-cloak` (guard `nav-shell-guard`, `page-head-guard`).
- Componenti del sito prima delle tavole (brief UI §0). Niente hex, solo token. Tutto il testo in inglese.
- Ogni file `js/*.js`/`css/*.css` toccato con riferimenti `?v=N` richiede di aggiornarli tutti.
- La sezione SECURITY va predisposta come gruppo vuoto della sotto-navigazione. Il ciclo 2 la riempie senza rifare la pagina.

## Criteri di accettazione

Da fissare nella Spec (§6b). Base di partenza: brief UI §14, righe 1, 2, 7 e 8, limitate alle sezioni di questo ciclo.

## Scope escluso esplicitamente

- Two-step verification, Trusted devices (ciclo 2).
- Sessions, Notifications, Download my data (⚠: backlog).
- Authenticator app, recovery code, reset da admin (ciclo futuro).

## Guardia sui finding nuovi

Un difetto nuovo scoperto durante il `/brainstorming` o l'esecuzione va isolato in `docs/BACKLOG.md` o in un Brief a sé, non corretto qui.
