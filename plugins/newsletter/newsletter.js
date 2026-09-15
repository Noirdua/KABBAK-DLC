/* newsletter.js — DLC plugin (GUI side).
 * Adds a Newsletter composer to Admin → Messages: subject, rich HTML body with
 * a live sandboxed preview, audience (everyone / users / tiers), scheduling and
 * acknowledgement options, a send action, and a history of past issues.
 */
(function () {
  "use strict";

  const SERVER_BASE = "/api/v1/plugins/newsletter/server";

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

  function state() {
    return {
      mode: "rich",
      audiences: null,
      editor: null,
      htmlArea: null,
      preview: null,
      history: null,
      status: null
    };
  }

  const ui = state();

  function getHtml() {
    if (ui.mode === "html") {
      return String(ui.htmlArea?.value || "");
    }
    return String(ui.editor?.innerHTML || "");
  }

  function syncPreview() {
    if (!ui.preview) return;
    ui.preview.srcdoc = getHtml() || "<p style='font-family:sans-serif;color:#777'>Nothing to preview yet.</p>";
  }

  function setStatus(text, isError) {
    if (!ui.status) return;
    ui.status.textContent = text || "";
    ui.status.dataset.tone = isError ? "error" : "neutral";
  }

  function field(labelText) {
    const wrap = el("label", "settings-field newsletter-field");
    wrap.appendChild(el("span", "", labelText));
    return wrap;
  }

  function toolbarButton(label, command, value) {
    const button = el("button", "dlc-shop-btn newsletter-tool", label);
    button.type = "button";
    button.addEventListener("click", () => {
      try {
        document.execCommand(command, false, value);
        syncPreview();
      } catch (_error) {
        setStatus("That formatting command is unavailable in this browser.", true);
      }
    });
    return button;
  }

  function buildEditor() {
    const wrap = el("div", "newsletter-editor");
    const toolbar = el("div", "newsletter-toolbar");
    toolbar.append(
      toolbarButton("B", "bold"),
      toolbarButton("I", "italic"),
      toolbarButton("U", "underline"),
      toolbarButton("H2", "formatBlock", "<h2>"),
      toolbarButton("P", "formatBlock", "<p>"),
      toolbarButton("• List", "insertUnorderedList"),
      toolbarButton("Link", "createLink"),
      toolbarButton("Image", "insertImage"),
      toolbarButton("Clear", "removeFormat")
    );

    const editor = el("div", "newsletter-body");
    editor.contentEditable = "true";
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.addEventListener("input", syncPreview);

    const htmlArea = el("textarea", "newsletter-html");
    htmlArea.rows = 12;
    htmlArea.hidden = true;
    htmlArea.addEventListener("input", syncPreview);

    const modeRow = el("div", "newsletter-mode");
    const richBtn = el("button", "dlc-shop-btn", "Rich text");
    richBtn.type = "button";
    const htmlBtn = el("button", "dlc-shop-btn", "HTML");
    htmlBtn.type = "button";
    const setMode = (mode) => {
      ui.mode = mode;
      richBtn.classList.toggle("is-active", mode === "rich");
      htmlBtn.classList.toggle("is-active", mode === "html");
      if (mode === "html") {
        htmlArea.value = String(editor.innerHTML || "");
        editor.hidden = true;
        toolbar.hidden = true;
        htmlArea.hidden = false;
      } else {
        editor.innerHTML = String(htmlArea.value || "");
        editor.hidden = false;
        toolbar.hidden = false;
        htmlArea.hidden = true;
      }
      syncPreview();
    };
    richBtn.addEventListener("click", () => setMode("rich"));
    htmlBtn.addEventListener("click", () => setMode("html"));
    setMode("rich");

    wrap.append(modeRow, toolbar, editor, htmlArea);
    modeRow.append(richBtn, htmlBtn);
    ui.editor = editor;
    ui.htmlArea = htmlArea;
    return wrap;
  }

  function buildAudience() {
    const wrap = el("div", "newsletter-audience");
    const radios = el("div", "planner-audience");
    const usersBox = el("div", "planner-audience-list");
    const rolesBox = el("div", "planner-audience-list");
    usersBox.hidden = true;
    rolesBox.hidden = true;

    [["all", "Everyone"], ["users", "Specific users"], ["roles", "By tier / role"]].forEach(([value, label], index) => {
      const check = el("label", "planner-check");
      const input = el("input");
      input.type = "radio";
      input.name = "newsletter-audience";
      input.value = value;
      if (index === 0) input.checked = true;
      input.addEventListener("change", () => {
        usersBox.hidden = value !== "users";
        rolesBox.hidden = value !== "roles";
      });
      check.append(input, el("span", "", label));
      radios.appendChild(check);
    });

    const listCheck = (target, name, items) => {
      target.textContent = "";
      (items || []).forEach((item) => {
        const check = el("label", "planner-check planner-audience-item");
        const input = el("input");
        input.type = "checkbox";
        input.name = name;
        input.value = item.id;
        check.append(input, el("span", "", item.label || item.name || item.id));
        target.appendChild(check);
      });
    };

    wrap.append(radios, usersBox, rolesBox);

    async function load() {
      if (ui.audiences) {
        listCheck(usersBox, "newsletter-user", ui.audiences.users);
        listCheck(rolesBox, "newsletter-role", ui.audiences.roles);
        return;
      }
      try {
        const result = await requestJson("GET", "/admin/audiences");
        ui.audiences = result || { users: [], roles: [] };
        listCheck(usersBox, "newsletter-user", ui.audiences.users);
        listCheck(rolesBox, "newsletter-role", ui.audiences.roles);
      } catch (_error) {
        usersBox.appendChild(el("span", "settings-field-hint", "Could not load users."));
      }
    }
    void load();

    return { wrap, usersBox, rolesBox };
  }

  function readAudience() {
    const type = document.querySelector('input[name="newsletter-audience"]:checked')?.value || "all";
    if (type === "users") {
      return { type: "users", clientIds: Array.from(document.querySelectorAll('input[name="newsletter-user"]:checked')).map((i) => i.value) };
    }
    if (type === "roles") {
      return { type: "roles", roles: Array.from(document.querySelectorAll('input[name="newsletter-role"]:checked')).map((i) => i.value) };
    }
    return { type: "all" };
  }

  async function send() {
    const subject = String(document.getElementById("newsletter-subject")?.value || "").trim();
    if (!subject) {
      setStatus("Add a subject first.", true);
      return;
    }
    const publishAt = String(document.getElementById("newsletter-publish")?.value || "").trim();
    setStatus("Sending…");
    try {
      const issue = await requestJson("POST", "/admin/issues", {
        subject,
        html: getHtml(),
        text: String(document.getElementById("newsletter-text")?.value || ""),
        audience: readAudience(),
        visibility: document.getElementById("newsletter-public")?.checked ? "public" : "internal",
        requiresAck: document.getElementById("newsletter-ack")?.checked === true,
        publishAt: publishAt ? new Date(publishAt).toISOString() : ""
      });
      setStatus(issue.broadcast ? "Sent to everyone's inbox." : `Delivered to ${issue.delivered} inbox(es).`);
      await loadHistory();
    } catch (error) {
      setStatus(error?.message || "Could not send the newsletter.", true);
    }
  }

  function renderHistory(issues) {
    const list = ui.history;
    if (!list) return;
    list.textContent = "";
    if (!issues.length) {
      list.appendChild(el("p", "settings-field-hint", "No newsletters sent yet."));
      return;
    }
    issues.forEach((issue) => {
      const row = el("div", "newsletter-history-row");
      const info = el("div", "newsletter-history-info");
      info.appendChild(el("strong", "", issue.subject));
      const parts = [
        issue.broadcast ? "everyone" : `${issue.userCount || issue.delivered || 0} recipient(s)`,
        issue.visibility,
        issue.publishAt ? `scheduled ${new Date(issue.publishAt).toLocaleString()}` : "sent",
        issue.delivered ? `delivered ${issue.delivered}` : "",
        issue.failures ? `${issue.failures} failed` : "",
        new Date(issue.sentAt).toLocaleString()
      ].filter(Boolean);
      info.appendChild(el("span", "settings-field-hint", parts.join(" · ")));
      const remove = el("button", "dlc-shop-btn", "Delete");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        try {
          await requestJson("DELETE", `/admin/issues/${encodeURIComponent(issue.id)}`);
          await loadHistory();
        } catch (error) {
          setStatus(error?.message || "Could not delete.", true);
        }
      });
      row.append(info, remove);
      list.appendChild(row);
    });
  }

  async function loadHistory() {
    try {
      const result = await requestJson("GET", "/admin/issues");
      renderHistory(Array.isArray(result?.issues) ? result.issues : []);
    } catch (_error) {
      if (ui.history) {
        ui.history.textContent = "";
        ui.history.appendChild(el("p", "settings-field-hint", "Could not load history."));
      }
    }
  }

  function buildPanel() {
    const panel = el("div", "settings-panel settings-panel-wide");
    panel.id = "newsletter-panel";
    const head = el("div", "settings-panel-head");
    head.appendChild(el("strong", "", "Newsletter"));
    head.appendChild(el("span", "", "Rich HTML newsletters delivered to KABBAK inboxes — everyone, selected users, or whole tiers."));
    const body = el("div", "newsletter-panel-body");

    const subjectField = field("Subject");
    const subject = el("input");
    subject.id = "newsletter-subject";
    subject.type = "text";
    subject.maxLength = 200;
    subjectField.appendChild(subject);

    const bodyField = field("Body");
    bodyField.appendChild(buildEditor());

    const textField = field("Plain-text fallback (optional)");
    const textArea = el("textarea");
    textArea.id = "newsletter-text";
    textArea.rows = 3;
    textField.appendChild(textArea);

    const audience = buildAudience();
    const audienceField = field("Audience");
    audienceField.appendChild(audience.wrap);

    const options = el("div", "newsletter-options");
    const publicLabel = el("label", "planner-check");
    const publicInput = el("input");
    publicInput.type = "checkbox";
    publicInput.id = "newsletter-public";
    publicLabel.append(publicInput, el("span", "", "Public share page"));
    const ackLabel = el("label", "planner-check");
    const ackInput = el("input");
    ackInput.type = "checkbox";
    ackInput.id = "newsletter-ack";
    ackLabel.append(ackInput, el("span", "", "Requires acknowledgement"));
    const publishLabel = el("label", "settings-field newsletter-field");
    const publish = el("input");
    publish.type = "datetime-local";
    publish.id = "newsletter-publish";
    publishLabel.append(el("span", "", "Publish at (optional)"), publish);
    options.append(publicLabel, ackLabel, publishLabel);

    const previewField = field("Preview");
    const preview = el("iframe", "newsletter-preview");
    preview.setAttribute("sandbox", "");
    preview.setAttribute("title", "Newsletter preview");
    previewField.appendChild(preview);
    ui.preview = preview;

    ui.status = el("div", "settings-page-status newsletter-status");
    const actions = el("div", "dlc-shop-actions");
    const sendBtn = el("button", "settings-button-primary", "Send newsletter");
    sendBtn.type = "button";
    sendBtn.addEventListener("click", () => {
      void send();
    });
    const refreshBtn = el("button", "dlc-shop-btn", "Refresh history");
    refreshBtn.type = "button";
    refreshBtn.addEventListener("click", () => {
      void loadHistory();
    });
    actions.append(sendBtn, refreshBtn);

    const historyHead = el("div", "newsletter-history-head");
    historyHead.appendChild(el("strong", "", "Sent newsletters"));
    ui.history = el("div", "newsletter-history");
    ui.history.id = "newsletter-history";

    body.append(subjectField, bodyField, textField, audienceField, options, previewField, ui.status, actions, historyHead, ui.history);
    panel.append(head, body);
    syncPreview();
    void loadHistory();
    return panel;
  }

  function ensurePanel() {
    if (document.getElementById("newsletter-panel")) {
      return;
    }
    const messagesPanel = document.getElementById("admin-panel-messages");
    const shell = messagesPanel?.querySelector(".settings-panel");
    if (!shell) {
      return;
    }
    shell.insertAdjacentElement("afterend", buildPanel());
  }

  function observeAdmin() {
    const target = document.getElementById("admin-section") || document.body;
    if (!target) {
      return;
    }
    const observer = new MutationObserver(() => ensurePanel());
    observer.observe(target, { childList: true, subtree: true });
    ensurePanel();
  }

  function boot() {
    observeAdmin();
  }

  document.addEventListener("connection:updated", () => {
    ensurePanel();
  });
  document.addEventListener("section:changed", () => {
    ensurePanel();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  const host = window.TaroTimePluginHost;
  if (host && typeof host.register === "function") {
    host.register({
      id: "newsletter",
      name: "Newsletter",
      kind: "gui",
      version: "1.0.0",
      mount() {
        boot();
      }
    });
  }
})();
