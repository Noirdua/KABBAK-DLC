(function () {
  "use strict";

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[layout-phone] TaroTimePluginHost is not available.");
    return;
  }

  const TAB_DEFS = [
    { id: "home", label: "Home", icon: "home", section: "home", navIds: ["open-home", "open-home-menu"] },
    { id: "tarot", label: "Tarot", icon: "tarot", section: "tarot", navIds: ["open-tarot"] },
    { id: "calendar", label: "Calendar", icon: "calendar", section: "planner", navIds: ["open-calendar"] },
    { id: "more", label: "More", icon: "more", section: "", navIds: [] },
    { id: "you", label: "You", icon: "you", section: "", navIds: ["open-profile", "open-settings"] }
  ];

  const HIDE_IN_MORE = new Set([
    "open-home",
    "open-home-menu",
    "open-tarot-cards",
    "open-calendar",
    "open-calendar-months"
  ]);

  // Menu ids whose section name differs from the id suffix.
  const ID_SECTION_ALIASES = {
    "open-kabbalah-sephirot": "kabbalah",
    "open-alphabet-word": "alphabet",
    "open-numbers-browse": "numbers",
    "open-numbers-theory": "numbers",
    "open-iching-hexagrams": "iching"
  };

  function sectionTabId(section) {
    const current = String(section || "");
    if (current === "profile" || current === "settings") return "you";
    if (current === "tarot-frame" || current === "tarot-house") return "tarot";
    const tab = TAB_DEFS.find((item) => item.section === current);
    return tab ? tab.id : "";
  }

  function isActiveId(id, section) {
    const current = String(section || "");
    const tab = TAB_DEFS.find((item) => item.navIds.includes(id));
    if (tab) {
      return Boolean(tab.section) && tab.section === current;
    }
    const target = ID_SECTION_ALIASES[id] || String(id || "").replace(/^open-/, "");
    return target === current;
  }

  function iconSvg(name) {
    if (name === "home") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>';
    }
    if (name === "tarot") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M12 8.5 13.2 11l2.6.2-2 1.8.6 2.6L12 14.3 9.6 15.6l.6-2.6-2-1.8 2.6-.2z"/></svg>';
    }
    if (name === "calendar") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>';
    }
    if (name === "you") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.5c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
  }

  function youSection() {
    const profile = document.getElementById("open-profile");
    if (profile instanceof HTMLElement && !profile.hidden) {
      return "profile";
    }
    return "settings";
  }

  host.register({
    id: "layout-phone",
    name: "Phone Layout",
    version: "1.0.3",
    role: "skin",
    bundled: document.documentElement.getAttribute("data-kabbak-native") === "1",
    mount(shellEl, helpers) {
      const ui = helpers.ui;
      if (!ui) {
        console.warn("[layout-phone] helpers.ui is not available.");
        return null;
      }

      ui.hideDefaultChrome();
      shellEl.innerHTML = `
        <div class="layout-phone">
          <header class="layout-phone-top">
            <button class="layout-phone-back" type="button" aria-label="Go back">Back</button>
            <div class="layout-phone-title"></div>
            <div class="layout-phone-top-actions">
              <div class="layout-phone-widgets"></div>
              <button class="layout-phone-settings" type="button">Settings</button>
            </div>
          </header>
          <div class="layout-phone-pages"></div>
          <nav class="layout-phone-tabs" aria-label="Primary"></nav>
          <div class="layout-phone-sheet" hidden>
            <button class="layout-phone-sheet-backdrop" type="button" aria-label="Close menu"></button>
            <div class="layout-phone-sheet-panel" role="dialog" aria-label="More">
              <div class="layout-phone-sheet-handle"></div>
              <div class="layout-phone-sheet-search"></div>
              <div class="layout-phone-sheet-menu"></div>
              <div class="layout-phone-sheet-options"></div>
            </div>
          </div>
        </div>
      `;

      const rootEl = shellEl.querySelector(".layout-phone");
      const titleEl = shellEl.querySelector(".layout-phone-title");
      const backEl = shellEl.querySelector(".layout-phone-back");
      const settingsEl = shellEl.querySelector(".layout-phone-settings");
      const pagesEl = shellEl.querySelector(".layout-phone-pages");
      const widgetsEl = shellEl.querySelector(".layout-phone-widgets");
      const tabsEl = shellEl.querySelector(".layout-phone-tabs");
      const sheetEl = shellEl.querySelector(".layout-phone-sheet");
      const sheetMenuEl = shellEl.querySelector(".layout-phone-sheet-menu");
      const sheetSearchEl = shellEl.querySelector(".layout-phone-sheet-search");
      const sheetBackdropEl = shellEl.querySelector(".layout-phone-sheet-backdrop");
      const sheetOptionsEl = shellEl.querySelector(".layout-phone-sheet-options");

      const OPTIONS_STORAGE_KEY = "kabbak-phone-options";
      const DEFAULT_OPTIONS = { browse: "drill", density: "comfortable", tabLabels: true };

      function readOptions() {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(OPTIONS_STORAGE_KEY) || "{}");
          return { ...DEFAULT_OPTIONS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
        } catch (_error) {
          return { ...DEFAULT_OPTIONS };
        }
      }

      let options = readOptions();

      function persistOptions() {
        try {
          window.localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
        } catch (_error) {}
      }

      function applyOptions() {
        const root = document.documentElement;
        root.classList.toggle("kabbak-phone-split", options.browse === "split");
        root.classList.toggle("kabbak-phone-compact", options.density === "compact");
        root.classList.toggle("kabbak-phone-no-tablabels", options.tabLabels === false);
      }

      function renderOptions() {
        if (!sheetOptionsEl) {
          return;
        }
        sheetOptionsEl.innerHTML = "";
        const rows = [
          { label: "Layout", key: "browse", choices: [["drill", "Full screen"], ["split", "Split"]] },
          { label: "Rows", key: "density", choices: [["comfortable", "Comfortable"], ["compact", "Compact"]] },
          { label: "Tab labels", key: "tabLabels", choices: [[true, "Show"], [false, "Hide"]] }
        ];
        rows.forEach((row) => {
          const rowEl = document.createElement("div");
          rowEl.className = "layout-phone-option-row";
          const labelEl = document.createElement("span");
          labelEl.className = "layout-phone-option-label";
          labelEl.textContent = row.label;
          const segEl = document.createElement("div");
          segEl.className = "layout-phone-segmented";
          row.choices.forEach(([value, text]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = text;
            button.classList.toggle("is-active", options[row.key] === value);
            button.addEventListener("click", () => {
              options = { ...options, [row.key]: value };
              persistOptions();
              applyOptions();
              renderOptions();
            });
            segEl.appendChild(button);
          });
          rowEl.appendChild(labelEl);
          rowEl.appendChild(segEl);
          sheetOptionsEl.appendChild(rowEl);
        });
      }

      ui.attachPages(pagesEl);
      ui.attachWidgets(widgetsEl);
      applyOptions();

      let sheetOpen = false;

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

      function openSection(section) {
        const target = String(section || "");
        if (!target) return;
        if (typeof ui.openSection === "function") {
          ui.openSection(target);
          return;
        }
        ui.openNav(target === "planner" ? "open-calendar" : `open-${target}`);
      }

      function setSheet(open) {
        sheetOpen = Boolean(open);
        sheetEl.hidden = !sheetOpen;
        rootEl.classList.toggle("is-sheet-open", sheetOpen);
        document.documentElement.classList.toggle("kabbak-phone-sheet-open", sheetOpen);
        if (sheetOpen) {
          renderSheet();
        }
      }

      function ensureSearch() {
        const items = ui.listNav();
        const searchItem = items.find((item) => item.type === "search") || null;
        sheetSearchEl.innerHTML = "";
        if (!searchItem) {
          sheetSearchEl.hidden = true;
          return;
        }
        sheetSearchEl.hidden = false;
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = searchItem.label || "Search menu…";
        input.addEventListener("input", () => {
          window.TaroTimeMenuPlugin?.applySearchFilter?.(input.value);
        });
        sheetSearchEl.appendChild(input);
      }

      function appendNavButton(parent, item, active) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "layout-phone-sheet-item";
        button.textContent = item.label || item.id;
        button.classList.toggle("is-active", isActiveId(item.id, active));
        button.addEventListener("click", () => {
          setSheet(false);
          ui.openNav(item.id);
        });
        parent.appendChild(button);
      }

      function renderSheet() {
        const active = ui.getActiveSection();
        const items = ui.listNav().filter((item) => !item.hidden);
        ensureSearch();
        sheetMenuEl.innerHTML = "";
        items.forEach((item) => {
          if (item.type === "search") return;
          if (HIDE_IN_MORE.has(item.id)) return;
          if (item.type === "header") {
            const heading = document.createElement("div");
            heading.className = "layout-phone-sheet-heading";
            heading.textContent = item.label || "";
            sheetMenuEl.appendChild(heading);
            return;
          }
          const children = (item.children || []).filter((child) => {
            return !child.hidden && child.type !== "search" && !HIDE_IN_MORE.has(child.id);
          });
          if (!children.length) {
            appendNavButton(sheetMenuEl, item, active);
            return;
          }
          const group = document.createElement("div");
          group.className = "layout-phone-sheet-group is-open";
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "layout-phone-sheet-group-toggle";
          toggle.textContent = item.label || "";
          toggle.classList.toggle("is-active", children.some((child) => isActiveId(child.id, active)));
          toggle.addEventListener("click", () => {
            group.classList.toggle("is-open");
          });
          const childWrap = document.createElement("div");
          childWrap.className = "layout-phone-sheet-children";
          children.forEach((child) => appendNavButton(childWrap, child, active));
          group.appendChild(toggle);
          group.appendChild(childWrap);
          sheetMenuEl.appendChild(group);
        });
        renderOptions();
      }

      function renderTabs() {
        const section = ui.getActiveSection();
        const currentTab = sheetOpen ? "more" : sectionTabId(section);
        tabsEl.innerHTML = "";
        TAB_DEFS.forEach((tab) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "layout-phone-tab";
          button.dataset.tab = tab.id;
          button.classList.toggle("is-active", tab.id === currentTab);
          button.innerHTML = `${iconSvg(tab.icon)}<span>${tab.label}</span>`;
          button.addEventListener("click", () => {
            if (tab.id === "more") {
              setSheet(!sheetOpen);
              renderTabs();
              return;
            }
            setSheet(false);
            openSection(tab.id === "you" ? youSection() : tab.section);
          });
          tabsEl.appendChild(button);
        });
      }

      function renderChrome() {
        const section = ui.getActiveSection();
        const layout = activeLayout();
        const canReturnToList = Boolean(layout && layout.classList.contains("layout-sidebar-collapsed"));
        titleEl.textContent = ui.sectionLabel(section) || section;
        backEl.hidden = section === "home" && !sheetOpen && !canReturnToList;
        backEl.textContent = canReturnToList ? "List" : "Back";
        renderTabs();
        if (sheetOpen) renderSheet();
      }

      backEl.addEventListener("click", () => {
        if (sheetOpen) {
          setSheet(false);
          renderTabs();
          return;
        }
        const layout = activeLayout();
        if (layout && layout.classList.contains("layout-sidebar-collapsed")) {
          window.TarotChromeUi?.showSidebarOnly?.(layout);
          return;
        }
        ui.goBack();
      });
      settingsEl.addEventListener("click", () => {
        setSheet(false);
        openSection("settings");
      });
      sheetBackdropEl.addEventListener("click", () => {
        setSheet(false);
        renderTabs();
      });

      renderChrome();
      // List/detail panes collapse via classes from the core chrome; watch them
      // so the header back/label tracks drill-down without a section change.
      // Coalesce bursts (selection toggles etc.) into one frame.
      let chromeFrame = 0;
      const scheduleChrome = () => {
        if (chromeFrame) return;
        chromeFrame = window.requestAnimationFrame(() => {
          chromeFrame = 0;
          renderChrome();
        });
      };
      const layoutObserver = new MutationObserver(scheduleChrome);
      layoutObserver.observe(pagesEl, { subtree: true, attributes: true, attributeFilter: ["class"] });
      const stop = ui.onSectionChange(renderChrome);
      document.addEventListener("taro-plugins-ready", renderChrome);
      document.addEventListener("taro-menu-updated", renderChrome);
      return () => {
        layoutObserver.disconnect();
        if (chromeFrame) window.cancelAnimationFrame(chromeFrame);
        document.documentElement.classList.remove(
          "kabbak-phone-split",
          "kabbak-phone-compact",
          "kabbak-phone-no-tablabels",
          "kabbak-phone-sheet-open"
        );
        document.removeEventListener("taro-plugins-ready", renderChrome);
        document.removeEventListener("taro-menu-updated", renderChrome);
        if (typeof stop === "function") stop();
      };
    }
  });
})();
