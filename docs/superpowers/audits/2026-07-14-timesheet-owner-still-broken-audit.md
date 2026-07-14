# Timesheet Owner Still Showing Role — Audit

## Scope

Negotiated with the user: investigate why Resource Planning's By Owner view (`planning.html`, `portfolio.html`) still shows the role code instead of the real person's name, despite the `trimRowKeys` fix (commit `f3c0e93`, merged earlier in this session's timeline) being present in `api/src/routes/timesheets.js` on disk. Ground truth: the user confirmed the real uploaded file's owner-name column is `Owner: Name`, and — mid-audit — provided the actual file (`C:\Users\fafortini\Downloads\BERMITS.xlsx`, project code `HITA.000001201`) and performed two live re-upload attempts via the browser UI (after explicitly deleting the existing rows first) while this audit was in progress, both producing the same symptom.

## Method

Live inspection of the running `pdash-db`/`pdash-api` Docker containers via `docker exec`, and controlled reproduction attempts at increasing fidelity to isolate where correct and incorrect behavior diverge: (1) direct in-process parsing of the real file, (2) direct invocation of the real exported route-handler function, (3) a hand-built raw multipart HTTP request to the api container's own port, (4) the same request chained through the real, unmodified `multerMiddleware`, (5) a real end-to-end `curl` request through nginx, replicating the actual browser upload path. No code was modified during this audit.

## Findings

### F1 — Running `pdash-api` process predates the timesheet column-mapping fixes; serving stale in-memory code despite current code on disk

**Type:** Deployment / operational (not a code defect).
**Severity:** Critical (fully blocks the fix that was already merged and reviewed from taking effect).

**Evidence:**
- `docker inspect pdash-api --format '{{.State.StartedAt}}'` → `2026-07-05T21:55:15.267153418Z`.
- `git log --oneline -- api/src/routes/timesheets.js`:
  ```
  f3c0e93 fix: trim row object keys before column-map lookup in timesheet upload
  713c881 fix(api): prevent ambiguous timesheet headers from mapping to more than one field
  853e2fd fix(api): reject entire timesheet upload on any unparseable date   ← last commit before 2026-07-06
  ```
  Both `713c881` (the 2026-07-06 header-collision fix) and `f3c0e93` (the trimRowKeys fix, this session) post-date the container's start time. The running process has never loaded either fix.
- `docker exec pdash-api grep -n "trimRowKeys" /app/src/routes/timesheets.js` shows the fix **is** present in the file on disk (volume-mounted from the host, always current) — confirming the gap is between disk and the running process's `require()` cache, not a merge/deploy-artifact problem.
- `api/Dockerfile:12`: `CMD ["node", "src/index.js"]` — plain `node`, not `nodemon` or any file-watcher. `docker-compose.yml:39-40` mounts `./api/src:/app/src` with the comment `# hot reload in development`, but nothing in the stack actually watches for changes and restarts the process. The comment describes intended behavior that isn't wired up — there is no hot reload for the API in this stack as currently configured. (`CLAUDE.md`'s "Hot reload for the API... picked up by nodemon" line is inaccurate for what's actually running; see Out-of-scope/roadmap.)
- Reproduction ladder, all against the exact same file (`BERMITS.xlsx`, md5 `36a401e0bdec8d2eeebd831e8b0d4090`, 236 rows, real headers `Date | Job Role: Name | Hour Type | Owner: Name | Hours | Task/Issue | Notes | D365 Project ID | WF Project Name` — note "Job" and "Role: Name" are a **single** merged column in the real file, `"Job Role: Name"`, differing from the two-separate-columns assumption in the 2026-07-09 audit and its test fixtures):
  | Path | Result |
  |---|---|
  | Fresh `node -e` process: `XLSX.read` → `trimRowKeys` → `resolveColumnMap` → field extraction, reading the file straight off disk | **Correct** — `role ≠ owner` for all 236 rows, real names (`"Gianfranco Petraglia"`, etc.) |
  | Fresh `node -e` process: directly invoking the real exported route handler function (`router.stack[3].route.stack[2].handle`) with a manually-built `req.file.buffer` | **Correct** — 0/236 `role === owner` |
  | Fresh `node -e` process: hand-built multipart body → real `multerMiddleware` → real handler, chained in-process (still a fresh process, still reads current disk file via the handler's own `require`s) | **Correct** — 0/236, and `multerMiddleware`'s output buffer verified byte-identical (md5 match) to the source file |
  | `curl` from the host, through nginx, to the real long-running `pdash-api` process (the actual browser-equivalent path) — reproduced **twice**, including after the user manually deleted the rows and re-uploaded fresh via the UI | **Wrong** — 236/236 `role === owner`, all 7 distinct values are role/team codes, never person names |
  | Hand-built raw HTTP request sent directly to the long-running process's own port (3000), bypassing nginx | **Wrong** — same 236/236 result |

  The only variable that changes between the "correct" and "wrong" rows is whether the code runs in a **fresh process** (reads current disk state) or is served by **the long-running `pdash-api` process** (stale `require()` cache from container start). Every fresh-process reproduction is correct; every long-running-process reproduction is wrong, including two independent real end-to-end paths (nginx+curl, and raw HTTP directly to the process). This isolates the fault to process staleness, not to any remaining logic defect in `resolveColumnMap`/`trimRowKeys`/the handler.

**Root cause:** `pdash-api` has been running continuously since 2026-07-05T21:55Z and was never restarted after the 2026-07-06 and 2026-07-13 timesheet-mapping fixes were merged. Because the API container has no hot-reload mechanism (despite the misleading docker-compose comment), the file-on-disk being current is necessary but not sufficient — the process must also be restarted to load it. Every timesheet upload since 2026-07-06, on this environment, has been served by the **pre-`713c881`** version of `resolveColumnMap` — the original ambiguous-header-collision-prone implementation the 2026-07-09 audit's F1 finding described, which is why the symptom (`owner === role` for every row) matches that original finding exactly rather than the more subtle whitespace-trim symptom `f3c0e93` fixed.

**Remediation (not applied during this audit, per Step 4):** restart the `pdash-api` container (`docker compose restart api`, or `docker compose up -d --force-recreate api`) to load current code. After restart, the user's already-demonstrated re-upload of `BERMITS.xlsx` should be repeated once more — this audit's own reproduction runs wrote correct data to `HITA.000001201` as a side effect of testing, but that was written directly via one-off `node -e` scripts and hand-built HTTP requests, not through the restarted production server, and should not be treated as the canonical fix confirmation. Every other project code uploaded since 2026-07-06 is very likely affected identically and will need re-uploading after the restart, for the same reason documented in the 2026-07-09 audit and its fix cycle (full replace on upload, no migration needed — just re-upload through the UI once the server is actually running current code).

## Ruled out

- **`resolveColumnMap`/`trimRowKeys` logic itself**: verified correct against the real file's actual header structure (including the "Job Role: Name" merged-column detail, which the code handles correctly since `role`'s candidate list matches on the substring `role` anywhere in the header, not requiring an exact/separate column). Five independent reproduction paths in fresh processes all produced correct output.
- **Multer / multipart parsing corruption**: `multerMiddleware`'s output buffer was verified byte-identical (md5) to the source file.
- **`express.json()` or other global middleware interfering with the multipart body stream**: the middleware chain (`cors`, `express.json()`, `cookieParser`, mounted in `api/src/index.js` before the timesheets router) doesn't consume the request body for non-`application/json` content types; ruled out empirically since a hand-built request straight to the process's own port (bypassing nginx, but still hitting the same long-running process) reproduced the bug identically to the nginx-routed `curl` request — nginx and the global middleware chain are not differentiators.
- **Stale/different file being uploaded**: ruled out by the user explicitly deleting the existing DB rows and re-uploading via the UI while this audit was in progress, reproducing the identical symptom against a freshly-confirmed file (md5-verified).
- **Frontend sending a transformed/re-encoded file**: `js/api.js:137-142` appends the raw `File` object to `FormData` and posts it unmodified — no client-side XLSX parsing or transformation exists in the frontend upload path.

## Out of scope / roadmap notes

- **`CLAUDE.md`'s Development section** states "Hot reload for the API: `./api/src` is volume-mounted into the container, so Node.js file changes are picked up by nodemon without a rebuild." This is materially inaccurate for the current stack (`api/Dockerfile` runs plain `node`, no `nodemon` anywhere in the dependency tree or Docker setup) and should be corrected — either by fixing the documentation to state a restart is required after backend changes, or by actually wiring up `nodemon` for the dev compose path. This is a documentation/tooling gap discovered while root-causing F1, not something this audit's scope covers fixing.
- **No visible restart step in this project's own process.** `docs/superpowers/PROCESS.md` and `/finish-cycle` don't currently mention restarting the API container as part of shipping a backend change — every prior backend fix cycle this session (the 2026-07-06 and 2026-07-13 timesheet fixes) was verified via `docker exec pdash-api node --test ...` or fresh `node -e` processes, which — as this audit demonstrates — can pass cleanly while the actual long-running server never picks up the change. Worth considering as a process gap for a future cycle: whether `/finish-cycle` or the deploy step should restart `pdash-api` after a backend-touching merge, or at minimum flag it as a required manual step.

Report ready. Next step: audit-to-brief to translate the findings into fix cycles, or stop here if the audit doesn't call for immediate fixes.