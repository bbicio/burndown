# Brief — Handbook: diagrammi di architettura Mermaid in ARCHITECTURE.md

**Tipo:** nuova funzionalità (Scenario 1), confermato dall'utente il 2026-11-12 (l'handoff la indicava come Scenario 2).
**Origine:** `docs/superpowers/briefs/2026-11-12-handbook-diagrams-handoff.md`. Ordine deciso dall'utente il 2026-11-12: questo ciclo viene prima del manuale utente.

## Verifica dell'handoff contro il codice (2026-11-12)

| Affermazione dell'handoff | Esito | Prova |
|---|---|---|
| Nessun blocco `mermaid` in ARCHITECTURE.md | vera | `grep -c '```mermaid' handbook/restricted/ARCHITECTURE.md` → 0 |
| §4 ha sette flussi in testo con `→` | vera | `grep -n "^### 4\." handbook/restricted/ARCHITECTURE.md` (4.1-4.7) |
| §5 è a blocchi `sql` per area §5.1-§5.8 | vera; le 41 tabelle create dalle migrazioni sono tutte nominate in §5 | `grep -n "^### 5\." handbook/restricted/ARCHITECTURE.md`; confronto `CREATE TABLE` delle migrazioni vs §5 |
| `architecture-guard` verifica route, tabelle create, colonne aggiunte; non prosa né diagrammi | vera | header di `scripts/architecture-guard.test.js` |
| nginx: `/auth-check` per pagine e `handbook/`, `/admin-check` per `handbook/restricted/` | vera | `grep -n "auth_request" nginx.conf` |
| Servizi esterni SMTP e LLM | vera; l'LLM è l'API Anthropic | `grep -n "SMTP_\|ANTHROPIC_" docker-compose.yml` |
| `docProblems` controlla solo struttura e primo token fra `MERMAID_TYPES` | vera | `js/lib/handbook.js` `docProblems` |
| Un ciclo che tocca solo `.md` sotto `handbook/` è no-code | vera (`.md`/`.png` sotto `handbook/`, `manifest.json` escluso) | header di `scripts/classify-cycle.mjs` |
| `renderMermaid` non intercetta un errore di `mermaid.run` | **imprecisa**: `renderMermaid` no, ma il chiamante lo cattura (`try { await renderMermaid(...) } catch (e) { console.error(...) }`); nessun messaggio all'utente oltre al riquadro di errore di Mermaid | `grep -n "Mermaid could not render" help.html` |
| `css/help.css` non ha regole per i diagrammi | **falsa**: `.hb-body img, .hb-body svg { max-width: 100%; height: auto; }` e `.hb-body pre.mermaid { background; text-align: center }`; nessuna regola di scorrimento orizzontale per `pre.mermaid` oltre a quella di `.hb-body pre` | `grep -n "svg\|mermaid" css/help.css` |
| Stage di pipeline `SIP → Expected → Anticipated → Committed`, `Canceled` | **le frecce non esistono nel codice**: lo stage si sceglie liberamente; nessuna regola di transizione | nessun match per regole di transizione in `js/` e `api/src/`; valori in CLAUDE.md "Pipeline stage" |
| Status di progetto come macchina a stati | **non lo è**: `getStatusRule(pipeline)` è una mappa stage → valori ammessi (SIP e Canceled disabilitati) | `js/lib/status-rules.js` |
| B-452 aperta | confermata (`Verified how` rieseguito) | `grep -n "not a known diagram type" js/lib/handbook.js` |
| B-462 aperta | confermata: `flowchart-elk` in `MERMAID_TYPES`, nessun `layout-elk` in `help.html` | `grep -n "flowchart-elk" js/lib/handbook.js; grep -n "layout-elk" help.html` |

## Comportamento atteso

`handbook/restricted/ARCHITECTURE.md` contiene diagrammi Mermaid che `help.html?doc=architecture` disegna, per questi quattro soggetti (scelti dall'utente il 2026-11-12):
1. **Contesto/container**: browser → nginx → api → db; i due `auth_request` (`/auth-check` per le pagine e `handbook/`, `/admin-check` per `handbook/restricted/`); SMTP e API Anthropic come sistemi esterni.
2. **Flussi di §4 come `sequenceDiagram`**: almeno login con secondo passo via email e dispositivi fidati (§4.2), invito/attivazione (§4.1), accettazione T&C (§4.7).
3. **`erDiagram` delle tabelle di §5**, con perimetro da decidere.
4. **Stage di pipeline e status di progetto**, rappresentati come sono nel codice: stage senza transizioni imposte, status come valori ammessi per stage.

Ogni diagramma è vero rispetto al codice alla data del merge.

## Vincoli

- Nessun diagramma afferma qualcosa che il codice non fa: niente transizioni di stage inventate, niente status come macchina a stati.
- `docProblems` deve restare senza problemi su ARCHITECTURE.md (`scripts/handbook-guard.test.js`).
- Non usare `flowchart-elk` finché B-462 è aperta; non usare front matter YAML o `%%{init}%%` multi-riga finché B-452 è aperta (oppure chiuderle nel ciclo).
- Mermaid resta 11.4.1 da CDN con `securityLevel: 'strict'`.
- Se il ciclo tocca `help.html`, `css/help.css` o `js/lib/handbook.js`, non è più no-code e i `?v=N` vanno allineati (CLAUDE.md "Cache-busting").
- Regole di scrittura dei documenti di CLAUDE.md "Writing documentation" (niente conteggi in prosa, regola in un solo file).
- Lezioni del ciclo 1 nel Piano: ogni Edit/Write di un subagente usa il path assoluto del worktree; se un guard viene esteso, il Piano elenca i casi (entità presente, assente, rinominata, tabella creata poi eliminata) e un test per ciascuno; verifiche che dipendono da localStorage non si fanno su `:8081` con dati su `http://localhost`.

## Criteri di accettazione

1. `grep -c '```mermaid' handbook/restricted/ARCHITECTURE.md` ≥ il numero di diagrammi deciso in `/brainstorming`, uno almeno per ciascuno dei quattro soggetti.
2. `npm test` passa, incluso `scripts/handbook-guard.test.js` e `scripts/architecture-guard.test.js`.
3. Ogni diagramma è disegnato come SVG, senza riquadro di errore Mermaid, su `/help.html?doc=architecture` del branch stack, provato con `scripts/shoot.mjs` e PNG letti (desktop e < 1024px).
4. Ogni nodo/entità/messaggio dei diagrammi è verificato contro il codice, con il riferimento annotato nel Piano o nel report.
5. Il diagramma stage/status non contiene transizioni fra stage che il codice non impone e riporta per ogni stage i valori di `getStatusRule`.
6. Il meccanismo scelto in `/brainstorming` per tenere i diagrammi veri (guard esteso, diagrammi concettuali o deriva affidata a `/sync-docs`) è applicato e, se è un test, fallisce su un'entità inesistente.
7. B-452 e B-462: chiuse in `docs/BACKLOG.md` se il ciclo le tocca, altrimenti lasciate aperte e non violate.

## Scope escluso (confermato dall'utente il 2026-11-12)

- B-459, B-460, B-461, B-463, B-464 (immagini e link fra documenti, controllo immagini nel guard, commenti di `classify-cycle.mjs`): ciclo del manuale.
- B-458 (rifiniture di `help.html`), anche se il ciclo tocca `help.html`.
- Manuale utente: nessun contenuto in `handbook/public/` né in documenti diversi da ARCHITECTURE.md.
- Tema Mermaid con colori del brand: resta il tema di default.

## Domande aperte per `/brainstorming`

1. Diagrammi al posto dei blocchi di testo con `→` di §4 o accanto?
2. Perimetro dell'`erDiagram`: uno per area di §5, uno solo ridotto, con o senza colonne?
3. Come restano veri: estendere `architecture-guard` alle entità dei diagrammi, diagrammi solo concettuali, o deriva affidata a `/sync-docs` §1?
4. Verifica del rendering in un ciclo no-code: il Gate 2 non chiede il browser; dove entra `scripts/shoot.mjs` nel processo?
5. Errori di Mermaid: basta il riquadro di Mermaid + `console.error`, o il viewer mostra un messaggio?
6. Leggibilità sotto i 1024px: `svg { max-width: 100% }` rimpicciolisce i diagrammi larghi; serve scorrimento orizzontale per `pre.mermaid` (tocca `css/help.css`, il ciclo diventa ordinary)?
7. Forma del diagramma stage/status: `stateDiagram-v2` senza transizioni, `flowchart` o tabella + diagramma?
8. Chiudere B-452/B-462 qui o solo evitarle?
