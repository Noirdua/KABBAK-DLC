/* demo-users.js — DLC plugin (GUI side).
 * Gate demo login + a Demo & Trial Accounts manager in Admin. Demo accounts are
 * shared connection-gate logins; trial accounts are individually issued with an
 * expiry. Both support access level, roles/scopes, reset key/profile, delete,
 * and reveal key. All server work is in this plugin's server.js.
 */
(function () {
  "use strict";

  const SERVER_BASE = "/api/v1/plugins/demo-users/server";

  function service() {
    return window.TarotDataService;
  }

  function pluginUrl(path) {
    const full = `${SERVER_BASE}${path}`;
    const svc = service();
    return svc && typeof svc.buildApiUrl === "function" ? svc.buildApiUrl(full) : full;
  }

  async function requestJson(method, path, body) {
    const svc = service();
    if (svc && typeof svc.requestJson === "function") {
      return svc.requestJson(method, pluginUrl(path), body);
    }
    const response = await fetch(pluginUrl(path), {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || `Request failed (${response.status}).`);
    }
    return payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function apiBaseFromInput(raw) {
    let value = String(raw || "").trim().replace(/\/+$/, "");
    if (!value || !/^https?:\/\//i.test(value)) {
      return "";
    }
    if (!/\/api\/v1$/i.test(value)) {
      value += "/api/v1";
    }
    return value;
  }

  function parseListInput(value) {
    return String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function formatExpiry(account) {
    if (!account.expiresAt) return "No expiry";
    const when = new Date(account.expiresAt);
    if (Number.isNaN(when.getTime())) return "No expiry";
    return account.expired ? `Expired ${when.toLocaleString()}` : `Expires ${when.toLocaleString()}`;
  }

  // --- Key reveal -----------------------------------------------------------

  function showKeyOnce(key, label) {
    if (!key) return;
    const overlayApi = window.TaroOverlay;
    if (!overlayApi?.open) {
      window.alert(`${label}: ${key}`);
      return;
    }
    const body = el("div", "demo-users-key");
    body.append(
      el("p", "settings-field-hint", "Copy this key now — it is shown once."),
      el("code", "demo-users-key-code", key)
    );
    overlayApi.open({
      title: label,
      body,
      size: "small",
      actions: [
        {
          label: "Copy",
          primary: true,
          closeOnClick: false,
          onClick: () => {
            navigator.clipboard?.writeText?.(key).catch(() => {});
          }
        },
        { label: "Close" }
      ]
    });
  }

  // --- Connection gate demo box ---------------------------------------------

  let demoCache = { baseUrl: "", value: undefined };
  let gateBoxEl = null;
  let gateRefreshTimer = null;

  function candidateApiBases() {
    const gateInput = document.getElementById("connection-gate-base-url");
    const candidates = [apiBaseFromInput(gateInput?.value || ""), apiBaseFromInput(service()?.getApiBaseUrl?.() || "")];
    return candidates.filter((value, index) => value && candidates.indexOf(value) === index);
  }

  function ensureGateBox() {
    if (gateBoxEl && document.body.contains(gateBoxEl)) {
      return gateBoxEl;
    }
    const fields = document.querySelector(".connection-gate-fields")
      || document.getElementById("connection-gate-fields");
    if (!fields || !fields.parentElement) {
      return null;
    }
    gateBoxEl = el("div", "connection-gate-demo");
    gateBoxEl.id = "demo-users-gate-box";
    gateBoxEl.hidden = true;

    const row = el("div", "connection-gate-demo-row");
    row.appendChild(el("strong", "", "Try a demo account"));
    const useBtn = el("button", "connection-gate-demo-btn", "Use Demo Access");
    useBtn.type = "button";
    useBtn.addEventListener("click", useDemoAccess);
    row.appendChild(useBtn);
    const details = el("div", "connection-gate-demo-details");
    details.id = "demo-users-gate-details";
    details.setAttribute("aria-live", "polite");
    gateBoxEl.append(row, details);

    fields.insertAdjacentElement("afterend", gateBoxEl);
    return gateBoxEl;
  }

  function applyGateBox(box) {
    const demo = demoCache.value;
    if (!demo || demo.enabled !== true) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const details = box.querySelector("#demo-users-gate-details");
    if (details) {
      const keyPreview = demo.apiKey ? `${String(demo.apiKey).slice(0, 10)}…` : "(no key needed)";
      const expiry = demo.expiresAt ? ` · until ${new Date(demo.expiresAt).toLocaleDateString()}` : "";
      details.textContent = `${demo.name || "Demo"} (${demo.id}) · ${demo.apiBaseUrl} · ${keyPreview}${expiry}`;
    }
  }

  async function refreshGateBox() {
    const box = ensureGateBox();
    if (!box) return;
    const candidates = candidateApiBases();
    if (!candidates.length) {
      demoCache = { baseUrl: "", value: undefined };
      applyGateBox(box);
      return;
    }
    for (const baseUrl of candidates) {
      if (demoCache.baseUrl === baseUrl && demoCache.value !== undefined) {
        applyGateBox(box);
        return;
      }
      try {
        const response = await fetch(`${baseUrl}/plugins/demo-users/server/demo-access`, { cache: "no-store" });
        if (!response.ok) {
          demoCache = { baseUrl, value: null };
          continue;
        }
        const payload = await response.json().catch(() => null);
        demoCache = { baseUrl, value: payload && payload.enabled === true ? payload : null };
        break;
      } catch (_error) {
        demoCache = { baseUrl, value: null };
        break;
      }
    }
    applyGateBox(box);
  }

  function useDemoAccess() {
    const demo = demoCache.value;
    if (!demo || demo.enabled !== true) return;
    const baseEl = document.getElementById("connection-gate-base-url");
    const keyEl = document.getElementById("connection-gate-api-key");
    if (baseEl) baseEl.value = String(demo.apiBaseUrl || "");
    if (keyEl) keyEl.value = String(demo.apiKey || "");
    document.getElementById("connection-gate-connect")?.click();
  }

  function bindGate() {
    ensureGateBox();
    const baseEl = document.getElementById("connection-gate-base-url");
    if (baseEl && !baseEl._demoUsersBound) {
      baseEl._demoUsersBound = true;
      baseEl.addEventListener("input", () => {
        if (gateRefreshTimer) window.clearTimeout(gateRefreshTimer);
        gateRefreshTimer = window.setTimeout(() => {
          gateRefreshTimer = null;
          void refreshGateBox();
        }, 400);
      });
    }
    void refreshGateBox();
  }

  // --- Admin: full Demo Users manager ---------------------------------------

  let accessLevels = ["basic", "premium"];

  async function loadAccessLevels() {
    try {
      const svc = service();
      const payload = await svc?.requestJson?.("GET", svc.buildApiUrl("/api/v1/admin/access-levels"));
      const list = Array.isArray(payload?.accessLevels) ? payload.accessLevels : [];
      const ids = list.map((entry) => String(entry?.id || entry?.accessLevel || "").trim()).filter(Boolean);
      if (ids.length) accessLevels = ids;
    } catch (_error) {
      // keep defaults
    }
  }

  function buildCreateForm(onCreated) {
    const form = el("div", "settings-grid demo-users-create");
    const fields = {};

    const addField = (labelText, name, options = {}) => {
      const label = el("label", "settings-field", labelText);
      let input;
      if (options.select) {
        input = el("select");
        options.select.forEach((entry) => {
          const value = typeof entry === "string" ? entry : entry.value;
          const opt = el("option", "", typeof entry === "string" ? entry : entry.label);
          opt.value = value;
          input.appendChild(opt);
        });
      } else {
        input = el("input");
        input.type = options.type || "text";
        if (options.placeholder) input.placeholder = options.placeholder;
      }
      input.id = `demo-users-field-${name}`;
      label.appendChild(input);
      form.appendChild(label);
      fields[name] = input;
      return input;
    };

    const kindSelect = addField("Kind", "kind", {
      select: [
        { value: "trial", label: "Trial — hand out to one person" },
        { value: "demo", label: "Demo — shared connection-gate account" }
      ]
    });
    kindSelect.value = "trial";

    addField("Name", "name", { placeholder: "e.g. Ada 2-week trial" });
    const levelSelect = addField("Access level", "accessLevel", { select: accessLevels });
    levelSelect.value = accessLevels.includes("premium") ? "premium" : accessLevels[0];
    addField("Roles (comma-separated, blank = access default)", "roles", { placeholder: "reader" });
    addField("Scopes (comma-separated, blank = access default)", "scopes", { placeholder: "api:read" });
    addField("Trial days (blank = kind default)", "ttlDays", { type: "number", placeholder: "14" });

    const actions = el("div", "demo-users-form-actions");
    const createBtn = el("button", "settings-button-primary", "Create Account");
    createBtn.type = "button";
    createBtn.addEventListener("click", async () => {
      createBtn.disabled = true;
      try {
        const kind = String(fields.kind.value || "trial").trim();
        const ttl = String(fields.ttlDays.value || "").trim();
        const roles = parseListInput(fields.roles.value);
        const scopes = parseListInput(fields.scopes.value);
        const payload = {
          kind,
          name: String(fields.name.value || "").trim() || (kind === "trial" ? "Trial account" : "Demo account"),
          accessLevel: String(fields.accessLevel.value || "").trim()
        };
        if (roles.length) payload.roles = roles;
        if (scopes.length) payload.scopes = scopes;
        if (ttl) payload.ttlDays = Number(ttl);
        const result = await requestJson("POST", "/admin/demo-accounts", payload);
        showKeyOnce(result?.apiKey, kind === "trial" ? "New trial key" : "New demo key");
        onCreated?.();
      } catch (error) {
        window.alert(`Could not create account. ${error?.message || ""}`);
      } finally {
        createBtn.disabled = false;
      }
    });
    actions.appendChild(createBtn);
    form.appendChild(actions);
    return form;
  }

  function buildAccountRow(account, onChanged) {
    const row = el("div", "demo-users-row");

    const kind = account.kind === "trial" ? "trial" : "demo";
    const info = el("div", "demo-users-row-main");
    const titleRow = el("div", "demo-users-row-title");
    titleRow.appendChild(el("strong", "", account.name || account.id));
    titleRow.appendChild(el("span", `demo-users-kind demo-users-kind-${kind}`, kind === "trial" ? "Trial" : "Demo"));
    info.appendChild(titleRow);
    const meta = el("span", "settings-field-hint", [
      `id ${account.id}`,
      account.accessLevel,
      account.roles?.length ? `roles: ${account.roles.join(", ")}` : "roles: default",
      account.scopes?.length ? `scopes: ${account.scopes.join(", ")}` : "scopes: default",
      formatExpiry(account)
    ].join(" · "));
    info.appendChild(meta);
    if (account.expired) {
      info.appendChild(el("span", "demo-users-status-expired", "Expired"));
    }
    row.appendChild(info);

    const actions = el("div", "demo-users-row-actions");
    const addAction = (label, handler, opts = {}) => {
      const btn = el("button", `dlc-shop-btn${opts.danger ? " is-danger" : ""}`, label);
      btn.type = "button";
      btn.addEventListener("click", () => void handler(btn));
      actions.appendChild(btn);
    };

    addAction("Reveal key", async () => {
      const result = await requestJson("GET", `/admin/demo-accounts/${encodeURIComponent(account.id)}/key`);
      showKeyOnce(result?.apiKey, account.name || account.id);
    });
    addAction("Reset password", async (btn) => {
      if (!window.confirm(`Reset the key for "${account.name}"? The old key stops working immediately.`)) return;
      btn.disabled = true;
      try {
        const result = await requestJson("POST", `/admin/demo-accounts/${encodeURIComponent(account.id)}/rotate-key`);
        showKeyOnce(result?.apiKey, account.name || account.id);
        onChanged?.();
      } finally {
        btn.disabled = false;
      }
    });
    addAction("Edit", () => {
      const level = window.prompt(`Access level for "${account.name}" (${accessLevels.join(", ")}):`, account.accessLevel);
      if (level === null) return;
      const days = window.prompt("Trial days from now (blank = no expiry):", "");
      const payload = { accessLevel: String(level || "").trim() };
      if (days !== null && String(days).trim()) payload.ttlDays = Number(days);
      void requestJson("PATCH", `/admin/demo-accounts/${encodeURIComponent(account.id)}`, payload)
        .then(() => onChanged?.())
        .catch((error) => window.alert(`Could not update. ${error?.message || ""}`));
    });
    addAction("Reset profile", async (btn) => {
      if (!window.confirm(`Reset the profile for "${account.name}"?`)) return;
      btn.disabled = true;
      try {
        await requestJson("POST", `/admin/demo-accounts/${encodeURIComponent(account.id)}/reset-profile`);
      } finally {
        btn.disabled = false;
      }
    });
    addAction("Delete", async (btn) => {
      if (!window.confirm(`Delete account "${account.name}"? Its key stops working immediately.`)) return;
      btn.disabled = true;
      try {
        await requestJson("DELETE", `/admin/demo-accounts/${encodeURIComponent(account.id)}`);
        onChanged?.();
      } finally {
        btn.disabled = false;
      }
    }, { danger: true });

    row.appendChild(actions);
    return row;
  }

  async function renderPanel(bodyEl) {
    bodyEl.replaceChildren();
    let accounts = [];
    try {
      const payload = await requestJson("GET", "/admin/demo-accounts");
      accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
    } catch (error) {
      bodyEl.appendChild(el("span", "settings-field-hint", `Could not load demo accounts. ${error?.message || ""}`));
      return;
    }

    const reload = () => void renderPanel(bodyEl);
    bodyEl.appendChild(buildCreateForm(reload));

    const listEl = el("div", "demo-users-list");
    if (!accounts.length) {
      listEl.appendChild(el("span", "settings-field-hint", "No demo or trial accounts yet. Create one above."));
    } else {
      accounts
        .slice()
        .sort((a, b) => {
          const rank = (entry) => (entry.kind === "trial" ? 0 : 1);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return String(a.name || "").localeCompare(String(b.name || ""));
        })
        .forEach((account) => listEl.appendChild(buildAccountRow(account, reload)));
    }
    bodyEl.appendChild(listEl);
  }

  function ensureAdminPanel() {
    const table = document.getElementById("admin-clients-table");
    if (!table || document.getElementById("demo-users-admin-panel")) {
      return;
    }
    const usersPanel = table.closest(".settings-panel");
    if (!usersPanel || !usersPanel.parentElement) {
      return;
    }

    const panel = el("div", "settings-panel settings-panel-wide");
    panel.id = "demo-users-admin-panel";
    const head = el("div", "settings-panel-head");
    head.appendChild(el("strong", "", "Demo & Trial Accounts"));
    head.appendChild(el("span", "", "Shared demo accounts for the connection gate, plus individually issued trial accounts you can hand out (for example two-week trials). Both are hidden from the normal Users list and can carry their own access level, roles, scopes, and expiry."));
    const body = el("div", "demo-users-panel-body");
    panel.append(head, body);
    usersPanel.insertAdjacentElement("afterend", panel);

    void loadAccessLevels().then(() => renderPanel(body));
  }

  function observeAdmin() {
    const target = document.getElementById("admin-section") || document.body;
    if (!target || target._demoUsersObserver) {
      ensureAdminPanel();
      return;
    }
    const observer = new MutationObserver(() => ensureAdminPanel());
    observer.observe(target, { childList: true, subtree: true });
    target._demoUsersObserver = observer;
    ensureAdminPanel();
  }

  function boot() {
    bindGate();
    observeAdmin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  document.addEventListener("connection:access-updated", bindGate);

  const host = window.TaroTimePluginHost;
  if (host && typeof host.register === "function") {
    host.register({
      id: "demo-users",
      name: "Demo Users",
      kind: "gui",
      version: "1.2.0",
      mount() {
        boot();
      }
    });
  }
})();
