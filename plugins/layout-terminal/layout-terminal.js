/* layout-terminal.js — terminal-style skin.
 * Fixed left index + breadcrumb bar. Reads the live menu (including Menu Order)
 * and leaves every app page's own layout untouched.
 */
(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[layout-terminal] TaroTimePluginHost is not available.");
    return;
  }

  const VERSION = "1.0.1";

  const DEFAULT_CONFIG = {
    followTheme: false,
    colors: {},
    brand: "kabbak",
    byline: "correspondence archive",
    showSearch: true,
    sidebarWidth: 264
  };

  const COLOR_PROPERTIES = {
    bg: "--terminal-bg",
    panel: "--terminal-panel",
    raised: "--terminal-raised",
    line: "--terminal-line",
    text: "--terminal-text",
    bright: "--terminal-text-bright",
    muted: "--terminal-muted",
    dim: "--terminal-dim",
    accent: "--terminal-accent",
    green: "--terminal-green"
  };

  const PRIMARY_ID_BY_SECTION = {
    home: "open-home",
    tarot: "open-tarot-cards",
    "tarot-frame": "open-tarot-frame",
    "tarot-house": "open-tarot-house",
    "playing-cards": "open-playing-cards",
    planner: "open-calendar",
    sky: "open-sky",
    natal: "open-natal",
    zodiac: "open-zodiac",
    planets: "open-planets",
    cycles: "open-cycles",
    modalities: "open-modalities",
    elements: "open-elements",
    tattvas: "open-tattvas",
    astronomy: "open-sky",
    iching: "open-iching-hexagrams",
    "iching-trigram": "open-iching-trigrams",
    "iching-bigram": "open-iching-bigrams",
    "iching-phase": "open-iching-phases",
    kabbalah: "open-kabbalah-sephirot",
    "kabbalah-worlds": "open-kabbalah-worlds",
    "kabbalah-paths": "open-kabbalah-paths",
    "kabbalah-cross": "open-kabbalah-cross",
    "kabbalah-tree": "open-kabbalah-tree",
    cube: "open-kabbalah-cube",
    "kabbalah-tandem": "open-kabbalah-tandem",
    alphabet: "open-alphabet-word",
    "alphabet-letters": "open-alphabet-letters",
    "alphabet-text": "open-alphabet-text",
    "alphabet-reference": "open-alphabet-reference",
    scriber: "open-scriber",
    numbers: "open-numbers-browse",
    "num-pad": "open-numbers-num-pad",
    quiz: "open-quiz",
    community: "open-community",
    games: "open-games",
    gods: "open-gods",
    enochian: "open-enochian",
    profile: "open-profile",
    admin: "open-admin",
    "audio-circle": "open-audio-circle",
    "audio-notes": "open-audio-notes"
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function safeColor(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\)|var\(--[a-z0-9-]+\))$/i.test(raw) ? raw : "";
  }

  function mergeConfig(base, incoming) {
    const next = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
    return {
      ...base,
      ...next,
      colors: {
        ...base.colors,
        ...(next.colors && typeof next.colors === "object" && !Array.isArray(next.colors) ? next.colors : {})
      }
    };
  }

  host.register({
    id: "layout-terminal",
    name: "Terminal Layout",
    version: VERSION,
    role: "skin",
    mount(shellEl, helpers) {
      const ui = helpers.ui;
      if (!ui) {
        console.warn("[layout-terminal] helpers.ui is not available.");
        return null;
      }

      ui.hideDefaultChrome();
      shellEl.innerHTML = `
        <div class="terminal-layout">
          <aside class="terminal-sidebar" id="terminal-sidebar" aria-label="App sections">
            <div class="terminal-brand-row">
              <button class="terminal-brand" type="button" aria-label="Home">
                <span class="terminal-brand-mark">~/</span><span class="terminal-brand-name">kabbak</span><span class="terminal-cursor" aria-hidden="true">_</span>
              </button>
              <button class="terminal-drawer-close" type="button" aria-label="Close menu">&times;</button>
            </div>
            <div class="terminal-byline"></div>
            <label class="terminal-search">
              <span class="terminal-search-icon" aria-hidden="true">&#8981;</span>
              <input type="search" autocomplete="off" spellcheck="false" placeholder="Search the menu&hellip;" aria-label="Search the menu">
              <kbd>/</kbd>
            </label>
            <nav class="terminal-nav" aria-label="Sections"></nav>
            <div class="terminal-sidebar-foot">
              <div class="terminal-foot-note"></div>
            </div>
          </aside>
          <div class="terminal-workspace">
            <header class="terminal-topbar">
              <button class="terminal-icon-btn terminal-menu-btn" type="button" aria-label="Open menu" aria-controls="terminal-sidebar" aria-expanded="false">&#8801;</button>
              <button class="terminal-icon-btn terminal-back" type="button" aria-label="Back" disabled>&larr;</button>
              <div class="terminal-crumbs" aria-live="polite">
                <span class="terminal-crumb-root">~/</span><span class="terminal-crumb-section">home</span>
              </div>
              <div class="terminal-topbar-spacer"></div>
              <div class="terminal-widgets"></div>
              <button class="terminal-topbar-btn terminal-home-btn" type="button">Home</button>
              <button class="terminal-topbar-btn terminal-settings-btn" type="button">Settings</button>
            </header>
            <div class="terminal-pages"></div>
          </div>
          <button class="terminal-scrim" type="button" aria-label="Close menu" hidden></button>
        </div>
      `;

      const rootEl = shellEl.querySelector(".terminal-layout");
      const sidebarEl = shellEl.querySelector(".terminal-sidebar");
      const brandEl = shellEl.querySelector(".terminal-brand");
      const brandNameEl = shellEl.querySelector(".terminal-brand-name");
      const bylineEl = shellEl.querySelector(".terminal-byline");
      const searchWrapEl = shellEl.querySelector(".terminal-search");
      const searchInputEl = shellEl.querySelector(".terminal-search input");
      const navEl = shellEl.querySelector(".terminal-nav");
      const widgetsEl = shellEl.querySelector(".terminal-widgets");
      const footNoteEl = shellEl.querySelector(".terminal-foot-note");
      const pagesEl = shellEl.querySelector(".terminal-pages");
      const menuBtnEl = shellEl.querySelector(".terminal-menu-btn");
      const drawerCloseEl = shellEl.querySelector(".terminal-drawer-close");
      const backBtnEl = shellEl.querySelector(".terminal-back");
      const crumbEl = shellEl.querySelector(".terminal-crumb-section");
      const homeBtnEl = shellEl.querySelector(".terminal-home-btn");
      const settingsBtnEl = shellEl.querySelector(".terminal-settings-btn");
      const scrimEl = shellEl.querySelector(".terminal-scrim");

      let config = { ...DEFAULT_CONFIG, colors: { ...DEFAULT_CONFIG.colors } };
      const state = { query: "", openGroups: new Set() };
      let navFrame = 0;
      let chromeFrame = 0;
      let drawerOpen = false;

      ui.attachPages(pagesEl);
      ui.attachWidgets(widgetsEl);

      function isAvailable(id) {
        const node = document.getElementById(String(id || ""));
        if (!(node instanceof HTMLElement)) return false;
        if (node.hidden) return false;
        if (node.closest("[hidden]")) return false;
        return !node.disabled;
      }

      function isGroupTrigger(id) {
        const node = document.getElementById(String(id || ""));
        return Boolean(node && node.getAttribute("aria-haspopup") === "menu");
      }

      function activeNavId(section) {
        const active = String(section || "");
        if (active === "profile") {
          const settings = document.getElementById("open-settings");
          if (settings && settings.getAttribute("aria-pressed") === "true") {
            return "open-settings";
          }
        }
        if (active === "home") {
          const home = document.getElementById("open-home");
          if (home && home.getAttribute("aria-pressed") === "true") return "open-home";
          return "open-home-menu";
        }
        return PRIMARY_ID_BY_SECTION[active] || "";
      }

      function isActiveId(id, section) {
        const node = document.getElementById(String(id || ""));
        if (node && (node.getAttribute("aria-pressed") === "true"
          || node.classList.contains("is-active")
          || node.getAttribute("aria-current") === "page")) {
          return true;
        }
        const primary = activeNavId(section);
        if (primary && id === primary) return true;
        if (String(section) === "home" && (id === "open-home" || id === "open-home-menu")) {
          return true;
        }
        return false;
      }

      function matchesQuery(item) {
        const query = state.query.toLowerCase();
        if (!query) return true;
        return `${item?.label || ""} ${item?.id || ""}`.toLowerCase().includes(query);
      }

      function itemsForRender() {
        const items = (ui.listNav() || []).filter((item) => item && !item.hidden);
        if (!state.query) return items;
        const out = [];
        items.forEach((item) => {
          if (item.type === "header" || item.type === "search") return;
          const children = (item.children || []).filter((child) => child && !child.hidden && matchesQuery(child));
          const selfMatch = matchesQuery(item);
          if (children.length) {
            out.push({ ...item, children });
            return;
          }
          if (selfMatch && Array.isArray(item.children) && item.children.length) {
            out.push(item);
            return;
          }
          if (!Array.isArray(item.children) || !item.children.length) {
            if (selfMatch) out.push(item);
          }
        });
        return out;
      }

      function renderNav() {
        const active = ui.getActiveSection();
        navEl.replaceChildren();
        const items = itemsForRender();

        items.forEach((item) => {
          if (item.type === "search") return;
          if (item.type === "header") {
            navEl.appendChild(el("div", "terminal-nav-heading", item.label || ""));
            return;
          }

          const children = (item.children || [])
            .filter((child) => child && !child.hidden && !child.type && isAvailable(child.id));
          const available = isAvailable(item.id);

          if (children.length) {
            const childActive = children.some((child) => isActiveId(child.id, active));
            if (childActive) state.openGroups.add(item.id);
            const open = state.openGroups.has(item.id) || Boolean(state.query);

            const group = el("button", "terminal-nav-group");
            group.type = "button";
            group.dataset.groupId = item.id;
            group.setAttribute("aria-expanded", open ? "true" : "false");
            group.classList.toggle("is-active", childActive);
            group.classList.toggle("is-open", open);
            group.appendChild(el("span", "terminal-nav-chevron", "\u203a"));
            group.appendChild(el("span", "terminal-nav-label", item.label || item.id));
            group.appendChild(el("span", "terminal-nav-count", String(children.length)));
            group.addEventListener("click", () => {
              if (state.openGroups.has(item.id)) state.openGroups.delete(item.id);
              else state.openGroups.add(item.id);
              renderNav();
            });
            navEl.appendChild(group);

            const childWrap = el("div", "terminal-nav-children");
            childWrap.hidden = !open;
            children.forEach((child) => {
              const leaf = el("button", "terminal-nav-leaf", child.label || child.id);
              leaf.type = "button";
              leaf.dataset.navId = child.id;
              leaf.classList.toggle("is-active", isActiveId(child.id, active));
              leaf.addEventListener("click", () => {
                setDrawer(false);
                ui.openNav(child.id);
              });
              childWrap.appendChild(leaf);
            });
            navEl.appendChild(childWrap);
            return;
          }

          if (!available || isGroupTrigger(item.id) || !String(item.id || "").trim()) return;
          const leaf = el("button", "terminal-nav-item", item.label || item.id);
          leaf.type = "button";
          leaf.dataset.navId = item.id;
          leaf.classList.toggle("is-active", isActiveId(item.id, active));
          leaf.addEventListener("click", () => {
            setDrawer(false);
            ui.openNav(item.id);
          });
          navEl.appendChild(leaf);
        });

        if (!navEl.childElementCount) {
          navEl.appendChild(el("div", "terminal-nav-empty", state.query ? "No sections match." : "No sections available."));
        }
      }

      function activeLayout() {
        const layouts = pagesEl.querySelectorAll(".browse-layout, .kab-layout");
        for (const layout of layouts) {
          if (layout.closest("[hidden]")) continue;
          const section = layout.closest("section");
          if (section instanceof HTMLElement && section.hidden) continue;
          return layout;
        }
        return null;
      }

      function renderChrome() {
        const active = ui.getActiveSection();
        crumbEl.textContent = active || "home";
        const layout = activeLayout();
        const canReturnToList = Boolean(layout && layout.classList.contains("layout-sidebar-collapsed"));
        const coreBack = document.getElementById("topbar-back");
        const coreCanGoBack = coreBack instanceof HTMLElement ? !coreBack.disabled : false;
        backBtnEl.disabled = !canReturnToList && !coreCanGoBack;
        backBtnEl.classList.toggle("is-list-back", canReturnToList);
        backBtnEl.setAttribute("aria-label", canReturnToList ? "Back to list" : "Back");
      }

      function scheduleNav() {
        if (navFrame) return;
        navFrame = window.requestAnimationFrame(() => {
          navFrame = 0;
          renderNav();
          renderChrome();
        });
      }

      function scheduleChrome() {
        if (chromeFrame) return;
        chromeFrame = window.requestAnimationFrame(() => {
          chromeFrame = 0;
          renderChrome();
        });
      }

      function setDrawer(open) {
        const next = Boolean(open);
        drawerOpen = next;
        rootEl.classList.toggle("is-drawer-open", next);
        scrimEl.hidden = !next;
        menuBtnEl.setAttribute("aria-expanded", next ? "true" : "false");
        document.documentElement.classList.toggle("kabbak-terminal-drawer-open", next);
        if (next) {
          window.requestAnimationFrame(() => {
            if (state.query || !searchWrapEl.hidden) searchInputEl.focus();
            else drawerCloseEl.focus();
          });
        }
      }

      function closeDrawer() {
        if (drawerOpen) setDrawer(false);
      }

      function applyConfig() {
        brandNameEl.textContent = String(config.brand || DEFAULT_CONFIG.brand);
        bylineEl.textContent = String(config.byline || "");
        searchWrapEl.hidden = config.showSearch === false;
        footNoteEl.textContent = `layout-terminal ${VERSION}`;
        rootEl.classList.toggle("is-theme", config.followTheme === true);

        Object.values(COLOR_PROPERTIES).forEach((property) => {
          rootEl.style.removeProperty(property);
        });
        Object.entries(config.colors || {}).forEach(([key, value]) => {
          const property = COLOR_PROPERTIES[key];
          const color = safeColor(value);
          if (property && color) rootEl.style.setProperty(property, color);
        });

        const width = Math.min(340, Math.max(220, Number(config.sidebarWidth) || DEFAULT_CONFIG.sidebarWidth));
        rootEl.style.setProperty("--terminal-sidebar-w", `${width}px`);
      }

      async function loadConfig() {
        let loaded = null;
        try {
          const payload = await helpers.requestJson("GET", "/api/v1/plugins/layout-terminal/config");
          loaded = payload?.config;
        } catch (_error) {
          loaded = null;
        }
        if (!loaded) {
          try {
            const url = helpers.assetUrl("config.json");
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok) loaded = await response.json();
          } catch (_error) {
            loaded = null;
          }
        }
        config = mergeConfig(DEFAULT_CONFIG, loaded);
        applyConfig();
        renderNav();
        renderChrome();
      }

      function applyQuery(value) {
        state.query = String(value || "").trim();
        renderNav();
      }

      function isTypingTarget(target) {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      }

      const cleanups = [];
      function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
      }

      listen(brandEl, "click", () => {
        closeDrawer();
        ui.openSection("home");
      });
      listen(homeBtnEl, "click", () => {
        closeDrawer();
        ui.openSection("home");
      });
      listen(settingsBtnEl, "click", () => {
        closeDrawer();
        if (!window.TaroPageSettings?.openCurrent?.()) {
          ui.openNav("open-settings");
        }
      });
      listen(menuBtnEl, "click", () => setDrawer(!drawerOpen));
      listen(drawerCloseEl, "click", () => setDrawer(false));
      listen(scrimEl, "click", () => setDrawer(false));
      listen(backBtnEl, "click", () => {

        const layout = activeLayout();
        if (layout && layout.classList.contains("layout-sidebar-collapsed")) {
          window.TarotChromeUi?.showSidebarOnly?.(layout);
          return;
        }
        ui.goBack();
      });
      let searchTimer = 0;
      listen(searchInputEl, "input", () => {
        if (searchTimer) window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => applyQuery(searchInputEl.value), 90);
      });

      listen(document, "keydown", (event) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && drawerOpen) {
          setDrawer(false);
          return;
        }
        if (event.key !== "/" || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        const homeSearch = document.querySelector(".terminal-home-search input");
        const target = (ui.getActiveSection() === "home" && homeSearch) ? homeSearch : searchInputEl;
        if (!(target instanceof HTMLElement) || target.offsetParent === null) return;
        if (target === searchInputEl && mobileQuery.matches && !drawerOpen) {
          if (searchWrapEl.hidden) return;
          setDrawer(true);
          return;
        }
        event.preventDefault();
        target.focus();
        if (typeof target.select === "function") target.select();
      });

      listen(document, "section:changed", () => {
        closeDrawer();
        scheduleNav();
      });
      listen(document, "taro-plugins-ready", scheduleNav);
      listen(document, "taro-menu-updated", scheduleNav);
      listen(document, "connection:access-updated", scheduleNav);
      listen(document, "taro-plugin-config-updated", (event) => {
        if (String(event?.detail?.pluginName || "") !== "layout-terminal") return;
        config = mergeConfig(DEFAULT_CONFIG, event.detail.config);
        applyConfig();
        renderNav();
        renderChrome();
      });
      listen(document, "taro-plugin-content-updated", (event) => {
        if (String(event?.detail?.pluginName || "") !== "layout-terminal") return;
        void loadConfig();
      });

      const topbarActions = document.getElementById("topbar-actions");
      const topbarObserver = topbarActions
        ? new MutationObserver(scheduleNav)
        : null;
      topbarObserver?.observe(topbarActions, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });

      const layoutObserver = new MutationObserver(scheduleChrome);
      layoutObserver.observe(pagesEl, { subtree: true, attributes: true, attributeFilter: ["class"] });

      const mobileQuery = window.matchMedia("(max-width: 900px)");
      const onMediaChange = () => {
        if (!mobileQuery.matches) setDrawer(false);
      };
      if (typeof mobileQuery.addEventListener === "function") {
        mobileQuery.addEventListener("change", onMediaChange);
      }

      applyConfig();
      renderNav();
      renderChrome();
      void loadConfig();

      return () => {
        cleanups.forEach((fn) => fn());
        topbarObserver?.disconnect();
        layoutObserver.disconnect();
        if (navFrame) window.cancelAnimationFrame(navFrame);
        if (chromeFrame) window.cancelAnimationFrame(chromeFrame);
        if (searchTimer) window.clearTimeout(searchTimer);
        if (typeof mobileQuery.removeEventListener === "function") {
          mobileQuery.removeEventListener("change", onMediaChange);
        }
        setDrawer(false);
        document.documentElement.classList.remove("kabbak-terminal-drawer-open");
        sidebarEl?.removeAttribute("data-terminal-mounted");
      };
    }
  });
})();
