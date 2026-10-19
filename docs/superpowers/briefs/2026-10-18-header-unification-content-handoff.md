# Handoff — header unification ciclo 2: dal Piano all'esecuzione

Brief, Spec e Piano sono scritti e committati su `main` (HEAD `28ec659`, non pushato). Resta l'esecuzione.

## Dove sono i documenti

- Brief: `docs/superpowers/briefs/2026-10-18-header-unification-content-brief.md`
- Spec: `docs/superpowers/specs/2026-10-18-header-unification-content-design.md` (11 decisioni nel ledger)
- Piano: `docs/superpowers/plans/2026-10-18-header-unification-content.md` (8 task, 5 decisioni nel ledger)
- Tavole: `docs/superpowers/design/header/` (tutte e sei lette in `/brainstorming`)

## Esito del passaggio Piano → Esecuzione

- **Modalità: nativa** (§6.1). I task non sono indipendenti: leggono tutti i token del Task 1 e quasi tutti toccano `css/style.css` e `js/lib/content-surface-guard.test.js`.
- **Classe di rischio: high-risk** (§6.1b), per i file condivisi. Ogni `/code-review` a effort high, Gate 3 non saltabile.
- **Modello:** la sessione è già su Sonnet per implementare; tornare su Opus (`/model opus`) per la revisione finale e `/finish-cycle`.
- **Le cinque decisioni del Piano non sono state ratificate esplicitamente.** L'utente ha cambiato modello e chiesto l'handoff senza commentarle. Alla ripartenza si chiede se qualcuna va cambiata, prima di creare il worktree.

## Prossimo passo

1. Dal checkout principale, su `main`: `git worktree add .claude/worktrees/header-unification-content -b header-unification-content`, poi `git -C .claude/worktrees/header-unification-content branch --show-current` deve stampare il nome. Mai `EnterWorktree`.
2. Nel worktree: copiare `.env` dal checkout principale, `npm ci`.
3. Eseguire il Piano dal Task 1 con `superpowers:executing-plans`. Alla fine `/finish-cycle`.

## Decisioni prese in `/brainstorming` che non si vedono dal codice

- Fuori scope, per decisione dell'utente: `project-config.html` (avrà un ciclo di redesign con tavole nuove), le card kanban `.pb-card`, le copie inline di `.card` in `timesheets.html` e `_terms-editor.html` (ciclo a parte), il bottone Copy nel modale JSON di planning.
- Dentro, per decisione dell'utente: sfondo e font della pagina uguali ovunque, emoji della toolbar di planning sostituite da icone.
- Il banner locked del cost grid è già a 16px dalla banda su `main` (verificato con `shoot.mjs`): non va corretto, solo verificato.
- Scatti di riferimento "prima" già fatti a 1440 in `C:\Users\FABRIZ~1.FOR\AppData\Local\Temp\claude\C--Users-Fabrizio-Fortini-Progetti-burndown\b7f98a5b-9176-45a2-869d-c2de521e23ce\scratchpad\shots\` (costgrid locked, project dashboard, program, portfolio, planning, admin, dbreset, timesheets, projcfg). Il Task 8 li rifà su `main` a 1440 e 375 per confronto, quindi non dipendono da questi.

## Trappole incontrate

- **Git Bash converte `/planning.html` in un percorso Windows**: con `scripts/shoot.mjs` servono `MSYS_NO_PATHCONV=1` e l'URL tra virgolette. Senza, gli scatti sono tutti della pipeline, senza errore.
- **Un `&&` dopo `vitest` non ferma il commit**: l'ultimo comando della catena è `git`, e `grep` sull'output di vitest esce con 0 anche se i test falliscono. Controllare l'esito dei test prima del commit.
- **Il ledger vuole "Alternativa scartata:" al singolare**: `scripts/decision-ledger-guard.test.js` boccia il plurale.
- **Il quoting di `node -e` con apici e backtick in Git Bash si rompe**: per modificare file di testo usare Edit.
- Tutte le modifiche agli HTML con Edit, mai `Get-Content`/`Set-Content` (BOM).

## Follow-up da registrare in `docs/BACKLOG.md` al Gate 5

- Ciclo dedicato alle card di `timesheets.html` e `_terms-editor.html`.
- Le master-* tengono il loro `.alert-sm`, `body` e card inline finché non c'è il restyling di Master Data.
- Il pannello Team assistant e gli alert dentro le viste di planning non sono stati uniformati (contenuto interno).
