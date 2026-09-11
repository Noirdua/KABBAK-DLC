"use strict";

// Demo Users plugin — server routes.
// Manages any number of demo accounts. Each is a *hidden* managed API client
// (so it never shows in Admin → Users) with an optional trial expiry. Routes:
//   /api/v1/plugins/demo-users/server/...
//
// "Reset password" is the key rotation endpoint: the API key is the credential.

const crypto = require("node:crypto");

const DEMO_ID_PREFIX = "cli_demo";
const DEMO_ACCESS_LEVEL = "premium";

module.exports = function register(router, ctx) {
  const registry = ctx.requireApi("src/services/api-client-registry");
  const { resetProfile } = ctx.requireApi("src/services/profile-service");
  const { requireApiKey } = ctx.requireApi("src/middleware/api-key");
  const { isLoopbackOrPrivateIp } = ctx.requireApi("src/lib/ip-utils");
  const {
    ADMIN_API_MANAGEMENT_CAPABILITY,
    requireApiClientCapability
  } = ctx.requireApi("src/middleware/api-client-capability");
  const { createNotFoundError, createHttpError } = ctx;

  const adminOnly = requireApiClientCapability({
    capabilityName: "adminApiManagement",
    anyRoles: ADMIN_API_MANAGEMENT_CAPABILITY.anyRoles,
    anyScopes: ADMIN_API_MANAGEMENT_CAPABILITY.anyScopes,
    errorCode: "insufficient_admin_capability",
    errorMessage: "This route requires the admin role or api:admin scope."
  });

  function nowMs() {
    return Date.now();
  }

  function isDemoClientId(id) {
    const value = String(id || "");
    return value === DEMO_ID_PREFIX || value.startsWith(`${DEMO_ID_PREFIX}_`);
  }

  function generateDemoId(existing) {
    const taken = new Set(
      (Array.isArray(existing) ? existing : []).map((client) => client?.id).filter(Boolean)
    );
    let id = "";
    do {
      id = `${DEMO_ID_PREFIX}_${crypto.randomBytes(8).toString("hex")}`;
    } while (taken.has(id));
    return id;
  }

  function listDemoClients() {
    return registry.readManagedApiClients().filter((client) => isDemoClientId(client.id));
  }

  function findDemoClient(id) {
    const wanted = String(id || "").trim();
    return listDemoClients().find((client) => client.id === wanted) || null;
  }

  function summarize(client) {
    return {
      id: client.id,
      name: client.name || client.id,
      accessLevel: client.accessLevel,
      roles: Array.isArray(client.roles) ? client.roles : [],
      scopes: Array.isArray(client.scopes) ? client.scopes : [],
      expiresAt: String(client.expiresAt || ""),
      expired: registry.isClientExpired(client),
      keyPreview: client.key ? `${String(client.key).slice(0, 10)}…` : ""
    };
  }

  function computeExpiresAt(body, existing) {
    if (body && Object.prototype.hasOwnProperty.call(body, "expiresAt")) {
      const raw = String(body.expiresAt || "").trim();
      if (!raw) return "";
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed)) {
        throw createHttpError(400, "invalid_expiry", "expiresAt must be a valid date.");
      }
      return new Date(parsed).toISOString();
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "ttlDays")) {
      const days = Number(body.ttlDays);
      if (!Number.isFinite(days) || days <= 0) {
        return "";
      }
      return new Date(nowMs() + days * 24 * 60 * 60 * 1000).toISOString();
    }
    return String(existing?.expiresAt || "");
  }

  function normalizeAccessLevel(value, fallback) {
    const level = String(value || "").trim();
    if (!level) return fallback;
    const { ACCESS_LEVELS } = ctx.requireApi("src/config/api-access");
    if (!ACCESS_LEVELS.includes(level)) {
      throw createHttpError(400, "invalid_access_level", `Unknown access level '${level}'.`);
    }
    return level;
  }

  function normalizeList(value, fallback) {
    if (!Array.isArray(value)) return fallback;
    const list = value.map((entry) => String(entry || "").trim()).filter(Boolean);
    return list.length ? list : fallback;
  }

  function requestApiBaseUrl(request) {
    const trustProxy = Boolean(request.app?.get?.("trust proxy"));
    const proto = trustProxy
      ? (String(request.get("x-forwarded-proto") || "").split(",")[0].trim() || request.protocol)
      : request.protocol;
    const forwardedHost = trustProxy
      ? String(request.get("x-forwarded-host") || "").split(",")[0].trim()
      : "";
    const host = forwardedHost || String(request.get("host") || "127.0.0.1:3100").split(",")[0].trim();
    return `${proto}://${host}`;
  }

  function isDemoAccessAllowed(request) {
    const raw = String(process.env.KABBAK_DEMO_ACCESS || "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(raw)) {
      return true;
    }
    return isLoopbackOrPrivateIp(request.ip || request.socket?.remoteAddress);
  }

  router.get("/demo-access", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!isDemoAccessAllowed(request)) {
      response.json({ enabled: false });
      return;
    }

    const wantedId = String(request.query?.id || "").trim();
    const active = listDemoClients().filter((client) => !registry.isClientExpired(client));
    const demoClient = (wantedId ? active.find((client) => client.id === wantedId) : null)
      || active[0]
      || null;
    if (!demoClient) {
      response.json({ enabled: false });
      return;
    }

    response.json({
      enabled: true,
      id: demoClient.id,
      name: demoClient.name,
      accessLevel: demoClient.accessLevel,
      expiresAt: String(demoClient.expiresAt || ""),
      apiKey: String(demoClient.key || ""),
      apiBaseUrl: requestApiBaseUrl(request)
    });
  });

  router.get("/admin/demo-accounts", requireApiKey, adminOnly, (request, response) => {
    const accounts = listDemoClients().map(summarize);
    response.apiSuccess({ count: accounts.length, accounts });
  });

  router.get("/admin/demo-accounts/:id/key", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient(request.params.id);
    if (!demoClient) {
      throw createNotFoundError("demo_account_not_found", "Demo account not found.");
    }
    response.apiSuccess({ ...summarize(demoClient), apiKey: String(demoClient.key || "") });
  });

  router.post("/admin/demo-accounts", requireApiKey, adminOnly, (request, response) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const name = String(body.name || "").trim() || "Demo account";
    const existing = registry.readManagedApiClients();
    const id = generateDemoId(existing);
    const key = registry.generateManagedApiClientKey(existing);
    const accessLevel = normalizeAccessLevel(body.accessLevel, DEMO_ACCESS_LEVEL);
    const expiresAt = computeExpiresAt(body, null);

    const result = registry.upsertManagedApiClient({
      id,
      key,
      name,
      hidden: true,
      accessLevel,
      roles: normalizeList(body.roles, undefined),
      scopes: normalizeList(body.scopes, undefined),
      expiresAt
    }, { mergeExisting: false });

    response.status(201).apiSuccess({ ...summarize(result.client), apiKey: String(result.client?.key || "") });
  });

  router.patch("/admin/demo-accounts/:id", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient(request.params.id);
    if (!demoClient) {
      throw createNotFoundError("demo_account_not_found", "Demo account not found.");
    }
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const accessLevel = normalizeAccessLevel(body.accessLevel, demoClient.accessLevel);
    const expiresAt = computeExpiresAt(body, demoClient);

    const result = registry.upsertManagedApiClient({
      ...demoClient,
      name: String(body.name || "").trim() || demoClient.name,
      hidden: true,
      accessLevel,
      roles: normalizeList(body.roles, demoClient.roles),
      scopes: normalizeList(body.scopes, demoClient.scopes),
      expiresAt
    }, { mergeExisting: true });

    response.apiSuccess(summarize(result.client));
  });

  router.post("/admin/demo-accounts/:id/rotate-key", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient(request.params.id);
    if (!demoClient) {
      throw createNotFoundError("demo_account_not_found", "Demo account not found.");
    }
    const result = registry.rotateManagedApiClientKey(demoClient.id);
    response.apiSuccess({ ...summarize(result.client), apiKey: String(result.client?.key || "") });
  });

  router.post("/admin/demo-accounts/:id/reset-profile", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient(request.params.id);
    if (!demoClient) {
      throw createNotFoundError("demo_account_not_found", "Demo account not found.");
    }
    const reset = resetProfile(demoClient.id);
    response.apiSuccess({ reset, id: demoClient.id });
  });

  router.delete("/admin/demo-accounts/:id", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient(request.params.id);
    if (!demoClient) {
      throw createNotFoundError("demo_account_not_found", "Demo account not found.");
    }
    const result = registry.removeManagedApiClient(demoClient.id);
    response.apiSuccess({ removed: result.removed, id: demoClient.id });
  });
};
