(function () {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_error) {
      return "";
    }
  }

  function faviconOf(url) {
    const host = hostOf(url);
    return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : "";
  }

  function normalizeLinks(raw) {
    return (Array.isArray(raw) ? raw : []).map((item) => {
      if (typeof item === "string") {
        return { title: hostOf(item) || item, url: item, note: "", group: "" };
      }
      const url = String(item?.url || "").trim();
      return {
        title: String(item?.title || hostOf(url) || url).trim(),
        url,
        note: String(item?.note || "").trim(),
        group: String(item?.group || "").trim(),
        image: String(item?.image || "").trim()
      };
    }).filter((item) => item.url);
  }

  async function loadConfig(helpers) {
    try {
      const payload = await helpers.requestJson("GET", `/api/v1/plugins/${encodeURIComponent(helpers.pluginName)}/config`);
      return payload?.config && typeof payload.config === "object" ? payload.config : {};
    } catch (_error) {
      return {};
    }
  }

  function renderDirectory(root, config, helpers) {
    root.innerHTML = "";
    const shell = el("div", "links-dir");
    const hero = el("div", "links-hero");
    hero.appendChild(el("h1", "", config.title || "Links"));
    hero.appendChild(el("p", "", config.subtitle || "A living bookmark directory"));
    shell.appendChild(hero);

    const links = normalizeLinks(config.links);
    if (!links.length) {
      const empty = el("div", "links-empty", "No bookmarks yet. An admin can add entries in Settings → DLC Shop → Links.");
      shell.appendChild(empty);
      root.appendChild(shell);
      return;
    }

    const groups = [];
    links.forEach((link) => {
      const name = link.group || "All";
      if (!groups.includes(name)) groups.push(name);
    });
    const hasGroups = groups.some((name) => name !== "All") || groups.length > 1;
    let active = "All";

    const grid = el("div", "links-grid");

    function paint() {
      grid.innerHTML = "";
      const visible = active === "All" ? links : links.filter((link) => (link.group || "All") === active);
      visible.forEach((link, index) => {
        const card = document.createElement("a");
        card.className = "links-card";
        card.href = link.url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.style.setProperty("--i", String(index));
        const custom = String(link.image || "").trim();
        const icon = /^https?:\/\//i.test(custom)
          ? custom
          : (custom && helpers?.fileUrl ? helpers.fileUrl("images", custom) : faviconOf(link.url));
        if (icon) {
          const img = document.createElement("img");
          img.src = icon;
          img.alt = "";
          card.appendChild(img);
        }
        card.appendChild(el("strong", "", link.title));
        if (link.note) card.appendChild(el("em", "", link.note));
        card.appendChild(el("span", "", hostOf(link.url) || link.url));
        grid.appendChild(card);
      });
    }

    if (hasGroups) {
      const bar = el("div", "links-groups");
      ["All", ...groups.filter((name) => name !== "All")].forEach((name) => {
        const button = el("button", name === active ? "is-active" : "", name);
        button.addEventListener("click", () => {
          active = name;
          bar.querySelectorAll("button").forEach((node) => node.classList.toggle("is-active", node.textContent === active));
          paint();
        });
        bar.appendChild(button);
      });
      shell.appendChild(bar);
    }

    shell.appendChild(grid);
    root.appendChild(shell);
    paint();
  }

  function mount(root, helpers) {
    let cancelled = false;

    async function refresh() {
      const config = await loadConfig(helpers);
      if (!cancelled) renderDirectory(root, config, helpers);
    }

    const onUpdate = (event) => {
      if (String(event?.detail?.pluginName || "") === helpers.pluginName) {
        void refresh();
      }
    };
    document.addEventListener("taro-plugin-content-updated", onUpdate);
    void refresh();
    return () => {
      cancelled = true;
      document.removeEventListener("taro-plugin-content-updated", onUpdate);
      root.innerHTML = "";
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[links] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "links",
    name: "Links",
    version: "1.0.0",
    section: { id: "links", label: "Links" },
    mount
  });
})();
