# Demo Users

Shared demo accounts for KABBAK — a niche feature, so it ships as a DLC plugin
instead of living in the API core.

Plugin root is `plugins/demo-users/` (manifest + entry + `server.js` in this
folder). Do not nest a second `demo-users/` directory here.

## What it does

- **Demo accounts** (`cli_demo_*`) — shared logins for the connection gate. The
  gate button appears when the API is loopback/private (or `KABBAK_DEMO_ACCESS=1`
  / `allowRemote`), fills in a demo key, and connects. The gate only ever uses
  demo accounts, never trials. Shared demos are **browse-only**: journal, friends,
  inbox, posts, games sessions, and other personal profile data are disabled so
  visitors are nudged to create a trial account.
- **Trial accounts** (`cli_trial_*`) — individually issued, time-limited
  accounts to hand out (for example two-week trials). Each has its own name,
  access level, roles, scopes, and expiry; reveal the key and send it to that
  person.
- **Admin → Demo & Trial Accounts:** one manager for both kinds — create, edit
  access/roles/scopes/expiry, reveal key ("reset password" = rotate key), reset
  profile, and delete.

Both kinds are stored as **hidden managed API clients** (`hidden: true`) so they
never appear in Admin → Users. Expiry is enforced by the API key middleware
(expired keys stop authenticating).

## Server routes

Contributed via the manifest `server` entry, mounted at
`/api/v1/plugins/demo-users/server/…`:

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /demo-access` | public (loopback/private or `KABBAK_DEMO_ACCESS=1`) | Gate login for the first active demo (or `?id=`) |
| `GET /admin/demo-accounts` | admin | List accounts (optional `?kind=demo|trial`) |
| `POST /admin/demo-accounts` | admin | Create (`kind`, name, accessLevel, roles, scopes, ttlDays/expiresAt) |
| `GET\|POST /admin/settings` | read: any key · write: admin | Demo/trial settings |
| `GET /admin/demo-accounts/:id/key` | admin | Reveal a demo key |
| `PATCH /admin/demo-accounts/:id` | admin | Edit name/access/roles/scopes/expiry |
| `POST /admin/demo-accounts/:id/rotate-key` | admin | Reset password (new key) |
| `POST /admin/demo-accounts/:id/reset-profile` | admin | Wipe the demo profile |
| `DELETE /admin/demo-accounts/:id` | admin | Remove the demo account |

## Config

Admin → DLC → Demo Users → **Settings** edits `config.json` through
`GET|POST /admin/settings` (GET is readable by any authenticated key; POST is
admin-only). Keys:

| Key | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Master switch; when off the gate hides the demo button |
| `allowRemote` | `false` | Allow the gate off loopback/private IPs (returns a live key — trusted hosts only) |
| `demoAccessLevel` | `premium` | Access level when a new demo account omits one |
| `trialAccessLevel` | `demoAccessLevel` | Access level when a new trial account omits one |
| `defaultTrialDays` | `14` | Trial length (days) applied to new trials; `0` = no expiry |
| `maxDemoAccounts` | `0` | Cap on demo accounts; `0` = unlimited |
| `maxTrialAccounts` | `0` | Cap on trial accounts; `0` = unlimited |
| `gateAccountId` | `""` | Default demo account the gate logs into; blank = first active |

Legacy keys `defaultAccessLevel`, `defaultTtlDays`, and `maxAccounts` are still
read as fallbacks.

Create accepts `kind` (`demo` or `trial`, default `demo`); `GET
/admin/demo-accounts?kind=trial` filters the list.

Environment:

- `KABBAK_DEMO_ACCESS=1` — allow the gate demo key off loopback/private IPs
  (equivalent to `allowRemote`; the response includes a live API key, so do not
  enable this on a public host).

## Notes

- The plugin manifest sets `"public": true`, so the gate button's JS/CSS load
  before login. `config.json` and the server entry (`server.js`) are never public.
- Blank roles/scopes on create use the access-level defaults (premium:
  `reader` / `api:read`, `api:tarot`, `api:decks`).
