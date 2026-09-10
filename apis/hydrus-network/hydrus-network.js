(function () {
  "use strict";

  const BASE = "/api/v1/integrations/hydrus-network";
  const PAGE_SIZE = 24;
  const FILETYPE_OPTIONS = [
    { value: "", label: "Any type" },
    { value: "system:filetype is image", label: "Image" },
    { value: "system:filetype is video", label: "Video" },
    { value: "system:filetype is audio", label: "Audio" },
    { value: "system:filetype is animation", label: "Animation" },
    { value: "system:filetype is application", label: "Document" },
    { value: "system:filetype is archive", label: "Archive" }
  ];

  function unwrap(payload) {
    if (payload && typeof payload === "object" && "data" in payload) return payload.data;
    return payload;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function parseSearch(value) {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => parseSearch(entry));
    }
    return String(value || "")
      .split(/[,\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function normalizeCategories(raw) {
    return (Array.isArray(raw) ? raw : []).map((item, index) => {
      if (typeof item === "string") {
        const tags = parseSearch(item);
        return { id: `cat-${index}`, name: item, tags };
      }
      const tags = parseSearch(item?.search || item?.tags);
      const name = String(item?.name || item?.label || tags.join(", ") || `Category ${index + 1}`).trim();
      return {
        id: String(item?.id || name || index),
        name,
        tags
      };
    }).filter((item) => item.name && item.tags.length);
  }

  function isEverythingQuery(tags) {
    const list = (Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean);
    return list.length > 0 && list.every((tag) => tag === "*" || tag === "system:everything");
  }

  function normalizeHydrusTags(tags) {
    const list = (Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean);
    if (!list.length || isEverythingQuery(list)) {
      return ["system:everything"];
    }
    return list.map((tag) => (tag === "*" ? "system:everything" : tag));
  }

  function collectTags(meta) {
    const seen = new Set();
    const out = [];
    const walk = (value) => {
      if (Array.isArray(value)) {
        value.forEach((tag) => {
          if (typeof tag === "string" && tag && !seen.has(tag)) {
            seen.add(tag);
            out.push(tag);
          }
        });
        return;
      }
      if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(meta?.tags);
    return out;
  }

  function namespacedTag(tags, namespace) {
    const prefix = `${namespace}:`;
    const match = (Array.isArray(tags) ? tags : []).find((tag) => String(tag).toLowerCase().startsWith(prefix));
    return match ? String(match).slice(prefix.length).trim() : "";
  }

  function fileTitle(meta) {
    const tags = collectTags(meta);
    return namespacedTag(tags, "title")
      || namespacedTag(tags, "filename")
      || namespacedTag(tags, "name")
      || String(meta?.hash || meta?.file_id || "file").slice(0, 12);
  }

  function safeFilename(title, ext) {
    const base = String(title || "file").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "file";
    const suffix = String(ext || "").startsWith(".") ? ext : (ext ? `.${ext}` : "");
    return `${base.slice(0, 120)}${suffix}`;
  }

  async function loadConfig(helpers) {
    try {
      const payload = unwrap(await helpers.requestJson(
        "GET",
        `/api/v1/plugins/${encodeURIComponent(helpers.pluginName)}/config`
      ));
      if (payload?.config && typeof payload.config === "object") return payload.config;
      return payload && typeof payload === "object" ? payload : {};
    } catch (_error) {
      return {};
    }
  }

  function mount(root, helpers) {
    root.innerHTML = "";
    const shell = el("div", "hydrus-shell");
    const head = el("div", "hydrus-head");
    head.appendChild(el("h1", "", "Hydrus Network"));
    head.appendChild(el("p", "", "Browse files by admin-defined tag categories"));

    const status = el("div", "hydrus-status");
    const tabs = el("div", "hydrus-tabs");
    const extra = el("div", "hydrus-search");
    const extraInput = el("input");
    extraInput.type = "search";
    extraInput.placeholder = "Any Hydrus tag search, comma-separated";
    const extraGo = el("button", "hydrus-btn hydrus-btn-primary", "Search");
    extra.append(extraInput, extraGo);

    const filters = el("div", "hydrus-search");
    const filetypeSelect = el("select", "hydrus-select");
    FILETYPE_OPTIONS.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      filetypeSelect.appendChild(node);
    });
    filters.append(filetypeSelect);

    const body = el("div", "hydrus-body");

    shell.append(head, status, tabs, extra, filters, body);
    root.appendChild(shell);

    let categories = [];
    let allowSearch = false;
    let activeId = "";
    let extraTags = [];
    let page = 0;
    let cancelled = false;

    function setStatus(text, kind) {
      status.textContent = text || "";
      status.classList.toggle("is-error", kind === "error");
      status.classList.toggle("is-ok", kind === "ok");
      status.classList.toggle("is-offline", kind === "offline");
    }

    function isSectionActive() {
      return String(window.TarotSectionStateUi?.getActiveSection?.() || "") === "hydrus-network";
    }

    function isOfflineError(error) {
      const code = Number(error?.status);
      if (code === 502 || code === 503 || code === 504 || code === 0) {
        return true;
      }
      return /failed to fetch|network|unreachable|bad gateway|econnrefused/i.test(String(error?.message || ""));
    }

    function showOffline() {
      setStatus("Offline / no connection.", "offline");
      body.innerHTML = "";
      body.appendChild(el("div", "hydrus-empty", "Hydrus is offline. Files load when you open this page and the client is reachable."));
    }

    async function api(method, path) {
      return helpers.requestJson(method, `${BASE}${path}`);
    }

    function activeCategory() {
      return categories.find((item) => item.id === activeId) || null;
    }

    function collectSystemTags() {
      return [filetypeSelect.value].map((value) => String(value || "").trim()).filter(Boolean);
    }

    function resolveSearchTags() {
      const system = collectSystemTags();
      const category = activeCategory();
      let tags = [];
      if (category) {
        tags = normalizeHydrusTags(category.tags);
      } else if (extraTags.length && !isEverythingQuery(extraTags)) {
        tags = normalizeHydrusTags(extraTags);
      }
      if (system.length) {
        tags = tags.filter((tag) => tag !== "system:everything");
        tags = [...tags, ...system];
      }
      return tags.length ? tags : ["system:everything"];
    }

    function applyTab(id) {
      extraTags = [];
      extraInput.value = "";
      activeId = id;
      page = 0;
      renderTabs();
      void search();
    }

    function renderTabs() {
      tabs.innerHTML = "";
      extra.hidden = !allowSearch;
      filters.hidden = !(allowSearch || categories.length);
      const all = el("button", !activeId ? "is-active" : "", "All");
      all.addEventListener("click", () => applyTab(""));
      tabs.appendChild(all);
      categories.forEach((category) => {
        const button = el("button", category.id === activeId ? "is-active" : "", category.name);
        button.title = category.tags.join(", ");
        button.addEventListener("click", () => applyTab(category.id === activeId ? "" : category.id));
        tabs.appendChild(button);
      });
    }

    function attachThumb(img, fileId) {
      const path = `${BASE}/get_files/thumbnail?file_id=${encodeURIComponent(fileId)}`;
      if (typeof helpers.requestBlob === "function") {
        helpers.requestBlob("GET", path).then((blob) => {
          if (cancelled || !blob) return;
          img.src = URL.createObjectURL(blob);
        }).catch(() => img.remove());
        return;
      }
      img.src = path;
      img.addEventListener("error", () => img.remove());
    }

    async function downloadFile(meta, button) {
      const path = `${BASE}/get_files/file?file_id=${encodeURIComponent(meta.file_id)}`;
      button.disabled = true;
      try {
        if (typeof helpers.requestBlob !== "function") {
          throw new Error("Download is not available.");
        }
        const blob = await helpers.requestBlob("GET", path);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = safeFilename(fileTitle(meta), meta.ext || "");
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        setStatus(error.message || "Download failed.", "error");
      } finally {
        button.disabled = false;
      }
    }

    async function openWeb(meta, button) {
      const path = `${BASE}/_web-url?file_id=${encodeURIComponent(meta.file_id)}`;
      button.disabled = true;
      try {
        const payload = unwrap(await helpers.requestJson("GET", path));
        const url = String(payload?.url || "").trim();
        if (!url) throw new Error("No web URL returned.");
        window.open(url, "_blank", "noopener");
      } catch (error) {
        setStatus(error.message || "Could not open file.", "error");
      } finally {
        button.disabled = false;
      }
    }

    function renderFiles(rows, total) {
      body.innerHTML = "";
      if (!rows.length) {
        body.appendChild(el("div", "hydrus-empty", "No files matched this tag search."));
        return;
      }
      const grid = el("div", "hydrus-grid");
      rows.forEach((meta) => {
        const card = el("article", "hydrus-file");
        const title = fileTitle(meta);
        const img = document.createElement("img");
        img.alt = title;
        img.className = "hydrus-thumb";
        attachThumb(img, meta.file_id);
        card.appendChild(img);
        const bits = [
          meta.mime,
          meta.width && meta.height ? `${meta.width}×${meta.height}` : "",
          meta.size != null ? `${Math.round(Number(meta.size) / 1024)} KB` : ""
        ].filter(Boolean);
        const heading = el("strong", "", title);
        heading.title = title;
        card.appendChild(heading);
        card.appendChild(el("div", "hydrus-meta", bits.join(" · ")));
        const tags = collectTags(meta).filter((tag) => !String(tag).toLowerCase().startsWith("title:"));
        if (tags.length) {
          const chips = el("div", "hydrus-chips");
          tags.slice(0, 12).forEach((tag) => chips.appendChild(el("span", "hydrus-chip", tag)));
          card.appendChild(chips);
        }
        const actionsRow = el("div", "hydrus-inline");
        const download = el("button", "hydrus-btn", "Download");
        download.addEventListener("click", () => void downloadFile(meta, download));
        const web = el("button", "hydrus-btn", "Web");
        web.addEventListener("click", () => void openWeb(meta, web));
        actionsRow.append(download, web);
        card.appendChild(actionsRow);
        grid.appendChild(card);
      });
      body.appendChild(grid);
      if (total > PAGE_SIZE) {
        const pager = el("div", "hydrus-inline");
        const prev = el("button", "hydrus-btn", "Previous");
        prev.disabled = page <= 0;
        prev.addEventListener("click", () => {
          page = Math.max(0, page - 1);
          void search();
        });
        const next = el("button", "hydrus-btn", "Next");
        next.disabled = (page + 1) * PAGE_SIZE >= total;
        next.addEventListener("click", () => {
          page += 1;
          void search();
        });
        pager.append(prev, next);
        body.appendChild(pager);
      }
    }

    async function search() {
      const category = activeCategory();
      const tags = resolveSearchTags();
      setStatus(`Searching ${category ? category.name : tags.join(", ")}…`);
      body.innerHTML = "";
      try {
        const encoded = encodeURIComponent(JSON.stringify(tags));
        const found = unwrap(await api(
          "GET",
          `/get_files/search_files?tags=${encoded}&file_sort_type=2&file_sort_asc=false`
        ));
        const ids = Array.isArray(found?.file_ids) ? found.file_ids : [];
        const slice = ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        let rows = [];
        if (slice.length) {
          const meta = unwrap(await api(
            "GET",
            `/get_files/file_metadata?file_ids=${encodeURIComponent(JSON.stringify(slice))}&include_notes=false`
          ));
          rows = Array.isArray(meta?.metadata) ? meta.metadata : [];
        }
        setStatus(`${ids.length} file${ids.length === 1 ? "" : "s"} · ${tags.join(", ")}`, ids.length ? "ok" : "");
        renderFiles(rows, ids.length);
      } catch (error) {
        if (isOfflineError(error)) {
          showOffline();
          return;
        }
        setStatus(error.message || "Search failed.", "error");
      }
    }

    function runTypedSearch() {
      extraTags = parseSearch(extraInput.value);
      if (isEverythingQuery(extraTags)) {
        extraTags = [];
        extraInput.value = "";
        activeId = "";
        filetypeSelect.value = "";
        renderTabs();
      }
      page = 0;
      void search();
    }
    extraGo.addEventListener("click", () => runTypedSearch());
    extraInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runTypedSearch();
    });
    filetypeSelect.addEventListener("change", () => {
      page = 0;
      void search();
    });

    async function refresh() {
      const config = await loadConfig(helpers);
      if (cancelled) return;
      categories = normalizeCategories(config.categories);
      allowSearch = Boolean(config.allowSearch);
      if (!allowSearch) extraTags = [];
      if (activeId && !categories.some((item) => item.id === activeId)) {
        activeId = "";
        page = 0;
      }
      renderTabs();
      await search();
    }

    const onUpdate = (event) => {
      if (String(event?.detail?.pluginName || "") !== helpers.pluginName) {
        return;
      }
      if (isSectionActive()) {
        void refresh();
      }
    };
    const onSection = (event) => {
      if (String(event?.detail?.activeSection || "") !== "hydrus-network") {
        return;
      }
      if (status.classList.contains("is-offline")) {
        void refresh();
      }
    };
    document.addEventListener("taro-plugin-content-updated", onUpdate);
    document.addEventListener("section:changed", onSection);
    if (isSectionActive()) {
      void refresh();
    } else {
      setStatus("Open this page to load files.");
    }

    return () => {
      cancelled = true;
      document.removeEventListener("taro-plugin-content-updated", onUpdate);
      document.removeEventListener("section:changed", onSection);
      root.innerHTML = "";
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[hydrus-network] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "hydrus-network",
    name: "Hydrus Network",
    kind: "api",
    version: "1.7.1",
    section: { id: "hydrus-network", label: "Hydrus Network" },
    mount
  });
})();
