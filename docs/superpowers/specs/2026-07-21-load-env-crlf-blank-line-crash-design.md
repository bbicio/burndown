# Design — Fix `load_env()` crash on CRLF blank lines

**Date:** 2026-07-21
**Brief:** `docs/superpowers/briefs/2026-07-21-load-env-crlf-blank-line-crash-brief.md`
**Scenario:** 2 — Evolution (bug fix)

## Problem

`load_env()` (`scripts/test-branch.sh:24-36`) strips a trailing `\r` from `$val` (line 29) but not from `$key`. A blank line with CRLF ending has no `=` character, so the entire line (just `\r`) is read into `$key`. `$key="\r"` is neither empty (`-z` fails) nor `#`-prefixed, so it isn't skipped — it reaches `${!key+x}` (line 32), where bash errors "invalid variable name" since `\r` isn't a valid identifier. Confirmed real on this developer's actual `.env` (CRLF endings, 4 blank section-separator lines) — crashes `load_env()`, and therefore every subcommand of `scripts/test-branch.sh`, whenever `.env` is present in the script's working directory.

## Fix

Strip a trailing `\r` from `$key` too, mirroring the existing `$val` handling, before the emptiness/comment check:

```bash
while IFS='=' read -r key val; do
  key="${key%$'\r'}"
  [[ -z "$key" || "$key" == \#* ]] && continue
  val="${val%$'\r'}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  if [ -z "${!key+x}" ]; then
    export "$key=$val"
  fi
done < "$env_file"
```

A CRLF blank line now produces `key=""` after the strip, which correctly matches the `-z "$key"` skip condition instead of reaching the indirect-expansion check.

## Testing

Manual verification (no automated shell-test framework in this repo):
1. A `.env` fixture with CRLF line endings and blank section-separator lines (matching the real file's structure) no longer crashes `load_env()`.
2. Existing behaviors remain intact: `$$`-containing values preserved literally, shell-exported variables win over `.env`, missing `.env` still no-ops.

## Scope excluded

- Other already-tracked follow-ups (no `eq<0` guard for a malformed line with no `=` at all when it's non-blank, no trim of whitespace) — not touched here.
- No changes outside `load_env()`.
