"use strict";

// Newsletter plugin — server routes (Admin only).
//   GET    /api/v1/plugins/newsletter/server/admin/audiences
//   GET    /api/v1/plugins/newsletter/server/admin/issues
//   POST   /api/v1/plugins/newsletter/server/admin/issues
//   DELETE /api/v1/plugins/newsletter/server/admin/issues/:id
//
// Sending reuses the platform inbox: an "all" audience becomes a broadcast,
// otherwise one inbox message is written per recipient. Rich HTML bodies are
// sanitised by the message model and rendered in a sandboxed frame.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_ISSUES = 200;

module.exports = function register(router, ctx) {
  const { createHttpError } = ctx;
  const { requireApiKey } = ctx.requireApi("src/middleware/api-key");
  const {
    ADMIN_API_MANAGEMENT_CAPABILITY,
    requireApiClientCapability
  } = ctx.requireApi("src/middleware/api-client-capability");
  const { createBroadcast } = ctx.requireApi("src/services/message-store");
  const { addProfileMessage } = ctx.requireApi("src/services/profile-service");
  const { resolveAudienceClientIds } = ctx.requireApi("src/services/audience-service");
  const { listRoleDefinitions } = ctx.requireApi("src/services/api-roles");
  const { listAccessLevelDefinitions } = ctx.requireApi("src/services/api-access-levels");
  const { readManagedApiClients } = ctx.requireApi("src/services/api-client-registry");

  const adminOnly = requireApiClientCapability({
    capabilityName: "adminApiManagement",
    anyRoles: ADMIN_API_MANAGEMENT_CAPABILITY.anyRoles,
    anyScopes: ADMIN_API_MANAGEMENT_CAPABILITY.anyScopes,
    errorCode: "insufficient_admin_capability",
    errorMessage: "This route requires the admin role or api:admin scope."
  });

  const issuesPath = path.join(ctx.dataDir, "issues.json");

  function readIssues() {
    try {
      const parsed = JSON.parse(fs.readFileSync(issuesPath, "utf8"));
      return Array.isArray(parsed?.issues) ? parsed.issues : [];
    } catch (_error) {
      return [];
    }
  }

  function writeIssues(issues) {
    fs.mkdirSync(ctx.dataDir, { recursive: true });
    fs.writeFileSync(issuesPath, `${JSON.stringify({ version: 1, issues }, null, 2)}\n`, "utf8");
  }

  router.get("/admin/audiences", requireApiKey, adminOnly, (_request, response) => {
    const clients = readManagedApiClients().filter((client) => client.hidden !== true);
    const nameById = new Map(clients.map((client) => [client.id, String(client.name || "").trim()]));
    const users = ctx.users.list().map((id) => ({ id, name: nameById.get(id) || id }));
    const roles = listRoleDefinitions().map((role) => ({ id: role.id, label: role.label || role.name || role.id }));
    const levels = listAccessLevelDefinitions().map((level) => ({
      id: level.id,
      label: `${level.label || level.name || level.id} (access)`
    }));
    response.apiSuccess({ users, roles: roles.concat(levels) });
  });

  router.get("/admin/issues", requireApiKey, adminOnly, (_request, response) => {
    const issues = readIssues().sort((left, right) => String(right.sentAt).localeCompare(String(left.sentAt)));
    response.apiSuccess({ count: issues.length, issues });
  });

  router.post("/admin/issues", requireApiKey, adminOnly, (request, response) => {
    const body = request.body && typeof request.body === "object" ? request.body : {};
    const subject = String(body.subject || "").trim();
    if (!subject) {
      throw createHttpError(400, "invalid_issue", "A subject is required.");
    }
    if (subject.length > 200) {
      throw createHttpError(400, "invalid_issue", "The subject cannot exceed 200 characters.");
    }

    const audience = body.audience && typeof body.audience === "object" ? body.audience : { type: "all" };
    const resolved = resolveAudienceClientIds(audience);
    if (resolved.type !== "all" && !resolved.clientIds.length) {
      throw createHttpError(400, "empty_audience", "No recipients matched that audience.");
    }

    const message = {
      kind: "report",
      title: subject,
      description: String(body.text || "").trim() || subject,
      bodyHtml: String(body.html || ""),
      visibility: body.visibility === "public" ? "public" : "internal",
      publishAt: String(body.publishAt || "").trim(),
      expiresAt: String(body.expiresAt || "").trim(),
      requiresAck: body.requiresAck === true
    };

    let delivered = 0;
    const failures = [];
    if (resolved.type === "all") {
      createBroadcast(message, { sender: "Newsletter" });
    } else {
      for (const clientId of resolved.clientIds) {
        try {
          addProfileMessage(clientId, message, { sender: "Newsletter" });
          delivered += 1;
        } catch (error) {
          failures.push({ clientId, error: error?.code || error?.message });
        }
      }
    }

    const issue = {
      id: `nl_${crypto.randomBytes(6).toString("hex")}`,
      subject,
      audience: resolved.type,
      roles: Array.isArray(audience.roles) ? audience.roles : [],
      userCount: resolved.clientIds.length,
      broadcast: resolved.type === "all",
      visibility: message.visibility,
      publishAt: message.publishAt,
      requiresAck: message.requiresAck,
      delivered,
      failures: failures.length,
      sentAt: new Date().toISOString()
    };

    const issues = readIssues();
    issues.push(issue);
    writeIssues(issues.slice(-MAX_ISSUES));
    response.status(201).apiSuccess(issue);
  });

  router.delete("/admin/issues/:id", requireApiKey, adminOnly, (request, response) => {
    const id = String(request.params.id || "").trim();
    const issues = readIssues();
    const next = issues.filter((entry) => entry.id !== id);
    writeIssues(next);
    response.apiSuccess({ removed: issues.length - next.length, id });
  });
};
