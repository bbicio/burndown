# Brief — Ciclo 2: allineare `PROCESS.md` a sé stesso (F7 + F8)

**Scenario 3 (audit → fix).** Fonte: `docs/superpowers/audits/2026-10-12-process-construct-cold-review-audit.md`, finding **F7** e **F8**.
**Perché insieme:** stesso file, stessa natura (il documento descrive sé stesso in modo inesatto), un solo passaggio editoriale. **Da eseguire dopo il Ciclo 1**, che aggiunge a `PROCESS.md` il testo sui guard che §1 dovrà poi riassumere.

## Current behavior

**F7 — §1 omette tre step del Gate 4, due dei quali scritti dopo incidenti reali.**
La riga `/finish-cycle` di §1 (`PROCESS.md:26`) descrive la coda della sequenza come «… → merge `--no-ff` con riepilogo pre-merge esplicito e pulizia worktree → `/sync-docs` + report persistito». Il Gate 4 esegue invece, in ordine: riepilogo pre-merge → merge → **`scripts/backup-db.sh`** (`finish-cycle.md:97`, automatico) → **applicazione delle nuove migrazioni** (`:116`) → **restart del backend** (`:124`, gate umano che può lasciare codice backend mergiato ma non vivo) → pulizia worktree → cancellazione branch. `grep -c "backup-db\|pdash-api\|migrazion"` su `PROCESS.md` dà cinque hit, **nessuna in §1 e nessuna sul Gate 4**.
Origine: gli step arrivano da `bf95d9f`, `bc561d0` e `41bab43`, nessuno dei quali tocca `PROCESS.md`; la condizione 3 di §7 li copriva già allora e non fu applicata. Il risultato è un documento asimmetrico — §1 descrive il ramo più recente (no-code cycle, 2026-10-09) in una clausola propria, mentre tre step più vecchi mancano.

**F8 — §6 usa due schemi di numerazione contemporaneamente, ed entrambi sono citati.**
Dentro `## 6.` (`:112`) le suddivisioni sono punti in grassetto `1, 2, 3, 4, 4b, 4c, 5` (`:116`, `:134`, `:153`), citati come `§6.1` (`PROCESS.md:117`) e `§6.4` (`finish-cycle.md:35`, `:36`, `:69`). Ma `## 6.6` (`:159`) è un **heading di primo livello**, fratello di `## 6.`, con i propri punti 1-5, citato come «PROCESS.md 6.6.5» (commit `eb36f2a`). `finish-cycle.md:12` cita i due schemi nella stessa frase: «PROCESS.md §6/§6.6». Quindi `§6.4` significa «punto 4 dentro §6» mentre `§6.6` significa «la sezione dopo §6», e `§6.5` sarebbe irrisolvibile. Tutte le citazioni esistenti risolvono oggi: il difetto è che lo schema non è seguibile da un lettore a freddo.

## Expected behavior

1. **F7** — la riga `/finish-cycle` di §1 nomina i tre step mancanti del Gate 4 nella loro posizione reale (backup DB automatico, applicazione migrazioni, restart backend come gate umano). Una clausola, non un paragrafo: §1 resta un sommario.
2. **F8** — lo schema di §6 diventa univoco **con la modifica minima**. Opzione raccomandata, da confermare in `/brainstorming`: promuovere i punti in grassetto di §6 a heading `### 6.1 … 6.5` (con `6.4b`/`6.4c`) e degradare `## 6.6` a `### 6.6` dentro §6 — così `§6.1…§6.6` sono coerenti e **tutte le citazioni oggi esistenti continuano a risolvere senza essere toccate**, incluso «6.6.5».

## Constraints

- **Niente rinumerazione di §7 e oltre**, e nessun numero di sezione esistente cambia significato: `sync-docs` SKILL.md:55 stabilisce che i numeri di sezione sono stabili e mai rinumerati, perché altri documenti li citano.
- Nessuna citazione esterna va invalidata; se la variante scelta ne sposta qualcuna, va aggiornata nello stesso commit (`finish-cycle.md:12`, `:35`, `:36`, `:69` e `PROCESS.md:117` sono l'elenco completo misurato dall'audit).
- Solo prosa: nessun file di codice, nessun test nuovo.
- Nessun contenuto nuovo di processo: si descrive ciò che i gate **già fanno**, non si cambia cosa fanno.

## Acceptance criteria

- [ ] §1 nomina backup DB, applicazione migrazioni e restart backend nella riga `/finish-cycle`, nell'ordine reale del Gate 4.
- [ ] Dentro §6 un riferimento `§6.N` ha un solo significato possibile, e `§6.6` non è più ambiguo tra «punto 6 di §6» e «sezione dopo §6».
- [ ] Ogni citazione di `§6.x` in `finish-cycle.md` e `PROCESS.md` risolve.
- [ ] Nessun numero di sezione `## N` oltre il 6 è cambiato.
- [ ] `npm test` verde (`claude-md-guard` cammina anche `docs/`).

## Explicitly excluded scope

- Non si riscrive §6 nel merito, non si accorpano né si tagliano i suoi punti: solo la forma della numerazione.
- Non si tocca §7 né le sue condizioni.
- Niente guard nuovo sui puntatori `§N` interni a `PROCESS.md` (l'audit nota che nessuno li controlla; resta debito dichiarato, non lavoro di questo ciclo).
- Niente riallineamento degli altri documenti di processo.

## Nuovi finding durante questo ciclo

Qualunque difetto scoperto durante `/brainstorming` o l'esecuzione va **isolato e proposto come Brief futuro**, mai incorporato in questo fix (`PROCESS.md` §2, Scenario 3) — in particolare altre divergenze §1-vs-gate che emergessero rileggendo `finish-cycle.md` per intero.
