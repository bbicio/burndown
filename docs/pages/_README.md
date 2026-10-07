# docs/pages/ — why this exists

`CLAUDE.md` had grown to ~970 lines, most of it a per-page changelog inside its "File structure"
section (~600 lines): for every Vue page, a narrative of every implementation cycle — methods
touched, first-attempt bugs, spec/report references. That content is loaded into every session
regardless of which page (if any) the task touches, so its token cost is paid every time while its
value is realized only when working on that specific page.

`ARCHITECTURE.md` was considered as the destination first (2026-09) but rejected: it's organized by
system/layer (stack, roles, auth flows, DB schema, API reference, Docker), not by page — its own
Directory Structure section already keeps per-page entries short and points elsewhere for detail.
Merging the narrative in would have reproduced the same problem in a different file.

So: one file per page, `docs/pages/<page-name>.md`, read on demand. `CLAUDE.md`'s Pages table keeps
a one-line "Purpose" summary and a link; the File Structure block's per-page entry becomes a one- or
two-line pointer instead of the full narrative. `/sync-docs` (`.claude/commands/sync-docs.md`) has
the binding routing rule for future cycles.

First split (2026-09-22): `portfolio.html` → `docs/pages/portfolio.md`, as a trial before extending
to the other pages. Extend the same pattern to the next page only once a real cycle has proven a
future `/sync-docs` run actually writes to the right place.

Completed (2026-10-08): the per-page entries were removed from `CLAUDE.md`'s File Structure block
entirely, since the Pages table already held route, purpose and the `docs/pages/` link — the block
listed every page a second time. The same cycle applied the routing rule to the non-page entries that
had never been split (`css/`, the shared classic `js/*.js` scripts, `api/src/services/`, user
administration, `scripts/shoot.mjs`, and a few routes), taking the block from 38 KB to ~11 KB and
`CLAUDE.md` from 115 KB to ~88 KB. The rule that keeps it there is in `.claude/skills/sync-docs/SKILL.md`
section 2: the block is an index of one- or two-line entries, and an entry that outgrows that is a
regression to fix in the same `/sync-docs` run.
