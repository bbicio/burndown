# PDash To Prod — i commit di burndown nella cronologia — design spec

**Date:** 2026-11-13
**Brief started:** unknown
**Brief:** nessuno: richiesta e decisioni prese in chat il 2026-11-13 (nessun file di Brief, come ammette PROCESS.md §6b)
**Scenario:** 2 (evoluzione)

La vista History del pannello PDash To Prod (`C:\Users\Fabrizio.Fortini\Progetti\PDash_To_Prod`, fuori da `burndown`) dice quali file ha portato ogni export su Bitbucket, ma non perché. La spec aggiunge, sotto ogni export spinto e nel blocco "Pending", l'elenco dei commit di `burndown` che quell'export porta (hash breve e messaggio), così si vede di che iterazione si tratta, per esempio il ciclo dello user manual. Versione semplice: solo i messaggi, senza distinguere i commit che toccano il sito.

## Comportamento attuale

- Ogni record `copy`/`commit`/`push` porta `sourceSha`, lo SHA di `burndown` da cui parte l'export; `buildExports` produce un export per ogni `push` riuscito, con `sourceSha`, `destSha`, conteggi e file (`dashboard/history.mjs`).
- Il blocco "Pending" (`pending()`) esiste solo se l'ultimo dry run riuscito è stato fatto sul `main` attuale e porta `sourceSha`, conteggi e file.
- Nessun punto della vista mostra i commit o i loro messaggi. I comandi che il pannello può lanciare sono quelli di `dashboard/steps.mjs`.

## Comportamento atteso

1. **Elenco dei commit di un export.** Per ogni export (un `push` riuscito) il servizio della cronologia calcola `commits`: i commit di `burndown` tra lo `sourceSha` dell'export precedente (il `push` riuscito subito più vecchio) e quello dell'export, come `{ sha, subject }`, dal più recente. Il primo export in assoluto, o un export il cui precedente non ha `sourceSha`, ha `commits: null` (nessun intervallo di riferimento).
2. **Elenco per il Pending.** `pending` porta `commits` calcolati tra lo `sourceSha` dell'ultimo export pubblicato e il suo `sourceSha`; `null` se non c'è un export pubblicato.
3. **Limite.** Ogni elenco ha al massimo 20 commit; se ce ne sono di più, il servizio lo segnala con `more: true` e la pagina scrive "… and more".
4. **Intervallo illeggibile.** Se git non riesce a leggere l'intervallo (uno SHA che non esiste più in `burndown`, per esempio dopo una riscrittura della storia), l'elenco è `unavailable: true` e la pagina scrive "Commits unavailable".
5. **La vista.** Nel dettaglio di un record `push` riuscito e nel blocco "Pending" compare una sezione "Commits" con una riga per commit (`<hash breve> <messaggio>`, testo semplice). Il riepilogo di sessione, i filtri e il resto della vista non cambiano.
6. **Solo lettura.** Il pannello usa solo `git log` in `burndownDir`, con argomenti costanti e due SHA validati (40 caratteri esadecimali minuscoli); `history.jsonl` non cambia formato e non si riscrive.

## Vincoli

- Tutto il testo della pagina è in inglese.
- Nessuna dipendenza nuova, nessun comando Docker, nessuna modifica a `docker.mjs`.
- La lettura dei commit è calcolata a ogni caricamento della cronologia, non salvata, così vale anche per gli export già fatti.
- Nessuna modifica a `burndown` oltre a questa spec e al suo piano.

## Scope escluso

Il segno che distingue i commit che toccano file del sito; il corpo dei messaggi; un nome di iterazione scritto a mano; il filtro per ciclo; i commit del clone Bitbucket; ricalcolo salvato o cache; `/finish-cycle`, ramo e worktree (istruzione dell'utente, 2026-11-13).

## Criteri di accettazione

1. **Commit di un export** — nel dettaglio dell'ultimo `push` della cronologia reale compaiono i commit di `burndown` tra l'export precedente e quello (verifica a vista sul pannello avviato su `history.jsonl`, e test con un `exec` finto).
2. **Pending** — dopo un dry run, il blocco "Pending" mostra i commit non ancora pubblicati, con in testa il commit di merge del ciclo (per esempio `Merge branch 'user-manual'`).
3. **Casi limite** — un export senza precedente ha `commits: null` e la pagina non scrive niente di sbagliato; un intervallo con più di 20 commit mostra 20 righe e "… and more"; uno SHA illeggibile mostra "Commits unavailable" (test).
4. **Comando confinato** — il comando è `git log` con intervallo `<sha>..<sha>` e formato fisso, i due SHA sono validati, e uno SHA non valido è rifiutato prima di lanciare qualunque cosa (test di `steps.mjs`).
5. **Pannello integro** — `npm test` del pannello è verde e `git diff --stat` del ciclo in `burndown` tocca solo questa spec e il suo piano.

## Decisioni aperte

1. **I commit si calcolano alla lettura con `git log` fra due SHA e non si salvano nei record.** Alternativa scartata: scriverli nel record `push`. Perché: funziona anche per gli export già fatti e non cambia il formato della cronologia.
2. **L'intervallo di un export è dal `push` riuscito precedente.** Alternativa scartata: dall'ultimo commit presente nel clone. Perché: i record sono il registro del pannello e non servono altre letture.
3. **Solo hash e messaggio, nessun segno "tocca il sito" e nessun corpo.** Alternativa scartata: marcare i commit che toccano file del sito. Perché: l'utente ha chiesto di tenerlo semplice; si aggiunge in un secondo momento.
4. **Limite di 20 commit con "… and more".** Alternativa scartata: elenco completo. Perché: tra due export lontani l'elenco può essere lungo e la vista deve restare leggibile.
5. **Il Pending porta i commit solo quando esiste un dry run sul `main` attuale.** Alternativa scartata: mostrarli sempre. Perché: è la regola già in vigore per il blocco e la vista non cambia struttura.
6. **Esecuzione con commit diretti, senza `/finish-cycle`; push al termine come autorizzato dall'utente per i cicli precedenti, da riconfermare.** Alternativa scartata: ramo e `/finish-cycle`. Perché: istruzione esplicita dell'utente.
