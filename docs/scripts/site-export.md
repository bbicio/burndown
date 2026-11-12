# scripts/site-export.mjs — site/process classification and copy

`scripts/site-export.rules` says, for every tracked file, whether it belongs to the site or to the process. `scripts/site-export.mjs` shows that for a commit and copies the site files of a commit into a local clone of the Bitbucket repository. It never runs `git commit` or `git push`; the commit and the push are a later cycle.

Spec: `docs/superpowers/specs/2026-11-12-site-export-classification-design.md`. Plan: `docs/superpowers/plans/2026-11-12-site-export.md`.

## Use

```bash
npm run export:list                      # verdict and rule for every file of main
npm run export:list -- <ref>             # the same for another ref
npm run export:copy -- --dry-run         # what a copy would do; writes nothing
npm run export:copy                      # asks y/N, then writes
npm run export:copy -- --yes --sha <sha> # writes without asking, only if the ref resolves to <sha> and no warning was printed
npm run export:copy -- --yes --sha <sha> --dry-run   # the same checks, writes nothing
```

The destination is `--dest <dir>`, else the environment variable `PDASH_EXPORT_DEST`; it is never stored in the repo. `copy` takes the ref as its first positional argument (default `main`). Both commands run from this repo; `list` exits 1 when a file matches no rule, and `copy` then refuses.

## What it reads

- **The commit, never the working tree.** Uncommitted changes and gitignored files cannot reach the copy.
- **The rules** from `scripts/site-export.rules` next to the script, not from the exported commit.
- Rule format: one `include <glob>` or `exclude <glob>` per line, `#` on its own line. The first matching rule wins; there is no catch-all, so a path no rule covers is `unclassified`. Globs are anchored on the whole path; a trailing `/` is a directory and everything below it. The pure parser, classifier and copy planner are in `scripts/lib/site-export.mjs`.

## What `copy` does

1. Refuses when any tracked file is `unclassified`, or when an included entry is not a plain file (symlink, submodule or executable).
2. Validates the destination: the root of a git clone that is not the source repo, not inside it, not containing it, and not a linked worktree of it.
3. Compares the commit's included files with the destination's regular files (tracked and untracked, never gitignored). A text file that differs only by CRLF vs LF counts as unchanged.
4. Refuses, before writing anything, a plan that cannot be applied: a symlink in the way, a folder holding files that stay where a file must go, or a path the destination's own `.gitignore` would ignore.
5. Prints added, modified and deleted files; untracked destination files that would be deleted are labelled and counted.
6. Asks `y/N` on an interactive terminal and refuses without one. `--yes --sha <40 lowercase hex>` replaces the question: the two flags come together, each at most once, and a `--sha` that is not 40 lowercase hex characters is refused. Before step 1 the copy refuses when the ref does not resolve to that SHA, also with `--dry-run`. Past step 5 it refuses when a warning was printed (a commit not contained in `origin/main`, or untracked destination files that would be deleted), because no one is there to answer N. Every other refusal above still applies, and `--yes --dry-run` writes nothing.
7. Deletes first, then writes, so a file can become a folder.

## Guard

`scripts/site-export-guard.test.js` fails when a tracked file matches no rule, and when a file that must never be public (`docs/`, `.claude/`, `scripts/`, tests, the root toolchain, the files the spec names) is included. Its list of never-included paths is a deliberate hand-kept copy: deriving it from the rules would make the check circular. A new file under a block-included folder (`js/`, `css/`, `handbook/`, `api/src/`) is included without a decision unless it matches that list.

## Known limits (accepted at the cycle's Gate 3)

- A commit that only changes a file's line endings is not propagated to a destination that holds the old ones.
- Untracked, non-ignored files in the destination are deleted by design and git cannot recover them; the summary warns.
- An included executable file makes the whole copy refuse.
- Needs git 2.31 or later.
- The destination's contents are read fully into memory before the comparison.
