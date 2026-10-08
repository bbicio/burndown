# scripts/shoot.mjs

Renders pages of the running app with headless Chrome and saves one PNG per width, for comparing a redesign against its design boards (2026-10-07). Zero dependencies (global `fetch` + `WebSocket`, Node ≥ 22; the host has Node 24): it logs in via `POST /api/auth/login`, injects the `pdash_token` cookie over the DevTools Protocol, emulates each width and captures.

This file holds the full detail for `scripts/shoot.mjs`. `CLAUDE.md`'s File structure entry keeps only a short summary plus a pointer; when using or changing this script, read this file, not that line. See `/sync-docs`'s routing rule for where future changes belong.

## Invocation

```bash
node scripts/shoot.mjs --url /costgrid.html?cgId=UUID --out shots/cg --widths 1440,1024,768
```

Plus `--full`, `--settle`, `--base`, `--height`.

## `--eval` (2026-10-07)

`--eval '<js>'` / `--eval-file <path>` / `--eval-settle <ms>` (default 400) run JavaScript in the page after the settle wait and before the capture, once per width, so interaction-dependent states (an open popover, a dropdown, a modal, a scrolled grid) are capturable instead of needing a manual screenshot. A page exception fails the run loudly (`shoot.mjs failed: --eval failed: …`, exit 1, no PNG written) rather than saving a misleading image.

Prefer `--eval-file` for anything long — Windows shell quoting makes inline snippets fragile. The script cannot click directly, so interaction-dependent states are reached through `--eval`; manual capture stays the fallback for states no snippet can reach.

## Credentials

Put `SHOOT_EMAIL`/`SHOOT_PASSWORD` in the gitignored `.env` — the script parses that file itself, so do **not** `. ./.env` first (it holds non-shell-safe values and the source aborts midway, leaving the vars empty). `--email`/`--password` and exported env vars also work.

## Gotchas that have actually bitten

- **From Git Bash on Windows, prefix the command with `MSYS_NO_PATHCONV=1`** (2026-10-08). MSYS rewrites any argument that looks like a Unix path, so `--url /portfolio.html` reaches the script as `C:/Users/.../Git/portfolio.html`; the URL built from it 404s, nginx's `try_files … /index.html` serves the redirect stub instead, and the capture silently shows **pipeline.html** — a plausible-looking screenshot of the wrong page, with no error. Diagnosed from the nginx access log, where the referer reads `http://localhost:8081/C:/Users/…/portfolio.html`. The same `MSYS_NO_PATHCONV=1` guard already used for the `docker run` one-liner in CLAUDE.md.
- **From a worktree, `--base http://localhost` renders the main checkout, not the worktree** (`docker-compose.yml:100` mounts `./` of the directory the stack was started from): bring up `scripts/test-branch.sh up` first and pass `--base http://localhost:8081`.
- Use `--settle 3000` or more — at the default settle the page renders half-loaded, complete-looking but showing another source's data.
- **Claude in Chrome is blocked for `localhost` by org policy here, but headless Chrome is not** — so "the page can't be rendered in this environment" is not a valid reason to skip visual verification. The PNGs must then actually be read back and compared.

See `docs/superpowers/PROCESS.md` §6.3/§6.6.
