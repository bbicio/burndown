# Load-env CRLF Blank-Line Crash Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `scripts/test-branch.sh`'s `load_env()` from crashing with "invalid variable name" when `.env` has CRLF line endings and blank lines.

**Architecture:** Strip a trailing `\r` from `$key` (mirroring the existing `$val` handling) before the emptiness/comment check in `load_env()`'s read loop, so a CRLF blank line correctly resolves to an empty key instead of the literal `\r` character.

**Tech Stack:** Bash (`scripts/test-branch.sh`).

## Global Constraints

- No changes outside `load_env()` (`scripts/test-branch.sh:24-36`).
- Existing behaviors must remain intact: `$$`-containing values preserved literally, shell-exported variables win over `.env`, missing `.env` still no-ops.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/test-branch.sh` (modify) | `load_env()`'s read loop gains a `key="${key%$'\r'}"` strip, mirroring the existing `$val` handling. |

---

### Task 1: Strip trailing `\r` from `$key` in `load_env()`

**Files:**
- Modify: `scripts/test-branch.sh:27-28`

**Interfaces:**
- Consumes: nothing from other tasks (only task in this plan).
- Produces: nothing consumed by further tasks.

- [ ] **Step 1: Write the verification fixture and command, run it, confirm it currently fails**

```bash
mkdir -p /tmp/load-env-crlf-check
printf 'POSTGRES_USER=custom_user\r\n\r\nPOSTGRES_DB=custom_db\r\n' > /tmp/load-env-crlf-check/.env
bash -c "
  set -euo pipefail
  cd /tmp/load-env-crlf-check
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"DB=\$POSTGRES_DB\"
"
```

Expected (confirms the bug still reproduces before the fix): the command exits non-zero with an error containing `invalid variable name`, and no `USER=`/`DB=` lines are printed — the blank CRLF line between the two variables crashes `load_env()` before it finishes.

- [ ] **Step 2: Apply the fix**

In `scripts/test-branch.sh`, replace:

```bash
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
```

with:

```bash
  while IFS='=' read -r key val; do
    key="${key%$'\r'}"
    [[ -z "$key" || "$key" == \#* ]] && continue
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n scripts/test-branch.sh
```

Expected: no output, exit 0.

- [ ] **Step 4: Re-run the Step 1 verification command, confirm the fix**

```bash
bash -c "
  set -euo pipefail
  cd /tmp/load-env-crlf-check
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"DB=\$POSTGRES_DB\"
"
```

Expected output:
```
USER=custom_user
DB=custom_db
```

- [ ] **Step 5: Verify no regression on the existing behaviors**

```bash
mkdir -p /tmp/load-env-crlf-check2
printf 'POSTGRES_USER=custom_user\r\nPOSTGRES_PASSWORD=P4$$word123__\r\n' > /tmp/load-env-crlf-check2/.env
bash -c "
  set -euo pipefail
  cd /tmp/load-env-crlf-check2
  export POSTGRES_USER=shell_wins
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\$POSTGRES_USER\"
  echo \"PASS=\$POSTGRES_PASSWORD\"
"
mkdir -p /tmp/load-env-crlf-missing
bash -c "
  set -euo pipefail
  cd /tmp/load-env-crlf-missing
  $(sed -n '/^load_env()/,/^}/p' scripts/test-branch.sh)
  load_env
  echo \"USER=\${POSTGRES_USER:-pdash}\"
"
```

Expected output:
```
USER=shell_wins
PASS=P4$$word123__
USER=pdash
```

The first block confirms shell-exported precedence still wins and `$$` is still preserved literally (not expanded). The second confirms a missing `.env` still falls back to the hardcoded default.

- [ ] **Step 6: Clean up scratch directories**

```bash
rm -rf /tmp/load-env-crlf-check /tmp/load-env-crlf-check2 /tmp/load-env-crlf-missing
```

- [ ] **Step 7: Commit**

```bash
git add scripts/test-branch.sh
git commit -m "$(cat <<'EOF'
fix: strip trailing CR from load_env()'s key, not just its value

A blank line in a CRLF-terminated .env has no `=`, so the entire line
(just \r) was read into $key instead of $val. \r is neither empty nor
#-prefixed, so it reached ${!key+x} and crashed bash with "invalid
variable name" — breaking every scripts/test-branch.sh subcommand
whenever a real CRLF .env (with blank section-separator lines, as this
developer's actual .env has) was present in the working directory.
EOF
)"
```

---

## Self-Review

**Spec coverage:** Design's single "Fix" section → Task 1 Step 2. Design's "Testing" section (2 verification points) → Task 1 Steps 4-5.

**Placeholder scan:** No TBD/TODO; every step has literal, complete content.

**Type consistency:** N/A (bash, single-task plan, no cross-task interface).

## Out of scope (per the brief)

- Other already-tracked follow-ups (no `eq<0` guard for a malformed non-blank line with no `=`, no whitespace trim).
- No changes outside `load_env()`.
