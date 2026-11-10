# Production checklist

Things to verify the first time the app runs outside a development machine, and again after any change of hosting, proxy, domain or mail provider. Each item says how to check it and what a failure looks like. Tick them in a copy of this file or in the deploy ticket; do not tick them here.

## Before the deploy

- [ ] **Backup.** `scripts/backup-db.sh` has produced a fresh dump. Failure: no file in `backups/`.
- [ ] **Migrations applied, in order.** Every file of `api/src/db/migrations/` is applied; `docs/db/migrations.md` lists them. Check: `docker exec pdash-db psql -U pdash -d pdash -c "\dt"` shows `login_challenges` and `trusted_devices`, and `\d users` shows `two_step_method` and `password_changed_at`. Failure: the first login answers 500.
- [ ] **Environment variables are set and stable.** `JWT_SECRET`, `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `APP_URL`, `NODE_ENV=production`. A new `JWT_SECRET` signs every user out and invalidates every open sign-in code; it does not touch trusted devices. The first deploy of the session check (B-414) also signs every user out once: a token signed before it is refused. `.env.example` lists the names.
- [ ] **`APP_URL` is the public address.** Links in invitation, reset and share emails are built from it. Failure: links point at `localhost`.

## Network and proxy (B-415 in `docs/BACKLOG.md`)

- [ ] **HTTPS end to end.** With `NODE_ENV=production` the session, sign-in and device cookies are `Secure`. Check in the browser's cookie panel after a login: `pdash_token` is Secure and present. Failure: the login succeeds, the next page sends the user back to the login page.
- [ ] **How many proxies sit in front of the API.** `api/src/index.js` trusts exactly one hop (nginx). If anything else is in front of nginx (a load balancer, a corporate reverse proxy, a hosting platform), the hop count must change. Check: from two different networks, fail a login on purpose and look at the API's view of the address, or fail it more than the per-address limit allows from one client and confirm another client is not locked out. Failure: one user's failed logins answer "Too many attempts" to everybody.
- [ ] **The proxy forwards `X-Forwarded-For` and does not accept a client-supplied one.** The edge proxy must overwrite the header, not append to what the client sent.
- [ ] **The API port is not reachable from outside.** `docker-compose.yml` publishes no port for `api` (pinned by `scripts/compose-api-port.test.js`); an `api` container created before that change keeps the port until it is recreated (`docker compose up -d api`). Check from another machine: `curl -i http://<host>:3000/api/auth/me` must not answer. Failure: any answer.
- [ ] **Cookie paths survive the proxy.** The challenge and device cookies are scoped to `/api/auth`. The app must be served from the root of its host, with `/api/` reaching the API unchanged. Failure: the code step answers "Sign-in expired" at once.
- [ ] **`/api/auth/*` is not cached** by a CDN or proxy. Failure: a user sees another user's profile, or a stale sign-in state.

## Mail

- [ ] **A real account receives the sign-in code.** Sign in with a real address; the mail arrives within a minute and not in spam. Failure: the page shows "We couldn't send the email" (the SMTP server is unreachable or refuses the sender) or the mail never arrives (sender authentication: SPF, DKIM, DMARC of the sending domain).
- [ ] **The sender address and name are acceptable** to the recipients' mail system (`SMTP_USER` is the sender).
- [ ] **The SMTP timeouts are tolerable.** The login answers only after the mail is handed over; an unreachable SMTP server delays the answer by the timeouts in `api/src/services/email.js`.
- [ ] **A way in if mail is down.** Someone with shell access knows `docker exec pdash-api node src/two-step-code.js <email>` (prints a code for an open sign-in; the password is still required) and `node src/trust-device.js <email>` (mints a trusted device).

## Smoke test with a real user (about ten minutes)

- [ ] Sign in: password, then the code; the session opens and the Terms gate behaves as before.
- [ ] A wrong code shows the remaining attempts; after the last attempt the sign-in is locked and the password is needed again.
- [ ] "Resend code" waits, then sends a new code; the old one stops working.
- [ ] "Trust this device" skips the code on the next sign-in from the same browser; Profile → Trusted devices lists it as this device.
- [ ] Removing the device (or all devices) makes the next sign-in ask for the code again.
- [ ] Changing the password removes the trusted devices.
- [ ] An admin changing a user's email, disabling or anonymizing the user removes that user's devices and open sign-ins.
- [ ] Disabling or anonymizing a user, or a password change from another browser, ends that user's open session at its next request (pinned by `test-api.js` SE-01..SE-05).
- [ ] The failed-login limit answers "Too many attempts" after repeated wrong passwords for one email, and a different email is not affected.

## Known limits to accept or plan for

- [ ] The failed-login and code-sending counters live in the API process: a restart resets them, and a second API instance would count separately.
- [ ] Automated tools that log in (`scripts/shoot.mjs`, `api/src/scripts/seed-planning-golden.js`) need a trusted device minted on that environment; see `docs/scripts/shoot.md`.
