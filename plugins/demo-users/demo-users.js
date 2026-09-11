/* demo-users.js — DLC plugin (GUI side).
 * Provides the shared-demo login on the connection gate and the demo account
 * management card in Admin → Users. All server work lives in this plugin's
 * server.js (mounted at /api/v1/plugins/demo-users/server/...).
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
    const fields = document.getElementById("connection-gate-fields");
    if (!fields || !fields.parentElement) {
      return null;
    }
    gateBoxEl = document.createElement("div");
    gateBoxEl.id = "demo-users-gate-box";
    gateBoxEl.className = "connection-gate-demo";
    gateBoxEl.hidden = true;
    gateBoxEl.innerHTML = [
      '<div class="connection-gate-demo-row">',
      '  <strong>Try the shared demo user</strong>',
      '  <button id="demo-users-gate-use" class="connection-gate-demo-btn" type="button">Use Demo Access</button>',
      "</div>",
      '<div id="demo-users-gate-details" class="connection-gate-demo-details" aria-live="polite"></div>'
    ].join("");
    gateBoxEl.querySelector("#demo-users-gate-use").addEventListener("click", useDemoAccess);
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
      details.textContent = `${demo.name || "Demo User"} (${demo.id}) · ${demo.apiBaseUrl} · ${keyPreview}`;
    }
  }

  async function refreshGateBox() {
    const box = ensureGateBox();
    if (!box) {
      return;
    }
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
    if (!demo || demo.enabled !== true) {
      return;
    }
    const baseEl = document.getElementById("connection-gate-base-url");
    const keyEl = document.getElementById("connection-gate-api-key");
    if (baseEl) {
      baseEl.value = String(demo.apiBaseUrl || "");
    }
    if (keyEl) {
      keyEl.value = String(demo.apiKey || "");
    }
    const connect = document.getElementById("connection-gate-connect");
    if (connect) {
      connect.click();
    }
  }

  function bindGate() {
    ensureGateBox();
    const baseEl = document.getElementById("connection-gate-base-url");
    if (baseEl && !baseEl._demoUsersBound) {
      baseEl._demoUsersBound = true;
      baseEl.addEventListener("input", () => {
        if (gateRefreshTimer) {
          window.clearTimeout(gateRefreshTimer);
        }
        gateRefreshTimer = window.setTimeout(() => {
          gateRefreshTimer = null;
          void refreshGateBox();
        }, 400);
      });
    }
    void refreshGateBox();
  }

  // --- Admin → Users demo management card -----------------------------------

  function showKeyOnce(key, label) {
    if (!key) {
      return;
    }
    const overlayApi = window.TaroOverlay;
    if (!overlayApi?.open) {
      window.alert(`${label}: ${key}`);
      return;
    }
    const body = document.createElement("div");
    body.className = "demo-users-key";
    const hint = document.createElement("p");
    hint.className = "settings-field-hint";
    hint.textContent = "Copy this key now — it is shown once.";
    const code = document.createElement("code");
    code.className = "demo-users-key-code";
    code.textContent = key;
    body.append(hint, code);
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

  function makeButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dlc-shop-btn";
    button.textContent = label;
    button.addEventListener("click", () => void onClick(button));
    return button;
  }

  async function loadDemoState() {
    try {
      const client = await requestJson("GET", "/admin/demo-key");
      return client || null;
    } catch (_error) {
      return null;
    }
  }

  async function renderAdminCard(card) {
    card.replaceChildren();
    const demoClient = await loadDemoState();

    const head = document.createElement("strong");
    head.textContent = demoClient
      ? `Demo user (${demoClient.id})`
      : "Demo user (not configured)";
    const hint = document.createElement("span");
    hint.className = "settings-field-hint";
    hint.textContent = demoClient
      ? "Share the demo key; everyone shares one demo profile. Reset it whenever it gets messy."
      : "Create a shared demo account that visitors can use from the connection gate.";

    const actions = document.createElement("div");
    actions.className = "admin-client-actions";

    if (!demoClient) {
      actions.appendChild(makeButton("Create Demo User", async (button) => {
        button.disabled = true;
        try {
          const result = await requestJson("POST", "/admin/demo-user");
          showKeyOnce(result?.apiKey, "Demo user");
          await renderAdminCard(card);
        } catch (error) {
          window.alert(`Could not create demo user. ${error?.message || ""}`);
        } finally {
          button.disabled = false;
        }
      }));
    } else {
      actions.appendChild(makeButton("Copy Demo Key", async () => {
        const result = await requestJson("GET", "/admin/demo-key");
        showKeyOnce(result?.apiKey, "Demo user");
      }));
      actions.appendChild(makeButton("Reset Demo Key", async (button) => {
        if (!window.confirm("Reset the demo key? Everyone using the current demo key will be disconnected.")) return;
        button.disabled = true;
        try {
          const result = await requestJson("POST", "/admin/demo-user/rotate-key");
          showKeyOnce(result?.apiKey, "New demo");
        } finally {
          button.disabled = false;
        }
      }));
      actions.appendChild(makeButton("Reset Demo Profile", async (button) => {
        if (!window.confirm("Reset the shared demo profile? Its notes, quiz progress, and settings will be wiped.")) return;
        button.disabled = true;
        try {
          await requestJson("POST", "/admin/demo-user/reset-profile");
        } finally {
          button.disabled = false;
        }
      }));
      actions.appendChild(makeButton("Delete Demo User", async (button) => {
        if (!window.confirm("Delete the demo user? The shared demo key stops working immediately.")) return;
        button.disabled = true;
        try {
          await requestJson("DELETE", "/admin/demo-user");
          await renderAdminCard(card);
        } finally {
          button.disabled = false;
        }
      }));
    }

    card.append(head, hint, actions);
  }

  function ensureAdminCard() {
    const table = document.getElementById("admin-clients-table");
    if (!table) {
      return;
    }
    if (table.querySelector("#demo-users-admin-card")) {
      return;
    }
    const card = document.createElement("div");
    card.id = "demo-users-admin-card";
    card.className = "admin-client-row demo-users-admin-card";
    table.prepend(card);
    void renderAdminCard(card);
  }

  function observeAdminTable() {
    const table = document.getElementById("admin-clients-table");
    if (!table || table._demoUsersObserver) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (!table.querySelector("#demo-users-admin-card")) {
        ensureAdminCard();
      }
    });
    observer.observe(table, { childList: true });
    table._demoUsersObserver = observer;
    ensureAdminCard();
  }

  function boot() {
    bindGate();
    observeAdminTable();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  // The gate can appear later (connection lost); keep it wired.
  document.addEventListener("connection:access-updated", bindGate);

  const host = window.TaroTimePluginHost;
  if (host && typeof host.register === "function") {
    host.register({
      id: "demo-users",
      name: "Demo Users",
      kind: "gui",
      version: "1.0.0",
      mount() {
        boot();
      }
    });
  }
})();
