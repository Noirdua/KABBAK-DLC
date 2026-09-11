"use strict";

// Demo Users plugin — server routes.
// Contributes the shared demo account endpoints under
//   /api/v1/plugins/demo-users/server/...
// so the demo feature lives entirely in this plugin instead of the API core.

const DEMO_CLIENT_ID = "cli_demo";
const DEMO_CLIENT_ACCESS_LEVEL = "premium";

module.exports = function register(router, ctx) {
  const registry = ctx.requireApi("src/services/api-client-registry");
  const { resetProfile } = ctx.requireApi("src/services/profile-service");
  const { requireApiKey } = ctx.requireApi("src/middleware/api-key");
  const {
    ADMIN_API_MANAGEMENT_CAPABILITY,
    requireApiClientCapability
  } = ctx.requireApi("src/middleware/api-client-capability");
  const { createNotFoundError } = ctx;

  const adminOnly = requireApiClientCapability({
    capabilityName: "adminApiManagement",
    anyRoles: ADMIN_API_MANAGEMENT_CAPABILITY.anyRoles,
    anyScopes: ADMIN_API_MANAGEMENT_CAPABILITY.anyScopes,
    errorCode: "insufficient_admin_capability",
    errorMessage: "This route requires the admin role or api:admin scope."
  });

  function accessLevelRank(accessLevel) {
    const { ACCESS_LEVELS } = ctx.requireApi("src/config/api-access");
    const index = ACCESS_LEVELS.indexOf(String(accessLevel || ""));
    return index < 0 ? -1 : index;
  }

  function findDemoClient() {
    return registry.readManagedApiClients().find((client) => client.id === DEMO_CLIENT_ID) || null;
  }

  function ensureDemoClient() {
    const existing = findDemoClient();
    if (existing) {
      if (accessLevelRank(existing.accessLevel) < accessLevelRank(DEMO_CLIENT_ACCESS_LEVEL)) {
        const result = registry.upsertManagedApiClient({
          ...existing,
          accessLevel: DEMO_CLIENT_ACCESS_LEVEL
        }, { mergeExisting: true });
        return { created: false, upgraded: true, client: result.client };
      }
      return { created: false, client: existing };
    }

    const existingClients = registry.readManagedApiClients();
    const apiKey = registry.generateManagedApiClientKey(existingClients);
    const result = registry.upsertManagedApiClient({
      id: DEMO_CLIENT_ID,
      key: apiKey,
      name: "Demo User",
      accessLevel: DEMO_CLIENT_ACCESS_LEVEL
    }, {});
    return { created: true, client: result.client };
  }

  function isDemoAccessAllowed(request) {
    const raw = String(process.env.KABBAK_DEMO_ACCESS || "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(raw)) {
      return true;
    }
    const ip = String(request.ip || request.socket?.remoteAddress || "");
    return ip === "127.0.0.1" || ip === "::1" || ip.endsWith("127.0.0.1");
  }

  // Public: connection-gate demo info. Off loopback unless KABBAK_DEMO_ACCESS=1.
  router.get("/demo-access", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const demoClient = findDemoClient();
    if (!demoClient || !isDemoAccessAllowed(request)) {
      response.json({ enabled: false });
      return;
    }

    const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const host = forwardedHost || String(request.headers.host || "localhost:3100").split(",")[0].trim();
    const apiBaseUrl = `${forwardedProto || "http"}://${host}`;

    response.json({
      enabled: true,
      id: demoClient.id,
      name: demoClient.name,
      accessLevel: demoClient.accessLevel,
      apiKey: String(demoClient.key || ""),
      apiBaseUrl
    });
  });

  // Admin: read the shared demo key (for handing out).
  router.get("/admin/demo-key", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient();
    if (!demoClient) {
      throw createNotFoundError("demo_client_not_found", "No demo user configured.");
    }
    response.apiSuccess({
      id: demoClient.id,
      name: demoClient.name,
      accessLevel: demoClient.accessLevel,
      apiKey: String(demoClient.key || "")
    });
  });

  // Admin: create the demo user if missing (idempotent).
  router.post("/admin/demo-user", requireApiKey, adminOnly, (request, response) => {
    const result = ensureDemoClient();
    response.apiSuccess({
      created: result.created,
      upgraded: Boolean(result.upgraded),
      id: result.client?.id || "",
      name: result.client?.name || "",
      accessLevel: result.client?.accessLevel || "",
      apiKey: result.created ? String(result.client?.key || "") : ""
    });
  });

  // Admin: rotate the demo key.
  router.post("/admin/demo-user/rotate-key", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient();
    if (!demoClient) {
      throw createNotFoundError("demo_client_not_found", "No demo user configured.");
    }
    const result = registry.rotateManagedApiClientKey(demoClient.id);
    response.apiSuccess({
      rotated: true,
      id: demoClient.id,
      apiKey: String(result.client?.key || "")
    });
  });

  // Admin: wipe the demo profile.
  router.post("/admin/demo-user/reset-profile", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient();
    if (!demoClient) {
      throw createNotFoundError("demo_client_not_found", "No demo user configured.");
    }
    const reset = resetProfile(demoClient.id);
    response.apiSuccess({ reset, id: demoClient.id });
  });

  // Admin: remove the demo user.
  router.delete("/admin/demo-user", requireApiKey, adminOnly, (request, response) => {
    const demoClient = findDemoClient();
    if (!demoClient) {
      throw createNotFoundError("demo_client_not_found", "No demo user configured.");
    }
    const result = registry.removeManagedApiClient(demoClient.id);
    response.apiSuccess({ removed: result.removed, id: demoClient.id });
  });
};
