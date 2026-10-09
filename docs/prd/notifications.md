# Settings and Notifications

Part of [PRD.md](../../PRD.md) — carries PRD §9 Settings, §10 Notifications, §11 Team assistant.

## 9. Settings

Accessed via **account dropdown → ⚙ Settings** (available on all pages). Since 2026-09-30 this opens its own page, `/settings.html`, instead of a modal. The page currently has the standard navigation and breadcrumb (Home › Settings) and a blank white content area whose only content is the title "Settings"; any authenticated user can open it, and a logged-out visit redirects to login.

### 9.1 Removed from Settings (2026-09-30)

The former Settings modal and everything in it were removed: the personal AI provider keys (removed earlier the same day; the remaining AI features run on the server with the server's own key, §11), the three CSV exports (Cost Grids, Project Portfolio, Roles in Rate Cards), **Full Backup (.json)** and **Restore from Backup** (which never worked). The server routes `POST /api/exports/{portfolio|cost-grids|ratecards}` and `GET /api/exports/phasing` are unchanged; the three CSV ones now have no UI entry point, while the phasing XLS is still reachable from Configuration. Future settings will be added to `settings.html`.

#### Send Notification

Any authenticated user can compose and send a notification to a specific colleague; broadcasting to all active users is admin/sysadmin-only. Delivery channel is selectable — Push (in-app), Email, or both (at least one required). Supports an optional deep-link URL (e.g. `/pipeline.html`, `/costgrid.html?cgId=...`) with a custom label.

---

## 10. Notifications

### 10.1 Bell Icon

A bell icon (at the bottom of the sidebar, or in the top bar on narrow screens — always visible, never inside the account menu) shows the unread notification count; while any notification is unread the bell turns white with a red icon and border. Clicking it opens a panel next to it listing the last 50 notifications (unread ones highlighted in pink with a magenta edge).

### 10.2 Real-Time Delivery

Notifications are pushed in real time via **Server-Sent Events (SSE)** — no page refresh required. New notifications appear at the top of the panel instantly.

### 10.3 Notification Panel

Each notification shows:
- Title (bold)
- Body text (optional)
- Time ago (e.g. "3m ago")
- Clickable deep-link if a URL was provided

Clicking a notification marks it as read and navigates to the linked URL if present. "Mark all read" clears the badge in one action.

### 10.4 Notification Types

| Trigger | Description |
|---|---|
| Export ready | Sent automatically when a CSV export is requested through the API (no UI triggers it since 2026-09-30) — both an email (with the file attached) and an in-app notification (2026-09) to the requester themselves |
| Sent notification | Any user composes a message targeting a specific colleague; broadcast to all users is admin/sysadmin-only |
| Share granted | When a cost grid, project, or program is shared with you — both an email and an in-app notification, for all three resource types (2026-09: previously cost grid share sent only the email) |
| Share revoked (2026-09) | When your access to a project is removed — both an email and an in-app notification to the person whose access was removed (previously silent on both channels); program-level access is granted and revoked per-project under the hood, so this same trigger covers both |
| Cost grid ownership reassigned (2026-09) | When you're made the new owner of a cost grid/proposal — both an email and an in-app notification to the new owner (previously email only) |

### 10.5 Browser (Desktop) Notifications (2026-09)

Alongside the in-app bell, the site tries to show a native OS/browser popup for the same real-time notifications — a best-effort echo, never the only delivery path. A small row at the top of the notification panel reflects and controls this, updated every time the panel is opened:
- **Permission never asked** — "🔔 Enable desktop notifications?" with an "Enable" button; clicking it requests the browser's own permission.
- **Permission granted and popups on** — "🔔 Desktop notifications on" with a "Disable" button; clicking it turns popups back off (a local, in-app preference — the browser's own permission grant itself can't be revoked from the page, only re-enabled here or changed via the browser's own site settings) without needing to touch browser settings.
- **Permission granted but locally disabled** — the row reverts to an "Enable" button, re-enabling without asking the browser again (it's already granted).
- **Permission denied by the browser** — the row doesn't show at all; this app has no way to override a browser-level block.

When enabled, a new notification arriving via the existing SSE stream shows a popup **only if the PDash tab isn't currently focused/visible** — avoiding a redundant popup when the user is already looking at the page. Clicking the popup focuses the tab and follows the notification's link, same as clicking it in the panel. No server-side change: this is a purely client-side echo of the "push" channel already described above.

---

## 11. Team assistant

Accessed via the "🤖 Team assistant" button in the `planning.html` toolbar, visible to admin and sysadmin only (the API answers 403 to anyone else). It replaces the former AI sidebar (personal-key chat, "AI Chat" button) and the portfolio "AI Analysis" button, both removed 2026-09-30.

### 11.1 What it does

- The admin picks one project already in Planning and presses **Calculate team**, or asks in the chat (for example "Exclude Anna and recalculate", "Only people with experience in the same market", "Why is X not among the best?").
- The result is three tables per required role: **Best team** (people with that job title, ranked by experience score), **Alternative team** (people with another job title and relevant experience) and **Available team** (ranked by experience and free hours over the project window).
- The experience score combines hours with the job title, hours on the project's tags (market, brand, therapeutic area, service type...), hours on similar tasks and matching competence topics; availability is 32 h per week minus the planned and actual load of everything else in Planning.
- The chat only turns sentences into constraints and writes a summary; every number and table comes from the server's calculation.

### 11.2 Where the request goes

Chat calls go to the PDash backend (`POST /api/planning-assistant/chat`), which calls the Anthropic API with the server's key (`ANTHROPIC_API_KEY` in the server `.env`). Person names, hours, load and project names/tasks are therefore sent to Anthropic until a local model exists. "Calculate team" (`POST /api/planning-assistant/rank`) uses no LLM. See `docs/api/planning-assistant.md`.

---

