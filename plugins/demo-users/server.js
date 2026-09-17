"use strict";

// Demo Users plugin — server routes.
// Manages two kinds of *hidden* managed API client (never shown in Admin →
// Users), both with an optional expiry:
//   demo  (cli_demo_*)  — shared accounts the connection-gate demo button uses.
//   trial (cli_trial_*) — individually issued, time-limited accounts to hand out.
// Routes live under /api/v1/plugins/demo-users/server/...
//
// "Reset password" is the key rotation endpoint: the API key is the credential.

const crypto = require("node:crypto");

const DEMO_ID_PREFIX = "cli_demo";
const TRIAL_ID_PREFIX = "cli_trial";
const KINDS = Object.freeze(["demo", "trial"]);
const DEFAULT_ACCESS_LEVEL = "premium";
const DEFAULT_TRIAL_DAYS = 14;

// Operator settings stored in the plugin's config.json (Admin → DLC → Demo
// Users → Settings). Legacy keys (defaultAccessLevel/defaultTtlDays/maxAccounts)
// are still read for compatibility.
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  allowRemote: false,
  demoAccessLevel: DEFAULT_ACCESS_LEVEL,
  trialAccessLevel: DEFAULT_ACCESS_LEVEL,
  defaultTrialDays: DEFAULT_TRIAL_DAYS,
  maxDemoAccounts: 0,
  maxTrialAccounts: 0,
  gateAccountId: ""
});

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

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

  function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const legacyLevel = String(source.defaultAccessLevel || "").trim();
    const demoAccessLevel = String(source.demoAccessLevel || "").trim() || legacyLevel || DEFAULT_SETTINGS.demoAccessLevel;
    // The old `defaultTtlDays` described demos (0 meant "no expiry"); only carry
    // it over when it expressed a real trial length, else use the trial default.
    const legacyTrialDays = Number(source.defaultTtlDays);
    const trialDaysSource = source.defaultTrialDays !== undefined
      ? source.defaultTrialDays
      : (Number.isFinite(legacyTrialDays) && legacyTrialDays > 0 ? legacyTrialDays : undefined);
    return {
      enabled: source.enabled === undefined ? DEFAULT_SETTINGS.enabled : source.enabled === true,
      allowRemote: source.allowRemote === true,
      demoAccessLevel,
      trialAccessLevel: String(source.trialAccessLevel || "").trim() || demoAccessLevel,
      defaultTrialDays: clampInt(trialDaysSource, 0, 3650, DEFAULT_SETTINGS.defaultTrialDays),
      maxDemoAccounts: clampInt(
        source.maxDemoAccounts !== undefined ? source.maxDemoAccounts : source.maxAccounts,
        0,
        1000,
        DEFAULT_SETTINGS.maxDemoAccounts
      ),
      maxTrialAccounts: clampInt(source.maxTrialAccounts, 0, 1000, DEFAULT_SETTINGS.maxTrialAccounts),
      gateAccountId: String(source.gateAccountId || "").trim()
    };
  }

  function readSettings() {
    return normalizeSettings(ctx.readConfig());
  }

  function kindOfClientId(id) {
    const value = String(id || "");
    if (value === TRIAL_ID_PREFIX || value.startsWith(`${TRIAL_ID_PREFIX}_`)) return "trial";
    if (value === DEMO_ID_PREFIX || value.startsWith(`${DEMO_ID_PREFIX}_`)) return "demo";
    return "";
  }

  function prefixForKind(kind) {
    return kind === "trial" ? TRIAL_ID_PREFIX : DEMO_ID_PREFIX;
  }

  function normalizeKind(value, fallback) {
    const kind = String(value || "").trim().toLowerCase();
    if (!kind) return fallback;
    if (!KINDS.includes(kind)) {
      throw createHttpError(400, "invalid_kind", `Unknown account kind '${kind}'.`);
    }
    return kind;
  }

  function generateAccountId(existing, kind) {
    const taken = new Set(
      (Array.isArray(existing) ? existing : []).map((client) => client?.id).filter(Boolean)
    );
    const prefix = prefixForKind(kind);
    let id = "";
    do {
      id = `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
    } while (taken.has(id));
    return id;
  }

  function listDemoClients(kind) {
    const wanted = String(kind || "").trim();
    return registry.readManagedApiClients().filter((client) => {
      const clientKind = kindOfClientId(client.id);
      if (!clientKind) return false;
      return wanted ? clientKind === wanted : true;
    });
  }

  function findDemoClient(id) {
    const wanted = String(id || "").trim();
    return listDemoClients().find((client) => client.id === wanted) || null;
  }

  function summarize(client) {
    return {
      id: client.id,
      kind: kindOfClientId(client.id),
      name: client.name || client.id,
      accessLevel: client.accessLevel,
      roles: Array.isArray(client.roles) ? client.roles : [],
      scopes: Array.isArray(client.scopes) ? client.scopes : [],
      expiresAt: String(client.expiresAt || ""),
      expired: registry.isClientExpired(client),
      keyPreview: client.key ? `${String(client.key).slice(0, 10)}…` : ""
    };
  }

  function computeExpiresAt(body, existing, defaultTtlDays = 0) {
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
    // New accounts fall back to the operator's default trial length.
    if (!existing && defaultTtlDays > 0) {
      return new Date(nowMs() + defaultTtlDays * 24 * 60 * 60 * 1000).toISOString();
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

  function isDemoAccessAllowed(request, settings) {
    if (!settings.enabled) {
      return false;
    }
    const raw = String(process.env.KABBAK_DEMO_ACCESS || "").trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(raw)) {
      return true;
    }
    if (settings.allowRemote) {
      return true;
    }
    return isLoopbackOrPrivateIp(request.ip || request.socket?.remoteAddress);
  }

  router.get("/demo-access", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const settings = readSettings();
    if (!isDemoAccessAllowed(request, settings)) {
      response.json({ enabled: false });
      return;
    }

    const wantedId = String(request.query?.id || settings.gateAccountId || "").trim();
    // Only shared demo accounts feed the gate; trials are handed out directly.
    const active = listDemoClients("demo").filter((client) => !registry.isClientExpired(client));
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

  // Readable by any authenticated key (no secrets), writable by admins only.
  router.get("/admin/settings", requireApiKey, (_request, response) => {
    response.apiSuccess({ settings: readSettings() });
  });

  router.post("/admin/settings", requireApiKey, adminOnly, (request, response) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const incoming = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
      ? body.settings
      : body;
    const next = normalizeSettings(incoming);
    // Validate the access levels against the live registry before persisting.
    normalizeAccessLevel(next.demoAccessLevel, DEFAULT_SETTINGS.demoAccessLevel);
    normalizeAccessLevel(next.trialAccessLevel, DEFAULT_SETTINGS.demoAccessLevel);
    const merged = { ...(ctx.readConfig() || {}), ...next };
    const saved = ctx.writeConfig(merged);
    response.apiSuccess({ settings: normalizeSettings(saved) });
  });

  router.get("/admin/demo-accounts", requireApiKey, adminOnly, (request, response) => {
    const wanted = String(request.query?.kind || "").trim();
    const kind = wanted ? normalizeKind(wanted, "") : "";
    const accounts = listDemoClients(kind || undefined).map(summarize);
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
    const settings = readSettings();
    const kind = normalizeKind(body.kind, "demo");
    const current = listDemoClients(kind);
    const cap = kind === "trial" ? settings.maxTrialAccounts : settings.maxDemoAccounts;
    if (cap > 0 && current.length >= cap) {
      const label = kind === "trial" ? "Trial" : "Demo";
      throw createHttpError(409, "demo_account_limit", `${label} account limit reached (${cap}).`);
    }
    const name = String(body.name || "").trim() || (kind === "trial" ? "Trial account" : "Demo account");
    const existing = registry.readManagedApiClients();
    const id = generateAccountId(existing, kind);
    const key = registry.generateManagedApiClientKey(existing);
    const fallbackLevel = kind === "trial" ? settings.trialAccessLevel : settings.demoAccessLevel;
    const accessLevel = normalizeAccessLevel(body.accessLevel, fallbackLevel);
    const defaultTtlDays = kind === "trial" ? settings.defaultTrialDays : 0;
    const expiresAt = computeExpiresAt(body, null, defaultTtlDays);

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
    const expiresAt = computeExpiresAt(body, demoClient, 0);

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
