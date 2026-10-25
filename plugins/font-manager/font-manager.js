(function () {
  "use strict";

  const PLUGIN_ID = "font-manager";
  const SERVER_BASE = "/api/v1/plugins/font-manager/server";
  const STACKS = ["main", "display", "arabic", "enochian", "cjk"];
  const STACK_LABELS = {
    main: "Main text",
    display: "Display / headings",
    arabic: "Arabic",
    enochian: "Enochian",
    cjk: "CJK"
  };
  const SCRIPT_OPTIONS = [
    ["latin", "Latin / general"],
    ["hebrew", "Hebrew"],
    ["greek", "Greek"],
    ["arabic", "Arabic"],
    ["enochian", "Enochian"],
    ["cjk", "CJK"],
    ["custom", "Custom range"]
  ];
  const SCRIPT_RANGES = {
    latin: "U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F",
    hebrew: "U+0590-05FF,U+FB1D-FB4F",
    greek: "U+0370-03FF,U+1F00-1FFF",
    arabic: "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF",
    enochian: "U+1680-169F",
    cjk: "U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF",
    custom: ""
  };

  let fonts = [];
  let assignments = {};
  let loadedFaces = new Map();
  let coreStackValues = {};
  let coreCaptured = false;
  let refreshToken = 0;
  let booted = false;
  let sectionRefresh = null;

  function service() {
    return window.TarotDataService;
  }

  function apiKey() {
    return window.TarotAppConfig?.getApiKey?.() || "";
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
    const key = apiKey();
    const response = await fetch(pluginUrl(path), {
      method,
      cache: "no-store",
      headers: {
        ...(key ? { "x-api-key": key } : {}),
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    return payload?.data ?? payload;
  }

  async function requestBlob(path) {
    const svc = service();
    if (svc && typeof svc.requestBlob === "function") {
      return svc.requestBlob("GET", pluginUrl(path));
    }
    const key = apiKey();
    const response = await fetch(pluginUrl(path), {
      headers: key ? { "x-api-key": key } : {}
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.blob();
  }

  function isAdmin() {
    return window.TarotAppConfig?.hasAdminApiManagementAccess?.() === true;
  }

  function canReadAdmin() {
    return typeof window.TarotAppConfig?.hasAdminApiManagementAccess === "function";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fontLabel(font) {
    return `${font.family} (${font.weight || 400}${font.style === "italic" ? " italic" : ""})`;
  }

  function fileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function captureCoreStacks() {
    if (coreCaptured) return;
    const root = document.documentElement;
    coreStackValues = {};
    for (const stack of STACKS) {
      coreStackValues[stack] = root.style.getPropertyValue(`--font-custom-${stack}`).trim();
    }
    coreCaptured = true;
  }

  function applyStackValues() {
    const root = document.documentElement;
    for (const stack of STACKS) {
      const ids = Array.isArray(assignments[stack]) ? assignments[stack] : [];
      const families = [];
      for (const id of ids) {
        const font = fonts.find((entry) => entry.id === id);
        if (font && !families.includes(font.family)) {
          families.push(font.family);
        }
      }
      if (families.length) {
        root.style.setProperty(`--font-custom-${stack}`, families.map((family) => `"${family}"`).join(", "));
      } else if (coreStackValues[stack]) {
        root.style.setProperty(`--font-custom-${stack}`, coreStackValues[stack]);
      } else {
        root.style.removeProperty(`--font-custom-${stack}`);
      }
    }
  }

  function clearFaces() {
    for (const entry of loadedFaces.values()) {
      try {
        document.fonts.delete(entry.face);
      } catch (_error) {}
      URL.revokeObjectURL(entry.url);
    }
    loadedFaces.clear();
  }

  async function loadFace(font) {
    if (!font || loadedFaces.has(font.id) || typeof window.FontFace !== "function") {
      return loadedFaces.get(font?.id)?.face || null;
    }
    try {
      const blob = await requestBlob(`/fonts/${encodeURIComponent(font.file)}`);
      const url = URL.createObjectURL(blob);
      const descriptors = {
        weight: String(font.weight || 400),
        style: font.style || "normal",
        display: "swap"
      };
      if (font.unicodeRange) {
        descriptors.unicodeRange = font.unicodeRange;
      }
      const face = new FontFace(font.family, `url("${url}")`, descriptors);
      await face.load();
      document.fonts.add(face);
      loadedFaces.set(font.id, { face, url });
      return face;
    } catch (error) {
      console.warn(`[font-manager] Could not load ${font.family}`, error);
      return null;
    }
  }

  async function refreshState() {
    const token = ++refreshToken;
    const [fontPayload, settingsPayload] = await Promise.all([
      requestJson("GET", "/fonts"),
      requestJson("GET", "/settings")
    ]);
    if (token !== refreshToken) return;
    fonts = Array.isArray(fontPayload?.fonts) ? fontPayload.fonts : [];
    assignments = settingsPayload?.assignments || fontPayload?.assignments || {};

    const wanted = new Set();
    for (const stack of STACKS) {
      for (const id of (assignments[stack] || [])) {
        wanted.add(id);
      }
    }
    await Promise.all(fonts.filter((font) => wanted.has(font.id)).map(loadFace));
    if (token !== refreshToken) return;

    for (const [id, entry] of Array.from(loadedFaces.entries())) {
      if (!wanted.has(id)) {
        try {
          document.fonts.delete(entry.face);
        } catch (_error) {}
        URL.revokeObjectURL(entry.url);
        loadedFaces.delete(id);
      }
    }

    applyStackValues();
    document.dispatchEvent(new CustomEvent("font-manager:changed"));
    if (sectionRefresh) {
      sectionRefresh();
    }
  }

  function start() {
    if (!window.TarotDataService) {
      setTimeout(start, 100);
      return;
    }
    if (booted) {
      refreshState().catch((error) => console.warn("[font-manager]", error));
      return;
    }
    booted = true;
    captureCoreStacks();
    refreshState().catch((error) => console.warn("[font-manager]", error));
  }

  document.addEventListener("fonts:loaded", () => {
    coreCaptured = false;
    captureCoreStacks();
    if (booted) {
      applyStackValues();
    } else {
      start();
    }
  });

  for (const eventName of ["connection:access-updated", "config:defaults-loaded"]) {
    document.addEventListener(eventName, () => {
      clearFaces();
      coreCaptured = false;
      captureCoreStacks();
      booted = false;
      start();
    });
  }

  function hideNonAdminNav() {
    if (!canReadAdmin() || isAdmin()) return;
    const button = document.getElementById("open-font-manager");
    if (button) {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
    }
  }

  function renderShell(root) {
    root.innerHTML = `
      <div class="settings-page-shell font-manager">
        <div class="settings-panel settings-panel-wide">
          <div class="settings-panel-head">
            <strong>Fonts</strong>
            <span>Upload font files and choose which families the site uses. Built-in fonts stay as fallbacks; symbol fonts such as I Ching and Enochian glyphs are still managed by the built-in catalog.</span>
          </div>
          <div class="font-manager-status" aria-live="polite"></div>
          <div class="font-manager-upload"></div>
          <div class="font-manager-library"></div>
          <div class="font-manager-assignments"></div>
          <div class="settings-actions font-manager-actions">
            <button type="button" class="font-manager-button" data-action="reload">Reload</button>
            <button type="button" class="font-manager-button font-manager-button-primary" data-action="save">Save assignments</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderStatus(root, message, tone) {
    const status = root.querySelector(".font-manager-status");
    if (!status) return;
    status.textContent = message || "";
    status.dataset.tone = tone || "info";
  }

  function renderUpload(root) {
    const host = root.querySelector(".font-manager-upload");
    if (!host) return;
    host.innerHTML = `
      <div class="font-manager-panel">
        <div class="font-manager-panel-head">
          <strong>Upload a font</strong>
          <span class="settings-field-hint">.woff2, .woff, .ttf, or .otf, up to 20 MB per file.</span>
        </div>
        <div class="font-manager-form">
          <label class="settings-field">Font file<input type="file" accept=".woff2,.woff,.ttf,.otf" data-field="file"></label>
          <label class="settings-field">Family name<input type="text" data-field="family" placeholder="e.g. My Hebrew" maxlength="80"></label>
          <label class="settings-field">Script<select data-field="script">
            ${SCRIPT_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
          </select></label>
          <label class="settings-field">Weight<select data-field="weight">
            ${[300, 400, 500, 600, 700, 800, 900].map((weight) => `<option value="${weight}"${weight === 400 ? " selected" : ""}>${weight}</option>`).join("")}
          </select></label>
          <label class="settings-field">Style<select data-field="style">
            <option value="normal" selected>Normal</option>
            <option value="italic">Italic</option>
          </select></label>
          <label class="settings-field settings-field-full">Unicode range<input type="text" data-field="range" placeholder="U+0590-05FF" maxlength="240"></label>
        </div>
        <div class="settings-actions">
          <button type="button" class="font-manager-button font-manager-button-primary" data-action="upload">Upload font</button>
        </div>
      </div>
    `;
    const fileEl = host.querySelector('[data-field="file"]');
    const familyEl = host.querySelector('[data-field="family"]');
    const scriptEl = host.querySelector('[data-field="script"]');
    const rangeEl = host.querySelector('[data-field="range"]');
    scriptEl.value = "latin";
    rangeEl.value = SCRIPT_RANGES.latin;
    scriptEl.addEventListener("change", () => {
      rangeEl.value = SCRIPT_RANGES[scriptEl.value] || "";
    });
    fileEl.addEventListener("change", () => {
      const file = fileEl.files && fileEl.files[0];
      if (!file || familyEl.value.trim()) return;
      familyEl.value = file.name.replace(/\.[^.]+$/, "").replace(/[^\w \-]+/g, " ").replace(/\s+/g, " ").trim();
    });
  }

  function renderLibrary(root) {
    const host = root.querySelector(".font-manager-library");
    if (!host) return;
    if (!fonts.length) {
      host.innerHTML = `<div class="font-manager-panel"><div class="settings-field-hint">No fonts uploaded yet. Add one above.</div></div>`;
      return;
    }
    host.innerHTML = `
      <div class="font-manager-panel">
        <div class="font-manager-panel-head">
          <strong>Font library</strong>
          <span class="settings-field-hint">Assign families below. A family can have several weights or styles.</span>
        </div>
        <div class="font-manager-font-list">
          ${fonts.map((font) => `
            <div class="font-manager-font" data-font-id="${escapeHtml(font.id)}">
              <div class="font-manager-font-main">
                <strong>${escapeHtml(font.family)}</strong>
                <span>${escapeHtml(font.file)} · ${escapeHtml(font.script || "custom")} · ${font.weight || 400}${font.style === "italic" ? " italic" : ""} · ${escapeHtml(fileSize(font.size))}</span>
                ${font.unicodeRange ? `<span class="font-manager-range">${escapeHtml(font.unicodeRange)}</span>` : ""}
              </div>
              <div class="font-manager-font-preview" style="font-family: &quot;${escapeHtml(font.family)}&quot;, sans-serif">
                Aa אבג Αβγ العربية ᚠ 天地
              </div>
              <div class="font-manager-font-actions">
                <button type="button" class="font-manager-button" data-action="preview" data-font-id="${escapeHtml(font.id)}">Preview</button>
                <button type="button" class="font-manager-button font-manager-button-danger" data-action="delete" data-font-id="${escapeHtml(font.id)}">Delete</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderAssignments(root) {
    const host = root.querySelector(".font-manager-assignments");
    if (!host) return;
    host.innerHTML = `
      <div class="font-manager-panel">
        <div class="font-manager-panel-head">
          <strong>Where each family is used</strong>
          <span class="settings-field-hint">Fonts are tried in order. Leave a stack empty to use the built-in fonts for it.</span>
        </div>
        <div class="font-manager-stack-list">
          ${STACKS.map((stack) => renderStack(stack)).join("")}
        </div>
      </div>
    `;
  }

  function renderStack(stack) {
    const ids = Array.isArray(assignments[stack]) ? assignments[stack] : [];
    const selected = ids.map((id) => fonts.find((font) => font.id === id)).filter(Boolean);
    const available = fonts.filter((font) => !ids.includes(font.id));
    return `
      <div class="font-manager-stack" data-stack="${stack}">
        <div class="font-manager-stack-head"><strong>${escapeHtml(STACK_LABELS[stack])}</strong><span>${selected.length ? `${selected.length} selected` : "Built-in fonts"}</span></div>
        <div class="font-manager-chips">
          ${selected.length ? selected.map((font, index) => `
            <span class="font-manager-chip">
              <span>${escapeHtml(fontLabel(font))}</span>
              <button type="button" data-action="move-up" data-stack="${stack}" data-index="${index}" aria-label="Move up">↑</button>
              <button type="button" data-action="move-down" data-stack="${stack}" data-index="${index}" aria-label="Move down">↓</button>
              <button type="button" data-action="remove" data-stack="${stack}" data-index="${index}" aria-label="Remove">×</button>
            </span>
          `).join("") : `<span class="settings-field-hint">Using the built-in font stack.</span>`}
        </div>
        <div class="font-manager-stack-add">
          <select data-stack-select="${stack}"${available.length ? "" : " disabled"}>
            ${available.length ? available.map((font) => `<option value="${escapeHtml(font.id)}">${escapeHtml(fontLabel(font))}</option>`).join("") : `<option value="">No fonts available</option>`}
          </select>
          <button type="button" class="font-manager-button" data-action="add" data-stack="${stack}"${available.length ? "" : " disabled"}>Add</button>
          <button type="button" class="font-manager-button" data-action="clear" data-stack="${stack}"${ids.length ? "" : " disabled"}>Use built-in</button>
        </div>
      </div>
    `;
  }

  function renderAll(root) {
    renderLibrary(root);
    renderAssignments(root);
  }

  function mount(root, helpers) {
    if (!isAdmin()) {
      root.innerHTML = `
        <div class="settings-page-shell font-manager">
          <div class="settings-panel settings-panel-wide">
            <div class="settings-panel-head">
              <strong>Fonts</strong>
              <span>Only administrators can upload or assign fonts. The site's font assignments still apply.</span>
            </div>
          </div>
        </div>
      `;
      return function () {};
    }

    renderShell(root);
    renderUpload(root);
    renderAll(root);

    const onLibraryClick = async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "preview") {
        const font = fonts.find((entry) => entry.id === button.dataset.fontId);
        if (!font) return;
        const face = await loadFace(font);
        if (face) {
          renderStatus(root, `Loaded ${font.family} for preview.`, "ok");
        } else {
          renderStatus(root, `Could not load ${font.family}.`, "error");
        }
      }
      if (action === "delete") {
        const font = fonts.find((entry) => entry.id === button.dataset.fontId);
        if (!font || !window.confirm(`Delete ${font.family}? Assignments using it will be removed.`)) return;
        button.disabled = true;
        try {
          await requestJson("DELETE", `/fonts/${encodeURIComponent(font.file)}`);
          renderStatus(root, `Deleted ${font.family}.`, "ok");
          await refreshState();
        } catch (error) {
          renderStatus(root, `Could not delete: ${error.message}`, "error");
        } finally {
          button.disabled = false;
        }
      }
    };

    const onAssignmentClick = (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const stack = button.dataset.stack;
      if (!STACKS.includes(stack)) return;
      const list = Array.isArray(assignments[stack]) ? assignments[stack].slice() : [];
      const action = button.dataset.action;
      if (action === "add") {
        const select = root.querySelector(`[data-stack-select="${stack}"]`);
        const id = String(select?.value || "");
        if (id && !list.includes(id)) list.push(id);
      } else if (action === "remove") {
        list.splice(Number(button.dataset.index), 1);
      } else if (action === "move-up") {
        const index = Number(button.dataset.index);
        if (index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
      } else if (action === "move-down") {
        const index = Number(button.dataset.index);
        if (index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
      } else if (action === "clear") {
        list.length = 0;
      } else {
        return;
      }
      assignments[stack] = list;
      renderAssignments(root);
    };

    const onUpload = async () => {
      const fileEl = root.querySelector('.font-manager-upload [data-field="file"]');
      const familyEl = root.querySelector('.font-manager-upload [data-field="family"]');
      const scriptEl = root.querySelector('.font-manager-upload [data-field="script"]');
      const weightEl = root.querySelector('.font-manager-upload [data-field="weight"]');
      const styleEl = root.querySelector('.font-manager-upload [data-field="style"]');
      const rangeEl = root.querySelector('.font-manager-upload [data-field="range"]');
      const file = fileEl?.files && fileEl.files[0];
      if (!file) {
        renderStatus(root, "Choose a font file first.", "error");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        renderStatus(root, "That font is larger than 20 MB.", "error");
        return;
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.readAsDataURL(file);
      }).catch((error) => {
        renderStatus(root, error.message, "error");
        return "";
      });
      if (!data) return;
      const uploadButton = root.querySelector('.font-manager-upload [data-action="upload"]');
      if (uploadButton) uploadButton.disabled = true;
      try {
        await requestJson("POST", "/fonts", {
          fileName: file.name,
          family: familyEl?.value || "",
          script: scriptEl?.value || "latin",
          weight: Number(weightEl?.value || 400),
          style: styleEl?.value || "normal",
          unicodeRange: rangeEl?.value || "",
          data
        });
        renderStatus(root, `Uploaded ${file.name}.`, "ok");
        if (fileEl) fileEl.value = "";
        await refreshState();
      } catch (error) {
        renderStatus(root, `Could not upload: ${error.message}`, "error");
      } finally {
        if (uploadButton) uploadButton.disabled = false;
      }
    };

    const onSave = async () => {
      const button = root.querySelector('.font-manager-actions [data-action="save"]');
      if (button) button.disabled = true;
      try {
        const payload = await requestJson("POST", "/settings", { assignments });
        assignments = payload?.assignments || assignments;
        await refreshState();
        renderStatus(root, "Assignments saved. The site fonts have been updated.", "ok");
      } catch (error) {
        renderStatus(root, `Could not save: ${error.message}`, "error");
      } finally {
        if (button) button.disabled = false;
      }
    };

    const onReload = async () => {
      renderStatus(root, "Reloading fonts…", "info");
      try {
        await refreshState();
        renderStatus(root, "Fonts reloaded.", "ok");
      } catch (error) {
        renderStatus(root, `Could not reload: ${error.message}`, "error");
      }
    };

    const library = root.querySelector(".font-manager-library");
    const assignmentsHost = root.querySelector(".font-manager-assignments");
    const uploadHost = root.querySelector(".font-manager-upload");
    library?.addEventListener("click", onLibraryClick);
    assignmentsHost?.addEventListener("click", onAssignmentClick);
    uploadHost?.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="upload"]')) {
        void onUpload();
      }
    });
    root.querySelector('.font-manager-actions [data-action="save"]')?.addEventListener("click", onSave);
    root.querySelector('.font-manager-actions [data-action="reload"]')?.addEventListener("click", onReload);
    const onChanged = () => {
      renderLibrary(root);
      renderAssignments(root);
    };
    document.addEventListener("font-manager:changed", onChanged);
    sectionRefresh = () => {
      renderLibrary(root);
      renderAssignments(root);
    };
    refreshState().catch((error) => renderStatus(root, `Could not load fonts: ${error.message}`, "error"));

    return function () {
      document.removeEventListener("font-manager:changed", onChanged);
      library?.removeEventListener("click", onLibraryClick);
      assignmentsHost?.removeEventListener("click", onAssignmentClick);
      sectionRefresh = null;
    };
  }

  if (window.TaroTimePluginHost && typeof window.TaroTimePluginHost.register === "function") {
    window.TaroTimePluginHost.register({
      id: PLUGIN_ID,
      name: "Font Manager",
      version: "1.0.0",
      section: { id: "font-manager", label: "Fonts" },
      mount
    });
  }

  hideNonAdminNav();
  setTimeout(hideNonAdminNav, 0);
  setTimeout(hideNonAdminNav, 750);
  start();
})();
