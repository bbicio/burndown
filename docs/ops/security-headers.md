# Security headers

Every response of the site carries a Content-Security-Policy, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` and `Permissions-Policy`, and names neither the nginx version nor Express.

The values live once, in the `SECURITY HEADERS` block at `server` level of [`nginx.conf`](../../nginx.conf). `scripts/security-headers-guard.test.js` holds the rules they must keep, including: no `location` block carries its own `add_header` or `proxy_hide_header`.

## Checking a deployment

Run against the deployed site, a public page and a protected one without a cookie (the 302):

```bash
curl -sI https://<host>/login.html
curl -sI https://<host>/pipeline.html
```

Both answers carry every header of the `SECURITY HEADERS` block, `Server: nginx` without a version, and no `X-Powered-By`.

If they are missing there while the branch stack has them, a layer in front of nginx (a proxy, a gateway, a different web server) serves or rewrites the responses: the headers are replicated on that layer.

## Known effects

With DevTools open, the console shows `connect-src` refusals of `.map` files on `https://cdn.jsdelivr.net` (e.g. `bootstrap.min.css.map`): DevTools fetches source maps under the page's `connect-src`. The page and its stylesheets are unaffected.

On a network whose DNS filter redirects `ik.imagekit.io` through another host (Cisco Umbrella/OpenDNS answers through `*.id.opendns.com`), `img-src` blocks the favicon: the tab shows no icon, nothing else changes. The browser console names it as an `img-src` refusal of `https://ik.imagekit.io/...`.
