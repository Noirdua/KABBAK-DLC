# Demo Users

Shared demo accounts for KABBAK — a niche feature, so it ships as a DLC plugin
instead of living in the API core.

## What it does

- **Connection gate:** if the API is loopback (or `KABBAK_DEMO_ACCESS=1`), the
  gate shows a "Use Demo Access" button that fills in a demo key and connects.
- **Admin → Demo Users:** a full manager to create and manage **multiple** demo
  accounts, each with its own:
  - access level, roles, and scopes,
  - trial expiry (in days or an explicit date),
  - key reveal ("reset password" = rotate key), profile reset, and delete.

Demo accounts are stored as **hidden managed API clients** (`id` starts with
`cli_demo`, `hidden: true`) so they never appear in Admin → Users. Expiry is
enforced by the API key middleware (expired keys stop authenticating).

## Server routes

Contributed via the manifest `server` entry, mounted at
`/api/v1/plugins/demo-users/server/…`:

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /demo-access` | public (loopback or `KABBAK_DEMO_ACCESS=1`) | Gate login for the first active demo (or `?id=`) |
| `GET /admin/demo-accounts` | admin | List demo accounts |
| `POST /admin/demo-accounts` | admin | Create (name, accessLevel, roles, scopes, ttlDays/expiresAt) |
| `GET /admin/demo-accounts/:id/key` | admin | Reveal a demo key |
| `PATCH /admin/demo-accounts/:id` | admin | Edit name/access/roles/scopes/expiry |
| `POST /admin/demo-accounts/:id/rotate-key` | admin | Reset password (new key) |
| `POST /admin/demo-accounts/:id/reset-profile` | admin | Wipe the demo profile |
| `DELETE /admin/demo-accounts/:id` | admin | Remove the demo account |

## Config

- `KABBAK_DEMO_ACCESS=1` — allow the gate demo key off loopback (default: only
  loopback/private IPs).

## Notes

- The plugin manifest sets `"public": true`, so the gate button's JS/CSS load
  before login; `config.json` is never public.
