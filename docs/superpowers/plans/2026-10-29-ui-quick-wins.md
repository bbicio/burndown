# UI quick wins (ciclo A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-10-29-ui-quick-wins-design.md`
**Branch:** `ui-quick-wins`
**Risk class:** standard — tocca test sotto `js/lib/` (esclude `low-risk`), nessuna categoria `high-risk`

**Goal:** Rimuovere il toggle Compact/Full width da `planning.html` e dare alle colonne della pipeline una scrollbar sottile.

**Architecture:** Due task indipendenti, ciascuno con il suo guard test aggiornato prima del codice. Solo markup/CSS; nessuna API, nessuna migrazione.

**Tech Stack:** Vue 3 da CDN (nessun build), CSS con token di `css/tokens.css`, vitest + jsdom.

## Global Constraints

- Colori solo `var(--…)` di `css/tokens.css`, nessun hex.
- Ogni `?v=N` di un file versionato toccato va aggiornato in tutte le sue occorrenze.
- HTML modificato solo con l'Edit tool (mai `Set-Content`: aggiunge un BOM).
- Testo utente in inglese.
- Durante i task si lanciano solo i file di test toccati (`npx vitest run <file>`); la suite completa gira in `/finish-cycle`.

## Review Focus

1. **Riferimenti residui a `fullWidth`** in `planning.html` (template o metodi) → Vue segnalerebbe una proprietà non definita; pinnato dal test del Task 1 (`not.toContain('fullWidth')`).
2. **Chrome 121+ con proprietà standard fuori da `@supports`** → la scrollbar torna larga; pinnato dal test del Task 2 (le proprietà standard stanno solo dentro il blocco `@supports`).
3. **Mobile < 768px** → `.pb-col-body` è `overflow: visible`, nessuna scrollbar deve comparire; verifica manuale (criterio 5 della Spec), nessun test automatico.
4. **Colonna con poche card** → nessuna scrollbar, nessun spazio riservato: con `overflow-y: auto` invariato è il comportamento nativo; verifica manuale.
5. **Cache del CSS** → senza bump `?v=5` il browser serve la vecchia `pipeline.css`; pinnato dal test del Task 2.

---

### Task 1: Planning — rimozione del toggle Compact/Full width

**Files:**
- Modify: `planning.html:125` (bottone), `:302` (`fullWidth: true`), `:1144-1146` (`toggleFullWidth()`)
- Modify: `TEST_CASES.md:408` (PL-29)
- Test: `js/lib/content-surface-guard.test.js:238-261` (blocco `planning toolbar`)

**Interfaces:** nessuna.

- [ ] **Step 1: Aggiornare il test**

Nel blocco `describe('planning toolbar')`:
- `it('has four buttons')` → `it('has three buttons')`, con `expect(buttons.length).toBe(3);`
- sostituire la riga `expect(by('toggleFullWidth')).toContain(...)` con un nuovo `it`:

```js
it('has no width toggle (2026-10-29, ui-quick-wins)', () => {
  expect(html).not.toContain('toggleFullWidth');
  expect(html).not.toContain('fullWidth');
  expect(html).toContain('<body class="pp-fullwidth">');
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run js/lib/content-surface-guard.test.js`
Expected: FAIL su `has three buttons` (4 ≠ 3) e su `has no width toggle`.

- [ ] **Step 3: Implementare**

In `planning.html`: eliminare la riga del bottone `@click="toggleFullWidth"`, la proprietà `fullWidth: true,` di `data()` e il metodo `toggleFullWidth() { … }` per intero (attenzione alla virgola fra i metodi vicini). `<body class="pp-fullwidth">` resta.

In `TEST_CASES.md` PL-29: `(Team assistant, Load XLS, Compact/Full width, Export XLS)` → `(Team assistant, Load XLS, Export XLS)`.

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run js/lib/content-surface-guard.test.js js/lib/page-head-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add planning.html TEST_CASES.md js/lib/content-surface-guard.test.js
git commit -m "feat(planning): remove the Compact/Full width toggle, page stays full width"
```

### Task 2: Pipeline — scrollbar sottile sulle colonne

**Files:**
- Modify: `css/pipeline.css` (dopo la regola `.pb-col-body` a riga 168, fuori dal media query)
- Modify: `pipeline.html:12` (`css/pipeline.css?v=4` → `?v=5`)
- Modify: `TEST_CASES.md` (nuova riga P-81 dopo P-80)
- Modify: `docs/BACKLOG.md` (nuova riga B-173)
- Test: `js/lib/pipeline-guard.test.js`

**Interfaces:** nessuna.

- [ ] **Step 1: Aggiornare il test**

In `js/lib/pipeline-guard.test.js`:
- `it('every pipeline.css reference is ?v=4')` → `?v=5`, con `expect(m[1], f).toBe('5');`
- nuovo `it`:

```js
it('column bodies have a thin scrollbar (2026-10-29, ui-quick-wins)', () => {
  expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar\s*\{[^}]*width:\s*6px/);
  expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar-thumb\s*\{[^}]*var\(--border-medium\)/);
  expect(css).toMatch(/\.pb-col-body::-webkit-scrollbar-thumb:hover\s*\{[^}]*var\(--text-muted\)/);
  const sup = css.indexOf('@supports not selector(::-webkit-scrollbar)');
  expect(sup).toBeGreaterThan(-1);
  const block = css.slice(sup, css.indexOf('}\n}', sup) + 3);
  expect(block).toMatch(/scrollbar-width:\s*thin/);
  expect(block).toMatch(/scrollbar-color:\s*var\(--border-medium\)\s+transparent/);
  // Outside @supports, Chrome 121+ would drop the ::-webkit-scrollbar rules.
  const outside = css.slice(0, sup) + css.slice(sup + block.length);
  expect(outside).not.toMatch(/scrollbar-(width|color)\s*:/);
});
```

Il CSS esistente non ha altre `scrollbar-width`/`scrollbar-color` (verificato con grep); se il file usa CRLF, `'}\n}'` va reso robusto (`/\}\s*\}/`).

- [ ] **Step 2: Verificare che fallisca**

Run: `npx vitest run js/lib/pipeline-guard.test.js`
Expected: FAIL su `?v=5` e su `thin scrollbar`.

- [ ] **Step 3: Implementare**

In `css/pipeline.css`, subito dopo la regola `.pb-col-body` (riga 168):
- `.pb-col-body::-webkit-scrollbar { width: 6px; }`
- `.pb-col-body::-webkit-scrollbar-track { background: transparent; }`
- `.pb-col-body::-webkit-scrollbar-thumb { background: var(--border-medium); border-radius: var(--radius-full); }`
- `.pb-col-body::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }`
- `@supports not selector(::-webkit-scrollbar) { .pb-col-body { scrollbar-width: thin; scrollbar-color: var(--border-medium) transparent; } }`

Un commento di una riga sopra il blocco `@supports` con il motivo (Chrome 121+). In `pipeline.html` riga 12: `?v=4` → `?v=5`.

In `TEST_CASES.md`, dopo P-80:

`| P-81 | Thin column scrollbar (2026-10-29) | At ≥ 768px open a stage column with more cards than fit, in Chrome/Edge and in Firefox; then open the board at 390px | The column shows a thin grey scrollbar (darker on hover in Chrome/Edge) instead of the default one; columns that fit show none; at 390px the board scrolls as before | |`

In `docs/BACKLOG.md`, dopo B-172, nella stessa forma delle righe vicine:

`| B-173 | `2026-10-29-ui-quick-wins` (spec decision 1) | `.pb-col-body` is declared twice, in `css/pipeline.css` and in `css/style.css` (same `flex`/`min-height`/`overflow-y`); the `style.css` copy is redundant but removing it bumps `style.css` on every page | `css/style.css` lines 509-513 | open | `grep -n "pb-col-body" css/style.css css/pipeline.css`, 2026-10-29 |`

- [ ] **Step 4: Verificare che passi**

Run: `npx vitest run js/lib/pipeline-guard.test.js js/lib/page-head-guard.test.js js/lib/test-cases-parse.test.js scripts/doc-paths-guard.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add css/pipeline.css pipeline.html TEST_CASES.md docs/BACKLOG.md js/lib/pipeline-guard.test.js
git commit -m "feat(pipeline): thin scrollbar on the board columns"
```

## Indipendenza dei task

I due task sono indipendenti (file diversi, salvo `TEST_CASES.md`, toccato in righe diverse); l'ordine è indifferente.

## Decisioni aperte

1. **B-173 scritta durante il ciclo, nel Task 2.** Alternativa scartata: lasciarla al passo 2b del Gate 5. Perché: è una decisione della Spec, non un follow-up di review, e la Spec la elenca fra i file toccati.
