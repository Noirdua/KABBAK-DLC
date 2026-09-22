# Stripe Subscriptions

Turns Stripe subscriptions into KABBAK entitlements: a paid subscription grants
the tier's roles (permissions) and optional access level; cancellation takes
exactly those back.

## Setup

1. Install this plugin (Admin → DLC) and open its settings.
2. Paste the webhook signing secret (`whsec_…`) from Stripe → Developers →
   Webhooks and save.
3. In Stripe, add the endpoint shown in the settings and subscribe to
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, and `invoice.payment_failed`.
4. Map plans: set each tier's **Provider Plan Id** (Admin → Tiers) to its Stripe
   price id (`price_…`).

## How a subscription finds its client

In order of preference:

1. `metadata.clientId` on the subscription (recommended — set it when creating
   the checkout/subscription).
2. `client_reference_id` on the checkout session.
3. The client already linked to that Stripe customer by an earlier event.

## Entitlements

- **Active** (status `active`/`trialing`, `invoice.paid`, or a paid
  `checkout.session.completed`) → the tier's roles are added (or the roles in
  `metadata.roles`), and the tier's `accessLevel` is applied when
  “Apply the tier's access level” is on. The previous access level is remembered.
- **Canceled / unpaid / incomplete_expired / paused / subscription deleted** →
  the roles this subscription granted are removed and the previous access level
  is restored.
- `invoice.payment_failed` is recorded but does not revoke access by itself.

The mapped roles belong to the subscription — do not also assign them by hand,
because cancellation removes them.

## Routes

- `POST /api/v1/plugins/stripe/server/webhook` — public, Stripe-signed.
- `GET  /api/v1/plugins/stripe/server/settings` — admin: whether the secret is set.
- `POST /api/v1/plugins/stripe/server/settings` — admin: set/clear the secret,
  toggle applying the access level.
- `GET  /api/v1/plugins/stripe/server/events` — admin: recent events.

Signature verification uses the official `stripe` npm package
(`stripe.webhooks.constructEvent`) with the raw request body.
