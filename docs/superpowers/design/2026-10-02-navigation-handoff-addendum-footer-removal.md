# PDash — Navigation Handoff Addendum: Footer Removal
Supplements `navigation-handoff.md` (Cycle B). This addendum **replaces that document's footer-related statements only** — every other section of the main handoff is unaffected and still applies as written.

**Change requested:** eliminate the fixed footer entirely, rather than leave it unchanged. This aligns the real app with the Design-canvas navigation mockups (`Dopo.dc.html`, `DopoCollassata.dc.html`, `DopoPannello.dc.html`, artifact `https://claude.ai/artifact/5Kj2qAeCaXCy9iAKEYLoxg`) — none of them show a fixed footer; the content area runs to the bottom edge in all three.

---

## Correction to §1 (Summary)

The main handoff's "what stays as-is" list originally included the footer. **Remove it from that list** — the footer does not stay; it is deleted.

## Correction to §6 (Breadcrumb bar and footer)

Replace the footer paragraph with:

> **Footer: eliminated.** `.app-footer` (`css/style.css:32`, `position:fixed; height:100px`, navy background, 3px magenta top border) and the block that injects it (`js/nav.js:153–161`, including `document.body.style.paddingBottom = '100px'` at `js/nav.js:160`) are removed entirely — not replaced with a thinner footer, removed outright, consistent with no canvas board showing one. No footer content (the "2026 PDash" copyright line) is preserved elsewhere — it carries no functional information, and is redundant with the logo already shown in the navbar.

## Addition to §9 (File-by-file change list)

Under `js/nav.js`, add:
- Lines 153–161: remove the entire `// ── FOOTER ──` block (element creation, injection, `paddingBottom`)

Under `css/style.css`, add:
- Remove the entire `.app-footer` rule (line 32 and its declarations)

## Correction to §10 (Dependent layout adjustments)

The `.pb-board-root` row changes in kind, not just value:

> `css/style.css:364–369` (`.pb-board-root`) — `calc(100vh - 206px)` subtracted navbar (106) + footer (100). With the footer eliminated and the navbar trim from §3c applied, the new calc is **navbar only**, not navbar+footer: `calc(100vh - <new-navbar-height>)`. This is a bigger change than updating a constant — it also requires removing the `padding-bottom:100px` that `js/nav.js:160` applied to `body` to compensate for the fixed footer. Without that removal, every page would show a 100px empty gap at the bottom for no reason.

## Addition to §12 (Verification checklist)

| Screen | Must look different | Must stay identical |
|---|---|---|
| Any page | No empty space at the bottom (the body's `padding-bottom:100px` must disappear along with the footer) | Content is not clipped or overlapped where the footer used to sit |

---

## Net effect on §10's height math (for reference)

Old: navbar (106, per CLAUDE.md's figure — see main handoff §3b for the unresolved 106-vs-110 discrepancy) + footer (100) = 206.
New: navbar only (either the current figure or the §3c-trimmed one, pending the browser verification the main handoff already recommends) + **0** for footer. The footer term drops out of every dependent calc, not just `.pb-board-root` — re-run the repo-wide `calc(100vh` / fixed-footer-offset search (main handoff §10's method) after this change to confirm no other file assumed the 100px footer gap that wasn't caught in this pass.
