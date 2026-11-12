# Handoff — handbook, ciclo dei diagrammi di architettura (prima del manuale)

Il ciclo 1 del handbook è chiuso e mergiato: merge `0b14b16`, report `docs/superpowers/reports/2026-11-12-handbook-viewer-finish-cycle.md`, spec `docs/superpowers/specs/2026-11-11-handbook-viewer-design.md`. Il `pdash-nginx` principale è stato ricaricato il 2026-11-12: `/help.html` e `handbook/` sono serviti.

**Cambio d'ordine deciso dall'utente il 2026-11-12:** i diagrammi Mermaid dell'architettura vengono **prima** del manuale utente. L'ordine dell'11 novembre (ciclo 2 manuale, ciclo 3 diagrammi) è invertito. Il motivo: un diagramma Mermaid è testo, quindi questo ciclo non dipende da B-459 (come il viewer carica le immagini), che resta il primo passo del ciclo del manuale.

Questo ciclo **non ha ancora un Brief**. È un'evoluzione (Scenario 2): il prossimo passo è `/feature-brief` su questo handoff, poi `/brainstorming`.

## L'obiettivo in una frase

`handbook/restricted/ARCHITECTURE.md` riceve diagrammi Mermaid che il viewer `help.html` disegna, al posto (o accanto) dei flussi di testo scritti a mano, e restano veri rispetto al codice.

## Com'è il documento oggi

Rileggerlo prima del Brief: le sezioni si trovano con `grep -n "^## \|^### " handbook/restricted/ARCHITECTURE.md`.
- Nessun blocco `mermaid` (`grep -c '```mermaid' handbook/restricted/ARCHITECTURE.md`).
- §4 Auth Flows: sette flussi (invito, login, recupero password, cambio password, logout, rettifica profilo, accettazione T&C) scritti come blocchi di testo con frecce `→`.
- §5 Database Schema: le tabelle come blocchi `sql`, per area (§5.1-§5.8).
- §6 API Reference: tabelle markdown, verificate da `scripts/architecture-guard.test.js` (presenza di route, tabelle create e colonne aggiunte; non verifica la prosa né i diagrammi).
- §7 Docker Compose e `### Directory structure`: un albero di testo.

## Candidati, da scegliere nel Brief

Non decisi qui. Quelli visti finora:
1. **Contesto / container**: browser → nginx → api → db, con i due `auth_request` (`/auth-check` per le pagine e `handbook/`, `/admin-check` per `handbook/restricted/`) e i servizi esterni (SMTP, LLM del Team assistant).
2. **Flussi di §4 come `sequenceDiagram`**: almeno login con secondo passo via email e dispositivi fidati, invito/attivazione, accettazione T&C. Domanda: sostituire il testo con frecce o tenerlo accanto.
3. **`erDiagram` delle tabelle principali** di §5 (cost grid → versioni → fasi → task → ruoli; progetti; utenti e condivisioni). Lo schema completo è grande: decidere il perimetro, uno per area o uno solo ridotto.
4. Eventuali stati: lo stage di pipeline (`SIP` → `Expected` → `Anticipated` → `Committed`, `Canceled`) e lo status di progetto, come `stateDiagram-v2`.

## Domande di design per il Brief

- **Come restano veri.** `architecture-guard` non legge i diagrammi. Un `erDiagram` che nomina una tabella o una colonna rimossa diventerebbe falso senza che nessun test lo veda. Strade: estendere il guard perché ogni entità del diagramma esista fra le tabelle create dalle migrazioni; oppure diagrammi solo concettuali, senza colonne; oppure accettare la deriva e affidarla a `/sync-docs` §1.
- **Verifica del rendering.** `scripts/handbook-guard.test.js` controlla solo la struttura (fence chiuso, blocco non vuoto, primo token fra `MERMAID_TYPES` in `js/lib/handbook.js`), non la sintassi Mermaid. Un errore di sintassi si vede solo nel browser. E un ciclo che tocca soltanto `.md` sotto `handbook/` è classificato **no-code** da `scripts/classify-cycle.mjs`, quindi il Gate 2 non chiede la verifica nel browser. Il Brief deve dire come si verifica che ogni diagramma si disegni: `scripts/shoot.mjs` su `/help.html?doc=architecture` contro il branch stack, con i PNG letti, è lo strumento esistente.
- **Errori di Mermaid nel viewer.** `renderMermaid` in `help.html` non intercetta un errore di `mermaid.run`: oggi Mermaid disegna il suo riquadro di errore e la promessa rifiutata finisce in console. Decidere se basta.
- **Aspetto.** `css/help.css` non ha regole per i diagrammi (larghezza, scorrimento orizzontale sotto i 1024px, tema). Mermaid usa il suo tema di default. Se il ciclo tocca `css/help.css` o `help.html` non è più no-code.

## Righe di `docs/BACKLOG.md` da rileggere

Rieseguire il loro `Verified how` prima del Brief.
- **B-452**: un blocco che inizia con front matter YAML (`---`) o con una direttiva `%%{init}%%` su più righe dà un falso "unknown diagram type" in `docProblems`. Va chiuso in questo ciclo se si usano direttive di configurazione o titoli.
- **B-462**: `flowchart-elk` è accettato da `MERMAID_TYPES` ma il viewer non carica il layout ELK. Non usarlo, oppure chiudere la riga.
- Vicine, solo se il ciclo tocca `help.html`: **B-458** (rifiniture del viewer).

Fuori da questo ciclo: B-459 (immagini e link fra documenti, primo passo del ciclo del manuale), B-460, B-461 (controllo delle immagini nel guard), B-463, B-464 (commenti di `classify-cycle.mjs`).

## Dati e strumenti

- Il viewer è verificato: al Gate 2 del ciclo 1 un blocco `mermaid` temporaneo in un documento riservato è stato disegnato come diagramma (mermaid 11.4.1 da CDN, `securityLevel: 'strict'`).
- Branch stack: `scripts/test-branch.sh up`, poi `http://localhost:8081/help.html?doc=architecture` da admin. Credenziali e insidie di `scripts/shoot.mjs`: `docs/scripts/shoot.md`.
- Dopo il merge, un ciclo che cambia solo `.md` non richiede reload di nginx né restart dell'API.

## Lezioni del ciclo 1 da portare nel Piano

1. **Un subagente ha modificato il checkout principale** usando il path assoluto della root invece di quello del worktree. Ogni dispatch dice: ogni Edit/Write usa il path assoluto del worktree.
2. **Le regole di riconoscimento scritte in fretta generano casi limite a catena**: il Gate 3 del ciclo 1 ha avuto tre round quasi tutti su `classify-cycle.mjs` e sul controllo delle immagini aggiunto in corsa. Se il Brief estende `architecture-guard` ai diagrammi, il Piano elenca i casi (entità presente, assente, rinominata, tabella creata e poi eliminata) e i test li coprono uno per uno.
3. **La localStorage è per origine**: una verifica che dipende da dati salvati nel browser non si fa sul branch stack (`:8081`) se i dati sono su `http://localhost`.
