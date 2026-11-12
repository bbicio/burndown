# Manuale utente in `handbook/public/manual.md` — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** `docs/superpowers/briefs/2026-11-13-user-manual-brief.md`
**Scenario:** 2 (evoluzione)

Il segnaposto `handbook/public/manual.md` diventa il manuale d'uso completo: il contenuto di `docs/OPERATIONAL_MANUAL.html` migrato in Markdown, riletto contro il PRD e il codice, senza screenshot. L'HTML esce dal repo; la skill `operational-manual` e `/sync-docs` passano al Markdown. Nessuna modifica a `help.html`, ai guard, a nginx.

## 1. Fatti verificati (a `b4fabf7`, più il Brief)

- `handbook/public/manual.md` è il segnaposto di una riga; `handbook/manifest.json` lo elenca come documento `manual`, `audience: public`, `renderer: markdown`.
- `help.html` rende il Markdown con `marked.parse(text)` (line 282) dentro `v-html` (line 68), senza sanificazione: l'HTML grezzo, `<details>` compreso, arriva alla pagina. `marked@15.0.12` (line 148) non genera id per i titoli: un link interno `#sezione` non ha un bersaglio.
- `docs/OPERATIONAL_MANUAL.html`: testo visibile e peso del base64 si misurano con lo script del brief; contiene `<details>` e tabelle da portare; ultima rigenerazione `2fb1ea1`; gli screenshot sono nella storia (`67f5c7d`, `2fb1ea1`).
- Nessuna occorrenza di «AI Chat» o di una sidebar AI in `js/*.js` o nelle pagine HTML: il capitolo «AI Sidebar» descrive una funzione che non c'è. L'assistente reale è il Team assistant di `planning.html` (`docs/prd/planning.md`, `docs/prd/notifications.md`). `settings.html` non esiste (B-361).
- La skill `operational-manual` scrive `docs/OPERATIONAL_MANUAL.html` e porta il «PDash detail-content reference» (SKILL.md line 66 in poi), che rispecchia `docs/prd/`; `/sync-docs` §5b lo riconcilia (line 82-83) e §5c prevede il passo «manuale» su `handbook/public/manual.md`.
- Riferimenti vivi all'HTML fuori da `docs/superpowers/`: `scripts/classify-cycle.mjs` line 23, `scripts/classify-cycle.test.js` lines 124-128, `scripts/doc-paths-guard.test.js` lines 56-58, `docs/BACKLOG.md` (B-361), `docs/handoff-ciclo4.md` line 55.

## 2. Design

### 2.1 Il file

Un solo `handbook/public/manual.md`, in inglese, organizzato per area come il menu. Apre con un titolo e un paragrafo su cosa è il manuale e a chi serve; poi un capitolo `##` per area, `###` per le funzioni. Ogni punto ha una descrizione breve; l'approfondimento va in `<details><summary>Details</summary>` con una riga vuota dopo `<summary>` e dopo `</details>`, perché `marked` interpreti il Markdown dentro. Le tabelle dei controlli sono tabelle Markdown. Nessun indice con link interni, nessuna immagine, nessun diagramma richiesto.

Le funzioni riservate sono marcate nel titolo con «(admin)». Un utente non admin legge lo stesso file: sa che cosa gli altri possono fare, e non vede una funzione come se fosse sua.

### 2.2 Mappa capitoli

| Capitolo | Pagine (tabella Pages di `CLAUDE.md`) | Fonte nel PRD |
|---|---|---|
| Getting started | `login.html`, `terms.html`, `help.html`, la navigazione di `js/nav.js` | `PRD.md` §1-§3, `docs/prd/access.md` |
| Pipeline e offerte | `pipeline.html`, `costgrid.html` | `docs/prd/pipeline.md` |
| Resource planning e Team assistant | `planning.html` | `docs/prd/planning.md`, `docs/prd/notifications.md` |
| Project reporting | `portfolio.html`, `program.html` | `docs/prd/reporting.md` |
| Project configuration | `project-config.html` | `docs/prd/project-config.md` |
| Timesheet upload | `timesheets.html` | `docs/prd/timesheets.md` |
| Master Data (admin) | `master-clients.html`, `master-pipelines.html`, `master-roles.html`, `master-currencies.html` | `docs/prd/master-data.md` |
| Team e Attribute lists (admin) | `team.html`, `attribute-lists.html` | `docs/prd/administration.md` |
| User administration (admin) | `admin.html` | `docs/prd/administration.md` |
| Account, privacy e condivisione | `profile.html`, `privacy-notice.html`, la condivisione di `js/shares.js`, il pannello notifiche | `docs/prd/access.md`, `docs/prd/notifications.md` |

Pagine volutamente senza capitolo: `_db-reset.html` e `_terms-editor.html` (solo sysadmin), `profile-jobs.html` (pagina nascosta, senza voce di menu), `activate.html` e `reset-password.html` (percorsi di posta, trattati in Getting started).

### 2.3 Come si scrive e si controlla un capitolo

Si parte dal capitolo corrispondente dell'HTML. Per ogni frase si apre il file del PRD della riga e, dove il PRD è incerto, la pagina e `docs/pages/<pagina>.md`; si corregge, aggiunge o toglie. Un capitolo non cita il codice (è per utenti), ma la spec del piano tiene per ciascuno la riga della tabella sopra con l'esito della verifica.

### 2.4 Processo

- **`docs/OPERATIONAL_MANUAL.html`** esce con `git rm`; i riferimenti vivi del §1 si aggiornano (il commento e il fixture di `classify-cycle` non citano più un file che non esiste; `doc-paths-guard` e `handoff-ciclo4.md` seguono ciò che il guard chiede); B-361 si chiude.
- **Skill `operational-manual`:** produce `handbook/public/manual.md`; la parte sugli screenshot e sul singolo HTML autonomo sparisce; il «PDash detail-content reference» sparisce (la fonte è `PRD.md` + `docs/prd/` + il codice).
- **`/sync-docs`:** §5b sparisce; §5c «User manual» è l'unico passo sul manuale e rimanda alla skill.

## 3. Fuori ambito

Come nel Brief: immagini (B-459, B-460, B-461), B-463 e B-464, modifiche a `help.html`/`js/lib/handbook.js`/guard/nginx, nuove funzioni, documenti `restricted/`, traduzioni e PDF.

## Decisioni aperte

1. **Struttura per area, come il menu, in un solo file.** Alternativa scartata: un documento per area o per ruolo nel manifest. Perché: il manifest e il viewer restano invariati, e l'HTML migrato è già organizzato così.
2. **Nessun indice con link interni.** Alternativa scartata: aggiungere a `help.html` l'estensione per gli id dei titoli. Perché: `marked@15` non genera id e il viewer è fuori scope.
3. **`<details>` grezzo per l'approfondimento di ogni punto.** Alternativa scartata: solo titoli e paragrafi. Perché: è la forma dell'HTML attuale e `v-html` lo lascia passare.
4. **Eliminati Settings, AI Sidebar e Changelog; il Team assistant va sotto Planning.** Alternativa scartata: tenere il Changelog. Perché: il manuale descrive il comportamento attuale e la storia sta in git e nei report.
5. **Le funzioni per admin restano nel manuale pubblico, marcate «(admin)».** Alternativa scartata: una guida admin separata in `handbook/restricted/`. Perché: l'HTML già le conteneva e un utente deve sapere chi può fare cosa.
6. **La skill resta ma senza il riferimento duplicato del PRD.** Alternativa scartata: tenere il riferimento. Perché: sarebbe una terza copia del PRD.
7. **`/sync-docs` §5b eliminato.** Alternativa scartata: tenerlo e farlo riconciliare col manuale. Perché: senza il riferimento non c'è nulla da riconciliare.
8. **L'HTML è cancellato dal repo; gli screenshot restano solo nella storia.** Alternativa scartata: archiviarlo fuori da `docs/`. Perché: due manuali che divergono sono il difetto che il ciclo chiude.

## Criteri di accettazione

1. **Segnaposto sostituito** — `handbook/public/manual.md` non contiene più «will be moved here» e ha un capitolo per ogni riga della mappa del §2.2.
2. **Nessuna funzione inesistente** — `grep -n -i "AI Sidebar\|AI Chat" handbook/public/manual.md` non trova niente; «Settings» compare solo se la verifica lo giustifica; ogni capitolo ha nel piano la riga di verifica contro il PRD.
3. **Pagine nuove coperte** — Team, Attribute lists, My profile, Privacy Notice, Master Data e il viewer Help hanno una sezione.
4. **Il viewer lo mostra** — `help.html?doc=manual`, aperto come utente non admin, si carica e i `<details>` si aprono; `npx vitest run scripts/handbook-guard.test.js` è verde.
5. **Niente immagini** — `grep -c "\.png" handbook/public/manual.md` stampa 0.
6. **HTML ritirato** — `git ls-files docs/OPERATIONAL_MANUAL.html` è vuoto e `git grep -l OPERATIONAL_MANUAL -- ':!docs/superpowers'` non elenca un riferimento a un file inesistente; `scripts/doc-paths-guard.test.js` è verde.
7. **Processo allineato** — la skill `operational-manual` e `/sync-docs` nominano `handbook/public/manual.md`, non parlano di screenshot né dell'HTML, e `/sync-docs` non ha più §5b.
8. **Suite verde** — `npm test`.
