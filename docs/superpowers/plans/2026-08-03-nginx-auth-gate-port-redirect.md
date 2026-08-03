# Nginx Auth-Gate Port-Redirect Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop nginx's auth-gate redirect from silently sending unauthenticated visitors on a branch test stack (any non-80 port) to the main stack's login page on port 80, by making nginx emit a relative `Location` header instead of an absolute one it can't construct correctly.

**Architecture:** Single-line config change to `nginx.conf` (`absolute_redirect off;`, server-level directive). No application code, no other files. Verified via `curl` before/after on both the main stack (port 80) and an isolated branch stack (non-80 port).

**Tech Stack:** nginx (`nginx:alpine` image, `docker-compose.yml`), Docker Compose, `curl` for verification.

## Global Constraints

- `nginx.conf` is shared and bind-mounted identically into every stack (`docker-compose.yml:86`) — the fix must be generic (works for any host:port), not hardcoded to specific ports (Brief, Constraints).
- Must not modify `/auth-check` (`nginx.conf:13-21`) or the `@to_login` target itself (`nginx.conf:24-26`) — this is a presentation-layer fix only (Brief, Constraints).
- Must not alter the main stack's current (already-correct) behavior on port 80 (Brief, Constraints; Design, Acceptance criteria).
- No new external dependency; image stays `nginx:alpine` (Brief, Constraints).
- Out of scope: cross-port cookie sharing, `scripts/test-branch.sh`'s fixed port scheme, client-side redirect code (`js/nav.js`, `js/api.js` — already confirmed unaffected), and any reverse-proxy/TLS-termination support (Brief, Explicitly excluded scope).

---

### Task 1: Add `absolute_redirect off;` to nginx.conf and verify the fix

**Files:**
- Modify: `nginx.conf:8-9` (inside the `server { listen 80; ... }` block, immediately after `listen 80;`)

**Interfaces:** None — this task is self-contained; no other task depends on it and it depends on nothing else in this plan.

- [ ] **Step 1: Reproduce the current (broken) behavior on the running main stack**

Confirm the main stack is up (`docker ps` should show `pdash-nginx` as `Up`). Run:

```bash
curl -s -D - -o /dev/null http://localhost/pipeline.html
```

Expected (current, broken): a `302` response with an **absolute** `Location` header, e.g.:
```
HTTP/1.1 302 Moved Temporarily
Location: http://localhost/login.html
```

- [ ] **Step 2: Edit `nginx.conf`**

Current content (`nginx.conf:7-10`):

```nginx
  server {
    listen 80;

    # ── AUTH SUBREQUEST ────────────────────────────────────────────────────────
```

Change to:

```nginx
  server {
    listen 80;

    # nginx has no visibility into Docker's external port mapping (it only ever
    # sees its own internal listen port, 80) — an absolute redirect nginx builds
    # itself would always lose the real port the client connected on. Leaving the
    # Location header relative lets the browser (which does know the real URL)
    # resolve it correctly, port included.
    absolute_redirect off;

    # ── AUTH SUBREQUEST ────────────────────────────────────────────────────────
```

- [ ] **Step 3: Reload nginx to pick up the config change**

```bash
docker exec pdash-nginx nginx -s reload
```

Expected: no output (or a log line acknowledging the reload), exit code 0. `nginx -t` runs implicitly as part of `-s reload` and will fail loudly if the config has a syntax error.

- [ ] **Step 4: Verify the fix on the main stack (port 80)**

```bash
curl -s -D - -o /dev/null http://localhost/pipeline.html
```

Expected (fixed): a `302` response with a **relative** `Location` header:
```
HTTP/1.1 302 Moved Temporarily
Location: /login.html
```

- [ ] **Step 5: Verify the fix on an isolated branch stack (non-80 port)**

If no branch stack is currently running, start one from a feature branch checkout:

```bash
scripts/test-branch.sh up
```

Note the frontend port it reports (e.g. `8081`). Then, replacing `8081` with the actual port:

```bash
curl -s -D - -o /dev/null http://localhost:8081/pipeline.html
```

Expected: same relative `Location: /login.html` — and, critically, following the redirect stays on the branch stack's own port, not port 80:

```bash
curl -s -o /dev/null -w '%{url_effective}\n' -L http://localhost:8081/pipeline.html
```

Expected: `http://localhost:8081/login.html` (not `http://localhost/login.html`).

Tear down the branch stack once verified (skip if you started this task with one already running for other reasons):

```bash
scripts/test-branch.sh down
```

- [ ] **Step 6: Verify no regression for an authenticated user**

This step only re-confirms reasoning already covered by the Design (Error handling section): `absolute_redirect off` only changes how nginx formats a `Location` header on a redirect it already decided to send — it has no effect on whether `/auth-check` returns 401 in the first place. An authenticated request (valid JWT cookie) never reaches `@to_login` at all, so there is nothing new to verify here beyond confirming the main stack's homepage still loads normally for a logged-in session you already have open in a browser — no new curl command needed.

- [ ] **Step 7: Commit**

```bash
git add nginx.conf
git commit -m "fix(nginx): stop auth-gate redirect from dropping the external port

absolute_redirect off makes nginx emit a relative Location header instead of
one it constructs itself (always missing the real external port, since nginx
only ever sees its own internal listen port). The browser resolves the
relative path against the actual request URL, port included -- fixes
unauthenticated visits on an isolated branch test stack (any non-80 port)
getting redirected into the main stack's login page on port 80 instead of
their own branch stack's."
```

---

## Self-Review

- **Spec coverage:** Design's single change (the `absolute_redirect off;` line) → Task 1 Step 2. Design's verification section (main stack before/after, branch stack, authenticated non-regression) → Task 1 Steps 1, 4, 5, 6. Design's "no other files touched" constraint → Task 1's Files section lists only `nginx.conf`. Nothing in the Design or Brief is left uncovered.
- **Placeholders:** none — every step has literal commands and expected output, no "TBD"/"add appropriate handling"/deferred content.
- **Type/name consistency:** N/A — no code-level interfaces in this plan (single config directive, no functions/variables shared across steps).
