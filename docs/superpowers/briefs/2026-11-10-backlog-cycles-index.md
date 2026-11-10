# Backlog — sequenza dei cicli

**Origine:** triage di `docs/BACKLOG.md` del 2026-11-10, a redesign concluso. Raggruppamento confermato dall'utente il 2026-11-10; i brief si eseguono in questo ordine.

| Ciclo | Brief | Contenuto |
|---|---|---|
| 0 | `docs/superpowers/briefs/2026-11-10-backlog-c00-triage-closeout-brief.md` | chiusura del triage, senza codice |
| 1 | `docs/superpowers/briefs/2026-11-10-backlog-c01-auth-profile-hardening-brief.md` | hardening di autenticazione e profilo |
| 2 | `docs/superpowers/briefs/2026-11-10-backlog-c02-server-validation-integrity-brief.md` | validazione e integrità dei dati lato server |
| 3 | `docs/superpowers/briefs/2026-11-10-backlog-c03-date-period-rules-brief.md` | regole su date e periodi, server e client |
| 4 | `docs/superpowers/briefs/2026-11-10-backlog-c04-reforecast-engine-brief.md` | motore di reforecast e distribuzione del phasing |
| 5 | `docs/superpowers/briefs/2026-11-10-backlog-c05-generate-project-and-editor-saves-brief.md` | fallimenti del Generate project, salvataggi silenziosi e difetti dell'editor |
| 6 | `docs/superpowers/briefs/2026-11-10-backlog-c06-save-overlay-and-nav-brief.md` | overlay di salvataggio, logout e pulizia della navigazione |
| 7 | `docs/superpowers/briefs/2026-11-10-backlog-c07-master-data-bugs-brief.md` | Master Data, bug |
| 8 | `docs/superpowers/briefs/2026-11-10-backlog-c08-admin-pages-races-errors-brief.md` | gare, doppio invio ed errori sulle pagine admin |
| 9 | `docs/superpowers/briefs/2026-11-10-backlog-c09-a11y-focus-controls-brief.md` | accessibilità, focus e controlli dei selettori |
| 10 | `docs/superpowers/briefs/2026-11-10-backlog-c10-portfolio-planning-breakdown-brief.md` | portfolio e planning: refactor del breakdown e calcoli di report |
| 11 | `docs/superpowers/briefs/2026-11-10-backlog-c11-lib-pipeline-masterdata-tidy-brief.md` | pulizia di js/lib, pipeline board e Master Data |
| 12 | `docs/superpowers/briefs/2026-11-10-backlog-c12-css-tokens-badges-brief.md` | CSS, token e badge |
| 13 | `docs/superpowers/briefs/2026-11-10-backlog-c13-docs-and-test-hygiene-brief.md` | documenti e igiene dei test |
| 14 | `docs/superpowers/briefs/2026-11-10-backlog-c14-design-decisions-brief.md` | decisioni di design, una per volta |

Ordine di partenza: 0, 1, 2, 3, 5, poi 4 (dopo la decisione su B-319 e B-320), 6, 7, 8, 9, 10, 11, 12, 13. Il ciclo 14 non si esegue: le sue voci vanno a `/brainstorming` una alla volta.

Il triage è a livello di grep: una voce risolta o obsoleta si chiude solo con il comando eseguito in `Verified how` (ciclo 0).

## Correzioni dal ciclo 0

Riverifica del 2026-11-10; il comando e l'esito di ogni voce stanno nella sua riga di `docs/BACKLOG.md`.

**Righe aperte che vanno a un ciclo** (non nominate dal suo brief):

| Ciclo | Righe |
|---|---|
| 2 | B-229 |
| 5 | B-227 |
| 8 | B-301, B-302, B-303 |
| 9 | B-304, B-305, B-309 |
| 11 | B-306, B-310, B-311 |
| 12 | B-307, B-308, B-312 |
| 13 | B-008, B-021, B-026, B-027, B-028, B-056, B-057, B-065 |
| 14 | B-298 |

B-014 e B-053 (ciclo 10) e B-354 (ciclo 6) restano aperte e restano a quei cicli, che già le nominano.

**Righe nominate da un brief ma già `closed`:** B-070, B-071, B-072, B-073, B-074, B-075, B-076, B-077 (ciclo 10), B-411 (ciclo 13). Quei cicli non le lavorano.

**Chiuse dal ciclo 0:** B-108, B-146, B-148, B-178, B-179, B-281, B-284, B-286, B-295, B-396, B-397, B-400, B-409.

**Da chiarire:** il brief del ciclo 8 cita «B-36», che non esiste in `docs/BACKLOG.md`; l'ID inteso si decide in quel ciclo.
