# Brief — Monitor visuale del processo di sviluppo

**Tipo:** nuova funzionalità (Scenario 1) di tooling di processo.
**Brief started:** 2026-11-19 00:23
**Origine:** analisi di fattibilità in chat del 2026-11-18/19.
**Classe di rischio (proposta):** `standard`. Tocca file di processo (`.claude/`, `scripts/`, `docs/superpowers/PROCESS.md`), non l'app; nessuna categoria `high-risk` (PROCESS.md §6.1b). La classe si dichiara nel Piano.

## Problema

L'avanzamento di un ciclo (Brief → `/brainstorming` → Spec → `/writing-plans` → Piano → Esecuzione → `/finish-cycle`, PROCESS.md §1) si segue solo leggendo il testo nel terminale. Non c'è una vista d'insieme di dove si trova il ciclo, di cosa è già fatto, di cosa è stato saltato o ripetuto, e soprattutto di quando Claude aspetta una risposta dell'utente.

## Punti di partenza nel repo

- `scripts/cycle-report.mjs mark <event>` registra già `preflight`, `gate1`…`gate5`, `merged`, `report` in `<main checkout>/.superpowers/cycle-log/<branch>.log`, una riga `<ISO time> <event>` (`docs/scripts/cycle-report.md`). Le fasi precedenti a `/finish-cycle` non lasciano eventi.
- Spec e Piano committati sono riconoscibili da git (`docs/superpowers/specs/`, `docs/superpowers/plans/`); i task dell'esecuzione hanno un commit ciascuno.
- Il repo non ha un `.claude/settings.json` di progetto (solo `settings.local.json`); il `~/.claude/settings.json` dell'utente ha già un hook `PreToolUse` su `Bash` (RTK).
- `scripts/site-export.rules` esclude `scripts/` (riga 11): un nuovo file lì è già classificato come processo.

## Comportamento atteso

1. **Avvio.** Un comando npm locale (es. `npm run process:monitor`) avvia un piccolo server Node che serve una pagina su `127.0.0.1`; l'utente la apre nel browser.
2. **Diagramma dell'intero processo.** La pagina mostra un diagramma di tutte le fasi del §1 e dei gate di `/finish-cycle`. Ogni blocco ha uno di questi stati, visivamente distinti:
   - da fare / in corso / fatto;
   - **in attesa dell'utente** (Claude ha fatto una domanda e aspetta);
   - **saltato** (non eseguito per regola, es. Gate 3 saltato, ramo no-code del Gate 2);
   - **ripetuto**, con il conteggio (round di review, task del piano N/M, rientri in un gate).
3. **Aggiornamento dal vivo.** I blocchi cambiano stato mentre il ciclo avanza, senza ricaricare la pagina.
4. **Tempi per fase.** Ogni blocco mostra la sua durata, con la stessa definizione dei `Gate durations` di `cycle-report.mjs` dove si sovrappongono.
5. **Log eventi.** Sotto il diagramma, l'elenco cronologico degli eventi del ciclo selezionato.
6. **Cicli conclusi.** La pagina elenca i cicli in corso e quelli chiusi registrati dai log, e permette di rivederne uno già chiuso.
7. **Identità del ciclo.** Un ciclo è riconosciuto dal Brief in poi, anche quando il branch non esiste ancora, e resta lo stesso ciclo dopo la creazione del worktree e il merge.
8. **Fonte degli eventi.** Gli eventi arrivano da: i `mark` esistenti, hook di Claude Code (avvio di una skill, domanda all'utente, fine turno, dispatch e fine dei subagent), git dove basta. Il dettaglio fine (task, round, sotto-passi dei gate) è coperto.

## Vincoli

- **Plugin.** I plugin `superpowers` non si modificano; eventuali istruzioni nuove passano da `CLAUDE.md`/PROCESS.md/`.claude/commands`.
- **Hook non bloccanti.** Un hook che registra un evento non deve mai bloccare, rallentare in modo percepibile o far fallire una tool call; con il server spento o il log non scrivibile, il ciclo procede uguale. Convive con l'hook RTK dell'utente.
- **Niente build, niente dipendenze nuove** salvo necessità motivata in `/brainstorming`.
- **Più sessioni.** Più sessioni Claude Code e più branch possono essere attivi insieme; gli eventi di una non si mescolano con quelli di un'altra.
- **Log fuori dal repo versionato.** Gli eventi restano sotto `.superpowers/` (gitignored), come il log di `cycle-report.mjs`, e sopravvivono alla rimozione del worktree.
- **Deriva del diagramma.** Un guard fallisce quando un blocco del diagramma non corrisponde più a un evento emesso dal processo, o un evento non ha blocco.
- **Export.** I file nuovi sono classificati come processo da `scripts/site-export.rules`; `scripts/site-export-guard.test.js` resta verde.
- **Tetto di `CLAUDE.md`** (`scripts/claude-md-guard.test.js`); una regola vive in un file solo.
- **Lingua.** L'interfaccia della pagina è in inglese, come il resto della soluzione.
- **Security surface:** yes — route (server HTTP locale) e rendering di dati (nomi di branch, skill, testo degli eventi). Solo `127.0.0.1`, solo lettura, testo degli eventi sempre escapato.

## Criteri di accettazione

1. `npm run process:monitor` (o il nome scelto) avvia il server su `127.0.0.1` e la pagina si apre nel browser; nessuna porta è esposta su altre interfacce.
2. Durante un ciclo reale, dal Brief alla chiusura di `/finish-cycle`, ogni fase e ogni gate passa da "da fare" a "in corso" a "fatto" (o "saltato") sulla pagina senza ricaricarla.
3. Quando Claude pone una domanda all'utente, il blocco corrente diventa "in attesa dell'utente" e torna "in corso" dopo la risposta.
4. Round di review, task del piano e rientri nei gate mostrano il conteggio corretto, confrontato col report del ciclo.
5. Le durate dei gate coincidono con le `Gate durations` stampate da `node scripts/cycle-report.mjs render` per lo stesso ciclo.
6. Il log eventi elenca in ordine cronologico tutti gli eventi del ciclo selezionato.
7. Un ciclo chiuso si riapre dalla lista e mostra lo stato finale e i tempi.
8. Due sessioni su branch diversi compaiono come due cicli distinti, ciascuno con i propri eventi.
9. Con il server spento, un ciclo completo procede senza errori né rallentamenti dovuti agli hook.
10. Il guard sul diagramma fallisce se si toglie un blocco o un evento, e passa sul repo così com'è.
11. `npm test` passa, compresi `site-export-guard`, `claude-md-guard`, `doc-paths-guard` e il guard nuovo.

## Scope escluso

Confermato dall'utente:

- **Niente app PDash:** nessuna integrazione con nginx, `help.html` o l'export Bitbucket; solo localhost.
- **Pagina solo in lettura:** la pagina non avvia fasi e non risponde ai gate; l'interazione resta in chat.
- **Processo invariato:** si aggiungono solo eventi; ordine e regole di fasi e gate non cambiano.
- **Niente cicli pre-esistenti:** i cicli chiusi prima della feature non si ricostruiscono; si mostra solo ciò che i log registrano.
- **Niente notifiche:** nessuna notifica desktop o suono.
- **Niente pannello nel terminale:** nessuna variante come plugin o pannello dentro Claude Code.

## Domande aperte per `/brainstorming`

1. **Divisione in cicli.** Uno o due cicli? Proposta emersa in chat: (a) eventi, identità del ciclo, log e pagina sulle fasi principali; (b) dettaglio fine (task, round, sotto-passi) e guard del diagramma.
2. **Identità del ciclo prima del branch.** Chi la crea (il Brief, `feature-brief`, un `mark` nuovo), dove vive, come si aggancia al branch alla creazione del worktree (PROCESS.md §6.1b) e come si gestisce un Brief che non diventa mai un ciclo.
3. **Mappatura hook → blocco.** Quali eventi di Claude Code (es. `PreToolUse` su `Skill`/`AskUserQuestion`/`Agent`, `Stop`, `SubagentStop`) servono, e come si capisce a quale blocco appartiene un evento: un subagent implementer vs reviewer, un `AskUserQuestion` del Gate 2 vs del Gate 4.
4. **Hook di progetto o utente.** Gli hook stanno in un `.claude/settings.json` di progetto (versionato) o in quello dell'utente? Come convivono con l'hook RTK?
5. **Formato degli eventi.** Estendere `cycle-report.mjs` e il suo log, o un log nuovo con più campi (sessione, blocco, round)? Come restano coerenti le durate con `render`?
6. **Sorgente del diagramma.** Mermaid (già nell'handbook) o SVG/HTML costruito da un modello dati? Da dove si deriva l'elenco dei blocchi perché il guard possa confrontarlo con il processo?
7. **Aggiornamento dal vivo.** SSE o polling sul file di log?
8. **"Saltato".** Come si registra un blocco saltato, visto che un passo saltato di solito non emette nulla?
9. **Scenari.** Il diagramma mostra lo scenario del ciclo (1, 2, 3 con audit a monte) o una forma unica?

Brief ready. Next step: /brainstorming.
