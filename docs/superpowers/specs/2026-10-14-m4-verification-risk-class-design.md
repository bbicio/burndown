# M4 — verifica proporzionata alla classe di rischio

**Date:** 2026-10-14
**Brief started:** 2026-10-14 13:39
**Brief:** `docs/superpowers/briefs/2026-10-14-m4-verification-risk-class-brief.md`
**Scenario:** 2 (evoluzione)

## 1. Perimetro

Dal Brief: B3 (classe di rischio dichiarata), D4 (effort del Gate 3 secondo la classe, niente skip in
`high-risk`), contesto dei file nei dispatch, D2 (riferimento Spec/Piano dichiarato). Il path scope di
`/code-review` è escluso (Decisioni aperte, voce 2). Esclusi dal Brief: percorso Light (M6), modifiche
ai plugin `superpowers`, la validazione sui cicli successivi.

File toccati: `docs/superpowers/PROCESS.md`, `.claude/commands/finish-cycle.md`,
`scripts/decision-ledger-guard.test.js`. `CLAUDE.md` non si tocca.

## 2. Classe di rischio — `PROCESS.md`, nuovo §6.1b

Tre classi, assegnate per categoria, non per lista di file:

- **`high-risk`** — il Piano tocca almeno una di: migrazione DB; autenticazione o permessi; money o
  valute; file condivisi caricati da più pagine; operazioni distruttive (reset, script Docker o di
  backup).
- **`low-risk`** — nessuna categoria `high-risk`, nessuna route API, nessun modulo `js/lib/` o
  `api/src/lib/`, nessun file di processo (`docs/superpowers/PROCESS.md`, `.claude/`, `scripts/`).
- **`standard`** — tutto il resto.

Nel dubbio, la classe più alta. La classe è **dichiarata, non dedotta**, con la categoria che la
giustifica, nella stessa forma della modalità di §6.1; viaggia nell'unica fermata di `/writing-plans`
(§6b «Dove si applica» la nomina insieme alla modalità) e resta scritta nell'header del Piano:

```markdown
**Risk class:** standard — tocca file di processo, nessuna categoria high-risk
```

Corrispondenza con l'effort di `/code-review`: `low-risk` → low, `standard` → medium,
`high-risk` → high. La regola sta in §6.1b; `finish-cycle.md` la applica e vi rimanda.

## 3. Header del Piano

Ogni Piano porta, nell'header, le righe:

```markdown
**Spec:** `docs/superpowers/specs/<file>-design.md`
**Branch:** `<nome esatto del branch che l'esecuzione crea>`
**Risk class:** <low-risk|standard|high-risk> — <categoria che la giustifica>
```

`**Spec:**` e `**Branch:**` esistono già nei Piani recenti; il formato di `**Branch:**` è quello di
`docs/superpowers/plans/2026-10-14-m1-measurement-prose-rules.md`. L'esecuzione crea il branch con
quel nome esatto.

## 4. `/finish-cycle` — Gate 2

**Nuovo passo prima dello step 0: identificare Piano, Spec e classe.** Gira su entrambi i rami
(ordinario e no-code), è di sola lettura.

1. Cerca in `docs/superpowers/plans/*.md` (solo file diretti) le righe che iniziano con
   `` **Branch:** `<branch corrente>` ``. Esattamente un file → è il Piano del ciclo; da lì legge
   `**Spec:**` e `**Risk class:**`.
2. Zero o più di un file, o riga `**Risk class:**` assente o con un valore fuori dalle tre classi →
   classe `standard`, dichiarato in una riga con il motivo.
3. Mostra in una riga classe, fonte ed effort risultante. Non chiede nulla.

Registra `<risk-class>` e `<review-effort>`, usati dal Gate 2 step 0 e dal Gate 3.

**Steps 2-4 diventano fallback.** Se il passo sopra ha identificato il Piano, lo step 5 riceve Piano e
Spec dichiarati e i tre `git log` non si eseguono. Altrimenti si eseguono come oggi. Lo step 5 e lo
step 6 non cambiano. Sul ramo no-code gli steps 2-5 restano saltati come oggi: lì il passo nuovo
alimenta solo la classe, e il controllo out-of-scope del Gate 4 continua a non scattare.

**Step 0:** `/code-review` a `<review-effort>` invece di medium.

## 5. `/finish-cycle` — Gate 3

- Ogni `/code-review` del gate usa `<review-effort>`: il round 1 (step 1), la review scoped dei commit
  nati al Gate 2, i round successivi, lo step 0b. Cap di tre round e regola di disposizione invariati.
- **In `high-risk` lo skip completo dello step 0 non si applica.** Lo step 0b si applica solo se la
  review whole-branch che definisce `<reviewed-sha>` è stata fatta a effort high; altrimenti step 1.
  Il rispecchiamento al Gate 2 step 0 segue le stesse condizioni.
- Se il Gate 2 non è stato eseguito in questa sessione (classe non registrata), il Gate 3 esegue il
  passo di identificazione del §4 prima dello step 0.

## 6. Report del Gate 5

Nuova riga nell'header del template, dopo `**Cycle counters:**`:

```markdown
**Risk class:** <classe> (<fonte: Piano | non dichiarata → standard>) · review effort <low|medium|high>
```

## 7. Contesto dei file nei dispatch — `PROCESS.md` §6.1

Nuovo punto: il prompt di dispatch di un implementer copia la lista dei file del suo task dal Piano e
gli chiede di aprirli prima di modificare; il prompt di un reviewer riceve la stessa lista e il range
di commit da rivedere. In esecuzione nativa non c'è dispatch e il punto non si applica.

## 8. Guard — `scripts/decision-ledger-guard.test.js`

Terza regola, sui soli Piani datati da `PLAN_CUTOFF = '2026-10-14'`: l'header porta una riga
`` **Branch:** `<nome>` `` e una riga `**Risk class:** ` seguita da uno dei tre valori. Non verifica
che la classe sia giusta né che il branch esista (§6b). Esenzione chiusa e separata da `EXEMPT`: il
Piano di M1, che ha la stessa data e precede la regola. Test unitari su forma valida, valore fuori
insieme, riga assente; test live su tutti i Piani in scope. L'intestazione del file documenta la
regola e i suoi limiti come per le prime due.

## 9. Classe di M4

`standard`: tocca file di processo (`PROCESS.md`, `.claude/`, `scripts/`), nessuna categoria
`high-risk`.

## 10. Verifica

- `npm test` verde, compresi i guard di §4b.
- Il Piano di M4 porta le tre righe del §3; al Gate 2 di M4 il passo nuovo lo trova per `**Branch:**`
  e mostra `standard` → medium.

## Decisioni aperte

1. **Il riferimento sta nell'header del Piano (`**Branch:**`), non nel Brief.** Alternativa scartata: il Brief, come proponeva l'handoff. Perché: il Brief è scritto prima di Spec e Piano e non tutti i cicli ne hanno uno, mentre i Piani recenti portano già `**Branch:**`.
2. **Path scope escluso da M4.** Alternativa scartata: usare il path target di `/code-review` per le classi inferiori. Perché: non è verificato se un path target rivede il diff o i file interi, e restringere per path lascia parti del diff non revisionate, che il Gate 3 non considera mai una review pulita.
3. **Tre classi con fallback `standard`.** Alternativa scartata: chiedere all'utente quando la classe manca. Perché: il fallback coincide con il comportamento di oggi, quindi nessuna regressione e nessuna fermata nuova.
4. **In `high-risk` lo step 0b resta ammesso, ma solo dopo una review a effort high.** Alternativa scartata: vietare anche lo scope ridotto. Perché: rivedere di nuovo ciò che è già coperto a high sarebbe la review doppia che §6.4 vieta.
5. **Nessun classificatore automatico.** Alternativa scartata: uno script che suggerisce la classe dal diff. Perché: un suggerimento condiziona una dichiarazione che deve restare dichiarata, e quando si scrive il Piano il diff non esiste ancora.
6. **`scripts/cycle-times.mjs` non si tocca.** Alternativa scartata: fargli leggere `**Branch:**`. Perché: preferisce già lo slug esatto del branch.
7. **Il guard pretende la presenza di `**Branch:**` e `**Risk class:**`.** Alternativa scartata: nessun guard. Perché: il passo nuovo del Gate 2 dipende da quelle due righe, e un Piano che le omette ricadrebbe in silenzio sul fallback.
8. **Esenzione chiusa e separata per il Piano di M1, con cutoff 2026-10-14.** Alternativa scartata: cutoff al 2026-10-15. Perché: esenterebbe il Piano di M4 stesso, il primo che la regola deve coprire.
9. **Il passo di identificazione precede lo step 0 e gira anche sul ramo no-code.** Alternativa scartata: lasciarlo agli steps 2-4. Perché: lo step 0 lancia la review e ha bisogno dell'effort prima; sul ramo no-code la review parte comunque.
