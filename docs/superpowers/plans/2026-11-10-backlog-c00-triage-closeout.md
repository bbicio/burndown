# Backlog ciclo 0 — chiusura del triage: Piano

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (esecuzione nativa, §6.1). Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-11-10-backlog-c00-triage-closeout-design.md`
**Branch:** `backlog-c00-triage-closeout`
**Risk class:** low-risk — solo `docs/BACKLOG.md` e l'indice dei brief: nessuna route, nessun modulo `js/lib/`/`api/src/lib/`, nessun file di processo

**Goal:** ogni riga di `docs/BACKLOG.md` nominata dal brief del ciclo 0, più le 12 righe malformate, ha un verdetto deciso da un comando eseguito oggi, e ogni riga `open` è assegnata a un ciclo.

**Architecture:** un solo file di dati (`docs/BACKLOG.md`) modificato riga per riga, più una sezione nuova nell'indice. Un checker usa-e-getta nello scratchpad prova i criteri 1 e 3 della Spec.

**Tech Stack:** markdown, Node 24 (checker), vitest (guard documentale).

## Global Constraints

- Modifiche solo a `docs/BACKLOG.md` e `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md`. Nessun file di codice; i brief dei cicli 1-14 non si toccano.
- Le righe si cercano per pattern, mai per numero di riga: quelli citati nelle celle sono slittati.
- `Verified how` porta il comando eseguito, il suo esito e `2026-11-10`; mai la sola frase del triage o di un report.
- Stati ammessi: `closed 2026-11-10`, `open`. Un `open` senza comando decisivo porta `unverified — <cosa serve>`.
- Path in `Verified how`: bare e tra backtick, numero di riga fuori (regola 1 di `docs/BACKLOG.md`).
- Gli ID `B-NNN` non si riusano né si rinumerano.
- Un difetto nuovo trovato verificando non si corregge: diventa una riga nuova con ID successivo al massimo esistente, e va in «Correzioni dal ciclo 0».
- Le modifiche si fanno con il tool Edit, mai con `sed`/`node -e`/PowerShell (backslash persi, BOM).

## Review Focus

1. Una cella con `\|` escapato o un backtick sbilanciato spezza la tabella: dopo ogni Edit il checker deve ancora vedere tutte le righe.
2. Un grep che restituisce 0 non prova che il difetto sia risolto se il codice è stato rinominato: prima di chiudere si legge il punto del codice che sostituisce il pattern.
3. Una riga «obsoleta perché voluta dalla spec» si chiude solo citando la spec e la sua sezione, dopo averla aperta.
4. Una riga chiusa qui ma nominata da un brief 1-14 va elencata nell'indice, altrimenti quel ciclo la ri-lavora.
5. Il fence «Triage coverage» (B-057) non va toccato, anche se ricucire la riga fa venire voglia di correggerlo.

---

### Task 1: Worktree e checker

**Files:**
- Create: `<scratchpad>/check-backlog.mjs` (fuori dal repo, mai committato)

**Interfaces:**
- Produces: `node <scratchpad>/check-backlog.mjs`, eseguito dalla radice del worktree; stampa `undecided: <ids>`, `uncovered: <ids>`, `briefed-closed: <ids>`, ed esce con 1 se una delle prime due liste non è vuota.

- [ ] **Step 1:** dal checkout principale, su `main` con Spec e Piano committati: `git worktree add .claude/worktrees/backlog-c00-triage-closeout -b backlog-c00-triage-closeout`, poi `git -C .claude/worktrees/backlog-c00-triage-closeout branch --show-current` → `backlog-c00-triage-closeout`. Altrimenti ci si ferma. Poi `cp .env` nel worktree e `npm ci` dentro il worktree.
- [ ] **Step 2:** scrivere il checker. Regole:
  - riga = linea che inizia con `| B-\d+ `; celle = split su `|` non preceduto da `\`;
  - `State` = la prima cella dopo la quarta che si apre con `open` o `closed`; se non c'è → **undecided**;
  - un `open` il cui `Verified how` è vuoto → **undecided**;
  - **coverage** = ID citati (regex `B-\d+`) dai file `docs/superpowers/briefs/2026-11-10-backlog-c(0[1-9]|1[0-4])-*.md` più la sezione `## Correzioni dal ciclo 0` dell'indice; un `open` fuori da questo insieme → **uncovered**;
  - **briefed-closed** = ID citati dai brief 1-14 che sono `closed` (solo informativo).
- [ ] **Step 3:** eseguirlo sul worktree. Esito atteso prima di ogni modifica: `undecided` = B-057, B-302…B-312; `uncovered` vuoto. Se differisce, ci si ferma e si riporta.

### Task 2: Riparazioni di formato

**Files:**
- Modify: `docs/BACKLOG.md` (righe B-057, B-302…B-312)

- [ ] **Step 1:** B-057: unire le due linee in una. Il newline letterale dopo «It carries a literal `» diventa il testo `` `\n` `` dentro il backtick già aperto, in modo che la cella dica «a literal `\n` where a line continuation belongs».
- [ ] **Step 2:** B-302…B-312: inserire la cella `| open |` fra `Where` e `Verified how`, senza toccare le altre celle.
- [ ] **Step 3:** checker → `undecided` vuoto, `uncovered` = B-057, B-302…B-312.
- [ ] **Step 4:** commit `docs(backlog): repair the State cell of B-302..B-312 and rejoin B-057`.

### Task 3: Le 12 righe risolte o obsolete secondo il triage

**Files:**
- Modify: `docs/BACKLOG.md` (B-396, B-397, B-400, B-409, B-178, B-179, B-108, B-146, B-148, B-281, B-286, B-295)

- [ ] **Step 1:** per ogni riga: leggere `What`/`Where`, eseguire il comando che decide (grep del difetto nel file di `Where`, poi lettura del punto trovato; per B-281/B-286/B-295 aprire la spec che rende voluto il comportamento e citarne la sezione).
- [ ] **Step 2:** scrivere il verdetto (§2 della Spec). Una riga che il triage dava per risolta e che risulta ancora aperta resta `open`, con l'esito del comando.
- [ ] **Step 3:** checker → `undecided` vuoto. Annotare nello scratchpad quali righe sono rimaste `open` e il ciclo che le copre (serve al Task 6).
- [ ] **Step 4:** commit `docs(backlog): cycle 0 — verify the rows triage marked resolved or obsolete`.

### Task 4: Le 15 righe incerte

**Files:**
- Modify: `docs/BACKLOG.md` (B-008, B-014, B-021, B-026, B-027, B-028, B-053, B-056, B-065, B-227, B-229, B-284, B-298, B-301, B-354)

- [ ] **Step 1:** stesso metodo del Task 3. Il ciclo di destinazione di una riga che resta `open` è quello del brief 1-14 che già la nomina (B-014, B-053 → 10; B-354 → 6); per le altre, il brief la cui linea di taglio la contiene, letta nel brief.
- [ ] **Step 2:** checker → `undecided` vuoto. Annotare le destinazioni nello scratchpad.
- [ ] **Step 3:** commit `docs(backlog): cycle 0 — settle the uncertain rows`.

### Task 5: Le 12 righe malformate

**Files:**
- Modify: `docs/BACKLOG.md` (B-057, B-302…B-312)

- [ ] **Step 1:** per B-302…B-312 rieseguire il comando già scritto in `Verified how` (adattando il pattern se il codice si è spostato) e aggiornarne esito e data; B-309 resta `unverified — needs a screen-reader check (NVDA/VoiceOver) on New POT` se nessun comando lo decide. Per B-057 eseguire alla lettera il fence «Triage coverage» e riportarne l'esito.
- [ ] **Step 2:** verdetto per ciascuna; destinazioni di partenza (Spec §4): B-302, B-303 → 8; B-304, B-305, B-309 → 9; B-306, B-310, B-311 → 11; B-307, B-308, B-312 → 12; B-057 → 13.
- [ ] **Step 3:** commit `docs(backlog): cycle 0 — re-verify the rows triage did not cover`.

### Task 6: Indice e verifica finale

**Files:**
- Modify: `docs/superpowers/briefs/2026-11-10-backlog-cycles-index.md` (sezione nuova in fondo)

- [ ] **Step 1:** aggiungere `## Correzioni dal ciclo 0`, con quattro elenchi: righe aggiunte ai cicli (ID → ciclo, dalle note dei Task 3-5, escluse quelle già nominate dal loro brief); righe nominate da un brief 1-14 ma `closed` (l'output `briefed-closed` del checker); il refuso «B-36» del ciclo 8, da chiarire lì; eventuali righe nuove nate dalla verifica. La tabella esistente non cambia.
- [ ] **Step 2:** checker → exit 0, `undecided` e `uncovered` vuoti.
- [ ] **Step 3:** `npx vitest run scripts/doc-paths-guard.test.js scripts/decision-ledger-guard.test.js` → tutti verdi.
- [ ] **Step 4:** commit `docs(briefs): cycle 0 corrections to the backlog cycles index`, poi `/finish-cycle`.

## Decisioni aperte

1. **Checker nello scratchpad, non un guard committato.** Alternativa scartata: `scripts/backlog-guard.test.js`. Perché: il brief esclude il codice, e un guard nuovo è un ciclo a sé.
2. **Un commit per gruppo di righe, non uno per riga.** Alternativa scartata: 39 commit. Perché: i gruppi sono quelli della Spec e si revisionano insieme.
