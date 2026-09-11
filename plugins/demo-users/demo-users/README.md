# Demo Users

Shared demo account for KABBAK — a niche feature, so it ships as a DLC plugin
instead of living in the API core.

## What it does

- **Connection gate:** if the API is loopback (or `KABBAK_DEMO_ACCESS=1`), the
  gate shows a "Use Demo Access" button that fills in the demo key and connects.
- **Admin → Users:** a Demo card to create, copy the key, rotate the key, reset
  the shared demo profile, and delete the demo user.

## Server routes

The plugin contributes Express routes via its manifest `server` entry, mounted
at `/api/v1/plugins/demo-users/server/…`:

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /demo-access` | public (loopback or `KABBAK_DEMO_ACCESS=1`) | Gate login info |
| `GET /admin/demo-key` | admin | Read the demo key |
| `POST /admin/demo-user` | admin | Create/upgrade the demo user |
| `POST /admin/demo-user/rotate-key` | admin | New demo key |
| `POST /admin/demo-user/reset-profile` | admin | Wipe the demo profile |
| `DELETE /admin/demo-user` | admin | Remove the demo user |

The demo client is a managed API client with id `cli_demo` at `premium` access.

## Config

- `KABBAK_DEMO_ACCESS=1` — allow the gate demo key off loopback (default: only
  loopback/private IPs).
