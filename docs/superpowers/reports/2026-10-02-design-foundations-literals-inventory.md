# Design foundations (Cycle A) — remaining hardcoded colour literals

Scan date: 2026-10-02, after the Cycle A changes. Scope: the files edited in the cycle. Command (Node, run from the repo root): count of `#rgb[a]` / `rgb()` / `rgba()` literals per file.

Exact-match literals (value equal to an existing token) were replaced in `css/*.css` and in the `<style>` blocks of `login.html`, `activate.html`, `reset-password.html` (guarded by `js/lib/foundations-guard.test.js`). What remains has **no exact token** or lives where this cycle does not go (inline attributes, JS, script-built colours).

| File | Remaining literals | Disposition |
|---|---|---|
| `css/style.css` (7) | `#fdf0f5`, `#f9e8f0`, `#f8f9ff` (one-off tints); `rgba(255,255,255,.55/.9/.07)` (navbar tab alphas); `rgba(0,0,0,.13)` (`.pb-card:hover` shadow, near `--shadow-md` but not equal) | defer — navbar alphas to Cycle B, tints and the card shadow to the pipeline page cycle |
| `css/admin-crud.css` (9) | `#f3f4f6` ×2, `#9ca3af` ×2, `#f9fafb`, `#fafafa`, `#dcfce7`, `#166534`, `#374151` | defer — no token; `.badge-st-*` colours are out of scope by decision; `#9ca3af` equals `--border-dark` but is used as text colour (semantic mismatch, would need a text token) |
| `js/core.js` (6) | `#fff` ×6 | defer — inline `style=""` strings built in JS templates (page logic territory); equals `--text-inverse` |
| `portfolio.html` (6) | `#fff` ×2, `#495057`, `#fd7e14`, `rgba(13,110,253,0.07)`, `#ffffff` | defer — inline attributes and JS: `#fd7e14` (= `--kpi-orange`, in a JS return value), `#ffffff` (html2canvas background), `#495057` (badge text, no token), the translucent chart fill (no token form) |
| `login.html` (5) | `rgba(0,0,0,0.35)`, `#9ca3af`, `#374151`, `#f3f4f6`, `#fff` (inline footer) | defer — no token / inline attribute |
| `activate.html` (11) | `#e5e7eb` ×2 (JS strength-bar fallback), `rgba(0,0,0,0.35)`, `#9ca3af`, `#374151`, `#f3f4f6`, strength-bar colours `#ef4444 #f97316 #eab308 #22c55e`, `#fff` (inline footer) | defer — JS and one-off palette (password-strength meter) |
| `reset-password.html` (10) | same as `activate.html` minus `#f3f4f6` | defer — same |
| `css/tokens.css` (≈86) | token definitions | not offenders |

**Not scanned here** (owned by the page-by-page cycles): about 800 literals in `config.html`, `planning.html`, `costgrid.html`, `pipeline.html`, other pages' `<style>` blocks and inline attributes, and the remaining JS template literals.

Suggested tokens for later cycles, if the page designs confirm them: a text-on-neutral grey for `#9ca3af`/`#374151`, a strength-meter palette (four steps), and a shared `rgba(0,0,0,…)` modal-backdrop/shadow token.
