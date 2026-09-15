# Newsletter

Compose rich HTML newsletters and deliver them to KABBAK inboxes — to everyone,
selected users, or whole tiers/roles.

## Where it lives

- **GUI:** adds a **Newsletter** panel to Admin → **Messages**: subject, rich text
  or raw HTML body, live sandboxed preview, audience picker, scheduling,
  acknowledgement, send, and a history of past issues.
- **Server routes** (admin only):
  - `GET  /api/v1/plugins/newsletter/server/admin/audiences`
  - `GET  /api/v1/plugins/newsletter/server/admin/issues`
  - `POST /api/v1/plugins/newsletter/server/admin/issues`
  - `DELETE /api/v1/plugins/newsletter/server/admin/issues/:id`

## How delivery works

Sending reuses the platform inbox:

- audience `all` → a global **broadcast** (every user sees it);
- audience `users` / `roles` → one **inbox message** per recipient.

HTML bodies are sanitised by the message model and rendered inside a
**script-less sandboxed iframe** in the inbox viewer and on the public share page,
so newsletter markup can never run script or reach the app.

Optionally tick **Public share page** to also expose a public link, **Requires
acknowledgement** so it stays unread until opened, or set **Publish at** to
schedule it for later.

Issues are recorded in this plugin's private data dir
(`storage/plugin-data/newsletter/issues.json`) for the history list; deleting a
history row does not unsend an already-delivered message.
