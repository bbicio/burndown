# login.html — Sign in

Public page, no navigation. Views: `login` (email + password), `code` (the second step), `locked` (too many attempts, or the sign-in expired), `forgot`. Stylesheets `css/auth.css` (shared with `activate.html` and `reset-password.html`) and `css/otp-input.css`.

## Current state

- **Second step.** `POST /api/auth/login` answers `{ twoStep: { method, destination, expiresIn, resendIn, sendFailed } }` and no `pdash_token` unless the `pdash_device` cookie is a trusted device of the user; the page then shows the `code` view. A method other than `email` shows "Sign in failed" and drops the challenge.
- **Code view.** Step indicator, mail icon, "Check your email", the masked address, the six-box `<otp-input>` (`js/otp-input.js`, logic in `js/lib/otp.js`), "Trust this device for 30 days", Verify (sent automatically on the sixth digit), "Resend in {s} s" / "Resend code", "← Back to sign in" (`DELETE /api/auth/two-step`).
- **States** (`codeState`): `wrong` (red boxes, "Incorrect code. {n} attempts left.", back to idle on the first edit), `resent` (green box, boxes emptied, cooldown restarts), `expired` and `sendError` (boxes disabled, no Resend link, primary "Send a new code"), `rateLimited`, `networkError` (digits kept). 423 and 401 `NO_CHALLENGE` open the `locked` view ("Too many attempts" / "Sign-in expired"). A 429 at the password step reads "Too many attempts. Try again in {n} minute(s)."
- The logo is the compact one in every view but `login`. Focus goes to the first box when the view opens and after a wrong code.
- **Deviations accepted against boards 15u–15al** (2026-11-10): the first box shows a focus ring on open; the stepper "Password" and the locked icon use the darker token colours (4.5:1 rule); the trust checkbox is greyed in the expired state; "1 minute." in the singular.

Tests: `js/lib/otp.test.js`, `js/lib/auth-pages-guard.test.js`, `test-api.js` `TS-01..TS-29`. Spec: `docs/superpowers/specs/2026-11-10-two-step-c2-email-code-design.md`.
