"use strict";

/* Stripe Subscriptions plugin — server routes.
 *
 *   POST /api/v1/plugins/stripe/server/webhook   public, signature verified
 *   GET  /api/v1/plugins/stripe/server/events    admin only
 *
 * A Stripe subscription becomes a KABBAK entitlement:
 *   1. Target client — subscription `metadata.clientId` (recommended) or the
 *      checkout session's `client_reference_id`, else the client already linked
 *      to that Stripe customer from an earlier event.
 *   2. Tier — `metadata.roles` if the operator sets it, otherwise the tier whose
 *      `price.providerPlanId` matches the subscription price (Admin → Tiers).
 *   3. Active (subscription active/trialing, invoice paid, paid checkout) →
 *      ensure those roles and apply the tier's access level, remembering the
 *      previous one. Canceled/unpaid/incomplete/paused → remove exactly the
 *      roles this subscription granted and restore the previous access level.
 *
 * Signature checking uses the official Stripe SDK (`stripe.webhooks.constructEvent`),
 * which needs the raw body — the API keeps it on `request.rawBody`.
 *
 * The mapped tier roles belong to the subscription, so do not also assign them
 * by hand: cancellation removes them.
 */
const fs = require("node:fs");
const path = require("node:path");

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);
const MAX_EVENTS = 200;

const DEFAULT_SETTINGS = Object.freeze({
  webhookSecret: "",
  grantAccessLevel: true
});

function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    webhookSecret: String(source.webhookSecret || process.env.KABBAK_STRIPE_WEBHOOK_SECRET || "").trim(),
    grantAccessLevel: source.grantAccessLevel !== false
  };
}

function firstPriceId(object = {}) {
  const items = Array.isArray(object?.items?.data) ? object.items.data : [];
  const price = items[0]?.price || object?.plan || null;
  return String(price?.id || price?.price || "").trim();
}

function rolesFromMetadata(metadata = {}) {
  return String(metadata?.roles || metadata?.kabbakRoles || "")
    .split(/[\s,;]+/)
    .map((role) => role.trim())
    .filter(Boolean);
}

// Pure: pull the fields the entitlement logic needs out of a Stripe event.
function normalizeStripeEvent(payload = {}) {
  const type = String(payload?.type || "").trim();
  const object = payload?.data?.object && typeof payload.data.object === "object" ? payload.data.object : {};
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata : {};
  const subscriptionId = type.startsWith("customer.subscription")
    ? String(object.id || "")
    : String(object.subscription || "");
  const currentPeriodEnd = Number.isFinite(Number(object.current_period_end))
    ? new Date(Number(object.current_period_end) * 1000).toISOString()
    : "";

  let active = null;
  if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    const status = String(object.status || "");
    active = ACTIVE_SUBSCRIPTION_STATUSES.has(status)
      ? true
      : (INACTIVE_SUBSCRIPTION_STATUSES.has(status) ? false : null);
  } else if (type === "customer.subscription.deleted") {
    active = false;
  } else if (type === "invoice.paid") {
    active = true;
  } else if (type === "checkout.session.completed") {
    active = ["paid", "no_payment_required"].includes(String(object.payment_status || ""));
  }

  return {
    type,
    active,
    status: String(object.status || object.payment_status || ""),
    clientId: String(metadata.clientId || object.client_reference_id || "").trim(),
    customerId: String(object.customer || "").trim(),
    subscriptionId,
    priceId: firstPriceId(object),
    roles: rolesFromMetadata(metadata),
    currentPeriodEnd
  };
}

// Pure: what should change on the client for this event?
function computeSubscriptionChange({ client = {}, event = {}, mappedRoles = [], tier = null, grantAccessLevel = true, nowIso = "" } = {}) {
  const currentRoles = Array.isArray(client.roles) ? client.roles : [];
  const previous = client.subscription && typeof client.subscription === "object" ? client.subscription : null;
  const base = {
    provider: "stripe",
    status: event.status || "",
    customerId: event.customerId || "",
    subscriptionId: event.subscriptionId || "",
    priceId: event.priceId || "",
    currentPeriodEnd: event.currentPeriodEnd || "",
    updatedAt: nowIso || new Date().toISOString()
  };

  if (event.active === true) {
    const roles = Array.from(new Set([...currentRoles, ...mappedRoles]));
    const tierLevel = grantAccessLevel ? String(tier?.accessLevel || "") : "";
    const takesOverLevel = Boolean(tierLevel && tierLevel !== client.accessLevel);
    return {
      roles,
      accessLevel: takesOverLevel ? tierLevel : client.accessLevel,
      granted: mappedRoles,
      revoked: [],
      note: tier ? `tier ${tier.id}` : "",
      subscription: {
        ...base,
        grantedRoles: mappedRoles,
        previousAccessLevel: previous?.previousAccessLevel || (takesOverLevel ? client.accessLevel : "")
      }
    };
  }

  const grantedRoles = Array.isArray(previous?.grantedRoles) ? previous.grantedRoles : [];
  return {
    roles: currentRoles.filter((role) => !grantedRoles.includes(role)),
    accessLevel: previous?.previousAccessLevel || client.accessLevel,
    granted: [],
    revoked: grantedRoles,
    note: "subscription inactive",
    subscription: {
      ...base,
      status: event.status || "canceled",
      grantedRoles: [],
      previousAccessLevel: ""
    }
  };
}

module.exports = function register(router, ctx) {
  const registry = ctx.requireApi("src/services/api-client-registry");
  const { listRoleDefinitions } = ctx.requireApi("src/services/api-roles");
  const { requireApiKey } = ctx.requireApi("src/middleware/api-key");
  const {
    ADMIN_API_MANAGEMENT_CAPABILITY,
    requireApiClientCapability
  } = ctx.requireApi("src/middleware/api-client-capability");

  const adminOnly = requireApiClientCapability({
    capabilityName: "adminApiManagement",
    anyRoles: ADMIN_API_MANAGEMENT_CAPABILITY.anyRoles,
    anyScopes: ADMIN_API_MANAGEMENT_CAPABILITY.anyScopes,
    errorCode: "insufficient_admin_capability",
    errorMessage: "This route requires the admin role or api:admin scope."
  });

  function loadStripe() {
    try {
      return require("stripe");
    } catch (_error) {
      return ctx.requireApi("node_modules/stripe");
    }
  }

  function eventsPath() {
    return path.join(ctx.dataDir, "events.json");
  }

  function readEvents() {
    try {
      const parsed = JSON.parse(fs.readFileSync(eventsPath(), "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function recordEvent(entry = {}) {
    const record = {
      id: require("node:crypto").randomUUID(),
      receivedAt: new Date().toISOString(),
      type: String(entry.type || "unknown").slice(0, 80),
      status: String(entry.status || "").slice(0, 40),
      clientId: String(entry.clientId || "").slice(0, 120),
      customerId: String(entry.customerId || "").slice(0, 200),
      subscriptionId: String(entry.subscriptionId || "").slice(0, 200),
      priceId: String(entry.priceId || "").slice(0, 200),
      granted: Array.isArray(entry.granted) ? entry.granted.slice(0, 20) : [],
      revoked: Array.isArray(entry.revoked) ? entry.revoked.slice(0, 20) : [],
      note: String(entry.note || "").slice(0, 300)
    };
    const events = readEvents();
    events.unshift(record);
    fs.mkdirSync(ctx.dataDir, { recursive: true });
    fs.writeFileSync(eventsPath(), `${JSON.stringify(events.slice(0, MAX_EVENTS), null, 2)}\n`, "utf8");
    return record;
  }

  function rolesForPrice(priceId) {
    const id = String(priceId || "").trim();
    if (!id) {
      return { tier: null, roles: [] };
    }
    const tier = listRoleDefinitions().find((role) => String(role?.price?.providerPlanId || "").trim() === id) || null;
    return { tier, roles: tier ? [tier.id] : [] };
  }

  function applyEvent(event) {
    const clients = registry.readManagedApiClients();
    let target = event.clientId ? clients.find((client) => client.id === event.clientId) || null : null;
    if (!target && event.customerId) {
      target = clients.find((client) => client.subscription?.customerId === event.customerId) || null;
    }
    if (!target) {
      return { granted: [], revoked: [], note: "no matching client" };
    }
    if (event.active === null) {
      return { granted: [], revoked: [], note: "event does not change access" };
    }

    const mapped = event.roles.length ? { tier: null, roles: event.roles } : rolesForPrice(event.priceId);
    const settings = normalizeSettings(ctx.readConfig());
    const change = computeSubscriptionChange({
      client: target,
      event,
      mappedRoles: mapped.roles,
      tier: mapped.tier,
      grantAccessLevel: settings.grantAccessLevel
    });

    registry.upsertManagedApiClient({
      ...target,
      roles: change.roles,
      accessLevel: change.accessLevel,
      subscription: change.subscription
    });

    return { granted: change.granted, revoked: change.revoked, note: change.note };
  }

  router.post("/webhook", (request, response, next) => {
    try {
      const settings = normalizeSettings(ctx.readConfig());
      if (!settings.webhookSecret) {
        throw ctx.createHttpError(
          503,
          "webhook_not_configured",
          "Set the Stripe webhook signing secret in Admin → DLC → Stripe Subscriptions first."
        );
      }
      const rawBody = request.rawBody;
      if (!rawBody || !rawBody.length) {
        throw ctx.createHttpError(400, "invalid_webhook", "Webhook body is empty.");
      }

      let stripeEvent;
      try {
        stripeEvent = loadStripe().webhooks.constructEvent(
          rawBody,
          String(request.headers["stripe-signature"] || ""),
          settings.webhookSecret
        );
      } catch (error) {
        throw ctx.createHttpError(401, "invalid_signature", `Stripe signature did not verify: ${error?.message || error}`);
      }

      const event = normalizeStripeEvent(stripeEvent);
      const result = applyEvent(event);
      const record = recordEvent({ ...event, ...result });
      response.status(202).apiSuccess({
        received: true,
        id: record.id,
        type: record.type,
        granted: record.granted,
        revoked: record.revoked
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/events", requireApiKey, adminOnly, (_request, response) => {
    response.apiSuccess({
      events: readEvents(),
      configured: Boolean(normalizeSettings(ctx.readConfig()).webhookSecret)
    });
  });

  // Settings are owned here (not the generic plugin config route) so the signing
  // secret stays write-only: GET reports only whether it is set.
  router.get("/settings", requireApiKey, adminOnly, (_request, response) => {
    const settings = normalizeSettings(ctx.readConfig());
    response.apiSuccess({
      webhookSecretSet: Boolean(settings.webhookSecret),
      grantAccessLevel: settings.grantAccessLevel
    });
  });

  router.post("/settings", requireApiKey, adminOnly, (request, response, next) => {
    try {
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const current = normalizeSettings(ctx.readConfig());
      const next = {
        ...ctx.readConfig(),
        grantAccessLevel: body.grantAccessLevel !== false
      };
      if (body.webhookSecret === null) {
        next.webhookSecret = "";
      } else if (typeof body.webhookSecret === "string" && body.webhookSecret.trim() && body.webhookSecret !== "***") {
        next.webhookSecret = body.webhookSecret.trim();
      } else {
        next.webhookSecret = current.webhookSecret;
      }
      ctx.writeConfig(next);
      const saved = normalizeSettings(ctx.readConfig());
      response.apiSuccess({
        webhookSecretSet: Boolean(saved.webhookSecret),
        grantAccessLevel: saved.grantAccessLevel
      });
    } catch (error) {
      next(error);
    }
  });
};

// Exposed for tests (the pure parts need no storage or ctx).
module.exports.__test = {
  ACTIVE_SUBSCRIPTION_STATUSES,
  INACTIVE_SUBSCRIPTION_STATUSES,
  computeSubscriptionChange,
  normalizeSettings,
  normalizeStripeEvent
};
