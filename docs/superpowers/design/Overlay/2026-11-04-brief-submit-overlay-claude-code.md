# Brief — Submit overlay (form saving layer)

**Goal:** build a reusable full-page overlay shown while a form is being submitted. It blocks the whole page, including the sidebar navigation, until the site hides it.

**Scope: visual component only.** The site already decides when a submit starts and ends. It opens the overlay, closes it and picks its state from its existing code. This brief defines how the layer looks and what it contains. It does not define when it opens or closes. Pages touched: shared CSS plus one small shared markup/JS helper. No API change.

## 1. References

| Board | File / state | Use it for |
|---|---|---|
| 1a | `SubmitOverlay.dc.html` | **Saving**: base state, required |
| 1b | `SubmitOverlay.dc.html` | **Still saving**: optional |
| 1c | `SubmitOverlay.dc.html` | **Changes saved**: optional |
| 1d | `SubmitOverlay.dc.html` | **Couldn't save**: optional |
| 1e | `SubmitOverlay.dc.html` | Tablet 1024×768, Saving |
| 1f | `SubmitOverlay.dc.html` | Smartphone 390×844, Couldn't save (bottom-anchored panel) |

- The JPG captures are in `docs/captures/submit-overlay/`. Each file name starts with the board id. They are scaled down, so take sizes and values from this brief and the HTML.
- The form behind the overlay (Master Data · Edit client) is sample content only.

## 2. Precedence

- Stack unchanged: Vue 3 from CDN, Bootstrap 5, no build step.
- Use `css/tokens.css`. Do not add hex literals to pages. If a value below has no token, add it to `tokens.css` once and reference it from there.
- Reuse the app's spinner colour rule (`.spinner-border` is already brand magenta) and the existing `.btn` / `.btn-primary` / `.btn-outline-*` classes for the error buttons.

## 3. Optional states: implement only if they need no new site code

**Saving (1a) is the only required state.** Build *Still saving* (1b), *Changes saved* (1c) and *Couldn't save* (1d) **only if the site can drive them with the hooks it already has**, e.g. it already knows when a request succeeds or fails, or already has a timeout. Do **not** write new site-side logic (timers, request tracking, retry handling) just to feed these states. If a state can't be driven without new code, leave it out and note it in the PR.

When a state is built, the component only needs to expose a way to switch to it (e.g. a modifier class or a `state` argument). The site keeps full control of when.

## 4. Layer

- **Coverage:** `position: fixed; inset: 0`. It covers the whole viewport: sidebar / top navbar, breadcrumb, page content and any open Bootstrap modal or drawer.
- **Stacking:** above Bootstrap modals and the app tooltip (`#pd-tooltip` is 1051, `.modal` is 1055). Use `z-index: 1080` and add it as a token (e.g. `--z-blocking`).
- **Blocking:** the layer catches all pointer events. Nothing underneath can be clicked, and that includes sidebar links. While the layer is visible, keyboard focus must not reach the page behind it: put `inert` (or `aria-hidden` plus a focus trap) on the app root and `aria-busy="true"` on the submitted form.
- **Scrim:** brand navy at 55%, `rgba(11, 24, 64, .55)` (`--brand-navy` with opacity). This is the same backdrop already used by modals. No blur.
- **Scroll:** lock body scroll while visible.
- **Enter/exit:** fade, 150 ms, `opacity` only. With `prefers-reduced-motion: reduce`, no fade.

## 5. Progress bar (Saving and Still saving only)

- 3 px tall, pinned to the top edge of the viewport, full width.
- Track: magenta at 25% (`rgba(240, 40, 122, .25)`).
- Indeterminate fill: a magenta (`--brand-magenta`) segment 35% wide, sliding left → right, 1.2 s `ease-in-out`, infinite.
- Hidden with `prefers-reduced-motion: reduce`.

## 6. Panel

- Centred horizontally and vertically in the viewport.
- Width 340 px (max `calc(100vw - 32px)`), white (`--surface-white`), radius 12 px (`--radius-lg`), no border, shadow `0 20px 60px rgba(0,0,0,.25)`, the same as the app's modals.
- Padding 24px 24px 22px. Content is a centred column with a 10 px gap and centred text.
- Accessibility: `role="status"` with `aria-live="polite"`. In the error state use `role="alert"` and move focus to **Try again**.

**Content, top to bottom:**
1. **Indicator** (one of):
   - *Spinner* (Saving / Still saving): 28 px ring, 3 px border, track `#FBD3E3` (light magenta), top segment `--brand-magenta`, rotates 0.8 s linear infinite. The Bootstrap `.spinner-border` at 28 px with that colour is acceptable. With reduced motion it stays static.
   - *Success icon*: 40 px circle, background `#E6F4EC`, green check (stroke `#0E7C4A`, 2 px, 18 px icon).
   - *Error icon*: 40 px circle, background `#FDECEC`, exclamation-in-circle (stroke `#C0392B`, 1.8 px, 18 px icon).
   - Icons are inline SVG, `stroke="currentColor"`. No emoji.
2. **Title**: 15 px, weight 700, `--brand-navy`, 2 px extra top margin.
3. **Message**: 12.5 px, line-height 1.5, `--text-muted` (#6B7280), `text-wrap: pretty`.
4. **Actions** (error only): row with an 8 px gap, 6 px top margin. Buttons are 34 px tall with radius 8 px:
   - **Back to form**: secondary/outline (white, 1 px `--border-light`, text #374151).
   - **Try again**: primary navy (`--brand-navy`, white text).

## 7. States and copy

| State | Indicator | Title | Message | Progress bar | Actions |
|---|---|---|---|---|---|
| Saving (required) | Spinner | Saving changes… | Please don't close this page. | Yes | — |
| Still saving (optional) | Spinner | Still saving… | This is taking longer than usual. Your changes are safe. | Yes | — |
| Changes saved (optional) | Success icon | Changes saved | `{Entity name} has been updated.` or a generic "Your changes have been saved." | No | — |
| Couldn't save (optional) | Error icon | Couldn't save | Server message if available, otherwise "The server didn't respond. Your changes are still in the form." | No | Back to form · Try again |

- The copy is in English. Use the ellipsis character `…`, not three dots.
- The site may pass its own title and message. These are the defaults.
- **Back to form** hides the overlay and leaves the form values untouched. **Try again** calls whatever re-submit the site already has. If no re-submit exists, show only **Back to form** (see §3).
- Field-level validation errors are **not** shown in this overlay. They stay inline on the fields, as today.

## 8. Responsive

- **Tablet (1024×768, 1e):** same as desktop. The layer also covers the icon sidebar.
- **Smartphone (≤ 767 px, 1f):** the layer covers the top navbar too. The panel is anchored to the bottom of the viewport with 16 px inset, full width (`calc(100% - 32px)`), padding 24px 18px 16px. Error buttons are full width, split 50/50, and 44 px tall (touch target). Title 15 px, message 13 px.

## 9. Suggested API (adapt to the codebase)

A single shared element injected once (e.g. in `js/core.js` or `nav.js`), with two calls the site invokes from its existing submit handlers:

```js
PdOverlay.show({ state: 'saving', title?, message? });   // 'saving' | 'slow' | 'saved' | 'error'
PdOverlay.hide();
```

Optional states that are not built can be no-ops that fall back to `saving` / `hide()`. No timing logic goes inside the component.

## 10. Acceptance

- While visible, sidebar/navbar links, page buttons and open modals can't be clicked or reached with Tab.
- The Saving state matches 1a: navy scrim, top progress bar, centred white panel, magenta spinner, title + message.
- Optional states are present only where the site drives them without new logic. Any that were omitted are listed in the PR.
- No hex literals in pages. New values live in `tokens.css`.
- Reduced motion: no fade, no bar, static spinner.
