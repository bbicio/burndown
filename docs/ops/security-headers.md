# Security headers

Every response of the site carries a Content-Security-Policy, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` and `Permissions-Policy`, and names neither the nginx version nor Express.

The values live once, in the `SECURITY HEADERS` block at `server` level of [`nginx.conf`](../../nginx.conf). `scripts/security-headers-guard.test.js` holds the rules they must keep, including: no `location` block carries its own `add_header` or `proxy_hide_header`.

## Scripts under the CSP

`script-src` has no `'unsafe-inline'`: a page carries no inline `<script>` and no `on…=` attribute. A page's own code lives in `js/pages/` (served from `'self'`): `<page>.js`, plus `<page>-overrides.js` for a module that overrides `js/*.js` globals before a classic page script; the `<head>` sidebar snippet is `js/sidebar-state.js`. Each is loaded by a tag of the same type, in the position its inline block had; a handler is wired with `addEventListener`.

A CDN script is admitted by its exact URL, one `script-src` source per file. Adding a CDN library, or changing its version, changes its source in `nginx.conf` in the same commit; the guard fails until both agree, and a deployed stack refuses the new file until nginx is reloaded.

Tests read a root page through `scripts/lib/page-source.setup.mjs`: `readFileSync` of a page returns it with its `js/pages/` scripts put back inline. `rawReadFileSync`, exported by the same file, reads the page as it is on disk.

## Checking a deployment

Run against the deployed site, a public page and a protected one without a cookie (the 302):

```bash
curl -sI https://<host>/login.html
curl -sI https://<host>/pipeline.html
```

Both answers carry every header of the `SECURITY HEADERS` block, `Server: nginx` without a version, and no `X-Powered-By`.

If they are missing there while the branch stack has them, a layer in front of nginx (a proxy, a gateway, a different web server) serves or rewrites the responses: the headers are replicated on that layer.

## Known effects

With Chrome or Edge DevTools open, the console shows `connect-src` refusals of `.map` files on `https://cdn.jsdelivr.net` (e.g. `bootstrap.min.css.map`); the page and its stylesheets are unaffected.
